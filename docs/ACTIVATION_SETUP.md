# Activation system — build-time setup

The Chamber 19 activation system phones home to a Google Drive file on first PIN entry (and every 30 days thereafter) to validate licenses. Consumer apps embed both the Drive file ID and an API key at **build time** via `env!()` macros — no plain-string credentials live in source.

This document is the canonical setup guide for every Tauri consumer app that uses `desktop-toolkit/activation`.

## The three build-time env vars

| Variable | What | Required in | Where to get it |
|---|---|---|---|
| `ACTIVATION_HMAC_SECRET` | Org-wide secret used to sign the local activation token + short-lived bearer tokens. Identical on launcher + every backend host. | Release builds (compile error if absent) | Org-level GitHub Actions secret. Ask `@Koraji95-coder`. |
| `ACTIVATION_DRIVE_FILE_ID` | Google Drive file ID of the PIN registry (the JSON file with `{"keys": {...}}`). | Release builds (gate refuses to validate without) | Drive file URL — the long string after `/d/`. |
| `ACTIVATION_DRIVE_API_KEY` | Google API key with Drive read-only access. Bills against the project that issued the key. | Release builds | Google Cloud Console → APIs & Services → Credentials → restrict to Google Drive API. |

## Debug-build dev mode (no Drive credentials needed)

If you `cargo build` without setting `ACTIVATION_DRIVE_*`, debug builds activate the **dev-mode bypass**:

- **PIN `R3P-DEV-DEV`** is accepted unconditionally.
- The local activation token is issued with a 2099 expiry so you never re-validate during development.
- `ACTIVATION_HMAC_SECRET` still falls back to its dev sentinel string, so the local token's signature still verifies (just won't be valid against any production backend).

This means a fresh clone of any Tauri consumer can do:

```bash
cd <consumer>/frontend
npm run desktop          # debug build, no env vars set
# Activation gate appears -> enter R3P-DEV-DEV -> activated.
```

Release builds **never** hit this path (`env!()` is a compile error when the vars are unset in `--release`).

## Production build — full setup

For builds that ship to real users:

### 1. Create the Drive PIN registry

Create a JSON file on Google Drive shared **"Anyone with the link → Viewer"**:

```json
{
  "keys": {
    "R3P-XXXX-XXXX": {
      "name": "Engineer Name",
      "machine": null,
      "active": true,
      "issued": "2026-01-01",
      "expires": "2027-01-01"
    }
  }
}
```

Capture the file ID from the URL (the part after `/d/`).

Generate new PINs with `scripts/generate_key.py`:

```bash
python scripts/generate_key.py --name "Jane Doe" --expires "2027-01-01"
```

The script prints a new R3P-formatted PIN. Add the entry to the Drive file. Set `"active": false` to revoke.

### 2. Issue a Google API key

1. Google Cloud Console → Create a new project (or use an existing one).
2. APIs & Services → Library → enable **Google Drive API**.
3. APIs & Services → Credentials → Create credentials → API key.
4. Restrict the key:
   - **Application restrictions** → none (so it can be called from desktop apps).
   - **API restrictions** → restrict to Google Drive API only.
5. Copy the key.

### 3. Set the env vars at build time

#### Local Windows build

```powershell
$env:ACTIVATION_HMAC_SECRET     = "<org-secret>"
$env:ACTIVATION_DRIVE_FILE_ID   = "<drive-file-id>"
$env:ACTIVATION_DRIVE_API_KEY   = "<drive-api-key>"
cd frontend
npm run desktop:build
```

#### GitHub Actions release workflow

```yaml
- name: Tauri build
  env:
    ACTIVATION_HMAC_SECRET:   ${{ secrets.ACTIVATION_HMAC_SECRET }}
    ACTIVATION_DRIVE_FILE_ID: ${{ secrets.ACTIVATION_DRIVE_FILE_ID }}
    ACTIVATION_DRIVE_API_KEY: ${{ secrets.ACTIVATION_DRIVE_API_KEY }}
  run: npm run desktop:build
```

All three secrets must be set at the **organization** level so every release workflow inherits them.

### 4. Rotate

- Rotate `ACTIVATION_HMAC_SECRET` whenever a release binary leaks or a key is suspected of compromise. Every running install must be rebuilt with the new secret; outstanding bearer tokens immediately stop validating against backends.
- Rotate `ACTIVATION_DRIVE_API_KEY` if its bill is unexpected or if it appears in any commit. The Drive file ID itself can stay (it's not a secret, just lookup data).
- Revoke individual PINs by setting `"active": false` in the Drive file. The next 30-day re-validation rejects them.

## Common errors

| Error message | Meaning | Fix |
|---|---|---|
| `Activation Drive credentials not configured. In debug builds you can activate with the dev PIN 'R3P-DEV-DEV'.` | Debug build, no Drive env vars, PIN entered wasn't the dev one. | Enter `R3P-DEV-DEV`. |
| `Activation Drive credentials not configured (ACTIVATION_DRIVE_FILE_ID / ACTIVATION_DRIVE_API_KEY not set at build time)` | Release build, neither Drive env var set at build time. | Set both at build time (see step 3 above). |
| `Drive request failed: timeout` | Drive file ID or API key is wrong, or the API key has no Drive scope. | Check `https://www.googleapis.com/drive/v3/files/<FILE_ID>?alt=media&key=<KEY>` in a browser — should return the JSON. |
| `PIN not found` | The PIN entered doesn't exist in the Drive file. | Add an entry, or use the dev PIN in debug. |
| `Token signature invalid` | Local activation token was signed with a different HMAC secret than the binary now has. | Delete `{app_data_dir}/.toolkit-activation` and re-enter the PIN. |
| `Token is bound to a different machine` | PIN was activated on another machine first. | Revoke the old machine binding in the Drive file (set `"machine": null`) or issue a new PIN. |

## Toolkit version-gating

The dev-mode bypass landed in **desktop-toolkit v2.7.3**. Consumer apps pinned to an older toolkit version will still hit the original "credentials not configured" hard error in debug builds. Bump to v2.7.3 (or later) to pick up the dev PIN path.
