use crate::commands::game_info::get_heuristic_signatures;
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use rayon::prelude::*;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};

struct TempStagingGuard(PathBuf);
impl Drop for TempStagingGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

fn is_edge_sidecar_filename(fname_lower: &str) -> bool {
    fname_lower == SANCTUARY_EDGE_MANIFEST_FILE || fname_lower == SANCTUARY_EDGE_OVERRIDE_FILE
}

/// Verifies that an incoming archive claiming lineage over `existing_hash` corresponds to an
/// already-registered `artifact_id` or verified `https://` `manifest_url` in `edge_manifests`
/// whose own recorded hashes include `existing_hash`. Prevents untrusted dropped archives from
/// spoofing `previous_hashes` or `artifact_id` to overwrite unrelated mods.
fn verify_trusted_lineage_upgrade(
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

                let legacy_sigs_mtime =
                    crate::utils::get_vault_kv(&vault_path, "malware_signatures")
                        .map(|(_, updated_at)| updated_at)
                        .unwrap_or(0);

                let vault_dir = crate::utils::get_vault_root_dir(&vault_path);
                let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);

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
                let archive_exts = crate::game_logic::get_archive_extensions(&game_schema);
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
                                        || archive_exts.contains(&ext_lower)
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
                            let sigs_valid = cached.heuristic_sigs_mtime == 0
                                || cached.heuristic_sigs_mtime == current_sigs_version
                                || (legacy_sigs_mtime > 0
                                    && cached.heuristic_sigs_mtime == legacy_sigs_mtime);
                            if sigs_valid && cached.heuristic_sigs_mtime != current_sigs_version {
                                cached.heuristic_sigs_mtime = current_sigs_version;
                                cache_updated = true;
                            }
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

                                if !malware_hashes_set.contains(&dna_hash)
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
                    let is_malware = is_hash_malware
                        || (!verified_hashes_set.contains(&item.dna_hash)
                            && item.heuristic_sig.is_some());

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
                        let target = malware_dir.join(item.path.file_name().unwrap_or_default());
                        let _ = fs::rename(&item.path, &target);

                        let manifest = QuarantineManifest {
                            artifact_name: item
                                .path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            detected_hash: item.dna_hash.clone(),
                            signature: signature_name.clone(),
                            quarantine_path: obscure_username(&target.to_string_lossy()),
                            original_path: None,
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
                        let manifest_path = reports_dir.join(format!(
                            "{}.manifest.json",
                            target.file_name().unwrap_or_default().to_string_lossy()
                        ));
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

#[allow(dead_code)]
pub fn is_sanctuary_edge_manifest_json(raw_json: &str) -> bool {
    raw_json.contains("\"artifact_id\"")
        || raw_json.contains("\"polling_url\"")
        || raw_json.contains("\"manifest_url\"")
        || raw_json.contains("\"current_hashes\"")
        || raw_json.contains("\"previous_hashes\"")
        || raw_json.contains("\"atomic_logic\"")
        || raw_json.contains("\"virtual_filesystem\"")
        || (raw_json.contains("\"artifact\"") && raw_json.contains("\"payload\""))
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

        // Automatically unpack any .zip archives inside Dev/Sandbox using bounded pure-Rust extraction
        let mut unpacked_any = false;
        for p in &initial_paths {
            if p.extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
            {
                let target_dir = if p.parent() == Some(dev_lane.as_path()) {
                    let stem = p
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    dev_lane.join(stem)
                } else {
                    p.parent().unwrap_or(&dev_lane).to_path_buf()
                };
                if crate::utils::ensure_path_within_roots(&target_dir, &[dev_lane.clone()]).is_ok()
                    && extract_sandbox_zip_in_place(p, &target_dir, &game_schema) > 0
                {
                    let _ = std::fs::remove_file(p);
                    unpacked_any = true;
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
            if fname_lower.starts_with('.')
                || fname_lower == "desktop.ini"
                || is_edge_sidecar_filename(&fname_lower)
                || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
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

fn quarantine_detected_threat(
    app: &tauri::AppHandle,
    vault_root: &Path,
    offending_file: &Path,
    artifact_name: &str,
    detected_hash: &str,
    matched_sig: String,
    matched_entry: Option<String>,
    detection_type: String,
    file_extension: Option<String>,
    original_source: &Path,
    source_full_str: &str,
    is_external_source: bool,
    should_move_original: bool,
) {
    let q_dir = vault_root.join(".sanctuary_quarantine");
    let reports_dir = vault_root.join("Quarantine");
    let _ = fs::create_dir_all(&q_dir);
    let _ = fs::create_dir_all(&reports_dir);
    crate::utils::mark_path_hidden(&q_dir);

    let file_size_bytes = fs::metadata(offending_file).map(|m| m.len()).ok();
    let safe_q_name = Path::new(artifact_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "quarantined_artifact".to_string());
    let q_target = q_dir.join(&safe_q_name);
    let _ = fs::copy(offending_file, &q_target);

    let mut source_was_moved = false;
    if should_move_original
        && original_source.exists()
        && crate::utils::is_safe_user_file_path(original_source)
    {
        if original_source.is_file() && fs::remove_file(original_source).is_ok() {
            source_was_moved = true;
        }
    }

    let orig_still_exists = original_source.exists();
    if source_was_moved && !orig_still_exists {
        if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
            map.remove(&detected_hash.to_lowercase());
            map.remove(artifact_name);
            map.remove(&artifact_name.to_lowercase());
        }
    }

    let orig_hash = if original_source.is_file() {
        calculate_hash(original_source).unwrap_or_else(|_| detected_hash.to_string())
    } else {
        detected_hash.to_string()
    };

    let manifest = QuarantineManifest {
        artifact_name: safe_q_name.clone(),
        detected_hash: detected_hash.to_string(),
        signature: matched_sig,
        quarantine_path: obscure_username(&q_target.to_string_lossy()),
        original_path: Some(obscure_username(source_full_str)),
        original_hash_at_import: Some(orig_hash),
        original_exists: orig_still_exists,
        original_shredded: false,
        quarantined_file_shredded: false,
        detected_at: chrono::Local::now().to_rfc3339(),
        source_moved: source_was_moved,
        ingest_mode: Some(if should_move_original {
            "move".to_string()
        } else {
            "copy".to_string()
        }),
        file_size_bytes,
        file_extension,
        matched_entry,
        detection_type: Some(detection_type),
    };
    let manifest_path = reports_dir.join(format!("{}.manifest.json", safe_q_name));
    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
        let _ = crate::utils::atomic_write_bytes(&manifest_path, json.as_bytes());
    }

    let _ = app.emit(
        "malware_detected",
        serde_json::json!({
            "path": q_target.to_string_lossy().to_string(),
            "name": safe_q_name,
            "hash": detected_hash,
            "status": "QUARANTINED",
            "isLocalOverride": false,
            "isVirtual": false,
            "compliance_tier": 5,
            "original_exists": manifest.original_exists,
            "original_shredded": manifest.original_shredded,
            "original_path": manifest.original_path,
            "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.to_string()) } else { None },
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
}

#[tauri::command]
pub async fn ingest_dropped_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
    path: String,
    force_replace: bool,
    target_folder: Option<String>,
    move_original: Option<bool>,
) -> Result<String, String> {
    let game_schema = app_state.active_schema.lock().unwrap().clone();
    let malware_hashes_set: HashSet<String> = if let Ok(m) = state.malware_hashes.lock() {
        m.iter().cloned().collect()
    } else {
        HashSet::new()
    };
    let tier2_hashes_set: HashSet<String> = if let Ok(v) = state.tier2_hashes.lock() {
        v.iter().cloned().collect()
    } else {
        HashSet::new()
    };

    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        if config.vault_path.trim().is_empty() {
            return Err("VAULT_NOT_CONFIGURED".into());
        }

        let source = Path::new(&path);
        if !source.exists() {
            return Err("FILE_NOT_FOUND".into());
        }
        if !crate::utils::is_safe_user_file_path(source) {
            return Err("Blocked: unsafe source path.".into());
        }

        let vault_root = crate::utils::get_vault_root_dir(&config.vault_path);
        let vault_mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
        let allowed_vault_roots = vec![vault_root.clone(), vault_mods_lane.clone()];

        let source_full_str = source.to_string_lossy().to_string();
        let is_external_source =
            crate::utils::ensure_path_within_roots(source, &allowed_vault_roots).is_err();
        let should_move_original = move_original.unwrap_or_else(|| {
            config
                .ingest_file_mode
                .as_deref()
                .map(|m| m.eq_ignore_ascii_case("move"))
                .unwrap_or(false)
        }) && is_external_source;

        let app_for_volatile = app.clone();
        let record_volatile_origin = move |hash_str: &str, name_str: &str, origin_path: &str| {
            if !is_external_source || origin_path.trim().is_empty() {
                return;
            }
            let sec_state = app_for_volatile.state::<SecurityState>();
            if let Ok(mut map) = sec_state.volatile_original_paths.lock() {
                let h_low = hash_str.trim().to_lowercase();
                if !h_low.is_empty() {
                    map.insert(h_low, origin_path.to_string());
                }
                let n_trim = name_str.trim();
                if !n_trim.is_empty() {
                    map.insert(n_trim.to_string(), origin_path.to_string());
                    map.insert(n_trim.to_lowercase(), origin_path.to_string());
                }
            };
        };

        let mut exists = false;
        let mut existing_name = String::new();
        let mut match_reason = String::new();
        let mut hash = String::new();

        let ext = source
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let supported = crate::game_logic::get_supported_extensions(&game_schema);
        let archive_exts = crate::game_logic::get_archive_extensions(&game_schema);
        let fname_lower = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let is_edge_sidecar = is_edge_sidecar_filename(&fname_lower);
        let is_archive_ext = ext == "zip"
            || ext == "rar"
            || ext == "7z"
            || archive_exts.contains(&ext);

        if !source.is_dir()
            && !is_archive_ext
            && !supported.contains(&ext)
            && !is_edge_sidecar
        {
            return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
        }

        // Direct drop of a `.sanctuary.manifest.json` or `.sanctuary.override.json` sidecar
        if is_edge_sidecar && source.is_file() {
            if let Ok(content) = std::fs::read_to_string(source) {
                if let Some((ovr, manifest_opt, auto_accepted)) =
                    crate::commands::edge_network::auto_ingest_edge_json(
                        &config.vault_path,
                        &content,
                        &[],
                    )
                {
                    let _ = app.emit(
                        "edge_override_detected",
                        serde_json::json!({
                            "source_action": "ingest_dropped_file",
                            "override_json": serde_json::to_string(&ovr).unwrap_or(content.clone()),
                            "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()),
                            "extracted_hashes": Vec::<String>::new(),
                            "auto_accepted": auto_accepted,
                        }),
                    );
                } else {
                    let _ = app.emit(
                        "edge_override_detected",
                        serde_json::json!({
                            "source_action": "ingest_dropped_file",
                            "override_json": content,
                            "auto_accepted": true,
                        }),
                    );
                }
                if should_move_original && crate::utils::is_safe_user_file_path(source) {
                    let _ = std::fs::remove_file(source);
                }
                return Ok(serde_json::to_string(&vec![fname_lower]).unwrap_or_default());
            }
        }

        let heuristic_sigs =
            get_heuristic_signatures(config.vault_path.clone()).unwrap_or_default();
        let compiled_sigs = CompiledSignatures::new(&heuristic_sigs);

        if !source.is_dir() {
            let source_file_name = source.file_name().unwrap_or_default();
            let source_file_name_str = source_file_name.to_string_lossy().to_string();

            // Pre-scan the dropped file itself (including outer archive containers) BEFORE duplicate/extraction work
            let file_hash = calculate_hash(source).unwrap_or_default();
            if supported.contains(&ext) {
                hash = file_hash.clone();
            }
            record_volatile_origin(&file_hash, &source_file_name_str, &source_full_str);

            let mut matched_sig = "NO SIGNATURE MATCH".to_string();
            let mut matched_entry_opt: Option<String> = None;
            let mut detection_type_str = "hash_blacklist".to_string();
            let mut is_malware = !file_hash.is_empty() && malware_hashes_set.contains(&file_hash);
            let is_verified = !file_hash.is_empty() && tier2_hashes_set.contains(&file_hash);
            if !is_malware && !is_verified {
                if let Some(detail) = check_heuristic_malware_detailed(source, &compiled_sigs) {
                    is_malware = true;
                    matched_sig = detail.signature;
                    matched_entry_opt = detail.matched_entry;
                    detection_type_str = detail.detection_type;
                }
            }

            if is_malware {
                quarantine_detected_threat(
                    &app,
                    &vault_root,
                    source,
                    &source_file_name_str,
                    &file_hash,
                    matched_sig,
                    matched_entry_opt,
                    detection_type_str,
                    if !ext.is_empty() {
                        Some(format!(".{}", ext))
                    } else {
                        None
                    },
                    source,
                    &source_full_str,
                    is_external_source,
                    should_move_original,
                );
                return Err("MALWARE".into());
            }

            if !is_archive_ext {
                let cache = load_cache(&config.vault_path);
                let mut needs_hash = true;

                for (k, v) in cache.iter() {
                    if v.quarantined || k.contains(".sanctuary_quarantine") {
                        continue;
                    }
                    if let Some(cached_name) = Path::new(k).file_name() {
                        if cached_name
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&source_file_name_str)
                            && Path::new(k).exists()
                        {
                            exists = true;
                            existing_name = k.clone();
                            match_reason = "NAME_MATCH".to_string();
                            needs_hash = false;
                            break;
                        }
                    }
                }

                if needs_hash {
                    if hash.is_empty() {
                        hash = calculate_hash(source).unwrap_or_default();
                    }
                    record_volatile_origin(&hash, &source_file_name_str, &source_full_str);
                    for (k, v) in cache.iter() {
                        if v.quarantined || k.contains(".sanctuary_quarantine") {
                            continue;
                        }
                        if v.dna_hash == hash && !hash.is_empty() && Path::new(k).exists() {
                            exists = true;
                            existing_name = k.clone();
                            match_reason = "DNA_MATCH".to_string();
                            break;
                        }
                    }
                }

                if exists {
                    let ext_with_dot = format!(".{}", ext);
                    let is_setting_file = game_schema
                        .as_ref()
                        .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                        .map(|list| list.contains(&ext_with_dot))
                        .unwrap_or(false);
                    if is_setting_file {
                        let _ = app.emit(
                            "dna_match_detected",
                            serde_json::json!({
                                "path": path,
                                "hash": hash,
                                "existing_name": existing_name,
                                "source_action": "ingest_dropped_file",
                                "reason": "SETTINGS_CONFLICT",
                                "override_json": None::<String>
                            }),
                        );
                        return Err("SETTINGS_CONFLICT".into());
                    } else if !force_replace {
                        let _ = app.emit(
                            "dna_match_detected",
                            serde_json::json!({
                                "path": path,
                                "hash": hash,
                                "existing_name": existing_name,
                                "source_action": "ingest_dropped_file",
                                "reason": match_reason
                            }),
                        );
                        return Err("DNA_MATCH".into());
                    }
                }
            }
        }

        let file_name = source.file_name().ok_or("INVALID_FILENAME")?;
        let _ = std::fs::create_dir_all(&vault_mods_lane);

        // Validate optional `target_folder` so `..` or absolute paths cannot escape `vault_mods_lane`
        let sanitized_target_subfolder: Option<PathBuf> = target_folder
            .as_deref()
            .map(|tf| tf.trim().trim_matches(&['/', '\\'][..]))
            .filter(|tf| !tf.is_empty())
            .map(|tf| {
                let rel = Path::new(tf);
                if rel
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
                {
                    Err("Blocked: invalid target_folder traversal.".to_string())
                } else {
                    Ok(rel.to_path_buf())
                }
            })
            .transpose()?;

        // Branch 1: Dropped Directory (full-tree scan first, then copy preserving all auxiliary assets)
        if source.is_dir() {
            let target_dir = if let Some(ref sub) = sanitized_target_subfolder {
                vault_mods_lane.join(sub).join(file_name)
            } else {
                vault_mods_lane.join(file_name)
            };
            crate::utils::ensure_strict_descendant_of_roots(&target_dir, &[vault_mods_lane.clone()])?;

            if !force_replace && target_dir.exists() {
                let _ = app.emit(
                    "dna_match_detected",
                    serde_json::json!({
                        "path": path,
                        "hash": "",
                        "existing_name": target_dir.to_string_lossy().to_string(),
                        "source_action": "ingest_dropped_file",
                        "reason": "NAME_MATCH"
                    }),
                );
                return Err("DNA_MATCH".into());
            }

            // Full pre-copy malware + heuristic scan across every file in the directory
            for entry in walkdir::WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_symlink() {
                    return Err("Directory rejected: contains unsafe symlink.".into());
                }
                let sp = entry.path();
                if crate::utils::is_macos_or_os_metadata_path(sp) {
                    continue;
                }
                if sp.is_file() {
                    let sp_ext = sp
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| format!(".{}", s.to_lowercase()));
                    let sp_hash = calculate_hash(sp).unwrap_or_default();
                    let sp_name = sp
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let sp_full = sp.to_string_lossy().to_string();
                    record_volatile_origin(&sp_hash, &sp_name, &sp_full);

                    let mut matched_sig = "NO SIGNATURE MATCH".to_string();
                    let mut matched_entry_opt: Option<String> = None;
                    let mut detection_type_str = "hash_blacklist".to_string();
                    let mut is_malware =
                        !sp_hash.is_empty() && malware_hashes_set.contains(&sp_hash);
                    let is_verified = !sp_hash.is_empty() && tier2_hashes_set.contains(&sp_hash);
                    if !is_malware && !is_verified {
                        if let Some(detail) = check_heuristic_malware_detailed(sp, &compiled_sigs) {
                            is_malware = true;
                            matched_sig = detail.signature;
                            matched_entry_opt = detail.matched_entry;
                            detection_type_str = detail.detection_type;
                        }
                    }
                    if is_malware {
                        quarantine_detected_threat(
                            &app,
                            &vault_root,
                            sp,
                            &sp_name,
                            &sp_hash,
                            matched_sig,
                            matched_entry_opt,
                            detection_type_str,
                            sp_ext,
                            sp,
                            &sp_full,
                            is_external_source,
                            should_move_original,
                        );
                        return Err("MALWARE".into());
                    }
                }
            }

            // Stage into temporary directory inside Vault first, then move into target_dir
            let stage_dir = vault_root.join(format!(
                ".tmp_sanctuary_dir_stage_{}",
                uuid::Uuid::new_v4()
            ));
            let _stage_guard = TempStagingGuard(stage_dir.clone());
            fs::create_dir_all(&stage_dir).map_err(|e| e.to_string())?;

            let mut dir_edge_manifest_json: Option<String> = None;
            let mut dir_edge_override_json: Option<String> = None;
            let mut staged_rel_files: Vec<PathBuf> = Vec::new();

            for entry in walkdir::WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
                let sp = entry.path();
                if crate::utils::is_macos_or_os_metadata_path(sp) {
                    continue;
                }
                if let Ok(rel) = sp.strip_prefix(source) {
                    if rel.as_os_str().is_empty() {
                        continue;
                    }
                    if sp.is_file() {
                        let fname_low = sp
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_lowercase();
                        if fname_low == ".sanctuary_cache.json"
                            || fname_low == ".sanctuary_cache.db"
                            || fname_low == "desktop.ini"
                        {
                            continue;
                        }
                        if fname_low == SANCTUARY_EDGE_MANIFEST_FILE {
                            if let Ok(c) = std::fs::read_to_string(sp) {
                                dir_edge_manifest_json = Some(c);
                            }
                            continue;
                        }
                        if fname_low == SANCTUARY_EDGE_OVERRIDE_FILE {
                            if let Ok(c) = std::fs::read_to_string(sp) {
                                dir_edge_override_json = Some(c);
                            }
                            continue;
                        }
                        let stripped_rel =
                            crate::game_logic::strip_relative_root_anchors(rel, &game_schema);
                        let stage_dest = stage_dir.join(&stripped_rel);
                        if let Some(parent) = stage_dest.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        std::fs::copy(sp, &stage_dest).map_err(|e| e.to_string())?;
                        staged_rel_files.push(stripped_rel);
                    }
                }
            }

            std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
            let mut dir_hashes = Vec::new();
            for rel in &staged_rel_files {
                let src_staged = stage_dir.join(rel);
                let dst_final = target_dir.join(rel);
                crate::utils::ensure_strict_descendant_of_roots(
                    &dst_final,
                    &[vault_mods_lane.clone()],
                )?;
                if let Some(parent) = dst_final.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if dst_final.exists() {
                    let _ = std::fs::remove_file(&dst_final);
                }
                std::fs::rename(&src_staged, &dst_final)
                    .or_else(|_| std::fs::copy(&src_staged, &dst_final).map(|_| ()))
                    .map_err(|e| e.to_string())?;

                if let Some(e_str) = dst_final.extension().and_then(|s| s.to_str()) {
                    if supported.contains(&e_str.to_lowercase()) {
                        if let Ok(h) = calculate_hash(&dst_final) {
                            let _ = crate::utils::archive_mod_binary_version(
                                &config.vault_path,
                                &dst_final,
                                Some(&h),
                                None,
                                None,
                            );
                            if !h.is_empty() && !dir_hashes.contains(&h) {
                                dir_hashes.push(h);
                            }
                        }
                    }
                }
            }

            if let Some(edge_raw) = dir_edge_manifest_json
                .as_ref()
                .or(dir_edge_override_json.as_ref())
            {
                if let Some((ovr, manifest_opt, auto_accepted)) =
                    crate::commands::edge_network::auto_ingest_edge_json(
                        &config.vault_path,
                        edge_raw,
                        &dir_hashes,
                    )
                {
                    let _ = app.emit(
                        "edge_override_detected",
                        serde_json::json!({
                            "source_action": "ingest_dropped_file",
                            "override_json": serde_json::to_string(&ovr).unwrap_or_else(|_| edge_raw.clone()),
                            "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()),
                            "extracted_hashes": dir_hashes,
                            "auto_accepted": auto_accepted,
                        }),
                    );
                }
            }

            if should_move_original && crate::utils::is_safe_user_file_path(source) {
                let _ = std::fs::remove_dir_all(source);
            }
            return Ok(
                serde_json::to_string(&vec![file_name.to_string_lossy().to_string()])
                    .unwrap_or_default(),
            );
        }

        // Branch 2: Pure-Rust Bounded `.zip` / `.jar` Extraction into Staging First
        if ext == "zip" || ext == "jar" {
            let zip_stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if zip_stem.trim().is_empty() {
                return Err("INVALID_ARCHIVE_NAME".into());
            }

            let stage_dir = vault_root.join(format!(
                ".tmp_sanctuary_stage_{}",
                uuid::Uuid::new_v4()
            ));
            let _stage_guard = TempStagingGuard(stage_dir.clone());

            let extraction = crate::utils::extract_zip_bounded_to_dir(
                source,
                &stage_dir,
                Some(&zip_stem),
                &game_schema,
                MAX_ARCHIVE_ENTRY_BYTES,
                MAX_ARCHIVE_TOTAL_BYTES,
            )?;

            // Step A: Scan EVERY staged file for malware/heuristics BEFORE touching Vault/Mods
            let mut staged_hashes: Vec<(ExtractedZipEntry, String)> =
                Vec::with_capacity(extraction.files.len());
            for entry in extraction.files {
                let entry_hash = calculate_hash(&entry.staged_path).unwrap_or_default();
                let entry_fname = entry
                    .rel_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let entry_ext_opt = entry
                    .rel_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{}", e.to_lowercase()));
                record_volatile_origin(&entry_hash, &entry_fname, &source_full_str);

                let mut matched_sig = "NO SIGNATURE MATCH".to_string();
                let mut matched_entry_opt: Option<String> = None;
                let mut detection_type_str = "hash_blacklist".to_string();
                let mut is_malware =
                    !entry_hash.is_empty() && malware_hashes_set.contains(&entry_hash);
                let is_verified = !entry_hash.is_empty() && tier2_hashes_set.contains(&entry_hash);
                if !is_malware && !is_verified {
                    if let Some(detail) =
                        check_heuristic_malware_detailed(&entry.staged_path, &compiled_sigs)
                    {
                        is_malware = true;
                        matched_sig = detail.signature;
                        matched_entry_opt = detail
                            .matched_entry
                            .or_else(|| Some(entry.rel_path.to_string_lossy().replace('\\', "/")));
                        detection_type_str = detail.detection_type;
                    }
                }

                if is_malware {
                    quarantine_detected_threat(
                        &app,
                        &vault_root,
                        &entry.staged_path,
                        &entry_fname,
                        &entry_hash,
                        matched_sig,
                        matched_entry_opt,
                        detection_type_str,
                        entry_ext_opt,
                        source,
                        &source_full_str,
                        is_external_source,
                        should_move_original,
                    );
                    // `_stage_guard` drops automatically here, wiping `stage_dir` without touching `Vault/Mods`!
                    return Err("MALWARE".into());
                }

                staged_hashes.push((entry, entry_hash));
            }

            // Step B: Parse optional `.sanctuary.manifest.json` / `.sanctuary.override.json` lineage claims
            let zip_manifest_json = extraction.sanctuary_manifest_json;
            let zip_override_json = extraction.sanctuary_override_json;
            let mut lineage_known_hashes: Vec<String> = Vec::new();
            let mut incoming_artifact_id: Option<String> = None;
            let mut incoming_manifest_url: Option<String> = None;

            for raw_opt in [&zip_manifest_json, &zip_override_json] {
                if let Some(raw_str) = raw_opt {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_str) {
                        if incoming_artifact_id.is_none() {
                            incoming_artifact_id = val
                                .get("artifact_id")
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    val.get("artifact")
                                        .and_then(|a| a.get("id"))
                                        .and_then(|v| v.as_str())
                                })
                                .map(|s| s.to_string());
                        }
                        if incoming_manifest_url.is_none() {
                            incoming_manifest_url = val
                                .get("manifest_url")
                                .or_else(|| val.get("polling_url"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                        for key in ["previous_hashes", "archive_hashes", "current_hashes"] {
                            if let Some(arr) = val.get(key).and_then(|v| v.as_array()) {
                                for item in arr {
                                    if let Some(s) = item.as_str() {
                                        lineage_known_hashes.push(s.to_lowercase());
                                    }
                                }
                            }
                        }
                        if let Some(t_hash) = val.get("target_hash").and_then(|v| v.as_str()) {
                            lineage_known_hashes.push(t_hash.to_lowercase());
                        }
                        if let Some(p_hash) = val
                            .get("payload")
                            .and_then(|p| p.get("sha256"))
                            .and_then(|v| v.as_str())
                        {
                            lineage_known_hashes.push(p_hash.to_lowercase());
                        }
                    }
                }
            }

            // Step C: Atomically move verified staged files into `Vault/Mods` preserving full directory trees
            let target_base = if let Some(ref sub) = sanitized_target_subfolder {
                vault_mods_lane.join(sub)
            } else {
                vault_mods_lane.join(&zip_stem)
            };
            crate::utils::ensure_strict_descendant_of_roots(&target_base, &[vault_mods_lane.clone()])?;
            let _ = std::fs::create_dir_all(&target_base);

            let cache = load_cache(&config.vault_path);
            let mut extracted_files = Vec::new();
            let mut extracted_mod_hashes = Vec::new();

            for (entry, extracted_hash) in staged_hashes {
                let Some(zf_file_name) = entry.rel_path.file_name() else {
                    continue;
                };
                let file_name_str = zf_file_name.to_string_lossy().to_string();
                let zf_ext = entry
                    .rel_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let is_primary_mod_binary = supported.contains(&zf_ext);
                let zf_ext_with_dot = format!(".{}", zf_ext);
                let is_setting_file = game_schema
                    .as_ref()
                    .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                    .map(|list| list.contains(&zf_ext_with_dot))
                    .unwrap_or(false);

                let default_dest = target_base.join(&entry.rel_path);
                crate::utils::ensure_strict_descendant_of_roots(
                    &default_dest,
                    &[vault_mods_lane.clone()],
                )?;

                if !is_primary_mod_binary && !is_setting_file {
                    // Auxiliary asset (textures, meshes, audio, JSON/TOML data, loose subfolders): preserve full relative tree!
                    if let Some(parent) = default_dest.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if default_dest.exists() {
                        let _ = std::fs::remove_file(&default_dest);
                    }
                    if std::fs::rename(&entry.staged_path, &default_dest)
                        .or_else(|_| std::fs::copy(&entry.staged_path, &default_dest).map(|_| ()))
                        .is_ok()
                    {
                        extracted_files.push(entry.rel_path.to_string_lossy().replace('\\', "/"));
                    }
                    continue;
                }

                if !extracted_hash.is_empty() && !extracted_mod_hashes.contains(&extracted_hash) {
                    extracted_mod_hashes.push(extracted_hash.clone());
                }

                let mut final_path = default_dest.clone();
                let mut needs_resolution = false;
                let mut resolution_existing_name = final_path.to_string_lossy().to_string();
                let mut found_existing = false;

                for (k, v) in cache.iter() {
                    if v.quarantined || k.contains(".sanctuary_quarantine") {
                        continue;
                    }
                    if Path::new(k).file_name() == Some(zf_file_name) && Path::new(k).exists() {
                        if crate::utils::ensure_strict_descendant_of_roots(
                            Path::new(k),
                            &[vault_mods_lane.clone()],
                        )
                        .is_ok()
                        {
                            found_existing = true;
                            resolution_existing_name = k.clone();
                            break;
                        }
                    }
                }

                if !found_existing && final_path.exists() {
                    found_existing = true;
                }

                let existing_hash = if found_existing {
                    cache
                        .get(&resolution_existing_name)
                        .map(|c| c.dna_hash.clone())
                        .filter(|h| !h.is_empty())
                        .or_else(|| calculate_hash(Path::new(&resolution_existing_name)).ok())
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                let is_lineage_upgrade = found_existing
                    && verify_trusted_lineage_upgrade(
                        &config.vault_path,
                        &existing_hash,
                        incoming_artifact_id.as_deref(),
                        incoming_manifest_url.as_deref(),
                        &lineage_known_hashes,
                    );

                if found_existing {
                    final_path = Path::new(&resolution_existing_name).to_path_buf();
                    if is_setting_file {
                        needs_resolution = true;
                    } else if force_replace || is_lineage_upgrade {
                        let _ = crate::utils::archive_mod_binary_version(
                            &config.vault_path,
                            &final_path,
                            None,
                            None,
                            None,
                        );
                    } else {
                        needs_resolution = true;
                    }
                }

                let mut extract_target = final_path.clone();
                if needs_resolution {
                    let mut new_name = final_path.file_name().unwrap().to_os_string();
                    new_name.push(".tmp_sanctuary_conflict");
                    extract_target = final_path.with_file_name(new_name);
                } else if !is_setting_file && extract_target.exists() {
                    let _ = std::fs::remove_file(&extract_target);
                }

                crate::utils::ensure_strict_descendant_of_roots(
                    &extract_target,
                    &[vault_mods_lane.clone()],
                )?;
                if let Some(parent) = extract_target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                if std::fs::rename(&entry.staged_path, &extract_target)
                    .or_else(|_| std::fs::copy(&entry.staged_path, &extract_target).map(|_| ()))
                    .is_ok()
                {
                    extracted_files.push(file_name_str.clone());

                    if needs_resolution {
                        if !is_setting_file
                            && !extracted_hash.is_empty()
                            && existing_hash.eq_ignore_ascii_case(&extracted_hash)
                        {
                            let _ = std::fs::remove_file(&extract_target);
                            let _ = crate::utils::archive_mod_binary_version(
                                &config.vault_path,
                                Path::new(&resolution_existing_name),
                                Some(&existing_hash),
                                None,
                                None,
                            );
                        } else {
                            let reason = if is_setting_file {
                                "SETTINGS_CONFLICT"
                            } else {
                                "ZIP_NAME_MATCH"
                            };
                            let _ = app.emit(
                                "dna_match_detected",
                                serde_json::json!({
                                    "path": extract_target.to_string_lossy().to_string(),
                                    "hash": extracted_hash,
                                    "existing_name": resolution_existing_name,
                                    "source_action": "ingest_dropped_file",
                                    "reason": reason,
                                    "override_json": zip_override_json.clone()
                                }),
                            );
                        }
                    } else {
                        let mut hash_match_found = false;
                        let mut matched_existing_name = String::new();
                        for (k, v) in cache.iter() {
                            if v.quarantined || k.contains(".sanctuary_quarantine") {
                                continue;
                            }
                            if v.dna_hash == extracted_hash
                                && !extracted_hash.is_empty()
                                && Path::new(k) != extract_target.as_path()
                                && Path::new(k).exists()
                            {
                                hash_match_found = true;
                                matched_existing_name = k.clone();
                                break;
                            }
                        }
                        if hash_match_found {
                            let mut new_name = extract_target.file_name().unwrap().to_os_string();
                            new_name.push(".tmp_sanctuary_conflict");
                            let conflict_target = extract_target.with_file_name(new_name);
                            let _ = std::fs::rename(&extract_target, &conflict_target);

                            let _ = app.emit(
                                "dna_match_detected",
                                serde_json::json!({
                                    "path": conflict_target.to_string_lossy().to_string(),
                                    "hash": extracted_hash,
                                    "existing_name": matched_existing_name,
                                    "source_action": "ingest_dropped_file",
                                    "reason": "ZIP_DNA_MATCH",
                                    "override_json": zip_override_json.clone()
                                }),
                            );
                        } else if !is_setting_file && is_primary_mod_binary {
                            let _ = crate::utils::archive_mod_binary_version(
                                &config.vault_path,
                                &extract_target,
                                Some(&extracted_hash),
                                None,
                                None,
                            );
                        }
                    }
                }
            }

            let primary_edge_json = zip_manifest_json.as_ref().or(zip_override_json.as_ref());
            if let Some(raw_edge) = primary_edge_json {
                if let Some((mut ovr, manifest_opt, auto_accepted)) =
                    crate::commands::edge_network::auto_ingest_edge_json(
                        &config.vault_path,
                        raw_edge,
                        &extracted_mod_hashes,
                    )
                {
                    if (ovr.manifest_url.is_empty()
                        || ovr.manifest_url.contains("your-domain.com")
                        || ovr.manifest_url.contains("example.com"))
                        && zip_override_json.is_some()
                    {
                        if let Ok(legacy_ovr) =
                            serde_json::from_str::<crate::commands::edge_network::EdgeOverride>(
                                zip_override_json.as_ref().unwrap(),
                            )
                        {
                            if !legacy_ovr.manifest_url.is_empty() {
                                ovr.manifest_url = legacy_ovr.manifest_url;
                            }
                        }
                    }
                    let _ = app.emit(
                        "edge_override_detected",
                        serde_json::json!({
                            "source_action": "ingest_dropped_file",
                            "override_json": serde_json::to_string(&ovr).unwrap_or_else(|_| raw_edge.clone()),
                            "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()).or_else(|| zip_manifest_json.clone()),
                            "extracted_hashes": extracted_mod_hashes,
                            "auto_accepted": auto_accepted,
                        }),
                    );
                } else {
                    let _ = app.emit(
                        "edge_override_detected",
                        serde_json::json!({
                            "source_action": "ingest_dropped_file",
                            "override_json": raw_edge,
                            "manifest_json": zip_manifest_json,
                            "extracted_hashes": extracted_mod_hashes,
                            "auto_accepted": true,
                        }),
                    );
                }
            }

            if std::fs::read_dir(&target_base)
                .map(|mut iter| iter.next().is_none())
                .unwrap_or(false)
            {
                let _ = std::fs::remove_dir(&target_base);
            }
            if extracted_files.is_empty()
                && zip_override_json.is_none()
                && zip_manifest_json.is_none()
            {
                return Err("No extractable files found inside archive.".into());
            }
            if should_move_original && crate::utils::is_safe_user_file_path(source) {
                let _ = std::fs::remove_file(source);
            }
            return Ok(
                serde_json::to_string(&extracted_files).unwrap_or_else(|_| "[]".to_string()),
            );
        } else if ext == "rar" || ext == "7z" {
            // Never shell out to `tar -xf` or external OS binaries on untrusted archives.
            return Err(format!(
                "External shell extraction for .{} archives is disabled for security. Please repack as .zip or unpack into a folder first.",
                ext
            ));
        }

        // Branch 3: Single supported file
        if supported.contains(&ext) {
            let file_stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let target_dir = if let Some(ref sub) = sanitized_target_subfolder {
                vault_mods_lane.join(sub)
            } else {
                vault_mods_lane.join(&file_stem)
            };
            std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

            let mut target = target_dir.join(file_name);
            if exists && force_replace {
                let existing_pb = Path::new(&existing_name).to_path_buf();
                crate::utils::ensure_strict_descendant_of_roots(
                    &existing_pb,
                    &allowed_vault_roots,
                )?;
                target = existing_pb;
                let _ = crate::utils::archive_mod_binary_version(
                    &config.vault_path,
                    &target,
                    None,
                    None,
                    None,
                );
            } else if !force_replace && target.exists() {
                let _ = app.emit(
                    "dna_match_detected",
                    serde_json::json!({
                        "path": path,
                        "hash": "",
                        "existing_name": target.to_string_lossy().to_string(),
                        "source_action": "ingest_dropped_file",
                        "reason": "NAME_MATCH"
                    }),
                );
                return Err("DNA_MATCH".into());
            }

            crate::utils::ensure_strict_descendant_of_roots(&target, &allowed_vault_roots)?;
            let file_hash = if hash.is_empty() {
                calculate_hash(source).unwrap_or_default()
            } else {
                hash
            };
            let file_name_str = file_name.to_string_lossy().to_string();

            if should_move_original && crate::utils::is_safe_user_file_path(source) {
                std::fs::rename(source, &target)
                    .or_else(|_| {
                        std::fs::copy(source, &target).and_then(|_| std::fs::remove_file(source))
                    })
                    .map_err(|e| e.to_string())?;
            } else {
                std::fs::copy(source, &target).map_err(|e| e.to_string())?;
            }

            let ext_with_dot = format!(".{}", ext);
            let is_setting_file = game_schema
                .as_ref()
                .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                .map(|list| list.contains(&ext_with_dot))
                .unwrap_or(false);
            if !is_setting_file {
                let _ = crate::utils::archive_mod_binary_version(
                    &config.vault_path,
                    &target,
                    Some(&file_hash),
                    None,
                    None,
                );
            }

            return Ok(serde_json::to_string(&vec![file_name_str]).unwrap_or_default());
        }

        Err("UNSUPPORTED_ARTIFACT_TYPE".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn move_mod_to_priority_folder(
    vault_path: String,
    mod_name: String,
    target_folder: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if vault_path.trim().is_empty() {
        return Err("Vault path not configured.".into());
    }
    let clean_mod = mod_name.trim().trim_matches(&['/', '\\'][..]);
    if clean_mod.is_empty()
        || Path::new(clean_mod)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Blocked: invalid mod name.".into());
    }
    let clean_target = target_folder.trim().trim_matches(&['/', '\\'][..]);
    if !clean_target.is_empty()
        && Path::new(clean_target)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Blocked: invalid target priority folder.".into());
    }

    let game_schema = state.active_schema.lock().unwrap().clone();
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
    let _ = std::fs::create_dir_all(&vault_mods_lane);

    let mut current_path = vault_mods_lane.join(clean_mod);
    let mut folders_to_check = vec!["".to_string()];
    for pf in crate::game_logic::get_priority_folders(&game_schema) {
        if !folders_to_check.contains(&pf) {
            folders_to_check.push(pf.clone());
        }
        let stripped = pf.trim_start_matches('!').to_string();
        if !stripped.is_empty() && !folders_to_check.contains(&stripped) {
            folders_to_check.push(stripped);
        }
    }
    let mut found = false;
    for f in &folders_to_check {
        let test_path = if f.is_empty() {
            vault_mods_lane.join(clean_mod)
        } else {
            vault_mods_lane.join(f).join(clean_mod)
        };
        if test_path.exists() {
            current_path = test_path;
            found = true;
            break;
        }
    }

    if !found {
        return Err("Mod folder not found in Vault".into());
    }

    crate::utils::ensure_strict_descendant_of_roots(&current_path, &[vault_mods_lane.clone()])?;

    let dest_path = if clean_target.is_empty() {
        vault_mods_lane.join(clean_mod)
    } else {
        let t_folder = vault_mods_lane.join(clean_target);
        crate::utils::ensure_strict_descendant_of_roots(&t_folder, &[vault_mods_lane.clone()])?;
        let _ = std::fs::create_dir_all(&t_folder);
        t_folder.join(clean_mod)
    };

    crate::utils::ensure_strict_descendant_of_roots(&dest_path, &[vault_mods_lane])?;

    if current_path == dest_path {
        return Ok("Already in target folder".into());
    }

    if dest_path.exists() {
        return Err("Target folder already exists".into());
    }

    std::fs::rename(&current_path, &dest_path).map_err(|e| e.to_string())?;
    Ok("Moved successfully".into())
}

#[tauri::command]
pub fn import_to_sandbox(
    files: Vec<String>,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let game_schema = state.active_schema.lock().unwrap().clone();

    let vault_root = crate::utils::get_vault_root_dir(&vault_path);
    let dev_lane = vault_root.join("Dev").join("Sandbox");
    if !dev_lane.exists() {
        let _ = fs::create_dir_all(&dev_lane);
    }

    let mut imported = 0;
    for file in files {
        let source = PathBuf::from(&file);
        if !crate::utils::is_safe_user_file_path(&source) {
            continue;
        }
        if let Some(name) = source.file_name() {
            let stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if !crate::utils::is_safe_single_filename(&stem) {
                continue;
            }
            let mod_folder = dev_lane.join(&stem);
            if crate::utils::ensure_strict_descendant_of_roots(&mod_folder, &[dev_lane.clone()])
                .is_err()
            {
                continue;
            }
            if !mod_folder.exists() {
                let _ = fs::create_dir_all(&mod_folder);
            }

            let ext = source
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if ext == "zip" {
                let count = extract_sandbox_zip_in_place(&source, &mod_folder, &game_schema);
                if count > 0 {
                    imported += count;
                }
            } else {
                let dest = mod_folder.join(name);
                if crate::utils::ensure_strict_descendant_of_roots(&dest, &[dev_lane.clone()])
                    .is_ok()
                    && fs::copy(&source, &dest).is_ok()
                {
                    imported += 1;
                }
            }
        }
    }

    Ok(imported)
}

#[tauri::command]
pub fn get_workbench_files(
    vault_path: String,
    mods_path: Option<String>,
    game_schema: Option<crate::schema::GameSchema>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let active_schema = game_schema.or_else(|| state.active_schema.lock().unwrap().clone());
    let config_exts = crate::game_logic::get_config_extensions(&active_schema);
    let editable_exts = crate::game_logic::get_editable_config_extensions(&active_schema);
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(&active_schema);

    let vault_root = crate::utils::get_vault_root_dir(&vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
    if vault_mods_lane.exists() {
        crate::utils::deduplicate_vault_root_configs(&vault_mods_lane, &config_exts, &active_schema);
    }

    let mut scan_paths = vec![vault_mods_lane, vault_root.join("Templates")];
    if let Some(mp) = mods_path {
        let trimmed = mp.trim();
        if !trimmed.is_empty() {
            let mp_buf = PathBuf::from(trimmed);
            if !scan_paths.iter().any(|p| p == &mp_buf) {
                scan_paths.push(mp_buf);
            }
        }
    }

    let mut seen = HashSet::new();
    let mut results = Vec::new();

    for root in scan_paths {
        if !root.exists() {
            continue;
        }

        let mut queue = vec![(root, 0usize)];
        while let Some((current, depth)) = queue.pop() {
            if depth > 3 {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(&entry_path) {
                        continue;
                    }
                    let Ok(ft) = entry.file_type() else {
                        continue;
                    };
                    if ft.is_dir() {
                        let d_name = entry.file_name().to_string_lossy().to_lowercase();
                        if d_name.starts_with('.')
                            || d_name == "quarantine"
                            || d_name == "__macosx"
                        {
                            continue;
                        }
                        queue.push((entry_path, depth + 1));
                    } else if ft.is_file() {
                        let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) else {
                            continue;
                        };
                        let name_lower = name.to_lowercase();
                        if name_lower.starts_with('.')
                            || name_lower.starts_with("._")
                            || name_lower == "desktop.ini"
                            || is_edge_sidecar_filename(&name_lower)
                            || (!manifest_name_lower.is_empty()
                                && name_lower == manifest_name_lower)
                        {
                            continue;
                        }

                        let is_sanctuary_template =
                            name_lower.ends_with(".sanctuary.template.json");
                        let ext_matches = entry_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| {
                                let el = e.to_lowercase();
                                editable_exts.contains(&el) || config_exts.contains(&el)
                            })
                            .unwrap_or(false);

                        if is_sanctuary_template || ext_matches {
                            let canonical_key = crate::utils::resolve_canonical_target(&entry_path)
                                .unwrap_or_else(|_| entry_path.clone())
                                .to_string_lossy()
                                .to_lowercase();
                            if seen.insert(canonical_key) {
                                results.push(entry_path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| {
        let name_a = std::path::Path::new(a)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let name_b = std::path::Path::new(b)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        name_a.cmp(&name_b)
    });

    Ok(results)
}

#[tauri::command]
pub fn delete_mod(
    path: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<String, String> {
    let cfg = get_saved_coordinates();
    let allowed = crate::utils::get_allowed_workspace_roots(&cfg);
    if !allowed.is_empty() {
        crate::utils::ensure_strict_descendant_of_roots(Path::new(&path), &allowed)?;
    }
    crate::commands::system::delete_local_file(path, state)
}

#[tauri::command]
pub fn read_blueprint(path: String) -> Result<String, String> {
    let target = Path::new(&path);
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing to read protected system path.".into());
    }
    let is_json = target
        .extension()
        .and_then(|e| e.to_str())
        .map_or(false, |e| e.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("Blocked: Blueprint files must use the .json extension.".into());
    }
    std::fs::read_to_string(target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_blueprint(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing to write to protected system path.".into());
    }
    let is_json = target
        .extension()
        .and_then(|e| e.to_str())
        .map_or(false, |e| e.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("Blocked: Blueprint files must use the .json extension.".into());
    }
    crate::utils::atomic_write_bytes(target, content.as_bytes())
}
