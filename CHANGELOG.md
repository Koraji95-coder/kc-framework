# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Shared JS theme system for consumer apps in `js/packages/desktop-toolkit/src/theme/`:
  - `@chamber-19/desktop-toolkit/theme` export with preset palette registry, theme state load/save helpers, CSS variable application, and palette-to-theme resolution helpers
  - `ToolkitThemeControls` component for palette selection + custom color overrides
  - `ToolkitThemeProvider` and `useToolkitThemeState` hook for app-level theme orchestration
  - Standalone living preview document at `docs/theme-system-preview.html` for palette iteration — mirrors `TOOLKIT_PALETTES` in self-contained HTML/JS, demonstrates the canonical L-shape app shell with sidebar + topbar + sticky-chrome scaffold and a bottom-pinned profile slot
  - **Edge-melt engine promoted into the theme module** (completes the three-stage merge plan originally documented in the standalone `ch19-ui-transition-engine/`):
    - New `resolveEdgeMeltVariables(colors, options)` function in `themeSystem.js` derives the bridge gradient, topbar inner-glow stroke, triple-junction corner anchor, and active sidebar-item bleed algorithmically from the resolved palette. Output is a set of `--ch-bridge-*`, `--ch-topbar-inner-glow`, `--ch-corner-anchor`, `--ch-active-*`, `--ch-active-bleed`, and `--ch-edge-width` CSS variables.
    - `applyToolkitThemeVariables()` now applies these edge-melt variables alongside the base palette so consumer apps inherit the soft chrome/surface transitions for free. Palette swaps re-derive the gradients automatically.
    - Token namespace unified — promotion drops the engine's parallel `--ch19-*` prefix in favor of the toolkit's canonical `--ch-*` contract. No separate provider, no separate API surface.
    - Scaffold preview wired to use the new edge-melt variables: 2px bridge between sidebar and workspace, radial corner anchor at the triple-junction, accent-tinted inner-glow on the topbar, active-item bleed extending past the sidebar's right edge into the workspace.
- **`@chamber-19/stylelint-config`** — new shared stylelint config package at
  `js/packages/stylelint-config-chamber19/`. Enforces the CSS_DISCIPLINE.md
  rules across consumer apps and the toolkit itself. Every error message
  references `chamber-19/.github → docs/skills/CSS_DISCIPLINE.md` so authors
  and AI agents have a clear path back to the canonical rule. Rules:
  - `color-no-hex` — direct hex colors disallowed outside token files
  - `declaration-no-important` — `!important` disallowed
  - `selector-max-type: 0` — naked element selectors disallowed in component CSS
  - `selector-class-pattern` — kebab-case (BEM modifiers allowed)
  - `custom-property-pattern` — `--ch-*` / `--component-name` / `--_internal`
  - Plus all `stylelint-config-standard` rules
  - Per-file overrides exempt `_tokens.css`, `_theme.override.css`, `_reset.css`,
    and the toolkit's in-flight token-extraction CSS (splash, ReleaseNotes,
    UpdateModal, activation, updater) — exemptions removed once those sweeps complete.
- Toolkit's own `js/packages/desktop-toolkit/.stylelintrc.json` extends the new
  config so toolkit CSS is checked first. New `lint:css` / `lint:css:fix`
  scripts at both the package and monorepo-root levels. Devdeps added:
  `stylelint`, `stylelint-config-standard`, and the local workspace config.

- **Activation service** (Python FastAPI in `python/chamber19_desktop_toolkit/activation.py`):
  - Office IP gating for PIN requests
  - Single-use PIN generation and validation
  - Hardware fingerprinting (hostname + Windows SID + MAC) with SHA256 hashing
  - HMAC-SHA256 token signing for offline validation
  - Token expiry (14-day default) with forced revalidation
  - Machine revocation (admin) capability
  - Audit logging of all activation attempts
  - Endpoints:
    - `POST /enrollment/request-pin` — request PIN (office IP only)
    - `POST /enrollment/activate` — activate with PIN + hardware
    - `POST /activation/validate-token` — validate token on app startup
    - `POST /admin/revoke-machine` — revoke machine (admin)
    - `GET /admin/audit-log` — view audit trail (admin)

### Changed

- Activation gate, updater progress window, and update modal styles now read shared CSS theme tokens (`--ch-*`) with fallbacks so consuming apps can override enforced one-color styling safely.

- `launcher` now depends on activation service for PIN/hardware/token logic
- Consumer apps (`transmittal-builder`, etc.) no longer embed activation; they
  call toolkit activation service via HTTP from launcher

## [2.3.2] — 2026-05-08

### Notes

- **Re-publish of v2.3.1 content.** The `v2.3.1` tag was mistakenly pushed
  to the pre-version-bump commit (`7456b43`), where `package.json` still read
  `2.3.0`. The publish workflow's version-match guard aborted before the npm
  package was uploaded or a GitHub Release was created. No API or behavior
  changes relative to the v2.3.1 changelog entry — this patch simply ensures
  the npm package and GitHub Release exist for the `ActivationGate` / PIN
  activation system introduced in v2.3.0.

- **Spurious `v6.2.2` tag** is present in this repository but belongs to
  `chamber-19/transmittal-builder`. It was accidentally pushed here on
  2026-04-21, points to a commit with no corresponding changelog entry, and
  has no GitHub Release. It cannot be removed via the publish workflow; a
  repository maintainer must delete it manually from the GitHub UI or via the
  API (`DELETE /repos/chamber-19/desktop-toolkit/git/refs/tags/v6.2.2`).

## [2.3.1] — 2026-05-06

### Fixed

- **`ActivationGate` race condition:** on already-activated machines the
  component briefly flashed the full-screen PIN form before the activation
  check completed. The blank loading screen is now shown while `checking` is
  `true`, preventing any visible PIN-form flash. `recheck` is also now
  forwarded from `useActivation` so callers (settings panels, etc.) can
  trigger a re-check after external state changes.

### Changed

- Pinned `softprops/action-gh-release` to `v3.0.0` (Node 24 runtime) in
  `publish.yml`, `tauri-release.yml`, and the consumer-facing
  `release-tauri-sidecar-app.yml.template`. Replaces the floating `@v3` tag
  and upgrades `publish.yml` from `v2.0.9`.
- Bumped `windows-sys` from `0.59` to `0.61` in `desktop-toolkit-updater`.

## [2.3.0] — 2026-04-25

### Changed

- Update modal now renders release notes as formatted markdown (headers,
  bullets, links) instead of plain text showing raw markdown syntax. A new
  `ReleaseNotes` component (`@chamber-19/desktop-toolkit/components/ReleaseNotes`)
  handles parsing via `marked` and sanitization via `DOMPurify`. Headings use
  Instrument Serif (h1/h2) and DM Sans (h3+); links use copper `#C4884D`;
  background is transparent to inherit the modal/progress-window bg. Graceful
  degradation: empty or unparseable notes render nothing.

- Update modal now shows multi-phase progress (checking → downloading →
  verifying → installing → launching) with a status message and progress
  indicator for each phase. Errors surface the failing phase clearly with
  a link to the updater log. Download progress uses real byte counts from
  the shared-drive copy — not a time-based estimate.

- Main window now uses `visible: false` by default and is revealed only after
  the React root has rendered its first frame. Window background color set to
  `#1C1B19` to match the design system, preventing a white flash in the brief
  moment before JS takes over. Consumer apps must call the new `showOnReady()`
  helper (or `useShowOnReady` hook) from their frontend entry point — see
  `docs/CONSUMING.md` § "Window flash prevention" for the migration pattern.
  Without this call the main window will remain invisible after upgrading.

### Added

- `@chamber-19/desktop-toolkit/window/showOnReady` export: two helpers that
  reveal the Tauri main window after the first React paint.
  - `showOnReady()` — imperative; call after `createRoot().render()`.
  - `useShowOnReady()` — React hook; call at the root of your component tree.
  Both are no-ops outside a Tauri context (e.g. Vite dev in a browser).

- Machine-bound PIN activation system: Rust backend (`toolkit_check_activation`,
  `toolkit_activation_status`, `toolkit_activate_with_pin`, `toolkit_deactivate`
  Tauri commands) that verifies a signed token is bound to the current machine.
  Token stores licensee name, expiry, and an HMAC over the machine fingerprint.

- `ActivationGate` component (`@chamber-19/desktop-toolkit/activation`): full-screen
  PIN entry gate that wraps the app root. Shows a PIN form on unactivated machines,
  renders children once activation succeeds, and surfaces an expiry-warning banner
  within 5 days of token expiry.

- `useActivation` hook (`@chamber-19/desktop-toolkit/activation/hook`): exposes
  `{ activated, checking, warning, daysRemaining, result, activate, deactivate, recheck }`
  for use in settings panels or anywhere that needs to read or change activation state.

- `scripts/generate_key.py`: administrator utility for generating signed activation
  PINs for a named licensee with a configurable expiry date.

## [2.2.8] — 2026-04-24

### Changed

- Publish workflow now automatically creates a GitHub Release page entry
  when a version tag is pushed, with auto-generated release notes listing
  merged PRs between tags. Previously Release page entries had to be
  created manually after each tag push.

### Fixed

- **Installer/uninstaller title bar previously rendered as " — Setup" (blank app
  name).** `hooks.nsh` used `Caption "${PRODUCTNAME} — Setup"` and
  `UninstallCaption "${PRODUCTNAME} — Uninstaller"`, but Tauri's NSIS template
  `!include`s `hooks.nsh` before emitting `!define PRODUCTNAME`, so
  `${PRODUCTNAME}` expanded to the empty string at include time. Fixed by
  replacing both with the runtime `$(^Name)` token, which NSIS resolves from the
  later `Name "${PRODUCTNAME}"` statement at install-time. Originally surfaced and
  patched downstream in `chamber-19/transmittal-builder` v6.2.4 — absorbed
  upstream so consumers no longer need a local `hooks.nsh` override for this.
  (Cross-reference: chamber-19/transmittal-builder#103.)

- **`NSIS_HOOK_POSTINSTALL` comment now definitively documents that no consumer
  action is required.** The previous comment described the v2.2.4 → v2.2.5
  migration context but left open whether a `CopyFiles` workaround was still
  needed. Investigation of `crates/desktop-toolkit/src/updater.rs` confirms the
  shim is resolved via `app.path().resource_dir().join("desktop-toolkit-updater.exe")`
  (i.e. `<INSTDIR>\resources\desktop-toolkit-updater.exe`) — exactly where Tauri
  places it via `bundle.resources`. No `CopyFiles` or manual promotion to
  `$INSTDIR` is needed.

## [2.2.7] — 2026-04-24

### Fixed

- Updater shim now passes the correct silent-install flag to NSIS (`/S` instead
  of the invalid `/PASSIVE`). Previously, updates silently failed because NSIS
  does not recognize the Windows Installer `/PASSIVE` flag and would either
  bail out or fall back to interactive mode.
- `hooks.nsh` no longer kills `desktop-toolkit-updater.exe` during
  `NSIS_HOOK_PREINSTALL`. The shim is the process running the installer and
  waiting on its completion — killing it mid-install orphaned the update flow
  and prevented the post-install relaunch.
- Shim now verifies the installed binary exists at the expected path before
  attempting relaunch, and surfaces a Windows error dialog if any step of the
  update flow fails, so failures are no longer silent.
- `taskkill` spawned from the shim now uses `CREATE_NO_WINDOW` to suppress
  the brief console flash users previously saw during updates.

## [2.2.6] — 2026-04-22

### Fixed

- **Updater shim lookup now matches the documented `bundle.resources` contract.**
  The Rust framework crate and the Tauri template now look for
  `desktop-toolkit-updater.exe` under the Tauri resources directory first,
  with a compatibility fallback to the app exe directory for older installs
  that still promote the shim into `<INSTDIR>`.

- **Release workflow no longer risks uploading a stale cached installer.**
  The workflow template and consumer docs now delete cached
  `target/release/bundle/nsis` outputs before `tauri build` and select the
  installer whose filename matches the current tag version, instead of
  blindly taking the first `*.exe` match from a cache-restored directory.

- **`publish-to-drive.ps1` now copies the installer named by `latest.json`.**
  The script no longer publishes the first downloaded `*.exe`; it parses the
  release manifest and verifies that the expected installer asset is present
  before copying anything to the shared drive.

## [2.2.5] — 2026-04-21

### Added

- **`docs/CONSUMING.md`** — Full consumer onboarding guide covering: npm registry auth
  and GitHub Packages access grants, file templates (`.npmrc`, `package.json`,
  `tauri.conf.json`, `Cargo.toml`, `requirements.txt`, `hooks.nsh`), complete
  `release.yml` and `copilot-setup-steps.yml` workflow templates, local PAT setup,
  updater shim Rust path resolution, versioning policy, troubleshooting table, and
  a copy-paste bootstrap checklist. Lets a new maintainer spin up a consumer tool
  end-to-end without reading existing consumer source code.

- **`README.md`** — New "For consumers" section at the top pointing to
  `docs/CONSUMING.md`; cross-reference added to the existing "How tools consume this
  framework" section.

- **CI: `hooks-nsh-in-sync` job** — New CI job that diffs
  `installer/nsis/hooks.nsh` against `js/packages/desktop-toolkit/installer/nsis/hooks.nsh`
  and fails if they diverge, preventing the two copies from drifting out of sync again.

### Fixed

- **NSIS `File` directive fails outside `Section` context.** `installer/nsis/hooks.nsh`
  no longer uses a `File` directive inside `NSIS_HOOK_POSTINSTALL`. Tauri 2's NSIS
  template invokes hooks from a `Function`, not a `Section`, so the `File` directive
  produced `Error: command File not valid outside Section or Function` on line 113.
  The shim is now distributed exclusively via `bundle.resources` in `tauri.conf.json`.

- **Inner `js/packages/desktop-toolkit/installer/nsis/hooks.nsh` now matches the root
  copy.** PR #23 fixed the root `installer/nsis/hooks.nsh` but forgot to apply the
  identical fix to the inner copy that gets published to GitHub Packages. Both files
  now contain the empty `NSIS_HOOK_POSTINSTALL` macro and are byte-for-byte identical.

- **All four version manifests bumped to `2.2.5`.** PR #23 forgot to bump
  `js/packages/desktop-toolkit/package.json`, `python/pyproject.toml`,
  `crates/desktop-toolkit/Cargo.toml`, and `crates/desktop-toolkit-updater/Cargo.toml`
  from `2.2.4`, causing the publish workflow's version-match guard to fail.

### Migration from v2.2.4

- Add `"desktop-toolkit-updater.exe"` to `bundle.resources` in your
  `frontend/src-tauri/tauri.conf.json`.

- Update the shim path resolution in Rust from `app_exe_dir.join("desktop-toolkit-updater.exe")`
  to `app.path().resource_dir()?.join("desktop-toolkit-updater.exe")`.

- Bump your npm pin to `^2.2.5`, Cargo tag to `v2.2.5`, and pip tag to `v2.2.5`.

## [2.2.4] — 2026-04-20

### Fixed

- **NSIS installer shows literal `${PRODUCT_NAME}` in wizard UI.** Caught
  during Transmittal Builder v6.2.1 E2E testing: the installer's title
  bar read `${PRODUCT_NAME} — Setup` and the welcome page read
  "Welcome to the ${PRODUCT_NAME} Setup" because consumers are expected
  to sed-substitute the placeholder before `tauri build` — and TB (and
  likely other future consumers) forgot.

  **Permanent fix:** `installer/nsis/hooks.nsh` now uses only macros
  that Tauri injects automatically into the NSIS context:

  - `${PRODUCT_NAME}` → `${PRODUCTNAME}` (Tauri-provided)
  - `${TOOL_SIDECAR_NAME}.exe` taskkill entry removed — child sidecars
    are reaped automatically by the OS when the parent Tauri process
    exits. Consumers that spawn detached sidecars should override the
    file locally (documented inline).
  - Main-exe taskkill switched from `${PRODUCT_NAME}.exe` to
    `${MAINBINARYNAME}.exe` (Tauri-provided).

  No consumer substitution is required. Point `installerHooks` at the
  file and it Just Works.

### Migration

- Consumer tools (TB v6.2.x, future Drawing List Manager, etc.) should
  bump their DTK pin to v2.2.4 and rebuild their installer. No code or
  config changes required on the consumer side — the hooks file is now
  fully self-contained.

- Consumers that were manually sed-substituting `${PRODUCT_NAME}` in
  their CI should DELETE that step (it's a no-op now but leaves no harm).

### Notes

- No API changes. Pure NSIS template fix.

- This is the reason TB v6.2.1 needs to be rebuilt as v6.2.2.

## [2.2.3] — 2026-04-20

### Fixed

- **`tauri-template-render` CI now passes through `tauri::generate_context!`.**
  The 1×1 PNG stubs added in v2.2.1 were RGB (3-channel), but Tauri's
  icon validator requires RGBA (4-channel) and proc-macro-panics at
  compile time otherwise:
  > `icon /tmp/.../icons/32x32.png is not RGBA`
  > CI now generates icon stubs via ImageMagick with the `PNG32:` prefix
  > (which forces RGBA output), and asserts the channel count via
  > `identify` before `cargo check` runs.

### Notes

- v2.2.1 and v2.2.2 are both phantom versions: merged to main but never
  tagged because each one revealed a different downstream CI failure.
  v2.2.3 is the first release after v2.2.0 that should ship cleanly
  through CI.

- No public API changes. v2.2.0 consumers (TB v6.2.1) require no action.

## [2.2.2] — 2026-04-20

### Fixed

- **Chicken-and-egg bug in `tauri-template-render` CI** that blocked
  v2.2.1 from being tagged. The template's `Cargo.toml.template` pinned
  `desktop-toolkit = { git = "...", tag = "v2.2.1" }` — a tag that did
  not exist when CI ran (because tagging happens AFTER CI passes on main).
  CI now sed-replaces the template's `desktop-toolkit` dep to a `path = ...`
  dependency pointing at the in-repo crate, so the smoke-test build
  validates the CURRENT code regardless of which tag the template pins.

- **Reverted template's `Cargo.toml.template` self-reference tag** from
  `v2.2.1` (never published) back to `v2.2.0` (published and live on
  Packages). New convention: the template always pins to the most recent
  PUBLISHED tag, one release behind `main`. Documented inline.

### Notes

- v2.2.1 is a phantom version: merged to main but never tagged. v2.2.2
  is the first release after v2.2.0 that ships cleanly through CI.

- No public API changes. v2.2.0 consumers (TB v6.2.1) require no action.

## [2.2.1] — 2026-04-20

### Fixed

- **`tauri-template-render` CI job** now passes end-to-end. Two
  pre-existing scaffolding gaps were exposed once the v2.2.0
  `bundle.resources` glob fix let CI progress further into `cargo check`:
  - Added `semver = "1"` to `tauri-template/src-tauri-base/Cargo.toml.template`
    `[dependencies]` (template's `src/updater.rs` already imports it via
    `use semver::Version;` on line 25).
  - CI now generates 1×1 stub `.png` and `.ico` files in the staging
    `icons/` directory and touches the `installer/nsis-*.bmp` and
    `installer/hooks.nsh` files so `cargo check` validates all paths
    declared in `tauri.conf.json.template`.

### Changed

- Bumped the template's self-reference `desktop-toolkit` tag from
  `v2.1.0` to `v2.2.1` so newly-scaffolded consumers pin to the current
  framework release.

### Notes

- No public API changes. v2.2.0 consumers (including TB v6.2.1) require
  no action — this is a template/CI-only hotfix.

## [2.2.0] — 2026-04-20

### Added

- **Named exports for splash and updater entries.** Consumers can now do
  `import { Splash, SplashApp, mountSplash } from "@chamber-19/desktop-toolkit/splash"`
  and `import { Updater, mountUpdater } from "@chamber-19/desktop-toolkit/updater"`
  for full control over mount target and StrictMode wrapping.

- **`mountSplash(rootElement?)` and `mountUpdater(rootElement?)`** helper
  functions for imperative mounting against a custom root element.

- **`lockfile-integrity-guard` CI job** as a documented pattern for
  detecting corrupted `package-lock.json` integrity hashes (the failure mode
  that bit consumers twice during the v2.1.x rollout).

### Changed

- The auto-mount block at the bottom of `splash/index.jsx` and
  `updater/index.jsx` now calls the new `mountSplash()` / `mountUpdater()`
  helpers internally. Behavior is unchanged for consumers using the
  side-effect import pattern (`import "@chamber-19/desktop-toolkit/splash"`).

### Fixed

- **`tauri-template-render` CI job** now creates BOTH the `externalBin`
  binary stub AND a `binaries/<sidecar>/` directory with a `.gitkeep` file,
  satisfying the `bundle.resources` directory glob in the Tauri template's
  `tauri.conf.json`. This was the root cause of every failed
  `tauri-template-render` run since the v2.1.0 consolidation.

### Notes

- No breaking changes. v2.1.x consumers continue to work unchanged.

- The pypdf>=6.10.2,<7 constraint from v2.1.3 is preserved.

## [2.1.3] — 2026-04-20

### Security

- Bumped `pypdf` from `>=4,<5` to `>=6.10.2,<7` to remediate ~20 open
  CVE/advisory entries affecting consumers, including:
  - Multiple FlateDecode/LZWDecode/ASCIIHexDecode/RunLengthDecode
    RAM-exhaustion vulnerabilities
  - Multiple infinite-loop vulnerabilities in TreeObject, outlines,
    DCT inline images, circular /Prev xrefs, and DictionaryObject recovery
  - Long-runtime issues in malformed startxref, wrong /Size, /ToUnicode
    streams, and incremental mode
  - XMP metadata entity declarations RAM exhaustion
  - Stream /Length RAM exhaustion (CVE-2026-31826)

- No source-code changes required; pypdf 4 → 6 APIs used by
  `chamber19_desktop_toolkit.utils.pdf_merge` are stable.

## [2.1.0] — 2026-04-20

### Added

- **`crates/desktop-toolkit/`** — Published Rust library crate consumable via
  `cargo add` or git-URL pinning. Lifts `splash.rs`, `updater.rs`,
  `sidecar.rs`, and `log.rs` from the v2.0.0 scaffolding template into a
  proper crate. All tool-specific values (`sidecar_name`, `app_identifier`,
  `current_version`, `log_dir`) are accepted at runtime; no `${TOOL_*}`
  placeholders remain in the published crate.

- **`crates/desktop-toolkit-updater/`** — Separate updater shim binary
  (`desktop-toolkit-updater.exe`) that handles the entire upgrade flow as an
  independent process. Accepts `--installer`, `--installed-app-exe`,
  `--version`, and `--sidecar-name` CLI args; kills the sidecar, waits on the
  NSIS installer, and relaunches the new app version. Ships as part of the
  Cargo workspace so consumers can build it locally or consume a pre-built
  artifact from CI.

- **`build-scripts/sync-installer-assets.mjs`** — Node script that copies the
  framework's NSIS assets (`hooks.nsh`, `nsis-header.*`, `nsis-sidebar.*`)
  into the consumer's `frontend/src-tauri/installer/` directory at build time.
  Invokable as `desktop-toolkit-sync-installer-assets` when the package is
  installed (wired via the `bin` field in `package.json`).

- **`Cargo.toml`** (workspace root) — Cargo workspace declaring both framework
  crates; enables `cargo check` across the whole repo.

- Python package now declares version `2.1.0` for consistency with the JS and
  Rust releases.

### Fixed

- **Critical — auto-updater no longer fails silently.** The v2.0.0 design
  blocked the parent process on `child.wait()` while the NSIS installer tried
  to replace the parent's own `.exe`. NSIS cannot replace a locked file, so
  the install silently failed: the progress window appeared, status messages
  cycled, the app died from the NSIS `taskkill` hook, and the version never
  changed. v2.1.0 delegates the entire upgrade flow to the separate
  `desktop-toolkit-updater.exe` shim. The parent app copies the installer to
  `%TEMP%`, spawns the shim as `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`,
  and immediately calls `app.exit(0)` to release all file locks. The shim
  survives the parent's exit, waits on NSIS, and relaunches the new version.

- `start_update` in `tauri-template/src-tauri-base/src/lib.rs` no longer calls
  `child.wait()` or `taskkill` on the sidecar from the parent process — both
  responsibilities are delegated to the shim.

- `installer/nsis/hooks.nsh` `_KillAppProcesses` macro now also kills
  `desktop-toolkit-updater.exe` defensively during pre-install.

- `NSIS_HOOK_POSTINSTALL` now includes the `File` directive that bundles
  `desktop-toolkit-updater.exe` into `${INSTDIR}` alongside the main app exe.

### Changed

- `js/packages/desktop-toolkit/package.json` — version bumped to `2.1.0`;
  added `bin` entry exposing `desktop-toolkit-sync-installer-assets`; added
  `build-scripts` and `installer` to the `files` list so they are included
  in the published package.

- `tauri-template/src-tauri-base/Cargo.toml.template` — replaced the inline
  `semver = "1"` dependency with
  `desktop-toolkit = { git = "...", tag = "v2.1.0" }` so new tool scaffolds
  reference the published crate rather than embedding their own Rust source.

- `python/pyproject.toml` — version bumped to `2.1.0`.

### Migration from v2.0.0

Consumers (e.g. Transmittal Builder) should:

1. **Rust** — Add to `Cargo.toml`:

   ```toml
   desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.1.0" }
   ```

   Replace any `// SYNCED FROM desktop-toolkit v2.0.0` local Rust modules
   (`splash.rs`, `updater.rs`, `sidecar.rs`) with imports:

   ```rust
   use desktop_toolkit::{splash, updater, sidecar};
   ```

2. **`start_update` command** — Update to use the new shim-aware signature:

   ```rust
   #[tauri::command]
   pub fn start_update(
       app: tauri::AppHandle,
       state: tauri::State<desktop_toolkit::updater::UpdateState>,
   ) {
       desktop_toolkit::updater::start_update(app, state, "my-sidecar-name", "my-tool");
   }
   ```

3. **NSIS / installer assets** — Add `desktop-toolkit-sync-installer-assets`
   to the `prebuild` npm script. Add synced files to `.gitignore`. Ensure
   CI builds `desktop-toolkit-updater.exe` and places it in
   `frontend/src-tauri/` before running `tauri build`.

4. **Python** — Switch from local `pdf_merge` / `email_sender` imports to:

   ```python
   from chamber19_desktop_toolkit.utils import pdf_merge, email_sender
   ```

---

## [2.0.0] — 2026-04-20

> ⚠️ **The auto-updater is known broken at the architectural level.** The parent
> process blocks on the NSIS installer that needs to replace the parent's own
> exe. This will be fixed in a follow-up v2.1.0 PR. **Do not consume v2.0.0 in
> production until v2.1.0 ships with the architectural fix.**

### Added

- `js/packages/desktop-toolkit/src/components/UpdateModal/UpdateModal.jsx` +
  `UpdateModal.css` — Mandatory, non-dismissible force-update confirmation modal.
  Rendered by the updater window as its initial state; exported as
  `@chamber-19/desktop-toolkit/components/UpdateModal` for consumers that need
  to embed it elsewhere.

- `start_update` Tauri command in `tauri-template/src-tauri-base/src/lib.rs` —
  Invoked by the `UpdateModal` when the user clicks **Install Now**.
  Sidekill-only behavior: kills the sidecar by image name, spawns the NSIS
  installer DETACHED, then calls `app.exit(0)`. Does **not** taskkill the main
  app process (no self-taskkill regression from v6.1.5 fix).

- `UpdateState` Tauri managed state — holds the pending `LatestJson` and
  `update_path` so `start_update` can retrieve the installer after startup.

- `SIDECAR_NAME` constant in `lib.rs` (placeholder: `${TOOL_SIDECAR_NAME}`) —
  consumers replace before building; used by `find_sidecar_path` and
  `start_update`'s taskkill call.

- NSIS pre-install and pre-uninstall taskkill hooks in
  `installer/nsis/hooks.nsh` — terminates the running app and sidecar before
  the installer overwrites binaries, preventing "file in use" install failures.

- `update_status` Tauri event emitted by `start_update` — drives the status
  message display in the updater progress window.

### Changed

- `updater/index.jsx` — now shows `UpdateModal` as its initial state when
  `update_info` arrives; transitions to the branded progress view after the user
  confirms. Listens for `update_status` events for human-readable status text
  (e.g. "Stopping background services…", "Installing version X…").

- `startup_sequence` in `lib.rs` — on `UpdateAvailable`, stores the update info
  in `UpdateState` and shows the updater window, but no longer auto-copies and
  auto-launches the installer; the user must confirm via the `UpdateModal`.

- `installer/nsis/hooks.nsh` — added `${TOOL_SIDECAR_NAME}` placeholder and
  instructions; PREINSTALL / PREUNINSTALL macros now contain real taskkill logic.

- `js/packages/desktop-toolkit/package.json` — version bumped to `2.0.0`;
  added `./components/UpdateModal` export entry.

- `python/pyproject.toml` — version bumped to `2.0.0` for consistency.

### [Unreleased] items from v1.1.0 now released

## [1.1.0] — 2026-04-18

### Changed

- Renamed Python distribution `kc-framework` → `chamber19-desktop-toolkit`.

- Renamed Python import namespace `kc_framework` → `chamber19_desktop_toolkit` (source directory `python/kc_framework/` → `python/chamber19_desktop_toolkit/`).

- Renamed npm package `@koraji95-coder/kc-framework` → `@chamber-19/desktop-toolkit` (source directory `js/packages/kc-framework/` → `js/packages/desktop-toolkit/`).

- Added `publishConfig`, `repository`, `bugs`, and `homepage` fields to JS `package.json` in preparation for GitHub Packages publishing.

### Added

- `.github/workflows/publish.yml` — publishes `@chamber-19/desktop-toolkit` to GitHub Packages on strict semver tags (`v[0-9]+.[0-9]+.[0-9]+`); includes a version-match guard that aborts if the tag doesn't match `package.json`.

- `fresh-consumer-install` CI job — on tag pushes, installs the just-published package into a clean temporary project and verifies every declared export resolves; catches publish-ordering bugs like the v1.0.1 export-map issue.

### Notes

- Repo transfer from `Koraji95-coder/kc-framework` to `chamber-19/desktop-toolkit` completed as Phase 3 (manual step). `GITHUB_TOKEN` in this repo can now natively publish to the `@chamber-19` npm scope on GitHub Packages.

## [1.0.1] — 2026-04-18

### Fixed

- `python/pyproject.toml` now declares the runtime dependency `pypdf>=4,<5` so that `pip install kc-framework` actually allows `import kc_framework.utils.pdf_merge` to succeed.

- `js/packages/kc-framework/src/splash/index.jsx` import of `version.js` was rewritten to the correct relative path `../utils/version.js`.

- Added a root `package.json` declaring `js/packages/*` as npm workspaces so that consumers can install the JS package via `git+https://...#v1.0.1&path:js/packages/kc-framework` without npm silently mangling the install. Removes the need for downstream consumers to vendor the package.

## [1.0.0] — 2025-01-01

### Added

- Initial extraction from [Transmittal-Builder v5.0.0](https://github.com/Koraji95-coder/Transmittal-Builder/releases/tag/v5.0.0).

#### Python (`kc_framework`)

- `utils/pdf_merge.py` — PDF generation pipeline: DOCX→PDF conversion (Word/LibreOffice) + multi-PDF merge.

- `utils/email_sender.py` — Generic SMTP email helper with attachment support.

- `pyinstaller/sidecar.spec.template` — Reusable PyInstaller spec for FastAPI+uvicorn sidecars (placeholders: `${TOOL_NAME}`, `${TOOL_SPEC_NAME}`).

- `pyinstaller/requirements-build.txt` — PyInstaller ≥ 6.10 build dependency.

#### JavaScript (`@koraji95-coder/kc-framework`)

- `src/ipc/backend.js` — Runtime backend URL resolver (Tauri `get_backend_url` command wrapper with cache + refresh).

- `src/splash/index.jsx` — Forge-branded animated splash screen with terminal status lines, progress bar, and CSS forge animation.

- `src/splash/splash.css` — Full splash CSS (forge gradient, sprocket/hammer/spark keyframes, fade-out transition).

- `src/splash/assets/` — Forge SVG assets: `sprocket-hammer.svg`, `r3p-logo.svg`, `r3p-logo-transparent.svg`, `rust-logo.svg`, `tauri-logo.svg`.

- `src/updater/index.jsx` — Force-update progress window (Tauri event-driven, non-cancellable).

- `src/updater/updater.css` — Updater window styles (amber progress bar, warm gradient).

- `src/utils/version.js` — `APP_VERSION` constant sourced from Vite's `__APP_VERSION__` build-time injection.

#### Tauri scaffolding template

- `tauri-template/splash.html` + `updater.html` — Multi-page HTML entry points.

- `tauri-template/vite.config.js` — Multi-page Vite config with Tauri-specific overrides.

- `tauri-template/src-tauri-base/Cargo.toml.template` — Parameterised Cargo manifest (placeholders: `${TOOL_NAME}`, `${TOOL_VERSION}`, `${TOOL_DESCRIPTION}`, `${TOOL_AUTHORS}`).

- `tauri-template/src-tauri-base/tauri.conf.json.template` — Parameterised Tauri config (placeholders: `${TOOL_PRODUCT_NAME}`, `${TOOL_VERSION}`, `${TOOL_IDENTIFIER}`, `${TOOL_SIDECAR_NAME}`).

- `tauri-template/src-tauri-base/capabilities/default.json` — Default Tauri v2 capability set.

- `tauri-template/src-tauri-base/src/main.rs` — Tauri entry point (no-console subsystem).

- `tauri-template/src-tauri-base/src/lib.rs` — Full startup sequence: sidecar spawn, shared-drive check, update check, splash-to-main transition.

- `tauri-template/src-tauri-base/src/sidecar.rs` — PyInstaller sidecar spawner (port negotiation, no-window on Windows).

- `tauri-template/src-tauri-base/src/splash.rs` — Splash window management (first-run detection, status events, fade-complete handshake).

- `tauri-template/src-tauri-base/src/updater.rs` — Shared-drive update check + installer copy-with-progress.

- `tauri-template/icons/icon-master.svg` — Master SVG icon (Anvil-T monogram on forge background).

#### NSIS installer assets

- `installer/nsis/hooks.nsh` — Genericised NSIS hooks (placeholder: `${PRODUCT_NAME}`; see file header for sed/PowerShell substitution instructions).

- `installer/nsis/nsis-header.svg` + `nsis-header.bmp` — 150×57 NSIS installer header art.

- `installer/nsis/nsis-sidebar.svg` + `nsis-sidebar.bmp` — 164×314 NSIS installer sidebar art.

#### Build scripts

- `build-scripts/generate-icons.mjs` — Full icon pipeline: SVG → PNG (all Tauri + Windows Store sizes) + multi-resolution ICO + NSIS BMPs.

- `build-scripts/generate-latest-json.mjs` — Generates `latest.json` update manifest from `TAG_NAME` + `INSTALLER_NAME` env vars.

- `build-scripts/publish-to-drive.ps1` — Downloads a GitHub Release and publishes it to a configured shared drive path.

#### CI

- `.github/workflows/release-tauri-sidecar-app.yml.template` — GitHub Actions workflow template for Tauri + Python sidecar apps (placeholders: `${TOOL_DISPLAY_NAME}`, `${BACKEND_DIR}`, `${BACKEND_SPEC}`, `${SIDECAR_NAME}`, `${FRONTEND_DIR}`, `${INSTALLER_GLOB}`).

#### Documentation

- `README.md` — Repository layout, Python + JS consumption instructions, versioning policy.

- `CONTRIBUTING.md` — Development workflow, breaking-change policy, consumer bump process.

- `CHANGELOG.md` — This file.

- `LICENSE` — MIT.
