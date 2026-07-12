use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::system::*;
use crate::commands::logs::*;
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
pub fn mark_explicitly_local(vault_path: String, file_path: String) -> Result<(), String> {
    let mut cache = load_cache(&vault_path);
    if let Some(entry) = cache.get_mut(&file_path) {
        entry.explicitly_local = true;
        save_cache(&vault_path, &cache);
        Ok(())
    } else {
        Err("File not found in cache".to_string())
    }
}

#[tauri::command]
pub fn generate_full_dna_hash(file_path: PathBuf) -> String {
    let file = match std::fs::File::open(&file_path) {
        Ok(f) => f,
        Err(_) => return "0".into(),
    };
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    while let Ok(count) = reader.read(&mut buffer) {
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect()
}

#[tauri::command]
pub fn resolve_dna_match(
    path: String,
    existing_name: String,
    action: String,
) -> Result<String, String> {
    let source = Path::new(&path);
    let existing = Path::new(&existing_name);

    if action == "replace" {
        let s_canon = source.canonicalize().unwrap_or_else(|_| source.to_path_buf());
        let e_canon = existing.canonicalize().unwrap_or_else(|_| existing.to_path_buf());
        
        if source.exists() && s_canon != e_canon {
            if let Some(parent) = existing.parent() {
                let _ = std::fs::create_dir_all(parent);
                let new_target = parent.join(source.file_name().unwrap_or_default());
                if std::fs::copy(source, &new_target).is_ok() {
                    let now = filetime::FileTime::now();
                    let _ = filetime::set_file_times(&new_target, now, now);
                    if e_canon != new_target.canonicalize().unwrap_or_else(|_| new_target.to_path_buf()) {
                        let _ = std::fs::remove_file(existing);
                    }
                    
                    let config = get_saved_coordinates();
                    if !config.mods_path.is_empty() {
                        let active_mods_dir = std::path::Path::new(&config.mods_path);
                        let active_target = active_mods_dir.to_path_buf();
                        let _ = std::fs::create_dir_all(&active_target);
                        let _ = std::fs::copy(&new_target, active_target.join(new_target.file_name().unwrap_or_default()));
                        
                        let old_active_target = active_mods_dir.to_path_buf();
                        if let Some(old_file_name) = existing.file_name() {
                            if old_file_name != new_target.file_name().unwrap_or_default() {
                                let _ = std::fs::remove_file(old_active_target.join(old_file_name));
                            }
                        }
                    }
                    
                    if let Some(ext) = source.extension() {
                        if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                            let _ = std::fs::remove_file(source);
                        }
                    }
                } else {
                    return Err("FAILED_TO_COPY".into());
                }
            }
        }
    } else if action == "discard" || action == "ignore" {
        if let Some(ext) = source.extension() {
            if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                let _ = std::fs::remove_file(source);
            }
        }
    }

    Ok("Resolved".into())
}

#[tauri::command]
pub fn save_master_cache(vault_path: String, content: String) -> Result<String, String> {
    let data_dir = Path::new(&vault_path).join("Data");
    let _ = std::fs::create_dir_all(&data_dir);
    let path = data_dir.join(".sanctuary_master_cache.json");
    std::fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_master_cache(vault_path: String) -> Result<String, String> {
    let data_dir = Path::new(&vault_path).join("Data");
    let path = data_dir.join(".sanctuary_master_cache.json");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok("[]".into())
    }
}

#[tauri::command]
pub fn purge_vault_artifacts(vault_path: String, filenames: Vec<String>) -> Result<String, String> {
    let mut deleted = 0;
    for filename in filenames {
        let mut path = std::path::PathBuf::from(&vault_path);
        path.push(&filename);
        if path.exists() {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
            deleted += 1;
        }
    }
    Ok(format!("Purged {} artifacts.", deleted))
}

