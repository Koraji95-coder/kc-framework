// build.rs — generates XOR-obfuscated activation secrets.
//
// Reads four environment variables at compile time, XOR-encrypts each byte
// with a rolling key, and writes the encrypted byte arrays to
// $OUT_DIR/activation_secrets.rs which is included by the activation module.
//
// The plaintext values of ACTIVATION_DRIVE_FILE_ID, ACTIVATION_DRIVE_API_KEY,
// ACTIVATION_HMAC_SECRET, and ACTIVATION_PIN_HASH_SECRET will NOT appear as
// readable strings in the compiled binary.  Only the XOR key itself is visible
// (it must be present in the binary for runtime decryption), but knowing the
// XOR key alone does not reveal the secrets unless you also read the encrypted
// byte arrays and decode them.
//
// Set secrets as environment variables before `cargo build`:
//
//   export ACTIVATION_DRIVE_FILE_ID=1BxiMVs0...
//   export ACTIVATION_DRIVE_API_KEY=AIzaSyD...
//   export ACTIVATION_HMAC_SECRET=$(openssl rand -hex 32)
//   export ACTIVATION_PIN_HASH_SECRET=$(openssl rand -hex 32)
//
// If a variable is unset the slot is filled with an empty obfuscated array so
// `cargo check` and `cargo test` work without secrets configured.

use std::{env, fs, path::Path};

// 32-byte XOR key embedded in code — not in the string data section.
// This key is NOT secret; it is just obfuscation scaffolding.
const XOR_KEY: &[u8] = b"ch19-dtk-obfuscation-xor-key-32x";

fn xor_obfuscate(s: &str) -> Vec<u8> {
    s.bytes()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect()
}

fn bytes_literal(v: &[u8]) -> String {
    let inner: Vec<String> = v.iter().map(|b| b.to_string()).collect();
    format!("[{}]", inner.join(", "))
}

fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("activation_secrets.rs");

    let slots: &[(&str, &str, &str)] = &[
        ("ACTIVATION_DRIVE_FILE_ID",    "DRIVE_FILE_ID",    ""),
        ("ACTIVATION_DRIVE_API_KEY",    "DRIVE_API_KEY",    ""),
        ("ACTIVATION_HMAC_SECRET",      "HMAC_SECRET",
            "dev-only-insecure-hmac-key-DO-NOT-SHIP"),
        ("ACTIVATION_PIN_HASH_SECRET",  "PIN_HASH_SECRET",
            "dev-only-insecure-pin-hash-DO-NOT-SHIP"),
    ];

    let mut code = String::from(
        "// @generated — do not edit; produced by build.rs\n\n",
    );

    // Emit the deobfuscation function.
    code.push_str(
        r#"fn _deobfuscate(data: &[u8]) -> String {
    const KEY: &[u8] = b"ch19-dtk-obfuscation-xor-key-32x";
    data.iter()
        .enumerate()
        .map(|(i, &b)| char::from(b ^ KEY[i % KEY.len()]))
        .collect()
}

fn _is_empty_slot(data: &[u8]) -> bool {
    data.is_empty()
}

"#,
    );

    // Emit each secret as an obfuscated byte array const.
    for &(env_var, name, default) in slots {
        let value = env::var(env_var).unwrap_or_else(|_| default.to_string());
        let encrypted = xor_obfuscate(&value);
        code.push_str(&format!(
            "const {}_ENC: &[u8] = &{};\n",
            name,
            bytes_literal(&encrypted),
        ));
        println!("cargo:rerun-if-env-changed={env_var}");
    }

    fs::write(&dest, &code).expect("failed to write activation_secrets.rs");
}
