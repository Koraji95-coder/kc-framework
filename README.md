# desktop-toolkit

Shared scaffolding for CHAMBER-19 desktop tools — extracted from
[Transmittal Builder v5.0.0](https://github.com/chamber-19/transmittal-builder/releases/tag/v5.0.0).

Contains UI primitives, Tauri sidecar boilerplate, NSIS installer assets, build scripts,
and CI templates consumed by **Transmittal-Builder**, **Drawing-List-Manager**, and future tools.

For the historical extraction inventory and migration plan see
[`docs/framework-extraction/`](https://github.com/chamber-19/transmittal-builder/tree/main/docs/framework-extraction).

---

## For consumers

Building a new tool on top of this framework? See **[docs/CONSUMING.md](./docs/CONSUMING.md)**
for the complete onboarding guide: npm registry auth, package access grants, file templates,
CI workflow setup, local PAT configuration, and a copy-paste-ready checklist.

---

## Repository layout

```text
desktop-toolkit/
├── python/
│   ├── pyproject.toml                 ← Python package manifest
│   └── chamber19_desktop_toolkit/
│       ├── __init__.py
│       ├── utils/
│       │   ├── pdf_merge.py           ← PDF generation + merge
│       │   └── email_sender.py        ← Generic SMTP helper
│       └── pyinstaller/
│           ├── sidecar.spec.template  ← PyInstaller spec template
│           └── requirements-build.txt
├── js/
│   └── packages/
│       └── desktop-toolkit/
│           ├── package.json           ← npm package manifest
│           └── src/
│               ├── ipc/
│               │   └── backend.js     ← Backend URL resolver
│               ├── splash/
│               │   ├── index.jsx      ← Forge-branded splash screen
│               │   ├── splash.css
│               │   └── assets/        ← Forge SVG assets
│               ├── updater/
│               │   ├── index.jsx      ← Force-update window
│               │   └── updater.css
│               └── utils/
│                   └── version.js     ← APP_VERSION constant
├── tauri-template/
│   ├── splash.html
│   ├── updater.html
│   ├── vite.config.js
│   ├── icons/
│   │   └── icon-master.svg
│   └── src-tauri-base/
│       ├── build.rs
│       ├── Cargo.toml.template        ← Parameterised Cargo manifest
│       ├── tauri.conf.json.template   ← Parameterised Tauri config
│       ├── capabilities/
│       │   └── default.json
│       └── src/
│           ├── main.rs
│           ├── lib.rs                 ← App startup sequence
│           ├── sidecar.rs             ← PyInstaller sidecar spawner
│           ├── splash.rs              ← Splash window management
│           └── updater.rs             ← Shared-drive update check
├── installer/
│   └── nsis/
│       ├── hooks.nsh                  ← Genericised NSIS hooks template
│       ├── nsis-header.svg / .bmp
│       └── nsis-sidebar.svg / .bmp
├── build-scripts/
│   ├── generate-icons.mjs             ← SVG → PNG/ICO/BMP pipeline
│   ├── generate-latest-json.mjs       ← Update manifest generator
│   └── publish-to-drive.ps1           ← Shared-drive publish script
└── .github/
    └── workflows/
        └── release-tauri-sidecar-app.yml.template
```

---

## How tools consume this framework

→ See [docs/CONSUMING.md](./docs/CONSUMING.md) for the full onboarding guide including
auth setup, file templates, CI workflow, and the complete bootstrap checklist.

### Python (`chamber19_desktop_toolkit`)

**pip (git dependency — pin exact tag):**

```toml
# In your tool's pyproject.toml or requirements.txt
chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@v2.3.1#subdirectory=python
```

**Usage:**

```python
from chamber19_desktop_toolkit.utils.pdf_merge import build_combined_pdf
from chamber19_desktop_toolkit.utils.email_sender import send_email
```

### JavaScript (`@chamber-19/desktop-toolkit`)

This package is published to GitHub Packages (not npmjs.com). You need a GitHub Personal Access Token with `read:packages` scope to install.

**One-time setup in your project:**

Create or update `.npmrc` in your project root:

```ini
@chamber-19:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

In CI, set `NODE_AUTH_TOKEN` from a secret instead.

**Install:**

```bash
npm install @chamber-19/desktop-toolkit
```

**Usage:**

```js
import { initBackendUrl, getBackendUrl } from "@chamber-19/desktop-toolkit/ipc";
import SplashApp from "@chamber-19/desktop-toolkit/splash";
import { APP_VERSION } from "@chamber-19/desktop-toolkit/utils/version";
```

---

## Versioning policy

This repo uses **SemVer** (`vMAJOR.MINOR.PATCH`).

- **JavaScript consumers** can pin `@chamber-19/desktop-toolkit` with `^x.y.z`
  because GitHub Packages publishes immutable versions.
- **Rust and Python consumers** should pin exact git tags (`vX.Y.Z`).
- A breaking API change requires a major version bump.
- The `v1.0.0` tag is cut manually after the initial extraction PR merges.

See [CHANGELOG.md](./CHANGELOG.md) for the full history.
