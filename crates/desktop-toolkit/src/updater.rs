// crates/desktop-toolkit/src/updater.rs
//
// Shared-drive update check, installer copy, and update-shim launch.
//
// On every launch (release builds only) the app:
//   1. Checks whether the shared drive path is reachable.
//   2. Reads `latest.json` from that path.
//   3. Compares the remote `version` field to the version baked into the binary.
//   4. Returns an `UpdateCheckResult` that the caller acts on.
//
// v2.1.0 change: `start_update` now delegates the entire upgrade flow to the
// separate `desktop-toolkit-updater.exe` shim process so the parent app can
// exit cleanly without holding a file lock on its own exe.

#![cfg_attr(debug_assertions, allow(dead_code))]

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use semver::Version;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

// ── Types ─────────────────────────────────────────────────────────────────

/// Contents of `latest.json` on the shared drive.
#[derive(Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct LatestJson {
    pub version: String,
    pub installer: String,
    pub notes: Option<String>,
    pub mandatory: Option<bool>,
}

/// Result of the update check.
pub enum UpdateCheckResult {
    /// Shared drive is not reachable (offline / VPN down).
    Offline { path: PathBuf },
    /// Installed version matches or exceeds the remote version.
    UpToDate,
    /// A newer version is available on the shared drive.
    UpdateAvailable {
        latest: LatestJson,
        update_path: PathBuf,
    },
}

/// Tauri managed state for pending update info.
///
/// Register with `.manage(UpdateState::new())` in the Tauri builder,
/// then include `tauri::State<UpdateState>` in the `start_update` command.
pub struct UpdateState {
    pub latest: std::sync::Mutex<Option<LatestJson>>,
    pub update_path: std::sync::Mutex<Option<PathBuf>>,
}

impl UpdateState {
    pub fn new() -> Self {
        Self {
            latest: std::sync::Mutex::new(None),
            update_path: std::sync::Mutex::new(None),
        }
    }
}

impl Default for UpdateState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Update path ───────────────────────────────────────────────────────────

/// Environment variable used to override the shared-drive update path.
pub const UPDATE_PATH_ENV_VAR: &str = "TOOL_UPDATE_PATH";

/// Return the configured update path from the env var.
pub fn get_update_path() -> PathBuf {
    std::env::var(UPDATE_PATH_ENV_VAR)
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            eprintln!("[updater] {UPDATE_PATH_ENV_VAR} is not set; update check will be offline");
            PathBuf::from("")
        })
}

/// Set the default update path env var if it is not already set in the
/// environment.
///
/// Must be called **before** `tauri::Builder::default()` -- this function
/// uses `std::env::set_var` which is `unsafe` in Rust 1.81+ when the program
/// is multi-threaded. Call this from `pub fn run()` before any tauri::Builder
/// invocation so the process is still single-threaded when the write happens.
///
/// Centralises the `unsafe` block so every consumer does not have to repeat
/// it. Honors any externally-set value: if the env var is already populated
/// (e.g. by an integration test or a launcher), this function is a no-op.
pub fn set_default_update_path(default_path: &str) {
    if std::env::var(UPDATE_PATH_ENV_VAR).is_ok() {
        return;
    }
    #[allow(unsafe_code)]
    // SAFETY: callers contract this function to run before any thread
    // creation (i.e. before tauri::Builder::default()), so std::env::set_var
    // is sound on Rust >= 1.81.
    unsafe {
        std::env::set_var(UPDATE_PATH_ENV_VAR, default_path);
    }
}

// ── Logging ───────────────────────────────────────────────────────────────

/// Write a timestamped log line to `%LOCALAPPDATA%\<log_dir>\updater.log`.
/// No-op in debug builds.
pub fn log_updater(log_dir: &str, msg: &str) {
    crate::log::log_to_file(log_dir, msg);
}

// ── Update check ──────────────────────────────────────────────────────────

/// Check whether an update is available.
///
/// # Arguments
/// * `current_version` — the running binary's semver string, typically
///   `env!("CARGO_PKG_VERSION")` from the consumer's crate.
/// * `log_dir` — directory name under `%LOCALAPPDATA%` for the log file.
pub fn check_for_update(current_version: &str, log_dir: &str) -> UpdateCheckResult {
    let update_path = get_update_path();
    log_updater(log_dir, &format!("Update path: {}", update_path.display()));

    if !update_path.exists() {
        log_updater(log_dir, "latest.json: path not reachable (offline)");
        return UpdateCheckResult::Offline { path: update_path };
    }

    let latest_json_path = update_path.join("latest.json");
    let content = match fs::read_to_string(&latest_json_path) {
        Ok(c) => c,
        Err(e) => {
            log_updater(log_dir, &format!("latest.json read error: {e}"));
            return UpdateCheckResult::Offline { path: update_path };
        }
    };
    log_updater(log_dir, "latest.json: read OK");

    let latest: LatestJson = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(e) => {
            log_updater(log_dir, &format!("latest.json parse error: {e}"));
            return UpdateCheckResult::UpToDate;
        }
    };

    let current = Version::parse(current_version).unwrap_or_else(|_| Version::new(0, 0, 0));
    let remote = match Version::parse(&latest.version) {
        Ok(v) => v,
        Err(e) => {
            log_updater(log_dir, &format!("Invalid version in latest.json: {e}"));
            return UpdateCheckResult::UpToDate;
        }
    };

    log_updater(
        log_dir,
        &format!(
            "Version check: installed={current_version}, remote={}",
            latest.version
        ),
    );

    if remote > current {
        log_updater(
            log_dir,
            &format!("Update available: {current_version} → {}", latest.version),
        );
        UpdateCheckResult::UpdateAvailable { latest, update_path }
    } else {
        log_updater(log_dir, &format!("Up to date ({current_version})"));
        UpdateCheckResult::UpToDate
    }
}

// ── Installer copy ────────────────────────────────────────────────────────

/// Copy the installer from the shared drive to `%TEMP%\<installer-name>`,
/// emitting `update_progress` events to the Tauri frontend as bytes are copied.
pub fn copy_installer_with_progress(
    update_path: &Path,
    installer_name: &str,
    log_dir: &str,
    app: &AppHandle,
) -> Result<PathBuf, String> {
    use std::time::Instant;

    let src = update_path.join(installer_name);
    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| String::from("C:\\Temp"));
    let dest = PathBuf::from(&temp_dir).join(installer_name);

    let total_bytes = fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
    log_updater(
        log_dir,
        &format!(
            "Copy: src={}, dest={}, total_bytes={total_bytes}",
            src.display(),
            dest.display(),
        ),
    );

    let mut reader = fs::File::open(&src)
        .map_err(|e| format!("Cannot open installer '{installer_name}': {e}"))?;
    let mut writer =
        fs::File::create(&dest).map_err(|e| format!("Cannot create '{dest:?}': {e}"))?;

    let mut buf = [0u8; 65_536];
    let mut copied: u64 = 0;
    let mut last_logged_pct: i64 = -1;
    let copy_start = Instant::now();

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("Read error: {e}"))?;
        if n == 0 {
            break;
        }
        writer
            .write_all(&buf[..n])
            .map_err(|e| format!("Write error: {e}"))?;
        copied += n as u64;

        let percent = if total_bytes > 0 {
            (copied as f64 / total_bytes as f64 * 100.0).min(100.0)
        } else {
            0.0
        };

        let _ = app.emit(
            "update_progress",
            serde_json::json!({
                "bytes_copied": copied,
                "total_bytes":  total_bytes,
                "percent":      percent,
            }),
        );

        let pct_bucket = (percent as i64) / 5 * 5;
        if pct_bucket > last_logged_pct {
            last_logged_pct = pct_bucket;
            log_updater(
                log_dir,
                &format!("Copy progress: {pct_bucket}% ({copied}/{total_bytes} bytes)"),
            );
        }
    }

    let elapsed_ms = copy_start.elapsed().as_millis();
    log_updater(log_dir, &format!("Copy complete: {copied} bytes in {elapsed_ms} ms"));
    Ok(dest)
}

// ── start_update (shim-based, v2.1.0) ────────────────────────────────────

/// Tauri command invoked by the `UpdateModal` when the user clicks **Install Now**.
///
/// v2.1.0 design: spawns `desktop-toolkit-updater.exe` (the shim) as a fully
/// detached process, then calls `app.exit(0)` to release the file lock on the
/// parent exe so NSIS can replace it.
///
/// # Arguments
/// * `app`          — Tauri AppHandle.
/// * `state`        — Tauri managed [`UpdateState`] (populated at startup).
/// * `sidecar_name` — image name of the sidecar binary (without `.exe`),
///                    used by the shim to kill it before installing.
/// * `log_dir`      — directory name under `%LOCALAPPDATA%` for the log file.
#[tauri::command]
pub fn start_update(
    app: AppHandle,
    state: tauri::State<UpdateState>,
    sidecar_name: &str,
    log_dir: &str,
) -> Result<(), String> {
    let latest = state.latest.lock().unwrap().clone();
    let update_path = state.update_path.lock().unwrap().clone();

    let (latest, update_path) = match (latest, update_path) {
        (Some(l), Some(p)) => (l, p),
        _ => {
            log_updater(log_dir, "start_update: no pending update in state");
            return Err("No pending update".to_string());
        }
    };

    let installed_app_exe =
        std::env::current_exe().map_err(|e| e.to_string())?;

    let resource_updater_exe = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("desktop-toolkit-updater.exe");

    // Primary contract (v2.2.5+): Tauri installs the shim under resources/
    // via bundle.resources. Fall back to the app directory for older builds
    // that still promote the shim next to the main exe during install.
    let updater_exe = if resource_updater_exe.is_file() {
        resource_updater_exe
    } else {
        installed_app_exe
            .parent()
            .ok_or("no parent dir")?
            .join("desktop-toolkit-updater.exe")
    };

    // Copy installer to %TEMP% first (in the parent process where the drive is reachable).
    log_updater(log_dir, &format!("start_update: copying {} from shared drive", latest.installer));
    let dest_path = copy_installer_with_progress(&update_path, &latest.installer, log_dir, &app)
        .map_err(|e| {
            log_updater(log_dir, &format!("start_update: copy failed: {e}"));
            e
        })?;

    // Signal the frontend: copy done, now verifying installer integrity.
    let _ = app.emit("update_phase", serde_json::json!({ "phase": "verifying" }));

    log_updater(log_dir, &format!("start_update: spawning shim {:?}", updater_exe));

    let mut cmd = std::process::Command::new(&updater_exe);
    cmd.arg("--installer")
        .arg(&dest_path)
        .arg("--installed-app-exe")
        .arg(&installed_app_exe)
        .arg("--version")
        .arg(&latest.version)
        .arg("--sidecar-name")
        .arg(sidecar_name);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP — shim survives parent exit.
        cmd.creation_flags(0x0000_0008 | 0x0000_0200);
    }

    let child = cmd.spawn().map_err(|e| {
        log_updater(log_dir, &format!("start_update: failed to spawn shim: {e}"));
        e.to_string()
    })?;

    // Signal the frontend: shim is running, NSIS installer is executing.
    let _ = app.emit("update_phase", serde_json::json!({ "phase": "installing" }));

    log_updater(
        log_dir,
        &format!(
            "start_update: shim launched (PID {}), exiting parent",
            child.id()
        ),
    );

    // Signal the frontend: app is about to exit, new version launching next.
    let _ = app.emit("update_phase", serde_json::json!({ "phase": "launching" }));

    // Brief pause so the OS finishes handing off, then exit cleanly.
    // app.exit() releases file handles — NSIS can now replace the exe.
    std::thread::sleep(std::time::Duration::from_millis(200));
    app.exit(0);
    Ok(())
}
