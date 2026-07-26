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
    let mut resolved_existing = existing_name.clone();
    if resolved_existing.is_empty() {
        resolved_existing = path.replace(".tmp_sanctuary_conflict", "");
    }
    let existing = Path::new(&resolved_existing);

    if action == "replace" {
        let s_canon = source.canonicalize().unwrap_or_else(|_| source.to_path_buf());
        let e_canon = existing.canonicalize().unwrap_or_else(|_| existing.to_path_buf());
        
        if source.exists() && s_canon != e_canon {
            if let Some(parent) = existing.parent() {
                let _ = std::fs::create_dir_all(parent);
                let mut source_file_name = source.file_name().unwrap_or_default().to_string_lossy().to_string();
                if source_file_name.ends_with(".tmp_sanctuary_conflict") {
                    source_file_name = source_file_name.replace(".tmp_sanctuary_conflict", "");
                }
                let new_target = parent.join(source_file_name);

                let s_canon = source.canonicalize().unwrap_or_else(|_| source.to_path_buf());
                let n_canon = new_target.canonicalize().unwrap_or_else(|_| new_target.clone());

                let copy_result = if s_canon == n_canon {
                    Ok(0) // Dummy success if it's already the exact same file
                } else {
                    std::fs::copy(source, &new_target)
                };

                match copy_result {
                    Ok(_) => {
                        let now = filetime::FileTime::now();
                        let _ = filetime::set_file_times(&new_target, now, now);
                        
                        let n_canon_final = new_target.canonicalize().unwrap_or_else(|_| new_target.clone());
                        if e_canon != n_canon_final {
                            let _ = std::fs::remove_file(existing);
                        }
                        
                        if let Some(ext) = source.extension() {
                            if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                                let _ = std::fs::remove_file(source);
                                let mut current_dir = source.parent().map(|p| p.to_path_buf());
                                while let Some(dir) = current_dir {
                                    if std::fs::remove_dir(&dir).is_err() {
                                        break;
                                    }
                                    current_dir = dir.parent().map(|p| p.to_path_buf());
                                }
                            }
                        }
                    },
                    Err(e) => {
                        return Err(format!("FAILED_TO_COPY: {}", e));
                    }
                }
            }
        }
    } else if action == "discard" || action == "ignore" {
        if let Some(ext) = source.extension() {
            if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                let _ = std::fs::remove_file(source);
                let mut current_dir = source.parent().map(|p| p.to_path_buf());
                while let Some(dir) = current_dir {
                    if std::fs::remove_dir(&dir).is_err() {
                        break;
                    }
                    current_dir = dir.parent().map(|p| p.to_path_buf());
                }
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

