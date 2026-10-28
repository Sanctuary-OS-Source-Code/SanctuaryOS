use crate::commands::game_info::*;
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};

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
    let malware_hashes_set: std::collections::HashSet<String> =
        if let Ok(m) = state.malware_hashes.lock() {
            m.iter().cloned().collect()
        } else {
            std::collections::HashSet::new()
        };
    let verified_hashes_set: std::collections::HashSet<String> =
        if let Ok(v) = state.tier2_hashes.lock() {
            v.iter().cloned().collect()
        } else {
            std::collections::HashSet::new()
        };

    let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<ModData>, String>>();

    let spawn_res = std::thread::Builder::new()
        .name("sanctuary-malware-scanner".to_string())
        .spawn(move || {
            struct ScanDeployGuard(
                Arc<std::sync::atomic::AtomicBool>,
                Arc<std::sync::atomic::AtomicU64>,
            );
            impl Drop for ScanDeployGuard {
                fn drop(&mut self) {
                    self.1.store(
                        crate::utils::current_epoch_ms(),
                        std::sync::atomic::Ordering::SeqCst,
                    );
                    self.0.store(false, std::sync::atomic::Ordering::SeqCst);
                }
            }
            is_deploying.store(true, std::sync::atomic::Ordering::SeqCst);
            let _guard = ScanDeployGuard(is_deploying, last_deploy_epoch_ms);

            let res: Result<Vec<ModData>, String> = (|| {
                let heuristic_sigs =
                    get_heuristic_signatures(vault_path.clone()).unwrap_or_else(|_| vec![]);
                let compiled_sigs = CompiledSignatures::new(&heuristic_sigs);
                let current_sigs_version = compute_signatures_version(&heuristic_sigs);

                let sigs_path = PathBuf::from(&vault_path)
                    .join("Data")
                    .join(".malware_signatures.json");
                let legacy_sigs_mtime = std::fs::metadata(&sigs_path)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let vault_dir = PathBuf::from(&vault_path);
                let mods_lane = if crate::utils::is_mods_dir(&vault_dir) {
                    vault_dir.clone()
                } else {
                    vault_dir.join("Mods")
                };

                let mut cache = load_cache(&vault_path);
                let mut cache_updated = false;
                let mut uncached_scans_since_save: usize = 0;

                if !mods_lane.exists() {
                    let _ = fs::create_dir_all(&mods_lane);
                    return Ok(vec![]);
                }

                let config_exts = crate::game_logic::get_config_extensions(&game_schema);
                crate::utils::deduplicate_vault_root_configs(&mods_lane, &config_exts);

                // Clean up any accidental Mods/Resource/Resource.cfg folder created by earlier builds
                let bogus_res_dir = mods_lane.join("Resource");
                if bogus_res_dir.is_dir() {
                    let inner_cfg = bogus_res_dir.join("Resource.cfg");
                    if inner_cfg.is_file() {
                        let root_cfg = mods_lane.join("Resource.cfg");
                        if !root_cfg.exists() {
                            let _ = std::fs::rename(&inner_cfg, &root_cfg);
                        } else {
                            let _ = std::fs::remove_file(&inner_cfg);
                        }
                    }
                    let _ = std::fs::remove_dir(&bogus_res_dir);
                }

                let manifest_name_lower = game_schema
                    .as_ref()
                    .map(|s| s.paths.manifest_file.to_lowercase())
                    .unwrap_or_else(|| "resource.cfg".to_string());

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
                                if fname_lower == "resource.cfg"
                                    || (!manifest_name_lower.is_empty()
                                        && fname_lower == manifest_name_lower)
                                    || fname_lower == "desktop.ini"
                                    || fname_lower == "default.ini"
                                    || fname_lower.starts_with('.')
                                {
                                    continue;
                                }
                                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                                    let ext_lower = ext.to_lowercase();
                                    if ext_lower == "cfg"
                                        || ext_lower == "ini"
                                        || ext_lower == "json"
                                        || ext_lower == "txt"
                                        || ext_lower == "xml"
                                        || ext_lower == "log"
                                        || ext_lower == "zip"
                                        || ext_lower == "rar"
                                        || ext_lower == "7z"
                                    {
                                        continue;
                                    }
                                    let supported =
                                        crate::game_logic::get_supported_extensions(&game_schema);
                                    if supported.contains(&ext_lower) {
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

                // Deterministic ordering so progress numbers and file scanning order are always consistent
                paths.sort();

                let total = paths.len();
                let mut results = Vec::with_capacity(total);
                let mut last_emit = std::time::Instant::now();

                for (idx, path) in paths.into_iter().enumerate() {
                    let current = idx + 1;
                    let path_str = path.to_string_lossy().to_string();
                    let rel = path
                        .strip_prefix(&mods_lane)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();

                    // Step 1: Fast mtime check first (stat metadata only, no file open)
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

                    let mut did_disk_scan = false;

                    let (dna_hash, explicitly_local, cached_heuristic_sig) =
                        if let Some(cached) = cache.get_mut(&path_str) {
                            if cached.mtime == mtime && !cached.dna_hash.is_empty() {
                                let sigs_valid = cached.heuristic_sigs_mtime == 0
                                    || cached.heuristic_sigs_mtime == current_sigs_version
                                    || (legacy_sigs_mtime > 0
                                        && cached.heuristic_sigs_mtime == legacy_sigs_mtime);
                                if sigs_valid && cached.heuristic_sigs_mtime != current_sigs_version
                                {
                                    cached.heuristic_sigs_mtime = current_sigs_version;
                                    cache_updated = true;
                                }
                                let heuristic_sig = if sigs_valid {
                                    Some(cached.heuristic_malware_sig.clone())
                                } else {
                                    None
                                };
                                (
                                    cached.dna_hash.clone(),
                                    cached.explicitly_local,
                                    heuristic_sig,
                                )
                            } else {
                                did_disk_scan = true;
                                let is_dev_folder = path_str.to_lowercase().contains("/dev/")
                                    || path_str.to_lowercase().contains("\\dev\\");
                                let hash = if is_dev_folder {
                                    format!(
                                        "dev_vault_{}",
                                        path.file_name().unwrap_or_default().to_string_lossy()
                                    )
                                } else {
                                    calculate_hash(&path).unwrap_or_default()
                                };
                                let explicit =
                                    check_is_explicitly_local(&path, is_script, &game_schema);
                                *cached = CacheEntry {
                                    mtime,
                                    dna_hash: hash.clone(),
                                    explicitly_local: explicit,
                                    quarantined: false,
                                    heuristic_malware_sig: None,
                                    heuristic_sigs_mtime: 0,
                                };
                                cache_updated = true;
                                (hash, explicit, None)
                            }
                        } else {
                            did_disk_scan = true;
                            let is_dev_folder = path_str.to_lowercase().contains("/dev/")
                                || path_str.to_lowercase().contains("\\dev\\");
                            let hash = if is_dev_folder {
                                format!(
                                    "dev_vault_{}",
                                    path.file_name().unwrap_or_default().to_string_lossy()
                                )
                            } else {
                                calculate_hash(&path).unwrap_or_default()
                            };
                            let explicit =
                                check_is_explicitly_local(&path, is_script, &game_schema);
                            cache.insert(
                                path_str.clone(),
                                CacheEntry {
                                    mtime,
                                    dna_hash: hash.clone(),
                                    explicitly_local: explicit,
                                    quarantined: false,
                                    heuristic_malware_sig: None,
                                    heuristic_sigs_mtime: 0,
                                },
                            );
                            cache_updated = true;
                            (hash, explicit, None)
                        };

                    let mut is_malware = false;
                    let mut signature_name = "NO SIGNATURE MATCH".to_string();
                    let mut matched_entry_opt: Option<String> = None;
                    let mut detection_type_str = "hash_blacklist".to_string();

                    if malware_hashes_set.contains(&dna_hash) {
                        is_malware = true;
                    }

                    if !is_malware && !verified_hashes_set.contains(&dna_hash) {
                        if let Some(cached_sig_opt) = cached_heuristic_sig {
                            if let Some(sig) = cached_sig_opt {
                                is_malware = true;
                                signature_name = sig;
                                detection_type_str = "heuristic_signature".to_string();
                            }
                        } else {
                            did_disk_scan = true;
                            let detail_opt =
                                check_heuristic_malware_detailed(&path, &compiled_sigs);
                            let sig_opt = detail_opt.as_ref().map(|d| d.signature.clone());
                            if let Some(detail) = detail_opt {
                                is_malware = true;
                                signature_name = detail.signature;
                                matched_entry_opt = detail.matched_entry;
                                detection_type_str = detail.detection_type;
                            }
                            if let Some(entry) = cache.get_mut(&path_str) {
                                entry.heuristic_malware_sig = sig_opt;
                                entry.heuristic_sigs_mtime = current_sigs_version;
                                cache_updated = true;
                            }
                        }
                    }

                    if did_disk_scan {
                        if uncached_scans_since_save == 0
                            || current == total
                            || last_emit.elapsed() >= std::time::Duration::from_millis(80)
                        {
                            let _ = app.emit(
                                "scan-progress",
                                serde_json::json!({
                                    "current": current,
                                    "total": total,
                                    "message": format!("ANALYZING DNA: {}/{}", current, total)
                                }),
                            );
                            last_emit = std::time::Instant::now();
                        }
                        uncached_scans_since_save += 1;
                        if uncached_scans_since_save >= 75 {
                            save_cache(&vault_path, &cache);
                            cache_updated = false;
                            uncached_scans_since_save = 0;
                        }
                    }

                    if is_malware {
                        let reports_dir = vault_dir.join("Quarantine");
                        let malware_dir = vault_dir.join(".sanctuary_quarantine");
                        let _ = fs::create_dir_all(&reports_dir);
                        let _ = fs::create_dir_all(&malware_dir);
                        let file_size_bytes = fs::metadata(&path).map(|m| m.len()).ok();
                        let file_extension = path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| format!(".{}", e.to_lowercase()));
                        let target = malware_dir.join(path.file_name().unwrap_or_default());
                        let _ = fs::rename(&path, &target);

                        let manifest = QuarantineManifest {
                            artifact_name: path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            detected_hash: dna_hash.clone(),
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
                            matched_entry: matched_entry_opt.clone(),
                            detection_type: Some(detection_type_str.clone()),
                        };
                        let manifest_path = reports_dir.join(format!(
                            "{}.manifest.json",
                            target.file_name().unwrap_or_default().to_string_lossy()
                        ));
                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                            let _ = fs::write(manifest_path, json);
                        }

                        let _ = app.emit(
                            "malware_detected",
                            serde_json::json!({
                                "path": target.to_string_lossy().to_string(),
                                "name": path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                "hash": dna_hash,
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

                        cache.remove(&path_str);
                        let target_str = target.to_string_lossy().to_string();
                        cache.insert(
                            target_str.clone(),
                            CacheEntry {
                                mtime,
                                dna_hash: dna_hash.clone(),
                                explicitly_local: false,
                                quarantined: true,
                                heuristic_malware_sig: Some(signature_name.clone()),
                                heuristic_sigs_mtime: current_sigs_version,
                            },
                        );
                        cache_updated = true;

                        results.push(ModData {
                            name: rel.replace("\\", "/"),
                            hash: dna_hash,
                            status: "QUARANTINED".to_string(),
                            color: "var(--danger)".to_string(),
                            is_script: path.extension().map_or(false, |ext| {
                                crate::game_logic::get_file_label(
                                    &game_schema,
                                    &ext.to_string_lossy(),
                                ) == "SCRIPT"
                            }),
                            mtime,
                        });
                        continue;
                    }

                    let status_string = if explicitly_local {
                        "EXPLICIT LOCAL".to_string()
                    } else {
                        "LOCAL_ONLY".to_string()
                    };

                    results.push(ModData {
                        name: rel.replace("\\", "/"),
                        hash: dna_hash,
                        status: status_string,
                        color: "var(--text-sub)".to_string(),
                        is_script,
                        mtime,
                    });
                }

                if cache_updated {
                    save_cache(&vault_path, &cache);
                }

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
    let preserve_structure = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.preserve_archive_folder_structure)
        .unwrap_or(false);
    let mut extracted = 0usize;
    if let Ok(file) = std::fs::File::open(zip_path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            for i in 0..archive.len() {
                if let Ok(mut zf) = archive.by_index(i) {
                    if zf.is_file() {
                        let Some(enclosed) = zf.enclosed_name() else {
                            continue;
                        };
                        let raw_name = enclosed.to_string_lossy().to_string();
                        if raw_name.contains("__MACOSX") {
                            continue;
                        }
                        if let Some(fname) = enclosed.file_name() {
                            let fname_str = fname.to_string_lossy().to_string();
                            if fname_str.starts_with('.')
                                || fname_str.eq_ignore_ascii_case("desktop.ini")
                            {
                                continue;
                            }
                            let out_path = if preserve_structure {
                                let dest = target_dir.join(&enclosed);
                                if let Some(parent) = dest.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                dest
                            } else {
                                let _ = std::fs::create_dir_all(target_dir);
                                target_dir.join(fname)
                            };
                            if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                                if std::io::copy(&mut zf, &mut out_file).is_ok() {
                                    extracted += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if extracted == 0 {
        let status = std::process::Command::new("tar")
            .arg("-xf")
            .arg(zip_path)
            .arg("-C")
            .arg(target_dir)
            .status();
        if status.map_or(false, |s| s.success()) {
            extracted = 1;
        }
    }
    extracted
}

#[tauri::command]
pub async fn scan_sandbox(
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ModData>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let vault_dir = PathBuf::from(&vault_path);
        let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
            vault_dir
                .parent()
                .unwrap_or(&vault_dir)
                .join("Dev")
                .join("Sandbox")
        } else {
            vault_dir.join("Dev").join("Sandbox")
        };

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

        // Automatically unpack any .zip archives sitting inside Dev/Sandbox so their .package/.ts4script files are ready to symlink
        let mut unpacked_any = false;
        for p in &initial_paths {
            if p.extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
            {
                let target_dir = if p.parent() == Some(dev_lane.as_path()) {
                    let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    dev_lane.join(stem)
                } else {
                    p.parent().unwrap_or(&dev_lane).to_path_buf()
                };
                if extract_sandbox_zip_in_place(p, &target_dir, &game_schema) > 0 {
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

        let manifest_name_lower = game_schema
            .as_ref()
            .map(|s| s.paths.manifest_file.to_lowercase())
            .unwrap_or_else(|| "resource.cfg".to_string());

        let mut results = Vec::new();
        for path in paths {
            let fname_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_lowercase();
            if fname_lower.starts_with('.')
                || fname_lower == "desktop.ini"
                || fname_lower == "override.json"
                || fname_lower == "resource.cfg"
                || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
            {
                continue;
            }
            if fname_lower == "manifest.json" {
                let is_edge = std::fs::read_to_string(&path)
                    .map(|c| is_sanctuary_edge_manifest_json(&c))
                    .unwrap_or(false);
                if is_edge {
                    continue;
                }
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
    let malware_hashes_set: std::collections::HashSet<String> =
        if let Ok(m) = state.malware_hashes.lock() {
            m.iter().cloned().collect()
        } else {
            std::collections::HashSet::new()
        };
    let tier2_hashes_set: std::collections::HashSet<String> =
        if let Ok(v) = state.tier2_hashes.lock() {
            v.iter().cloned().collect()
        } else {
            std::collections::HashSet::new()
        };

    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        if config.vault_path.is_empty() {
            return Err("VAULT_NOT_CONFIGURED".into());
        }

        let source = Path::new(&path);
        if !source.exists() {
            return Err("FILE_NOT_FOUND".into());
        }

        let source_full_str = source.to_string_lossy().to_string();
        let norm_source = source_full_str.replace('\\', "/").to_lowercase();
        let norm_vault = config.vault_path.replace('\\', "/").to_lowercase();
        let is_external_source = !norm_vault.is_empty()
            && !norm_source.starts_with(&norm_vault)
            && crate::utils::is_safe_user_file_path(source);
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
    let config_exts = crate::game_logic::get_config_extensions(&game_schema);
    let fname_lower = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
        .to_lowercase();
    let is_override = fname_lower == "override.json"
        || (fname_lower == "manifest.json"
            && source.is_file()
            && std::fs::read_to_string(source)
                .map(|c| is_sanctuary_edge_manifest_json(&c))
                .unwrap_or(true));
    if !source.is_dir() && ext != "zip" && ext != "rar" && ext != "7z" && !supported.contains(&ext) && !is_override {
        return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
    }

    if is_override && source.is_file() {
        if let Ok(content) = std::fs::read_to_string(&source) {
            if let Some((ovr, manifest_opt, auto_accepted)) =
                crate::commands::edge_network::auto_ingest_edge_json(&config.vault_path, &content, &[])
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
                if should_move_original {
                    let _ = std::fs::remove_file(source);
                }
                return Ok(serde_json::to_string(&vec![fname_lower]).unwrap_or_default());
            } else {
                let _ = app.emit(
                    "edge_override_detected",
                    serde_json::json!({
                        "source_action": "ingest_dropped_file",
                        "override_json": content,
                        "auto_accepted": true,
                    }),
                );
                if should_move_original {
                    let _ = std::fs::remove_file(source);
                }
                return Ok(serde_json::to_string(&vec![fname_lower]).unwrap_or_default());
            }
        }
    }

    let heuristic_sigs =
        get_heuristic_signatures(config.vault_path.clone()).unwrap_or_default();
    let compiled_sigs = CompiledSignatures::new(&heuristic_sigs);

    if !source.is_dir() {
        let source_file_name = source.file_name().unwrap_or_default();
        let source_file_name_str = source_file_name.to_string_lossy().to_string();

        // For single files (including archives or any dropped file), run Malware DNA + Heuristics check FIRST
        // before duplicate checks or extraction so malicious files are immediately intercepted.
        {
            let file_hash = calculate_hash(&source).unwrap_or_default();
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
                let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                let _ = std::fs::create_dir_all(&q_dir);
                let _ = std::fs::create_dir_all(&reports_dir);
                let file_size_bytes = fs::metadata(source).map(|m| m.len()).ok();
                let file_extension = if !ext.is_empty() {
                    Some(format!(".{}", ext))
                } else {
                    None
                };
                let q_target = q_dir.join(&source_file_name);
                let mut source_was_moved = false;
                if should_move_original {
                    if std::fs::rename(source, &q_target).is_ok() {
                        source_was_moved = true;
                    } else if std::fs::copy(source, &q_target).is_ok() {
                        if std::fs::remove_file(source).is_ok() {
                            source_was_moved = true;
                        }
                    }
                } else {
                    let _ = std::fs::copy(source, &q_target);
                }

                let orig_still_exists = source.exists();
                if source_was_moved && !orig_still_exists {
                    if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
                        map.remove(&file_hash.to_lowercase());
                        map.remove(&source_file_name_str);
                        map.remove(&source_file_name_str.to_lowercase());
                    }
                }

                let ingest_mode_str = if should_move_original {
                    "move".to_string()
                } else {
                    "copy".to_string()
                };

                let manifest = QuarantineManifest {
                    artifact_name: source_file_name_str.clone(),
                    detected_hash: file_hash.clone(),
                    signature: matched_sig,
                    quarantine_path: obscure_username(&q_target.to_string_lossy()),
                    original_path: Some(obscure_username(&source_full_str)),
                    original_hash_at_import: Some(file_hash.clone()),
                    original_exists: orig_still_exists,
                    original_shredded: false,
                    quarantined_file_shredded: false,
                    detected_at: chrono::Local::now().to_rfc3339(),
                    source_moved: source_was_moved,
                    ingest_mode: Some(ingest_mode_str),
                    file_size_bytes,
                    file_extension,
                    matched_entry: matched_entry_opt,
                    detection_type: Some(detection_type_str),
                };
                let manifest_path =
                    reports_dir.join(format!("{}.manifest.json", source_file_name_str));
                if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(manifest_path, json);
                }

                let _ = app.emit(
                    "malware_detected",
                    serde_json::json!({
                        "path": q_target.to_string_lossy().to_string(),
                        "name": source_file_name_str,
                        "hash": file_hash,
                        "status": "QUARANTINED",
                        "isLocalOverride": false,
                        "isVirtual": false,
                        "compliance_tier": 5,
                        "original_exists": manifest.original_exists,
                        "original_shredded": manifest.original_shredded,
                        "original_path": manifest.original_path,
                        "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.clone()) } else { None },
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
                return Err("MALWARE".into());
            }
        }

        let cache = load_cache(&config.vault_path);
        let mut needs_hash = true;

        for (k, v) in cache.iter() {
            if v.quarantined || k.contains(".sanctuary_quarantine") {
                continue;
            }
            if let Some(cached_name) = Path::new(k).file_name() {
                if cached_name.to_string_lossy().to_lowercase()
                    == source_file_name.to_string_lossy().to_lowercase()
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
                hash = calculate_hash(&source).unwrap_or_default();
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
                let mut override_json = None::<String>;
                if source.file_name().unwrap_or_default().to_string_lossy().to_lowercase() == "override.json" {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        override_json = Some(content);
                    }
                }
                let _ = app.emit("dna_match_detected", serde_json::json!({ "path": path, "hash": hash, "existing_name": existing_name, "source_action": "ingest_dropped_file", "reason": "SETTINGS_CONFLICT", "override_json": override_json }));
                return Err("SETTINGS_CONFLICT".into());
            } else if !force_replace {
                let _ = app.emit("dna_match_detected", serde_json::json!({ "path": path, "hash": hash, "existing_name": existing_name, "source_action": "ingest_dropped_file", "reason": match_reason }));
                return Err("DNA_MATCH".into());
            }
        }
    }

    let file_name = source.file_name().ok_or("INVALID_FILENAME")?;

    let mut target_dir = crate::utils::get_vault_mods_lane(&config.vault_path);
    if let Some(tf) = target_folder {
        if !tf.is_empty() {
            target_dir = target_dir.join(&tf);
        } else if source.is_file() {
            let file_stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            target_dir = target_dir.join(&file_stem);
        }
    } else if source.is_file() {
        let file_stem = source
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        target_dir = target_dir.join(&file_stem);
    }
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let mut target = target_dir.join(file_name);

    if exists && force_replace {
        target = Path::new(&existing_name).to_path_buf();
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

    if source.is_dir() {
        for entry in walkdir::WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
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
                let sp_name = sp.file_name().unwrap_or_default().to_string_lossy().to_string();
                let sp_full = sp.to_string_lossy().to_string();
                record_volatile_origin(&sp_hash, &sp_name, &sp_full);

                let mut matched_sig = "NO SIGNATURE MATCH".to_string();
                let mut matched_entry_opt: Option<String> = None;
                let mut detection_type_str = "hash_blacklist".to_string();
                let mut is_malware = !sp_hash.is_empty() && malware_hashes_set.contains(&sp_hash);
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
                    let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                    let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                    let _ = std::fs::create_dir_all(&q_dir);
                    let _ = std::fs::create_dir_all(&reports_dir);
                    let file_size_bytes = fs::metadata(sp).map(|m| m.len()).ok();
                    let q_target = q_dir.join(&sp_name);
                    let mut source_was_moved = false;
                    if should_move_original {
                        if std::fs::rename(sp, &q_target).is_ok() {
                            source_was_moved = true;
                        } else if std::fs::copy(sp, &q_target).is_ok() {
                            if std::fs::remove_file(sp).is_ok() {
                                source_was_moved = true;
                            }
                        }
                    } else {
                        let _ = std::fs::copy(sp, &q_target);
                    }
                    let orig_still_exists = sp.exists();
                    if source_was_moved && !orig_still_exists {
                        if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
                            map.remove(&sp_hash.to_lowercase());
                            map.remove(&sp_name);
                            map.remove(&sp_name.to_lowercase());
                        }
                    }
                    let ingest_mode_str = if should_move_original {
                        "move".to_string()
                    } else {
                        "copy".to_string()
                    };

                    let manifest = QuarantineManifest {
                        artifact_name: sp_name.clone(),
                        detected_hash: sp_hash.clone(),
                        signature: matched_sig,
                        quarantine_path: obscure_username(&q_target.to_string_lossy()),
                        original_path: Some(obscure_username(&sp_full)),
                        original_hash_at_import: Some(sp_hash.clone()),
                        original_exists: orig_still_exists,
                        original_shredded: false,
                        quarantined_file_shredded: false,
                        detected_at: chrono::Local::now().to_rfc3339(),
                        source_moved: source_was_moved,
                        ingest_mode: Some(ingest_mode_str),
                        file_size_bytes,
                        file_extension: sp_ext,
                        matched_entry: matched_entry_opt,
                        detection_type: Some(detection_type_str),
                    };
                    let manifest_path = reports_dir.join(format!("{}.manifest.json", sp_name));
                    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                        let _ = fs::write(manifest_path, json);
                    }
                    let _ = app.emit(
                        "malware_detected",
                        serde_json::json!({
                            "path": q_target.to_string_lossy().to_string(),
                            "name": sp_name,
                            "hash": sp_hash,
                            "status": "QUARANTINED",
                            "isLocalOverride": false,
                            "isVirtual": false,
                            "compliance_tier": 5,
                            "original_exists": manifest.original_exists,
                            "original_shredded": manifest.original_shredded,
                            "original_path": manifest.original_path,
                            "volatile_original_path": if is_external_source && orig_still_exists { Some(sp_full) } else { None },
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
                    return Err("MALWARE".into());
                }
            }
        }

        for entry in walkdir::WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
            let sp = entry.path();
            if crate::utils::is_macos_or_os_metadata_path(sp) {
                continue;
            }
            if let Ok(rel) = sp.strip_prefix(source) {
                let dest = target.join(rel);
                if sp.is_dir() {
                    let _ = std::fs::create_dir_all(&dest);
                } else if sp.is_file() {
                    let fname_low = sp.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                    if fname_low == ".sanctuary_cache.json" || fname_low == "desktop.ini" || fname_low == "default.ini" {
                        continue;
                    }
                    if let Some(parent) = dest.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = std::fs::copy(sp, &dest);
                }
            }
        }
        let mut dir_hashes = Vec::new();
        let mut dir_edge_json: Option<String> = None;
        for entry in walkdir::WalkDir::new(&target).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() {
                let fn_lower = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                if fn_lower == "override.json" {
                    if let Ok(c) = std::fs::read_to_string(p) {
                        if dir_edge_json.is_none() {
                            dir_edge_json = Some(c);
                        }
                    }
                    let _ = std::fs::remove_file(p);
                } else if fn_lower == "manifest.json" {
                    let mut is_edge = false;
                    if let Ok(c) = std::fs::read_to_string(p) {
                        if is_sanctuary_edge_manifest_json(&c) {
                            dir_edge_json = Some(c);
                            is_edge = true;
                        }
                    }
                    if is_edge
                        && !supported.contains(&"json".to_string())
                        && !config_exts.contains(&"json".to_string())
                    {
                        let _ = std::fs::remove_file(p);
                    }
                } else if let Some(e_str) = p.extension().and_then(|s| s.to_str()) {
                    if supported.contains(&e_str.to_lowercase()) {
                        if let Ok(h) = calculate_hash(p) {
                            if !h.is_empty() && !dir_hashes.contains(&h) {
                                dir_hashes.push(h);
                            }
                        }
                    }
                }
            }
        }
        if let Some(edge_raw) = dir_edge_json {
            if let Some((ovr, manifest_opt, auto_accepted)) =
                crate::commands::edge_network::auto_ingest_edge_json(&config.vault_path, &edge_raw, &dir_hashes)
            {
                let _ = app.emit(
                    "edge_override_detected",
                    serde_json::json!({
                        "source_action": "ingest_dropped_file",
                        "override_json": serde_json::to_string(&ovr).unwrap_or(edge_raw),
                        "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()),
                        "extracted_hashes": dir_hashes,
                        "auto_accepted": auto_accepted,
                    }),
                );
            }
        }
        if should_move_original {
            let _ = std::fs::remove_dir_all(source);
        }
        return Ok(
            serde_json::to_string(&vec![file_name.to_string_lossy().to_string()])
                .unwrap_or_default(),
        );
    } else {
        let ext = source
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext == "zip" {
            let file = std::fs::File::open(source).map_err(|e| e.to_string())?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
            let mut extracted_files = Vec::new();

            let zip_stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let target_base = crate::utils::get_vault_mods_lane(&config.vault_path).join(&zip_stem);
            let _ = std::fs::create_dir_all(&target_base);

            let cache = load_cache(&config.vault_path);
            
            let mut zip_override_json: Option<String> = None;
            let mut zip_manifest_json: Option<String> = None;
            let mut extracted_mod_hashes: Vec<String> = Vec::new();
            for i in 0..archive.len() {
                if let Ok(mut zf) = archive.by_index(i) {
                    let Some(enclosed) = zf.enclosed_name() else {
                        continue;
                    };
                    if zf.is_file() {
                        let zf_fname = enclosed.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                        if zf_fname == "override.json" {
                            let mut buf = String::new();
                            use std::io::Read;
                            if zf.read_to_string(&mut buf).is_ok() {
                                zip_override_json = Some(buf);
                            }
                        } else if zf_fname == "manifest.json" {
                            let mut buf = String::new();
                            use std::io::Read;
                            if zf.read_to_string(&mut buf).is_ok() {
                                if is_sanctuary_edge_manifest_json(&buf) {
                                    zip_manifest_json = Some(buf);
                                }
                            }
                        }
                    }
                }
            }
            let mut lineage_known_hashes: Vec<String> = Vec::new();
            for raw_opt in [&zip_manifest_json, &zip_override_json] {
                if let Some(raw_str) = raw_opt {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_str) {
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
                        if let Some(p_hash) = val.get("payload").and_then(|p| p.get("sha256")).and_then(|v| v.as_str()) {
                            lineage_known_hashes.push(p_hash.to_lowercase());
                        }
                    }
                }
            }

            for i in 0..archive.len() {
                if let Ok(mut zf) = archive.by_index(i) {
                    if zf.is_file() {
                        let Some(enclosed) = zf.enclosed_name() else {
                            continue;
                        };
                        let p = enclosed.as_path();
                        if crate::utils::is_macos_or_os_metadata_path(p) {
                            continue;
                        }
                        let zf_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        let vault_visible_exts =
                            crate::game_logic::get_vault_visible_extensions(&game_schema);
                        if vault_visible_exts.contains(&zf_ext) {
                            if let Some(zf_file_name) = p.file_name() {
                                let file_name_str = zf_file_name.to_string_lossy().to_string();
                                let mut file_target = target_base.clone();
                                if let Some(parent) = p.parent() {
                                    file_target = file_target.join(parent);
                                }
                                let _ = std::fs::create_dir_all(&file_target);
                                let mut final_path = file_target.join(zf_file_name);

                                let mut needs_resolution = false;
                                let mut resolution_existing_name =
                                    final_path.to_string_lossy().to_string();
                                let mut found_existing = false;
                                let zf_ext_with_dot = format!(".{}", zf_ext);
                                let is_setting_file = game_schema
                                    .as_ref()
                                    .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                                    .map(|list| list.contains(&zf_ext_with_dot))
                                    .unwrap_or(false);

                                for (k, v) in cache.iter() {
                                    if v.quarantined || k.contains(".sanctuary_quarantine") {
                                        continue;
                                    }
                                    if Path::new(k).file_name() == Some(zf_file_name)
                                        && Path::new(k).exists()
                                    {
                                        found_existing = true;
                                        resolution_existing_name = k.clone();
                                        break;
                                    }
                                }

                                if !found_existing && final_path.exists() {
                                    found_existing = true;
                                }

                                let is_lineage_upgrade = if found_existing && !lineage_known_hashes.is_empty() {
                                    if let Some(cached_entry) = cache.get(&resolution_existing_name) {
                                        lineage_known_hashes.contains(&cached_entry.dna_hash.to_lowercase())
                                    } else if let Ok(existing_h) = calculate_hash(Path::new(&resolution_existing_name)) {
                                        lineage_known_hashes.contains(&existing_h.to_lowercase())
                                    } else {
                                        false
                                    }
                                } else {
                                    false
                                };

                                if found_existing {
                                    if is_setting_file {
                                        needs_resolution = true;
                                    } else if force_replace || is_lineage_upgrade {
                                        final_path =
                                            Path::new(&resolution_existing_name).to_path_buf();
                                    } else {
                                        needs_resolution = true;
                                    }
                                }

                                let mut extract_target = final_path.clone();

                                if needs_resolution {
                                    let mut new_name =
                                        final_path.file_name().unwrap().to_os_string();
                                    new_name.push(".tmp_sanctuary_conflict");
                                    extract_target = final_path.with_file_name(new_name);
                                }

                                if let Ok(mut out_file) = std::fs::File::create(&extract_target) {
                                    let _ = std::io::copy(&mut zf, &mut out_file);
                                    extracted_files.push(file_name_str.clone());

                                    let fn_lower = file_name_str.to_lowercase();
                                    if fn_lower == "override.json"
                                        || (fn_lower == "manifest.json"
                                            && zip_manifest_json.is_some()
                                            && !supported.contains(&"json".to_string())
                                            && !config_exts.contains(&"json".to_string()))
                                    {
                                        let _ = std::fs::remove_file(&extract_target);
                                        continue;
                                    }

                                    let extracted_hash =
                                        calculate_hash(&extract_target).unwrap_or_default();
                                    if !extracted_hash.is_empty() && !extracted_mod_hashes.contains(&extracted_hash) {
                                        extracted_mod_hashes.push(extracted_hash.clone());
                                    }
                                    record_volatile_origin(&extracted_hash, &file_name_str, &source_full_str);
                                    let mut matched_sig = "NO SIGNATURE MATCH".to_string();
                                    let mut matched_entry_opt: Option<String> = None;
                                    let mut detection_type_str = "hash_blacklist".to_string();
                                    let mut is_malware = malware_hashes_set.contains(&extracted_hash);
                                    let is_verified = tier2_hashes_set.contains(&extracted_hash);
                                    if !is_malware && !is_verified {
                                        if let Some(detail) =
                                            check_heuristic_malware_detailed(&extract_target, &compiled_sigs)
                                        {
                                            is_malware = true;
                                            matched_sig = detail.signature;
                                            matched_entry_opt = detail.matched_entry.or_else(|| Some(file_name_str.clone()));
                                            detection_type_str = detail.detection_type;
                                        }
                                    }

                                    if is_malware {
                                        let q_dir = Path::new(&config.vault_path)
                                            .join(".sanctuary_quarantine");
                                        let reports_dir =
                                            Path::new(&config.vault_path).join("Quarantine");
                                        let _ = std::fs::create_dir_all(&q_dir);
                                        let _ = std::fs::create_dir_all(&reports_dir);
                                        let file_size_bytes = fs::metadata(&extract_target).map(|m| m.len()).ok();
                                        let q_target = q_dir.join(&zf_file_name);
                                        let _ = std::fs::copy(&extract_target, &q_target);
                                        let _ = std::fs::remove_file(&extract_target);

                                        let mut source_was_moved = false;
                                        if should_move_original && source.exists() {
                                            if std::fs::remove_file(source).is_ok() {
                                                source_was_moved = true;
                                            }
                                        }
                                        let orig_still_exists = source.exists();
                                        if source_was_moved && !orig_still_exists {
                                            if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
                                                map.remove(&extracted_hash.to_lowercase());
                                                map.remove(&file_name_str);
                                                map.remove(&file_name_str.to_lowercase());
                                            }
                                        }
                                        let ingest_mode_str = if should_move_original {
                                            "move".to_string()
                                        } else {
                                            "copy".to_string()
                                        };

                                        let manifest = QuarantineManifest {
                                            artifact_name: zf_file_name
                                                .to_string_lossy()
                                                .to_string(),
                                            detected_hash: extracted_hash.clone(),
                                            signature: matched_sig,
                                            quarantine_path: obscure_username(
                                                &q_target.to_string_lossy(),
                                            ),
                                            original_path: Some(obscure_username(
                                                &source.to_string_lossy(),
                                            )),
                                            original_hash_at_import: Some(
                                                calculate_hash(&source).unwrap_or_else(|_| extracted_hash.clone()),
                                            ),
                                            original_exists: orig_still_exists,
                                            original_shredded: false,
                                            quarantined_file_shredded: false,
                                            detected_at: chrono::Local::now().to_rfc3339(),
                                            source_moved: source_was_moved,
                                            ingest_mode: Some(ingest_mode_str),
                                            file_size_bytes,
                                            file_extension: Some(zf_ext_with_dot.clone()),
                                            matched_entry: matched_entry_opt,
                                            detection_type: Some(detection_type_str),
                                        };
                                        let manifest_path = reports_dir.join(format!(
                                            "{}.manifest.json",
                                            zf_file_name.to_string_lossy()
                                        ));
                                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                                            let _ = fs::write(manifest_path, json);
                                        }

                                        let _ = app.emit(
                                            "malware_detected",
                                            serde_json::json!({
                                                "path": q_target.to_string_lossy().to_string(),
                                                "name": zf_file_name.to_string_lossy().to_string(),
                                                "hash": extracted_hash,
                                                "status": "QUARANTINED",
                                                "isLocalOverride": false,
                                                "isVirtual": false,
                                                "compliance_tier": 5,
                                                "original_exists": manifest.original_exists,
                                                "original_shredded": manifest.original_shredded,
                                                "original_path": manifest.original_path,
                                                "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.clone()) } else { None },
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
                                        drop(out_file);
                                        return Err("MALWARE".into());
                                    } else {
                                        if needs_resolution {
                                            let reason = if is_setting_file {
                                                "SETTINGS_CONFLICT"
                                            } else {
                                                "ZIP_NAME_MATCH"
                                            };
                                            let _ = app.emit("dna_match_detected", serde_json::json!({
                                                "path": extract_target.to_string_lossy().to_string(), 
                                                "hash": "", 
                                                "existing_name": resolution_existing_name, 
                                                "source_action": "ingest_dropped_file", 
                                                "reason": reason,
                                                "override_json": zip_override_json.clone()
                                            }));
                                        } else {
                                            let mut hash_match_found = false;
                                            let mut matched_existing_name = String::new();
                                            for (k, v) in cache.iter() {
                                                if v.quarantined || k.contains(".sanctuary_quarantine") {
                                                    continue;
                                                }
                                                if v.dna_hash == extracted_hash
                                                    && !extracted_hash.is_empty()
                                                    && Path::new(k).exists()
                                                {
                                                    hash_match_found = true;
                                                    matched_existing_name = k.clone();
                                                    break;
                                                }
                                            }
                                            if hash_match_found {
                                                let mut new_name = extract_target
                                                    .file_name()
                                                    .unwrap()
                                                    .to_os_string();
                                                new_name.push(".tmp_sanctuary_conflict");
                                                let conflict_target =
                                                    extract_target.with_file_name(new_name);
                                                let _ = std::fs::rename(
                                                    &extract_target,
                                                    &conflict_target,
                                                );

                                                let _ = app.emit("dna_match_detected", serde_json::json!({
                                                    "path": conflict_target.to_string_lossy().to_string(), 
                                                    "hash": extracted_hash, 
                                                    "existing_name": matched_existing_name, 
                                                    "source_action": "ingest_dropped_file", 
                                                    "reason": "ZIP_DNA_MATCH",
                                                    "override_json": zip_override_json.clone()
                                                }));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            drop(archive);
            let primary_edge_json = zip_manifest_json.as_ref().or(zip_override_json.as_ref());
            if let Some(raw_edge) = primary_edge_json {
                if let Some((mut ovr, manifest_opt, auto_accepted)) =
                    crate::commands::edge_network::auto_ingest_edge_json(&config.vault_path, raw_edge, &extracted_mod_hashes)
                {
                    if (ovr.manifest_url.is_empty() || ovr.manifest_url.contains("your-domain.com") || ovr.manifest_url.contains("example.com"))
                        && zip_override_json.is_some()
                    {
                        if let Ok(legacy_ovr) = serde_json::from_str::<crate::commands::edge_network::EdgeOverride>(zip_override_json.as_ref().unwrap()) {
                            if !legacy_ovr.manifest_url.is_empty() {
                                ovr.manifest_url = legacy_ovr.manifest_url;
                            }
                        }
                    }
                    let _ = app.emit("edge_override_detected", serde_json::json!({
                        "source_action": "ingest_dropped_file",
                        "override_json": serde_json::to_string(&ovr).unwrap_or_else(|_| raw_edge.clone()),
                        "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()).or_else(|| zip_manifest_json.clone()),
                        "extracted_hashes": extracted_mod_hashes,
                        "auto_accepted": auto_accepted,
                    }));
                } else {
                    let _ = app.emit("edge_override_detected", serde_json::json!({
                        "source_action": "ingest_dropped_file",
                        "override_json": raw_edge,
                        "manifest_json": zip_manifest_json,
                        "extracted_hashes": extracted_mod_hashes,
                        "auto_accepted": true,
                    }));
                }
            }
            if std::fs::read_dir(&target_base)
                .map(|mut iter| iter.next().is_none())
                .unwrap_or(false)
            {
                let _ = std::fs::remove_dir(&target_base);
            }
            if extracted_files.is_empty() && zip_override_json.is_none() && zip_manifest_json.is_none() {
                return Err("No supported files found inside archive.".into());
            }
            if should_move_original {
                let _ = std::fs::remove_file(source);
            }
            return Ok(serde_json::to_string(&extracted_files).unwrap_or_else(|_| "[]".to_string()));
        } else if ext == "rar" || ext == "7z" {
            let zip_stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let target_base = crate::utils::get_vault_mods_lane(&config.vault_path).join(&zip_stem);
            let tmp_extract = Path::new(&config.vault_path).join(format!(
                ".tmp_sanctuary_{}_{}",
                ext,
                uuid::Uuid::new_v4()
            ));
            let _ = std::fs::create_dir_all(&tmp_extract);

            let mut cmd = std::process::Command::new("tar");
            cmd.arg("-xf")
                .arg(source)
                .arg("-C")
                .arg(&tmp_extract);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let status = cmd.status();

            if let Ok(st) = status {
                if !st.success() {
                    let _ = std::fs::remove_dir_all(&tmp_extract);
                    return Err(format!(
                        "Failed to extract {} archive natively. Your OS might not support it yet.",
                        ext.to_uppercase()
                    ));
                }
            } else {
                let _ = std::fs::remove_dir_all(&tmp_extract);
                return Err(format!(
                    "Failed to extract {} archive. Native extraction tool not found.",
                    ext.to_uppercase()
                ));
            }

            let mut extracted_files = Vec::new();
            let vault_visible_exts = crate::game_logic::get_vault_visible_extensions(&game_schema);
            let cache = load_cache(&config.vault_path);
            let _ = std::fs::create_dir_all(&target_base);

            let canonical_tmp = std::fs::canonicalize(&tmp_extract).unwrap_or_else(|_| tmp_extract.clone());
            for entry in walkdir::WalkDir::new(&tmp_extract)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_symlink() {
                    continue;
                }
                if entry.file_type().is_file() {
                    let p = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(p) {
                        continue;
                    }
                    if let Ok(canon_p) = std::fs::canonicalize(p) {
                        if !canon_p.starts_with(&canonical_tmp) {
                            continue;
                        }
                    }
                    let Ok(rel_path) = p.strip_prefix(&tmp_extract) else {
                        continue;
                    };
                    if rel_path
                        .components()
                        .any(|c| !matches!(c, std::path::Component::Normal(_)))
                    {
                        continue;
                    }
                    let zf_ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if !vault_visible_exts.contains(&zf_ext) {
                        let p_hash = calculate_hash(p).unwrap_or_default();
                        let p_is_verified = !p_hash.is_empty() && tier2_hashes_set.contains(&p_hash);
                        let mut p_is_malware = !p_hash.is_empty() && malware_hashes_set.contains(&p_hash);
                        let mut p_sig = "NO SIGNATURE MATCH".to_string();
                        let mut p_det_type = "hash_blacklist".to_string();
                        if !p_is_malware && !p_is_verified {
                            if let Some(detail) = check_heuristic_malware_detailed(p, &compiled_sigs) {
                                p_is_malware = true;
                                p_sig = detail.signature;
                                p_det_type = detail.detection_type;
                            }
                        }
                        if p_is_malware {
                            let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                            let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                            let _ = std::fs::create_dir_all(&q_dir);
                            let _ = std::fs::create_dir_all(&reports_dir);
                            let p_fname = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let file_size_bytes = fs::metadata(p).map(|m| m.len()).ok();
                            let q_target = q_dir.join(&p_fname);
                            let _ = std::fs::copy(p, &q_target);
                            let mut source_was_moved = false;
                            if should_move_original && source.exists() {
                                if std::fs::remove_file(source).is_ok() {
                                    source_was_moved = true;
                                }
                            }
                            let orig_still_exists = source.exists();
                            let manifest = QuarantineManifest {
                                artifact_name: p_fname.clone(),
                                detected_hash: p_hash.clone(),
                                signature: p_sig,
                                quarantine_path: obscure_username(&q_target.to_string_lossy()),
                                original_path: Some(obscure_username(&source.to_string_lossy())),
                                original_hash_at_import: Some(calculate_hash(&source).unwrap_or_else(|_| p_hash.clone())),
                                original_exists: orig_still_exists,
                                original_shredded: false,
                                quarantined_file_shredded: false,
                                detected_at: chrono::Local::now().to_rfc3339(),
                                source_moved: source_was_moved,
                                ingest_mode: Some(if should_move_original { "move".to_string() } else { "copy".to_string() }),
                                file_size_bytes,
                                file_extension: if !zf_ext.is_empty() { Some(format!(".{}", zf_ext)) } else { None },
                                matched_entry: Some(rel_path.to_string_lossy().replace('\\', "/")),
                                detection_type: Some(p_det_type),
                            };
                            let manifest_path = reports_dir.join(format!("{}.manifest.json", p_fname));
                            if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                                let _ = std::fs::write(manifest_path, json);
                            }
                            let _ = app.emit(
                                "malware_detected",
                                serde_json::json!({
                                    "path": q_target.to_string_lossy().to_string(),
                                    "name": p_fname,
                                    "hash": p_hash,
                                    "status": "QUARANTINED",
                                    "isLocalOverride": false,
                                    "isVirtual": false,
                                    "compliance_tier": 5,
                                    "original_exists": manifest.original_exists,
                                    "original_shredded": manifest.original_shredded,
                                    "original_path": manifest.original_path,
                                    "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.clone()) } else { None },
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
                            let _ = std::fs::remove_dir_all(&tmp_extract);
                            let _ = std::fs::remove_dir_all(&target_base);
                            return Err("MALWARE".into());
                        }
                    }
                    if vault_visible_exts.contains(&zf_ext) || p.file_name().unwrap_or_default().to_string_lossy().to_lowercase().contains("override") && zf_ext == "json" {
                        if let Some(zf_file_name) = p.file_name() {
                            let file_name_str = zf_file_name.to_string_lossy().to_string();

                            let mut file_target = target_base.clone();
                            if let Some(parent) = rel_path.parent() {
                                file_target = file_target.join(parent);
                            }
                            let _ = std::fs::create_dir_all(&file_target);
                            let mut final_path = file_target.join(zf_file_name);

                            let mut needs_resolution = false;
                            let mut resolution_existing_name =
                                final_path.to_string_lossy().to_string();
                            let mut found_existing = false;
                            let zf_ext_with_dot = format!(".{}", zf_ext);
                            let is_setting_file = game_schema
                                .as_ref()
                                .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                                .map(|list| list.contains(&zf_ext_with_dot))
                                .unwrap_or(false);

                            for (k, v) in cache.iter() {
                                if v.quarantined || k.contains(".sanctuary_quarantine") {
                                    continue;
                                }
                                if Path::new(k).file_name() == Some(zf_file_name)
                                    && Path::new(k).exists()
                                {
                                    found_existing = true;
                                    resolution_existing_name = k.clone();
                                    break;
                                }
                            }

                            if !found_existing && final_path.exists() {
                                found_existing = true;
                            }

                            if found_existing {
                                if is_setting_file {
                                    needs_resolution = true;
                                } else if force_replace {
                                    final_path = Path::new(&resolution_existing_name).to_path_buf();
                                } else {
                                    needs_resolution = true;
                                }
                            }

                            let mut extract_target = final_path.clone();
                            if needs_resolution {
                                let mut new_name = final_path.file_name().unwrap().to_os_string();
                                new_name.push(".tmp_sanctuary_conflict");
                                extract_target = final_path.with_file_name(new_name);
                            }

                            if let Ok(_) = std::fs::copy(p, &extract_target) {
                                extracted_files.push(file_name_str.clone());

                                    if file_name_str == "override.json" {
                                        if let Ok(content) = std::fs::read_to_string(&extract_target) {
                                            let _ = app.emit("edge_override_detected", serde_json::json!({
                                                "source_action": "ingest_dropped_file",
                                                "override_json": content,
                                            }));
                                        }
                                    }

                                let extracted_hash =
                                    calculate_hash(&extract_target).unwrap_or_default();
                                record_volatile_origin(&extracted_hash, &file_name_str, &source_full_str);
                                let mut matched_sig = "NO SIGNATURE MATCH".to_string();
                                let mut matched_entry_opt: Option<String> = None;
                                let mut detection_type_str = "hash_blacklist".to_string();
                                let mut is_malware = malware_hashes_set.contains(&extracted_hash);
                                let is_verified = tier2_hashes_set.contains(&extracted_hash);
                                if !is_malware && !is_verified {
                                    if let Some(detail) =
                                        check_heuristic_malware_detailed(&extract_target, &compiled_sigs)
                                    {
                                        is_malware = true;
                                        matched_sig = detail.signature;
                                        matched_entry_opt = detail.matched_entry.or_else(|| Some(file_name_str.clone()));
                                        detection_type_str = detail.detection_type;
                                    }
                                }

                                if is_malware {
                                    let q_dir =
                                        Path::new(&config.vault_path).join(".sanctuary_quarantine");
                                    let reports_dir =
                                        Path::new(&config.vault_path).join("Quarantine");
                                    let _ = std::fs::create_dir_all(&q_dir);
                                    let _ = std::fs::create_dir_all(&reports_dir);
                                    let file_size_bytes = fs::metadata(&extract_target).map(|m| m.len()).ok();
                                    let q_target = q_dir.join(&zf_file_name);
                                    let _ = std::fs::copy(&extract_target, &q_target);
                                    let _ = std::fs::remove_file(&extract_target);

                                    let mut source_was_moved = false;
                                    if should_move_original && source.exists() {
                                        if std::fs::remove_file(source).is_ok() {
                                            source_was_moved = true;
                                        }
                                    }
                                    let orig_still_exists = source.exists();
                                    if source_was_moved && !orig_still_exists {
                                        if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
                                            map.remove(&extracted_hash.to_lowercase());
                                            map.remove(&file_name_str);
                                            map.remove(&file_name_str.to_lowercase());
                                        }
                                    }
                                    let ingest_mode_str = if should_move_original {
                                        "move".to_string()
                                    } else {
                                        "copy".to_string()
                                    };

                                    let manifest = QuarantineManifest {
                                        artifact_name: zf_file_name.to_string_lossy().to_string(),
                                        detected_hash: extracted_hash.clone(),
                                        signature: matched_sig,
                                        quarantine_path: obscure_username(
                                            &q_target.to_string_lossy(),
                                        ),
                                        original_path: Some(obscure_username(
                                            &source.to_string_lossy(),
                                        )),
                                        original_hash_at_import: Some(
                                            calculate_hash(&source).unwrap_or_else(|_| extracted_hash.clone()),
                                        ),
                                        original_exists: orig_still_exists,
                                        original_shredded: false,
                                        quarantined_file_shredded: false,
                                        detected_at: chrono::Local::now().to_rfc3339(),
                                        source_moved: source_was_moved,
                                        ingest_mode: Some(ingest_mode_str),
                                        file_size_bytes,
                                        file_extension: Some(zf_ext_with_dot.clone()),
                                        matched_entry: matched_entry_opt,
                                        detection_type: Some(detection_type_str),
                                    };
                                    let manifest_path = reports_dir.join(format!(
                                        "{}.manifest.json",
                                        zf_file_name.to_string_lossy()
                                    ));
                                    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                                        let _ = std::fs::write(manifest_path, json);
                                    }

                                    let _ = app.emit(
                                        "malware_detected",
                                        serde_json::json!({
                                            "path": q_target.to_string_lossy().to_string(),
                                            "name": zf_file_name.to_string_lossy().to_string(),
                                            "hash": extracted_hash,
                                            "status": "QUARANTINED",
                                            "isLocalOverride": false,
                                            "isVirtual": false,
                                            "compliance_tier": 5,
                                            "original_exists": manifest.original_exists,
                                            "original_shredded": manifest.original_shredded,
                                            "original_path": manifest.original_path,
                                            "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.clone()) } else { None },
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
                                    let _ = std::fs::remove_dir_all(&tmp_extract);
                                    return Err("MALWARE".into());
                                } else {
                                    if needs_resolution {
                                        let reason = if is_setting_file {
                                            "SETTINGS_CONFLICT"
                                        } else {
                                            "ZIP_NAME_MATCH"
                                        };
                                        let mut override_json = None::<String>;
                                        if file_name_str.to_lowercase() == "override.json" {
                                            if let Ok(content) = std::fs::read_to_string(&extract_target) {
                                                override_json = Some(content);
                                            }
                                        }
                                        let _ = app.emit("dna_match_detected", serde_json::json!({
                                            "path": extract_target.to_string_lossy().to_string(), 
                                            "hash": "", 
                                            "existing_name": resolution_existing_name, 
                                            "source_action": "ingest_dropped_file", 
                                            "reason": reason,
                                            "override_json": override_json
                                        }));
                                    } else {
                                        let mut hash_match_found = false;
                                        let mut matched_existing_name = String::new();
                                        for (k, v) in cache.iter() {
                                            if v.quarantined || k.contains(".sanctuary_quarantine") {
                                                continue;
                                            }
                                            if v.dna_hash == extracted_hash
                                                && !extracted_hash.is_empty()
                                                && Path::new(k).exists()
                                            {
                                                hash_match_found = true;
                                                matched_existing_name = k.clone();
                                                break;
                                            }
                                        }
                                        if hash_match_found {
                                            let mut new_name =
                                                extract_target.file_name().unwrap().to_os_string();
                                            new_name.push(".tmp_sanctuary_conflict");
                                            let conflict_target =
                                                extract_target.with_file_name(new_name);
                                            let _ =
                                                std::fs::rename(&extract_target, &conflict_target);

                                            let _ = app.emit("dna_match_detected", serde_json::json!({
                                                "path": conflict_target.to_string_lossy().to_string(), 
                                                "hash": extracted_hash, 
                                                "existing_name": matched_existing_name, 
                                                "source_action": "ingest_dropped_file", 
                                                "reason": "ZIP_DNA_MATCH",
                                                "override_json": None::<String>
                                            }));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let _ = std::fs::remove_dir_all(&tmp_extract);

            if std::fs::read_dir(&target_base)
                .map(|mut iter| iter.next().is_none())
                .unwrap_or(false)
            {
                let _ = std::fs::remove_dir(&target_base);
            }
            if extracted_files.is_empty() {
                return Err("No supported files found inside archive.".into());
            }
            if should_move_original {
                let _ = std::fs::remove_file(source);
            }
            return Ok(serde_json::to_string(&extracted_files).unwrap_or_else(|_| "[]".to_string()));
        } else if crate::game_logic::get_supported_extensions(&game_schema).contains(&ext) || file_name.to_string_lossy().to_string().to_lowercase() == "override.json" {
            let file_hash = calculate_hash(&source).unwrap_or_default();
            let file_name_str = file_name.to_string_lossy().to_string();
            record_volatile_origin(&file_hash, &file_name_str, &source_full_str);
            let mut matched_sig = "NO SIGNATURE MATCH".to_string();
            let mut matched_entry_opt: Option<String> = None;
            let mut detection_type_str = "hash_blacklist".to_string();
            let mut is_malware = malware_hashes_set.contains(&file_hash);
            let is_verified = tier2_hashes_set.contains(&file_hash);
            if !is_malware && !is_verified {
                if let Some(detail) = check_heuristic_malware_detailed(source, &compiled_sigs) {
                    is_malware = true;
                    matched_sig = detail.signature;
                    matched_entry_opt = detail.matched_entry;
                    detection_type_str = detail.detection_type;
                }
            }

            if is_malware {
                let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                let _ = std::fs::create_dir_all(&q_dir);
                let _ = std::fs::create_dir_all(&reports_dir);
                let file_size_bytes = fs::metadata(source).map(|m| m.len()).ok();
                let q_target = q_dir.join(&file_name);
                let mut source_was_moved = false;
                if should_move_original {
                    if std::fs::rename(source, &q_target).is_ok() {
                        source_was_moved = true;
                    } else if std::fs::copy(source, &q_target).is_ok() {
                        if std::fs::remove_file(source).is_ok() {
                            source_was_moved = true;
                        }
                    }
                } else {
                    let _ = std::fs::copy(source, &q_target);
                }
                let orig_still_exists = source.exists();
                if source_was_moved && !orig_still_exists {
                    if let Ok(mut map) = app.state::<SecurityState>().volatile_original_paths.lock() {
                        map.remove(&file_hash.to_lowercase());
                        map.remove(&file_name_str);
                        map.remove(&file_name_str.to_lowercase());
                    }
                }
                let ingest_mode_str = if should_move_original {
                    "move".to_string()
                } else {
                    "copy".to_string()
                };

                let manifest = QuarantineManifest {
                    artifact_name: file_name.to_string_lossy().to_string(),
                    detected_hash: file_hash.clone(),
                    signature: matched_sig,
                    quarantine_path: obscure_username(&q_target.to_string_lossy()),
                    original_path: Some(obscure_username(&source.to_string_lossy())),
                    original_hash_at_import: Some(file_hash.clone()),
                    original_exists: orig_still_exists,
                    original_shredded: false,
                    quarantined_file_shredded: false,
                    detected_at: chrono::Local::now().to_rfc3339(),
                    source_moved: source_was_moved,
                    ingest_mode: Some(ingest_mode_str),
                    file_size_bytes,
                    file_extension: if !ext.is_empty() { Some(format!(".{}", ext)) } else { None },
                    matched_entry: matched_entry_opt,
                    detection_type: Some(detection_type_str),
                };
                let manifest_path =
                    reports_dir.join(format!("{}.manifest.json", file_name.to_string_lossy()));
                if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(manifest_path, json);
                }

                let _ = app.emit(
                    "malware_detected",
                    serde_json::json!({
                        "path": q_target.to_string_lossy().to_string(),
                        "name": file_name.to_string_lossy().to_string(),
                        "hash": file_hash,
                        "status": "QUARANTINED",
                        "isLocalOverride": false,
                        "isVirtual": false,
                        "compliance_tier": 5,
                        "original_exists": manifest.original_exists,
                        "original_shredded": manifest.original_shredded,
                        "original_path": manifest.original_path,
                        "volatile_original_path": if is_external_source && orig_still_exists { Some(source_full_str.clone()) } else { None },
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
                return Err("MALWARE".into());
            }

            if should_move_original {
                std::fs::rename(source, &target)
                    .or_else(|_| {
                        std::fs::copy(source, &target).and_then(|_| std::fs::remove_file(source))
                    })
                    .map_err(|e| e.to_string())?;
            } else {
                std::fs::copy(source, &target).map_err(|e| e.to_string())?;
            }

            if file_name_str.to_lowercase() == "override.json" {
                if let Ok(content) = std::fs::read_to_string(&target) {
                    let _ = app.emit("edge_override_detected", serde_json::json!({
                        "source_action": "ingest_dropped_file",
                        "override_json": content,
                    }));
                }
                let _ = std::fs::remove_file(&target);
            }

            return Ok(
                serde_json::to_string(&vec![file_name_str])
                    .unwrap_or_default(),
            );
        } else {
            return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
        }
    }
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
    let game_schema = state.active_schema.lock().unwrap().clone();
    let vault_mods_lane = if crate::utils::is_mods_dir(std::path::Path::new(&vault_path)) {
        PathBuf::from(&vault_path)
    } else {
        PathBuf::from(&vault_path).join("Mods")
    };

    let mut current_path = vault_mods_lane.join(&mod_name);
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
            vault_mods_lane.join(&mod_name)
        } else {
            vault_mods_lane.join(f).join(&mod_name)
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

    let dest_path = if target_folder.is_empty() {
        vault_mods_lane.join(&mod_name)
    } else {
        let t_folder = vault_mods_lane.join(&target_folder);
        let _ = std::fs::create_dir_all(&t_folder);
        t_folder.join(&mod_name)
    };

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
    if vault_path.is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let game_schema = state.active_schema.lock().unwrap().clone();

    let vault_dir = PathBuf::from(&vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir
            .parent()
            .unwrap_or(&vault_dir)
            .join("Dev")
            .join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    if !dev_lane.exists() {
        let _ = fs::create_dir_all(&dev_lane);
    }

    let mut imported = 0;
    for file in files {
        let source = PathBuf::from(&file);
        if let Some(name) = source.file_name() {
            let stem = source.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let mod_folder = dev_lane.join(&stem);
            
            if !mod_folder.exists() {
                let _ = fs::create_dir_all(&mod_folder);
            }
            
            let ext = source.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            if ext == "zip" {
                let count = extract_sandbox_zip_in_place(&source, &mod_folder, &game_schema);
                if count > 0 {
                    imported += count;
                }
            } else {
                let dest = mod_folder.join(name);
                if fs::copy(&source, &dest).is_ok() {
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
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let config_exts = crate::game_logic::get_config_extensions(&game_schema);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
    crate::utils::deduplicate_vault_root_configs(&vault_mods_lane, &config_exts);

    let mut results = Vec::new();
    let scan_paths = vec![
        vault_mods_lane.clone(),
        std::path::PathBuf::from(&vault_path)
            .join("Data")
            .join("Templates"),
    ];

    for p in scan_paths {
        let root = std::path::Path::new(&p);
        if !root.exists() {
            continue;
        }

        let mut queue = vec![(root.to_path_buf(), 0)];
        while let Some((current, depth)) = queue.pop() {
            if depth > 1 {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(&entry_path) {
                        continue;
                    }
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_dir() {
                            queue.push((entry_path, depth + 1));
                        } else if ft.is_file() {
                            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if config_exts.contains(&ext_lower)
                                    || ext_lower == "json"
                                    || ext_lower == "cfg"
                                    || ext_lower == "ini"
                                {
                                    if let Some(name) =
                                        entry_path.file_name().and_then(|n| n.to_str())
                                    {
                                        if !name.starts_with('.')
                                            && !name.starts_with("._")
                                            && !name.eq_ignore_ascii_case("desktop.ini")
                                            && !name.eq_ignore_ascii_case("Default.ini")
                                            && !name.eq_ignore_ascii_case("Resource.cfg")
                                        {
                                            results.push(entry_path.to_string_lossy().to_string());
                                        }
                                    }
                                }
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
            .to_string_lossy();
        let name_b = std::path::Path::new(b)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        name_a.cmp(&name_b)
    });

    Ok(results)
}

#[tauri::command]
pub fn delete_mod(path: String) -> Result<String, String> {
    crate::commands::system::delete_local_file(path)
}

#[tauri::command]
pub fn read_blueprint(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_blueprint(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}


