// crates/desktop-toolkit/src/splash.rs
//
// Splash screen integration for chamber-19 Tauri apps.
//
// Provides:
//   - `emit_status`                      — emit a terminal status line to the splash window.
//   - `close_splash`                     — close the splash window.
//   - `SplashState`                      — managed Tauri state for the first-run flag.
//   - `splash_is_first_run`              — Tauri command: returns true on first/post-update launch.
//   - `splash_ready`                     — Tauri command: called after first CSS paint.
//   - `splash_fade_complete`             — Tauri command: called after cross-fade finishes.
//   - `first_launch_after_update`        — reads/writes the splash-seen sentinel.
//
// All tool-specific values (app identifier, package name) are passed at runtime
// so this module can live in a shared library crate.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Status event types ────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum StatusKind {
    Pending,
    Ok,
    Warn,
    Error,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusPayload {
    pub phase: String,
    pub message: String,
    pub kind: StatusKind,
}

// ── Managed state ─────────────────────────────────────────────────────────

/// Shared state held in Tauri's managed-state map.
pub struct SplashState {
    pub is_first_run: Arc<AtomicBool>,
}

impl SplashState {
    pub fn new(is_first_run: bool) -> Self {
        Self {
            is_first_run: Arc::new(AtomicBool::new(is_first_run)),
        }
    }

    pub fn first_run(&self) -> bool {
        self.is_first_run.load(Ordering::SeqCst)
    }
}

// ── Sentinel JSON schema ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct SplashSeen {
    last_seen_version: String,
}

// ── First-launch-after-update logic ──────────────────────────────────────

/// Returns `true` if this is the first launch after an install or update.
///
/// Reads `%APPDATA%\<app_identifier>\splash-seen.json` (created on first
/// run) and compares the stored version against `current_version`.
/// If they differ (or the file is absent) it writes the current version back
/// and returns `true` so the full animation plays.
///
/// # Arguments
/// * `app_identifier` — directory name under `%APPDATA%`, e.g. `"my-tool"`.
/// * `current_version` — the running binary's version string, typically
///   `env!("CARGO_PKG_VERSION")` from the consumer's crate.
pub fn first_launch_after_update(app_identifier: &str, current_version: &str) -> bool {
    if let Ok(val) = std::env::var("SPLASH_FORCE_FRESH") {
        let v = val.to_ascii_lowercase();
        if v == "1" || v == "true" || v == "yes" {
            return true;
        }
    }

    let base_opt = {
        #[cfg(windows)]
        let v = std::env::var("APPDATA").ok();
        #[cfg(not(windows))]
        let v = std::env::var("HOME")
            .ok()
            .map(|h| format!("{h}/.local/share"));
        v
    };

    let base = match base_opt {
        Some(b) if !b.is_empty() => b,
        _ => return true,
    };

    let sentinel_path = std::path::PathBuf::from(base)
        .join(app_identifier)
        .join("splash-seen.json");

    let last_seen = sentinel_path
        .exists()
        .then(|| std::fs::read_to_string(&sentinel_path).ok())
        .flatten()
        .and_then(|s| serde_json::from_str::<SplashSeen>(&s).ok())
        .map(|ss| ss.last_seen_version);

    let is_new = last_seen.as_deref() != Some(current_version);

    if is_new {
        if let Some(parent) = sentinel_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let sentinel = SplashSeen {
            last_seen_version: current_version.to_string(),
        };
        if let Ok(json) = serde_json::to_string(&sentinel) {
            let _ = std::fs::write(&sentinel_path, json);
        }
    }

    is_new
}

// ── Tauri commands ────────────────────────────────────────────────────────

/// Returns `true` when the current launch is the first launch after an install
/// or update (i.e. the full animation should play).
#[tauri::command]
pub fn splash_is_first_run(state: tauri::State<SplashState>) -> bool {
    state.first_run()
}

/// Called by the splash frontend once the first CSS paint has completed.
#[tauri::command]
pub fn splash_ready(app: AppHandle) {
    if let Some(win) = app.get_webview_window("splash") {
        let _ = win.show();
    }
}

/// Called by the splash frontend after the cross-fade animation completes.
#[tauri::command]
pub fn splash_fade_complete(app: AppHandle) {
    let app_for_ui = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(main_win) = app_for_ui.get_webview_window("main") {
            let _ = main_win.show();
        }
        close_splash(&app_for_ui);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/// Emit a `splash://status` event to all windows (including the splash).
pub fn emit_status(app: &AppHandle, phase: &str, message: &str, kind: StatusKind) {
    let payload = StatusPayload {
        phase: phase.to_string(),
        message: message.to_string(),
        kind,
    };
    if let Err(e) = app.emit("splash://status", payload) {
        eprintln!("[splash] emit_status failed: {e}");
    }
}

/// Emit a Pending then Ok status for a step that completes synchronously.
///
/// Convenience wrapper that collapses the common consumer-side pattern:
///
/// ```ignore
/// splash::emit_status(&app, key, msg, splash::StatusKind::Pending);
/// splash::emit_status(&app, key, msg, splash::StatusKind::Ok);
/// ```
///
/// into a single call. Use this for informational steps where there is no
/// real work to perform between the Pending and Ok emissions (e.g. status
/// lines that are deferred to React, or no-op pre-checks).
pub fn emit_status_step(app: &AppHandle, phase: &str, message: &str) {
    emit_status(app, phase, message, StatusKind::Pending);
    emit_status(app, phase, message, StatusKind::Ok);
}

/// Close the splash window. Silently ignores errors (e.g. already closed).
pub fn close_splash(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("splash") {
        if let Err(e) = win.close() {
            eprintln!("[splash] close_splash failed: {e}");
        }
    }
}

/// Cross-fade from the splash to the main window.
///
/// Emits `splash://fade-now` so the splash JS holds the success state for
/// `fade_hold_ms`, then cross-fades the whole splash root to opacity 0 over
/// `fade_duration_ms`. The splash frontend invokes `splash_fade_complete`
/// from `transitionend`, which shows the main window and closes the splash
/// atomically.
///
/// As a safety net (in case the frontend never invokes the command -- e.g.
/// JS error, window minimised mid-fade), this function sleeps for the
/// expected hold + fade + safety duration and then performs the same
/// show / close from Rust. Both paths are idempotent.
///
/// **Must be called from a background thread** -- it blocks for
/// `fade_hold_ms + fade_duration_ms + fade_safety_ms` total.
pub fn transition_to_main_window(
    app: &AppHandle,
    fade_hold_ms: u64,
    fade_duration_ms: u64,
    fade_safety_ms: u64,
) {
    if let Err(e) = app.emit("splash://fade-now", ()) {
        eprintln!("[splash] emit splash://fade-now failed: {e}");
    }

    std::thread::sleep(std::time::Duration::from_millis(
        fade_hold_ms + fade_duration_ms + fade_safety_ms,
    ));

    let app_for_ui = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(main_win) = app_for_ui.get_webview_window("main") {
            let _ = main_win.show();
        }
        close_splash(&app_for_ui);
    });
}
