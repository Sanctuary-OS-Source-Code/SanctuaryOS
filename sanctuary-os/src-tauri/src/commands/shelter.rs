use crate::commands::deployment::*;
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn check_file_exists(file_path: String) -> bool {
    let trimmed = file_path.trim();
    if trimmed.is_empty() || trimmed.contains("••••••") {
        return false;
    }
    Path::new(trimmed).exists()
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
pub fn shred_external_file(
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

    let p = std::path::PathBuf::from(&file_path);
    if !crate::utils::is_safe_user_file_path(&p) {
        return Err("Refusing to purge protected or unsafe path.".into());
    }
    let active_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let saved_coords = get_saved_coordinates();
    if crate::utils::is_protected_save_or_airgap_path(&p, &saved_coords, &active_schema) {
        return Err("Refusing to purge protected user save or Lab Airgap vault file.".into());
    }

    // Build strict allowed roots for external quarantine shredding:
    // standard user drop roots (Downloads, Desktop, Documents) + any volatile origin parent recorded by ingest.
    let mut allowed_external_roots: Vec<PathBuf> = [
        dirs::download_dir(),
        dirs::desktop_dir(),
        dirs::document_dir(),
        dirs::home_dir(),
    ]
    .into_iter()
    .flatten()
    .collect();
    if let Ok(map) = state.volatile_original_paths.lock() {
        for v in map.values() {
            if let Some(parent) = Path::new(v).parent() {
                if !parent.as_os_str().is_empty() {
                    allowed_external_roots.push(parent.to_path_buf());
                }
            }
        }
    }

    let resolved_p = crate::utils::ensure_strict_descendant_of_roots(&p, &allowed_external_roots)?;

    let config = get_saved_coordinates();
    if !config.vault_path.trim().is_empty() {
        let vault_root = crate::utils::get_vault_root_dir(&config.vault_path);
        if let Ok(canon_vault) = crate::utils::resolve_canonical_target(&vault_root) {
            if crate::utils::path_is_within_root(&resolved_p, &canon_vault) {
                return Err("Refusing to purge Vault internal path as external file.".into());
            }
        }
    }

    clear_volatile_original_path(state, hash_str, fname_str.clone());

    let safe_filename = std::path::Path::new(&fname_str)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&fname_str)
        .to_string();
    let manifest_path = std::path::PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(format!("{}.manifest.json", safe_filename));

    if resolved_p.exists() {
        tauri::async_runtime::spawn_blocking(move || {
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
        });
        Ok("Purging initiated".into())
    } else {
        Err("File not found".into())
    }
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

#[tauri::command]
pub fn get_quarantine_list() -> Vec<String> {
    let config = get_saved_coordinates();
    let hidden_q = PathBuf::from(&config.vault_path).join(".sanctuary_quarantine");
    let reports_q = PathBuf::from(&config.vault_path).join("Quarantine");
    let mut set = std::collections::BTreeSet::new();

    for dir in [&hidden_q, &reports_q] {
        if dir.exists() {
            if let Ok(entries) = fs::read_dir(dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if name.starts_with(".shredding_") {
                        continue;
                    }
                    if name.ends_with(".manifest.json") {
                        set.insert(name.trim_end_matches(".manifest.json").to_string());
                    } else if !name.ends_with(".json") {
                        set.insert(name);
                    }
                }
            }
        }
    }
    set.into_iter().collect()
}

#[tauri::command]
pub async fn restore_quarantined_file(filename: String) -> String {
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::utils::is_safe_single_filename(&filename) {
            return "Error: Invalid filename".into();
        }
        let config = get_saved_coordinates();
        if config.vault_path.trim().is_empty() {
            return "Error: Vault not configured".into();
        }
        let vault_root = crate::utils::get_vault_root_dir(&config.vault_path);
        let q_dir = PathBuf::from(&config.vault_path).join("Quarantine");
        let sq_dir = PathBuf::from(&config.vault_path).join(".sanctuary_quarantine");
        let sq_path = sq_dir.join(&filename);
        let legacy_q_path = q_dir.join(&filename);
        let manifest_path = q_dir.join(format!("{}.manifest.json", filename));
        let q_path = q_dir.join(format!("{}.json", filename));
        let mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
        let _ = fs::create_dir_all(&mods_lane);
        let m_path = mods_lane.join(&filename);

        let allowed_roots = vec![vault_root.clone(), mods_lane.clone(), q_dir.clone(), sq_dir.clone()];
        if crate::utils::ensure_strict_descendant_of_roots(&m_path, &allowed_roots).is_err() {
            return "Error: Blocked unsafe target path".into();
        }

        let mut moved = false;

        if let Ok(db) = open_db_conn(&config.vault_path) {
            if let Ok(conn) = db.lock() {
                remove_cache_entry(&conn, &sq_path.to_string_lossy());
                remove_cache_entry(&conn, &legacy_q_path.to_string_lossy());
            }
        }

        if sq_path.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&sq_path, &allowed_roots).is_ok()
        {
            let _ = fs::rename(&sq_path, &m_path);
            moved = true;
        } else if legacy_q_path.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&legacy_q_path, &allowed_roots)
                .is_ok()
        {
            let _ = fs::rename(&legacy_q_path, &m_path);
            moved = true;
        }

        if manifest_path.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&manifest_path, &allowed_roots)
                .is_ok()
        {
            let _ = fs::remove_file(&manifest_path);
        }
        if q_path.exists()
            && crate::utils::ensure_strict_descendant_of_roots(&q_path, &allowed_roots).is_ok()
        {
            let _ = fs::remove_file(&q_path);
        }

        if moved {
            "Restored".into()
        } else {
            "Error: File missing".into()
        }
    })
    .await
    .unwrap_or_else(|_| "Error: File missing".into())
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
