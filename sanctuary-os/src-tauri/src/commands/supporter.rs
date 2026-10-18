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

