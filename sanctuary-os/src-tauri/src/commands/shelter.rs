use crate::commands::deployment::*;
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn check_file_exists(
    state: tauri::State<'_, SecurityState>,
    file_path: String,
) -> bool {
    let trimmed = file_path.trim();
    if trimmed.is_empty() || trimmed.contains("••••••") {
        return false;
    }
    let p = Path::new(trimmed);
    if !crate::utils::is_safe_user_file_path(p) {
        return false;
    }
    let saved_coords = get_saved_coordinates();
    let mut allowed_roots = crate::utils::get_allowed_config_roots(&saved_coords);
    for dir_opt in [dirs::download_dir(), dirs::desktop_dir()]
        .into_iter()
        .flatten()
    {
        allowed_roots.push(dir_opt);
    }
    let canon_ok = crate::utils::ensure_path_within_roots(p, &allowed_roots).is_ok();
    let volatile_match = if let Ok(canon_p) = crate::utils::resolve_canonical_target(p) {
        state
            .volatile_original_paths
            .lock()
            .map(|map| {
                map.values().any(|v| {
                    crate::utils::resolve_canonical_target(Path::new(v))
                        .map(|cv| cv == canon_p)
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    } else {
        false
    };
    if !canon_ok && !volatile_match {
        return false;
    }
    p.exists()
}

#[tauri::command]
pub fn get_volatile_original_path(
    state: tauri::State<'_, SecurityState>,
    hash: String,
    filename: String,
) -> Option<String> {
    if let Ok(map) = state.volatile_original_paths.lock() {
        let hash_key = hash.trim().to_lowercase();
        if !hash_key.is_empty() {
            if let Some(p) = map.get(&hash_key) {
                return Some(p.clone());
            }
        }
        let base_name = Path::new(&filename)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.clone());
        if !base_name.is_empty() {
            if let Some(p) = map.get(&base_name) {
                return Some(p.clone());
            }
            if let Some(p) = map.get(&base_name.to_lowercase()) {
                return Some(p.clone());
            }
        }
    }
    None
}

#[tauri::command]
pub fn clear_volatile_original_path(
    state: tauri::State<'_, SecurityState>,
    hash: String,
    filename: String,
) {
    if let Ok(mut map) = state.volatile_original_paths.lock() {
        let hash_key = hash.trim().to_lowercase();
        if !hash_key.is_empty() {
            map.remove(&hash_key);
        }
        let base_name = Path::new(&filename)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.clone());
        if !base_name.is_empty() {
            map.remove(&base_name);
            map.remove(&base_name.to_lowercase());
        }
    }
}

fn zero_fill_and_remove_file(path: &Path, max_zero_bytes: u64) {
    if let Ok(mut perms) = path.metadata().map(|m| m.permissions()) {
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(path) {
        if let Ok(meta) = f.metadata() {
            let zeros = vec![0u8; 1024 * 1024];
            let mut remaining = std::cmp::min(meta.len(), max_zero_bytes);
            while remaining > 0 {
                let write_size = std::cmp::min(remaining, zeros.len() as u64);
                if std::io::Write::write_all(&mut f, &zeros[..write_size as usize]).is_err() {
                    break;
                }
                remaining -= write_size;
            }
            let _ = f.sync_all();
        }
    }
    let _ = std::fs::remove_file(path);
}

#[tauri::command]
pub async fn shred_external_file(
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
    file_path: String,
    hash: Option<String>,
    filename: Option<String>,
) -> Result<String, String> {
    let hash_str = hash.unwrap_or_default();
    let fname_str = filename.unwrap_or_else(|| {
        Path::new(&file_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    let active_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let recorded_volatile_paths: Vec<String> = state
        .volatile_original_paths
        .lock()
        .map(|map| map.values().cloned().collect())
        .unwrap_or_default();

    let fname_for_task = fname_str.clone();
    let res = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let p = std::path::PathBuf::from(&file_path);
        if !crate::utils::is_safe_user_file_path(&p) {
            return Err("Refusing to purge protected or unsafe path.".into());
        }
        let saved_coords = get_saved_coordinates();
        if crate::utils::is_protected_save_or_airgap_path(&p, &saved_coords, &active_schema) {
            return Err("Refusing to purge protected user save or Lab Airgap vault file.".into());
        }

        let intake_drop_roots: Vec<PathBuf> = [dirs::download_dir(), dirs::desktop_dir()]
            .into_iter()
            .flatten()
            .collect();
        let canon_target = crate::utils::resolve_canonical_target(&p)?;
        if crate::utils::is_blocked_sensitive_or_system_path(&canon_target) {
            return Err("Refusing to purge protected or sensitive path.".into());
        }
        let mut is_recorded_volatile_origin = false;
        for v in &recorded_volatile_paths {
            if let Ok(canon_v) = crate::utils::resolve_canonical_target(Path::new(v)) {
                if canon_v == canon_target {
                    is_recorded_volatile_origin = true;
                    break;
                }
            }
        }
        let is_within_drop_root = !intake_drop_roots.is_empty()
            && crate::utils::ensure_strict_descendant_of_roots(&canon_target, &intake_drop_roots)
                .is_ok();
        if !is_recorded_volatile_origin && !is_within_drop_root {
            return Err("Blocked: Refusing to shred path outside verified intake ledger or Downloads/Desktop.".into());
        }
        if canon_target.is_dir() && !is_recorded_volatile_origin {
            return Err("Blocked: Refusing recursive external directory shred outside verified intake ledger.".into());
        }
        let resolved_p = canon_target;

        if !saved_coords.vault_path.trim().is_empty() {
            let vault_root = crate::utils::get_vault_root_dir(&saved_coords.vault_path);
            if let Ok(canon_vault) = crate::utils::resolve_canonical_target(&vault_root) {
                if crate::utils::path_is_within_root(&resolved_p, &canon_vault) {
                    return Err("Refusing to purge Vault internal path as external file.".into());
                }
            }
        }

        let safe_filename = std::path::Path::new(&fname_for_task)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&fname_for_task)
            .to_string();
        let manifest_path = std::path::PathBuf::from(&saved_coords.vault_path)
            .join("Quarantine")
            .join(format!("{}.manifest.json", safe_filename));

        if !resolved_p.exists() {
            return Err("File not found".into());
        }

        if resolved_p.is_dir() {
            for entry in walkdir::WalkDir::new(&resolved_p)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let ep = entry.path();
                if entry.file_type().is_file() {
                    zero_fill_and_remove_file(ep, 32 * 1024 * 1024);
                }
            }
            let _ = std::fs::remove_dir_all(&resolved_p);
        } else {
            zero_fill_and_remove_file(&resolved_p, 100 * 1024 * 1024);
        }

        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
            if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content) {
                manifest.original_shredded = true;
                manifest.original_exists = false;
                if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                    let _ = crate::utils::atomic_write_bytes(&manifest_path, json.as_bytes());
                }
            }
        }
        Ok("Purging initiated".into())
    })
    .await
    .map_err(|e| e.to_string())??;

    clear_volatile_original_path(state, hash_str, fname_str);
    Ok(res)
}

#[tauri::command]
pub async fn evacuate_to_shelter(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        cleanup_routed_links(&config.vault_path);
        let mods_dir = PathBuf::from(&config.mods_path);
        let vault_mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
        if !mods_dir.exists() {
            return Err("Mods path not found.".into());
        }

        if crate::utils::dir_looks_like_shared_game_folder(
            &mods_dir,
            &config.live_path,
            &game_schema,
        ) {
            crate::utils::safe_wipe_mods_dir_with_vault(
                &mods_dir,
                Some(&config.vault_path),
                &game_schema,
            );
            return Ok("Shared game directory protected: unlinked Sanctuary deployments and restored vanilla files.".into());
        }
        let mut items = Vec::new();

        fn walk_physical_items(dir: &Path, items: &mut Vec<PathBuf>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if crate::utils::is_symlink_or_reparse_point(&path) {
                        items.push(path);
                    } else if path.is_dir() {
                        items.push(path.clone());
                        walk_physical_items(&path, items);
                    } else {
                        items.push(path);
                    }
                }
            }
        }

        walk_physical_items(&mods_dir, &mut items);

        let mut moved = 0;
        let mut exorcised = 0;

        let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(&game_schema);

        items.sort_by_key(|p| p.to_string_lossy().len());
        items.reverse();

        for path in items {
            let is_symlink_or_junction = crate::utils::is_symlink_or_reparse_point(&path);
            let fname_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            if !is_symlink_or_junction
                && path.parent() == Some(mods_dir.as_path())
                && !manifest_leaf.is_empty()
                && fname_lower == manifest_leaf
            {
                continue;
            }
            if let Ok(rel_path) = path.strip_prefix(&mods_dir) {
                let dest = vault_mods_lane.join(rel_path);

                if is_symlink_or_junction {
                    if crate::utils::remove_symlink_or_junction(&path) {
                        exorcised += 1;
                    }
                } else if fname_lower.starts_with(".sanctuary_")
                    || fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                    || fname_lower == ".ds_store"
                {
                    let _ = fs::remove_file(&path);
                } else if path.is_dir() {
                    if let Ok(meta) = fs::symlink_metadata(&path) {
                        let mut perms = meta.permissions();
                        if perms.readonly() {
                            perms.set_readonly(false);
                            let _ = fs::set_permissions(&path, perms);
                        }
                    }
                    let _ = fs::remove_dir(&path);
                } else if !manifest_leaf.is_empty() && fname_lower == manifest_leaf {
                    let _ = fs::remove_file(&path);
                } else {
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if dest.exists() {
                        let same_hash = match (
                            crate::utils::calculate_hash(&path),
                            crate::utils::calculate_hash(&dest),
                        ) {
                            (Ok(h1), Ok(h2)) => h1 == h2,
                            _ => false,
                        };
                        if same_hash {
                            let _ = fs::remove_file(&path);
                            continue;
                        }
                    }
                    if fs::rename(&path, &dest).is_ok() || fs::copy(&path, &dest).is_ok() {
                        let _ = fs::remove_file(&path);
                        moved += 1;
                    }
                }
            }
        }
        crate::utils::delete_vault_kv(&config.vault_path, "deployed_links");

        Ok(format!(
            "{} ghosts busted, {} physical moved.",
            exorcised, moved
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn repopulate_from_shelter(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let config = get_saved_coordinates();
    apply_save_airgap(&config.mods_path, false, &game_schema)?;
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
    let mut packages = Vec::new();
    walk_packages(&game_schema, &vault_mods_lane, &mut packages);

    let mod_names: Vec<String> = packages
        .into_iter()
        .filter_map(|p| {
            p.strip_prefix(&vault_mods_lane)
                .ok()
                .map(|n| n.to_string_lossy().replace("\\", "/"))
        })
        .collect();

    let deploy_mods: Vec<DeployMod> = mod_names
        .into_iter()
        .map(|name| DeployMod {
            path: name,
            allow_write: false,
            target_path: None,
            folder_structure: None,
            load_order_index: None,
            priority_tier: None,
            hidden_files: Vec::new(),
        })
        .collect();

    deploy_playset_bulk(deploy_mods, config.mods_path, config.vault_path, state).await
}

#[tauri::command]
pub async fn move_to_lab(
    filename: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let linked = deploy_single_mod_to_live_sync(
            &filename,
            None,
            &[],
            false,
            &config.mods_path,
            &config.vault_path,
            &game_schema,
        )?;
        Ok(format!("Injected ({} files symlinked)", linked.len()))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

static QUARANTINE_RECONCILE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(serde::Serialize)]
pub struct QuarantineItemDetail {
    pub name: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<QuarantineManifest>,
}

fn read_quarantine_manifest_for_item(
    reports_q: &Path,
    logical_name: &str,
) -> Option<QuarantineManifest> {
    if !reports_q.exists() {
        return None;
    }
    let primary = reports_q.join(format!("{}.sanctuary.manifest.json", logical_name));
    let legacy = reports_q.join(format!("{}.manifest.json", logical_name));
    let raw_opt = fs::read_to_string(&primary)
        .ok()
        .or_else(|| fs::read_to_string(&legacy).ok())?;
    serde_json::from_str::<QuarantineManifest>(&raw_opt).ok()
}

fn remove_quarantine_manifests_for_item(
    reports_q: &Path,
    filename: &str,
    allowed_roots: &[PathBuf],
) {
    let candidates = [
        reports_q.join(format!("{}.sanctuary.manifest.json", filename)),
        reports_q.join(format!("{}.manifest.json", filename)),
        reports_q.join(format!("{}.json", filename)),
    ];
    for candidate in candidates {
        if candidate.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&candidate, allowed_roots).is_ok()
        {
            let _ = fs::remove_file(&candidate);
        }
    }
}

fn resolve_quarantine_restore_target(
    mods_lane: &Path,
    filename: &str,
    manifest_opt: Option<&QuarantineManifest>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> PathBuf {
    if let Some(manifest) = manifest_opt {
        if manifest.ingest_mode.as_deref() == Some("radar_sweep") {
            if let Some(orig) = manifest.original_path.as_deref() {
                let cleaned = orig.trim().trim_start_matches(&['/', '\\'][..]);
                if !cleaned.is_empty()
                    && !cleaned.contains(':')
                    && !cleaned.contains("••••••")
                    && !cleaned.contains('\0')
                {
                    let rel = Path::new(cleaned);
                    if !rel.is_absolute()
                        && rel
                            .components()
                            .all(|c| matches!(c, std::path::Component::Normal(_)))
                    {
                        return mods_lane.join(rel);
                    }
                }
            }
        }
    }

    let should_wrap = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.wrap_loose_files_in_folders)
        .unwrap_or(true);

    if should_wrap {
        let fname_path = Path::new(filename);
        let fname_lower = filename.to_lowercase();
        let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(game_schema);
        let config_exts = crate::game_logic::get_config_extensions(game_schema);
        let ext_lower = fname_path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let is_root_config = (!manifest_leaf.is_empty() && fname_lower == manifest_leaf)
            || (!ext_lower.is_empty() && config_exts.contains(&ext_lower));

        if !is_root_config {
            if let Some(stem) = fname_path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                return mods_lane.join(stem).join(filename);
            }
        }
    }

    mods_lane.join(filename)
}

fn unique_restore_destination(desired: PathBuf, src_hash: Option<&str>) -> Option<PathBuf> {
    if !desired.exists() {
        return Some(desired);
    }
    if let Some(sh) = src_hash {
        if let Ok(dst_h) = crate::utils::calculate_hash(&desired) {
            if dst_h.eq_ignore_ascii_case(sh) {
                return None;
            }
        }
    }
    let parent = desired.parent()?.to_path_buf();
    let stem = desired
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("artifact");
    let ext = desired.extension().and_then(|e| e.to_str()).unwrap_or("");
    for idx in 0..20 {
        let candidate_name = if idx == 0 {
            if ext.is_empty() {
                format!("{}_restored", stem)
            } else {
                format!("{}_restored.{}", stem, ext)
            }
        } else if ext.is_empty() {
            format!("{}_restored_{}", stem, idx)
        } else {
            format!("{}_restored_{}.{}", stem, idx, ext)
        };
        let cand = parent.join(candidate_name);
        if !cand.exists() {
            return Some(cand);
        }
    }
    Some(desired)
}

fn restore_quarantine_payload_to_vault(
    vault_path: &str,
    filename: &str,
    manifest_opt: Option<&QuarantineManifest>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<bool, String> {
    if !crate::utils::is_safe_single_filename(filename) {
        return Err("Error: Invalid filename".into());
    }
    if vault_path.trim().is_empty() {
        return Err("Error: Vault not configured".into());
    }

    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let q_dir = PathBuf::from(vault_path).join("Quarantine");
    let sq_dir = PathBuf::from(vault_path).join(".sanctuary_quarantine");
    let sq_path = sq_dir.join(filename);
    let legacy_q_path = q_dir.join(filename);
    let mods_lane = crate::utils::get_vault_mods_lane(vault_path);
    let _ = fs::create_dir_all(&mods_lane);

    let allowed_roots = vec![
        vault_root,
        mods_lane.clone(),
        q_dir.clone(),
        sq_dir.clone(),
    ];

    let source_path = if sq_path.exists()
        && crate::utils::ensure_strict_descendant_of_roots(&sq_path, &allowed_roots).is_ok()
    {
        sq_path.clone()
    } else if legacy_q_path.exists()
        && crate::utils::ensure_strict_descendant_of_roots(&legacy_q_path, &allowed_roots).is_ok()
    {
        legacy_q_path.clone()
    } else {
        return Ok(false);
    };

    let desired_target =
        resolve_quarantine_restore_target(&mods_lane, filename, manifest_opt, game_schema);
    if crate::utils::ensure_strict_descendant_of_roots(&desired_target, &allowed_roots).is_err() {
        return Err("Error: Blocked unsafe target path".into());
    }

    let src_hash = crate::utils::calculate_hash(&source_path).ok();
    let final_target_opt = unique_restore_destination(desired_target, src_hash.as_deref());

    if let Some(ref dest) = final_target_opt {
        if crate::utils::ensure_strict_descendant_of_roots(dest, &allowed_roots).is_err() {
            return Err("Error: Blocked unsafe target path".into());
        }
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::rename(&source_path, dest).is_err() {
            fs::copy(&source_path, dest).map_err(|e| format!("Error: Restore failed: {}", e))?;
            let _ = fs::remove_file(&source_path);
        }
    } else {
        let _ = fs::remove_file(&source_path);
    }

    remove_quarantine_manifests_for_item(&q_dir, filename, &allowed_roots);

    if let Ok(db) = open_db_conn(vault_path) {
        if let Ok(conn) = db.lock() {
            remove_cache_entry(&conn, &sq_path.to_string_lossy());
            remove_cache_entry(&conn, &legacy_q_path.to_string_lossy());
            if let Some(ref dest) = final_target_opt {
                remove_cache_entry(&conn, &dest.to_string_lossy());
            }
        }
    }

    Ok(true)
}

fn collect_quarantine_details_sync(vault_path: &str) -> Vec<QuarantineItemDetail> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let hidden_q = PathBuf::from(vault_path).join(".sanctuary_quarantine");
    let reports_q = PathBuf::from(vault_path).join("Quarantine");
    let mut map: std::collections::BTreeMap<String, QuarantineItemDetail> =
        std::collections::BTreeMap::new();

    for dir in [&hidden_q, &reports_q] {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for e in entries.flatten() {
                let raw_name = e.file_name().to_string_lossy().into_owned();
                let raw_lower = raw_name.to_lowercase();
                if raw_name.starts_with(".shredding_")
                    || raw_name.starts_with('.')
                    || raw_lower == "desktop.ini"
                    || raw_lower == "thumbs.db"
                    || raw_lower == ".ds_store"
                    || raw_lower.ends_with(".json")
                {
                    continue;
                }
                let meta = e.metadata().ok();
                if !meta.as_ref().map(|m| m.is_file()).unwrap_or(false) {
                    continue;
                }
                let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified_ms = meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                map.entry(raw_name.clone())
                    .and_modify(|existing| {
                        if existing.size_bytes == 0 && size_bytes > 0 {
                            existing.size_bytes = size_bytes;
                        }
                        if modified_ms > existing.modified_ms {
                            existing.modified_ms = modified_ms;
                        }
                    })
                    .or_insert(QuarantineItemDetail {
                        name: raw_name,
                        size_bytes,
                        modified_ms,
                        manifest: None,
                    });
            }
        }
    }

    if reports_q.exists() {
        for (logical_name, detail) in &mut map {
            detail.manifest = read_quarantine_manifest_for_item(&reports_q, logical_name);
        }
    }

    map.into_values()
        .filter(|detail| {
            !detail
                .manifest
                .as_ref()
                .map(|m| m.quarantined_file_shredded)
                .unwrap_or(false)
        })
        .collect()
}

pub fn reconcile_false_positive_quarantine(
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
    malware_hashes: &std::collections::HashSet<String>,
) -> usize {
    let _guard = QUARANTINE_RECONCILE_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if vault_path.trim().is_empty() {
        return 0;
    }

    let items = collect_quarantine_details_sync(vault_path);
    if items.is_empty() {
        return 0;
    }

    let heuristic_sigs =
        crate::commands::game_info::get_heuristic_signatures(vault_path.to_string())
            .unwrap_or_default();
    let compiled_sigs = crate::utils::CompiledSignatures::new(&heuristic_sigs);

    let sq_dir = PathBuf::from(vault_path).join(".sanctuary_quarantine");
    let q_dir = PathBuf::from(vault_path).join("Quarantine");
    let quarantine_roots = vec![sq_dir.clone(), q_dir.clone()];

    let mut restored_count = 0usize;

    for item in items {
        let Some(ref manifest) = item.manifest else {
            continue;
        };
        if manifest.quarantined_file_shredded {
            continue;
        }

        let is_hash_quarantined = manifest.detection_type.as_deref() == Some("hash_blacklist")
            || manifest
                .signature
                .trim()
                .eq_ignore_ascii_case("NO SIGNATURE MATCH")
            || (!manifest.detected_hash.trim().is_empty()
                && malware_hashes.contains(&manifest.detected_hash));
        if is_hash_quarantined {
            continue;
        }

        let candidate_sq = sq_dir.join(&item.name);
        let candidate_q = q_dir.join(&item.name);
        let payload_path = if candidate_sq.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&candidate_sq, &quarantine_roots)
                .is_ok()
        {
            candidate_sq
        } else if candidate_q.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&candidate_q, &quarantine_roots)
                .is_ok()
        {
            candidate_q
        } else {
            continue;
        };

        if !malware_hashes.is_empty() {
            if let Ok(actual_hash) = crate::utils::calculate_hash(&payload_path) {
                if malware_hashes.contains(&actual_hash) {
                    continue;
                }
            }
        }

        if crate::utils::check_heuristic_malware_detailed(&payload_path, &compiled_sigs).is_some()
        {
            continue;
        }

        if let Ok(true) = restore_quarantine_payload_to_vault(
            vault_path,
            &item.name,
            Some(manifest),
            game_schema,
        ) {
            restored_count += 1;
        }
    }

    restored_count
}

#[tauri::command]
pub async fn get_quarantine_list(
    app_state: tauri::State<'_, AppState>,
    sec_state: tauri::State<'_, SecurityState>,
) -> Result<Vec<String>, String> {
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let malware_hashes: std::collections::HashSet<String> = sec_state
        .malware_hashes
        .lock()
        .map(|m| m.iter().cloned().collect())
        .unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        reconcile_false_positive_quarantine(&config.vault_path, &game_schema, &malware_hashes);
        collect_quarantine_details_sync(&config.vault_path)
            .into_iter()
            .map(|d| d.name)
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_quarantine_details(
    app_state: tauri::State<'_, AppState>,
    sec_state: tauri::State<'_, SecurityState>,
) -> Result<Vec<QuarantineItemDetail>, String> {
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let malware_hashes: std::collections::HashSet<String> = sec_state
        .malware_hashes
        .lock()
        .map(|m| m.iter().cloned().collect())
        .unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        reconcile_false_positive_quarantine(&config.vault_path, &game_schema, &malware_hashes);
        Ok(collect_quarantine_details_sync(&config.vault_path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_quarantined_file(
    filename: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let reports_q = PathBuf::from(&config.vault_path).join("Quarantine");
        let manifest_opt = read_quarantine_manifest_for_item(&reports_q, &filename);
        match restore_quarantine_payload_to_vault(
            &config.vault_path,
            &filename,
            manifest_opt.as_ref(),
            &game_schema,
        ) {
            Ok(true) => Ok("Restored".into()),
            Ok(false) => Ok("Error: File missing".into()),
            Err(err) => Ok(err),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn purge_quarantined_file(filename: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if filename.trim().is_empty() || filename.contains('\0') {
            return Err("Invalid filename.".into());
        }
        let config = get_saved_coordinates();
        if config.vault_path.trim().is_empty() {
            return Err("Vault path is not configured.".into());
        }

        let vault_root = crate::utils::get_vault_root_dir(&config.vault_path);
        let q_dir = PathBuf::from(&config.vault_path).join("Quarantine");
        let sq_dir = PathBuf::from(&config.vault_path).join(".sanctuary_quarantine");
        let mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
        let allowed_roots = vec![
            q_dir.clone(),
            sq_dir.clone(),
            mods_lane.clone(),
            vault_root.clone(),
        ];

        let base_name = Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| crate::utils::is_safe_single_filename(n))
            .ok_or_else(|| "Invalid or unsafe quarantine filename.".to_string())?
            .to_string();

        let mut paths_to_check = vec![
            q_dir.join(&base_name),
            sq_dir.join(&base_name),
            q_dir.join(format!("{}.json", base_name)),
        ];

        let rel_candidate = Path::new(filename.trim().trim_start_matches(&['/', '\\'][..]));
        if rel_candidate
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            let direct_mod_path = mods_lane.join(rel_candidate);
            if direct_mod_path.exists() && direct_mod_path.is_file() {
                paths_to_check.push(direct_mod_path);
            }
        }
        if !base_name.is_empty() && mods_lane.exists() {
            for entry in walkdir::WalkDir::new(&mods_lane)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let ep = entry.path();
                if entry.file_type().is_file() {
                    if let Some(fname) = ep.file_name().and_then(|n| n.to_str()) {
                        if fname.eq_ignore_ascii_case(&base_name) {
                            paths_to_check.push(ep.to_path_buf());
                        }
                    }
                }
            }
        }

        let db_opt = open_db_conn(&config.vault_path).ok();

        for q_path in paths_to_check {
            let Ok(resolved_q_path) =
                crate::utils::ensure_strict_descendant_of_roots(&q_path, &allowed_roots)
            else {
                continue;
            };
            let path_str = q_path.to_string_lossy().to_string();
            if let Some(ref db) = db_opt {
                if let Ok(conn) = db.lock() {
                    remove_cache_entry(&conn, &path_str);
                }
            }

            if resolved_q_path.exists() && resolved_q_path.is_file() {
                let orig_file_name = resolved_q_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                let shred_path = resolved_q_path
                    .with_file_name(format!(".shredding_{}_{}", now_ms, orig_file_name));
                let active_shred_path = if std::fs::rename(&resolved_q_path, &shred_path).is_ok() {
                    shred_path
                } else {
                    resolved_q_path
                };
                let q_path_clone = active_shred_path;
                let vault_root_for_manifest = PathBuf::from(&config.vault_path);
                tauri::async_runtime::spawn_blocking(move || {
                    zero_fill_and_remove_file(&q_path_clone, 4 * 1024 * 1024);

                    let manifest_path = vault_root_for_manifest
                        .join("Quarantine")
                        .join(format!("{}.manifest.json", orig_file_name));
                    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                        if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content)
                        {
                            manifest.quarantined_file_shredded = true;
                            if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                                let _ =
                                    crate::utils::atomic_write_bytes(&manifest_path, json.as_bytes());
                            }
                        }
                    }
                });
                return Ok("Purge initiated".into());
            }
        }

        Ok("Purge initiated".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_shelter_list(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let s_path = PathBuf::from(config.vault_path).join("Shelter");
        if !s_path.exists() {
            return vec![];
        }
        let mut packages = Vec::new();
        walk_packages(&game_schema, &s_path, &mut packages);
        packages
            .into_iter()
            .filter_map(|p| {
                p.strip_prefix(&s_path)
                    .ok()
                    .map(|n| n.to_string_lossy().replace("\\", "/"))
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}
