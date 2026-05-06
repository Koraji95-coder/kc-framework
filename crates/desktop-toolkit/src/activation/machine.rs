// crates/desktop-toolkit/src/activation/machine.rs
//
// Windows-only machine fingerprinting.
//
// Combines the hostname and the current user's Windows SID to produce a
// stable machine ID that is hard to spoof.  The SID is retrieved via
// PowerShell so no extra Cargo dependencies are needed.

use sha2::{Digest, Sha256};

/// Return a stable machine identifier string for the current Windows host.
///
/// The ID is a SHA-256 hex digest of `"{COMPUTERNAME}:{SID}"`.  Using a
/// digest rather than the raw strings keeps the stored value a fixed length
/// and avoids leaking hostnames in the token file.
pub fn get_machine_id() -> Result<String, String> {
    let hostname = hostname()?;
    let sid = windows_sid()?;
    let raw = format!("{hostname}:{sid}");
    let digest = Sha256::digest(raw.as_bytes());
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

fn hostname() -> Result<String, String> {
    std::env::var("COMPUTERNAME")
        .map(|s| s.trim().to_string())
        .map_err(|_| "COMPUTERNAME environment variable not set".to_string())
        .and_then(|s| {
            if s.is_empty() {
                Err("COMPUTERNAME is empty".to_string())
            } else {
                Ok(s)
            }
        })
}

fn windows_sid() -> Result<String, String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
        ])
        .output()
        .map_err(|e| format!("Failed to invoke PowerShell for SID: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell SID query failed: {stderr}"));
    }

    let sid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sid.is_empty() {
        return Err("PowerShell returned empty SID".to_string());
    }
    Ok(sid)
}
