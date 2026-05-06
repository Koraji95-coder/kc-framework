# Activation System

Machine-bound PIN activation for Chamber 19 desktop tools.  Engineers receive a unique PIN tied to their assigned machine.  The PIN is validated once against a Google Drive auth file; subsequent launches verify a signed local token — no network call needed day to day.

## How it works

1. **First launch** — the app shows a full-screen PIN entry form (`ActivationGate`).
2. **PIN validation** — the Rust `toolkit_activate_with_pin` command fetches the Drive auth file, looks up the PIN, checks `active` and `expires`, then writes a signed local token to `{app_data_dir}/.toolkit-activation`.
3. **Token** — JSON signed with HMAC-SHA256 (compile-time secret).  Fields: `machine_id` (SHA-256 of hostname + Windows SID), `name`, `pin_hash`, `issued_at`, `expires_at`, `sig`.
4. **Subsequent launches** — `toolkit_check_activation` reads and verifies the token locally.  Signature, machine ID, and expiry are all checked.  No network call.
5. **Re-validation** — tokens are valid for 30 days (`ACTIVATION_GRACE_DAYS`).  At 5 days remaining a dismissible warning banner appears.  At 0 days the token fails and the PIN form reappears.
6. **Machine binding** — the machine ID is part of the HMAC-signed payload.  Copying the token file to another machine fails signature verification because the machine ID in the token won't match the current host.

## Google Cloud setup

### 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project, e.g. `chamber19-activation`.
2. Enable the **Google Drive API** for the project: *APIs & Services → Library → Google Drive API → Enable*.
3. Create an **API key**: *APIs & Services → Credentials → Create Credentials → API key*.
4. Restrict the API key to the **Drive API** only (Key restrictions → API restrictions → Google Drive API).

### 2. Create the Drive auth file

1. Create a new Google Doc/Sheet or plain JSON file in your Google Drive (any plain `.json` file works).
2. Populate it with the initial structure:

   ```json
   {
     "keys": {}
   }
   ```

   Keys are `HMAC-SHA256(pin, ACTIVATION_PIN_HASH_SECRET)` hex strings — the plaintext PIN is never stored in the file.

3. Share the file: *Share → Anyone with the link → Viewer*.
4. Copy the file ID from the URL: `https://drive.google.com/file/d/{FILE_ID}/view`.

### 3. Configure build-time environment variables

Consumer repos must set four environment variables **before** building:

| Variable | Description |
|---|---|
| `ACTIVATION_DRIVE_FILE_ID` | The Google Drive file ID from step 2 |
| `ACTIVATION_DRIVE_API_KEY` | The API key from step 1 |
| `ACTIVATION_HMAC_SECRET` | Random 32+ char secret — signs local tokens |
| `ACTIVATION_PIN_HASH_SECRET` | Random 32+ char secret — hashes PINs for Drive file keys |

Generate the two secrets:

```bash
openssl rand -hex 32   # run twice — once for HMAC_SECRET, once for PIN_HASH_SECRET
```

In GitHub Actions:

```yaml
env:
  ACTIVATION_DRIVE_FILE_ID: ${{ secrets.ACTIVATION_DRIVE_FILE_ID }}
  ACTIVATION_DRIVE_API_KEY: ${{ secrets.ACTIVATION_DRIVE_API_KEY }}
  ACTIVATION_HMAC_SECRET: ${{ secrets.ACTIVATION_HMAC_SECRET }}
  ACTIVATION_PIN_HASH_SECRET: ${{ secrets.ACTIVATION_PIN_HASH_SECRET }}
```

For local builds, add them to a `.env.build` file (gitignored) and source it before `cargo build`.

> **If any variable is unset** the build still succeeds but activation will fail at runtime with a clear error message.  Dev-only sentinel values are used for HMAC keys so that `cargo check` and `cargo test` work without secrets.

## Generating a PIN for a new engineer

```bash
export ACTIVATION_PIN_HASH_SECRET="<your-pin-hash-secret>"
python scripts/generate_key.py --name "Alice Johnson" --expires "2026-12-31"
```

Output:

```
Plaintext PIN (share via secure channel): R3P-X4F2-K9QA

Paste this into your Drive auth file under the top-level "keys" object:

{
  "a3f9e2...c7d1": {
    "name": "Alice Johnson",
    "active": true,
    "issued": "2025-05-05",
    "expires": "2026-12-31"
  }
}

The key above is HMAC-SHA256(pin, PIN_HASH_SECRET).
The plaintext PIN is never written to the Drive file.
```

Paste the hashed entry into the Drive auth file, then share the **plaintext PIN** with the engineer via a secure channel (not email).  The Drive file never contains the plaintext PIN — an attacker who reads the Drive file cannot recover valid PINs without also knowing `ACTIVATION_PIN_HASH_SECRET`.

## Revoking a PIN

Set `"active": false` in the Drive auth file.  The next time that machine's token expires and they need to re-activate, the PIN will be rejected.  To force immediate revocation, also set `"expires"` to a past date — the token expiry will catch it on the next launch.

## Consumer integration

### Rust — register commands

In the consumer's `src/lib.rs`, add the three commands to `generate_handler![]`:

```rust
use desktop_toolkit::activation::commands::{
    toolkit_activate_with_pin,
    toolkit_activation_status,
    toolkit_check_activation,
    toolkit_deactivate,
};

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        toolkit_check_activation,
        toolkit_activation_status,
        toolkit_activate_with_pin,
        toolkit_deactivate,
        // ... other commands
    ])
```

### React — wrap the app root

```tsx
import { ActivationGate } from '@chamber-19/desktop-toolkit/activation';

export function Root() {
  return (
    <ActivationGate>
      <App />
    </ActivationGate>
  );
}
```

`ActivationGate` is a no-op outside Tauri (Vite dev, Storybook), so no conditional rendering is needed.

### React — settings panel (optional)

```tsx
import { useActivation } from '@chamber-19/desktop-toolkit/activation/hook';

function ActivationSettings() {
  const { activated, warning, daysRemaining, result, deactivate } = useActivation();

  return (
    <div>
      <p>Status: {activated ? `Active (${daysRemaining}d remaining)` : 'Not activated'}</p>
      {warning && <p>Warning: activation expires soon</p>}
      {activated && <button onClick={deactivate}>Deactivate this machine</button>}
    </div>
  );
}
```

## Security notes

- **Drive file ID as secret** — the file is shared "anyone with the link" at read-only access.  The file ID is not publicly discoverable; only holders of the compiled binary know it.  This is appropriate for an internal tool.
- **API key scope** — the key is restricted to the Drive API.  It only grants read quota on publicly-shared files; it cannot access private files or perform write operations.
- **Token machine binding** — the HMAC signature covers the machine ID.  Copying `.toolkit-activation` to another machine fails signature verification.
- **Hashed PINs in Drive** — Drive file keys are `HMAC-SHA256(pin, ACTIVATION_PIN_HASH_SECRET)`.  An attacker who reads the Drive file cannot recover valid PINs without the hash secret, which never leaves the build environment.
- **No plaintext secrets in binary** — credentials are XOR-obfuscated into byte arrays by `build.rs` and stored in the code section rather than the data section.  They do not appear in `strings` output.  `lc!()` (litcrypt2) encrypts inline string literals at compile time for additional coverage.
- **Binary hardening** — Rust release builds compile with `strip = true`, `lto = true`, and `opt-level = 3`.  There is no IL or bytecode to decompile cleanly.
- **ACTIVATION_HMAC_SECRET must be unique per product** — use a different secret for each consumer app so that a token from one product cannot be used with another.
- **ACTIVATION_PIN_HASH_SECRET must be unique per product** — use a different secret per app so a Drive file compromise in one product does not expose PINs for another.

## Higher-security alternative: Cloudflare Worker

The Google Drive approach keeps the Drive file ID and API key in the binary.  If your threat model requires that no Drive credential appear in the binary at all, put the lookup behind a Cloudflare Worker.  The binary only needs to know the Worker URL (non-secret) and sends the HMAC-hashed PIN over HTTPS; the Worker holds the Drive credentials server-side.

```js
// activation-lookup/src/index.js
//
// Deploy with: wrangler deploy
// Set secrets:  wrangler secret put DRIVE_FILE_ID
//               wrangler secret put DRIVE_API_KEY
//               wrangler secret put PIN_HASH_SECRET
//
// Expects POST /lookup with JSON body { "pin_hash": "<hex>" }
// Returns 200 { name, active, issued, expires } or 404 / 500.

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const { pin_hash } = body;
    if (typeof pin_hash !== "string" || !/^[0-9a-f]{64}$/.test(pin_hash)) {
      return new Response("Invalid pin_hash", { status: 400 });
    }

    const url = `https://www.googleapis.com/drive/v3/files/${env.DRIVE_FILE_ID}?alt=media&key=${env.DRIVE_API_KEY}`;
    const driveRes = await fetch(url);
    if (!driveRes.ok) {
      return new Response("Drive error", { status: 502 });
    }

    const { keys } = await driveRes.json();
    const entry = keys?.[pin_hash];
    if (!entry) {
      return new Response("Not found", { status: 404 });
    }

    return Response.json(entry);
  },
};
```

With this approach the Rust activation code calls `POST https://<worker>.workers.dev/lookup` with `{ "pin_hash": "<computed-hash>" }` instead of fetching the Drive file directly.  `ACTIVATION_DRIVE_FILE_ID` and `ACTIVATION_DRIVE_API_KEY` are no longer needed as build-time env vars; only the Worker URL is embedded in the binary.
