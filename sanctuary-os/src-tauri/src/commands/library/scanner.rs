#[allow(unused_imports)]
use crate::commands::game_info::get_heuristic_signatures;
#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use crate::utils::*;
#[allow(unused_imports)]
use rayon::prelude::*;
#[allow(unused_imports)]
use std::collections::HashSet;
#[allow(unused_imports)]
use std::fs;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use std::sync::Arc;
#[allow(unused_imports)]
use std::time::SystemTime;
#[allow(unused_imports)]
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::{ingest::*, workbench_and_assets::*};

pub(super) struct TempStagingGuard(pub(super) PathBuf);
impl Drop for TempStagingGuard {
    fn drop(&mut self) {
        if !self.0.as_os_str().is_empty() && self.0.exists() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

pub(super) fn is_edge_sidecar_filename(fname_lower: &str) -> bool {
    fname_lower == SANCTUARY_EDGE_MANIFEST_FILE || fname_lower == SANCTUARY_EDGE_OVERRIDE_FILE
}

/// Verifies that an incoming archive claiming lineage over `existing_hash` corresponds to an
/// already-registered `artifact_id` or verified `https://` `manifest_url` in `edge_manifests`
/// whose own recorded hashes include `existing_hash`. Prevents untrusted dropped archives from
/// spoofing `previous_hashes` or `artifact_id` to overwrite unrelated mods.
pub(super) fn verify_trusted_lineage_upgrade(
    vault_path: &str,
    existing_hash: &str,
    incoming_artifact_id: Option<&str>,
    incoming_manifest_url: Option<&str>,
    lineage_known_hashes: &[String],
) -> bool {
    let existing_lower = existing_hash.trim().to_lowercase();
    if existing_lower.is_empty()
        || !lineage_known_hashes
            .iter()
            .any(|h| h.eq_ignore_ascii_case(&existing_lower))
    {
        return false;
    }

    let clean_aid = incoming_artifact_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let clean_url = incoming_manifest_url
        .map(|s| s.trim())
        .filter(|u| {
            u.starts_with("https://")
                && !u.contains("your-domain.com")
                && !u.contains("example.com")
                && !u.contains("localhost")
        });

    if clean_aid.is_none() && clean_url.is_none() {
        return false;
    }

    let Ok(db) = open_db_conn(vault_path) else {
        return false;
    };
    let Ok(conn) = db.lock() else {
        return false;
    };

    let mut stmt = match conn.prepare(
        "SELECT artifact_id, manifest_url, target_hash, archive_hashes, last_fetched_hash
         FROM edge_manifests",
    ) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let rows = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0).unwrap_or_default(),
            row.get::<_, String>(1).unwrap_or_default(),
            row.get::<_, String>(2).unwrap_or_default(),
            row.get::<_, String>(3).unwrap_or_default(),
            row.get::<_, Option<String>>(4).ok().flatten().unwrap_or_default(),
        ))
    }) {
        Ok(r) => r,
        Err(_) => return false,
    };

    for row in rows.flatten() {
        let (db_aid, db_url, db_target_hash, db_archive_json, db_last_fetched_hash) = row;
        let aid_matches = clean_aid
            .map(|aid| !db_aid.trim().is_empty() && db_aid.trim().eq_ignore_ascii_case(aid))
            .unwrap_or(false);
        let url_matches = clean_url
            .map(|u| {
                let dbu = db_url.trim();
                dbu.starts_with("https://") && dbu.eq_ignore_ascii_case(u)
            })
            .unwrap_or(false);

        if !aid_matches && !url_matches {
            continue;
        }

        // Confirm the registered Edge entry actually owns the existing local binary hash
        if db_target_hash.trim().eq_ignore_ascii_case(&existing_lower)
            || db_last_fetched_hash
                .trim()
                .eq_ignore_ascii_case(&existing_lower)
        {
            return true;
        }
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(&db_archive_json) {
            if arr.iter().any(|h| h.trim().eq_ignore_ascii_case(&existing_lower)) {
                return true;
            }
        }
    }

    false
}

#[tauri::command]
pub async fn scan_bunker(
    app: tauri::AppHandle,
    vault_path: String,
    _shelter_active: bool,
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<ModData>, String> {
    let game_schema = app_state.active_schema.lock().unwrap().clone();
    let malware_override = state
        .malware_protocol_overridden
        .load(std::sync::atomic::Ordering::SeqCst);
    let is_deploying = app_state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = app_state.inner().last_deploy_epoch_ms.clone();
    let malware_hashes_set: HashSet<String> = if let Ok(m) = state.malware_hashes.lock() {
        m.iter().cloned().collect()
    } else {
        HashSet::new()
    };
    let verified_hashes_set: HashSet<String> = if let Ok(v) = state.tier2_hashes.lock() {
        v.iter().cloned().collect()
    } else {
        HashSet::new()
    };

    let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<ModData>, String>>();

    let spawn_res = std::thread::Builder::new()
        .name("sanctuary-malware-scanner".to_string())
        .spawn(move || {
            struct ScanDeployGuard {
                flag: Arc<std::sync::atomic::AtomicBool>,
                epoch: Arc<std::sync::atomic::AtomicU64>,
                owned: bool,
            }
            impl Drop for ScanDeployGuard {
                fn drop(&mut self) {
                    if self.owned {
                        self.epoch.store(
                            crate::utils::current_epoch_ms(),
                            std::sync::atomic::Ordering::SeqCst,
                        );
                        self.flag.store(false, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            }
            let acquired_flag = is_deploying
                .compare_exchange(
                    false,
                    true,
                    std::sync::atomic::Ordering::SeqCst,
                    std::sync::atomic::Ordering::SeqCst,
                )
                .is_ok();
            let _guard = ScanDeployGuard {
                flag: is_deploying,
                epoch: last_deploy_epoch_ms,
                owned: acquired_flag,
            };

            let res: Result<Vec<ModData>, String> = (|| {
                let heuristic_sigs =
                    get_heuristic_signatures(vault_path.clone()).unwrap_or_else(|_| vec![]);
                let compiled_sigs = CompiledSignatures::new(&heuristic_sigs);
                let current_sigs_version = compute_signatures_version(&heuristic_sigs);

                let vault_dir = crate::utils::get_vault_root_dir(&vault_path);
                let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);

                crate::commands::shelter::reconcile_false_positive_quarantine(
                    &vault_path,
                    &game_schema,
                    &malware_hashes_set,
                );

                let mut cache = load_cache(&vault_path);
                let mut cache_updated = false;

                if !mods_lane.exists() {
                    let _ = fs::create_dir_all(&mods_lane);
                    return Ok(vec![]);
                }

                let config_exts = crate::game_logic::get_config_extensions(&game_schema);
                crate::utils::deduplicate_vault_root_configs(&mods_lane, &config_exts, &game_schema);

                let manifest_name_lower =
                    crate::game_logic::resolve_manifest_leaf_lower(&game_schema);
                let editable_exts = crate::game_logic::get_editable_config_extensions(&game_schema);
                let supported_exts = crate::game_logic::get_supported_extensions(&game_schema);

                let should_wrap_loose_files = game_schema
                    .as_ref()
                    .and_then(|s| s.constraints.as_ref())
                    .and_then(|c| c.wrap_loose_files_in_folders)
                    .unwrap_or(true);

                if should_wrap_loose_files {
                    if let Ok(entries) = std::fs::read_dir(&mods_lane) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_file() {
                                let fname_lower = path
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or_default()
                                    .to_lowercase();
                                if (!manifest_name_lower.is_empty()
                                    && fname_lower == manifest_name_lower)
                                    || fname_lower == "desktop.ini"
                                    || fname_lower.starts_with('.')
                                {
                                    continue;
                                }
                                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                                    let ext_lower = ext.to_lowercase();
                                    if config_exts.contains(&ext_lower)
                                        || editable_exts.contains(&ext_lower)
                                        || crate::game_logic::is_archive_container_extension(
                                            &ext_lower,
                                            &game_schema,
                                        )
                                        || ext_lower == "log"
                                    {
                                        continue;
                                    }
                                    if supported_exts.contains(&ext_lower) {
                                        if let Some(file_stem) = path.file_stem() {
                                            let folder_name =
                                                file_stem.to_string_lossy().to_string();
                                            let target_dir = mods_lane.join(&folder_name);
                                            let _ = std::fs::create_dir_all(&target_dir);

                                            let target_path =
                                                target_dir.join(path.file_name().unwrap());
                                            let old_path_str = path.to_string_lossy().to_string();
                                            if std::fs::rename(&path, &target_path).is_ok() {
                                                if let Some(entry) = cache.remove(&old_path_str) {
                                                    cache.insert(
                                                        target_path.to_string_lossy().to_string(),
                                                        entry,
                                                    );
                                                    cache_updated = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let mut paths = Vec::new();
                walk_packages(&game_schema, &mods_lane, &mut paths);
                paths.sort();

                let total = paths.len();
                let mut valid_paths_set: HashSet<String> = HashSet::with_capacity(total);

                struct PlannedScanItem {
                    path: PathBuf,
                    path_str: String,
                    rel: String,
                    mtime: u64,
                    is_script: bool,
                    needs_hash: bool,
                    dna_hash: String,
                    explicitly_local: bool,
                    heuristic_sig: Option<String>,
                    matched_entry: Option<String>,
                    detection_type: String,
                }

                let mut items: Vec<PlannedScanItem> = Vec::with_capacity(total);
                let mut uncached_indices: Vec<usize> = Vec::new();

                for (idx, path) in paths.into_iter().enumerate() {
                    let path_str = path.to_string_lossy().to_string();
                    valid_paths_set.insert(path_str.clone());
                    let rel = path
                        .strip_prefix(&mods_lane)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    let mtime = fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let is_script = path.extension().map_or(false, |ext| {
                        crate::game_logic::get_file_label(&game_schema, &ext.to_string_lossy())
                            == "SCRIPT"
                    });

                    if let Some(cached) = cache.get_mut(&path_str) {
                        if cached.mtime == mtime && !cached.dna_hash.is_empty() {
                            let sigs_valid = cached.heuristic_sigs_mtime == current_sigs_version;
                            let is_known_hash = malware_hashes_set.contains(&cached.dna_hash)
                                || verified_hashes_set.contains(&cached.dna_hash);
                            let needs_heuristic = !is_known_hash && !sigs_valid;
                            if needs_heuristic {
                                uncached_indices.push(idx);
                            }
                            items.push(PlannedScanItem {
                                path,
                                path_str,
                                rel,
                                mtime,
                                is_script,
                                needs_hash: false,
                                dna_hash: cached.dna_hash.clone(),
                                explicitly_local: cached.explicitly_local,
                                heuristic_sig: if sigs_valid {
                                    cached.heuristic_malware_sig.clone()
                                } else {
                                    None
                                },
                                matched_entry: None,
                                detection_type: if cached.heuristic_malware_sig.is_some() {
                                    "heuristic_signature".to_string()
                                } else {
                                    "hash_blacklist".to_string()
                                },
                            });
                            continue;
                        }
                    }

                    uncached_indices.push(idx);
                    items.push(PlannedScanItem {
                        path,
                        path_str,
                        rel,
                        mtime,
                        is_script,
                        needs_hash: true,
                        dna_hash: String::new(),
                        explicitly_local: false,
                        heuristic_sig: None,
                        matched_entry: None,
                        detection_type: "hash_blacklist".to_string(),
                    });
                }

                // Phase 2: Parallel Rayon inspection of uncached/stale files in bounded chunks
                // with non-destructive incremental SQLite batch upserts
                if !uncached_indices.is_empty() {
                    let uncached_total = uncached_indices.len();
                    let mut scanned_so_far = 0usize;

                    for chunk in uncached_indices.chunks(128) {
                        let computed: Vec<(
                            usize,
                            String,
                            bool,
                            Option<String>,
                            Option<String>,
                            String,
                        )> = chunk
                            .par_iter()
                            .map(|&item_idx| {
                                let item = &items[item_idx];
                                let (dna_hash, explicitly_local) = if item.needs_hash {
                                    let lower_path = item.path_str.to_lowercase();
                                    let is_dev_folder = lower_path.contains("/dev/")
                                        || lower_path.contains("\\dev\\");
                                    let h = if is_dev_folder {
                                        format!(
                                            "dev_vault_{}",
                                            item.path
                                                .file_name()
                                                .unwrap_or_default()
                                                .to_string_lossy()
                                        )
                                    } else {
                                        calculate_hash(&item.path).unwrap_or_default()
                                    };
                                    let explicit = check_is_explicitly_local(
                                        &item.path,
                                        item.is_script,
                                        &game_schema,
                                    );
                                    (h, explicit)
                                } else {
                                    (item.dna_hash.clone(), item.explicitly_local)
                                };

                                let mut h_sig: Option<String> = None;
                                let mut matched_entry: Option<String> = None;
                                let mut det_type = "hash_blacklist".to_string();

                                if !malware_override
                                    && !malware_hashes_set.contains(&dna_hash)
                                    && !verified_hashes_set.contains(&dna_hash)
                                {
                                    if let Some(detail) =
                                        check_heuristic_malware_detailed(&item.path, &compiled_sigs)
                                    {
                                        h_sig = Some(detail.signature);
                                        matched_entry = detail.matched_entry;
                                        det_type = detail.detection_type;
                                    }
                                }

                                (
                                    item_idx,
                                    dna_hash,
                                    explicitly_local,
                                    h_sig,
                                    matched_entry,
                                    det_type,
                                )
                            })
                            .collect();

                        let mut batch_upserts: Vec<(String, CacheEntry)> =
                            Vec::with_capacity(computed.len());
                        for (
                            item_idx,
                            dna_hash,
                            explicitly_local,
                            h_sig,
                            matched_entry,
                            det_type,
                        ) in computed
                        {
                            let item = &mut items[item_idx];
                            item.dna_hash = dna_hash.clone();
                            item.explicitly_local = explicitly_local;
                            item.heuristic_sig = h_sig.clone();
                            item.matched_entry = matched_entry;
                            item.detection_type = det_type;

                            let entry = CacheEntry {
                                mtime: item.mtime,
                                dna_hash,
                                explicitly_local,
                                quarantined: false,
                                heuristic_malware_sig: h_sig,
                                heuristic_sigs_mtime: current_sigs_version,
                            };
                            cache.insert(item.path_str.clone(), entry.clone());
                            batch_upserts.push((item.path_str.clone(), entry));
                        }

                        save_cache_entries_batch(&vault_path, &batch_upserts);
                        scanned_so_far += chunk.len();
                        let progress_current = chunk.last().map(|&i| i + 1).unwrap_or(total);
                        let _ = app.emit(
                            "scan-progress",
                            serde_json::json!({
                                "current": progress_current,
                                "total": total,
                                "uncached_scanned": scanned_so_far,
                                "uncached_total": uncached_total,
                                "message": format!("ANALYZING DNA: {}/{}", progress_current, total)
                            }),
                        );
                    }
                }

                // Phase 3: Assemble ModData & quarantine any detected threats
                let mut results = Vec::with_capacity(total);
                for item in items {
                    let is_hash_malware = malware_hashes_set.contains(&item.dna_hash);
                    let is_malware = !malware_override
                        && (is_hash_malware
                            || (!verified_hashes_set.contains(&item.dna_hash)
                                && item.heuristic_sig.is_some()));

                    if is_malware {
                        let signature_name = if is_hash_malware {
                            "NO SIGNATURE MATCH".to_string()
                        } else {
                            item.heuristic_sig
                                .clone()
                                .unwrap_or_else(|| "NO SIGNATURE MATCH".to_string())
                        };
                        let detection_type_str = if is_hash_malware {
                            "hash_blacklist".to_string()
                        } else {
                            item.detection_type.clone()
                        };

                        let reports_dir = vault_dir.join("Quarantine");
                        let malware_dir = vault_dir.join(".sanctuary_quarantine");
                        let _ = fs::create_dir_all(&reports_dir);
                        let _ = fs::create_dir_all(&malware_dir);
                        crate::utils::mark_path_hidden(&malware_dir);
                        let file_size_bytes = fs::metadata(&item.path).map(|m| m.len()).ok();
                        let file_extension = item
                            .path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| format!(".{}", e.to_lowercase()));
                        let orig_q_name = item
                            .path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let unique_q_name = crate::utils::resolve_unique_quarantine_filename(
                            &malware_dir,
                            &reports_dir,
                            &orig_q_name,
                            &item.dna_hash,
                        );
                        let target = malware_dir.join(&unique_q_name);
                        let _ = fs::rename(&item.path, &target).or_else(|_| {
                            fs::copy(&item.path, &target)
                                .and_then(|_| fs::remove_file(&item.path))
                        });

                        let manifest = QuarantineManifest {
                            artifact_name: orig_q_name,
                            detected_hash: item.dna_hash.clone(),
                            signature: signature_name.clone(),
                            quarantine_path: obscure_username(&target.to_string_lossy()),
                            original_path: Some(item.rel.replace('\\', "/")),
                            original_hash_at_import: None,
                            original_exists: false,
                            original_shredded: false,
                            quarantined_file_shredded: false,
                            detected_at: chrono::Local::now().to_rfc3339(),
                            source_moved: false,
                            ingest_mode: Some("radar_sweep".to_string()),
                            file_size_bytes,
                            file_extension: file_extension.clone(),
                            matched_entry: item.matched_entry.clone(),
                            detection_type: Some(detection_type_str),
                        };
                        let manifest_path =
                            reports_dir.join(format!("{}.manifest.json", unique_q_name));
                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                            let _ = crate::utils::atomic_write_bytes(&manifest_path, json.as_bytes());
                        }

                        let _ = app.emit(
                            "malware_detected",
                            serde_json::json!({
                                "path": target.to_string_lossy().to_string(),
                                "name": item.path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                "hash": item.dna_hash,
                                "status": "QUARANTINED",
                                "isLocalOverride": false,
                                "isVirtual": false,
                                "compliance_tier": 5,
                                "original_exists": manifest.original_exists,
                                "original_shredded": manifest.original_shredded,
                                "original_path": manifest.original_path,
                                "quarantine_path": manifest.quarantine_path,
                                "matched_signature": manifest.signature,
                                "source_moved": manifest.source_moved,
                                "ingest_mode": manifest.ingest_mode,
                                "file_size_bytes": manifest.file_size_bytes,
                                "file_extension": manifest.file_extension,
                                "matched_entry": manifest.matched_entry,
                                "detection_type": manifest.detection_type
                            }),
                        );

                        valid_paths_set.remove(&item.path_str);
                        cache.remove(&item.path_str);
                        let target_str = target.to_string_lossy().to_string();
                        cache.insert(
                            target_str,
                            CacheEntry {
                                mtime: item.mtime,
                                dna_hash: item.dna_hash.clone(),
                                explicitly_local: false,
                                quarantined: true,
                                heuristic_malware_sig: Some(signature_name),
                                heuristic_sigs_mtime: current_sigs_version,
                            },
                        );
                        cache_updated = true;

                        results.push(ModData {
                            name: item.rel.replace("\\", "/"),
                            hash: item.dna_hash,
                            status: "QUARANTINED".to_string(),
                            color: "var(--danger)".to_string(),
                            is_script: item.is_script,
                            mtime: item.mtime,
                        });
                        continue;
                    }

                    let status_string = if item.explicitly_local {
                        "EXPLICIT LOCAL".to_string()
                    } else {
                        "LOCAL_ONLY".to_string()
                    };

                    results.push(ModData {
                        name: item.rel.replace("\\", "/"),
                        hash: item.dna_hash,
                        status: status_string,
                        color: "var(--text-sub)".to_string(),
                        is_script: item.is_script,
                        mtime: item.mtime,
                    });
                }

                if cache_updated {
                    save_cache(&vault_path, &cache);
                }
                // Prune deleted paths ONLY after a completed full scan sweep
                crate::utils::prune_stale_cache_entries(&vault_path, &valid_paths_set);

                Ok(results)
            })();
            let _ = tx.send(res);
        });

    if let Err(e) = spawn_res {
        return Err(format!("Failed to spawn background scanner: {}", e));
    }

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .map_err(|e| format!("Scanner channel closed: {}", e))?
    })
    .await
    .map_err(|e| format!("Scanner join error: {}", e))?
}

pub fn extract_sandbox_zip_in_place(
    zip_path: &Path,
    target_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> usize {
    let zip_stem = zip_path.file_stem().and_then(|s| s.to_str());
    match crate::utils::extract_zip_bounded_to_dir(
        zip_path,
        target_dir,
        zip_stem,
        game_schema,
        MAX_ARCHIVE_ENTRY_BYTES,
        MAX_ARCHIVE_TOTAL_BYTES,
    ) {
        Ok(extracted) => extracted.files.len(),
        Err(_) => 0,
    }
}

#[tauri::command]
pub async fn scan_sandbox(
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ModData>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let vault_root = crate::utils::get_vault_root_dir(&vault_path);
        let dev_lane = vault_root.join("Dev").join("Sandbox");

        if !dev_lane.exists() {
            let _ = fs::create_dir_all(&dev_lane);
            return Ok(vec![]);
        }

        let mut initial_paths = Vec::new();
        fn walk_sandbox_files(dir: &Path, paths: &mut Vec<PathBuf>) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(&p) {
                        continue;
                    }
                    if p.is_dir() {
                        walk_sandbox_files(&p, paths);
                    } else {
                        paths.push(p);
                    }
                }
            }
        }
        walk_sandbox_files(&dev_lane, &mut initial_paths);

        // Automatically unpack ONLY top-level dropped `.zip` archives sitting directly in `Dev/Sandbox/`,
        // never nested Mason exported `<SafeName>_v<Ver>.zip` bundles inside `Dev/Sandbox/<mod_dir>/`,
        // and never when the active schema treats `.zip` as a native module container.
        let zip_is_archive =
            crate::game_logic::is_archive_container_extension("zip", &game_schema);
        let mut unpacked_any = false;
        if zip_is_archive {
            for p in &initial_paths {
                if p.parent() == Some(dev_lane.as_path())
                    && p.extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
                {
                    let stem = p
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let target_dir = dev_lane.join(stem);
                    if crate::utils::ensure_strict_descendant_of_roots(
                        &target_dir,
                        &[dev_lane.clone()],
                    )
                    .is_ok()
                        && extract_sandbox_zip_in_place(p, &target_dir, &game_schema) > 0
                    {
                        let _ = std::fs::remove_file(p);
                        unpacked_any = true;
                    }
                }
            }
        }

        let mut paths = Vec::new();
        if unpacked_any {
            walk_sandbox_files(&dev_lane, &mut paths);
        } else {
            paths = initial_paths;
        }

        let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(&game_schema);

        let mut results = Vec::new();
        for path in paths {
            let fname_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let ext_lower = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            if fname_lower.starts_with('.')
                || fname_lower == "desktop.ini"
                || is_edge_sidecar_filename(&fname_lower)
                || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
                || (!ext_lower.is_empty()
                    && crate::game_logic::is_archive_container_extension(&ext_lower, &game_schema))
            {
                continue;
            }

            let rel = path
                .strip_prefix(&dev_lane)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            let is_script = path.extension().map_or(false, |ext| {
                crate::game_logic::get_file_label(&game_schema, &ext.to_string_lossy()) == "SCRIPT"
            });
            let hash = format!(
                "dev_sandbox_{}",
                path.file_name().unwrap_or_default().to_string_lossy()
            );

            let mtime = fs::metadata(&path)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            results.push(ModData {
                name: rel.replace("\\", "/"),
                hash,
                status: "SANDBOX".to_string(),
                color: "var(--accent)".to_string(),
                is_script,
                mtime,
            });
        }

        Ok(results)
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}
