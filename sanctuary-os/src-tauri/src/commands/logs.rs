use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::system::*;
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
pub fn scan_game_logs(docs_path: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let path = PathBuf::from(docs_path);

    let mut exceptions = Vec::new();
    let mut has_crash = false;

    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if crate::game_logic::is_exception_log(&game_schema, &name) {
                if name.to_lowercase().contains("crash") {
                    has_crash = true;
                }
                if let Ok(meta) = entry.metadata() {
                    if let Ok(mtime) = meta.modified() {
                        exceptions.push((mtime, entry.path()));
                    }
                }
            }
        }
    }

    if has_crash {
        return Ok("crash_detected".into());
    }

    if exceptions.is_empty() {
        return Ok("Clean".into());
    }

    exceptions.sort_by(|a, b| b.0.cmp(&a.0));
    let latest = &exceptions[0].1;

    match fs::read_to_string(latest) {
        Ok(content) => {
            let snippet = content.chars().take(1000).collect::<String>();
            Ok(format!("ΓÜá∩╕Å EXCEPTION DETECTED: {}", snippet))
        }
        Err(e) => Err(format!("Failed to read log: {}", e)),
    }
}

#[tauri::command]
pub fn clear_old_logs(docs_path: String, state: tauri::State<'_, AppState>) {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let path = PathBuf::from(docs_path);

    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if crate::game_logic::is_exception_log(&game_schema, &name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

#[tauri::command]
pub fn write_os_log(app_handle: tauri::AppHandle, message: String, level: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    if let Ok(log_dir) = app_handle.path().app_log_dir() {
        let _ = std::fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("sanctuary-os.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file) {
            let timestamp = match SystemTime::now().duration_since(UNIX_EPOCH) {
                Ok(n) => n.as_secs().to_string(),
                Err(_) => "unknown".to_string(),
            };
            let _ = writeln!(file, "[{}] [{}]: {}", timestamp, level, message);
        }
    }
    Ok(())
}

