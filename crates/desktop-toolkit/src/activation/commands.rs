// crates/desktop-toolkit/src/activation/commands.rs
//
// Tauri commands for the activation system.
//
// Consumer apps register all three in their generate_handler![]:
//
//   use desktop_toolkit::activation::commands::{
//       toolkit_activate_with_pin,
//       toolkit_check_activation,
//       toolkit_deactivate,
//   };
//
//   tauri::Builder::default()
//       .invoke_handler(tauri::generate_handler![
//           toolkit_check_activation,
//           toolkit_activate_with_pin,
//           toolkit_deactivate,
//           // ... other commands
//       ])

use tauri::AppHandle;

use super::{activation_status, activate_with_pin, check_activation, deactivate, issue_bearer_token, ActivationResult};

/// Returns `true` when the local activation token is valid, unexpired, and
/// machine-bound to the current host.  No network call is made.
#[tauri::command]
pub fn toolkit_check_activation(app: AppHandle) -> bool {
    check_activation(&app)
}

/// Returns the full activation status (name, expiry, warning flag, days
/// remaining) without making a network call.  Errors if not activated.
#[tauri::command]
pub fn toolkit_activation_status(app: AppHandle) -> Result<ActivationResult, String> {
    activation_status(&app)
}

/// Validate `pin` against the Drive auth file and persist a signed local token.
///
/// This command makes an outbound HTTPS request to Google Drive; it must be
/// called from an async context.  The Tauri invoke_handler satisfies this.
#[tauri::command]
pub async fn toolkit_activate_with_pin(
    app: AppHandle,
    pin: String,
) -> Result<ActivationResult, String> {
    activate_with_pin(&app, &pin).await
}

/// Remove the local activation token.  Requires the user to re-enter their
/// PIN on next launch.
#[tauri::command]
pub fn toolkit_deactivate(app: AppHandle) -> Result<(), String> {
    deactivate(&app)
}

/// Issue a short-lived HMAC bearer token for backend HTTP authorization.
///
/// Returns `Err` when the local activation token is missing, tampered,
/// machine-mismatched, or expired.  Consumers attach the returned string
/// as `Authorization: Bearer <token>` on outbound fetches; backends
/// verify by re-deriving the expected HMAC using the shared
/// `ACTIVATION_HMAC_SECRET`.  See the Python verifier helper at
/// `chamber19_desktop_toolkit.auth.verify_toolkit_bearer` for a
/// drop-in FastAPI `Depends`.
///
/// Token TTL is ~60 seconds with +/-1 minute clock-skew tolerance on
/// the verifier side. Consumers should call this command per-request
/// rather than caching the result.
#[tauri::command]
pub fn toolkit_get_bearer_token(app: AppHandle) -> Result<String, String> {
    issue_bearer_token(&app)
}