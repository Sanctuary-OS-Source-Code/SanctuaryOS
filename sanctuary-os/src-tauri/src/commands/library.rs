use crate::commands::state_ops::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::system::*;
use crate::commands::logs::*;
use crate::commands::cache::*;
use crate::commands::game_info::*;
use notify::Watcher;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};
use crate::state::*;
use crate::utils::*;


#[tauri::command]
pub async fn scan_bunker(
    app: tauri::AppHandle,
    vault_path: String,
    _shelter_active: bool,
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<ModData>, String> {
    let game_schema = app_state.active_schema.lock().unwrap().clone();
    let malware_hashes_set: std::collections::HashSet<String> = if let Ok(m) = state.malware_hashes.lock() {
        m.iter().cloned().collect()
    } else {
        std::collections::HashSet::new()
    };

    tauri::async_runtime::spawn_blocking(move || {
        let heuristic_sigs = get_heuristic_signatures(vault_path.clone()).unwrap_or_else(|_| vec![]);
    
    let sigs_path = PathBuf::from(&vault_path).join("Data").join(".malware_signatures.json");
    let current_sigs_mtime = std::fs::metadata(&sigs_path)
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
    if !mods_lane.exists() {
        let _ = fs::create_dir_all(&mods_lane);
        return Ok(vec![]);
    }

   
    if let Ok(entries) = std::fs::read_dir(&mods_lane) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    let supported = crate::game_logic::get_supported_extensions(&game_schema);
                    if supported.contains(&ext_lower) {
                        if let Some(file_stem) = path.file_stem() {
                            let folder_name = file_stem.to_string_lossy().to_string();
                            let target_dir = mods_lane.join(&folder_name);
                            let _ = std::fs::create_dir_all(&target_dir);

                            let target_path = target_dir.join(path.file_name().unwrap());
                            let _ = std::fs::rename(&path, &target_path);
                        }
                    }
                }
            }
        }
    }

    let mut paths = Vec::new();
    walk_packages(&game_schema, &mods_lane, &mut paths);
    
    let quarantine_dir = vault_dir.join("Quarantine");
    if quarantine_dir.exists() {
        walk_packages(&game_schema, &quarantine_dir, &mut paths);
    }
    let total = paths.len();

    let progress_counter = Arc::new(AtomicUsize::new(0));
    let mut results = Vec::new();
    let mut last_emit = std::time::Instant::now();

    for path in paths {
        let path_str = path.to_string_lossy().to_string();
        let rel = path
            .strip_prefix(&mods_lane)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
        if last_emit.elapsed() > std::time::Duration::from_millis(200) || current == total {
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

        let mtime = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let is_script = path.extension().map_or(false, |ext| crate::game_logic::get_file_label(&game_schema, &ext.to_string_lossy()) == "SCRIPT");
        
        let (dna_hash, explicitly_local, mut cached_heuristic_sig) = if let Some(cached) = cache.get(&path_str) {
            if cached.mtime == mtime {
                let heuristic_sig = if cached.heuristic_sigs_mtime == current_sigs_mtime {
                    Some(cached.heuristic_malware_sig.clone())
                } else {
                    None
                };
                (cached.dna_hash.clone(), cached.explicitly_local, heuristic_sig)
            } else {
                let is_dev_folder = path_str.to_lowercase().contains("/dev/") || path_str.to_lowercase().contains("\\dev\\"); let hash = if is_dev_folder { format!("dev_vault_{}", path.file_name().unwrap_or_default().to_string_lossy()) } else { calculate_hash(&path).unwrap_or_default() };
                let explicit = check_is_explicitly_local(&path, is_script, &game_schema);
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
            }
        } else {
            let is_dev_folder = path_str.to_lowercase().contains("/dev/") || path_str.to_lowercase().contains("\\dev\\"); let hash = if is_dev_folder { format!("dev_vault_{}", path.file_name().unwrap_or_default().to_string_lossy()) } else { calculate_hash(&path).unwrap_or_default() };
            let explicit = check_is_explicitly_local(&path, is_script, &game_schema);
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

        if malware_hashes_set.contains(&dna_hash) {
            is_malware = true;
        }

        if !is_malware && is_script {
            if let Some(cached_sig_opt) = cached_heuristic_sig {
                if let Some(sig) = cached_sig_opt {
                    is_malware = true;
                    signature_name = sig;
                }
            } else {
                let sig_opt = check_heuristic_malware(&path, &heuristic_sigs);
                if let Some(sig) = sig_opt.clone() {
                    is_malware = true;
                    signature_name = sig;
                }
                if let Some(entry) = cache.get_mut(&path_str) {
                    entry.heuristic_malware_sig = sig_opt;
                    entry.heuristic_sigs_mtime = current_sigs_mtime;
                    cache_updated = true;
                }
            }
        }

        if is_malware {
            let reports_dir = vault_dir.join("Quarantine");
            let malware_dir = vault_dir.join(".sanctuary_quarantine");
            let _ = fs::create_dir_all(&reports_dir);
            let _ = fs::create_dir_all(&malware_dir);
            let target = malware_dir.join(path.file_name().unwrap_or_default());
            let _ = fs::rename(&path, &target);
            
            let manifest = QuarantineManifest {
                artifact_name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                detected_hash: dna_hash.clone(),
                signature: signature_name.clone(),
                quarantine_path: obscure_username(&target.to_string_lossy()),
                original_path: None,
                original_hash_at_import: None,
                original_exists: false,
                original_shredded: false,
                quarantined_file_shredded: false,
                detected_at: chrono::Local::now().to_rfc3339(),
            };
            let manifest_path = reports_dir.join(format!("{}.manifest.json", target.file_name().unwrap_or_default().to_string_lossy()));
            if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                let _ = fs::write(manifest_path, json);
            }
            
            let _ = app.emit("malware_detected", serde_json::json!({
                "path": target.to_string_lossy().to_string(),
                "name": path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                "hash": dna_hash,
                "status": "QUARANTINED",
                "isLocalOverride": false,
                "isVirtual": false,
                "compliance_tier": 3,
                "original_exists": manifest.original_exists,
                "original_shredded": manifest.original_shredded,
                "original_path": manifest.original_path,
                "quarantine_path": manifest.quarantine_path,
                "matched_signature": manifest.signature
            }));
            
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
                    heuristic_sigs_mtime: current_sigs_mtime,
                }
            );
            cache_updated = true;

            results.push(ModData {
                name: rel.replace("\\", "/"),
                hash: dna_hash,
                status: "QUARANTINED".to_string(),
                color: "var(--danger)".to_string(),
                is_script: path.extension().map_or(false, |ext| crate::game_logic::get_file_label(&game_schema, &ext.to_string_lossy()) == "SCRIPT"),
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
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

#[tauri::command]
pub async fn scan_sandbox(vault_path: String, state: tauri::State<'_, AppState>) -> Result<Vec<ModData>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        let vault_dir = PathBuf::from(&vault_path);
        let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir.parent().unwrap_or(&vault_dir).join("Dev").join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    if !dev_lane.exists() {
        let _ = fs::create_dir_all(&dev_lane);
        return Ok(vec![]);
    }

    let mut paths = Vec::new();
    fn walk_sandbox_files(dir: &Path, paths: &mut Vec<PathBuf>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    walk_sandbox_files(&p, paths);
                } else {
                    paths.push(p);
                }
            }
        }
    }
    walk_sandbox_files(&dev_lane, &mut paths);

    let mut results = Vec::new();
    for path in paths {
        let rel = path
            .strip_prefix(&dev_lane)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        let is_script = path.extension().map_or(false, |ext| crate::game_logic::get_file_label(&game_schema, &ext.to_string_lossy()) == "SCRIPT");
        let hash = format!("dev_sandbox_{}", path.file_name().unwrap_or_default().to_string_lossy());
        
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
pub fn ingest_dropped_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
    path: String,
    force_replace: bool,
) -> Result<String, String> {
    let game_schema = app_state.active_schema.lock().unwrap().clone();
    let config = get_saved_coordinates();
    if config.vault_path.is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }

    let source = Path::new(&path);
    if !source.exists() {
        return Err("FILE_NOT_FOUND".into());
    }

    if !source.is_dir() && !force_replace {
        let source_file_name = source.file_name().unwrap_or_default();
        let cache = load_cache(&config.vault_path);
        let mut exists = false;
        let mut existing_name = String::new();
        let mut match_reason = String::new();
        let mut hash = String::new();
        let mut needs_hash = true;

        for (k, _) in cache.iter() {
            if Path::new(k).file_name() == Some(source_file_name) && Path::new(k).exists() {
                exists = true;
                existing_name = k.clone();
                match_reason = "NAME_MATCH".to_string();
                needs_hash = false;
                break;
            }
        }

        if needs_hash {
            hash = calculate_hash(&source).unwrap_or_default();
            for (k, v) in cache.iter() {
                if v.dna_hash == hash && !hash.is_empty() && Path::new(k).exists() {
                    exists = true;
                    existing_name = k.clone();
                    match_reason = "DNA_MATCH".to_string();
                    break;
                }
            }
        }

        if exists {
            let _ = app.emit("dna_match_detected", serde_json::json!({ "path": path, "hash": hash, "existing_name": existing_name, "source_action": "ingest_dropped_file", "reason": match_reason }));
            return Err("DNA_MATCH".into());
        }
    }

    let file_name = source.file_name().ok_or("INVALID_FILENAME")?;
    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let target_dir = crate::utils::get_vault_mods_lane(&config.vault_path);

    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let target = target_dir.join(file_name);

    if !force_replace && target.exists() {
        let _ = app.emit("dna_match_detected", serde_json::json!({ 
            "path": path, 
            "hash": "", 
            "existing_name": target.to_string_lossy().to_string(), 
            "source_action": "ingest_dropped_file", 
            "reason": "NAME_MATCH" 
        }));
        return Err("DNA_MATCH".into());
    }

    if source.is_dir() {
        let _ = deploy_air_gap(source, &target);
        return Ok(serde_json::to_string(&vec![file_name.to_string_lossy().to_string()]).unwrap_or_default());
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
            
            let zip_stem = source.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let target_base = crate::utils::get_vault_mods_lane(&config.vault_path).join(&zip_stem);
            let _ = std::fs::create_dir_all(&target_base);
            
            let active_base = if !config.mods_path.is_empty() { Some(Path::new(&config.mods_path).join(&zip_stem)) } else { None };
            if let Some(ref active_mods) = active_base {
                let _ = std::fs::create_dir_all(active_mods);
            }
            
            for i in 0..archive.len() {
                if let Ok(mut zf) = archive.by_index(i) {
                    if zf.is_file() {
                        let name = zf.name().to_string();
                        let p = Path::new(&name);
                        let zf_ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        let supported = crate::game_logic::get_supported_extensions(&game_schema);
                if supported.contains(&zf_ext) {
                            if let Some(zf_file_name) = p.file_name() {
                                let file_name_str = zf_file_name.to_string_lossy().to_string();
                                let mut file_target = target_base.clone();
                                if let Some(parent) = p.parent() {
                                    file_target = file_target.join(parent);
                                }
                                let _ = std::fs::create_dir_all(&file_target);
                                let final_path = file_target.join(zf_file_name);
                                
                                let mut extract_target = final_path.clone();
                                let mut needs_resolution = false;

                                if !force_replace && final_path.exists() {
                                    needs_resolution = true;
                                    let mut new_name = final_path.file_name().unwrap().to_os_string();
                                    new_name.push(".tmp_sanctuary_conflict");
                                    extract_target = final_path.with_file_name(new_name);
                                }

                                if let Ok(mut out_file) = std::fs::File::create(&extract_target) {
                                    let _ = std::io::copy(&mut zf, &mut out_file);
                                    extracted_files.push(file_name_str.clone());
                                    
                                    let extracted_hash = calculate_hash(&extract_target).unwrap_or_default();
                                    let is_malware = if let Ok(m) = state.malware_hashes.lock() {
                                        m.contains(&extracted_hash)
                                    } else {
                                        false
                                    };

                                    if is_malware {
                                        let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                                        let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                                        let _ = std::fs::create_dir_all(&q_dir);
                                        let _ = std::fs::create_dir_all(&reports_dir);
                                        let q_target = q_dir.join(&zf_file_name);
                                        let _ = std::fs::copy(&extract_target, &q_target);
                                        let _ = std::fs::remove_file(&extract_target);
                                        
                                        let manifest = QuarantineManifest {
                                            artifact_name: zf_file_name.to_string_lossy().to_string(),
                                            detected_hash: extracted_hash.clone(),
                                            signature: "N/A".to_string(),
                                            quarantine_path: obscure_username(&q_target.to_string_lossy()),
                                            original_path: Some(obscure_username(&source.to_string_lossy())),
                                            original_hash_at_import: Some(calculate_hash(&source).unwrap_or_default()),
                                            original_exists: true,
                                            original_shredded: false,
                                            quarantined_file_shredded: false,
                                            detected_at: chrono::Local::now().to_rfc3339(),
                                        };
                                        let manifest_path = reports_dir.join(format!("{}.manifest.json", zf_file_name.to_string_lossy()));
                                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                                            let _ = fs::write(manifest_path, json);
                                        }
                                        
                                        let _ = app.emit("malware_detected", serde_json::json!({
                                            "path": q_target.to_string_lossy().to_string(), 
                                            "name": zf_file_name.to_string_lossy().to_string(),
                                            "hash": extracted_hash, 
                                            "status": "QUARANTINED",
                                            "isLocalOverride": false,
                                            "isVirtual": false,
                                            "compliance_tier": 3,
                                            "original_exists": manifest.original_exists,
                                            "original_shredded": manifest.original_shredded,
                                            "original_path": manifest.original_path,
                                            "quarantine_path": manifest.quarantine_path,
                                            "matched_signature": manifest.signature
                                        }));
                                        return Err("MALWARE".into());
                                    } else {
                                        if needs_resolution {
                                            let _ = app.emit("dna_match_detected", serde_json::json!({
                                                "path": extract_target.to_string_lossy().to_string(), 
                                                "hash": "", 
                                                "existing_name": final_path.to_string_lossy().to_string(), 
                                                "source_action": "ingest_dropped_file", 
                                                "reason": "ZIP_NAME_MATCH" 
                                            }));
                                        } else {
                                            if let Some(ref active_mods) = active_base {
                                                if active_mods.exists() {
                                                    let mut active_target = active_mods.clone();
                                                    if let Some(parent) = p.parent() {
                                                        active_target = active_target.join(parent);
                                                    }
                                                    let _ = std::fs::create_dir_all(&active_target);
                                                    let _ = std::fs::copy(&extract_target, active_target.join(zf_file_name));
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
            return Ok(serde_json::to_string(&extracted_files).unwrap_or_else(|_| "[]".to_string()));
        } else if crate::game_logic::get_supported_extensions(&game_schema).contains(&ext) {
            let file_hash = calculate_hash(&source).unwrap_or_default();
            let is_malware = if let Ok(m) = state.malware_hashes.lock() {
                m.contains(&file_hash)
            } else {
                false
            };
            
            if is_malware {
                let q_dir = Path::new(&config.vault_path).join(".sanctuary_quarantine");
                let reports_dir = Path::new(&config.vault_path).join("Quarantine");
                let _ = std::fs::create_dir_all(&q_dir);
                let _ = std::fs::create_dir_all(&reports_dir);
                let q_target = q_dir.join(&file_name);
                let _ = std::fs::copy(source, &q_target);
                
                let manifest = QuarantineManifest {
                    artifact_name: file_name.to_string_lossy().to_string(),
                    detected_hash: file_hash.clone(),
                    signature: "NO SIGNATURE MATCH".to_string(),
                    quarantine_path: obscure_username(&q_target.to_string_lossy()),
                    original_path: Some(obscure_username(&source.to_string_lossy())),
                    original_hash_at_import: Some(file_hash.clone()),
                    original_exists: true,
                    original_shredded: false,
                    quarantined_file_shredded: false,
                    detected_at: chrono::Local::now().to_rfc3339(),
                };
                let manifest_path = reports_dir.join(format!("{}.manifest.json", file_name.to_string_lossy()));
                if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(manifest_path, json);
                }
                
                let _ = app.emit("malware_detected", serde_json::json!({
                    "path": q_target.to_string_lossy().to_string(),
                    "name": file_name.to_string_lossy().to_string(),
                    "hash": file_hash,
                    "status": "QUARANTINED",
                    "isLocalOverride": false,
                    "isVirtual": false,
                    "compliance_tier": 3,
                    "original_exists": manifest.original_exists,
                    "original_shredded": manifest.original_shredded,
                    "original_path": manifest.original_path,
                    "quarantine_path": manifest.quarantine_path,
                    "matched_signature": manifest.signature
                }));
                return Err("MALWARE".into());
            }

            std::fs::copy(source, &target).map_err(|e| e.to_string())?;
            if !config.mods_path.is_empty() {
                let active_mods_dir = Path::new(&config.mods_path);
                let active_target = active_mods_dir.to_path_buf();
                let _ = std::fs::create_dir_all(&active_target);
                let _ = std::fs::copy(source, active_target.join(file_name));
            }
            return Ok(serde_json::to_string(&vec![file_name.to_string_lossy().to_string()]).unwrap_or_default());
        } else {
            return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
        }
    }
}

#[tauri::command]
pub async fn move_mod_to_priority_folder(vault_path: String, mod_name: String, target_folder: String) -> Result<String, String> {
    let vault_mods_lane = if crate::utils::is_mods_dir(std::path::Path::new(&vault_path)) {
        PathBuf::from(&vault_path)
    } else {
        PathBuf::from(&vault_path).join("Mods")
    };

    let mut current_path = vault_mods_lane.join(&mod_name);
    let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
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
pub fn import_to_sandbox(files: Vec<String>, vault_path: String) -> Result<usize, String> {
    if vault_path.is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }

    let vault_dir = PathBuf::from(&vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir.parent().unwrap_or(&vault_dir).join("Dev").join("Sandbox")
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
            let dest = dev_lane.join(name);
            if fs::copy(&source, &dest).is_ok() {
                imported += 1;
            }
        }
    }
    
    Ok(imported)
}

#[tauri::command]
pub fn get_sandbox_files(vault_path: String) -> Result<Vec<String>, String> {
    if vault_path.is_empty() {
        return Ok(vec![]);
    }

    let vault_dir = PathBuf::from(&vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir.parent().unwrap_or(&vault_dir).join("Dev").join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(&dev_lane) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.ends_with(".js") || name.ends_with(".ts") || name.ends_with(".json") || name.ends_with(".xml") || name.ends_with(".html") || name.ends_with(".css") || name.ends_with(".txt") || name.ends_with(".cfg") || name.ends_with(".ini") {
                            files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    
    files.sort_unstable();
    Ok(files)
}

#[tauri::command]
pub fn get_workbench_files(vault_path: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let mut scan_paths = vec![
        crate::utils::get_vault_mods_lane(&vault_path),
        std::path::PathBuf::from(&vault_path).join("Data").join("Templates")
    ];

    for p in scan_paths {
        let root = std::path::Path::new(&p);
        if !root.exists() { continue; }
        
        let mut queue = vec![(root.to_path_buf(), 0)];
        while let Some((current, depth)) = queue.pop() {
            if depth > 1 { continue; }
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_dir() {
                            queue.push((entry.path(), depth + 1));
                        } else if ft.is_file() {
                            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if ext_lower == "json" || ext_lower == "cfg" || ext_lower == "ini" {
                                    if let Some(name) = entry.path().file_name().and_then(|n| n.to_str()) {
                                        if !name.starts_with('.') && !name.eq_ignore_ascii_case("desktop.ini") && !name.eq_ignore_ascii_case("Default.ini") {
                                            results.push(entry.path().to_string_lossy().to_string());
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
        let name_a = std::path::Path::new(a).file_name().unwrap_or_default().to_string_lossy();
        let name_b = std::path::Path::new(b).file_name().unwrap_or_default().to_string_lossy();
        name_a.cmp(&name_b)
    });
    
    Ok(results)
}

#[tauri::command]
pub fn read_blueprint(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_blueprint(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

