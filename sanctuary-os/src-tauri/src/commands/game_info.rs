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
use crate::commands::cache::*;
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
pub fn rip_game_version(live_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut bin_path = PathBuf::from(live_path);
    
    if bin_path.is_file() {
        bin_path.pop();
    } else if !bin_path.ends_with("Bin") && !bin_path.ends_with("bin") {
        bin_path.push("Game");
        bin_path.push("Bin");
    }

    let default_ini = bin_path.join("Default.ini");

    if !default_ini.exists() {
        return Err("backend_default_ini_missing".into());
    }

    if let Ok(content) = fs::read_to_string(&default_ini) {
        for line in content.lines() {
            if line.to_lowercase().starts_with("gameversion") {
                if let Some(idx) = line.find('=') {
                    let raw_version = line[idx + 1..].trim();
                    let version: String = raw_version.chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                        
                    if !version.is_empty() {
                        return Ok(version);
                    }
                }
            }
        }
    }

    Err("backend_version_string_empty".into())
}

#[tauri::command]
pub async fn scan_installed_dlc(live_path: String, state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let mut installed_packs = Vec::new();
    let mut base_path = std::path::PathBuf::from(&live_path);

    if base_path.is_file() {
        base_path.pop();
    }

    let root = if base_path.ends_with("Bin") || base_path.ends_with("bin") || base_path.ends_with("Bin_LE") || base_path.ends_with("bin_le") {
        base_path
            .parent()
            .and_then(|p| p.parent())
            .unwrap_or(base_path.as_path())
    } else {
        base_path.as_path()
    };

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                let name_up = name.to_uppercase();
                if crate::game_logic::is_dlc_folder(&game_schema, &name_up) {
                    installed_packs.push(name_up);
                }
            }
        }
    }
    installed_packs.sort();
    Ok(installed_packs)
}

#[tauri::command]
pub fn get_heuristic_signatures(vault_path: String) -> Result<Vec<HeuristicSignature>, String> {
    let p = std::path::Path::new(&vault_path).join("Data").join(".malware_signatures.json");
    if p.exists() {
        if let Ok(content) = std::fs::read_to_string(&p) {
            if let Ok(sigs) = serde_json::from_str::<Vec<HeuristicSignature>>(&content) {
                return Ok(sigs);
            }
        }
    }
    
    let defaults = vec![
        HeuristicSignature { id: "default_1".into(), signature: "os.system(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_2".into(), signature: "subprocess.Popen(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_3".into(), signature: "__import__('os')".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_4".into(), signature: "ctypes.windll".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_5".into(), signature: "discord.com/api/webhooks".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_6".into(), signature: "urllib.request.urlopen(".into(), match_type: "file_content_contains".into(), severity: "explicit".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_7".into(), signature: "requests.post(".into(), match_type: "file_content_contains".into(), severity: "explicit".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_8".into(), signature: "socket.socket(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_9".into(), signature: "base64.b64decode(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_10".into(), signature: "eval(compile(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_11".into(), signature: "loadstring(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_12".into(), signature: "exec(".into(), match_type: "file_content_contains".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_13".into(), signature: "grabber.py".into(), match_type: "file_name_exact".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_14".into(), signature: "stealer.exe".into(), match_type: "file_name_exact".into(), severity: "malware".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
        HeuristicSignature { id: "default_15".into(), signature: ".vbs".into(), match_type: "file_name_contains".into(), severity: "explicit".into(), source: "system".into(), enabled: true, created_by: "system".into(), created_at: chrono::Local::now().to_rfc3339(), notes: "".into() },
    ];
    
    let _ = save_heuristic_signatures(vault_path, defaults.clone());
    
    Ok(defaults)
}

#[tauri::command]
pub fn save_heuristic_signatures(vault_path: String, signatures: Vec<HeuristicSignature>) -> Result<(), String> {
    let p = std::path::Path::new(&vault_path).join("Data").join(".malware_signatures.json");
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(&signatures) {
        if std::fs::write(&p, content).is_ok() {
            return Ok(());
        }
    }
    Err("Failed to save heuristic signatures".into())
}

#[tauri::command]
pub fn move_to_vault(
    app: tauri::AppHandle,
    file_name: String,
    mods_path: String,
    vault_path: String,
    force_replace: bool,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let source = PathBuf::from(&mods_path).join(&file_name);
    let dest = crate::utils::get_vault_mods_lane(&vault_path).join(&file_name);

    if !source.is_dir() && !force_replace {
        let hash = calculate_hash(&source).unwrap_or_default();
        let cache = load_cache(&vault_path);
        let mut exists = false;
        let mut existing_name = String::new();
        for (k, v) in cache.iter() {
            if v.dna_hash == hash && !hash.is_empty() {
                exists = true;
                existing_name = k.clone();
                break;
            }
        }
        if exists {
            let _ = app.emit("dna_match_detected", serde_json::json!({ "path": source.to_string_lossy().to_string(), "hash": hash, "existing_name": existing_name, "file_name": file_name, "source_action": "move_to_vault" }));
            return Err("DNA_MATCH".into());
        }
    }

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::rename(&source, &dest)
        .or_else(|_| fs::copy(&source, &dest).and_then(|_| fs::remove_file(&source)))
        .map_err(|e| format!("Failed to move {}: {}", file_name, e))?;
    Ok("Vaulted".into())
}

#[tauri::command]
pub fn commission_mod(_: String) -> serde_json::Value {
    serde_json::json!({"success": true})
}

#[tauri::command]
pub fn save_file_with_history(app: tauri::AppHandle, path: String, content: String) -> Result<String, String> {
    use tauri::Manager;
    use std::time::{SystemTime, UNIX_EPOCH};

    std::fs::write(&path, &content).map_err(|e| format!("Failed to save file: {}", e))?;

    if let Ok(app_dir) = app.path().app_data_dir() {
        let config = get_saved_coordinates();
        let max_copies = config.timeline_retention_copies.unwrap_or(50) as usize;
        let max_size_bytes = config.timeline_retention_size_mb.unwrap_or(100) as u64 * 1024 * 1024;

        if max_copies == 0 {
            return Ok("Saved without history".into());
        }

        let history_dir = app_dir.join("file_history");
        std::fs::create_dir_all(&history_dir).unwrap_or_default();
        
        let path_hash = format!("{:x}", md5::compute(&path));
        let file_history_dir = history_dir.join(path_hash);
        std::fs::create_dir_all(&file_history_dir).unwrap_or_default();

        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        let entry = HistoryEntry {
            timestamp,
            content,
            pinned: Some(false),
            name: None,
        };

        if let Ok(json) = serde_json::to_string(&entry) {
            let _ = std::fs::write(&history_file, json);
        }

        if let Ok(entries) = std::fs::read_dir(&file_history_dir) {
            let mut all_files = Vec::new();
            for p in entries.flatten().filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json")) {
                let path = p.path();
                let is_pinned = std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|content| serde_json::from_str::<HistoryEntry>(&content).ok())
                    .map(|h| h.pinned.unwrap_or(false))
                    .unwrap_or(false);
                
                let size = path.metadata().map(|m| m.len()).unwrap_or(0);
                let modified = path.metadata().and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
                all_files.push((path, is_pinned, size, modified));
            }
            
            all_files.sort_by_key(|f| f.3);
            
            let mut unpinned_count = all_files.iter().filter(|f| !f.1).count();
            let mut unpinned_size: u64 = all_files.iter().filter(|f| !f.1).map(|f| f.2).sum();
            
            for (path, is_pinned, size, _) in all_files {
                if unpinned_count <= max_copies && unpinned_size <= max_size_bytes {
                    break;
                }
                if !is_pinned {
                    if let Ok(_) = std::fs::remove_file(&path) {
                        unpinned_count = unpinned_count.saturating_sub(1);
                        unpinned_size = unpinned_size.saturating_sub(size);
                    }
                }
            }
        }
    }
    
    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn save_file_silently(path: String, content: String) -> Result<String, String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn get_file_history(app: tauri::AppHandle, path: String) -> Result<Vec<HistoryEntry>, String> {
    use tauri::Manager;
    let mut history = Vec::new();
    
    if let Ok(app_dir) = app.path().app_data_dir() {
        let path_hash = format!("{:x}", md5::compute(&path));
        let file_history_dir = app_dir.join("file_history").join(path_hash);
        
        if file_history_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(file_history_dir) {
                for entry in entries.flatten() {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        if let Ok(h) = serde_json::from_str::<HistoryEntry>(&content) {
                            history.push(h);
                        }
                    }
                }
            }
        }
    }
    
    history.sort_by(|a, b| {
        let a_pinned = a.pinned.unwrap_or(false);
        let b_pinned = b.pinned.unwrap_or(false);
        if a_pinned != b_pinned {
            b_pinned.cmp(&a_pinned)
        } else {
            b.timestamp.cmp(&a.timestamp)
        }
    });
    Ok(history)
}

#[tauri::command]
pub fn toggle_pin_version(app: tauri::AppHandle, path: String, timestamp: u64, pinned: bool) -> Result<(), String> {
    use tauri::Manager;
    if let Ok(app_dir) = app.path().app_data_dir() {
        let path_hash = format!("{:x}", md5::compute(&path));
        let history_file = app_dir.join("file_history").join(path_hash).join(format!("{}.json", timestamp));
        
        if history_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&history_file) {
                if let Ok(mut h) = serde_json::from_str::<HistoryEntry>(&content) {
                    h.pinned = Some(pinned);
                    if let Ok(json) = serde_json::to_string(&h) {
                        let _ = std::fs::write(&history_file, json);
                        return Ok(());
                    }
                }
            }
            }
        }
    Err("Failed to update pin status".into())
}

#[tauri::command]
pub fn delete_version(app: tauri::AppHandle, path: String, timestamp: u64) -> Result<(), String> {
    use tauri::Manager;
    if let Ok(app_dir) = app.path().app_data_dir() {
        let path_hash = format!("{:x}", md5::compute(&path));
        let history_file = app_dir.join("file_history").join(path_hash).join(format!("{}.json", timestamp));
        
        if history_file.exists() {
            let _ = std::fs::remove_file(history_file);
            return Ok(());
        }
    }
    Err("Failed to delete version".into())
}

#[tauri::command]
pub fn rename_version(app: tauri::AppHandle, path: String, timestamp: u64, name: String) -> Result<(), String> {
    use tauri::Manager;
    if let Ok(app_dir) = app.path().app_data_dir() {
        let path_hash = format!("{:x}", md5::compute(&path));
        let history_file = app_dir.join("file_history").join(path_hash).join(format!("{}.json", timestamp));
        
        if history_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&history_file) {
                if let Ok(mut h) = serde_json::from_str::<HistoryEntry>(&content) {
                    h.name = Some(name);
                    if let Ok(json) = serde_json::to_string(&h) {
                        let _ = std::fs::write(&history_file, json);
                        return Ok(());
                    }
                }
            }
        }
    }
    Err("Failed to rename version".into())
}

