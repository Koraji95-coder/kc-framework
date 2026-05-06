// crates/desktop-toolkit/src/activation/token.rs
//
// Signed activation token: persisted to {app_data_dir}/.toolkit-activation.
//
// Token fields: machine_id | name | pin_hash | issued_at | expires_at
// Signature:    HMAC-SHA256 over "|"-joined fields, base64-encoded.
//
// The HMAC secret is injected at build time via the ACTIVATION_HMAC_SECRET
// environment variable.  In dev builds (variable unset) a sentinel string is
// used so that dev tokens cannot be used in production.

use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

use super::ActivationResult;

// ── Compile-time secrets ──────────────────────────────────────────────────

const ACTIVATION_HMAC_SECRET: &str = match option_env!("ACTIVATION_HMAC_SECRET") {
    Some(s) => s,
    None => "dev-only-insecure-hmac-key-DO-NOT-SHIP",
};

/// Hard expiry: tokens are valid for this many days from issuance.
pub const ACTIVATION_GRACE_DAYS: i64 = 30;
/// Warning threshold: surface a warning this many days before expiry.
pub const ACTIVATION_WARN_DAYS: i64 = 5;

// ── Token struct ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StoredToken {
    pub machine_id: String,
    pub name: String,
    pin_hash: String,
    pub issued_at: String,
    pub expires_at: String,
    sig: String,
}

type HmacSha256 = Hmac<Sha256>;

// ── Path ──────────────────────────────────────────────────────────────────

pub fn token_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join(".toolkit-activation"))
        .map_err(|e| e.to_string())
}

// ── Sign / verify ─────────────────────────────────────────────────────────

fn sign_fields(
    machine_id: &str,
    name: &str,
    pin_hash: &str,
    issued_at: &str,
    expires_at: &str,
) -> String {
    let message = format!("{machine_id}|{name}|{pin_hash}|{issued_at}|{expires_at}");
    let mut mac = HmacSha256::new_from_slice(ACTIVATION_HMAC_SECRET.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(message.as_bytes());
    STANDARD.encode(mac.finalize().into_bytes())
}

fn hash_pin(pin: &str) -> String {
    let digest = Sha256::digest(pin.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

// ── Date arithmetic (no chrono dep) ──────────────────────────────────────

fn today_epoch_days() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    (secs / 86400) as i64
}

/// Convert a YYYY-MM-DD string to days since Unix epoch.
fn date_str_to_epoch_days(s: &str) -> Option<i64> {
    let mut parts = s.splitn(3, '-');
    let year: i64 = parts.next()?.parse().ok()?;
    let month: i64 = parts.next()?.parse().ok()?;
    let day: i64 = parts.next()?.parse().ok()?;
    // Civil-to-epoch algorithm (Howard Hinnant)
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    let jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    // JDN of 1970-01-01 is 2440588
    Some(jdn - 2440588)
}

/// Format days since Unix epoch as YYYY-MM-DD.
fn epoch_days_to_date_str(days: i64) -> String {
    // Civil date from days since epoch (Howard Hinnant algorithm)
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn today_date_str() -> String {
    epoch_days_to_date_str(today_epoch_days())
}

/// Return true when `date_str` (YYYY-MM-DD) is in the past.
pub fn is_date_expired(date_str: &str) -> bool {
    match date_str_to_epoch_days(date_str) {
        Some(d) => today_epoch_days() > d,
        None => true,
    }
}

/// Days remaining until `expires_at`; negative means expired.
pub fn days_remaining(expires_at: &str) -> i64 {
    match date_str_to_epoch_days(expires_at) {
        Some(d) => d - today_epoch_days(),
        None => -1,
    }
}

// ── Write ─────────────────────────────────────────────────────────────────

/// Create a signed token for the given PIN and persist it to disk.
pub fn write_token(
    app: &tauri::AppHandle,
    pin: &str,
    name: &str,
    machine_id: &str,
    drive_expires: &str,
) -> Result<ActivationResult, String> {
    let issued_at = today_date_str();
    // Token expiry is the sooner of (issued + GRACE_DAYS) and the Drive-level expiry.
    let grace_days_date =
        epoch_days_to_date_str(today_epoch_days() + ACTIVATION_GRACE_DAYS);
    let expires_at = if !drive_expires.is_empty()
        && date_str_to_epoch_days(drive_expires)
            .map(|d| d < today_epoch_days() + ACTIVATION_GRACE_DAYS)
            .unwrap_or(false)
    {
        drive_expires.to_string()
    } else {
        grace_days_date
    };

    let pin_hash = hash_pin(pin);
    let sig = sign_fields(machine_id, name, &pin_hash, &issued_at, &expires_at);

    let token = StoredToken {
        machine_id: machine_id.to_string(),
        name: name.to_string(),
        pin_hash,
        issued_at,
        expires_at: expires_at.clone(),
        sig,
    };

    let path = token_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create token directory: {e}"))?;
    }
    let json = serde_json::to_string(&token).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Cannot write token: {e}"))?;

    Ok(ActivationResult {
        valid: true,
        name: name.to_string(),
        expires_at,
        warning: false,
        days_remaining: days_remaining(&token.expires_at),
    })
}

// ── Verify ────────────────────────────────────────────────────────────────

/// Load and verify the stored token against the current machine.
///
/// Returns `Err` if the token is absent, tampered, on the wrong machine,
/// or expired.
pub fn verify_token(app: &tauri::AppHandle) -> Result<StoredToken, String> {
    let path = token_path(app)?;
    let json = std::fs::read_to_string(&path)
        .map_err(|_| "No activation token found".to_string())?;
    let token: StoredToken =
        serde_json::from_str(&json).map_err(|e| format!("Token file corrupt: {e}"))?;

    // Verify signature.
    let expected_sig = sign_fields(
        &token.machine_id,
        &token.name,
        &token.pin_hash,
        &token.issued_at,
        &token.expires_at,
    );
    if token.sig != expected_sig {
        return Err("Token signature invalid".to_string());
    }

    // Verify machine.
    let current_machine = super::machine::get_machine_id()?;
    if token.machine_id != current_machine {
        return Err("Token is bound to a different machine".to_string());
    }

    // Verify expiry.
    if is_date_expired(&token.expires_at) {
        return Err(format!("Activation expired on {}", token.expires_at));
    }

    Ok(token)
}

/// Load the stored token and return rich status without hard-failing on warnings.
pub fn token_status(
    app: &tauri::AppHandle,
) -> Result<ActivationResult, String> {
    let token = verify_token(app)?;
    let dr = days_remaining(&token.expires_at);
    Ok(ActivationResult {
        valid: true,
        name: token.name,
        expires_at: token.expires_at,
        warning: dr <= ACTIVATION_WARN_DAYS,
        days_remaining: dr,
    })
}

// ── Delete ────────────────────────────────────────────────────────────────

pub fn delete_token(app: &tauri::AppHandle) -> Result<(), String> {
    let path = token_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Cannot remove token: {e}"))?;
    }
    Ok(())
}
