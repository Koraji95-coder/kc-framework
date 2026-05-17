// crates/desktop-toolkit/src/lib.rs
//
// Published framework library for chamber-19 desktop tools.
//
// Consumers add this to their Cargo.toml:
//
//   [dependencies]
//   desktop-toolkit = { git = "https://github.com/chamber-19/desktop-toolkit", tag = "v2.1.0" }
//
// Then in their src/lib.rs:
//
//   use desktop_toolkit::{splash, updater, sidecar};
//
//   fn start_update(app: tauri::AppHandle, state: tauri::State<updater::UpdateState>) {
//       updater::start_update(app, state, "my-tool-backend");
//   }
//
// No ${TOOL_*} placeholders — all tool-specific values are passed at runtime.

pub mod activation;
pub mod ai;
pub mod log;
pub mod sidecar;
pub mod splash;
pub mod updater;
