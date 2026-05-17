"""Verifier for short-lived toolkit-issued bearer tokens.

The toolkit's Rust ``activation::issue_bearer_token`` Tauri command emits a
compact token of the shape:

.. code-block:: text

    v1.{machine_id}.{minute_ts}.{base64-hmac-sha256-over-"machine_id|minute_ts"}

Backends verify by re-deriving the HMAC with the shared ``ACTIVATION_HMAC_SECRET``
environment variable. The minute-truncated timestamp bounds replay attacks
to a roughly 60-second window; this verifier accepts the current minute
and one minute on either side to tolerate clock skew.

Usage with FastAPI::

    from fastapi import Depends, FastAPI
    from chamber19_desktop_toolkit.auth import require_toolkit_bearer

    app = FastAPI()

    @app.get("/api/secret")
    def secret(claims = Depends(require_toolkit_bearer)):
        return {"machine_id": claims["machine_id"]}

The dependency raises HTTP 401 on any verification failure. On success it
returns a dict with ``machine_id`` and ``minute_ts`` for downstream use.

The shared secret MUST match the value the Tauri binary was compiled with
(``ACTIVATION_HMAC_SECRET`` env var at build time). Keep the secret in a
secrets manager; do not commit it to the repo.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
from typing import Any, Dict

__all__ = [
    "ToolkitBearerError",
    "verify_toolkit_bearer",
    "require_toolkit_bearer",
]


# Maximum number of minutes a token may differ from `now` and still verify.
# +-1 minute means the token issued at minute T validates at T-1, T, or T+1.
_SKEW_MINUTES = 1


class ToolkitBearerError(Exception):
    """Raised when a bearer token fails verification.

    Carries an HTTP-friendly message in ``args[0]``.
    """


def _hmac_secret() -> bytes:
    secret = os.environ.get("ACTIVATION_HMAC_SECRET")
    if not secret:
        raise ToolkitBearerError(
            "ACTIVATION_HMAC_SECRET env var must be set on the backend to verify "
            "toolkit-issued bearer tokens; must match the value the desktop "
            "binary was compiled with."
        )
    return secret.encode("utf-8")


def _b64_decode(s: str) -> bytes:
    """Standard-alphabet base64 decode with padding tolerance."""
    pad = (-len(s)) % 4
    return base64.b64decode(s + ("=" * pad))


def verify_toolkit_bearer(token: str, *, skew_minutes: int = _SKEW_MINUTES) -> Dict[str, Any]:
    """Verify a toolkit-issued bearer token and return its claims.

    Args:
        token: The raw token string (without any ``Bearer `` prefix).
        skew_minutes: Clock-skew tolerance window in minutes. Defaults to 1.

    Returns:
        A dict with keys ``machine_id`` (str) and ``minute_ts`` (int).

    Raises:
        ToolkitBearerError: When the token is malformed, expired, future-dated,
            or the signature does not validate.
    """
    secret = _hmac_secret()

    parts = token.split(".")
    if len(parts) != 4:
        raise ToolkitBearerError("malformed token: expected 4 dot-separated parts")
    version, machine_id, minute_str, sig_b64 = parts

    if version != "v1":
        raise ToolkitBearerError(f"unsupported token version: {version!r}")

    try:
        minute_ts = int(minute_str)
    except ValueError as exc:
        raise ToolkitBearerError(f"malformed minute_ts: {exc}") from exc

    try:
        provided_sig = _b64_decode(sig_b64)
    except Exception as exc:
        raise ToolkitBearerError(f"malformed signature base64: {exc}") from exc

    now_minute = int(time.time()) // 60
    drift = abs(now_minute - minute_ts)
    if drift > skew_minutes:
        raise ToolkitBearerError(
            f"token outside acceptance window: drift={drift} minutes "
            f"(allowed +-{skew_minutes})"
        )

    message = f"{machine_id}|{minute_ts}".encode("utf-8")
    expected_sig = hmac.new(secret, message, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise ToolkitBearerError("signature mismatch")

    return {"machine_id": machine_id, "minute_ts": minute_ts}


# -- FastAPI dependency ----------------------------------------------------
#
# The dependency is defined inside a function so importing this module does
# not require fastapi to be installed -- only callers that actually use the
# Depends form pay the import cost.

def require_toolkit_bearer(authorization: str | None = None) -> Dict[str, Any]:
    """FastAPI dependency that requires a valid toolkit-issued bearer token.

    Reads the ``Authorization`` header (FastAPI auto-injects it when the
    dependency parameter is named ``authorization``), strips a leading
    ``Bearer `` prefix if present, then verifies via
    :func:`verify_toolkit_bearer`.

    Usage::

        from fastapi import Depends, Header

        @app.get("/api/protected")
        def protected(claims = Depends(require_toolkit_bearer)):
            return {"machine_id": claims["machine_id"]}

    Raises:
        fastapi.HTTPException: 401 on any verification failure.
    """
    # Local import so this module is importable without fastapi.
    try:
        from fastapi import Header, HTTPException
    except ImportError as exc:
        raise RuntimeError(
            "fastapi is required to use require_toolkit_bearer as a Depends; "
            "install fastapi or call verify_toolkit_bearer directly."
        ) from exc

    # When this function is used directly as a Depends, FastAPI invokes it
    # with the Header injection.  We support both the direct-call form
    # (passing the header value) and the Depends form (where FastAPI passes
    # the header via the type annotation below).  The wrapper just below
    # handles the Depends path; direct calls pass authorization explicitly.
    if authorization is None:
        raise HTTPException(status_code=401, detail="missing Authorization header")

    token = authorization
    if token.lower().startswith("bearer "):
        token = token[7:]

    try:
        return verify_toolkit_bearer(token)
    except ToolkitBearerError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


# Re-export a properly-typed FastAPI Depends wrapper.  This is the
# recommended form for backend code.
def _make_fastapi_dependency():
    """Build a FastAPI dependency function bound to ``Authorization`` header."""
    try:
        from fastapi import Header, HTTPException
    except ImportError:
        return None

    def dep(authorization: str | None = Header(default=None)) -> Dict[str, Any]:
        if not authorization:
            raise HTTPException(status_code=401, detail="missing Authorization header")
        token = authorization
        if token.lower().startswith("bearer "):
            token = token[7:]
        try:
            return verify_toolkit_bearer(token)
        except ToolkitBearerError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    return dep


# Usable as: from chamber19_desktop_toolkit.auth import toolkit_bearer_dep
# Then: claims = Depends(toolkit_bearer_dep)
toolkit_bearer_dep = _make_fastapi_dependency()