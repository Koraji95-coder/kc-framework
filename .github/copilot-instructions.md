# Copilot Instructions — Desktop Toolkit

> **Repo:** `chamber-19/desktop-toolkit`
> **Role:** Shared framework for Chamber 19 Tauri desktop apps.
>
> **Source of Truth:** See [`chamber-19/.github`](https://github.com/chamber-19/.github) for:
> - Org-wide architecture and SKILLS
> - Hard architectural decisions (Tauri, Python, Rust constraints)
> - Family-wide conventions and AI agent guidance
>
> This file contains **repo-specific guidance only**. Repo-specific rules override
> org-wide rules on conflict.

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

## Markdown Formatting Standards

All markdown files in this repo **MUST** be formatted cleanly with no linter warnings:

- **Fenced code blocks** require language specifiers: ` ```python` (not ` ``` `)
- **Headings** must not be duplicated in the same document
- **Lists** must be surrounded by blank lines
- **Line length** should be kept reasonable (80-100 chars preferred, hard wrap at 120)
- Run linter before committing: `npm run lint:md` (if available) or use editor validation

Agent guidance: Any markdown file with linter warnings is treated as technical debt.
Format fixes are low-risk and required. Update all `.md` files before merging PRs.
For new markdown files, validate with editor linter before committing.

## SKILLS and Shared Resources

This repo draws on shared knowledge from [`chamber-19/.github`](https://github.com/chamber-19/.github):

- **SKILLS** — Reusable domain knowledge in `.github/` folder (Tauri, Python, Rust, Markdown, etc.)
- **`copilot-instructions.md`** — Org-wide baseline for all agents
- **Hard architectural decisions** — Closed decisions on Tauri, Python, AutoCAD patterns
- **Desktop app architecture** — Launcher + toolkit + backends model
- **Family conventions** — Shared practices across all repos

**When working in this repo:** Always check `.github` repo first for shared context,
then apply repo-specific rules from this file. Repo-specific rules override org-wide
rules on conflict.

---

Path-specific rules live under `.github/instructions/`.


<!-- Added by chamber-19-skill-sync — required skill references for this repo's stack -->
- Read [`docs/skills/PYTHON.md`](https://github.com/chamber-19/.github/blob/main/docs/skills/PYTHON.md) before any Python work.
- Read [`docs/skills/RUST.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/RUST.MD) before any Rust work.
- Read [`docs/skills/TAURI.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/TAURI.MD) before any Tauri work.
