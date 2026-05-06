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

3. Share the file: *Share → Anyone with the link → Viewer*.
4. Copy the file ID from the URL: `https://drive.google.com/file/d/{FILE_ID}/view`.

### 3. Configure build-time environment variables

Consumer repos must set two environment variables **before** building:

| Variable | Description |
|---|---|
| `ACTIVATION_DRIVE_FILE_ID` | The Google Drive file ID from step 2 |
| `ACTIVATION_DRIVE_API_KEY` | The API key from step 1 |
| `ACTIVATION_HMAC_SECRET` | A random 32+ character secret — used to sign local tokens |

In GitHub Actions:

```yaml
env:
  ACTIVATION_DRIVE_FILE_ID: ${{ secrets.ACTIVATION_DRIVE_FILE_ID }}
  ACTIVATION_DRIVE_API_KEY: ${{ secrets.ACTIVATION_DRIVE_API_KEY }}
  ACTIVATION_HMAC_SECRET: ${{ secrets.ACTIVATION_HMAC_SECRET }}
```

For local builds, add them to a `.env.build` file (gitignored) and source it before `cargo build`.

> **If any variable is unset** the build still succeeds but activation will fail at runtime with a clear error message.  A sentinel dev-only HMAC key is used so that `cargo check` and `cargo test` work without secrets.

## Generating a PIN for a new engineer

```bash
python scripts/generate_key.py --name "Alice Johnson" --expires "2026-12-31"
```

Output:

```
New PIN: R3P-X4F2-K9QA

Paste this into your Drive auth file under the top-level "keys" object:

{
  "R3P-X4F2-K9QA": {
    "name": "Alice Johnson",
    "active": true,
    "issued": "2025-05-05",
    "expires": "2026-12-31"
  }
}

Then share the PIN with the engineer via a secure channel.
```

Paste the entry into the Drive auth file, then share the PIN with the engineer via a secure channel (not email).

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
- **No plaintext secrets in source** — `option_env!()` is used for all compile-time constants.  The values come from the build environment and do not appear as readable strings in source files.
- **Binary hardening** — Rust release builds compile to native machine code with `strip = true` and `lto = true`.  There is no IL or bytecode to decompile cleanly.  The HMAC secret and Drive credentials are embedded as opaque bytes, not ASCII strings.
- **ACTIVATION_HMAC_SECRET must be unique per product** — use a different secret for each consumer app so that a token from one product cannot be used with another.
