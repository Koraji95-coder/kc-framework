# Activation & Bearer-Token Protection

Canonical reference for the Chamber 19 app-wide-asset-protection model.

This document covers two related-but-distinct mechanisms shipped by
`@chamber-19/desktop-toolkit`:

1. **Activation token** -- machine-bound, HMAC-signed local file proving a
   given machine has been licensed to run Chamber 19 tools. Issued once
   per machine via PIN. Long-lived (30-day grace, re-validates against
   Google Drive on re-validation).
2. **Bearer token** -- short-lived (~60s), HMAC-signed string sent as
   `Authorization: Bearer <...>` on protected backend HTTP calls. Issued
   on demand by an already-activated machine; verified by backends with
   a matching shared secret.

Both tokens are signed with the **same** `ACTIVATION_HMAC_SECRET`, set
once as an org-level GitHub secret in `chamber-19/.github/secrets` and
mirrored to every backend host's runtime env.

---

## Threat model

| Threat | Defence |
|---|---|
| Casual unauthorized launch | PIN required on first run; PIN gated by Drive allow-list. |
| Copying the activation token to a second machine | Machine ID is HMAC-signed into the token. Verifier re-derives the current machine ID; mismatch fails. |
| Tampering with the activation token's expiry field | `expires_at` is part of the HMAC payload. Edited bytes invalidate the signature. |
| Revoking access without re-deploying | Flip `"active": false` in the Drive auth file. Next 30-day re-validation fails. |
| Stealing a bearer token via traffic capture | Bearer is valid for ~60s only (1-minute window +-1 minute clock skew). Replay window bounded. |
| Stealing a bearer from another machine | Bearer carries the issuing machine_id in its payload; the field is HMAC-signed. Replaying it on a different host still works, but the bearer originator is identifiable in logs. **Bearers are intended for short-lived authn, not authz** -- backends MUST treat bearers as proof-of-activation, not proof-of-identity. |
| Forging tokens with a known dev key | Release builds compile with `env!("ACTIVATION_HMAC_SECRET")` -- compile error if unset. Debug builds use a self-documenting sentinel that cannot accidentally ship. |
| Exfiltrating the token from `localStorage` via XSS | Token lives in `app_data_dir/.toolkit-activation`, not in the WebView. JS cannot read it directly; it is reachable only through the Tauri command boundary. |

---

## The two tokens at a glance

| | Activation token | Bearer token |
|---|---|---|
| **Lifetime** | 30 days | ~60 seconds |
| **Storage** | File at `app_data_dir/.toolkit-activation` | Held in-flight only |
| **Issuance** | Once per machine, via PIN flow | On demand, per request |
| **Signed payload** | `machine_id \| name \| pin_hash \| issued_at \| expires_at` | `machine_id \| minute_ts` |
| **Verification** | Local (`verify_token`, no network) | Local or remote (`verify_toolkit_bearer`) |
| **Distribution** | Written once by `toolkit_activate_with_pin` | Returned by `toolkit_get_bearer_token` |

---

## Sequence: first launch on a fresh machine

```text
User                  Launcher (UI)         Toolkit (Rust)       Google Drive
 |                        |                       |                     |
 | open app               |                       |                     |
 |----------------------->| toolkit_check_         |                     |
 |                        | activation()           |                     |
 |                        |---------------------->| token_status()      |
 |                        |    Err (no token)     |                     |
 |                        |<----------------------|                     |
 |                        |                                              |
 |                        | render <PinForm />                           |
 | enter PIN              |                                              |
 |----------------------->| toolkit_activate_with_pin(pin)               |
 |                        |---------------------->| get_machine_id()    |
 |                        |                       |   = SHA256(hostname |
 |                        |                       |     + Windows SID)  |
 |                        |                       |---------------------->| GET drive auth file
 |                        |                       |<----------------------| {"keys": {...}}
 |                        |                       |                     |
 |                        |                       | lookup PIN          |
 |                        |                       | check active=true   |
 |                        |                       | check expires       |
 |                        |                       |                     |
 |                        |                       | write signed token  |
 |                        |                       | to app_data_dir     |
 |                        | Ok(ActivationResult)  |                     |
 |                        |<----------------------|                     |
 | <main app renders>     |                                              |
```

## Sequence: repeat launch (typical day)

```text
User                  Launcher (UI)         Toolkit (Rust)
 |                        |                       |
 | open app               |                       |
 |----------------------->| toolkit_check_         |
 |                        | activation()           |
 |                        |---------------------->| verify_token()
 |                        |                       |   read file
 |                        |                       |   re-derive HMAC
 |                        |                       |   compare sig
 |                        |                       |   re-derive machine_id
 |                        |                       |   compare expiry
 |                        |  true                 |
 |                        |<----------------------|
 | <main app renders>     |                                <-- no network call -->
```

## Sequence: protected backend HTTP request

```text
React component       Toolkit JS          Toolkit (Rust)         FastAPI backend
 |                        |                       |                     |
 | fetch /api/secret      |                       |                     |
 |----------------------->| withToolkitBearer({}) |                     |
 |                        |---------------------->| toolkit_get_bearer_  |
 |                        |                       | token()              |
 |                        |                       |   verify_token() ok  |
 |                        |                       |   minute_ts = now/60 |
 |                        |                       |   sig = HMAC(        |
 |                        |                       |     mid|minute_ts)   |
 |                        |  "v1.{mid}.{ts}.{sig}"|                     |
 |                        |<----------------------|                     |
 |                        |                                              |
 |                        | set Authorization: Bearer ...                |
 |                        |--------------------------------------------->| toolkit_bearer_dep
 |                        |                                              |   parse 4 dot parts
 |                        |                                              |   re-derive HMAC
 |                        |                                              |   compare_digest
 |                        |                                              |   check minute_ts skew
 |                        |                                              |   return {machine_id}
 |                        | 200 OK + body                                |
 |<-----------------------|<---------------------------------------------|
```

---

## Token formats

### Activation token (on disk)

JSON written to `{app_data_dir}/.toolkit-activation`:

```json
{
  "machine_id":  "<sha256(hostname + windows_sid)>",
  "name":        "Engineer Name (from Drive auth file)",
  "pin_hash":    "<sha256(PIN)>",
  "issued_at":   "YYYY-MM-DD",
  "expires_at":  "YYYY-MM-DD",
  "sig":         "<base64-hmac-sha256 over '|'-joined fields>"
}
```

`sig` covers `"{machine_id}|{name}|{pin_hash}|{issued_at}|{expires_at}"`
in that order.

### Bearer token (on the wire)

Plain ASCII, 4 dot-separated parts:

```text
v1.{machine_id}.{minute_ts}.{base64-hmac-sha256-of-"machine_id|minute_ts"}
```

- `v1` -- protocol version. Verifier rejects unknown versions.
- `machine_id` -- same value baked into the activation token. Identifies
  the issuing machine in backend logs.
- `minute_ts` -- `floor(unix_now / 60)`. Truncated to minute granularity.
- HMAC -- SHA-256 over `"{machine_id}|{minute_ts}"`, base64-encoded.

Acceptance window on the verifier side: `abs(now_minute - minute_ts) <= 1`
(by default; see `verify_toolkit_bearer(..., skew_minutes=N)`).

---

## Secret distribution

Single shared secret named `ACTIVATION_HMAC_SECRET`. **One value, three
homes**:

1. **Org-level GitHub secret** in `chamber-19/` -- the source of truth.
   Inherited by every repo in the org via `secrets: inherit` on
   reusable workflows.
2. **Launcher binary, at compile time** -- consumed by the toolkit
   crate's `token.rs` via `env!()`. The Rust compiler bakes the value
   into the release `.exe`. Release builds without the secret fail to
   compile (this is intentional -- see the v2.5.0 sentinel hardening).
3. **Every backend host's runtime environment** -- read by
   `chamber19_desktop_toolkit.auth._hmac_secret()` on startup and on
   every verification call.

Rotation procedure:

1. Generate the new value (e.g. `openssl rand -hex 64`).
2. Update the org-level secret.
3. Cut a new launcher release tag (CI picks up the new value at
   compile time).
4. Update the env var on every backend host.
5. Distribute the new launcher binary.

During rotation there is a window where bearer tokens issued by old
launchers will fail verification against backends that have already
updated. Plan accordingly -- ideally roll backend env vars after the
new launcher version is broadly installed.

---

## Consumer integration

### Desktop app (Tauri)

`Cargo.toml`:

```toml
[dependencies]
desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.5.0" }

[package.metadata.desktop-toolkit]
library-tag = "v2.5.0"
shim-tag    = "v2.5.0"
```

`src-tauri/src/lib.rs`:

```rust
use desktop_toolkit::activation;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        activation::commands::toolkit_check_activation,
        activation::commands::toolkit_activate_with_pin,
        activation::commands::toolkit_deactivate,
        activation::commands::toolkit_get_bearer_token,
        // ... other commands
    ])
    .run(tauri::generate_context!())
    .expect("...");
```

`frontend/src/main.tsx`:

```tsx
import { ActivationGate } from "@chamber-19/desktop-toolkit/activation";

createRoot(root).render(
  <ActivationGate>
    <App />
  </ActivationGate>
);
```

Protected fetch:

```ts
import { withToolkitBearer } from "@chamber-19/desktop-toolkit/activation/bearer";

const res = await fetch(url, await withToolkitBearer({
  method: "POST",
  body: JSON.stringify(payload),
  headers: { "Content-Type": "application/json" },
}));
```

CI -- inject the secret at build time:

```yaml
- name: Build Tauri app
  env:
    ACTIVATION_HMAC_SECRET: ${{ secrets.ACTIVATION_HMAC_SECRET }}
  run: npx tauri build
```

### FastAPI backend

`requirements.txt`:

```text
chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@v2.5.0#subdirectory=python
```

`app.py` (single-auth):

```python
from fastapi import Depends, FastAPI
from chamber19_desktop_toolkit.auth import toolkit_bearer_dep

app = FastAPI()

@app.get("/api/protected")
def protected(claims = Depends(toolkit_bearer_dep)):
    return {"machine_id": claims["machine_id"]}
```

`app.py` (dual-auth, fallback to existing mechanism):

```python
from chamber19_desktop_toolkit.auth import verify_toolkit_bearer, ToolkitBearerError

def require_auth(creds):
    token = creds.credentials
    # Try toolkit bearer first if shape matches
    if token.startswith("v1.") and token.count(".") == 3:
        try:
            claims = verify_toolkit_bearer(token)
            return {"auth_method": "toolkit_bearer", "machine_id": claims["machine_id"], ...}
        except ToolkitBearerError as exc:
            raise HTTPException(401, str(exc))
    # Fall back to existing auth (Google ID token, etc.)
    return _verify_existing(creds)
```

See `chamber-19/transmittal-builder/backend/auth.py` for a full
production example.

---

## Operational checklist for a new consumer

1. **Pin the toolkit**: Cargo + npm + Python pkg all at `v2.5.0` or
   later. Use the 4-place pin pattern (see CLAUDE.md "desktop-toolkit
   pin bumps").
2. **Wrap React root in `ActivationGate`**.
3. **Register the four Tauri activation commands** in
   `generate_handler!`.
4. **Replace bespoke Bearer-token injection** with `withToolkitBearer`.
5. **On the backend**, add `toolkit_bearer_dep` to protected routes
   (single-auth) or build a dual-auth wrapper (multi-auth).
6. **Set `ACTIVATION_HMAC_SECRET`** on the backend host's runtime env.
   This secret is org-level and inherits automatically into CI workflows.
7. **Test the full path**: launcher prompts for PIN on first run,
   subsequent launches go straight through, protected probe against a
   matching-secret backend returns 200.

---

## See also

- `crates/desktop-toolkit/src/activation/` -- Rust source
- `js/packages/desktop-toolkit/src/activation/` -- JS source
- `python/chamber19_desktop_toolkit/auth.py` -- Python verifier
- `CHANGELOG.md` -- v2.5.0 release notes for the bearer-token feature
- `chamber-19/transmittal-builder/backend/auth.py` -- production
  dual-auth example
- `chamber-19/launcher/frontend/src-tauri/src/lib.rs` -- canonical
  consumer integration