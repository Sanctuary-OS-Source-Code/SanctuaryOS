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
use super::manifest_sync::*;
use super::archive_packager::*;

#[derive(Clone, Default)]
pub(super) struct CachedEdgeRow {
    artifact_id: String,
    mason_id: String,
    manifest_url: String,
    game_id: String,
    target_hash: String,
    archive_hashes_str: String,
    last_fetched_metadata: String,
    etag: Option<String>,
    last_modified: Option<String>,
    last_polled_at: Option<i64>,
    last_http_status: Option<i64>,
    creator_pubkey: Option<String>,
    subscribed_channel: Option<String>,
}

pub(super) enum UrlFetchOutcome {
    NotModified,
    OkJson {
        value: serde_json::Value,
        http_status: u16,
        etag: Option<String>,
        last_modified: Option<String>,
    },
    HttpError {
        http_status: u16,
        message: String,
    },
    TransportError {
        message: String,
    },
}

pub(super) fn manifest_indicates_update(manifest: &EdgeManifest, target: &EdgePollTarget) -> bool {
    if let Some(ref lh) = target.local_hash {
        let lh_trim = lh.trim();
        if !lh_trim.is_empty() {
            let matches_current = (!manifest.payload.sha256.trim().is_empty()
                && manifest.payload.sha256.trim().eq_ignore_ascii_case(lh_trim))
                || manifest
                    .current_hashes
                    .iter()
                    .any(|h| h.trim().eq_ignore_ascii_case(lh_trim))
                || manifest
                    .modules
                    .iter()
                    .any(|m| m.sha256.trim().eq_ignore_ascii_case(lh_trim));
            if matches_current {
                return false;
            }
            if !manifest.payload.sha256.trim().is_empty() || !manifest.current_hashes.is_empty() {
                return true;
            }
        }
    }
    if let Some(ref lv) = target.local_version {
        let lv_clean = lv.trim().trim_start_matches(&['v', 'V'][..]);
        let rv_clean = manifest
            .artifact
            .version
            .trim()
            .trim_start_matches(&['v', 'V'][..]);
        if !lv_clean.is_empty() && !rv_clean.is_empty() && !lv_clean.eq_ignore_ascii_case(rv_clean)
        {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn poll_edge_manifests_batch(
    vault_path: String,
    game_id: String,
    targets: Vec<EdgePollTarget>,
    force: Option<bool>,
) -> Result<Vec<EdgePollItemResult>, String> {
    if targets.is_empty() {
        return Ok(Vec::new());
    }
    let force_poll = force.unwrap_or(false);
    let now = now_epoch_secs();

    let vp_load = vault_path.clone();
    let cached_rows: HashMap<String, CachedEdgeRow> =
        tauri::async_runtime::spawn_blocking(move || -> Result<HashMap<String, CachedEdgeRow>, String> {
            let conn_arc = open_db_conn(&vp_load)?;
            let conn = conn_arc
                .lock()
                .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT artifact_id, mason_id, manifest_url, COALESCE(game_id, ''),
                            COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                            COALESCE(last_fetched_metadata, ''), etag, last_modified,
                            last_polled_at, last_http_status, creator_pubkey, subscribed_channel
                     FROM edge_manifests",
                )
                .map_err(|e| format!("DB query prepare error: {}", e))?;
            let iter = stmt
                .query_map([], |row| {
                    Ok(CachedEdgeRow {
                        artifact_id: row.get(0)?,
                        mason_id: row.get(1)?,
                        manifest_url: row.get(2)?,
                        game_id: row.get(3)?,
                        target_hash: row.get(4)?,
                        archive_hashes_str: row.get(5)?,
                        last_fetched_metadata: row.get(6)?,
                        etag: row.get(7).ok().flatten(),
                        last_modified: row.get(8).ok().flatten(),
                        last_polled_at: row.get(9).ok().flatten(),
                        last_http_status: row.get(10).ok().flatten(),
                        creator_pubkey: row.get(11).ok().flatten(),
                        subscribed_channel: row.get(12).ok().flatten(),
                    })
                })
                .map_err(|e| format!("DB query error: {}", e))?;
            let mut map = HashMap::new();
            for r in iter.flatten() {
                map.insert(r.artifact_id.clone(), r);
            }
            Ok(map)
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    // Pre-resolve effective URLs and identify unique URLs requiring network fetch vs TTL cache hits
    struct PreparedTarget {
        target: EdgePollTarget,
        effective_url: String,
        url_key: String,
        cached_row: Option<CachedEdgeRow>,
        cached_manifest: Option<EdgeManifest>,
        needs_network: bool,
    }

    let mut prepared: Vec<PreparedTarget> = Vec::with_capacity(targets.len());
    // Track per-URL conditional request eligibility: only send If-None-Match / If-Modified-Since
    // for a URL if ALL network-bound targets sharing that URL already have valid cached manifests!
    let mut unique_urls: Vec<String> = Vec::new();
    let mut url_all_have_cache: HashMap<String, bool> = HashMap::new();
    let mut url_cond_headers: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();

    for t in targets {
        let cached_row = cached_rows.get(&t.artifact_id).cloned();
        let effective_url = if !t.manifest_url.trim().is_empty() {
            t.manifest_url.trim().to_string()
        } else {
            cached_row
                .as_ref()
                .map(|r| r.manifest_url.trim().to_string())
                .unwrap_or_default()
        };

        if is_placeholder_manifest_url(&effective_url) {
            prepared.push(PreparedTarget {
                target: t,
                effective_url,
                url_key: String::new(),
                cached_row,
                cached_manifest: None,
                needs_network: false,
            });
            continue;
        }

        let url_key = effective_url.to_lowercase();
        let same_url_as_cached = cached_row
            .as_ref()
            .map(|r| r.manifest_url.trim().eq_ignore_ascii_case(&effective_url))
            .unwrap_or(false);

        let cached_manifest = if same_url_as_cached {
            cached_row
                .as_ref()
                .and_then(|r| {
                    if r.last_fetched_metadata.trim().is_empty() {
                        None
                    } else {
                        serde_json::from_str::<EdgeManifest>(&r.last_fetched_metadata).ok()
                    }
                })
                .filter(is_non_empty_manifest)
        } else {
            None
        };

        let within_ttl = !force_poll
            && same_url_as_cached
            && cached_manifest.is_some()
            && cached_row
                .as_ref()
                .and_then(|r| r.last_polled_at)
                .map(|ts| ts > 0 && now.saturating_sub(ts) < EDGE_POLL_TTL_SECS)
                .unwrap_or(false);

        let needs_network = !within_ttl;
        if needs_network {
            if !url_all_have_cache.contains_key(&url_key) {
                unique_urls.push(effective_url.clone());
                url_all_have_cache.insert(url_key.clone(), true);
            }
            if cached_manifest.is_none() {
                url_all_have_cache.insert(url_key.clone(), false);
            } else if let Some(ref cr) = cached_row {
                url_cond_headers
                    .entry(url_key.clone())
                    .or_insert_with(|| (cr.etag.clone(), cr.last_modified.clone()));
            }
        }

        prepared.push(PreparedTarget {
            target: t,
            effective_url,
            url_key,
            cached_row,
            cached_manifest,
            needs_network,
        });
    }

    // Fetch each unique manifest/catalog URL at most once with Semaphore(8)
    let sem = Arc::new(tokio::sync::Semaphore::new(EDGE_POLL_CONCURRENCY));
    let mut join_set = Vec::with_capacity(unique_urls.len());

    for raw_url in unique_urls {
        let key = raw_url.to_lowercase();
        let allow_cond = url_all_have_cache.get(&key).copied().unwrap_or(false);
        let (etag_opt, last_mod_opt) = if allow_cond {
            url_cond_headers.remove(&key).unwrap_or((None, None))
        } else {
            (None, None)
        };
        let sem_clone = sem.clone();

        join_set.push(tokio::spawn(async move {
            let _permit = sem_clone.acquire_owned().await;
            let validated = match validate_safe_https_url(&raw_url).await {
                Ok(u) => u,
                Err(err_msg) => {
                    return (
                        key,
                        UrlFetchOutcome::TransportError { message: err_msg },
                    );
                }
            };

            let client = get_http_client();
            let mut req = client
                .get(validated)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT);
            if let Some(ref et) = etag_opt {
                if !et.trim().is_empty() {
                    req = req.header(reqwest::header::IF_NONE_MATCH, et.trim());
                }
            }
            if let Some(ref lm) = last_mod_opt {
                if !lm.trim().is_empty() {
                    req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm.trim());
                }
            }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    return (
                        key,
                        UrlFetchOutcome::TransportError {
                            message: format!("HTTP request failed: {}", e),
                        },
                    );
                }
            };

            let status = resp.status();
            let code = status.as_u16();
            if status == reqwest::StatusCode::NOT_MODIFIED {
                return (key, UrlFetchOutcome::NotModified);
            }
            if !status.is_success() {
                return (
                    key,
                    UrlFetchOutcome::HttpError {
                        http_status: code,
                        message: format!("Remote server returned HTTP {}", code),
                    },
                );
            }

            let resp_etag = resp
                .headers()
                .get(reqwest::header::ETAG)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .or(etag_opt);
            let resp_last_mod = resp
                .headers()
                .get(reqwest::header::LAST_MODIFIED)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .or(last_mod_opt);

            let bytes = match read_bounded_response_bytes(resp).await {
                Ok(b) => b,
                Err(msg) => {
                    return (key, UrlFetchOutcome::TransportError { message: msg });
                }
            };
            match parse_bounded_json(&bytes) {
                Ok(val) => (
                    key,
                    UrlFetchOutcome::OkJson {
                        value: val,
                        http_status: code,
                        etag: resp_etag,
                        last_modified: resp_last_mod,
                    },
                ),
                Err(msg) => (key, UrlFetchOutcome::TransportError { message: msg }),
            }
        }));
    }

    let mut outcomes: HashMap<String, UrlFetchOutcome> = HashMap::with_capacity(join_set.len());
    for handle in join_set {
        if let Ok((k, outcome)) = handle.await {
            outcomes.insert(k, outcome);
        }
    }

    // Resolve each target independently (including multi-mod catalog.json entries) and collect DB writes
    enum DbMutation {
        Touch304 {
            artifact_id: String,
            polled_at: i64,
        },
        RecordHttpFailure {
            artifact_id: String,
            polled_at: i64,
            http_status: Option<i64>,
        },
        UpsertSuccess {
            artifact_id: String,
            mason_id: String,
            manifest_url: String,
            game_id: String,
            target_hash: String,
            archive_hashes_str: String,
            last_fetched_hash: String,
            metadata_str: String,
            etag: Option<String>,
            last_modified: Option<String>,
            polled_at: i64,
            http_status: i64,
            creator_pubkey: String,
            subscribed_channel: String,
        },
    }

    let mut results: Vec<EdgePollItemResult> = Vec::with_capacity(prepared.len());
    let mut mutations: Vec<DbMutation> = Vec::new();

    for item in prepared {
        if item.url_key.is_empty() {
            results.push(EdgePollItemResult {
                artifact_id: item.target.artifact_id,
                manifest_url: item.effective_url,
                status: "skipped".to_string(),
                http_status: None,
                manifest: None,
                error: None,
            });
            continue;
        }

        if !item.needs_network {
            if let Some(cached_m) = item.cached_manifest {
                let ch_pref = item
                    .target
                    .preferred_channel
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| {
                        item.cached_row
                            .as_ref()
                            .and_then(|r| r.subscribed_channel.as_deref())
                    });
                let eff_m = resolve_effective_manifest_for_channel(&cached_m, ch_pref);
                let st = if manifest_indicates_update(&eff_m, &item.target) {
                    "update_available"
                } else {
                    "cached"
                };
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: st.to_string(),
                    http_status: item
                        .cached_row
                        .as_ref()
                        .and_then(|r| r.last_http_status)
                        .and_then(|c| u16::try_from(c).ok()),
                    manifest: Some(eff_m),
                    error: None,
                });
                continue;
            }
        }

        match outcomes.get(&item.url_key) {
            Some(UrlFetchOutcome::NotModified) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::Touch304 {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                    });
                }
                if let Some(cached_m) = item.cached_manifest {
                    let ch_pref = item
                        .target
                        .preferred_channel
                        .as_deref()
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| {
                            item.cached_row
                                .as_ref()
                                .and_then(|r| r.subscribed_channel.as_deref())
                        });
                    let eff_m = resolve_effective_manifest_for_channel(&cached_m, ch_pref);
                    let st = if manifest_indicates_update(&eff_m, &item.target) {
                        "update_available"
                    } else {
                        "not_modified"
                    };
                    results.push(EdgePollItemResult {
                        artifact_id: item.target.artifact_id,
                        manifest_url: item.effective_url,
                        status: st.to_string(),
                        http_status: Some(304),
                        manifest: Some(eff_m),
                        error: None,
                    });
                } else {
                    results.push(EdgePollItemResult {
                        artifact_id: item.target.artifact_id,
                        manifest_url: item.effective_url,
                        status: "error".to_string(),
                        http_status: Some(304),
                        manifest: None,
                        error: Some(
                            "Received 304 Not Modified without cached manifest metadata".to_string(),
                        ),
                    });
                }
            }
            Some(UrlFetchOutcome::HttpError {
                http_status,
                message,
            }) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::RecordHttpFailure {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                        http_status: Some(*http_status as i64),
                    });
                }
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: Some(*http_status),
                    manifest: None,
                    error: Some(message.clone()),
                });
            }
            Some(UrlFetchOutcome::TransportError { message }) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::RecordHttpFailure {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                        http_status: None,
                    });
                }
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: None,
                    manifest: None,
                    error: Some(message.clone()),
                });
            }
            Some(UrlFetchOutcome::OkJson {
                value,
                http_status,
                etag,
                last_modified,
            }) => {
                let fallback_hash = item
                    .target
                    .local_hash
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| {
                        item.cached_row
                            .as_ref()
                            .map(|r| r.target_hash.as_str())
                            .filter(|s| !s.trim().is_empty())
                    });

                match resolve_manifest_from_value(value, &item.target.artifact_id, fallback_hash) {
                    Ok(raw_manifest) => {
                        let pinned_pk = item
                            .cached_row
                            .as_ref()
                            .and_then(|r| r.creator_pubkey.as_deref());
                        let verified_pubkey = match super::manifest_signing::verify_edge_manifest_signature(&raw_manifest, pinned_pk) {
                            Ok(pk) => pk,
                            Err(sig_err) => {
                                results.push(EdgePollItemResult {
                                    artifact_id: item.target.artifact_id,
                                    manifest_url: item.effective_url,
                                    status: "error".to_string(),
                                    http_status: Some(*http_status),
                                    manifest: None,
                                    error: Some(sig_err),
                                });
                                continue;
                            }
                        };

                        let preferred_ch = item
                            .target
                            .preferred_channel
                            .as_deref()
                            .filter(|s| !s.trim().is_empty())
                            .or_else(|| {
                                item.cached_row
                                    .as_ref()
                                    .and_then(|r| r.subscribed_channel.as_deref())
                            })
                            .unwrap_or("stable");
                        let channel_norm = normalize_release_channel(preferred_ch).to_string();
                        let channel_manifest =
                            resolve_effective_manifest_for_channel(&raw_manifest, Some(&channel_norm));

                        let existing_target = item
                            .cached_row
                            .as_ref()
                            .map(|r| r.target_hash.as_str())
                            .or_else(|| item.target.local_hash.as_deref())
                            .unwrap_or("");
                        let existing_arch = item
                            .cached_row
                            .as_ref()
                            .map(|r| r.archive_hashes_str.as_str())
                            .unwrap_or("[]");

                        let (manifest, metadata_str, new_target_hash, updated_archive_str) =
                            finalize_synced_manifest(
                                channel_manifest,
                                &item.effective_url,
                                existing_target,
                                existing_arch,
                            );

                        let mason_id = if !manifest.artifact.author.trim().is_empty() {
                            manifest.artifact.author.trim().to_string()
                        } else {
                            item.cached_row
                                .as_ref()
                                .map(|r| r.mason_id.clone())
                                .unwrap_or_default()
                        };
                        let resolved_game_id = if !game_id.trim().is_empty() {
                            game_id.trim().to_string()
                        } else if !manifest.artifact.game_id.trim().is_empty() {
                            manifest.artifact.game_id.trim().to_string()
                        } else {
                            item.cached_row
                                .as_ref()
                                .map(|r| r.game_id.clone())
                                .unwrap_or_default()
                        };

                        mutations.push(DbMutation::UpsertSuccess {
                            artifact_id: item.target.artifact_id.clone(),
                            mason_id,
                            manifest_url: item.effective_url.clone(),
                            game_id: resolved_game_id,
                            target_hash: new_target_hash,
                            archive_hashes_str: updated_archive_str,
                            last_fetched_hash: manifest.payload.sha256.clone(),
                            metadata_str,
                            etag: etag.clone(),
                            last_modified: last_modified.clone(),
                            polled_at: now,
                            http_status: *http_status as i64,
                            creator_pubkey: verified_pubkey
                                .or_else(|| pinned_pk.map(|s| s.to_string()))
                                .unwrap_or_default(),
                            subscribed_channel: channel_norm,
                        });

                        let st = if manifest_indicates_update(&manifest, &item.target) {
                            "update_available"
                        } else {
                            "up_to_date"
                        };
                        results.push(EdgePollItemResult {
                            artifact_id: item.target.artifact_id,
                            manifest_url: item.effective_url,
                            status: st.to_string(),
                            http_status: Some(*http_status),
                            manifest: Some(manifest),
                            error: None,
                        });
                    }
                    Err(parse_err) => {
                        if item.cached_row.is_some() {
                            mutations.push(DbMutation::RecordHttpFailure {
                                artifact_id: item.target.artifact_id.clone(),
                                polled_at: now,
                                http_status: Some(*http_status as i64),
                            });
                        }
                        results.push(EdgePollItemResult {
                            artifact_id: item.target.artifact_id,
                            manifest_url: item.effective_url,
                            status: "error".to_string(),
                            http_status: Some(*http_status),
                            manifest: None,
                            error: Some(parse_err),
                        });
                    }
                }
            }
            None => {
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: None,
                    manifest: None,
                    error: Some("Polling worker did not return an outcome".to_string()),
                });
            }
        }
    }

    if !mutations.is_empty() {
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let conn_arc = open_db_conn(&vault_path)?;
            let mut conn = conn_arc
                .lock()
                .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
            let tx = conn
                .transaction()
                .map_err(|e| format!("Failed to begin DB transaction: {}", e))?;
            for m in mutations {
                match m {
                    DbMutation::Touch304 {
                        artifact_id,
                        polled_at,
                    } => {
                        let _ = tx.execute(
                            "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = 304 WHERE artifact_id = ?2",
                            rusqlite::params![polled_at, artifact_id],
                        );
                    }
                    DbMutation::RecordHttpFailure {
                        artifact_id,
                        polled_at,
                        http_status,
                    } => {
                        let _ = tx.execute(
                            "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = COALESCE(?2, last_http_status) WHERE artifact_id = ?3",
                            rusqlite::params![polled_at, http_status, artifact_id],
                        );
                    }
                    DbMutation::UpsertSuccess {
                        artifact_id,
                        mason_id,
                        manifest_url,
                        game_id,
                        target_hash,
                        archive_hashes_str,
                        last_fetched_hash,
                        metadata_str,
                        etag,
                        last_modified,
                        polled_at,
                        http_status,
                        creator_pubkey,
                        subscribed_channel,
                    } => {
                        let _ = tx.execute(
                            "INSERT INTO edge_manifests (
                                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                                last_fetched_hash, last_fetched_metadata, created_at,
                                etag, last_modified, last_polled_at, last_http_status,
                                creator_pubkey, subscribed_channel
                             )
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                             ON CONFLICT(artifact_id) DO UPDATE SET
                                mason_id = excluded.mason_id,
                                manifest_url = excluded.manifest_url,
                                target_hash = excluded.target_hash,
                                archive_hashes = excluded.archive_hashes,
                                game_id = CASE WHEN excluded.game_id != '' THEN excluded.game_id ELSE edge_manifests.game_id END,
                                last_fetched_hash = excluded.last_fetched_hash,
                                last_fetched_metadata = excluded.last_fetched_metadata,
                                etag = excluded.etag,
                                last_modified = excluded.last_modified,
                                last_polled_at = excluded.last_polled_at,
                                last_http_status = excluded.last_http_status,
                                creator_pubkey = CASE WHEN excluded.creator_pubkey != '' THEN excluded.creator_pubkey ELSE edge_manifests.creator_pubkey END",
                            rusqlite::params![
                                artifact_id,
                                mason_id,
                                manifest_url,
                                target_hash,
                                archive_hashes_str,
                                game_id,
                                last_fetched_hash,
                                metadata_str,
                                polled_at,
                                etag,
                                last_modified,
                                polled_at,
                                http_status,
                                creator_pubkey,
                                subscribed_channel
                            ],
                        );
                    }
                }
            }
            tx.commit()
                .map_err(|e| format!("Failed to commit poll batch: {}", e))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_all_edge_manifests(
    vault_path: String,
    game_id: Option<String>,
) -> Result<Vec<EdgeOverride>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<EdgeOverride>, String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let gid_param = game_id.map(|g| g.trim().to_string());
        let mut stmt = conn
            .prepare(
                "SELECT artifact_id, mason_id, manifest_url, COALESCE(game_id, ''),
                        COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                        last_fetched_hash, last_fetched_metadata,
                        etag, last_modified, last_polled_at, last_http_status,
                        creator_pubkey, subscribed_channel
                 FROM edge_manifests
                 WHERE (?1 IS NULL OR ?1 = '' OR game_id = ?1)",
            )
            .map_err(|e| format!("{}", e))?;
        let iter = stmt
            .query_map(rusqlite::params![gid_param], |row| {
                let archive_str: String = row.get(5).unwrap_or_else(|_| "[]".to_string());
                let archive_hashes: Vec<String> =
                    serde_json::from_str(&archive_str).unwrap_or_default();
                Ok(EdgeOverride {
                    artifact_id: row.get(0)?,
                    mason_id: row.get(1)?,
                    manifest_url: row.get(2)?,
                    game_id: row.get(3).unwrap_or_default(),
                    target_hash: row.get(4).unwrap_or_default(),
                    archive_hashes,
                    last_fetched_hash: row.get(6).ok(),
                    last_fetched_metadata: row.get(7).ok(),
                    etag: row.get(8).ok().flatten(),
                    last_modified: row.get(9).ok().flatten(),
                    last_polled_at: row.get(10).ok().flatten(),
                    last_http_status: row.get(11).ok().flatten(),
                    creator_pubkey: row.get(12).ok().flatten().filter(|s: &String| !s.trim().is_empty()),
                    subscribed_channel: row.get(13).ok().flatten().filter(|s: &String| !s.trim().is_empty()),
                })
            })
            .map_err(|e| format!("{}", e))?;

        let mut overrides = Vec::new();
        for row in iter.flatten() {
            overrides.push(row);
        }
        Ok(overrides)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
