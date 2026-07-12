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
pub fn initialize_vault_watch(app_handle: tauri::AppHandle) -> () {
    let config = get_saved_coordinates();
    let path_to_watch = PathBuf::from(&config.vault_path);
    if !path_to_watch.exists() {
        return;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
    watcher
        .watch(&path_to_watch, notify::RecursiveMode::NonRecursive)
        .unwrap();
    std::thread::spawn(move || {
        let _keep_alive = watcher;
        for res in rx {
            if res.is_ok() {
                let _ = app_handle.emit("vault_changed", "UPDATE");
            }
        }
    });
}

#[tauri::command]
pub fn initialize_airgap_watch(app_handle: tauri::AppHandle, docs_path: String, vault_path: String) {
    let path_to_watch = std::path::PathBuf::from(&docs_path);
    if !path_to_watch.exists() {
        return;
    }
    
    let v_path = std::path::PathBuf::from(&vault_path).join("Airgap");
    let _ = std::fs::create_dir_all(&v_path);
    let vault_mods_lane = std::path::PathBuf::from(&vault_path).join("Mods");

    std::thread::spawn(move || {
        use notify::{Watcher, Config, RecommendedWatcher, RecursiveMode};
        
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = match RecommendedWatcher::new(
            move |res| { let _ = tx.send(res); }, 
            Config::default()
        ) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher.watch(&path_to_watch, RecursiveMode::NonRecursive).is_err() {
            return;
        }

        for res in rx {
            if let Ok(event) = res {
                if event.kind.is_modify() || event.kind.is_create() {
                    for path in event.paths {
                        if let Some(parent) = path.parent() {
                            if parent != path_to_watch.as_path() {
                                continue;
                            }
                        }
                        if let Some(ext) = path.extension() {
                            if ext == "cfg" || ext == "ini" || ext == "json" {
                                if let Some(filename) = path.file_name() {
                                    let backup_dest = v_path.join(filename);
                                    let vault_file = vault_mods_lane.join(filename);
                                    
                                    if vault_file.exists() {
                                        if !backup_dest.exists() {
                                            let _ = std::fs::copy(&vault_file, &backup_dest);
                                        }
                                        let _ = std::fs::remove_file(&vault_file);
                                    }

                                    let _ = std::fs::copy(&path, &backup_dest);
                                    
                                    let _ = app_handle.emit(
                                        "airgap_secured",
                                        filename.to_string_lossy().to_string(),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub fn initialize_settings_watch(mods_path: String, vault_path: String) {
    let path_to_watch = std::path::PathBuf::from(&mods_path);
    if !path_to_watch.exists() {
        return;
    }
    let vault_mods_path = std::path::PathBuf::from(&vault_path).join("Mods");
    let _ = std::fs::create_dir_all(&vault_mods_path);

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use notify::Watcher;
        let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
        if watcher
            .watch(&path_to_watch, notify::RecursiveMode::Recursive)
            .is_ok()
        {
            let _keep_alive = watcher;
            for res in rx {
                if let Ok(event) = res {
                    for path in event.paths {
                        if path.is_file() {
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if ext_lower == "cfg" || ext_lower == "ini" || ext_lower == "json" || ext_lower == "txt" {
                                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                        if file_name.eq_ignore_ascii_case("Default.ini") {
                                            continue;
                                        }
                                    }
                                    if let Ok(relative_path) = path.strip_prefix(&path_to_watch) {
                                        let backup_dest = vault_mods_path.join(relative_path);
                                        if let Some(parent) = backup_dest.parent() {
                                            let _ = std::fs::create_dir_all(parent);
                                        }
                                        let _ = std::fs::copy(&path, &backup_dest);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}


use crate::state::DownloadsWatcherState;

#[tauri::command]
pub async fn start_downloads_watch(extensions: Vec<String>, app: tauri::AppHandle, state: tauri::State<'_, DownloadsWatcherState>) -> Result<(), String> {
    let mut watcher_lock = state.0.lock().map_err(|e| e.to_string())?;
    if watcher_lock.is_some() {
        return Ok(());
    }

    let download_dir = app.path().download_dir().map_err(|_| "Could not find Downloads folder")?;
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();
    
    *watcher_lock = Some(shutdown_tx);

    let app_clone = app.clone();
    std::thread::spawn(move || {
        use notify::RecursiveMode;
        let (event_tx, event_rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::RecommendedWatcher::new(event_tx, notify::Config::default()) {
            Ok(w) => w,
            Err(e) => {
                return;
            }
        };

        if let Err(e) = watcher.watch(&download_dir, RecursiveMode::NonRecursive) {
            return;
        }

        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            if let Ok(Ok(event)) = event_rx.recv_timeout(std::time::Duration::from_millis(500)) {
                match event.kind {
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_) | notify::EventKind::Access(_) => {
                        for path in event.paths {
                            if path.is_file() {
                                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                    let ext_with_dot = format!(".{}", ext.to_lowercase());
                                    let path_str = path.to_string_lossy().to_string();
                                    if extensions.contains(&ext_with_dot) && !path_str.ends_with(".crdownload") && !path_str.ends_with(".part") {
                                        #[derive(Clone, serde::Serialize)]
                                        struct Payload { path: String }
                                        let _ = app_clone.emit("download_intercepted", Payload { path: path_str });
                                    }
                                }
                            }
                        }
                    },
                    _ => {}
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_downloads_watch(state: tauri::State<'_, DownloadsWatcherState>) -> Result<(), String> {
    let mut watcher_lock = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = watcher_lock.take() {
        let _ = tx.send(());
    }
    Ok(())
}
