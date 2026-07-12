use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
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
pub fn purge_external_file(path: String, _hash: String, filename: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    let config = get_saved_coordinates();
    let manifest_path = std::path::PathBuf::from(&config.vault_path).join("Quarantine").join(format!("{}.manifest.json", filename));
    
    if p.exists() {
        tauri::async_runtime::spawn_blocking(move || {
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
                        if std::io::Write::write_all(&mut f, &zeros[..write_size as usize]).is_err() {
                            break;
                        }
                        remaining -= write_size;
                    }
                    let _ = f.sync_all();
                }
            }
            let _ = std::fs::remove_file(&p);
            
            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content) {
                    manifest.original_shredded = true;
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
        let mods_dir = PathBuf::from(&config.mods_path);
        let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
        if !mods_dir.exists() {
            return Err("Mods path not found.".into());
        }
        let mut items = Vec::new();
        
        fn walk_physical_items(dir: &Path, items: &mut Vec<PathBuf>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_symlink_or_junction = fs::read_link(&path).is_ok() || 
                        fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                    
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
        
        items.sort_by_key(|p| p.to_string_lossy().len());
        items.reverse();

        for path in items {
            let manifest_name = game_schema.as_ref().map(|s| s.paths.manifest_file.clone()).unwrap_or_default();
            if path.file_name().map_or(false, |n| n == manifest_name.as_str()) {
                continue;
            }
            if let Ok(rel_path) = path.strip_prefix(&mods_dir) {
                let dest = vault_mods_lane.join(rel_path);
                
                let is_symlink_or_junction = fs::read_link(&path).is_ok() || 
                    fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                
                if is_symlink_or_junction {
                    if fs::remove_file(&path).is_ok() || fs::remove_dir(&path).is_ok() {
                        exorcised += 1;
                    }
                } else if path.is_dir() {
                    let _ = fs::remove_dir(&path);
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
    let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
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
        })
        .collect();

    deploy_playset_bulk(deploy_mods, config.mods_path, config.vault_path, state).await
}

#[tauri::command]
pub async fn move_to_lab(filename: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
        
        let mut vault_path = vault_mods_lane.join(&filename);
        let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
        let mut found = false;
        
        for f in &folders_to_check {
            let base_test = if f.is_empty() {
                vault_mods_lane.join(&filename)
            } else {
                vault_mods_lane.join(f).join(&filename)
            };
            
            if base_test.exists() {
                vault_path = base_test;
                found = true;
                break;
            } else {
                let exts = crate::game_logic::get_supported_extensions(&game_schema);
                for ext in exts {
                    if base_test.with_extension(&ext).exists() {
                        vault_path = base_test.with_extension(&ext);
                        found = true;
                        break;
                    }
                }
            }
        }

        if !found {
            return Err("Artifact not found in Vault.".into());
        }
        
        let mods_path = PathBuf::from(config.mods_path).join(&filename);

        if let Some(parent) = mods_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if vault_path.is_dir() {
            deploy_air_gap(&vault_path, &mods_path).map_err(|e| e.to_string())?;
        } else {
            fs::copy(&vault_path, &mods_path).map_err(|e| e.to_string())?;
        }

        Ok("Injected".into())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn get_quarantine_list() -> Vec<String> {
    let config = get_saved_coordinates();
    let q_path = PathBuf::from(config.vault_path).join("Quarantine");
    if !q_path.exists() {
        return vec![];
    }
    fs::read_dir(q_path)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn restore_quarantined_file(filename: String) -> String {
    let config = get_saved_coordinates();
    let q_path = PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(&filename);
    let sq_path = PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(&filename);
    let m_path = PathBuf::from(&config.vault_path)
        .join("Mods")
        .join(&filename);
        
    let mut cache = load_cache(&config.vault_path);
    let mut cache_updated = false;

    let mut moved = false;
    if q_path.exists() {
        let path_str = q_path.to_string_lossy().to_string();
        if cache.contains_key(&path_str) { cache.remove(&path_str); cache_updated = true; }
        let _ = fs::rename(&q_path, &m_path);
        moved = true;
    } else if sq_path.exists() {
        let path_str = sq_path.to_string_lossy().to_string();
        if cache.contains_key(&path_str) { cache.remove(&path_str); cache_updated = true; }
        let _ = fs::rename(&sq_path, &m_path);
        moved = true;
    }
    
    if cache_updated { save_cache(&config.vault_path, &cache); }

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

    let paths_to_check = vec![
        PathBuf::from(&config.vault_path)
            .join(".sanctuary_quarantine")
            .join(&filename),
    ];

    for q_path in paths_to_check {
        let path_str = q_path.to_string_lossy().to_string();
        if cache.contains_key(&path_str) {
            cache.remove(&path_str);
            cache_updated = true;
        }

        if q_path.exists() {
            let q_path_clone = q_path.clone();
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
                        let mut remaining = std::cmp::min(meta.len(), 100 * 1024 * 1024);
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
                let _ = std::fs::remove_file(&q_path_clone);
                
                let manifest_path = q_path_clone.parent().unwrap().parent().unwrap().join("Quarantine").join(format!("{}.manifest.json", q_path_clone.file_name().unwrap().to_string_lossy()));
                if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                    if let Ok(mut manifest) = serde_json::from_str::<QuarantineManifest>(&content) {
                        manifest.quarantined_file_shredded = true;
                        if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                            let _ = std::fs::write(&manifest_path, json);
                        }
                    }
                }
            });
            if cache_updated { save_cache(&config.vault_path, &cache); }
            return Ok("Purge initiated".into());
        }
    }
    if cache_updated { save_cache(&config.vault_path, &cache); }

    Err("Error: File missing".into())
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

