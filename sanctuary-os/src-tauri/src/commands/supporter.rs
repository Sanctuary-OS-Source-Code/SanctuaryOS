use crate::utils::get_db_conn;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalMasonFollow {
    pub mason_id: String,
    pub mason_name: String,
    pub avatar_url: String,
    pub workspace_id: String,
    pub notify_alerts: bool,
    pub followed_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalMasonSupporter {
    pub mason_id: String,
    pub mason_name: String,
    pub provider: String,
    pub tier_name: String,
    pub pledge_cents: i64,
    pub patreon_campaign_id: String,
    pub cryptographic_pass: String,
    pub expedited_support: bool,
    pub early_access: bool,
    pub verified_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalDevBuildStatus {
    pub user_id: String,
    pub dev_build_until: i64,
    pub donation_credit_cents: i64,
    pub total_months_unlocked: i64,
    pub channel_enabled: bool,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalSupporterStatePayload {
    pub follows: Vec<LocalMasonFollow>,
    pub supporters: Vec<LocalMasonSupporter>,
    pub dev_build: LocalDevBuildStatus,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[tauri::command]
pub async fn get_local_supporter_state(
    vault_path: String,
    user_id: String,
) -> Result<LocalSupporterStatePayload, String> {
    let conn = get_db_conn(&vault_path);
    let now = now_secs();

    let mut follows = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT mason_id, mason_name, COALESCE(avatar_url, ''), COALESCE(workspace_id, ''), notify_alerts, followed_at
         FROM local_mason_follows
         ORDER BY followed_at DESC",
    ) {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok(LocalMasonFollow {
                mason_id: row.get(0)?,
                mason_name: row.get(1)?,
                avatar_url: row.get(2)?,
                workspace_id: row.get(3)?,
                notify_alerts: row.get::<_, i64>(4).unwrap_or(1) != 0,
                followed_at: row.get(5)?,
            })
        }) {
            for f in iter.flatten() {
                follows.push(f);
            }
        }
    }

    let mut supporters = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT mason_id, mason_name, provider, COALESCE(tier_name, 'Supporter'), pledge_cents,
                COALESCE(patreon_campaign_id, ''), cryptographic_pass, expedited_support, early_access,
                verified_at, expires_at
         FROM local_mason_supporters
         ORDER BY verified_at DESC",
    ) {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok(LocalMasonSupporter {
                mason_id: row.get(0)?,
                mason_name: row.get(1)?,
                provider: row.get(2)?,
                tier_name: row.get(3)?,
                pledge_cents: row.get(4).unwrap_or(500),
                patreon_campaign_id: row.get(5)?,
                cryptographic_pass: row.get(6)?,
                expedited_support: row.get::<_, i64>(7).unwrap_or(1) != 0,
                early_access: row.get::<_, i64>(8).unwrap_or(1) != 0,
                verified_at: row.get(9)?,
                expires_at: row.get(10)?,
            })
        }) {
            for s in iter.flatten() {
                supporters.push(s);
            }
        }
    }

    let effective_uid = if user_id.is_empty() {
        "local_citizen".to_string()
    } else {
        user_id
    };

    let dev_build = conn
        .query_row(
            "SELECT user_id, dev_build_until, donation_credit_cents, total_months_unlocked, channel_enabled, updated_at
             FROM local_dev_build_status
             WHERE user_id = ?1",
            rusqlite::params![effective_uid],
            |row| {
                Ok(LocalDevBuildStatus {
                    user_id: row.get(0)?,
                    dev_build_until: row.get(1)?,
                    donation_credit_cents: row.get(2)?,
                    total_months_unlocked: row.get(3)?,
                    channel_enabled: row.get::<_, i64>(4).unwrap_or(0) != 0,
                    updated_at: row.get(5)?,
                })
            },
        )
        .unwrap_or(LocalDevBuildStatus {
            user_id: effective_uid,
            dev_build_until: 0,
            donation_credit_cents: 0,
            total_months_unlocked: 0,
            channel_enabled: false,
            updated_at: now,
        });

    Ok(LocalSupporterStatePayload {
        follows,
        supporters,
        dev_build,
    })
}

#[tauri::command]
pub async fn toggle_local_mason_follow(
    vault_path: String,
    mason_id: String,
    mason_name: String,
    avatar_url: String,
    workspace_id: String,
) -> Result<bool, String> {
    let conn = get_db_conn(&vault_path);
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM local_mason_follows WHERE mason_id = ?1",
            rusqlite::params![mason_id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if exists {
        conn.execute(
            "DELETE FROM local_mason_follows WHERE mason_id = ?1",
            rusqlite::params![mason_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        let now = now_secs();
        conn.execute(
            "INSERT OR REPLACE INTO local_mason_follows (mason_id, mason_name, avatar_url, workspace_id, notify_alerts, followed_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)",
            rusqlite::params![mason_id, mason_name, avatar_url, workspace_id, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn sync_mason_supporter_bridge(
    vault_path: String,
    mason_id: String,
    mason_name: String,
    provider: String,
    token_or_key: String,
    patreon_campaign_id: String,
    tier_name: String,
) -> Result<LocalMasonSupporter, String> {
    if mason_id.trim().is_empty() && mason_name.trim().is_empty() {
        return Err("Creator identifier is required.".into());
    }
    if token_or_key.trim().is_empty() {
        return Err("Supporter token or receipt key is required.".into());
    }

    let mut resolved_pledge_cents: i64 = 500;
    let mut resolved_tier = if tier_name.trim().is_empty() {
        "Verified Supporter".to_string()
    } else {
        tier_name.trim().to_string()
    };

    // If Patreon provider with an OAuth/Personal token, attempt direct local client->Patreon verification
    // so no central Sanctuary cloud server ever sees the user's Patreon identity or memberships.
    if provider.eq_ignore_ascii_case("patreon") && token_or_key.len() > 24 {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        if let Ok(resp) = client
            .get("https://www.patreon.com/api/oauth2/v2/identity?include=memberships.campaign&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents")
            .bearer_auth(token_or_key.trim())
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json_val) = resp.json::<serde_json::Value>().await {
                    if let Some(included) = json_val.get("included").and_then(|v| v.as_array()) {
                        for item in included {
                            if item.get("type").and_then(|t| t.as_str()) == Some("member") {
                                let status = item
                                    .get("attributes")
                                    .and_then(|a| a.get("patron_status"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("");
                                let cents = item
                                    .get("attributes")
                                    .and_then(|a| a.get("currently_entitled_amount_cents"))
                                    .and_then(|c| c.as_i64())
                                    .unwrap_or(500);
                                if status == "active_patron" && cents > 0 {
                                    resolved_pledge_cents = cents;
                                    resolved_tier = format!("Active Patron (${:.2}/mo)", (cents as f64) / 100.0);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let now = now_secs();
    let expires_at = now + (30 * 86400);
    let effective_id = if mason_id.trim().is_empty() {
        mason_name.trim().to_lowercase().replace(' ', "_")
    } else {
        mason_id.trim().to_string()
    };

    // Generate a one-way cryptographic supporter pass hash (zero-knowledge receipt)
    let mut hasher = Sha256::new();
    hasher.update(format!(
        "SANCTUARY_SUPPORTER_PASS:{}:{}:{}:{}",
        effective_id,
        provider.to_lowercase(),
        token_or_key.trim(),
        now / 86400
    ));
    let pass_hash = format!("sp_{}", hex::encode(hasher.finalize())[..24].to_string());

    let conn = get_db_conn(&vault_path);
    conn.execute(
        "INSERT OR REPLACE INTO local_mason_supporters (
            mason_id, mason_name, provider, tier_name, pledge_cents,
            patreon_campaign_id, access_token, cryptographic_pass,
            expedited_support, early_access, verified_at, expires_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 1, ?9, ?10)",
        rusqlite::params![
            effective_id,
            mason_name.trim(),
            provider.to_lowercase(),
            resolved_tier,
            resolved_pledge_cents,
            patreon_campaign_id.trim(),
            token_or_key.trim(),
            pass_hash,
            now,
            expires_at
        ],
    )
    .map_err(|e| format!("SQLite Error: {}", e))?;

    Ok(LocalMasonSupporter {
        mason_id: effective_id,
        mason_name: mason_name.trim().to_string(),
        provider: provider.to_lowercase(),
        tier_name: resolved_tier,
        pledge_cents: resolved_pledge_cents,
        patreon_campaign_id: patreon_campaign_id.trim().to_string(),
        cryptographic_pass: pass_hash,
        expedited_support: true,
        early_access: true,
        verified_at: now,
        expires_at,
    })
}

#[tauri::command]
pub async fn remove_local_mason_supporter(
    vault_path: String,
    mason_id: String,
) -> Result<(), String> {
    let conn = get_db_conn(&vault_path);
    conn.execute(
        "DELETE FROM local_mason_supporters WHERE mason_id = ?1",
        rusqlite::params![mason_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn stack_local_dev_build_donation(
    vault_path: String,
    user_id: String,
    amount_cents: i64,
    channel_enabled: Option<bool>,
    override_until: Option<i64>,
    override_credit_cents: Option<i64>,
    override_total_months: Option<i64>,
) -> Result<LocalDevBuildStatus, String> {
    let conn = get_db_conn(&vault_path);
    let now = now_secs();
    let effective_uid = if user_id.is_empty() {
        "local_citizen".to_string()
    } else {
        user_id
    };

    let current = conn
        .query_row(
            "SELECT user_id, dev_build_until, donation_credit_cents, total_months_unlocked, channel_enabled, updated_at
             FROM local_dev_build_status
             WHERE user_id = ?1",
            rusqlite::params![effective_uid],
            |row| {
                Ok(LocalDevBuildStatus {
                    user_id: row.get(0)?,
                    dev_build_until: row.get(1)?,
                    donation_credit_cents: row.get(2)?,
                    total_months_unlocked: row.get(3)?,
                    channel_enabled: row.get::<_, i64>(4).unwrap_or(0) != 0,
                    updated_at: row.get(5)?,
                })
            },
        )
        .unwrap_or(LocalDevBuildStatus {
            user_id: effective_uid.clone(),
            dev_build_until: 0,
            donation_credit_cents: 0,
            total_months_unlocked: 0,
            channel_enabled: false,
            updated_at: now,
        });

    let mut new_until = override_until.unwrap_or(current.dev_build_until);
    let mut new_credit = override_credit_cents.unwrap_or(current.donation_credit_cents);
    let mut new_months = override_total_months.unwrap_or(current.total_months_unlocked);

    if amount_cents > 0 && override_until.is_none() {
        let combined_cents = current.donation_credit_cents + amount_cents;
        // Every $5.00 (500 cents) dynamically adds 1 full month (30 days = 2,592,000 seconds)
        let months_added = combined_cents / 500;
        new_credit = combined_cents % 500;
        if months_added > 0 {
            let base_time = std::cmp::max(now, current.dev_build_until);
            new_until = base_time + (months_added * 30 * 86400);
            new_months = current.total_months_unlocked + months_added;
        }
    }

    let is_unlocked = new_until > now;
    let new_channel = match channel_enabled {
        Some(v) => v && is_unlocked,
        None => {
            if amount_cents > 0 && is_unlocked {
                true
            } else {
                current.channel_enabled && is_unlocked
            }
        }
    };

    conn.execute(
        "INSERT OR REPLACE INTO local_dev_build_status (
            user_id, dev_build_until, donation_credit_cents, total_months_unlocked, channel_enabled, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            effective_uid,
            new_until,
            new_credit,
            new_months,
            if new_channel { 1 } else { 0 },
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(LocalDevBuildStatus {
        user_id: effective_uid,
        dev_build_until: new_until,
        donation_credit_cents: new_credit,
        total_months_unlocked: new_months,
        channel_enabled: new_channel,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn download_and_install_update(
    app_handle: tauri::AppHandle,
    download_url: String,
    version: Option<String>,
    is_dev: Option<bool>,
) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;

    let validate_github_update_url = |raw_url: &str| -> Result<reqwest::Url, String> {
        let parsed = reqwest::Url::parse(raw_url.trim())
            .map_err(|_| "Invalid update URL.".to_string())?;
        if parsed.scheme() != "https" {
            return Err("Update URL must use https:// scheme.".to_string());
        }
        let host = parsed.host_str().unwrap_or("");
        match host {
            "github.com" | "api.github.com" => {
                let path = parsed.path();
                if !path.starts_with("/Sanctuary-OS-Source-Code/SanctuaryOS/")
                    && !path.starts_with("/repos/Sanctuary-OS-Source-Code/SanctuaryOS/")
                {
                    return Err(
                        "Update URL path must belong to Sanctuary-OS-Source-Code/SanctuaryOS."
                            .to_string(),
                    );
                }
            }
            "objects.githubusercontent.com" => {}
            _ => {
                return Err(format!("Untrusted update URL host: {}", host));
            }
        }
        Ok(parsed)
    };

    validate_github_update_url(&download_url)?;

    let client = Client::builder()
        .user_agent("Sanctuary-OS-Updater")
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let clean_ver = version
        .unwrap_or_else(|| "latest".to_string())
        .trim()
        .trim_start_matches(|c| c == 'v' || c == 'V')
        .to_string();
    let want_dev = is_dev.unwrap_or_else(|| clean_ver.to_lowercase().contains("dev"));

    let is_macos_target = cfg!(target_os = "macos");

    let is_direct_installer = |url: &str| -> bool {
        let path_part = url.split('?').next().unwrap_or(url).to_lowercase();
        if is_macos_target {
            path_part.ends_with(".dmg") || path_part.ends_with(".app.tar.gz")
        } else {
            path_part.ends_with(".exe") || path_part.ends_with(".msi")
        }
    };

    let mut resolved_url = if is_direct_installer(&download_url) {
        download_url.trim().to_string()
    } else {
        String::new()
    };

    // If the provided URL is a GitHub release page rather than a direct OS installer binary,
    // resolve the direct installer asset URL from the GitHub Releases API for the active OS.
    if resolved_url.is_empty() {
        let gh_resp = client
            .get("https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases?per_page=25")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("Failed to query GitHub Releases API: {}", e))?;

        if gh_resp.status().is_success() {
            if let Ok(releases) = gh_resp.json::<Vec<serde_json::Value>>().await {
                let pick_installer_from_release = |rel: &serde_json::Value| -> Option<String> {
                    let assets = rel.get("assets")?.as_array()?;
                    if is_macos_target {
                        // macOS Priority 1: .dmg
                        for asset in assets {
                            let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                            if name.ends_with(".dmg") {
                                if let Some(u) = asset.get("browser_download_url").and_then(|v| v.as_str()) {
                                    return Some(u.to_string());
                                }
                            }
                        }
                        // macOS Priority 2: .app.tar.gz
                        for asset in assets {
                            let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                            if name.ends_with(".app.tar.gz") {
                                if let Some(u) = asset.get("browser_download_url").and_then(|v| v.as_str()) {
                                    return Some(u.to_string());
                                }
                            }
                        }
                        return None;
                    }
                    // Windows Priority 1: NSIS *-setup.exe
                    for asset in assets {
                        let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                        if name.ends_with("-setup.exe") || name.ends_with("_x64-setup.exe") {
                            if let Some(u) = asset.get("browser_download_url").and_then(|v| v.as_str()) {
                                return Some(u.to_string());
                            }
                        }
                    }
                    // Windows Priority 2: any .exe
                    for asset in assets {
                        let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                        if name.ends_with(".exe") {
                            if let Some(u) = asset.get("browser_download_url").and_then(|v| v.as_str()) {
                                return Some(u.to_string());
                            }
                        }
                    }
                    // Windows Priority 3: any .msi
                    for asset in assets {
                        let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                        if name.ends_with(".msi") {
                            if let Some(u) = asset.get("browser_download_url").and_then(|v| v.as_str()) {
                                return Some(u.to_string());
                            }
                        }
                    }
                    None
                };

                // 1. Try exact version match first
                for rel in &releases {
                    if rel.get("draft").and_then(|d| d.as_bool()).unwrap_or(false) {
                        continue;
                    }
                    let tag = rel
                        .get("tag_name")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .trim_start_matches(|c| c == 'v' || c == 'V');
                    let rel_name = rel.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    if (!clean_ver.is_empty() && tag.eq_ignore_ascii_case(&clean_ver))
                        || (!clean_ver.is_empty() && rel_name.to_lowercase().contains(&clean_ver.to_lowercase()))
                    {
                        if let Some(u) = pick_installer_from_release(rel) {
                            resolved_url = u;
                            break;
                        }
                    }
                }

                // 2. Fallback to latest matching channel (Dev vs Stable) with an installer asset
                if resolved_url.is_empty() {
                    for rel in &releases {
                        if rel.get("draft").and_then(|d| d.as_bool()).unwrap_or(false) {
                            continue;
                        }
                        let tag = rel.get("tag_name").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
                        let prerelease = rel.get("prerelease").and_then(|p| p.as_bool()).unwrap_or(false);
                        let is_rel_dev = tag == "dev-latest" || prerelease || tag.contains("dev");
                        if is_rel_dev == want_dev {
                            if let Some(u) = pick_installer_from_release(rel) {
                                resolved_url = u;
                                break;
                            }
                        }
                    }
                }

                // 3. Final fallback to any release that has an installer binary
                if resolved_url.is_empty() {
                    for rel in &releases {
                        if rel.get("draft").and_then(|d| d.as_bool()).unwrap_or(false) {
                            continue;
                        }
                        if let Some(u) = pick_installer_from_release(rel) {
                            resolved_url = u;
                            break;
                        }
                    }
                }
            }
        }
    }

    if resolved_url.is_empty() {
        if is_macos_target {
            return Err("No direct macOS installer asset (.dmg or .app.tar.gz) found on GitHub Releases for this build.".into());
        }
        return Err("No direct Windows installer asset (.exe or .msi) found on GitHub Releases for this build.".into());
    }

    validate_github_update_url(&resolved_url)?;

    let mut resp = client
        .get(&resolved_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start update download: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Update download failed with HTTP status {}",
            resp.status()
        ));
    }

    let total_bytes = resp.content_length().unwrap_or(0);
    let _ = app_handle.emit(
        "sanctuary-update-progress",
        serde_json::json!({
            "event": "Started",
            "data": { "contentLength": total_bytes }
        }),
    );

    let lower_resolved_path = resolved_url
        .split('?')
        .next()
        .unwrap_or(&resolved_url)
        .to_lowercase();
    let is_msi = lower_resolved_path.ends_with(".msi");
    let is_dmg = lower_resolved_path.ends_with(".dmg");
    let is_app_tar = lower_resolved_path.ends_with(".app.tar.gz");
    let ext = if is_dmg {
        "dmg"
    } else if is_app_tar {
        "app.tar.gz"
    } else if is_msi {
        "msi"
    } else {
        "exe"
    };
    let safe_ver: String = clean_ver
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect();
    let installer_filename = format!("SanctuaryOS_Update_{}_setup.{}", safe_ver, ext);
    let installer_path = std::env::temp_dir().join(&installer_filename);

    {
        let mut file = std::fs::File::create(&installer_path)
            .map_err(|e| format!("Failed to create temporary installer file: {}", e))?;

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| format!("Network error while downloading update: {}", e))?
        {
            file.write_all(&chunk)
                .map_err(|e| format!("Failed writing update chunk to disk: {}", e))?;
            let _ = app_handle.emit(
                "sanctuary-update-progress",
                serde_json::json!({
                    "event": "Progress",
                    "data": { "chunkLength": chunk.len() }
                }),
            );
        }

        file.flush()
            .map_err(|e| format!("Failed to flush installer file: {}", e))?;
    }

    let _ = app_handle.emit(
        "sanctuary-update-progress",
        serde_json::json!({
            "event": "Finished",
            "data": {}
        }),
    );

    let _ = app_handle.emit(
        "sanctuary-update-progress",
        serde_json::json!({
            "event": "Installing",
            "data": {}
        }),
    );

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if is_msi {
            let installer_str = installer_path.to_string_lossy().to_string();
            std::process::Command::new("msiexec")
                .args(["/i", &installer_str, "/passive"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to launch silent MSI installer: {}", e))?;
        } else {
            // /UPDATE skips uninstall.exe + WebView2/shortcut steps, /S runs NSIS completely silently (no Windows dialog), and /R relaunches Sanctuary OS on completion
            std::process::Command::new(&installer_path)
                .args(["/UPDATE", "/S", "/R"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to launch silent setup installer: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        let installer_str = installer_path.to_string_lossy().to_string();
        if is_dmg {
            // Mount the DMG in the background, copy .app bundle to /Applications if writable (or open the mounted DMG), and relaunch
            let mac_update_script = format!(
                "sleep 1; MOUNT_DIR=$(hdiutil attach -nobrowse -readonly \"{}\" | grep '/Volumes/' | sed 's/.*\\(\\/Volumes\\/.*\\)/\\1/' | head -n 1); \
                if [ -n \"$MOUNT_DIR\" ]; then \
                    APP_BUNDLE=$(find \"$MOUNT_DIR\" -maxdepth 2 -name \"*.app\" | head -n 1); \
                    if [ -n \"$APP_BUNDLE\" ] && [ -w \"/Applications\" ]; then \
                        rm -rf \"/Applications/Sanctuary OS.app\"; \
                        cp -R \"$APP_BUNDLE\" \"/Applications/\"; \
                        hdiutil detach \"$MOUNT_DIR\" -quiet; \
                        open \"/Applications/Sanctuary OS.app\"; \
                    else \
                        open \"$MOUNT_DIR\"; \
                    fi; \
                else \
                    open \"{}\"; \
                fi",
                installer_str, installer_str
            );
            std::process::Command::new("sh")
                .args(["-c", &mac_update_script])
                .spawn()
                .map_err(|e| format!("Failed to launch macOS DMG updater: {}", e))?;
        } else {
            std::process::Command::new("open")
                .arg(&installer_str)
                .spawn()
                .map_err(|e| format!("Failed to open macOS update package: {}", e))?;
        }
    }

    let _ = tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(850));
    })
    .await;

    let _ = app_handle.emit(
        "sanctuary-update-progress",
        serde_json::json!({
            "event": "Relaunching",
            "data": {}
        }),
    );

    let exit_handle = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(550));
        exit_handle.exit(0);
    });

    let _ = tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
    })
    .await;

    Ok(installer_path.to_string_lossy().to_string())
}


