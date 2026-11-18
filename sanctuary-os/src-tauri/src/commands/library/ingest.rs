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
use super::{scanner::*, workbench_and_assets::*};

pub(super) fn quarantine_detected_threat(
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
    let orig_artifact_name = Path::new(artifact_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "quarantined_artifact".to_string());
    let safe_q_name = crate::utils::resolve_unique_quarantine_filename(
        &q_dir,
        &reports_dir,
        &orig_artifact_name,
        detected_hash,
    );
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
        artifact_name: orig_artifact_name,
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
    let malware_override = state
        .malware_protocol_overridden
        .load(std::sync::atomic::Ordering::SeqCst);
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
        let twin_exts: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.extensions.twin_extensions.as_ref())
            .map(|groups| {
                groups
                    .iter()
                    .flat_map(|g| g.iter())
                    .map(|e| e.trim_start_matches('.').to_lowercase())
                    .filter(|e| !e.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let fname_lower = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let is_edge_sidecar = is_edge_sidecar_filename(&fname_lower);
        let is_archive_ext =
            crate::game_logic::is_archive_container_extension(&ext, &game_schema);

        if !source.is_dir()
            && !is_archive_ext
            && !supported.contains(&ext)
            && !twin_exts.contains(&ext)
            && !is_edge_sidecar
        {
            return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
        }

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
            if !is_archive_ext && supported.contains(&ext) {
                hash = file_hash.clone();
                if !malware_override {
                    crate::game_logic::verify_schema_magic_bytes(source, &game_schema)?;
                }
            }
            record_volatile_origin(&file_hash, &source_file_name_str, &source_full_str);

            let mut matched_sig = "NO SIGNATURE MATCH".to_string();
            let mut matched_entry_opt: Option<String> = None;
            let mut detection_type_str = "hash_blacklist".to_string();
            let mut is_malware = !malware_override
                && !file_hash.is_empty()
                && malware_hashes_set.contains(&file_hash);
            let is_verified = !file_hash.is_empty() && tier2_hashes_set.contains(&file_hash);
            if !malware_override && !is_malware && !is_verified {
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
                let source_file_stem = source
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let desired_rel_lower = if let Some(ref sub) = sanitized_target_subfolder {
                    format!(
                        "{}/{}",
                        sub.to_string_lossy().replace('\\', "/").trim_matches('/'),
                        source_file_name_str
                    )
                    .to_lowercase()
                } else {
                    format!("{}/{}", source_file_stem, source_file_name_str).to_lowercase()
                };
                let flat_leaf_lower = source_file_name_str.to_lowercase();

                for (k, v) in cache.iter() {
                    if v.quarantined || k.contains(".sanctuary_quarantine") {
                        continue;
                    }
                    let k_path = Path::new(k);
                    if let Ok(k_rel) = k_path.strip_prefix(&vault_mods_lane) {
                        let k_rel_lower = k_rel.to_string_lossy().replace('\\', "/").to_lowercase();
                        let matches_rel = k_rel_lower == desired_rel_lower
                            || (sanitized_target_subfolder.is_none()
                                && k_rel_lower == flat_leaf_lower);
                        if matches_rel && k_path.exists() {
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
                    let mut is_malware = !malware_override
                        && !sp_hash.is_empty()
                        && malware_hashes_set.contains(&sp_hash);
                    let is_verified = !sp_hash.is_empty() && tier2_hashes_set.contains(&sp_hash);
                    if !malware_override && !is_malware && !is_verified {
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
                    let _ = crate::utils::remove_file_clearing_readonly(&dst_final);
                }
                std::fs::rename(&src_staged, &dst_final)
                    .or_else(|_| std::fs::copy(&src_staged, &dst_final).map(|_| ()))
                    .map_err(|e| e.to_string())?;

                if let Some(e_str) = dst_final.extension().and_then(|s| s.to_str()) {
                    let e_low = e_str.to_lowercase();
                    if supported.contains(&e_low)
                        && !crate::game_logic::is_archive_container_extension(&e_low, &game_schema)
                    {
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

        // Branch 2: Pure-Rust / Audited Bounded Archive Extraction into Staging First (.zip, .7z, .rar; respects native .jar/.zip mods)
        if is_archive_ext && matches!(ext.as_str(), "zip" | "7z" | "rar") {
            let source_len = std::fs::metadata(source).map(|m| m.len()).unwrap_or(0);
            crate::utils::check_available_disk_space(&vault_root, source_len.saturating_mul(2))?;

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
            let mut stage_guard = TempStagingGuard(stage_dir.clone());

            let mut extraction = crate::utils::extract_archive_bounded_to_dir(
                source,
                &stage_dir,
                Some(&zip_stem),
                &game_schema,
                MAX_ARCHIVE_ENTRY_BYTES,
                MAX_ARCHIVE_TOTAL_BYTES,
            )?;

            // Honor `constraints.requires_script_unzipping`: automatically unpack one nested `.zip`
            // wrapper layer when enabled, never unpacking native script containers (e.g. `.ts4script`, `.jar`).
            let requires_script_unzipping = game_schema
                .as_ref()
                .and_then(|s| s.constraints.as_ref())
                .and_then(|c| c.requires_script_unzipping)
                .unwrap_or(false);
            if requires_script_unzipping {
                let script_exts: Vec<String> = game_schema
                    .as_ref()
                    .and_then(|s| s.extensions.script_extensions.clone())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|e| e.trim_start_matches('.').to_ascii_lowercase())
                    .collect();
                if !script_exts.iter().any(|e| e == "zip") {
                    let mut expanded_files: Vec<ExtractedZipEntry> =
                        Vec::with_capacity(extraction.files.len());
                    for entry in extraction.files {
                        let is_nested_zip = entry
                            .rel_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map_or(false, |e| e.eq_ignore_ascii_case("zip"));
                        if !is_nested_zip {
                            expanded_files.push(entry);
                            continue;
                        }
                        let inner_stem = entry
                            .rel_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("scripts");
                        let inner_parent_rel = entry
                            .rel_path
                            .parent()
                            .map(|p| p.to_path_buf())
                            .unwrap_or_default();
                        let inner_stage = entry
                            .staged_path
                            .parent()
                            .unwrap_or(&stage_dir)
                            .join(inner_stem);
                        match crate::utils::extract_zip_bounded_to_dir(
                            &entry.staged_path,
                            &inner_stage,
                            Some(inner_stem),
                            &game_schema,
                            MAX_ARCHIVE_ENTRY_BYTES,
                            MAX_ARCHIVE_TOTAL_BYTES.saturating_sub(extraction.total_bytes),
                        ) {
                            Ok(inner_ext) if !inner_ext.files.is_empty() => {
                                extraction.total_bytes =
                                    extraction.total_bytes.saturating_add(inner_ext.total_bytes);
                                let _ = std::fs::remove_file(&entry.staged_path);
                                for mut inner_item in inner_ext.files {
                                    inner_item.rel_path = if inner_parent_rel.as_os_str().is_empty()
                                    {
                                        PathBuf::from(inner_stem).join(&inner_item.rel_path)
                                    } else {
                                        inner_parent_rel
                                            .join(inner_stem)
                                            .join(&inner_item.rel_path)
                                    };
                                    expanded_files.push(inner_item);
                                }
                            }
                            _ => expanded_files.push(entry),
                        }
                    }
                    extraction.files = expanded_files;
                }
            }

            // Step A: Scan EVERY staged file for malware/heuristics BEFORE FOMOD or touching Vault/Mods
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
                let mut is_malware = !malware_override
                    && !entry_hash.is_empty()
                    && malware_hashes_set.contains(&entry_hash);
                let is_verified = !entry_hash.is_empty() && tier2_hashes_set.contains(&entry_hash);
                if !malware_override && !is_malware && !is_verified {
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
                    // `stage_guard` drops automatically here, wiping `stage_dir` without touching `Vault/Mods`!
                    return Err("MALWARE".into());
                }

                staged_hashes.push((entry, entry_hash));
            }

            // Detect FOMOD (ModuleConfig.xml) or BAIN numbered subpackages after full malware clearance
            let mods_dir_opt = (!config.mods_path.trim().is_empty())
                .then(|| PathBuf::from(&config.mods_path));
            let live_root_opt = (!config.live_path.trim().is_empty())
                .then(|| crate::game_logic::resolve_game_engine_root(&config.live_path, &game_schema));
            if let Ok(Some(mut wizard_plan)) = super::fomod_installer::parse_fomod_or_bain_plan(
                &stage_dir,
                &zip_stem,
                mods_dir_opt.as_deref(),
                live_root_opt.as_deref(),
                &vault_mods_lane,
            ) {
                if let Some(ref sub) = sanitized_target_subfolder {
                    wizard_plan.suggested_target_folder = sub.to_string_lossy().replace('\\', "/");
                    if wizard_plan.saved_selections.is_empty() {
                        wizard_plan.saved_selections =
                            super::fomod_installer::load_saved_fomod_choices(
                                &vault_mods_lane,
                                &wizard_plan.suggested_target_folder,
                            );
                    }
                }
                let extracted_mod_hashes_only: Vec<String> = staged_hashes
                    .iter()
                    .filter(|(e, h)| {
                        !h.is_empty()
                            && e.rel_path
                                .extension()
                                .and_then(|ex| ex.to_str())
                                .map(|ex| ex.to_lowercase())
                                .map_or(false, |el| supported.contains(&el) || twin_exts.contains(&el))
                    })
                    .map(|(_, h)| h.clone())
                    .collect();

                stage_guard.0 = PathBuf::new();
                let emitted_plan = super::fomod_installer::register_pending_wizard_session(
                    super::fomod_installer::PendingInstallerSession {
                        created_at_epoch: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                        stage_dir,
                        source_path: source.to_path_buf(),
                        should_move_original,
                        vault_path: config.vault_path.clone(),
                        zip_stem: zip_stem.clone(),
                        sanctuary_manifest_json: extraction.sanctuary_manifest_json,
                        sanctuary_override_json: extraction.sanctuary_override_json,
                        extracted_hashes: extracted_mod_hashes_only,
                        plan: wizard_plan,
                    },
                );
                let _ = app.emit("installer_wizard_requested", &emitted_plan);
                return Ok(serde_json::json!({
                    "__fomod_wizard": true,
                    "plan": emitted_plan,
                })
                .to_string());
            }

            // Strip any inert `fomod/` metadata folder for non-FOMOD archives before normal Vault placement
            let staged_hashes: Vec<(ExtractedZipEntry, String)> = staged_hashes
                .into_iter()
                .filter(|(entry, _)| {
                    let rel_low = entry.rel_path.to_string_lossy().replace('\\', "/").to_lowercase();
                    !rel_low.starts_with("fomod/")
                })
                .collect();

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
            let preserve_archive_structure = game_schema
                .as_ref()
                .and_then(|s| s.constraints.as_ref())
                .and_then(|c| c.preserve_archive_folder_structure)
                .unwrap_or(true);
            let wrap_loose_files = game_schema
                .as_ref()
                .and_then(|s| s.constraints.as_ref())
                .and_then(|c| c.wrap_loose_files_in_folders)
                .unwrap_or(true);
            let max_folder_depth = game_schema
                .as_ref()
                .and_then(|s| s.constraints.as_ref())
                .and_then(|c| c.max_folder_depth);
            let install_routes = crate::game_logic::get_install_routes(&game_schema);

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
                let is_primary_mod_binary =
                    supported.contains(&zf_ext) || twin_exts.contains(&zf_ext);
                let zf_ext_with_dot = format!(".{}", zf_ext);
                let is_setting_file = game_schema
                    .as_ref()
                    .and_then(|s| s.extensions.ignore_unidentified.as_ref())
                    .map(|list| list.contains(&zf_ext_with_dot))
                    .unwrap_or(false);

                if is_primary_mod_binary && !malware_override {
                    crate::game_logic::verify_schema_magic_bytes(&entry.staged_path, &game_schema)?;
                }

                let rel_fwd_lower = entry
                    .rel_path
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_ascii_lowercase();
                let matched_folder_route = install_routes.iter().any(|r| {
                    r.folder_match
                        .as_deref()
                        .map(str::trim)
                        .filter(|m| !m.is_empty())
                        .map_or(false, |fm| {
                            let fm_low = fm.replace('\\', "/").trim_matches('/').to_ascii_lowercase();
                            rel_fwd_lower.contains(&fm_low)
                        })
                });

                let default_dest = if !preserve_archive_structure
                    && is_primary_mod_binary
                    && !matched_folder_route
                {
                    if (max_folder_depth == Some(0) || !wrap_loose_files)
                        && sanitized_target_subfolder.is_none()
                    {
                        vault_mods_lane.join(zf_file_name)
                    } else {
                        target_base.join(zf_file_name)
                    }
                } else {
                    target_base.join(&entry.rel_path)
                };
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
                        let _ = crate::utils::remove_file_clearing_readonly(&default_dest);
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

                let default_rel_norm = default_dest
                    .strip_prefix(&vault_mods_lane)
                    .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase())
                    .unwrap_or_default();
                let is_flat_root_dest = default_dest.parent() == Some(vault_mods_lane.as_path());

                for (k, v) in cache.iter() {
                    if v.quarantined || k.contains(".sanctuary_quarantine") {
                        continue;
                    }
                    let k_path = Path::new(k);
                    let same_scoped_target = k_path
                        .strip_prefix(&vault_mods_lane)
                        .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase() == default_rel_norm)
                        .unwrap_or(false)
                        || (is_flat_root_dest
                            && k_path.parent() == Some(vault_mods_lane.as_path())
                            && k_path.file_name() == Some(zf_file_name));
                    if same_scoped_target && k_path.exists() {
                        if crate::utils::ensure_strict_descendant_of_roots(
                            k_path,
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
                    let _ = crate::utils::remove_file_clearing_readonly(&extract_target);
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
        }

        // Branch 3: Single supported file
        if !is_archive_ext && supported.contains(&ext) {
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
    sec_state: tauri::State<'_, SecurityState>,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let game_schema = state.active_schema.lock().unwrap().clone();
    let malware_override = sec_state
        .malware_protocol_overridden
        .load(std::sync::atomic::Ordering::SeqCst);
    let malware_hashes_set: HashSet<String> = if let Ok(m) = sec_state.malware_hashes.lock() {
        m.iter().map(|h| h.trim().to_lowercase()).collect()
    } else {
        HashSet::new()
    };
    let tier2_hashes_set: HashSet<String> = if let Ok(v) = sec_state.tier2_hashes.lock() {
        v.iter().map(|h| h.trim().to_lowercase()).collect()
    } else {
        HashSet::new()
    };

    let vault_root = crate::utils::get_vault_root_dir(&vault_path);
    let dev_lane = vault_root.join("Dev").join("Sandbox");
    if !dev_lane.exists() {
        let _ = fs::create_dir_all(&dev_lane);
    }

    let heuristic_sigs = get_heuristic_signatures(vault_path).unwrap_or_default();
    let compiled_sigs = CompiledSignatures::new(&heuristic_sigs);

    let scan_file_threat = |target_file: &Path| -> bool {
        if malware_override {
            return false;
        }
        let file_hash = calculate_hash(target_file).unwrap_or_default().to_lowercase();
        if !file_hash.is_empty() && malware_hashes_set.contains(&file_hash) {
            return true;
        }
        if !file_hash.is_empty() && tier2_hashes_set.contains(&file_hash) {
            return false;
        }
        check_heuristic_malware_detailed(target_file, &compiled_sigs).is_some()
    };

    let mut imported = 0;
    for file in files {
        let source = PathBuf::from(&file);
        if !source.exists() || !crate::utils::is_safe_user_file_path(&source) {
            continue;
        }
        if source.is_dir() {
            for entry in walkdir::WalkDir::new(&source)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let ep = entry.path();
                if entry.file_type().is_symlink() || crate::utils::is_symlink_or_reparse_point(ep) {
                    return Err("Directory rejected: contains unsafe symlink.".into());
                }
                if entry.file_type().is_file()
                    && !crate::utils::is_macos_or_os_metadata_path(ep)
                    && scan_file_threat(ep)
                {
                    return Err("MALWARE".into());
                }
            }
        } else if scan_file_threat(&source) {
            return Err("MALWARE".into());
        }

        if let Some(name) = source.file_name() {
            let stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let folder_key = if stem.is_empty() {
                name.to_string_lossy().to_string()
            } else {
                stem.clone()
            };
            if !crate::utils::is_safe_single_filename(&folder_key) {
                continue;
            }
            let mod_folder = dev_lane.join(&folder_key);
            if crate::utils::ensure_strict_descendant_of_roots(&mod_folder, &[dev_lane.clone()])
                .is_err()
            {
                continue;
            }
            if !mod_folder.exists() {
                let _ = fs::create_dir_all(&mod_folder);
            }

            if source.is_dir() {
                for entry in walkdir::WalkDir::new(&source)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let ep = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(ep) {
                        continue;
                    }
                    let Ok(rel) = ep.strip_prefix(&source) else {
                        continue;
                    };
                    if rel.as_os_str().is_empty() {
                        continue;
                    }
                    let dest = mod_folder.join(rel);
                    if crate::utils::ensure_strict_descendant_of_roots(&dest, &[dev_lane.clone()])
                        .is_err()
                    {
                        continue;
                    }
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if fs::copy(ep, &dest).is_ok() {
                        imported += 1;
                    }
                }
                continue;
            }

            let ext = source
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_archive =
                crate::game_logic::is_archive_container_extension(&ext, &game_schema);
            if is_archive {
                let extracted_count = if let Ok(extraction) =
                    crate::utils::extract_archive_bounded_to_dir(
                        &source,
                        &mod_folder,
                        Some(&folder_key),
                        &game_schema,
                        MAX_ARCHIVE_ENTRY_BYTES,
                        MAX_ARCHIVE_TOTAL_BYTES,
                    ) {
                    extraction.files.len()
                } else {
                    extract_sandbox_zip_in_place(&source, &mod_folder, &game_schema)
                };
                if extracted_count > 0 {
                    for entry in walkdir::WalkDir::new(&mod_folder)
                        .follow_links(false)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if entry.file_type().is_file() && scan_file_threat(entry.path()) {
                            let _ = fs::remove_dir_all(&mod_folder);
                            return Err("MALWARE".into());
                        }
                    }
                    imported += extracted_count;
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
