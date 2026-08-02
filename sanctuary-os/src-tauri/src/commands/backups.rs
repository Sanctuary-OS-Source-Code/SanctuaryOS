use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
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
pub async fn sanitize_vault(vault_path: String, _state: tauri::State<'_, AppState>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let vault_root = PathBuf::from(&vault_path);
        let backups_dir = vault_root.join("Backups");
        let backups_world = backups_dir.join("World");
        let backups_engine = backups_dir.join("Engine");
        let backups_mods = backups_dir.join("Mods");
        let data_dir = vault_root.join("Data");
        let data_cache = data_dir.join("cache");
        let blueprints_dir = vault_root.join("Blueprints");
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let quarantine_dir = vault_root.join("Quarantine");
        let theme_dir = vault_root.join("Theme");
        let theme_chameleon = theme_dir.join("Chameleon");
        let theme_lexicon = theme_dir.join("Lexicon");

        let _ = std::fs::create_dir_all(&backups_world);
        let _ = std::fs::create_dir_all(&backups_engine);
        let _ = std::fs::create_dir_all(&backups_mods);
        let _ = std::fs::create_dir_all(&data_cache);
        let _ = std::fs::create_dir_all(&blueprints_dir);
        let _ = std::fs::create_dir_all(&mods_lane);
        let _ = std::fs::create_dir_all(&quarantine_dir);
        let _ = std::fs::create_dir_all(&theme_chameleon);
        let _ = std::fs::create_dir_all(&theme_lexicon);

        let mut moved = 0;

        if let Ok(entries) = std::fs::read_dir(&vault_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "zst") {
                    let dest = backups_world.join(path.file_name().unwrap());
                    if std::fs::rename(&path, &dest).is_err() {
                        if std::fs::copy(&path, &dest).is_ok() {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }

        fn sweep_empty_dirs(dir: &std::path::Path) -> std::io::Result<bool> {
            let mut is_empty = true;
            if dir.is_dir() {
                for entry in std::fs::read_dir(dir)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        let child_empty = sweep_empty_dirs(&path)?;
                        if child_empty {
                            let _ = std::fs::remove_dir(&path);
                        } else {
                            is_empty = false;
                        }
                    } else {
                        is_empty = false;
                    }
                }
            }
            Ok(is_empty)
        }

        let _ = sweep_empty_dirs(&mods_lane);
        
        Ok(moved.to_string())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

#[tauri::command]
pub async fn get_backups(vault_path: String) -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = vec![];
        let config = get_saved_coordinates();
        let base = PathBuf::from(&vault_path).join("Backups");
        let mut engine_core_seen = false;
        
        let mut process_dir = |dir: &std::path::Path| {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if e.path().is_dir() && (name.starts_with("World_State") || name.starts_with("Engine_Core")) {
                        let size_file = e.path().join(".size_bytes.txt");
                        let diff_size_file = e.path().join(".diff_size_bytes.txt");
                        
                        let logical_size = if size_file.exists() {
                            std::fs::read_to_string(&size_file).unwrap_or_default().trim().parse::<u64>().unwrap_or(0)
                        } else {
                            0
                        };

                        let physical_size = if diff_size_file.exists() {
                            std::fs::read_to_string(&diff_size_file).unwrap_or_default().trim().parse::<u64>().unwrap_or(0)
                        } else {
                            0
                        };

                        if !size_file.exists() || !diff_size_file.exists() {
                            let p_clone = e.path().clone();
                            let s_clone = size_file.clone();
                            let d_clone = diff_size_file.clone();
                            std::thread::spawn(move || {
                                let (log_size, diff_size) = crate::utils::calculate_sizes(&p_clone);
                                let _ = std::fs::write(&s_clone, log_size.to_string());
                                let _ = std::fs::write(&d_clone, diff_size.to_string());
                            });
                        }
                        
                        files.push(BackupInfo {
                            name,
                            size_mb: physical_size as f64 / 1_048_576.0,
                            logical_size_mb: Some(logical_size as f64 / 1_048_576.0),
                        });
                    } else if e.path().is_file() && (e.path().extension() == Some(std::ffi::OsStr::new("zst")) || e.path().extension() == Some(std::ffi::OsStr::new("tar"))) {
                        let size = e.metadata().map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                        files.push(BackupInfo {
                            name,
                            size_mb: size,
                            logical_size_mb: Some(size),
                        });
                    }
                }
            }
        };

        process_dir(&base.join("World"));
        process_dir(&base.join("Mods"));
        process_dir(&base);
        
        // Scan legacy vault Engine
        process_dir(&base.join("Engine"));
        
        // Scan relocated Engine backups
        if let Some(engine_dir) = crate::utils::get_engine_backups_dir(&config.live_path, &vault_path) {
            process_dir(&engine_dir);
        }

        files.sort_by(|a, b| a.name.cmp(&b.name));
        let mut world_state_seen = false;
        let mut engine_core_seen = false;
        for file in &mut files {
            if file.name.starts_with("World_State") {
                if !world_state_seen {
                    world_state_seen = true;
                    if file.size_mb < 0.1 {
                        file.size_mb = file.logical_size_mb.unwrap_or(0.0);
                    }
                }
            } else if file.name.starts_with("Engine_Core") {
                if !engine_core_seen {
                    engine_core_seen = true;
                    if file.size_mb < 0.1 {
                        file.size_mb = file.logical_size_mb.unwrap_or(0.0);
                    }
                }
            }
        }

        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_backup(file_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        if let Some(path) = find_backup(&config.vault_path, &file_name) {
            if path.is_dir() {
                std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
            Ok("Deleted.".into())
        } else {
            Err("Not found.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn rename_backup(old_name: String, new_name: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    if let Some(old_path) = find_backup(&config.vault_path, &old_name) {
        let mut final_name = new_name.trim().to_string();
        if old_path.is_file() && !final_name.ends_with(".zst") {
            final_name = format!("{}.tar.zst", final_name);
        }
        let new_path = old_path.with_file_name(&final_name);
        std::fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
        Ok(final_name)
    } else {
        Err("Not found.".into())
    }
}

#[tauri::command]
pub async fn backup_universe(
    app: tauri::AppHandle,
    docs_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let game_docs_path = PathBuf::from(&docs_path);
        let backup_name = format!(
            "World_State--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let parent_dir = PathBuf::from(&config.vault_path).join("Backups").join("World");
        let backup_path = parent_dir.join(&backup_name);
        
        let mut previous_backup = None;
        if let Ok(entries) = std::fs::read_dir(&parent_dir) {
            let mut folders: Vec<_> = entries.flatten()
                .filter(|e| e.file_type().map_or(false, |ft| ft.is_dir()) && e.file_name().to_string_lossy().starts_with("World_State--"))
                .map(|e| e.path())
                .collect();
            folders.sort_by(|a, b| {
                let ma = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                let mb = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                ma.cmp(&mb)
            });
            previous_backup = folders.pop();
        }

        let _ = std::fs::create_dir_all(&backup_path);

        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap().clone();
        
        let mut targets = Vec::new();
        if let Some(schema) = &game_schema {
            if let Some(time_capsule) = &schema.time_capsule {
                for target in &time_capsule.world_state_targets {
                    let resolved = crate::game_logic::expand_env_vars(&target.path);
                    targets.push((target.name.clone(), game_docs_path.join(&resolved)));
                }
            }
        }

        let mut files_to_backup = Vec::new();
        for (_name, path) in targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(&path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Err(format!("No files found to backup in path: {}", game_docs_path.display()));
        }
        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "action": "Sealing World State..."
            }),
        );

        let mut last_emit = std::time::Instant::now();
        let mut diff_size = 0;
        for (i, file_path) in files_to_backup.iter().enumerate() {
            let stripped = if let Ok(rel) = file_path.strip_prefix(&game_docs_path) {
                rel.to_path_buf()
            } else {
                let path_str = file_path.to_string_lossy().to_lowercase();
                let prefix_str = game_docs_path.to_string_lossy().to_lowercase();
                if path_str.starts_with(&prefix_str) {
                    let stripped_str = &file_path.to_string_lossy()[prefix_str.len()..];
                    let stripped_str = stripped_str.trim_start_matches(|c| c == '/' || c == '\\');
                    PathBuf::from(stripped_str)
                } else {
                    PathBuf::from(file_path.file_name().unwrap())
                }
            };

            let dest_path = backup_path.join(&stripped);
            if let Some(parent) = dest_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            let mut linked = false;
            if let Some(prev) = &previous_backup {
                let prev_file = prev.join(&stripped);
                if prev_file.exists() && prev_file.is_file() {
                    if let (Ok(src_meta), Ok(prev_meta)) = (file_path.metadata(), prev_file.metadata()) {
                        if src_meta.len() == prev_meta.len() && src_meta.modified().ok() == prev_meta.modified().ok() {
                            if std::fs::hard_link(&prev_file, &dest_path).is_ok() {
                                linked = true;
                            }
                        }
                    }
                }
            }
            if !linked {
                let _ = std::fs::copy(&file_path, &dest_path);
                if let Ok(meta) = file_path.metadata() {
                    diff_size += meta.len();
                }
            } else {
                if let Some(prev) = &previous_backup {
                    if previous_backup.as_ref().map_or(false, |p| p.join(&stripped).exists()) {
                        // It's a hardlink, no physical size added
                    }
                }
            }

            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let mut current_pct = if total > 0 { (((i + 1) as f64 / total as f64) * 100.0) as usize } else { 0 };
                if current_pct > 100 { current_pct = 100; }
                let _ = app.emit(
                    "backup-progress",
                    serde_json::json!({
                        "current": current_pct,
                        "total": 100,
                        "action": "Sealing World State..."
                    }),
                );
                last_emit = std::time::Instant::now();
            }
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 100,
                "total": 100,
                "action": "World Seal Complete!"
            }),
        );

        let mut total_size = 0;
        for file_path in &files_to_backup {
            if let Ok(meta) = file_path.metadata() {
                total_size += meta.len();
            }
        }
        let _ = std::fs::write(backup_path.join(".size_bytes.txt"), total_size.to_string());
        let _ = std::fs::write(backup_path.join(".diff_size_bytes.txt"), diff_size.to_string());

        if let Some(cycles) = config.world_retention_cycles {
            crate::utils::enforce_retention_policy(&parent_dir, cycles);
        }

        Ok(backup_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn backup_engine_full(
    app: tauri::AppHandle,
    live_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let mut base_path = PathBuf::from(&live_path);
        if base_path.is_file() {
            base_path.pop();
        }
        let lower_path = base_path.to_string_lossy().to_lowercase();
        if lower_path.ends_with("bin") || lower_path.ends_with("bin_le") {
            base_path.pop();
        }
        let lower_path2 = base_path.to_string_lossy().to_lowercase();
        if lower_path2.ends_with("game") {
            base_path.pop();
        }
        let backup_name = format!(
            "Engine_Core--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let parent_dir = crate::utils::get_engine_backups_dir(&live_path, &config.vault_path)
            .unwrap_or_else(|| PathBuf::from(&config.vault_path).join("Backups").join("Engine"));
            
        let backup_path = parent_dir.join(&backup_name);
        
        let mut previous_backup = None;
        if let Ok(entries) = std::fs::read_dir(&parent_dir) {
            let mut folders: Vec<_> = entries.flatten()
                .filter(|e| e.file_type().map_or(false, |ft| ft.is_dir()) && e.file_name().to_string_lossy().starts_with("Engine_Core--"))
                .map(|e| e.path())
                .collect();
            folders.sort_by(|a, b| {
                let ma = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                let mb = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                ma.cmp(&mb)
            });
            previous_backup = folders.pop();
        }

        let _ = std::fs::create_dir_all(&backup_path);

        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap().clone();
        
        let mut targets = Vec::new();
        if let Some(schema) = &game_schema {
            if let Some(time_capsule) = &schema.time_capsule {
                for target in &time_capsule.engine_state_targets {
                    let resolved = crate::game_logic::expand_env_vars(&target.path);
                    targets.push((target.name.clone(), base_path.join(&resolved)));
                }
            }
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "action": "Scanning Engine Core..."
            }),
        );
        let mut files_to_backup = Vec::new();
        for (_name, path) in targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(&path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Err(format!("No files found to backup in engine path: {}", base_path.display()));
        }
        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "action": "Sealing Engine Core..."
            }),
        );

        let mut last_emit = std::time::Instant::now();
        let mut diff_size = 0;
        for (i, file_path) in files_to_backup.iter().enumerate() {
            let stripped = if let Ok(rel) = file_path.strip_prefix(&base_path) {
                rel.to_path_buf()
            } else {
                let path_str = file_path.to_string_lossy().to_lowercase();
                let prefix_str = base_path.to_string_lossy().to_lowercase();
                if path_str.starts_with(&prefix_str) {
                    let stripped_str = &file_path.to_string_lossy()[prefix_str.len()..];
                    let stripped_str = stripped_str.trim_start_matches(|c| c == '/' || c == '\\');
                    PathBuf::from(stripped_str)
                } else {
                    PathBuf::from(file_path.file_name().unwrap())
                }
            };

            let dest_path = backup_path.join(&stripped);
            if let Some(parent) = dest_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            let mut linked = false;
            if let Some(prev) = &previous_backup {
                let prev_file = prev.join(&stripped);
                if prev_file.exists() && prev_file.is_file() {
                    if let (Ok(src_meta), Ok(prev_meta)) = (file_path.metadata(), prev_file.metadata()) {
                        if src_meta.len() == prev_meta.len() && src_meta.modified().ok() == prev_meta.modified().ok() {
                            if std::fs::hard_link(&prev_file, &dest_path).is_ok() {
                                linked = true;
                            }
                        }
                    }
                }
            }
            if !linked {
                let _ = std::fs::copy(&file_path, &dest_path);
                if let Ok(meta) = file_path.metadata() {
                    diff_size += meta.len();
                }
            }

            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let mut current_pct = if total > 0 { (((i + 1) as f64 / total as f64) * 100.0) as usize } else { 0 };
                if current_pct > 100 { current_pct = 100; }
                let _ = app.emit(
                    "backup-progress",
                    serde_json::json!({
                        "current": current_pct,
                        "total": 100,
                        "action": "Sealing Engine Core..."
                    }),
                );
                last_emit = std::time::Instant::now();
            }
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 100,
                "total": 100,
                "action": "Engine Core Seal Complete!"
            }),
        );

        let mut total_size = 0;
        for file_path in &files_to_backup {
            if let Ok(meta) = file_path.metadata() {
                total_size += meta.len();
            }
        }
        let _ = std::fs::write(backup_path.join(".size_bytes.txt"), total_size.to_string());
        let _ = std::fs::write(backup_path.join(".diff_size_bytes.txt"), diff_size.to_string());

        if let Some(cycles) = config.engine_retention_cycles {
            crate::utils::enforce_retention_policy(&parent_dir, cycles);
        }

        Ok(format!("Secured: {}", backup_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn differential_restore<F>(arc_dir: &std::path::Path, target_dir: &std::path::Path, progress_cb: &mut F) -> std::io::Result<()> 
where 
    F: FnMut(),
{
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)?;
    }
    
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            let arc_path = arc_dir.join(&file_name);
            let target_path = e.path();
            if !arc_path.exists() {
                if target_path.is_dir() {
                    let _ = std::fs::remove_dir_all(target_path);
                } else {
                    let _ = std::fs::remove_file(target_path);
                }
            }
        }
    }
    
    if let Ok(entries) = std::fs::read_dir(arc_dir) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            let arc_path = e.path();
            let target_path = target_dir.join(&file_name);
            
            if arc_path.is_dir() {
                differential_restore(&arc_path, &target_path, progress_cb)?;
            } else {
                let mut needs_copy = true;
                if target_path.exists() && target_path.is_file() {
                    if let (Ok(arc_meta), Ok(target_meta)) = (arc_path.metadata(), target_path.metadata()) {
                        if arc_meta.len() == target_meta.len() && arc_meta.modified().ok() == target_meta.modified().ok() {
                            needs_copy = false;
                        }
                    }
                }
                if needs_copy {
                    let _ = std::fs::copy(&arc_path, &target_path);
                }
                progress_cb();
            }
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct BackupFile {
    pub path: String,
    pub size_mb: f64,
}

#[derive(Serialize, Deserialize)]
pub struct BackupInspectionResult {
    pub files: Vec<BackupFile>,
    pub logical_size_bytes: u64,
    pub diff_size_bytes: u64,
    pub location: String,
}

#[derive(Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub status: String,
}

#[tauri::command]
pub async fn get_backup_contents(vault_path: String, backup_name: String) -> Result<BackupInspectionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parent = if backup_name.starts_with("Engine_Core") { "Engine" } else { "World" };
        let mut backup_dir = PathBuf::from(&vault_path).join("Backups").join(parent).join(&backup_name);
        
        if backup_name.starts_with("Engine_Core") && !backup_dir.exists() {
            let config = get_saved_coordinates();
            if let Some(engine_dir) = crate::utils::get_engine_backups_dir(&config.live_path, &vault_path) {
                backup_dir = engine_dir.join(&backup_name);
            }
        }

        if !backup_dir.exists() {
            return Err("Backup not found".into());
        }

        let mut files = vec![];
        let all_files = get_all_files(&backup_dir);
        
        for file in all_files {
            if let Ok(rel) = file.strip_prefix(&backup_dir) {
                let rel_str = rel.to_string_lossy().replace("\\", "/");
                if rel_str.starts_with(".") { continue; }
                
                let size = std::fs::metadata(&file).map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                files.push(BackupFile {
                    path: rel_str,
                    size_mb: size,
                });
            }
        }
        
        files.sort_by(|a, b| a.path.cmp(&b.path));

        let logical_size = std::fs::read_to_string(backup_dir.join(".size_bytes.txt"))
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or(0);
            
        let diff_size = std::fs::read_to_string(backup_dir.join(".diff_size_bytes.txt"))
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or(0);

        Ok(BackupInspectionResult {
            files,
            logical_size_bytes: logical_size,
            diff_size_bytes: diff_size,
            location: backup_dir.to_string_lossy().to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extract_backup_file(vault_path: String, docs_path: String, backup_name: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parent = if backup_name.starts_with("Engine_Core") { "Engine" } else { "World" };
        let mut backup_dir = PathBuf::from(&vault_path).join("Backups").join(parent).join(&backup_name);
        let config = get_saved_coordinates();
        
        if backup_name.starts_with("Engine_Core") && !backup_dir.exists() {
            if let Some(engine_dir) = crate::utils::get_engine_backups_dir(&config.live_path, &vault_path) {
                backup_dir = engine_dir.join(&backup_name);
            }
        }

        if !backup_dir.exists() {
            return Err("Backup not found".into());
        }

        let src_file = backup_dir.join(&file_path);
        if !src_file.exists() {
            return Err("File not found in backup".into());
        }

        let target_root = if backup_name.starts_with("Engine_Core") {
            let mut base = PathBuf::from(&config.live_path);
            if base.is_file() { base.pop(); }
            if base.to_string_lossy().to_lowercase().ends_with("bin") || base.to_string_lossy().to_lowercase().ends_with("bin_le") { base.pop(); }
            if base.to_string_lossy().to_lowercase().ends_with("game") { base.pop(); }
            base
        } else {
            PathBuf::from(&docs_path)
        };

        let dest_file = target_root.join(&file_path);
        if let Some(parent_dir) = dest_file.parent() {
            let _ = std::fs::create_dir_all(parent_dir);
        }

        std::fs::copy(&src_file, &dest_file).map_err(|e| e.to_string())?;
        Ok("Success".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn diff_backup(vault_path: String, docs_path: String, backup_name: String) -> Result<Vec<DiffEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parent = if backup_name.starts_with("Engine_Core") { "Engine" } else { "World" };
        let mut backup_dir = PathBuf::from(&vault_path).join("Backups").join(parent).join(&backup_name);
        let config = get_saved_coordinates();
        
        if backup_name.starts_with("Engine_Core") && !backup_dir.exists() {
            if let Some(engine_dir) = crate::utils::get_engine_backups_dir(&config.live_path, &vault_path) {
                backup_dir = engine_dir.join(&backup_name);
            }
        }

        if !backup_dir.exists() {
            return Err("Backup not found".into());
        }

        let target_root = if backup_name.starts_with("Engine_Core") {
            let mut base = PathBuf::from(&config.live_path);
            if base.is_file() { base.pop(); }
            if base.to_string_lossy().to_lowercase().ends_with("bin") || base.to_string_lossy().to_lowercase().ends_with("bin_le") { base.pop(); }
            if base.to_string_lossy().to_lowercase().ends_with("game") { base.pop(); }
            base
        } else {
            PathBuf::from(&docs_path)
        };

        let mut diffs = vec![];
        let backup_files = get_all_files(&backup_dir);
        let mut checked = std::collections::HashSet::new();

        for b_file in &backup_files {
            if let Ok(rel) = b_file.strip_prefix(&backup_dir) {
                let rel_str = rel.to_string_lossy().replace("\\", "/");
                if rel_str.starts_with(".") { continue; }
                
                checked.insert(rel_str.clone());
                
                let target_file = target_root.join(rel);
                if !target_file.exists() {
                    diffs.push(DiffEntry { path: rel_str, status: "Missing in Current".into() });
                } else {
                    let b_meta = std::fs::metadata(&b_file).ok();
                    let t_meta = std::fs::metadata(&target_file).ok();
                    if let (Some(b), Some(t)) = (b_meta, t_meta) {
                        if b.len() != t.len() || b.modified().ok() != t.modified().ok() {
                            diffs.push(DiffEntry { path: rel_str, status: "Modified".into() });
                        } else {
                            diffs.push(DiffEntry { path: rel_str, status: "Identical".into() });
                        }
                    }
                }
            }
        }
        
        Ok(diffs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_game_data(
    app: tauri::AppHandle,
    docs_path: String,
    live_path: String,
    backup_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let arc = find_backup(&config.vault_path, &backup_name).ok_or("Backup not found in Vault")?;
        
        let target = if backup_name.contains("Engine") {
            PathBuf::from(live_path)
                .parent()
                .and_then(|p| p.parent())
                .unwrap()
                .to_path_buf()
        } else {
            PathBuf::from(docs_path)
        };

        if arc.is_dir() {
            let _ = app.emit("backup-progress", serde_json::json!({
                "current": 0,
                "total": 100,
                "action": "Scanning Vault Data..."
            }));
            
            let arc_files = crate::utils::get_all_files(&arc);
            let total = arc_files.len();
            let action_str: String = if backup_name.contains("Engine") { "Restoring Engine Core...".into() } else { "Restoring World State...".into() };
            
            let mut i = 0;
            let mut last_emit = std::time::Instant::now();
            
            let mut progress_cb = || {
                i += 1;
                if last_emit.elapsed() > std::time::Duration::from_millis(50) || i >= total {
                    let mut current_pct = if total > 0 { ((i as f64 / total as f64) * 100.0) as usize } else { 0 };
                    if current_pct > 100 { current_pct = 100; }
                    let _ = app.emit("backup-progress", serde_json::json!({
                        "current": current_pct,
                        "total": 100,
                        "action": action_str.clone()
                    }));
                    last_emit = std::time::Instant::now();
                }
            };
            
            if let Ok(entries) = std::fs::read_dir(&arc) {
                for e in entries.flatten() {
                    let file_name = e.file_name();
                    let arc_sub = e.path();
                    let target_sub = target.join(&file_name);
                    
                    if arc_sub.is_dir() {
                        let _ = differential_restore(&arc_sub, &target_sub, &mut progress_cb);
                    } else {
                        let mut needs_copy = true;
                        if target_sub.exists() && target_sub.is_file() {
                            if let (Ok(arc_meta), Ok(target_meta)) = (arc_sub.metadata(), target_sub.metadata()) {
                                if arc_meta.len() == target_meta.len() && arc_meta.modified().ok() == target_meta.modified().ok() {
                                    needs_copy = false;
                                }
                            }
                        }
                        if needs_copy {
                            let _ = std::fs::copy(&arc_sub, &target_sub);
                        }
                        progress_cb();
                    }
                }
            }
        } else {
            // Legacy tar.zst
            if !backup_name.contains("Engine") {
                let _ = std::fs::remove_dir_all(target.join("Saves"));
                let _ = std::fs::remove_dir_all(target.join("Tray"));
            }
            
            let tar_file = std::fs::File::open(&arc).map_err(|e| e.to_string())?;
            let total_size = tar_file.metadata().map(|m| m.len() as usize).unwrap_or(1);

            struct ProgressReader<R> {
                inner: R,
                current: usize,
                total: usize,
                app: tauri::AppHandle,
                action: String,
                last_emit: std::time::Instant,
            }

            impl<R: std::io::Read> std::io::Read for ProgressReader<R> {
                fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                    let n = self.inner.read(buf)?;
                    self.current += n;
                    if self.last_emit.elapsed() > std::time::Duration::from_millis(50) || self.current >= self.total || n == 0 {
                        let mut current_pct = if self.total > 0 { ((self.current as f64 / self.total as f64) * 100.0) as usize } else { 0 };
                        if current_pct > 100 { current_pct = 100; }
                        let _ = self.app.emit("backup-progress", serde_json::json!({
                            "current": current_pct,
                            "total": 100,
                            "action": self.action.clone()
                        }));
                        self.last_emit = std::time::Instant::now();
                    }
                    Ok(n)
                }
            }

            let progress_reader = ProgressReader {
                inner: tar_file,
                current: 0,
                total: total_size,
                app: app.clone(),
                action: if backup_name.contains("Engine") { "Restoring Engine Core...".into() } else { "Restoring World State...".into() },
                last_emit: std::time::Instant::now(),
            };

            let mut archive =
                tar::Archive::new(zstd::Decoder::new(progress_reader).map_err(|e| e.to_string())?);
            archive.unpack(target).map_err(|e| e.to_string())?;
        }

        let _ = app.emit("backup-progress", serde_json::json!({
            "current": 100,
            "total": 100,
            "action": "Restore Complete!"
        }));

        Ok("Restored".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

