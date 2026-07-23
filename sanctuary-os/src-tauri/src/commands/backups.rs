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
pub async fn sanitize_vault(vault_path: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
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

    Ok(moved.to_string())
}

#[tauri::command]
pub fn get_backups(vault_path: String) -> Result<Vec<BackupInfo>, String> {
    let mut files = vec![];
    let base = PathBuf::from(&vault_path).join("Backups");
    for sub in &["World", "Engine", "Mods"] {
        if let Ok(entries) = std::fs::read_dir(base.join(sub)) {
            for e in entries.flatten() {
                if e.path().extension() == Some(std::ffi::OsStr::new("zst")) {
                    let size = e.metadata().map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                    files.push(BackupInfo {
                        name: e.file_name().to_string_lossy().into_owned(),
                        size_mb: size,
                    });
                }
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir(&base) {
        for e in entries.flatten() {
            if e.path().is_file() && e.path().extension() == Some(std::ffi::OsStr::new("zst")) {
                let size = e.metadata().map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                files.push(BackupInfo {
                    name: e.file_name().to_string_lossy().into_owned(),
                    size_mb: size,
                });
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn delete_backup(file_name: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    if let Some(path) = find_backup(&config.vault_path, &file_name) {
        fs::remove_file(path).map_err(|e| e.to_string())?;
        Ok("Deleted.".into())
    } else {
        Err("Not found.".into())
    }
}

#[tauri::command]
pub fn rename_backup(old_name: String, new_name: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    if let Some(old_path) = find_backup(&config.vault_path, &old_name) {
        let mut final_name = new_name.trim().to_string();
        if !final_name.ends_with(".zst") {
            final_name = format!("{}.tar.zst", final_name);
        }
        let new_path = old_path.with_file_name(&final_name);
        fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
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
            "World_State_{}_{}.tar.zst",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let backup_path = PathBuf::from(&config.vault_path)
            .join("Backups")
            .join("World")
            .join(&backup_name);
        if let Some(parent) = backup_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tar_file = std::fs::File::create(&backup_path).map_err(|e| e.to_string())?;
        let mut enc = zstd::Encoder::new(tar_file, 3).map_err(|e| e.to_string())?;
        enc.multithread(0).map_err(|e| e.to_string())?;
        let mut builder = tar::Builder::new(enc);

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
            BackupProgress {
                current: 0,
                total: 100,
                action: "Sealing World State...".into(),
            },
        );

        let mut last_emit = std::time::Instant::now();
        for (i, file_path) in files_to_backup.iter().enumerate() {
            let stripped = if let Ok(rel) = file_path.strip_prefix(&game_docs_path) {
                rel.to_path_buf()
            } else {
                PathBuf::from(file_path.file_name().unwrap())
            };

            if let Ok(mut f) = std::fs::File::open(file_path) {
                if let Err(e) = builder.append_file(&stripped, &mut f) {
                    println!("Tar append error for {:?}: {}", stripped, e);
                }
            }
            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let mut current_pct = if total > 0 { (((i + 1) as f64 / total as f64) * 100.0) as usize } else { 0 };
                if current_pct > 100 { current_pct = 100; }
                let _ = app.emit(
                    "backup-progress",
                    BackupProgress {
                        current: current_pct,
                        total: 100,
                        action: format!("Sealing World State..."),
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        builder.finish().map_err(|e| e.to_string())?;
        builder
            .into_inner()
            .map_err(|e| e.to_string())?
            .finish()
            .map_err(|e| e.to_string())?;
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: 100,
                total: 100,
                action: "World Seal Complete!".into(),
            },
        );

        if let Some(cycles) = config.world_retention_cycles {
            enforce_retention_policy(&config.vault_path, "World", cycles);
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
            "Engine_Core--{}--{}.tar.zst",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let backup_path = PathBuf::from(&config.vault_path)
            .join("Backups")
            .join("Engine")
            .join(&backup_name);
        if let Some(parent) = backup_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tar_file = std::fs::File::create(&backup_path).map_err(|e| e.to_string())?;
        let mut enc = zstd::Encoder::new(tar_file, 1).map_err(|e| e.to_string())?;
        enc.multithread(0).map_err(|e| e.to_string())?;
        let mut builder = tar::Builder::new(enc);
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
            BackupProgress {
                current: 0,
                total: 100,
                action: "Sealing Engine Core...".into(),
            },
        );

        let mut last_emit = std::time::Instant::now();
        for (i, file_path) in files_to_backup.iter().enumerate() {
            let stripped = if let Ok(rel) = file_path.strip_prefix(&base_path) {
                rel.to_path_buf()
            } else {
                PathBuf::from(file_path.file_name().unwrap())
            };

            if let Ok(mut f) = std::fs::File::open(file_path) {
                if let Err(e) = builder.append_file(&stripped, &mut f) {
                    println!("Tar append error for {:?}: {}", stripped, e);
                }
            }
            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let mut current_pct = if total > 0 { (((i + 1) as f64 / total as f64) * 100.0) as usize } else { 0 };
                if current_pct > 100 { current_pct = 100; }
                let _ = app.emit(
                    "backup-progress",
                    BackupProgress {
                        current: current_pct,
                        total: 100,
                        action: format!("Sealing Engine Core..."),
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        builder.finish().map_err(|e| e.to_string())?;
        builder
            .into_inner()
            .map_err(|e| e.to_string())?
            .finish()
            .map_err(|e| e.to_string())?;
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: 100,
                total: 100,
                action: "Engine Archive Complete!".into(),
            },
        );

        if let Some(cycles) = config.engine_retention_cycles {
            enforce_retention_policy(&config.vault_path, "Engine", cycles);
        }

        Ok(format!("Secured: {}", backup_name))
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
        let arc =
            find_backup(&config.vault_path, &backup_name).ok_or("Backup not found in Vault")?;
        let target = if backup_name.contains("Engine") {
            PathBuf::from(live_path)
                .parent()
                .and_then(|p| p.parent())
                .unwrap()
                .to_path_buf()
        } else {
            let p = PathBuf::from(docs_path);
            let _ = std::fs::remove_dir_all(p.join("Saves"));
            let _ = std::fs::remove_dir_all(p.join("Tray"));
            p
        };
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
                    let _ = self.app.emit("backup-progress", BackupProgress {
                        current: current_pct,
                        total: 100,
                        action: self.action.clone(),
                    });
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

        let _ = app.emit("backup-progress", BackupProgress {
            current: 100,
            total: 100,
            action: "Restore Complete!".into(),
        });

        Ok("Restored".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

