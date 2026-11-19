#![allow(unused_imports)]
use crate::utils::{
    atomic_write_bytes, ensure_path_within_roots, ensure_strict_descendant_of_roots,
    get_vault_mods_lane, get_vault_root_dir, is_mods_dir, is_safe_user_file_path, open_db_conn,
    SANCTUARY_EDGE_MANIFEST_FILE, SANCTUARY_EDGE_OVERRIDE_FILE,
};
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use super::types::*;
use super::batch_poller::*;
use super::archive_packager::*;

pub fn resolve_manifest_from_value(
    raw_value: &serde_json::Value,
    artifact_id: &str,
    local_hash: Option<&str>,
) -> Result<EdgeManifest, String> {
    let id_needle = artifact_id.trim().to_lowercase();
    let hash_needle = local_hash
        .map(|h| h.trim().to_lowercase())
        .unwrap_or_default();

    let candidates_opt = if let Some(arr) = raw_value.as_array() {
        Some(arr)
    } else if let Some(arr) = raw_value.get("artifacts").and_then(|v| v.as_array()) {
        Some(arr)
    } else if let Some(arr) = raw_value.get("manifests").and_then(|v| v.as_array()) {
        Some(arr)
    } else {
        None
    };

    if let Some(candidates) = candidates_opt {
        let mut parsed_list: Vec<EdgeManifest> = Vec::new();
        for item in candidates {
            if let Ok(m) = serde_json::from_value::<EdgeManifest>(item.clone()) {
                if is_non_empty_manifest(&m) {
                    parsed_list.push(m);
                }
            }
        }
        if parsed_list.is_empty() {
            return Err("Catalog contained no valid manifest entries".to_string());
        }
        if !id_needle.is_empty() {
            if let Some(found) = parsed_list
                .iter()
                .find(|m| manifest_matches_needle(m, &id_needle))
            {
                return Ok(found.clone());
            }
        }
        if !hash_needle.is_empty() {
            if let Some(found) = parsed_list
                .iter()
                .find(|m| manifest_matches_needle(m, &hash_needle))
            {
                return Ok(found.clone());
            }
        }
        if parsed_list.len() == 1 && id_needle.is_empty() {
            return Ok(parsed_list.remove(0));
        }
        return Err(format!(
            "Artifact '{}' was not found in remote catalog",
            artifact_id
        ));
    }

    if !raw_value.is_object() {
        return Err("Remote JSON payload is not a manifest object or catalog".to_string());
    }

    let parsed: EdgeManifest =
        serde_json::from_value(raw_value.clone()).map_err(|e| format!("JSON parsing failed: {}", e))?;
    if !is_non_empty_manifest(&parsed) {
        return Err("Remote JSON did not contain valid EdgeManifest fields".to_string());
    }
    Ok(parsed)
}

/// Parses an embedded or dropped `.sanctuary.manifest.json` or `.sanctuary.override.json`, merges extracted
/// file hashes and historical lineage hashes, and auto-registers into SQLite `edge_manifests` when no
/// conflicting URL exists for that artifact.
pub fn auto_ingest_edge_json(
    vault_path: &str,
    raw_json: &str,
    extracted_hashes: &[String],
) -> Option<(EdgeOverride, Option<EdgeManifest>, bool)> {
    let val: serde_json::Value = serde_json::from_str(raw_json).ok()?;
    let is_manifest_doc = val.get("artifact").is_some()
        || val.get("payload").is_some()
        || val.get("atomic_logic").is_some();
    let is_override_doc = val.get("manifest_url").is_some()
        && (val.get("artifact_id").is_some() || val.get("target_hash").is_some());

    if !is_manifest_doc && !is_override_doc {
        return None;
    }

    let mut manifest_opt: Option<EdgeManifest> = None;
    let mut ovr = if is_manifest_doc {
        let mut m: EdgeManifest = serde_json::from_value(val.clone()).ok()?;
        for eh in extracted_hashes {
            push_unique_hash(&mut m.current_hashes, eh);
        }
        if m.payload.sha256.trim().is_empty() {
            if let Some(first_h) = extracted_hashes
                .first()
                .or_else(|| m.modules.first().map(|e| &e.sha256))
                .or_else(|| m.current_hashes.first())
            {
                m.payload.sha256 = first_h.clone();
            }
        }
        for mod_entry in &m.modules {
            push_unique_hash(&mut m.current_hashes, &mod_entry.sha256);
        }
        push_unique_hash(&mut m.current_hashes, &m.payload.sha256);

        let mut all_archive_hashes = Vec::new();
        for h in &m.current_hashes {
            if !h.eq_ignore_ascii_case(&m.payload.sha256) {
                push_unique_hash(&mut all_archive_hashes, h);
            }
        }
        for h in &m.previous_hashes {
            push_unique_hash(&mut all_archive_hashes, h);
        }
        for h in &m.atomic_logic.flavors {
            push_unique_hash(&mut all_archive_hashes, h);
        }

        let raw_url = m
            .manifest_url
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        let resolved_url = if !raw_url.is_empty()
            && !is_placeholder_manifest_url(&raw_url)
            && validate_safe_https_url_syntax(&raw_url).is_err()
        {
            String::new()
        } else {
            raw_url
        };
        let resolved_id = if !m.artifact.id.trim().is_empty() {
            m.artifact.id.trim().to_string()
        } else if !m.artifact.name.trim().is_empty() {
            m.artifact.name.trim().to_string()
        } else {
            m.payload.sha256.clone()
        };

        let verified_pubkey = match super::manifest_signing::verify_edge_manifest_signature(&m, None) {
            Ok(pk) => pk,
            Err(_) => return None,
        };
        let meta_str = serde_json::to_string(&m).ok();
        let built = EdgeOverride {
            artifact_id: resolved_id,
            mason_id: m.artifact.author.clone(),
            game_id: m.artifact.game_id.clone(),
            manifest_url: resolved_url,
            target_hash: m.payload.sha256.clone(),
            archive_hashes: all_archive_hashes,
            last_fetched_hash: if m.payload.sha256.is_empty() {
                None
            } else {
                Some(m.payload.sha256.clone())
            },
            last_fetched_metadata: meta_str,
            etag: None,
            last_modified: None,
            last_polled_at: None,
            last_http_status: None,
            creator_pubkey: verified_pubkey,
            subscribed_channel: Some(normalize_release_channel(&m.artifact.channel).to_string()),
        };
        manifest_opt = Some(m);
        built
    } else {
        let mut o: EdgeOverride = serde_json::from_value(val).ok()?;
        if !o.manifest_url.trim().is_empty()
            && !is_placeholder_manifest_url(&o.manifest_url)
            && validate_safe_https_url_syntax(&o.manifest_url).is_err()
        {
            o.manifest_url.clear();
        }
        if o.target_hash.trim().is_empty() {
            if let Some(first_h) = extracted_hashes.first() {
                o.target_hash = first_h.clone();
            }
        }
        for eh in extracted_hashes {
            if !eh.eq_ignore_ascii_case(&o.target_hash) {
                push_unique_hash(&mut o.archive_hashes, eh);
            }
        }
        if let Some(ref meta_str) = o.last_fetched_metadata {
            if let Ok(mut m) = serde_json::from_str::<EdgeManifest>(meta_str) {
                for eh in extracted_hashes {
                    push_unique_hash(&mut m.current_hashes, eh);
                }
                manifest_opt = Some(m);
            }
        }
        o
    };

    if vault_path.trim().is_empty() {
        return Some((ovr, manifest_opt, true));
    }

    let conn_arc = match open_db_conn(vault_path) {
        Ok(c) => c,
        Err(_) => return Some((ovr, manifest_opt, true)),
    };
    let conn = match conn_arc.lock() {
        Ok(g) => g,
        Err(_) => return Some((ovr, manifest_opt, true)),
    };

    let existing_row: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT COALESCE(manifest_url, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests
             WHERE artifact_id = ?1 OR (target_hash != '' AND target_hash = ?2)",
            rusqlite::params![ovr.artifact_id, ovr.target_hash],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let mut auto_accepted = true;
    if let Some((existing_url, existing_target, existing_arch_str, existing_meta)) = existing_row {
        if !is_placeholder_manifest_url(&existing_url)
            && !is_placeholder_manifest_url(&ovr.manifest_url)
            && !existing_url.eq_ignore_ascii_case(&ovr.manifest_url)
        {
            auto_accepted = false;
        }
        if is_placeholder_manifest_url(&ovr.manifest_url) && !existing_url.is_empty() {
            ovr.manifest_url = existing_url;
        }
        if !existing_target.is_empty() && !existing_target.eq_ignore_ascii_case(&ovr.target_hash) {
            push_unique_hash(&mut ovr.archive_hashes, &existing_target);
        }
        if let Ok(existing_arch) = serde_json::from_str::<Vec<String>>(&existing_arch_str) {
            for h in existing_arch {
                if !h.eq_ignore_ascii_case(&ovr.target_hash) {
                    push_unique_hash(&mut ovr.archive_hashes, &h);
                }
            }
        }
        if ovr.last_fetched_metadata.is_none() && !existing_meta.is_empty() {
            ovr.last_fetched_metadata = Some(existing_meta);
        }
    }

    if auto_accepted {
        let now = now_epoch_secs();
        let archive_hashes_str =
            serde_json::to_string(&ovr.archive_hashes).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute(
            "INSERT INTO edge_manifests (
                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                last_fetched_hash, last_fetched_metadata, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(artifact_id) DO UPDATE SET
                mason_id = excluded.mason_id,
                manifest_url = excluded.manifest_url,
                target_hash = excluded.target_hash,
                archive_hashes = excluded.archive_hashes,
                game_id = CASE WHEN excluded.game_id != '' THEN excluded.game_id ELSE edge_manifests.game_id END,
                last_fetched_hash = CASE WHEN excluded.last_fetched_hash != '' THEN excluded.last_fetched_hash ELSE edge_manifests.last_fetched_hash END,
                last_fetched_metadata = CASE WHEN excluded.last_fetched_metadata != '' THEN excluded.last_fetched_metadata ELSE edge_manifests.last_fetched_metadata END",
            rusqlite::params![
                ovr.artifact_id,
                ovr.mason_id,
                ovr.manifest_url,
                ovr.target_hash,
                archive_hashes_str,
                ovr.game_id,
                ovr.last_fetched_hash.clone().unwrap_or_default(),
                ovr.last_fetched_metadata.clone().unwrap_or_default(),
                now
            ],
        );
    }

    Some((ovr, manifest_opt, auto_accepted))
}

#[tauri::command]
pub async fn register_edge_override(
    vault_path: String,
    override_data: EdgeOverride,
) -> Result<(), String> {
    if !override_data.manifest_url.trim().is_empty()
        && !is_placeholder_manifest_url(&override_data.manifest_url)
    {
        validate_safe_https_url_syntax(&override_data.manifest_url)?;
    }

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let now = now_epoch_secs();

        let mut merged_archives = override_data.archive_hashes.clone();
        let mut existing_meta = override_data
            .last_fetched_metadata
            .clone()
            .unwrap_or_default();
        let mut existing_fetched_hash =
            override_data.last_fetched_hash.clone().unwrap_or_default();
        let mut preserve_poll_headers = false;

        if let Ok((old_url, old_target, old_archives_str, old_hash, old_meta)) = conn.query_row(
            "SELECT COALESCE(manifest_url, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_hash, ''), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests WHERE artifact_id = ?1",
            rusqlite::params![override_data.artifact_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        ) {
            preserve_poll_headers = old_url.eq_ignore_ascii_case(override_data.manifest_url.trim());
            if !old_target.is_empty() && !old_target.eq_ignore_ascii_case(&override_data.target_hash) {
                push_unique_hash(&mut merged_archives, &old_target);
            }
            if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&old_archives_str) {
                for h in parsed {
                    if !h.eq_ignore_ascii_case(&override_data.target_hash) {
                        push_unique_hash(&mut merged_archives, &h);
                    }
                }
            }
            if existing_meta.is_empty() && !old_meta.is_empty() {
                existing_meta = old_meta;
            }
            if existing_fetched_hash.is_empty() && !old_hash.is_empty() {
                existing_fetched_hash = old_hash;
            }
        }

        let archive_hashes_str =
            serde_json::to_string(&merged_archives).unwrap_or_else(|_| "[]".to_string());
        if preserve_poll_headers {
            conn.execute(
                "INSERT INTO edge_manifests (
                    artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                    last_fetched_hash, last_fetched_metadata, created_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(artifact_id) DO UPDATE SET
                    mason_id = excluded.mason_id,
                    manifest_url = excluded.manifest_url,
                    target_hash = excluded.target_hash,
                    archive_hashes = excluded.archive_hashes,
                    game_id = excluded.game_id,
                    last_fetched_hash = excluded.last_fetched_hash,
                    last_fetched_metadata = excluded.last_fetched_metadata",
                rusqlite::params![
                    override_data.artifact_id,
                    override_data.mason_id,
                    override_data.manifest_url.trim(),
                    override_data.target_hash,
                    archive_hashes_str,
                    override_data.game_id,
                    existing_fetched_hash,
                    existing_meta,
                    now
                ],
            )
            .map_err(|e| format!("DB Error: {}", e))?;
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO edge_manifests (
                    artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                    last_fetched_hash, last_fetched_metadata, created_at,
                    etag, last_modified, last_polled_at, last_http_status
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, NULL, NULL)",
                rusqlite::params![
                    override_data.artifact_id,
                    override_data.mason_id,
                    override_data.manifest_url.trim(),
                    override_data.target_hash,
                    archive_hashes_str,
                    override_data.game_id,
                    existing_fetched_hash,
                    existing_meta,
                    now
                ],
            )
            .map_err(|e| format!("DB Error: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

pub(super) fn finalize_synced_manifest(
    mut manifest: EdgeManifest,
    manifest_url: &str,
    existing_target_hash: &str,
    existing_archive_str: &str,
) -> (EdgeManifest, String, String, String) {
    if manifest.manifest_url.is_none() {
        manifest.manifest_url = Some(manifest_url.to_string());
    }
    for mod_entry in &manifest.modules {
        push_unique_hash(&mut manifest.current_hashes, &mod_entry.sha256);
    }
    push_unique_hash(&mut manifest.current_hashes, &manifest.payload.sha256);

    let mut archive_hashes: Vec<String> =
        serde_json::from_str(existing_archive_str).unwrap_or_default();
    if !existing_target_hash.is_empty()
        && !existing_target_hash.eq_ignore_ascii_case(&manifest.payload.sha256)
    {
        push_unique_hash(&mut archive_hashes, existing_target_hash);
        if !manifest
            .current_hashes
            .iter()
            .any(|ch| ch.eq_ignore_ascii_case(existing_target_hash))
        {
            push_unique_hash(&mut manifest.previous_hashes, existing_target_hash);
        }
    }
    for h in &manifest.previous_hashes {
        push_unique_hash(&mut archive_hashes, h);
    }
    for h in &manifest.current_hashes {
        if !h.eq_ignore_ascii_case(&manifest.payload.sha256) {
            push_unique_hash(&mut archive_hashes, h);
        }
    }

    let metadata_str = serde_json::to_string(&manifest).unwrap_or_default();
    let updated_archive_str =
        serde_json::to_string(&archive_hashes).unwrap_or_else(|_| "[]".to_string());
    let new_target_hash = if !manifest.payload.sha256.is_empty() {
        manifest.payload.sha256.clone()
    } else {
        existing_target_hash.to_string()
    };

    (manifest, metadata_str, new_target_hash, updated_archive_str)
}

#[tauri::command]
pub async fn fetch_and_sync_edge_manifest(
    vault_path: String,
    artifact_id: String,
) -> Result<EdgeManifest, String> {
    let vp_lookup = vault_path.clone();
    let aid_lookup = artifact_id.clone();
    let (
        resolved_artifact_id,
        manifest_url,
        existing_target_hash,
        existing_archive_str,
        cached_meta_str,
        cached_etag,
        cached_last_mod,
        pinned_creator_pubkey,
        subscribed_channel,
    ): (
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let conn_arc = open_db_conn(&vp_lookup)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let like_pattern = format!("%\"{}\"%", aid_lookup);
        conn.query_row(
            "SELECT artifact_id, manifest_url, COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                    COALESCE(last_fetched_metadata, ''), etag, last_modified, creator_pubkey, subscribed_channel
             FROM edge_manifests
             WHERE artifact_id = ?1 OR target_hash = ?1 OR archive_hashes LIKE ?2",
            rusqlite::params![aid_lookup, like_pattern],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5).ok().flatten(),
                    row.get(6).ok().flatten(),
                    row.get(7).ok().flatten(),
                    row.get(8).ok().flatten(),
                ))
            },
        )
        .map_err(|e| format!("Edge manifest not found: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    if is_placeholder_manifest_url(&manifest_url) {
        return Err("Placeholder manifest URL cannot be polled".to_string());
    }

    let validated_url = validate_safe_https_url(&manifest_url).await?;
    let cached_manifest_opt = if !cached_meta_str.trim().is_empty() {
        serde_json::from_str::<EdgeManifest>(&cached_meta_str)
            .ok()
            .filter(is_non_empty_manifest)
    } else {
        None
    };

    let client = get_http_client();
    let mut req = client
        .get(validated_url)
        .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT);
    if cached_manifest_opt.is_some() {
        if let Some(ref et) = cached_etag {
            if !et.trim().is_empty() {
                req = req.header(reqwest::header::IF_NONE_MATCH, et.trim());
            }
        }
        if let Some(ref lm) = cached_last_mod {
            if !lm.trim().is_empty() {
                req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm.trim());
            }
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    let status = resp.status();
    let status_code = status.as_u16() as i64;
    let now = now_epoch_secs();

    if status == reqwest::StatusCode::NOT_MODIFIED {
        let vp_upd = vault_path.clone();
        let rid = resolved_artifact_id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(conn_arc) = open_db_conn(&vp_upd) {
                if let Ok(conn) = conn_arc.lock() {
                    let _ = conn.execute(
                        "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = 304 WHERE artifact_id = ?2",
                        rusqlite::params![now, rid],
                    );
                }
            }
        })
        .await;
        if let Some(cached) = cached_manifest_opt {
            return Ok(cached);
        }
        return Err("Remote returned 304 Not Modified without local cached metadata".to_string());
    }

    if !status.is_success() {
        let vp_upd = vault_path.clone();
        let rid = resolved_artifact_id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(conn_arc) = open_db_conn(&vp_upd) {
                if let Ok(conn) = conn_arc.lock() {
                    let _ = conn.execute(
                        "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = ?2 WHERE artifact_id = ?3",
                        rusqlite::params![now, status_code, rid],
                    );
                }
            }
        })
        .await;
        return Err(format!(
            "Remote manifest server returned HTTP {}",
            status.as_u16()
        ));
    }

    let new_etag = resp
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or(cached_etag);
    let new_last_modified = resp
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or(cached_last_mod);

    let body_bytes = read_bounded_response_bytes(resp).await?;
    let raw_val = parse_bounded_json(&body_bytes)?;
    let raw_manifest = resolve_manifest_from_value(
        &raw_val,
        &resolved_artifact_id,
        if existing_target_hash.is_empty() {
            None
        } else {
            Some(existing_target_hash.as_str())
        },
    )?;

    let verified_pubkey = super::manifest_signing::verify_edge_manifest_signature(
        &raw_manifest,
        pinned_creator_pubkey.as_deref(),
    )?;
    let channel_manifest = resolve_effective_manifest_for_channel(
        &raw_manifest,
        subscribed_channel.as_deref(),
    );

    let (manifest, metadata_str, new_target_hash, updated_archive_str) = finalize_synced_manifest(
        channel_manifest,
        &manifest_url,
        &existing_target_hash,
        &existing_archive_str,
    );

    let payload_sha = manifest.payload.sha256.clone();
    let updated_pubkey = verified_pubkey
        .or(pinned_creator_pubkey)
        .unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        conn.execute(
            "UPDATE edge_manifests
             SET last_fetched_hash = ?1,
                 last_fetched_metadata = ?2,
                 target_hash = ?3,
                 archive_hashes = ?4,
                 etag = ?5,
                 last_modified = ?6,
                 last_polled_at = ?7,
                 last_http_status = ?8,
                 creator_pubkey = CASE WHEN ?9 != '' THEN ?9 ELSE creator_pubkey END
             WHERE artifact_id = ?10",
            rusqlite::params![
                payload_sha,
                metadata_str,
                new_target_hash,
                updated_archive_str,
                new_etag,
                new_last_modified,
                now,
                status_code,
                updated_pubkey,
                resolved_artifact_id
            ],
        )
        .map_err(|e| format!("Failed to update cache: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(manifest)
}

#[tauri::command]
pub async fn set_edge_subscribed_channel(
    vault_path: String,
    artifact_id: String,
    channel: String,
) -> Result<String, String> {
    let norm = normalize_release_channel(&channel).to_string();
    let norm_ret = norm.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let like_pattern = format!("%\"{}\"%", artifact_id);
        conn.execute(
            "UPDATE edge_manifests SET subscribed_channel = ?1
             WHERE artifact_id = ?2 OR target_hash = ?2 OR archive_hashes LIKE ?3",
            rusqlite::params![norm, artifact_id, like_pattern],
        )
        .map_err(|e| format!("DB error updating release channel: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    Ok(norm_ret)
}
