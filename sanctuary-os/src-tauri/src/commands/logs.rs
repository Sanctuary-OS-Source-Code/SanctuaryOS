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
    use std::io::Read;
    const MAX_EXCEPTION_BYTES: u64 = 5 * 1024 * 1024;
    let file = fs::File::open(log_path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_EXCEPTION_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_EXCEPTION_BYTES || bytes.contains(&0) {
        return None;
    }
    let raw_text = std::str::from_utf8(&bytes).ok()?;
    let max_preview = raw_text.chars().take(512 * 1024).collect::<String>();
    let scrubbed = crate::utils::scrub_user_data_from_log(&max_preview);
    // Also scrub the real UTF-8 text log file on disk atomically so any direct access is free of PII
    if scrubbed != max_preview && bytes.len() <= 512 * 1024 {
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

fn is_safe_telemetry_relative(rel: &str) -> bool {
    let trimmed = rel.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return false;
    }
    let norm = trimmed.replace('\\', "/");
    let p = Path::new(&norm);
    if p.is_absolute() {
        return false;
    }
    p.components().all(|c| matches!(c, std::path::Component::Normal(_)))
}

fn is_allowed_telemetry_log_file(path: &Path) -> bool {
    let Some(name_lower) = path.file_name().and_then(|n| n.to_str()).map(|s| s.to_ascii_lowercase()) else {
        return false;
    };
    if matches!(
        name_lower.as_str(),
        "solder_config.json" | "local_passkey_vault_v2.json" | ".passkey_master_key.bin"
    ) || name_lower.starts_with(".env")
    {
        return false;
    }
    let Some(ext_lower) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) else {
        return false;
    };
    matches!(ext_lower.as_str(), "log" | "txt" | "xml" | "json")
}

#[tauri::command]
pub async fn read_workspace_telemetry_log(
    source_root: String,
    relative_pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let config = crate::commands::state_ops::get_saved_coordinates();
        let mods_dir_str = config.mods_path.trim();
        let docs_dir = crate::utils::resolve_effective_docs_path(&config, &game_schema);

        let trimmed_root = source_root.trim();
        let (base_dir, suffix) = if let Some(rest) = trimmed_root.strip_prefix("%MODS_DIR%") {
            if mods_dir_str.is_empty() {
                return Ok(None);
            }
            (PathBuf::from(mods_dir_str), rest.trim_start_matches(&['/', '\\'][..]))
        } else if let Some(rest) = trimmed_root.strip_prefix("%DOC_DIR%") {
            if docs_dir.trim().is_empty() {
                return Ok(None);
            }
            (PathBuf::from(&docs_dir), rest.trim_start_matches(&['/', '\\'][..]))
        } else {
            return Err("Blocked: Telemetry source root must begin with %MODS_DIR% or %DOC_DIR%.".into());
        };

        let mut search_dir = base_dir.clone();
        if !suffix.is_empty() {
            if !is_safe_telemetry_relative(suffix) {
                return Err("Blocked: Unsafe relative subpath in telemetry source root.".into());
            }
            search_dir = search_dir.join(suffix);
        }

        let pat_trimmed = relative_pattern.trim().replace('\\', "/");
        if pat_trimmed.is_empty() {
            return Ok(None);
        }
        let pat_path = Path::new(&pat_trimmed);
        if pat_path.is_absolute()
            || !pat_path
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Blocked: Unsafe telemetry file pattern.".into());
        }

        let allowed_roots: Vec<PathBuf> = vec![base_dir];
        let direct_target = search_dir.join(pat_path);
        let candidate_file = if direct_target.exists() && direct_target.is_file() {
            direct_target
        } else if pat_trimmed.contains('*') {
            let leaf_pat = pat_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let scan_dir = pat_path
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .map(|p| search_dir.join(p))
                .unwrap_or(search_dir);
            if !scan_dir.is_dir() {
                return Ok(None);
            }
            let _ = crate::utils::ensure_path_within_roots(&scan_dir, &allowed_roots)?;
            let parts: Vec<&str> = leaf_pat.split('*').collect();
            let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
            if let Ok(entries) = fs::read_dir(&scan_dir) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if !ep.is_file() || !is_allowed_telemetry_log_file(&ep) {
                        continue;
                    }
                    let fname = entry.file_name().to_string_lossy().to_ascii_lowercase();
                    let matched = if parts.len() == 2 {
                        fname.starts_with(parts[0])
                            && fname.ends_with(parts[1])
                            && fname.len() >= parts[0].len() + parts[1].len()
                    } else {
                        false
                    };
                    if matched {
                        let mtime = entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .unwrap_or(std::time::UNIX_EPOCH);
                        if best.as_ref().map_or(true, |(t, _)| mtime > *t) {
                            best = Some((mtime, ep));
                        }
                    }
                }
            }
            match best {
                Some((_, p)) => p,
                None => return Ok(None),
            }
        } else {
            return Ok(None);
        };

        let resolved_file =
            crate::utils::ensure_strict_descendant_of_roots(&candidate_file, &allowed_roots)?;
        if !is_allowed_telemetry_log_file(&resolved_file) {
            return Err("Blocked: File type is not permitted for telemetry attachment.".into());
        }

        const MAX_TELEMETRY_LOG_BYTES: u64 = 32 * 1024;
        let Ok(file) = fs::File::open(&resolved_file) else {
            return Ok(None);
        };
        let mut buf = Vec::new();
        if file
            .take(MAX_TELEMETRY_LOG_BYTES)
            .read_to_end(&mut buf)
            .is_err()
        {
            return Ok(None);
        }
        if buf.is_empty() || buf.contains(&0) {
            return Ok(None);
        }
        let raw = String::from_utf8_lossy(&buf);
        let scrubbed = crate::utils::scrub_user_data_from_log(&raw);
        Ok(Some(scrubbed))
    })
    .await
    .map_err(|e| e.to_string())?
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

    const MAX_OS_LOG_BYTES: u64 = 5 * 1024 * 1024;
    let level_clean = match level.trim().to_ascii_uppercase().as_str() {
        "ERROR" => "ERROR",
        "WARN" | "WARNING" => "WARNING",
        "INFO" => "INFO",
        "DEBUG" => "DEBUG",
        _ => "INFO",
    };

    if let Ok(log_dir) = app_handle.path().app_log_dir() {
        let _ = std::fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("sanctuary-os.log");
        if let Ok(meta) = fs::metadata(&log_file) {
            if meta.len() >= MAX_OS_LOG_BYTES {
                let rotated = log_dir.join("sanctuary-os.log.1");
                let _ = fs::rename(&log_file, &rotated);
            }
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file) {
            let timestamp = match SystemTime::now().duration_since(UNIX_EPOCH) {
                Ok(n) => n.as_secs().to_string(),
                Err(_) => "vlocal".to_string(),
            };
            let single_line: String = message
                .chars()
                .take(4096)
                .map(|c| if c == '\r' || c == '\n' || c.is_control() { ' ' } else { c })
                .collect();
            let scrubbed_msg = crate::utils::scrub_user_data_from_log(&single_line);
            let _ = writeln!(file, "[{}] [{}]: {}", timestamp, level_clean, scrubbed_msg);
        }
    }
    Ok(())
}
