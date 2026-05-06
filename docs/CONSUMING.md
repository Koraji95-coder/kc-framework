# Consuming `desktop-toolkit` — Full Onboarding Guide

This guide is for maintainers inside the `chamber-19` org who are bootstrapping a new
consumer tool (e.g. `shopvac`, Drawing List Manager, or any future app) that depends on
`@chamber-19/desktop-toolkit` (npm) and/or `chamber19-desktop-toolkit` (Python).

Follow the sections in order the first time. Each section is self-contained so you can
jump back to any part later.

---

## Table of Contents

1. [Overview / TL;DR](#overview--tldr)
2. [Repository checklist (one-time setup)](#repository-checklist-one-time-setup)
3. [File templates](#file-templates)
4. [GitHub Actions workflow setup](#github-actions-workflow-setup)
5. [Local development setup](#local-development-setup)
6. [Updater shim integration (Rust)](#updater-shim-integration-rust)
7. [Window flash prevention](#window-flash-prevention)
8. [Versioning policy](#versioning-policy)
9. [Troubleshooting](#troubleshooting)
10. [Onboarding checklist](#onboarding-checklist)

---

## Overview / TL;DR

`desktop-toolkit` ships three consumable packages from a single repo:

| Package | Ecosystem | What you get |
|---|---|---|
| `@chamber-19/desktop-toolkit` | npm / GitHub Packages | JS/React UI primitives: splash screen, force-update window, IPC helpers, version constant |
| `chamber19-desktop-toolkit` | Python / pip (git URL) | PDF merge pipeline, SMTP email helper |
| `desktop-toolkit` crate | Rust / Cargo (git URL) | Splash, updater, sidecar, and logging modules for the Tauri backend |

**Three things every consumer MUST configure:**

1. **npm registry auth** — GitHub Packages requires authentication even for public packages.
   Commit `frontend/.npmrc` and export `NODE_AUTH_TOKEN` in every environment that runs
   `npm install`.
2. **Package access grant** — The consumer repo must be explicitly granted Read access on
   the `@chamber-19/desktop-toolkit` package settings page before CI can install it.
3. **`bundle.resources` for the updater shim** — As of v2.2.5, the framework no longer
   bundles `desktop-toolkit-updater.exe` via the NSIS `File` directive. The shim MUST be
   listed in `tauri.conf.json → bundle.resources` so Tauri copies it to `<INSTDIR>\resources\`
   during packaging.

---

## Repository checklist (one-time setup)

Perform these steps once when bootstrapping a new consumer repo. You only need to repeat
them if you create an additional consumer repo.

### 1 — Grant the new repo access to the npm package

> **Warning:** This step is REQUIRED even though both the source repo and the package are
> public. GitHub Packages npm always requires authentication, and `GITHUB_TOKEN` in CI only
> works if the package owner has explicitly granted the consumer repo access.

1. Navigate to:

   ```text
   https://github.com/orgs/chamber-19/packages/npm/desktop-toolkit/settings
   ```

2. Scroll to **"Manage Actions access"**.
3. Click **Add Repository**.
4. Search for and select your new consumer repo (e.g. `chamber-19/shopvac`).
5. Set role = **Read**.
6. Click **Add**.

CI's `GITHUB_TOKEN` can now authenticate to GitHub Packages for npm installs in that repo.
Without this step, `npm install` in CI will return HTTP 403.

### 2 — Python package access

No action required. The Python package is consumed via a plain `pip install` from the public
git URL. No token, no registry config, no access grant needed.

### 3 — (Private repos only) Git auth for the Rust crate

The `desktop-toolkit` Rust crate is pulled via a git URL:

```toml
desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.3.1" }
```

If `chamber-19/desktop-toolkit` is ever made private, Cargo will need credentials to clone
it. In that scenario:

- **Locally:** run `gh auth login` or configure a Git credential helper.
- **In CI:** add `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and a `git config` step to inject
  the token for `github.com`.

As long as `desktop-toolkit` remains public (current state), no auth is needed for Cargo.

---

## File templates

Commit the following files to your consumer repo verbatim, substituting your tool's values
where noted.

### `frontend/.npmrc`

This file redirects the `@chamber-19` scope to GitHub Packages and configures token auth.
The token itself is NOT committed — it is injected at runtime via the `NODE_AUTH_TOKEN`
environment variable.

```ini name=frontend/.npmrc
@chamber-19:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
always-auth=true
```

> **Note:** `always-auth=true` prevents npm from falling back to the public registry and
> producing confusing 404 errors for scoped packages.

### `frontend/package.json`

Minimal example showing the dependency entry, version pin, and prebuild asset-sync script:

```json name=frontend/package.json
{
  "name": "my-tool-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "prebuild": "desktop-toolkit-sync-installer-assets",
    "build": "vite build",
    "dev": "vite",
    "tauri": "tauri"
  },
  "dependencies": {
    "@chamber-19/desktop-toolkit": "^2.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "vite": "^6"
  }
}
```

> **Note:** `^2.3.1` is the current recommended pin. v2.2.5 is the first release where the
> NSIS `File` directive issue is resolved and `bundle.resources` is the authoritative way
> to ship the updater shim. Do not pin to v2.2.4 or earlier.

The `prebuild` script runs `desktop-toolkit-sync-installer-assets` (exposed via the `bin`
field in the npm package), which copies NSIS assets (`hooks.nsh`, `nsis-header.bmp`,
`nsis-sidebar.bmp`) into `frontend/src-tauri/installer/` before every build.

### `frontend/src-tauri/tauri.conf.json`

The critical `bundle.resources` entry for the updater shim:

```json name=frontend/src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "My Tool",
  "version": "1.0.0",
  "identifier": "com.chamber-19.my-tool",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ],
    "resources": [
      "binaries/my-tool-backend/**/*",
      "desktop-toolkit-updater.exe"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "installerIcon": "icons/icon.ico",
        "headerImage": "installer/nsis-header.bmp",
        "sidebarImage": "installer/nsis-sidebar.bmp",
        "installerHooks": "installer/hooks.nsh",
        "displayLanguageSelector": false,
        "languages": ["English"]
      }
    }
  }
}
```

**Why `bundle.resources` is required (post-v2.2.5 contract):**

Prior to v2.2.5, `installer/nsis/hooks.nsh` used an NSIS `File` directive inside
`NSIS_HOOK_POSTINSTALL` to bundle the updater shim:

```nsis
!macro NSIS_HOOK_POSTINSTALL
  File "${BUILD_DIR}\desktop-toolkit-updater.exe"
!macroend
```

Tauri 2's NSIS template invokes `NSIS_HOOK_POSTINSTALL` from a `Function`, not a `Section`.
NSIS's `File` directive is only valid inside a `Section`, so this produced:

```text
Error: command File not valid outside Section or Function
!include: error in script: "...\installer\hooks.nsh" on line 113
```

v2.2.5 removes the `File` directive from `NSIS_HOOK_POSTINSTALL` entirely. Instead, the
shim is declared in `bundle.resources`, which causes Tauri to copy it to
`<INSTDIR>\resources\desktop-toolkit-updater.exe` using its own bundling pipeline (which
correctly handles the `Section` context). The Rust path resolution in `updater.rs` is
updated accordingly — see [Updater shim integration](#updater-shim-integration-rust).

> **Warning:** Omitting `desktop-toolkit-updater.exe` from `bundle.resources` means the
> shim will not be installed alongside the app and auto-updates will silently fail.

### `frontend/src-tauri/Cargo.toml`

```toml name=frontend/src-tauri/Cargo.toml
[package]
name = "my-tool"
version = "1.0.0"
description = "My Tool — description here"
authors = ["Your Name"]
license = "MIT"
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.3.1" }
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-dialog = "2"
semver = "1"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

Pin to an exact tag. Do not use `branch = "main"` — that produces unreproducible builds.

### `backend/requirements.txt`

```text name=backend/requirements.txt
chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@v2.3.1#subdirectory=python
```

### `frontend/src-tauri/installer/hooks.nsh`

As of v2.2.5, the framework ships a working `hooks.nsh` that consumers can use directly
without modification — the `prebuild` script (`desktop-toolkit-sync-installer-assets`)
copies it into `frontend/src-tauri/installer/hooks.nsh` before every build.

The shared `hooks.nsh` automatically renders the installer and uninstaller title bars as
`<Your App Name> — Setup` and `<Your App Name> — Uninstaller`, sourced from `productName`
in your `tauri.conf.json`. No consumer-side override of `hooks.nsh` is required for this;
the file uses NSIS's runtime `$(^Name)` token to ensure the name resolves correctly even
though Tauri includes `hooks.nsh` before defining `${PRODUCTNAME}`. The `NSIS_HOOK_POSTINSTALL`
macro is a no-op — no `CopyFiles` or manual file placement is needed; the updater shim is
found automatically at `<INSTDIR>\resources\desktop-toolkit-updater.exe` via
`app.path().resource_dir()`.

If your tool needs extra NSIS behavior (kill a detached sidecar, write custom registry
keys, add pages), override the synced file by committing your own copy:

```nsis name=frontend/src-tauri/installer/hooks.nsh
; hooks.nsh — My Tool installer hooks
; Extends desktop-toolkit's base hooks with tool-specific behavior.
; Synced from @chamber-19/desktop-toolkit by the prebuild script;
; THIS FILE IS A LOCAL OVERRIDE — do not delete.

; ── Include base hooks ────────────────────────────────────────────────────
; (The base hooks are merged here at sync time. Add customizations below.)

!macro NSIS_HOOK_PREINSTALL
  ; Kill the main app and updater shim (from base hooks)
  nsExec::Exec 'taskkill /F /IM "my-tool.exe" /T'
  nsExec::Exec 'taskkill /F /IM "desktop-toolkit-updater.exe" /T'
  ; Also kill the detached sidecar if it survives the parent
  nsExec::Exec 'taskkill /F /IM "my-tool-backend.exe" /T'
  Sleep 2000
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM "my-tool.exe" /T'
  nsExec::Exec 'taskkill /F /IM "desktop-toolkit-updater.exe" /T'
  nsExec::Exec 'taskkill /F /IM "my-tool-backend.exe" /T'
  Sleep 2000
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend

; ── Extending this file ───────────────────────────────────────────────────
; Add extra NSIS customizations below this line.
; ─────────────────────────────────────────────────────────────────────────
```

> **Note:** If you commit a local override, make sure `tauri.conf.json` →
> `bundle.windows.nsis.installerHooks` still points at `"installer/hooks.nsh"`. The
> prebuild sync will overwrite your file unless you add it to the skip list or remove
> the prebuild step — be intentional about this.

---

## GitHub Actions workflow setup

### `release.yml`

Complete, ready-to-copy release workflow. Replace every `MY_TOOL_*` placeholder with
your tool's values before committing.

```yaml name=.github/workflows/release.yml
# release.yml — Builds the NSIS installer and publishes a GitHub Release.
# Prerequisites:
#   1. Repo granted Read access on the @chamber-19/desktop-toolkit package:
#      https://github.com/orgs/chamber-19/packages/npm/desktop-toolkit/settings
#   2. desktop-toolkit-updater.exe listed in tauri.conf.json → bundle.resources
#
# See docs/CONSUMING.md in chamber-19/desktop-toolkit for the full onboarding guide.

name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write
      packages: read

    steps:
      # ── 1. Checkout ─────────────────────────────────────────────────────
      - name: Checkout repository
        uses: actions/checkout@v5

      # ── 2. Tool setup ───────────────────────────────────────────────────
      - name: Set up Node.js 20
        uses: actions/setup-node@v6
        with:
          node-version: "20"
          registry-url: "https://npm.pkg.github.com"
          scope: "@chamber-19"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Set up Python 3.13
        uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      - name: Set up Rust (stable)
        uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          target: x86_64-pc-windows-msvc

      - name: Cache Rust build artefacts
        uses: actions/cache@v5
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            frontend/src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('frontend/src-tauri/Cargo.lock') }}
          restore-keys: ${{ runner.os }}-cargo-

      # ── 3. Preflight — fail fast on auth errors ──────────────────────────
      - name: Preflight — verify GitHub Packages access
        shell: pwsh
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          $headers = @{ Authorization = "Bearer $env:NODE_AUTH_TOKEN" }
          try {
            $resp = Invoke-WebRequest -Uri "https://npm.pkg.github.com/@chamber-19/desktop-toolkit" -Headers $headers -UseBasicParsing -ErrorAction Stop
            Write-Host "✓ GitHub Packages auth OK (HTTP $($resp.StatusCode))"
          } catch {
            Write-Host "::error::Cannot authenticate to GitHub Packages for @chamber-19/desktop-toolkit. Error: $($_.Exception.Message)"
            Write-Host "::error::Ensure this repo is granted access at https://github.com/orgs/chamber-19/packages/npm/desktop-toolkit/settings (Manage Actions access)."
            throw
          }

      # ── 4. Python backend → PyInstaller sidecar ─────────────────────────
      - name: Install backend dependencies
        run: |
          cd backend
          pip install -r requirements.txt -r requirements-build.txt

      - name: Build PyInstaller sidecar
        run: |
          cd backend
          pyinstaller MY_TOOL_BACKEND.spec --distpath dist-sidecar --workpath build-sidecar

      - name: Copy sidecar to Tauri resources
        shell: pwsh
        run: |
          $dest = "frontend\src-tauri\binaries\MY_TOOL_SIDECAR_NAME"
          New-Item -ItemType Directory -Force -Path $dest | Out-Null
          Copy-Item -Recurse -Force "backend\dist-sidecar\MY_TOOL_SIDECAR_NAME\*" $dest
          Write-Host "Sidecar copied to $dest"

      # ── 5. Build desktop-toolkit-updater shim ───────────────────────────
      - name: Build desktop-toolkit-updater shim
        shell: pwsh
        run: |
          # Clone the pinned tag (shallow) and build the updater shim binary.
          $tag = "v2.3.1"   # Keep in sync with Cargo.toml and requirements.txt
          git clone --depth 1 --branch $tag https://github.com/chamber-19/desktop-toolkit.git /tmp/dtk
          Push-Location /tmp/dtk
          cargo build --release -p desktop-toolkit-updater
          Pop-Location
          Copy-Item /tmp/dtk/target/release/desktop-toolkit-updater.exe `
            frontend/src-tauri/desktop-toolkit-updater.exe
          Write-Host "✓ desktop-toolkit-updater.exe copied to frontend/src-tauri/"

      # ── 6. Frontend build ────────────────────────────────────────────────
      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Build Vite frontend
        run: npm run build
        working-directory: frontend

      # ── 7. Clean cached bundle outputs ───────────────────────────────────
      - name: Clean cached NSIS bundle outputs
        shell: pwsh
        run: |
          $bundleDir = "frontend\\src-tauri\\target\\release\\bundle\\nsis"
          if (Test-Path $bundleDir) {
            Remove-Item -Recurse -Force $bundleDir
            Write-Host "Removed cached NSIS bundle directory: $bundleDir"
          } else {
            Write-Host "No cached NSIS bundle directory found at $bundleDir"
          }

      # ── 8. Tauri build ───────────────────────────────────────────────────
      - name: Build Tauri app (NSIS installer)
        run: npx tauri build
        working-directory: frontend
        env:
          TAURI_SIGNING_PRIVATE_KEY: ""

      # ── 9. Locate built artefacts ────────────────────────────────────────
      - name: Locate NSIS installer
        id: find_installer
        shell: pwsh
        run: |
          $version = "${{ github.ref_name }}" -replace '^v', ''
          $allInstallers = Get-ChildItem -Path "frontend\src-tauri\target\release\bundle\nsis\*.exe" -File
          if (-not $allInstallers) { throw "NSIS installer not found!" }

          $escapedVersion = [regex]::Escape($version)
          $versionedInstallers = $allInstallers |
            Where-Object { $_.Name -match "(^|[^0-9])$escapedVersion([^0-9]|$)" } |
            Sort-Object LastWriteTimeUtc -Descending

          if ($versionedInstallers) {
            $exe = $versionedInstallers | Select-Object -First 1
          } else {
            Write-Warning "No installer filename matched version $version. Falling back to newest installer by timestamp."
            $exe = $allInstallers | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
          }

          if (-not $exe) { throw "NSIS installer not found!" }
          echo "path=$($exe.FullName)" >> $env:GITHUB_OUTPUT
          echo "name=$($exe.Name)"     >> $env:GITHUB_OUTPUT
          Write-Host "Installer: $($exe.FullName)"

      # ── 10. Generate latest.json ──────────────────────────────────────────
      - name: Generate latest.json
        run: node build-scripts/generate-latest-json.mjs
        env:
          INSTALLER_NAME: ${{ steps.find_installer.outputs.name }}
          TAG_NAME:       ${{ github.ref_name }}

      # ── 11. Create GitHub Release ────────────────────────────────────────
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v3.0.0
        with:
          tag_name: ${{ github.ref_name }}
          name:     "MY_TOOL_DISPLAY_NAME ${{ github.ref_name }}"
          fail_on_unmatched_files: true
          files: |
            ${{ steps.find_installer.outputs.path }}
            latest.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Checklist before your first tag push:**

- [ ] Replace `MY_TOOL_BACKEND.spec`, `MY_TOOL_SIDECAR_NAME`, `MY_TOOL_DISPLAY_NAME`
- [ ] Update the shim `$tag` variable to match the version pinned in `Cargo.toml`
- [ ] Verify `generate-latest-json.mjs` exists (copy from `desktop-toolkit/build-scripts/`)
- [ ] Repo has been granted access on the package settings page (step 1 of the repo checklist)

### Reusable workflow (recommended for new consumers)

New consumers should call the reusable `tauri-release.yml` workflow instead of
copy-pasting the full `release.yml` above. The workflow lives in this repo and
all consumers inherit bug fixes and action-version upgrades automatically when
the workflow moves forward.

> **Note:** Until this workflow is tagged `v1`, callers must pin to `@main`.
> Once `v1` is cut, callers must update their pin to `@v1`.

#### Versioning policy

> The reusable workflow follows a frozen-major-tag policy modeled on
> `actions/checkout`. `@v1` will receive non-breaking fixes by moving the
> `v1` tag forward. When breaking changes are needed, a new `v2` tag is
> created, and the `v1` tag is **frozen** — it does not move once `v2` exists.
> Consumers migrate from `@v1` to `@v2` deliberately.

#### Caller example: tool with Python sidecar (TB-shaped)

```yaml name=.github/workflows/release.yml
# .github/workflows/release.yml in the consumer repo
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    uses: chamber-19/desktop-toolkit/.github/workflows/tauri-release.yml@main
    with:
      tool-display-name: "Transmittal Builder"
      backend-dir: "backend"
      backend-spec: "transmittal_backend.spec"
      sidecar-name: "transmittal-backend"
    secrets: inherit
```

#### Caller example: tool without Python sidecar, hardcoded shim tag (launcher-shaped)

```yaml name=.github/workflows/release.yml
# .github/workflows/release.yml in the consumer repo
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    uses: chamber-19/desktop-toolkit/.github/workflows/tauri-release.yml@main
    with:
      tool-display-name: "Shopvac"
      shim-tag-source: "input"
      shim-tag: "v2.2.4"
    secrets: inherit
```

All available inputs are documented at the top of
[`.github/workflows/tauri-release.yml`](../.github/workflows/tauri-release.yml).

---

### `copilot-setup-steps.yml` (optional)

If you want Copilot coding agent support, commit this workflow. It pre-installs all build
dependencies so Copilot's agent environment is ready for iterative work.

```yaml name=.github/workflows/copilot-setup-steps.yml
# copilot-setup-steps.yml — Pre-installs build tooling for the Copilot coding agent.
# See https://docs.github.com/en/copilot/customizing-copilot/customizing-the-development-environment-for-copilot-coding-agent
name: "Copilot Setup Steps"

on:
  workflow_dispatch:

jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v5

      - name: Set up Node.js 20
        uses: actions/setup-node@v6
        with:
          node-version: "20"
          registry-url: "https://npm.pkg.github.com"
          scope: "@chamber-19"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Set up Python 3.13
        uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      - name: Set up Rust (stable)
        uses: actions-rust-lang/setup-rust-toolchain@v1

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Install backend dependencies
        run: pip install -r requirements.txt -r requirements-build.txt
        working-directory: backend
```

---

## Local development setup

### Create a Personal Access Token (PAT)

1. Navigate to: <https://github.com/settings/tokens/new>
2. Token type: **Classic token** is the safest choice for `read:packages`. Fine-grained
   tokens may also work for GitHub Packages on some account configurations, but classic
   tokens with `read:packages` are the tested and documented path for this org.
3. Name: `chamber-19 packages reader` (or any name you'll recognise).
4. Expiration: **90 days** is a good balance between security and convenience. Set a calendar
   reminder to rotate it.
5. Scopes: tick **only** `read:packages`. No other scopes are required to install packages.
6. Click **Generate token** and copy the value immediately — it is not shown again.

### Set `NODE_AUTH_TOKEN`

The `.npmrc` file reads `${NODE_AUTH_TOKEN}` at install time. You must export it in every
shell session that runs `npm install`.

**macOS / Linux (bash/zsh — one session):**

```bash
export NODE_AUTH_TOKEN=ghp_…
```

**Windows PowerShell (one session):**

```powershell
$env:NODE_AUTH_TOKEN = "ghp_…"
```

**Windows cmd (one session):**

```cmd
set NODE_AUTH_TOKEN=ghp_…
```

**Persistent (add to shell rc file):**

> **Warning:** Storing a PAT in a shell rc file means anyone who can read `~/.zshrc`,
> `~/.bashrc`, or your PowerShell `$PROFILE` can steal it. For personal workstations this
> is usually an acceptable tradeoff. For shared or managed machines, use your OS keychain
> (macOS Keychain, Windows Credential Manager) and read the token from there.

- macOS/Linux: add `export NODE_AUTH_TOKEN=ghp_…` to `~/.zshrc` or `~/.bashrc`
- Windows: add `$env:NODE_AUTH_TOKEN = "ghp_…"` to `$PROFILE`

**VS Code dev container (`.devcontainer/devcontainer.json`):**

```json
{
  "remoteEnv": {
    "NODE_AUTH_TOKEN": "${localEnv:NODE_AUTH_TOKEN}"
  }
}
```

This forwards the token from your host environment into the container without committing it.

**direnv (`.envrc` in repo root — add `.envrc` to `.gitignore`):**

```bash
# .envrc — loaded by direnv when you cd into the repo
export NODE_AUTH_TOKEN=ghp_…
```

### Verify the install

```bash
cd frontend
npm install
npm ls @chamber-19/desktop-toolkit
```

Expected output:

```text
my-tool-frontend@1.0.0 /path/to/your/repo/frontend
└── @chamber-19/desktop-toolkit@2.3.1
```

If you see `401 Unauthorized` or `403 Forbidden`, work through the
[Troubleshooting](#troubleshooting) table below.

---

## Updater shim integration (Rust)

As of v2.2.5, `desktop-toolkit-updater.exe` is installed by Tauri into
`<INSTDIR>\resources\desktop-toolkit-updater.exe` (because it is declared in
`bundle.resources`). Prior to v2.2.5 the shim was placed directly in `<INSTDIR>` via
the NSIS `File` directive.

Resolve the shim path in your `updater.rs` (or wherever you spawn the shim):

```rust
use tauri::Manager;

// Inside your update handler:
let resource_dir = app.path().resource_dir()?;
let shim_path = resource_dir.join("desktop-toolkit-updater.exe");
```

The `resource_dir()` API returns the `resources` subdirectory of the installation
directory at runtime. This is the correct path regardless of where the user chose to
install the app.

> **Warning:** If your tool was built against desktop-toolkit ≤ v2.2.4, the shim was
> placed directly in `<INSTDIR>` (next to the main exe). Bumping to v2.2.5 and adding
> `bundle.resources` without also updating this path will cause "shim not found" errors
> at update time.

**Full example (distilled from `crates/desktop-toolkit/src/updater.rs`):**

```rust
pub fn start_update(app: tauri::AppHandle, installer_path: &Path) {
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("resource_dir must be resolvable");

    let shim_path = resource_dir.join("desktop-toolkit-updater.exe");

    std::process::Command::new(&shim_path)
        .arg("--installer")
        .arg(installer_path)
        .arg("--installed-app-exe")
        .arg(std::env::current_exe().unwrap())
        .spawn()
        .expect("failed to spawn updater shim");

    app.exit(0);
}
```

---

## Window flash prevention

By default, Tauri creates the main window with `visible: false` (configured in
`tauri.conf.json` and `tauri.conf.json.template`). The window also has a
`backgroundColor` of `#1C1B19` so that if it becomes visible before JS takes
over, the background matches the Chamber 19 design system instead of showing
white.

To reveal the window after React has rendered its first frame, call
`showOnReady()` from your frontend entry point.

### Quick start

In your `frontend/src/main.jsx` (or `main.tsx`):

```jsx name=frontend/src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { showOnReady } from "@chamber-19/desktop-toolkit/window/showOnReady";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Reveal the main window after the React tree has committed its first frame.
// Remove this call and the window will stay invisible forever.
showOnReady();
```

> **Warning:** If you omit the `showOnReady()` call after upgrading, the main
> window will be invisible forever — the user will see nothing after launch.

### Hook variant

If you prefer to co-locate the call with a component, use the `useShowOnReady`
hook at the root of your tree:

```jsx
import { useShowOnReady } from "@chamber-19/desktop-toolkit/window/showOnReady";

function App() {
  useShowOnReady();
  return <YourApp />;
}
```

Both variants are no-ops when running outside a Tauri context (e.g. a Vite
dev server opened in a plain browser) — no guard required on your side.

### How it works

The window config sets:

```json
{
  "visible": false,
  "backgroundColor": "#1C1B19"
}
```

`showOnReady()` / `useShowOnReady` call `getCurrentWindow().show()` inside a
`requestAnimationFrame` callback, which fires after the browser has committed
and painted the React tree. This eliminates the blank/white window flash that
occurs when a Tauri app renders slowly on first load or immediately after an
auto-update relaunch.

### Migration for existing consumers

If your app was built before this pattern was introduced, add the
`showOnReady()` call to your existing `main.jsx`:

1. Confirm your `tauri.conf.json` main window has `"visible": false` and
   `"backgroundColor": "#1C1B19"`.  If it still has `"visible": true`, add
   those two fields.
2. Add the import and call to `main.jsx` as shown above.
3. Build and test: the window should appear with a dark background as soon as
   React renders, with no visible flash.

> **Note:** Apps that use the splash-screen startup sequence (in the
> `tauri-template`) show the main window from Rust after the splash completes.
> Adding `showOnReady()` to the JS side is still recommended — it provides an
> extra guarantee that the window is not revealed before React commits, without
> any conflict (calling `show()` on an already-visible window is a no-op).

---

## Versioning policy

### Pin rules

| Package | Pin style | Rationale |
|---|---|---|
| `@chamber-19/desktop-toolkit` in `package.json` | `^x.y.z` | GitHub Packages publishes immutable versions; `^` only ever installs a newer compatible release |
| `desktop-toolkit` git dep in `Cargo.toml` | `tag = "vX.Y.Z"` (exact) | Git deps have no immutability guarantee; always pin exact tags |
| `chamber19-desktop-toolkit` in `requirements.txt` | `@vX.Y.Z` (exact tag) | Same reason as Rust |

### Bumping in lockstep

All three packages share the same version number. When you bump, update all three files in
a single commit:

```text name=frontend/package.json (dependency line)
"@chamber-19/desktop-toolkit": "^2.3.1"
```

```toml name=frontend/src-tauri/Cargo.toml (dependency line)
desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.3.1" }
```

```text name=backend/requirements.txt
chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@v2.3.1#subdirectory=python
```

### Optional: `scripts/bump-toolkit.mjs`

A small Node script can update all three files in one command:

```javascript name=scripts/bump-toolkit.mjs
#!/usr/bin/env node
// Usage: node scripts/bump-toolkit.mjs 2.3.1
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) { console.error("Usage: node bump-toolkit.mjs <version>"); process.exit(1); }

// package.json
const pkg = JSON.parse(readFileSync("frontend/package.json", "utf8"));
pkg.dependencies["@chamber-19/desktop-toolkit"] = `^${version}`;
writeFileSync("frontend/package.json", JSON.stringify(pkg, null, 2) + "\n");

// Cargo.toml
let cargo = readFileSync("frontend/src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(
  /desktop-toolkit = \{ git = ".*?", tag = "v[\d.]+" \}/,
  `desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v${version}" }`
);
writeFileSync("frontend/src-tauri/Cargo.toml", cargo);

// requirements.txt
let reqs = readFileSync("backend/requirements.txt", "utf8");
reqs = reqs.replace(
  /chamber19-desktop-toolkit @ git\+https:\/\/github\.com\/chamber-19\/desktop-toolkit@v[\d.]+/,
  `chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@v${version}`
);
writeFileSync("backend/requirements.txt", reqs);

console.log(`✓ Bumped all three desktop-toolkit pins to v${version}`);
```

Run: `node scripts/bump-toolkit.mjs 2.3.1`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` returns `401 Unauthorized` for `@chamber-19/desktop-toolkit` | `NODE_AUTH_TOKEN` is missing, expired, or lacks `read:packages` scope | Regenerate your PAT with only `read:packages`; export `NODE_AUTH_TOKEN`; run the verify step from [Local dev](#local-development-setup) |
| CI `npm install` fails with `403 Forbidden` | Repo is not granted access on the package settings page | Add the repo via `https://github.com/orgs/chamber-19/packages/npm/desktop-toolkit/settings` → "Manage Actions access" |
| `NSIS error: command File not valid outside Section or Function` on line 113 of `hooks.nsh` | Consumer is using `desktop-toolkit` ≤ 2.2.4 | Bump to `^2.3.1` in `package.json`, re-run `npm install`, and rebuild |
| Updater shim not found after install | Old install path (`<INSTDIR>` root) or `bundle.resources` entry missing | Add `"desktop-toolkit-updater.exe"` to `bundle.resources` in `tauri.conf.json`; update Rust path to use `app.path().resource_dir()` |
| Auto-update progress window appears but version never changes | `desktop-toolkit-updater.exe` shim not present at runtime | Verify the shim was built and copied to `frontend/src-tauri/` before `tauri build`; verify `bundle.resources` includes it |
| Latest installer download launches an older app build | The release workflow or shared-drive publish script selected the first cached `*.exe` instead of the installer for the current tag | Delete cached `target/release/bundle/nsis` outputs before `tauri build`; select the installer whose filename matches `${{ github.ref_name }}` / `latest.json.installer` rather than `Select-Object -First 1` |
| `pip install chamber19-desktop-toolkit` returns 404 or `not found` | Tag doesn't exist on the remote, or URL typo | Verify the tag exists at `https://github.com/chamber-19/desktop-toolkit/releases`; check the `#subdirectory=python` suffix is present |
| `cargo build` fails with `failed to authenticate when downloading repository` | The `desktop-toolkit` repo is private and no git auth is configured | Run `gh auth login`; or configure a Git credential helper; for CI, inject `GITHUB_TOKEN` via `git config` |
| `npm run prebuild` (asset sync) silently skips `hooks.nsh` | `prebuild` script not wired up, or package not installed | Confirm `"prebuild": "desktop-toolkit-sync-installer-assets"` is in `scripts`; run `npm install` first |
| Preflight step in CI fails with `Unable to connect` | Network issue or registry outage | Check GitHub Status (https://githubstatus.com); retry the run |

---

## Onboarding checklist

Copy this checklist into your new repo's `RELEASING.md` or tracking issue and tick off
items as you complete them.

```markdown
## New consumer onboarding checklist

- [ ] Created the new repo under the `chamber-19` org
- [ ] Granted repo access to `@chamber-19/desktop-toolkit` package
      (Manage Actions access → https://github.com/orgs/chamber-19/packages/npm/desktop-toolkit/settings)
- [ ] Committed `frontend/.npmrc` with the registry + token template
- [ ] Added `@chamber-19/desktop-toolkit@^2.3.1` to `frontend/package.json` dependencies
- [ ] Added `"prebuild": "desktop-toolkit-sync-installer-assets"` to `frontend/package.json` scripts
- [ ] Added `"desktop-toolkit-updater.exe"` to `bundle.resources` in `frontend/src-tauri/tauri.conf.json`
- [ ] Confirmed main window config has `"visible": false` and `"backgroundColor": "#1C1B19"` in `tauri.conf.json`
- [ ] Added `showOnReady()` call to `frontend/src/main.jsx` (see [Window flash prevention](#window-flash-prevention))
- [ ] Pinned `desktop-toolkit` git tag in `frontend/src-tauri/Cargo.toml`
- [ ] (If using Python) Added `chamber19-desktop-toolkit @ git+…@v2.3.1` to `backend/requirements.txt`
- [ ] Added `.github/workflows/release.yml` with the preflight step + `GITHUB_TOKEN` auth
- [ ] Added `permissions: { contents: write, packages: read }` to the release job
- [ ] Added `.github/workflows/copilot-setup-steps.yml` (optional, for Copilot coding agent)
- [ ] Created a local `read:packages` PAT and set `NODE_AUTH_TOKEN`
- [ ] Verified `npm install` succeeds locally (`cd frontend && npm install && npm ls @chamber-19/desktop-toolkit`)
- [ ] Built and tested the NSIS installer locally (`cd frontend && npm run tauri build`)
- [ ] Verified `desktop-toolkit-updater.exe` appears under `<INSTDIR>\resources\` after install
- [ ] Pushed first `v0.1.0` tag and confirmed the Release workflow produced the installer + `latest.json`
```
