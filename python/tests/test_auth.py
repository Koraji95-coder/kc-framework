"""Test matrix for ``chamber19_desktop_toolkit.auth.verify_toolkit_bearer``.

The bearer wire format is ``v1.{machine_id}.{minute_ts}.{base64-hmac}`` --
matched between the Rust signer (``crates/desktop-toolkit/src/activation/token.rs``)
and this verifier. If either side ever shifts the algorithm, separator, or
encoding, the cross-language test vector at the end of this file should
flag it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

import pytest

from chamber19_desktop_toolkit.auth import (
    ToolkitBearerError,
    verify_toolkit_bearer,
)


SECRET = "test-secret-do-not-ship"
MACHINE_ID = "machine-abc"


def _mint(minute_ts: int, *, secret: str = SECRET, machine_id: str = MACHINE_ID,
          version: str = "v1") -> str:
    """Build a wire-format bearer token using the same algorithm as the Rust signer."""
    msg = f"{machine_id}|{minute_ts}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    sig_b64 = base64.b64encode(sig).decode("ascii")
    return f"{version}.{machine_id}.{minute_ts}.{sig_b64}"


@pytest.fixture(autouse=True)
def _hmac_secret(monkeypatch):
    monkeypatch.setenv("ACTIVATION_HMAC_SECRET", SECRET)


# -- Happy path -----------------------------------------------------------

def test_valid_token_returns_claims():
    now = int(time.time()) // 60
    claims = verify_toolkit_bearer(_mint(now))
    assert claims["machine_id"] == MACHINE_ID
    assert claims["minute_ts"] == now


def test_token_within_skew_window_succeeds():
    now = int(time.time()) // 60
    # One minute on either side must verify.
    for offset in (-1, 0, 1):
        verify_toolkit_bearer(_mint(now + offset))


# -- Rejection cases ------------------------------------------------------

def test_token_outside_skew_window_rejected():
    now = int(time.time()) // 60
    with pytest.raises(ToolkitBearerError, match="outside acceptance window"):
        verify_toolkit_bearer(_mint(now + 2))
    with pytest.raises(ToolkitBearerError, match="outside acceptance window"):
        verify_toolkit_bearer(_mint(now - 2))


def test_wrong_secret_fails_signature_check(monkeypatch):
    # Mint with one secret, verify with another.
    now = int(time.time()) // 60
    token = _mint(now, secret="some-other-secret")
    with pytest.raises(ToolkitBearerError, match="signature mismatch"):
        verify_toolkit_bearer(token)


def test_unknown_version_rejected():
    now = int(time.time()) // 60
    with pytest.raises(ToolkitBearerError, match="unsupported token version"):
        verify_toolkit_bearer(_mint(now, version="v2"))


def test_malformed_token_too_few_parts():
    with pytest.raises(ToolkitBearerError, match="malformed token"):
        verify_toolkit_bearer("v1.machine.123")  # 3 parts not 4


def test_malformed_token_too_many_parts():
    with pytest.raises(ToolkitBearerError, match="malformed token"):
        verify_toolkit_bearer("v1.machine.123.sig.extra")


def test_non_integer_minute_ts_rejected():
    with pytest.raises(ToolkitBearerError, match="malformed minute_ts"):
        verify_toolkit_bearer("v1.machine.notanumber.AAAA")


def test_bad_signature_rejected_within_window():
    # `_b64_decode` is intentionally lenient (non-alphabet chars are
    # silently dropped) so a malformed sig comes through as the wrong
    # number of bytes and fails the HMAC compare, not the decode step.
    now = int(time.time()) // 60
    with pytest.raises(ToolkitBearerError, match="signature mismatch"):
        verify_toolkit_bearer(f"v1.{MACHINE_ID}.{now}.@@@")


def test_missing_env_var_rejected(monkeypatch):
    monkeypatch.delenv("ACTIVATION_HMAC_SECRET", raising=False)
    with pytest.raises(ToolkitBearerError, match="ACTIVATION_HMAC_SECRET env var"):
        verify_toolkit_bearer(_mint(int(time.time()) // 60))


def test_tampered_machine_id_breaks_signature():
    # Sign for machine A, then swap in machine B in the wire form. HMAC
    # is over (machine_id|minute_ts), so swapping invalidates the sig.
    now = int(time.time()) // 60
    token = _mint(now)
    parts = token.split(".")
    parts[1] = "other-machine"
    tampered = ".".join(parts)
    with pytest.raises(ToolkitBearerError, match="signature mismatch"):
        verify_toolkit_bearer(tampered)


def test_custom_skew_window_honored():
    # When skew_minutes=0, only the current minute exactly is accepted.
    now = int(time.time()) // 60
    verify_toolkit_bearer(_mint(now), skew_minutes=0)
    with pytest.raises(ToolkitBearerError, match="outside acceptance window"):
        verify_toolkit_bearer(_mint(now + 1), skew_minutes=0)


# -- Cross-language wire vector -------------------------------------------

def test_cross_language_wire_format_invariants():
    """The token Rust produces with a known secret/machine_id/minute_ts
    must verify byte-for-byte in Python. This is the contract between the
    two halves of the activation system. If a future change breaks this,
    both sides have to upgrade together.
    """
    machine_id = "test-machine-1234"
    minute_ts = 27_500_000

    token = _mint(minute_ts, machine_id=machine_id)
    parts = token.split(".")
    assert len(parts) == 4
    assert parts[0] == "v1"
    assert parts[1] == machine_id
    assert int(parts[2]) == minute_ts

    sig_bytes = base64.b64decode(parts[3])
    assert len(sig_bytes) == 32, "HMAC-SHA256 output must be 32 bytes"

    # Verify with infinite skew so the test is time-independent.
    claims = verify_toolkit_bearer(token, skew_minutes=10**9)
    assert claims == {"machine_id": machine_id, "minute_ts": minute_ts}


# -- FastAPI dependency wrapper ------------------------------------------

def test_require_toolkit_bearer_strips_bearer_prefix(monkeypatch):
    from chamber19_desktop_toolkit.auth import require_toolkit_bearer

    now = int(time.time()) // 60
    token = _mint(now)
    claims = require_toolkit_bearer(authorization=f"Bearer {token}")
    assert claims["machine_id"] == MACHINE_ID


def test_require_toolkit_bearer_missing_header_raises_401():
    from chamber19_desktop_toolkit.auth import require_toolkit_bearer
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        require_toolkit_bearer(authorization=None)
    assert exc.value.status_code == 401


def test_require_toolkit_bearer_bad_token_raises_401():
    from chamber19_desktop_toolkit.auth import require_toolkit_bearer
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        require_toolkit_bearer(authorization="Bearer v1.machine.0.AAAA")
    assert exc.value.status_code == 401
