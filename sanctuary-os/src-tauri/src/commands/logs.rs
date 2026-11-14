use crate::state::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

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
    // Also scrub the real log file on disk atomically so any direct access or external export is free of PII
    if scrubbed != raw_text {
        let _ = crate::utils::atomic_write_bytes(log_path, scrubbed.as_bytes());
    }
    Some(scrubbed)
}

fn collect_exception_log_files(
    root: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<(String, PathBuf, Option<std::time::SystemTime>)> {
    let mut matched = Vec::new();
    if !root.exists() {
        return matched;
    }

    let walker = WalkDir::new(root)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            let lower = name.to_lowercase();
            if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
                return false;
            }
            true
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let full_path = entry.path().to_path_buf();
        let rel_str = full_path
            .strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");
        if crate::game_logic::is_exception_log(game_schema, &rel_str) {
            let mtime = entry.metadata().ok().and_then(|m| m.modified().ok());
            matched.push((rel_str, full_path, mtime));
        }
    }

    matched
}

#[tauri::command]
pub async fn get_scrubbed_game_logs(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrubbedLogFile>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::commands::state_ops::get_saved_coordinates();
        let path =
            crate::utils::resolve_effective_docs_path_with_override(&docs_path, &config, &game_schema);
        let mut results: Vec<ScrubbedLogFile> = Vec::new();
        for (rel_name, full_path, mtime) in collect_exception_log_files(&path, &game_schema) {
            let mtime_secs = mtime
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if let Some(scrubbed) = read_and_scrub_exception_file(&full_path) {
                if !crate::game_logic::is_ignored_lab_exception(&game_schema, &rel_name, &scrubbed)
                {
                    results.push(ScrubbedLogFile {
                        file_name: rel_name,
                        content: scrubbed,
                        modified_epoch: mtime_secs,
                    });
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
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::commands::state_ops::get_saved_coordinates();
        let path =
            crate::utils::resolve_effective_docs_path_with_override(&docs_path, &config, &game_schema);

        let mut exceptions = Vec::new();
        let mut has_crash = false;

        for (rel_name, full_path, mtime) in collect_exception_log_files(&path, &game_schema) {
            if rel_name.to_lowercase().contains("crash") {
                has_crash = true;
            }
            if let Some(modified) = mtime {
                exceptions.push((modified, rel_name, full_path));
            }
        }

        if has_crash {
            for (_mtime, _rel_name, log_path) in &exceptions {
                let _ = read_and_scrub_exception_file(log_path);
            }
            return Ok("crash_detected".into());
        }

        if exceptions.is_empty() {
            return Ok("Clean".into());
        }

        exceptions.sort_by(|a, b| b.0.cmp(&a.0));

        for (_mtime, rel_name, log_path) in &exceptions {
            if let Some(scrubbed) = read_and_scrub_exception_file(log_path) {
                if crate::game_logic::is_ignored_lab_exception(&game_schema, &rel_name, &scrubbed) {
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
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let config = crate::commands::state_ops::get_saved_coordinates();
    let path =
        crate::utils::resolve_effective_docs_path_with_override(&docs_path, &config, &game_schema);
    if !crate::utils::is_safe_workspace_target_dir(&path) {
        return;
    }

    let allowed = [path.clone()];
    for (_rel_name, log_path, _mtime) in collect_exception_log_files(&path, &game_schema) {
        if crate::utils::ensure_strict_descendant_of_roots(&log_path, &allowed).is_ok() {
            let _ = fs::remove_file(log_path);
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
            let scrubbed_msg = crate::utils::scrub_user_data_from_log(&message);
            let _ = writeln!(file, "[{}] [{}]: {}", timestamp, level, scrubbed_msg);
        }
    }
    Ok(())
}
