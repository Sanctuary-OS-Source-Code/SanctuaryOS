use crate::commands::backups::*;
use crate::commands::cache::*;
use crate::commands::config::*;
use crate::commands::deployment::*;
use crate::commands::game_info::*;
use crate::commands::library::*;
use crate::commands::logs::*;
use crate::commands::overrides::*;
use crate::commands::radar::*;
use crate::commands::state_ops::*;
use crate::commands::system::*;
use crate::state::*;
use crate::utils::*;
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

#[tauri::command]
pub fn shred_external_file(
    state: tauri::State<'_, SecurityState>,
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
    clear_volatile_original_path(state, hash_str.clone(), fname_str.clone());
    purge_external_file(file_path, hash_str, fname_str)
}

#[tauri::command]
pub fn purge_external_file(
    path: String,
    _hash: String,
    filename: String,
) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !crate::utils::is_safe_user_file_path(&p) {
        return Err("Refusing to purge protected or unsafe path.".into());
    }
    let config = get_saved_coordinates();
    let norm_p = p.to_string_lossy().replace('\\', "/").to_lowercase();
    let norm_vault = config.vault_path.replace('\\', "/").to_lowercase();
    if !norm_vault.is_empty() && norm_p.starts_with(&norm_vault) {
        return Err("Refusing to purge Vault internal path as external file.".into());
    }
    let safe_filename = std::path::Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&filename)
        .to_string();
    let manifest_path = std::path::PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(format!("{}.manifest.json", safe_filename));

    if p.exists() {
        tauri::async_runtime::spawn_blocking(move || {
            if p.is_dir() {
                for entry in walkdir::WalkDir::new(&p).into_iter().filter_map(|e| e.ok()) {
                    let ep = entry.path();
                    if ep.is_file() {
                        if let Ok(mut perms) = ep.metadata().map(|m| m.permissions()) {
                            if perms.readonly() {
                                perms.set_readonly(false);
                                let _ = std::fs::set_permissions(ep, perms);
                            }
                        }
                        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(ep) {
                            if let Ok(meta) = f.metadata() {
                                let zeros = vec![0u8; 1024 * 1024];
                                let mut remaining = std::cmp::min(meta.len(), 32 * 1024 * 1024);
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
                    }
                }
                let _ = std::fs::remove_dir_all(&p);
            } else {
                if let Ok(mut perms) = p.metadata().map(|m| m.permissions()) {
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&p, perms);
                    }
                }
                if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(&p) {
                    if let Ok(meta) = f.metadata() {
                        let zeros = vec![0u8; 1024 * 1024];
                        let mut remaining = std::cmp::min(meta.len(), 100 * 1024 * 1024);
                        while remaining > 0 {
                            let write_size = std::cmp::min(remaining, zeros.len() as u64);
                            if std::io::Write::write_all(&mut f, &zeros[..write_size as usize]).is_err()
                            {
                                break;
                            }
                            remaining -= write_size;
                        }
                        let _ = f.sync_all();
                    }
                }
                let _ = std::fs::remove_file(&p);
            }

            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content) {
                    manifest.original_shredded = true;
                    manifest.original_exists = false;
                    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                        let _ = std::fs::write(&manifest_path, json);
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
pub fn purge_from_shelter(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !crate::utils::is_safe_user_file_path(path) {
        return Err("Refusing to purge protected or unsafe path.".into());
    }
    if path.exists() {
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok("backend_purged".into());
    }
    Err("backend_not_found".into())
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
                    let is_symlink_or_junction = fs::read_link(&path).is_ok()
                        || fs::symlink_metadata(&path)
                            .map(|m| m.file_type().is_symlink())
                            .unwrap_or(false);

                    if is_symlink_or_junction {
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

        // Clean up any spurious Resource/Resource.cfg folder in mods or vault
        let spurious_mods_res = mods_dir.join("Resource");
        if spurious_mods_res.is_dir() {
            let _ = fs::remove_dir_all(&spurious_mods_res);
        }
        let spurious_vault_res = vault_mods_lane.join("Resource");
        if spurious_vault_res.is_dir() {
            let _ = fs::remove_dir_all(&spurious_vault_res);
        }

        items.sort_by_key(|p| p.to_string_lossy().len());
        items.reverse();

        for path in items {
            let manifest_name = game_schema
                .as_ref()
                .map(|s| s.paths.manifest_file.clone())
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| "Resource.cfg".to_string());

            let is_symlink_or_junction = fs::read_link(&path).is_ok()
                || fs::symlink_metadata(&path)
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false);

            if !is_symlink_or_junction
                && path.parent() == Some(mods_dir.as_path())
                && path.file_name().and_then(|n| n.to_str()).map_or(false, |n| {
                    n.eq_ignore_ascii_case(&manifest_name)
                        || n.eq_ignore_ascii_case("Resource.cfg")
                })
            {
                continue;
            }
            if let Ok(rel_path) = path.strip_prefix(&mods_dir) {
                let dest = vault_mods_lane.join(rel_path);

                if is_symlink_or_junction {
                    if fs::remove_file(&path).is_ok() || fs::remove_dir(&path).is_ok() {
                        exorcised += 1;
                    }
                } else if path.is_dir() {
                    let _ = fs::remove_dir(&path);
                } else if path.file_name().and_then(|n| n.to_str()).map_or(false, |n| {
                    n.eq_ignore_ascii_case(&manifest_name)
                        || n.eq_ignore_ascii_case("Resource.cfg")
                }) {
                    let _ = fs::remove_file(&path);
                } else {
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if fs::rename(&path, &dest).is_ok() || fs::copy(&path, &dest).is_ok() {
                        let _ = fs::remove_file(&path);
                        moved += 1;
                    }
                }
            }
        }

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
    let game_schema = state.active_schema.lock().unwrap().clone();
    let config = get_saved_coordinates();
    let _ = apply_save_airgap(&config.mods_path, false, &game_schema);
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
    let q_path = PathBuf::from(config.vault_path).join(".sanctuary_quarantine");
    if !q_path.exists() {
        return vec![];
    }
    fs::read_dir(q_path)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|name| !name.starts_with(".shredding_"))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn restore_quarantined_file(filename: String) -> String {
    let config = get_saved_coordinates();
    let sq_path = PathBuf::from(&config.vault_path)
        .join(".sanctuary_quarantine")
        .join(&filename);
    let q_path = PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(format!("{}.json", filename));
    let m_path = crate::utils::get_vault_mods_lane(&config.vault_path).join(&filename);

    let mut cache = load_cache(&config.vault_path);

    let mut moved = false;

    let path_str = sq_path.to_string_lossy().to_string();
    if cache.contains_key(&path_str) {
        cache.remove(&path_str);
        let conn = get_db_conn(&config.vault_path);
        remove_cache_entry(&conn, &path_str);
    }

    if sq_path.exists() {
        let _ = fs::rename(&sq_path, &m_path);
        moved = true;
    }

    if q_path.exists() {
        let _ = fs::remove_file(&q_path);
    }

    if moved {
        "Restored".into()
    } else {
        "Error: File missing".into()
    }
}

#[tauri::command]
pub fn purge_quarantined_file(filename: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    let mut cache = load_cache(&config.vault_path);
    let mut cache_updated = false;

    let base_name = Path::new(&filename)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.clone());

    let mut paths_to_check = vec![
        PathBuf::from(&config.vault_path)
            .join(".sanctuary_quarantine")
            .join(&base_name),
        PathBuf::from(&config.vault_path)
            .join("Quarantine")
            .join(format!("{}.json", base_name)),
    ];

    let mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
    let direct_mod_path = mods_lane.join(&filename);
    if direct_mod_path.exists() && direct_mod_path.is_file() {
        paths_to_check.push(direct_mod_path);
    } else if !base_name.is_empty() {
        for entry in walkdir::WalkDir::new(&mods_lane).into_iter().filter_map(|e| e.ok()) {
            let ep = entry.path();
            if ep.is_file() {
                if let Some(fname) = ep.file_name().and_then(|n| n.to_str()) {
                    if fname.eq_ignore_ascii_case(&base_name) {
                        paths_to_check.push(ep.to_path_buf());
                    }
                }
            }
        }
    }

    for q_path in paths_to_check {
        let path_str = q_path.to_string_lossy().to_string();
        if cache.contains_key(&path_str) {
            cache.remove(&path_str);
            let conn = get_db_conn(&config.vault_path);
            remove_cache_entry(&conn, &path_str);
        }

        if q_path.exists() {
            let orig_file_name = q_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            let shred_path = q_path.with_file_name(format!(".shredding_{}_{}", now_ms, orig_file_name));
            let active_shred_path = if std::fs::rename(&q_path, &shred_path).is_ok() {
                shred_path
            } else {
                q_path.clone()
            };
            let q_path_clone = active_shred_path;
            let vault_root = PathBuf::from(&config.vault_path);
            tauri::async_runtime::spawn_blocking(move || {
                if let Ok(mut perms) = q_path_clone.metadata().map(|m| m.permissions()) {
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&q_path_clone, perms);
                    }
                }
                if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(&q_path_clone) {
                    if let Ok(meta) = f.metadata() {
                        let zeros = vec![0u8; 1024 * 1024];
                        let mut remaining = std::cmp::min(meta.len(), 4 * 1024 * 1024);
                        while remaining > 0 {
                            let write_size = std::cmp::min(remaining, zeros.len() as u64);
                            if std::io::Write::write_all(&mut f, &zeros[..write_size as usize])
                                .is_err()
                            {
                                break;
                            }
                            remaining -= write_size;
                        }
                        let _ = f.sync_all();
                    }
                }
                let _ = std::fs::remove_file(&q_path_clone);

                let manifest_path = vault_root
                    .join("Quarantine")
                    .join(format!("{}.manifest.json", orig_file_name));
                if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                    if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content) {
                        manifest.quarantined_file_shredded = true;
                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                            let _ = std::fs::write(&manifest_path, json);
                        }
                    }
                }
            });
            return Ok("Purge initiated".into());
        }
    }

    Ok("Purge initiated".into())
}

#[tauri::command]
pub fn get_shelter_list(state: tauri::State<'_, AppState>) -> Vec<String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
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
}

#[tauri::command]
pub fn trigger_emp(_: bool, _: String) -> String {
    "Done".into()
}
