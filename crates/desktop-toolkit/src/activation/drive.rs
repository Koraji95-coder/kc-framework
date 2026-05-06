// crates/desktop-toolkit/src/activation/drive.rs
//
// Reads the activation auth file from Google Drive using a read-only API key.
//
// The Drive file stores PIN records keyed by HMAC-SHA256(pin, PIN_HASH_SECRET):
//
//   {
//     "keys": {
//       "<hex-hmac-of-pin>": {
//         "name": "Engineer Name",
//         "active": true,
//         "issued": "2024-01-01",
//         "expires": "2025-01-01"
//       }
//     }
//   }
//
// The Drive file MUST be shared "Anyone with the link – Viewer".
// The API key controls billing quota; access is gated on knowing the file ID.
//
// Drive credentials and the PIN_HASH_SECRET are injected at build time via
// environment variables; they do not appear as readable strings in the binary.

use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use std::collections::HashMap;

// ── Drive auth file schema ────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct DriveAuthFile {
    keys: HashMap<String, DriveKeyEntry>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct DriveKeyEntry {
    pub name: String,
    pub active: bool,
    // Preserved for consumers who want to display the issue date.
    #[allow(dead_code)]
    pub issued: Option<String>,
    pub expires: Option<String>,
}

// ── PIN hashing ───────────────────────────────────────────────────────────

fn pin_hmac(pin: &str, secret: &str) -> String {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(pin.as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// ── Fetch + lookup ────────────────────────────────────────────────────────

/// Fetch the auth file from Drive and look up the given PIN.
///
/// Returns `Err` if the Drive fetch fails, the file cannot be parsed,
/// or the PIN is not found in the file.
pub async fn lookup_pin(pin: &str) -> Result<DriveKeyEntry, String> {
    let file_id = super::drive_file_id();
    let api_key = super::drive_api_key();

    if file_id.is_empty() || api_key.is_empty() {
        return Err(
            "Activation Drive credentials not configured (ACTIVATION_DRIVE_FILE_ID / ACTIVATION_DRIVE_API_KEY not set at build time)".to_string(),
        );
    }

    let pin_key = pin_hmac(pin, &super::pin_hash_secret());

    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media&key={}",
        file_id, api_key
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Cannot build HTTP client: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Drive request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Drive API returned {status}: {body}"));
    }

    let auth_file: DriveAuthFile = response
        .json()
        .await
        .map_err(|e| format!("Cannot parse Drive auth file: {e}"))?;

    auth_file
        .keys
        .get(&pin_key)
        .cloned()
        .ok_or_else(|| "PIN not found".to_string())
}
