use crate::utils::open_db_conn;
use reqwest::Client;
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

fn hash_redacted_token_fingerprint(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"sanctuary-os-supporter-token-redacted-v2:");
    hasher.update(token.trim().as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

#[tauri::command]
pub async fn get_local_supporter_state(
    vault_path: String,
    user_id: String,
) -> Result<LocalSupporterStatePayload, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LocalSupporterStatePayload, String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let now = now_secs();

        // Purge any legacy plaintext OAuth tokens persisted by older versions
        let _ = conn.execute(
            "UPDATE local_mason_supporters
             SET access_token = ''
             WHERE access_token IS NOT NULL
               AND access_token != ''
               AND access_token NOT LIKE 'sha256:%'",
            [],
        );

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
             WHERE expires_at > ?1
             ORDER BY verified_at DESC",
        ) {
            if let Ok(iter) = stmt.query_map(rusqlite::params![now], |row| {
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn toggle_local_mason_follow(
    vault_path: String,
    mason_id: String,
    mason_name: String,
    avatar_url: String,
    workspace_id: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
    let clean_token = token_or_key.trim();
    if clean_token.len() < 25 {
        return Err("Invalid supporter OAuth token: token is missing or malformed.".into());
    }

    let provider_norm = provider.trim().to_lowercase();
    if provider_norm != "patreon" {
        return Err(format!(
            "Unsupported supporter verification provider '{}'. Only live Patreon OAuth verification is supported.",
            provider.trim()
        ));
    }

    let client = Client::builder()
        .user_agent("SanctuaryOS/0.6")
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to initialize verification HTTP client: {}", e))?;

    let mut resp = client
        .get("https://www.patreon.com/api/oauth2/v2/identity?include=memberships.campaign&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents")
        .bearer_auth(clean_token)
        .send()
        .await
        .map_err(|e| format!("Patreon verification network request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Patreon token verification rejected (HTTP {}).",
            resp.status().as_u16()
        ));
    }

    const MAX_PATREON_BYTES: usize = 1024 * 1024;
    let mut body = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Failed reading Patreon verification response: {}", e))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_PATREON_BYTES {
            return Err("Patreon verification response exceeded 1 MiB limit.".into());
        }
        body.extend_from_slice(&chunk);
    }

    let mut bounded = Vec::with_capacity(body.len());
    std::io::Cursor::new(body)
        .take(MAX_PATREON_BYTES as u64)
        .read_to_end(&mut bounded)
        .map_err(|e| format!("Stream read error: {}", e))?;

    let json_val: serde_json::Value = serde_json::from_slice(&bounded)
        .map_err(|e| format!("Invalid Patreon API JSON payload: {}", e))?;

    let expected_campaign = patreon_campaign_id.trim();
    let mut verified_pledge_cents: Option<i64> = None;

    if let Some(included) = json_val.get("included").and_then(|v| v.as_array()) {
        for item in included {
            if item.get("type").and_then(|t| t.as_str()) != Some("member") {
                continue;
            }
            if !expected_campaign.is_empty() {
                let item_campaign_id = item
                    .get("relationships")
                    .and_then(|r| r.get("campaign"))
                    .and_then(|c| c.get("data"))
                    .and_then(|d| d.get("id"))
                    .and_then(|id| id.as_str())
                    .unwrap_or("");
                if !item_campaign_id.eq_ignore_ascii_case(expected_campaign) {
                    continue;
                }
            }
            let status = item
                .get("attributes")
                .and_then(|a| a.get("patron_status"))
                .and_then(|s| s.as_str())
                .unwrap_or("");
            let cents = item
                .get("attributes")
                .and_then(|a| a.get("currently_entitled_amount_cents"))
                .and_then(|c| c.as_i64())
                .unwrap_or(0);
            if status == "active_patron" && cents > 0 {
                verified_pledge_cents = Some(cents);
                break;
            }
        }
    }

    let resolved_pledge_cents = verified_pledge_cents.ok_or_else(|| {
        "No active paid Patreon membership was found for this creator campaign.".to_string()
    })?;

    let resolved_tier = if tier_name.trim().is_empty() {
        format!(
            "Active Patron (${:.2}/mo)",
            (resolved_pledge_cents as f64) / 100.0
        )
    } else {
        tier_name.trim().to_string()
    };

    let token_fingerprint = hash_redacted_token_fingerprint(clean_token);
    let mut random_salt = [0u8; 16];
    SystemRandom::new()
        .fill(&mut random_salt)
        .map_err(|_| "Failed to generate cryptographic salt.".to_string())?;

    tauri::async_runtime::spawn_blocking(move || -> Result<LocalMasonSupporter, String> {
        let now = now_secs();
        let expires_at = now + (30 * 86400);
        let effective_id = if mason_id.trim().is_empty() {
            mason_name.trim().to_lowercase().replace(' ', "_")
        } else {
            mason_id.trim().to_string()
        };

        let mut hasher = Sha256::new();
        hasher.update(b"SANCTUARY_SUPPORTER_PASS_V2:");
        hasher.update(effective_id.as_bytes());
        hasher.update(b":");
        hasher.update(provider_norm.as_bytes());
        hasher.update(b":");
        hasher.update(token_fingerprint.as_bytes());
        hasher.update(b":");
        hasher.update(&random_salt);
        let pass_hash = format!("sp_{}", &hex::encode(hasher.finalize())[..24]);

        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;

        // Persist ONLY the one-way SHA-256 fingerprint — NEVER store plaintext OAuth tokens in SQLite!
        conn.execute(
            "INSERT OR REPLACE INTO local_mason_supporters (
                mason_id, mason_name, provider, tier_name, pledge_cents,
                patreon_campaign_id, access_token, cryptographic_pass,
                expedited_support, early_access, verified_at, expires_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 1, ?9, ?10)",
            rusqlite::params![
                effective_id,
                mason_name.trim(),
                provider_norm,
                resolved_tier,
                resolved_pledge_cents,
                patreon_campaign_id.trim(),
                token_fingerprint,
                pass_hash,
                now,
                expires_at
            ],
        )
        .map_err(|e| format!("SQLite Error: {}", e))?;

        Ok(LocalMasonSupporter {
            mason_id: effective_id,
            mason_name: mason_name.trim().to_string(),
            provider: provider_norm,
            tier_name: resolved_tier,
            pledge_cents: resolved_pledge_cents,
            patreon_campaign_id: patreon_campaign_id.trim().to_string(),
            cryptographic_pass: pass_hash,
            expedited_support: true,
            early_access: true,
            verified_at: now,
            expires_at,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn remove_local_mason_supporter(
    vault_path: String,
    mason_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        conn.execute(
            "DELETE FROM local_mason_supporters WHERE mason_id = ?1",
            rusqlite::params![mason_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn import_synced_supporter_vault(
    vault_path: String,
    follows: Vec<LocalMasonFollow>,
    supporters: Vec<LocalMasonSupporter>,
    removed_follow_ids: Vec<String>,
    removed_supporter_ids: Vec<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let now = now_secs();

        for rm_follow in &removed_follow_ids {
            if !rm_follow.trim().is_empty() {
                let _ = conn.execute(
                    "DELETE FROM local_mason_follows WHERE mason_id = ?1",
                    rusqlite::params![rm_follow.trim()],
                );
            }
        }

        for rm_sup in &removed_supporter_ids {
            if !rm_sup.trim().is_empty() {
                let _ = conn.execute(
                    "DELETE FROM local_mason_supporters WHERE mason_id = ?1",
                    rusqlite::params![rm_sup.trim()],
                );
            }
        }

        for f in &follows {
            if f.mason_id.trim().is_empty() {
                continue;
            }
            let _ = conn.execute(
                "INSERT OR REPLACE INTO local_mason_follows (
                    mason_id, mason_name, avatar_url, workspace_id, notify_alerts, followed_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    f.mason_id.trim(),
                    f.mason_name.trim(),
                    f.avatar_url.trim(),
                    f.workspace_id.trim(),
                    if f.notify_alerts { 1 } else { 0 },
                    if f.followed_at > 0 { f.followed_at } else { now }
                ],
            );
        }

        for s in &supporters {
            if s.mason_id.trim().is_empty() || s.expires_at <= now {
                continue;
            }
            let _ = conn.execute(
                "INSERT OR REPLACE INTO local_mason_supporters (
                    mason_id, mason_name, provider, tier_name, pledge_cents,
                    patreon_campaign_id, access_token, cryptographic_pass,
                    expedited_support, early_access, verified_at, expires_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    s.mason_id.trim(),
                    s.mason_name.trim(),
                    s.provider.trim(),
                    s.tier_name.trim(),
                    s.pledge_cents,
                    s.patreon_campaign_id.trim(),
                    s.cryptographic_pass.trim(),
                    if s.expedited_support { 1 } else { 0 },
                    if s.early_access { 1 } else { 0 },
                    if s.verified_at > 0 { s.verified_at } else { now },
                    s.expires_at
                ],
            );
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
    tauri::async_runtime::spawn_blocking(move || -> Result<LocalDevBuildStatus, String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Cryptographically verified application update installer routed exclusively through
/// `tauri_plugin_updater::UpdaterExt` (`app_handle.updater()`), enforcing the Minisign public key
/// and trusted update endpoints configured in `tauri.conf.json`. Never downloads or executes
/// unsigned `.exe`, `.msi`, `.dmg`, or `.AppImage` binaries from arbitrary URLs.
#[tauri::command]
pub async fn download_and_install_update(
    app_handle: tauri::AppHandle,
    download_url: String,
    version: Option<String>,
    is_dev: Option<bool>,
) -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app_handle, download_url, version, is_dev);
        return Err("Signed desktop updater is not supported on mobile targets.".to_string());
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Emitter;
        use tauri_plugin_updater::UpdaterExt;

        let _ = &download_url;
        let clean_ver = version
            .unwrap_or_default()
            .trim()
            .trim_start_matches(|c| c == 'v' || c == 'V')
            .to_string();
        let want_dev = is_dev.unwrap_or_else(|| clean_ver.to_ascii_lowercase().contains("dev"));

        let updater = if want_dev {
            let dev_manifest_endpoint = url::Url::parse(
                "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/dev-latest/latest.json",
            )
            .map_err(|e| format!("Invalid signed dev update endpoint: {}", e))?;
            app_handle
                .updater_builder()
                .endpoints(vec![dev_manifest_endpoint])
                .map_err(|e| format!("Failed to configure signed dev update endpoint: {}", e))?
                .build()
                .map_err(|e| {
                    format!(
                        "Signed updater is not configured in tauri.conf.json (missing Minisign public key or endpoint): {}",
                        e
                    )
                })?
        } else {
            app_handle.updater().map_err(|e| {
                format!(
                    "Signed updater is not configured in tauri.conf.json (missing Minisign public key or endpoint): {}",
                    e
                )
            })?
        };

        let update = updater
            .check()
            .await
            .map_err(|e| {
                format!(
                    "Signed update check failed (manifest missing or signature invalid): {}",
                    e
                )
            })?
            .ok_or_else(|| {
                "No cryptographically signed update is currently available for this platform."
                    .to_string()
            })?;

        let progress_handle_chunk = app_handle.clone();
        let progress_handle_done = app_handle.clone();
        let mut started_emitted = false;

        update
            .download_and_install(
                move |chunk_length, content_length| {
                    if !started_emitted {
                        started_emitted = true;
                        let _ = progress_handle_chunk.emit(
                            "sanctuary-update-progress",
                            serde_json::json!({
                                "event": "Started",
                                "data": { "contentLength": content_length.unwrap_or(0) }
                            }),
                        );
                    }
                    let _ = progress_handle_chunk.emit(
                        "sanctuary-update-progress",
                        serde_json::json!({
                            "event": "Progress",
                            "data": { "chunkLength": chunk_length }
                        }),
                    );
                },
                move || {
                    let _ = progress_handle_done.emit(
                        "sanctuary-update-progress",
                        serde_json::json!({
                            "event": "Finished",
                            "data": {}
                        }),
                    );
                    let _ = progress_handle_done.emit(
                        "sanctuary-update-progress",
                        serde_json::json!({
                            "event": "Installing",
                            "data": {}
                        }),
                    );
                },
            )
            .await
            .map_err(|e| {
                format!(
                    "Signed update verification or installation failed (refusing unsigned binary): {}",
                    e
                )
            })?;

        let _ = app_handle.emit(
            "sanctuary-update-progress",
            serde_json::json!({
                "event": "Relaunching",
                "data": {}
            }),
        );

        app_handle.restart();
    }
}
