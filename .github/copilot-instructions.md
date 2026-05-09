# Copilot Instructions — Desktop Toolkit

> **Repo:** `chamber-19/desktop-toolkit`
> **Role:** Shared framework for Chamber 19 Tauri desktop apps.

Use Chamber 19 shared conventions as reference guidance, but this file is the
repo-specific source of truth.

## Current Shape

- Rust crates live under `crates/`.
- Published JS package lives under `js/packages/desktop-toolkit/`.
- Python package lives under `python/`.
- **Activation service** (`python/chamber19_desktop_toolkit/activation.py`) provides:
  - Office IP gating
  - PIN generation and validation
  - Hardware fingerprinting and token signing
  - Token expiry and revalidation
  - Audit logging
- Tauri consumer templates and release workflow templates live in this repo.

## Build And Test

```text
cargo check

cd js/packages/desktop-toolkit
npm install --no-save react react-dom @tauri-apps/api marked dompurify
npx --yes esbuild src/ipc/backend.js src/splash/index.jsx --bundle --external:react --external:react-dom --external:@tauri-apps/api --outdir=/tmp/dtk-check --format=esm --jsx=automatic --loader:.svg=text

cd python
pip install -e .
```

## Dependency Contract

- Version bumps must update JS, Rust, and Python package versions together.
- Refresh `Cargo.lock` with `cargo update -p desktop-toolkit -p desktop-toolkit-updater`.
- Do not disable CI guards that check template rendering, lockfile integrity,
  `hooks.nsh` sync, and package export resolution.

## Review-Critical Rules

- Changes to templates or release workflows are consumer-facing and require
  `docs/CONSUMING.md` updates.
- Activation service changes (schema, endpoints, security) require updates to
  docstrings and consumer docs (e.g., `launcher` README).
- NSIS hook changes must keep root and packaged copies byte-identical.
- User-facing API, installer, updater, template, or activation behavior changes
  require a `CHANGELOG.md` entry.

Path-specific rules live under `.github/instructions/`.
