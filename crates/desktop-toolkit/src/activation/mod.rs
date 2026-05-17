// crates/desktop-toolkit/src/activation/mod.rs
//
// Public API for the machine-bound PIN activation system.
//
// Consumer apps register the three Tauri commands from `commands.rs` and
// drop `ActivationGate` from the JS package around their app root.

pub mod commands;
mod drive;
mod machine;
mod token;

use tauri::AppHandle;

pub use token::{ACTIVATION_GRACE_DAYS, ACTIVATION_WARN_DAYS};

// ── Result type ───────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ActivationResult {
    pub valid: bool,
    pub name: String,
    pub expires_at: String,
    /// True when within ACTIVATION_WARN_DAYS days of expiry.
    pub warning: bool,
    pub days_remaining: i64,
}

// ── Public functions ──────────────────────────────────────────────────────

/// Returns `true` when a valid, non-expired, machine-bound token exists.
///
/// Suitable for a fast gate check on every launch.  No network call is made.
pub fn check_activation(app: &AppHandle) -> bool {
    token::verify_token(app).is_ok()
}

/// Validate `pin` against the Drive auth file and persist a signed local token.
///
/// This is the only function that makes a network call.  It must be called
/// from an async context (Tauri's tokio runtime satisfies this).
pub async fn activate_with_pin(
    app: &AppHandle,
    pin: &str,
) -> Result<ActivationResult, String> {
    let machine_id = machine::get_machine_id()?;
    let entry = drive::lookup_pin(pin).await?;

    if !entry.active {
        return Err("PIN is revoked or inactive".to_string());
    }

    // Reject if the Drive-level PIN has expired.
    if let Some(ref expires) = entry.expires {
        if token::is_date_expired(expires) {
            return Err(format!("PIN expired on {expires}"));
        }
    }

    token::write_token(
        app,
        pin,
        &entry.name,
        &machine_id,
        entry.expires.as_deref().unwrap_or(""),
    )
}

/// Remove the local activation token (deactivates this machine).
pub fn deactivate(app: &AppHandle) -> Result<(), String> {
    token::delete_token(app)
}

/// Full activation status including warning flag and days remaining.
///
/// Use this in settings panels where you want to show expiry information.
pub fn activation_status(app: &AppHandle) -> Result<ActivationResult, String> {
    token::token_status(app)
}

/// Issue a short-lived HMAC bearer token for backend HTTP authorization.
///
/// Wraps `token::issue_bearer_token`. See its docstring for the token format
/// and the verification protocol. Returns `Err` when the local activation
/// token is missing, tampered, machine-mismatched, or expired -- so backend
/// access through this bearer is gated by valid activation.
pub fn issue_bearer_token(app: &AppHandle) -> Result<String, String> {
    token::issue_bearer_token(app)
}
