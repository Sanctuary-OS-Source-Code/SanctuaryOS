use crate::state::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScrubbedLogFile {
    pub file_name: String,
    pub content: String,
    pub modified_epoch: u64,
}

pub fn read_and_scrub_exception_file(log_path: &Path) -> Option<String> {
    let bytes = fs::read(log_path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let max_len = bytes.len().min(512 * 1024);
    let raw_text = String::from_utf8_lossy(&bytes[..max_len]).into_owned();
    let scrubbed = crate::utils::scrub_user_data_from_log(&raw_text);
    // Also scrub the real log file on disk so any direct access or external export is free of PII
    if scrubbed != raw_text {
        let _ = fs::write(log_path, scrubbed.as_bytes());
    }
    Some(scrubbed)
}

#[tauri::command]
pub async fn get_scrubbed_game_logs(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrubbedLogFile>, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&docs_path);
        let mut results: Vec<ScrubbedLogFile> = Vec::new();
        if let Ok(entries) = fs::read_dir(&path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if crate::game_logic::is_exception_log(&game_schema, &name) {
                    let mtime_secs = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    if let Some(scrubbed) = read_and_scrub_exception_file(&entry.path()) {
                        if !crate::game_logic::is_ignored_lab_exception(&game_schema, &name, &scrubbed) {
                            results.push(ScrubbedLogFile {
                                file_name: name,
                                content: scrubbed,
                                modified_epoch: mtime_secs,
                            });
                        }
                    }
                }
            }
        }
        results.sort_by(|a, b| b.modified_epoch.cmp(&a.modified_epoch));
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scan_game_logs(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(docs_path);

        let mut exceptions = Vec::new();
        let mut has_crash = false;

        if let Ok(entries) = fs::read_dir(&path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
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
            for (_mtime, log_path) in &exceptions {
                let _ = read_and_scrub_exception_file(log_path);
            }
            return Ok("crash_detected".into());
        }

        if exceptions.is_empty() {
            return Ok("Clean".into());
        }

        exceptions.sort_by(|a, b| b.0.cmp(&a.0));

        for (_mtime, log_path) in &exceptions {
            let file_name = log_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Some(scrubbed) = read_and_scrub_exception_file(log_path) {
                if crate::game_logic::is_ignored_lab_exception(&game_schema, &file_name, &scrubbed) {
                    continue;
                }
                return Ok(format!("⚠️ EXCEPTION DETECTED: {}", scrubbed));
            }
        }

        Ok("Clean".into())
    })
    .await
    .map_err(|e| e.to_string())?
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
pub fn write_os_log(
    app_handle: tauri::AppHandle,
    message: String,
    level: String,
) -> Result<(), String> {
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
                Err(_) => "vlocal".to_string(),
            };
            let _ = writeln!(file, "[{}] [{}]: {}", timestamp, level, message);
        }
    }
    Ok(())
}
