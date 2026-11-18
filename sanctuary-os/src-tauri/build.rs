use std::path::PathBuf;

fn sanitize_single_line(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| !matches!(c, '\r' | '\n' | '\0'))
        .collect()
}

fn main() {
    println!("cargo:rerun-if-changed=../sanctuary.fork.json");
    println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBKEY");
    println!("cargo:rerun-if-env-changed=VITE_GITHUB_RELEASE_REPO");

    let mut fork_pubkey = String::new();
    let mut fork_repo = String::new();

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let fork_path = PathBuf::from(manifest_dir).join("../sanctuary.fork.json");
        if fork_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&fork_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(pk) = val
                        .pointer("/tauri/updaterPubkey")
                        .and_then(|v| v.as_str())
                    {
                        fork_pubkey = sanitize_single_line(pk);
                    }
                    if let Some(repo) = val
                        .pointer("/branding/githubReleaseRepo")
                        .and_then(|v| v.as_str())
                    {
                        fork_repo = sanitize_single_line(repo);
                    }
                }
            }
        }
    }

    let resolved_pubkey = std::env::var("TAURI_UPDATER_PUBKEY")
        .ok()
        .map(|s| sanitize_single_line(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or(fork_pubkey);

    let resolved_repo = std::env::var("VITE_GITHUB_RELEASE_REPO")
        .ok()
        .map(|s| sanitize_single_line(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or(fork_repo);

    if !resolved_pubkey.is_empty() {
        println!(
            "cargo:rustc-env=SANCTUARY_COMPILED_UPDATER_PUBKEY={}",
            resolved_pubkey
        );
    }
    if !resolved_repo.is_empty() {
        println!(
            "cargo:rustc-env=SANCTUARY_COMPILED_RELEASE_REPO={}",
            resolved_repo
        );
    }

    tauri_build::build()
}
