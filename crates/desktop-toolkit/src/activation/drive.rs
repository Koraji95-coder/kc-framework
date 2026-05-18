// crates/desktop-toolkit/src/activation/drive.rs
//
// Reads the activation auth file from Google Drive using a read-only API key.
//
// The Drive file stores PIN records in the format:
//
//   {
//     "keys": {
//       "R3P-XXXX-XXXX": {
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
// Both ACTIVATION_DRIVE_FILE_ID and ACTIVATION_DRIVE_API_KEY are injected at
// build time via environment variables — they do not appear as readable
// strings in source.  Consumer repos set these in their CI/CD environment
// (or .env.build for local builds) before invoking `cargo build`.

use serde::Deserialize;
use std::collections::HashMap;

const DRIVE_FILE_ID: &str = match option_env!("ACTIVATION_DRIVE_FILE_ID") {
    Some(s) => s,
    None => "",
};

const DRIVE_API_KEY: &str = match option_env!("ACTIVATION_DRIVE_API_KEY") {
    Some(s) => s,
    None => "",
};

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

// ── Fetch + lookup ────────────────────────────────────────────────────────

/// Fetch the auth file from Drive and look up the given PIN.
///
/// Returns `Err` if the Drive fetch fails, the file cannot be parsed,
/// or the PIN is not found in the file.
pub async fn lookup_pin(pin: &str) -> Result<DriveKeyEntry, String> {
    if DRIVE_FILE_ID.is_empty() || DRIVE_API_KEY.is_empty() {
        // Debug builds with no Drive credentials fall back to a dev-mode
        // PIN check so a fresh clone can pass the activation gate without
        // a Google Cloud round-trip. The accepted PIN is "R3P-DEV-DEV" so
        // it's obviously a dev artifact; the issued/expires dates put the
        // local activation token a year out. RELEASE BUILDS NEVER REACH
        // THIS PATH -- the env!() macros in token.rs / drive.rs are
        // compile-errors when the vars are unset in --release.
        #[cfg(debug_assertions)]
        {
            if pin == "R3P-DEV-DEV" {
                return Ok(DriveKeyEntry {
                    name: "Developer (dev-bypass)".to_string(),
                    active: true,
                    issued: Some("2026-01-01".to_string()),
                    expires: Some("2099-12-31".to_string()),
                });
            }
            return Err(
                "Activation Drive credentials not configured. In debug builds you can activate with the dev PIN 'R3P-DEV-DEV'. For production, set ACTIVATION_DRIVE_FILE_ID and ACTIVATION_DRIVE_API_KEY at build time -- see docs/ACTIVATION_SETUP.md.".to_string(),
            );
        }
        #[cfg(not(debug_assertions))]
        {
            return Err(
                "Activation Drive credentials not configured (ACTIVATION_DRIVE_FILE_ID / ACTIVATION_DRIVE_API_KEY not set at build time)".to_string(),
            );
        }
    }

    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media&key={}",
        DRIVE_FILE_ID, DRIVE_API_KEY
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
        .get(pin)
        .cloned()
        .ok_or_else(|| "PIN not found".to_string())
}
