// crates/desktop-toolkit/src/sidecar.rs
//
// Manages the PyInstaller backend sidecar process and the Python
// dev-server fallback used during local development.
//
// Production protocol (PyInstaller sidecar):
//   1. Rust picks a free TCP port and passes it via SIDECAR_BACKEND_PORT.
//   2. The sidecar prints the confirmed port on its first stdout line, then
//      starts uvicorn.
//   3. Rust reads that line (with a 15-second timeout) to learn the actual
//      port and returns a base URL string to the caller.
//   4. The caller stores the URL in Tauri state and kills the child on exit.
//
// Dev fallback (`spawn_python_dev_backend`):
//   When no PyInstaller binary is present (typical `npm run desktop` in dev),
//   the toolkit launches `python -m uvicorn app:app` from the repository's
//   `backend/` directory on a caller-provided port.  Conda environments are
//   preferred; `python` on PATH is the final fallback.

use std::io::BufRead;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// CREATE_NO_WINDOW -- prevents a console window from appearing on Windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Find a free TCP port on the loopback interface.
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(8000)
}

/// Locate the PyInstaller sidecar binary relative to the running executable.
///
/// # Arguments
/// * `sidecar_name` -- The binary name **without** the `.exe` extension,
///   e.g. `"my-tool-backend"`. This must match the `name` field in the
///   PyInstaller spec and the sidecar name in `tauri.conf.json`.
///
/// Search order (all relative to the directory containing the app exe):
///   1. `binaries/<sidecar-name>/<sidecar-name>.exe`  - NSIS layout
///   2. `<sidecar-name>/<sidecar-name>.exe`            - flat layout
///   3. `<sidecar-name>.exe`                           - single-file
pub fn find_sidecar_path(sidecar_name: &str) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    let exe_name = format!("{}.exe", sidecar_name);

    let candidates = [
        exe_dir.join("binaries").join(sidecar_name).join(&exe_name),
        exe_dir.join(sidecar_name).join(&exe_name),
        exe_dir.join(&exe_name),
    ];

    for p in &candidates {
        if p.is_file() {
            return Some(p.clone());
        }
    }
    None
}

/// Spawn the sidecar, wait for it to report its port, and return the child
/// handle together with the confirmed port number.
pub fn spawn_sidecar(sidecar_path: &PathBuf) -> Result<(Child, u16), String> {
    let port = find_free_port();

    let mut cmd = Command::new(sidecar_path);
    cmd.env("SIDECAR_BACKEND_PORT", port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar '{}': {e}", sidecar_path.display()))?;

    // Read the confirmed port from the sidecar's first stdout line.
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture sidecar stdout".to_string())?;

    let (tx, rx) = mpsc::channel::<u16>();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        if let Some(Ok(line)) = reader.lines().next() {
            if let Ok(p) = line.trim().parse::<u16>() {
                let _ = tx.send(p);
            }
        }
    });

    // Wait up to 15 seconds for the sidecar to report its port.
    let actual_port = rx.recv_timeout(Duration::from_secs(15)).unwrap_or(port);

    println!(
        "[sidecar] Sidecar spawned (PID {}), listening on port {actual_port}",
        child.id()
    );
    Ok((child, actual_port))
}

// -- Python dev-server fallback --------------------------------------------

/// Spawn `python -m uvicorn app:app --port <port>` from the repository's
/// `backend/` directory.
///
/// Used by consumer apps in `do_spawn_backend` when no PyInstaller sidecar
/// binary is present (development workflow). The function is best-effort --
/// if Python or `backend/app.py` cannot be located, it logs an error and
/// returns without panicking, leaving the caller's backend URL pointing at
/// the supplied port so a manually-started uvicorn still wires up.
///
/// # Arguments
/// * `child_arc` -- shared slot for the spawned process handle; the caller
///   uses this to kill the child on app exit.
/// * `port` -- TCP port to bind. Choose a fixed dev port (e.g. 8000, 8001)
///   that matches the URL the frontend is configured to talk to in dev.
pub fn spawn_python_dev_backend(child_arc: &Arc<Mutex<Option<Child>>>, port: u16) {
    // Skip if something is already listening.
    if TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("invalid socket address"),
        Duration::from_millis(300),
    )
    .is_ok()
    {
        println!("[sidecar] Backend already running on port {port}");
        return;
    }

    let python = match find_python() {
        Some(p) => p,
        None => {
            eprintln!(
                "[sidecar] Python not found. \
                 Start the backend manually: cd backend && python -m uvicorn app:app --port {port}"
            );
            return;
        }
    };

    let backend_dir = match find_backend_dir() {
        Some(d) => d,
        None => {
            eprintln!("[sidecar] Could not find backend/app.py. Start the backend manually.");
            return;
        }
    };

    println!("[sidecar] Starting Python backend on port {port}");

    let port_str = port.to_string();
    let mut cmd = Command::new(&python);
    cmd.args([
        "-m",
        "uvicorn",
        "app:app",
        "--host",
        "127.0.0.1",
        "--port",
        &port_str,
        "--reload",
    ])
    .current_dir(&backend_dir);

    match cmd.spawn() {
        Ok(c) => {
            let pid = c.id();
            println!("[sidecar] Python backend spawned (PID {pid})");
            *child_arc.lock().unwrap() = Some(c);

            // Early-exit watchdog: if uvicorn dies within 2s, log a clear hint.
            let check = child_arc.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(2));
                if let Ok(mut guard) = check.lock() {
                    if let Some(ref mut proc) = *guard {
                        if let Ok(Some(status)) = proc.try_wait() {
                            eprintln!(
                                "[sidecar] Backend (PID {pid}) exited early: {status}. \
                                 Run: cd backend && pip install -r requirements.txt"
                            );
                        }
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[sidecar] Failed to spawn Python backend: {e}");
        }
    }
}

// -- Python discovery helpers ----------------------------------------------

/// Return a working Python executable path, preferring Miniconda.
///
/// Search order:
/// 1. `CONDA_PREFIX` -- set when a conda environment is activated.
/// 2. Well-known Miniconda / Anaconda install directories under the home dir.
/// 3. `python` on PATH -- final fallback.
fn find_python() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Active conda environment ($CONDA_PREFIX).
    if let Ok(prefix) = std::env::var("CONDA_PREFIX") {
        let prefix = PathBuf::from(prefix);
        if cfg!(windows) {
            candidates.push(prefix.join("python.exe"));
        } else {
            candidates.push(prefix.join("bin").join("python"));
        }
    }

    // 2. Well-known Miniconda / Anaconda install directories.
    if let Some(home) = home_dir() {
        let dir_names = ["miniconda3", "Miniconda3", "anaconda3", "Anaconda3"];
        for dir in &dir_names {
            if cfg!(windows) {
                candidates.push(home.join(dir).join("python.exe"));
            } else {
                candidates.push(home.join(dir).join("bin").join("python"));
            }
        }
    }

    for path in &candidates {
        if path.is_file() {
            if Command::new(path)
                .arg("--version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                println!("[sidecar] Found Python: {}", path.display());
                return Some(path.to_string_lossy().into_owned());
            }
        }
    }

    // 3. Fallback: `python` on PATH.
    if Command::new("python")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        println!("[sidecar] Found PATH Python");
        return Some("python".to_string());
    }

    None
}

/// Cross-platform helper to obtain the user's home directory.
fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

/// Locate the repository's `backend/` directory containing `app.py`.
///
/// Resolution order:
/// 1. Compile-time anchor (`CARGO_MANIFEST_DIR/../../backend`) -- most reliable
///    during development because it is resolved before the process starts.
/// 2. CWD-relative search across common parent shapes.
fn find_backend_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let anchored = manifest_dir.join("..").join("..").join("backend");
    if anchored.join("app.py").is_file() {
        if let Ok(abs) = anchored.canonicalize() {
            return Some(abs);
        }
    }

    for rel in ["../backend", "../../backend", "./backend"] {
        let p = PathBuf::from(rel);
        if p.join("app.py").is_file() {
            if let Ok(abs) = p.canonicalize() {
                return Some(abs);
            }
        }
    }

    None
}