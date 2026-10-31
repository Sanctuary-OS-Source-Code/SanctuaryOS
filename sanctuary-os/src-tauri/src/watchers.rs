use crate::commands::state_ops::*;
use crate::state::*;
use notify::Watcher;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

static VAULT_WATCH_SHUTDOWN: std::sync::OnceLock<
    std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>>,
> = std::sync::OnceLock::new();
static AIRGAP_WATCH_SHUTDOWN: std::sync::OnceLock<
    std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>>,
> = std::sync::OnceLock::new();
static SETTINGS_WATCH_SHUTDOWN: std::sync::OnceLock<
    std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>>,
> = std::sync::OnceLock::new();

fn reset_watcher_shutdown(
    cell: &std::sync::OnceLock<std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>>>,
) -> std::sync::mpsc::Receiver<()> {
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();
    let mutex = cell.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        if let Some(old_tx) = guard.take() {
            let _ = old_tx.send(());
        }
        *guard = Some(shutdown_tx);
    }
    shutdown_rx
}

#[tauri::command]
pub fn initialize_vault_watch(
    app_handle: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
) -> () {
    let config = get_saved_coordinates();
    let path_to_watch = PathBuf::from(&config.vault_path);
    if !path_to_watch.exists() {
        return;
    }
    let mods_path_to_ignore = std::path::PathBuf::from(&config.mods_path);
    let is_deploying = app_state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = app_state.inner().last_deploy_epoch_ms.clone();
    let shutdown_rx = reset_watcher_shutdown(&VAULT_WATCH_SHUTDOWN);

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::RecommendedWatcher::new(tx, notify::Config::default()) {
            Ok(w) => w,
            Err(_) => return,
        };

        let subdirs = vec!["Mods"];
        for subdir in subdirs {
            let subdir_path = path_to_watch.join(subdir);
            if subdir_path.exists() {
                let _ = watcher.watch(&subdir_path, notify::RecursiveMode::Recursive);
            }
        }

        let _keep_alive = watcher;
        let mut pending_emit_path: Option<String> = None;
        let mut last_event_time: Option<std::time::Instant> = None;
        let debounce_window = std::time::Duration::from_millis(250);

        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match rx.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(Ok(event)) => {
                    if is_deploying.load(std::sync::atomic::Ordering::SeqCst) {
                        continue;
                    }
                    let last_deploy =
                        last_deploy_epoch_ms.load(std::sync::atomic::Ordering::SeqCst);
                    if last_deploy > 0
                        && crate::utils::current_epoch_ms().saturating_sub(last_deploy) < 1000
                    {
                        continue;
                    }

                    if let notify::EventKind::Access(_) = event.kind {
                        continue;
                    }
                    if let notify::EventKind::Modify(notify::event::ModifyKind::Metadata(_)) =
                        event.kind
                    {
                        continue;
                    }
                    for path in event.paths {
                        if path.starts_with(&mods_path_to_ignore)
                            || crate::utils::is_macos_or_os_metadata_path(&path)
                        {
                            continue;
                        }
                        let path_str = path.to_string_lossy().to_string();
                        let lower = path_str.to_lowercase();
                        let file_name_lower = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        if lower.ends_with(".db")
                            || lower.ends_with(".db-journal")
                            || lower.ends_with(".db-wal")
                            || lower.ends_with(".db-shm")
                            || lower.ends_with(".json")
                            || lower.ends_with(".cfg")
                            || lower.ends_with(".ini")
                            || lower.ends_with(".txt")
                            || lower.ends_with(".tmp_sanctuary_conflict")
                            || lower.contains(".tmp_sanctuary_conflict")
                            || file_name_lower.starts_with(".shredding_")
                            || lower.contains(".shredding_")
                            || file_name_lower == ".ds_store"
                            || file_name_lower.starts_with("._")
                        {
                            continue;
                        }
                        pending_emit_path = Some(path_str);
                        last_event_time = Some(std::time::Instant::now());
                    }
                }
                Ok(Err(_)) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if let (Some(t), Some(_)) = (last_event_time, &pending_emit_path) {
                if t.elapsed() >= debounce_window {
                    if let Some(p) = pending_emit_path.take() {
                        let _ = app_handle.emit("vault_changed", p);
                    }
                    last_event_time = None;
                }
            }
        }
    });
}

#[tauri::command]
pub fn initialize_airgap_watch(
    app_handle: tauri::AppHandle,
    docs_path: String,
    vault_path: String,
) {
    let path_to_watch = std::path::PathBuf::from(&docs_path);
    if !path_to_watch.exists() {
        return;
    }

    let v_path = std::path::PathBuf::from(&vault_path)
        .join("Backups")
        .join("Config");
    let _ = std::fs::create_dir_all(&v_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
    let shutdown_rx = reset_watcher_shutdown(&AIRGAP_WATCH_SHUTDOWN);

    std::thread::spawn(move || {
        use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};

        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher
            .watch(&path_to_watch, RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }

        let _keep_alive = watcher;
        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }
            match rx.recv_timeout(std::time::Duration::from_millis(250)) {
                Ok(Ok(event)) => {
                    if event.kind.is_modify() || event.kind.is_create() {
                        for path in event.paths {
                            if let Some(parent) = path.parent() {
                                if parent != path_to_watch.as_path() {
                                    continue;
                                }
                            }
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if matches!(
                                    ext_lower.as_str(),
                                    "cfg" | "ini" | "json" | "toml" | "txt" | "xml"
                                ) {
                                    if let Some(filename) = path.file_name() {
                                        let fname_str = filename.to_string_lossy().to_string();
                                        if fname_str.starts_with('.')
                                            || fname_str.eq_ignore_ascii_case("Resource.cfg")
                                            || fname_str.eq_ignore_ascii_case("Default.ini")
                                            || fname_str.eq_ignore_ascii_case("desktop.ini")
                                        {
                                            continue;
                                        }
                                        let backup_dest = v_path.join(filename);
                                        let vault_file = vault_mods_lane.join(filename);

                                        let prior_content = std::fs::read_to_string(&vault_file)
                                            .ok()
                                            .or_else(|| std::fs::read_to_string(&backup_dest).ok());

                                        if vault_file.exists() {
                                            if !backup_dest.exists() {
                                                let _ = std::fs::copy(&vault_file, &backup_dest);
                                            }
                                            let _ = std::fs::remove_file(&vault_file);
                                        }

                                        let _ = std::fs::copy(&path, &backup_dest);

                                        if !crate::commands::game_info::was_recently_saved_by_workbench(
                                            &path.to_string_lossy(),
                                            3500,
                                        ) {
                                            if let Ok(new_content) = std::fs::read_to_string(&path)
                                            {
                                                let target_history_path = if vault_file.exists() {
                                                    vault_file.to_string_lossy().to_string()
                                                } else {
                                                    backup_dest.to_string_lossy().to_string()
                                                };
                                                let _ = crate::commands::game_info::record_in_game_config_snapshot(
                                                    &app_handle,
                                                    &target_history_path,
                                                    prior_content.as_deref(),
                                                    &new_content,
                                                );
                                            }
                                        }

                                        let _ = app_handle.emit("airgap_secured", fname_str);
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(Err(_)) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

#[tauri::command]
pub fn initialize_settings_watch(
    app_handle: tauri::AppHandle,
    mods_path: String,
    vault_path: String,
    app_state: tauri::State<'_, AppState>,
) {
    let path_to_watch = std::path::PathBuf::from(&mods_path);
    if !path_to_watch.exists() {
        return;
    }
    let vault_mods_path = crate::utils::get_vault_mods_lane(&vault_path);
    let _ = std::fs::create_dir_all(&vault_mods_path);

    let is_deploying = app_state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = app_state.inner().last_deploy_epoch_ms.clone();
    let shutdown_rx = reset_watcher_shutdown(&SETTINGS_WATCH_SHUTDOWN);

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use notify::Watcher;

        let is_watched_config_file = |p: &std::path::Path| -> bool {
            let Some(ext) = p.extension().and_then(|e| e.to_str()) else {
                return false;
            };
            let ext_lower = ext.to_lowercase();
            if !matches!(
                ext_lower.as_str(),
                "cfg" | "ini" | "json" | "toml" | "txt" | "xml"
            ) {
                return false;
            }
            let Some(file_name) = p.file_name().and_then(|n| n.to_str()) else {
                return false;
            };
            if file_name.starts_with('.')
                || file_name.starts_with("._")
                || file_name.eq_ignore_ascii_case("Default.ini")
                || file_name.eq_ignore_ascii_case("Resource.cfg")
                || file_name.eq_ignore_ascii_case("desktop.ini")
                || file_name.eq_ignore_ascii_case(".DS_Store")
                || file_name.eq_ignore_ascii_case("override.json")
                || file_name.eq_ignore_ascii_case("manifest.json")
                || file_name.eq_ignore_ascii_case(".sanctuary_deployed_links.json")
                || file_name.eq_ignore_ascii_case(".sanctuary_cache.json")
            {
                return false;
            }
            true
        };

        // Seed in-memory baseline contents for existing Vault config files so symlink-routed in-game edits have a pre-edit baseline
        let mut known_contents: HashMap<PathBuf, String> = HashMap::new();
        for entry in walkdir::WalkDir::new(&vault_mods_path)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let ep = entry.path();
            if ep.is_file() && is_watched_config_file(ep) {
                if let Ok(content) = std::fs::read_to_string(ep) {
                    known_contents.insert(ep.to_path_buf(), content);
                }
            }
        }

        let Ok(mut watcher) = notify::RecommendedWatcher::new(tx, notify::Config::default()) else {
            return;
        };
        if watcher
            .watch(&path_to_watch, notify::RecursiveMode::Recursive)
            .is_ok()
        {
            if vault_mods_path != path_to_watch && vault_mods_path.exists() {
                let _ = watcher.watch(&vault_mods_path, notify::RecursiveMode::Recursive);
            }
            let _keep_alive = watcher;
            loop {
                if shutdown_rx.try_recv().is_ok() {
                    break;
                }
                match rx.recv_timeout(std::time::Duration::from_millis(250)) {
                    Ok(Ok(event)) => {
                        if is_deploying.load(std::sync::atomic::Ordering::SeqCst) {
                            continue;
                        }
                        let last_deploy =
                            last_deploy_epoch_ms.load(std::sync::atomic::Ordering::SeqCst);
                        if last_deploy > 0
                            && crate::utils::current_epoch_ms().saturating_sub(last_deploy) < 2000
                        {
                            continue;
                        }

                        let is_relevant_write = matches!(
                            event.kind,
                            notify::EventKind::Create(_)
                                | notify::EventKind::Modify(notify::event::ModifyKind::Data(_))
                                | notify::EventKind::Modify(notify::event::ModifyKind::Any)
                        );
                        if !is_relevant_write {
                            continue;
                        }

                        // Allow the game engine to finish flushing its config write before reading
                        std::thread::sleep(std::time::Duration::from_millis(120));

                        for path in event.paths {
                            if crate::utils::is_macos_or_os_metadata_path(&path) {
                                continue;
                            }
                            if !is_watched_config_file(&path) {
                                continue;
                            }
                            if crate::commands::game_info::was_recently_saved_by_workbench(
                                &path.to_string_lossy(),
                                3500,
                            ) {
                                if let Ok(c) = std::fs::read_to_string(&path) {
                                    known_contents.insert(path.clone(), c);
                                }
                                continue;
                            }

                            let Ok(symlink_meta) = std::fs::symlink_metadata(&path) else {
                                continue;
                            };
                            let is_symlink = symlink_meta.file_type().is_symlink()
                                || std::fs::read_link(&path).is_ok();

                            let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                                continue;
                            };

                            // Case 1: Direct write inside Vault Mods (or through a symlink pointing into Vault Mods)
                            if path.starts_with(&vault_mods_path) {
                                if !path.is_file() {
                                    continue;
                                }
                                let Ok(new_content) = std::fs::read_to_string(&path) else {
                                    continue;
                                };
                                if new_content.trim().is_empty() {
                                    continue;
                                }
                                let prior_content = known_contents.get(&path).cloned();
                                if prior_content.as_deref() == Some(new_content.as_str()) {
                                    continue;
                                }
                                known_contents.insert(path.clone(), new_content.clone());
                                let _ = crate::commands::game_info::record_in_game_config_snapshot(
                                    &app_handle,
                                    &path.to_string_lossy(),
                                    prior_content.as_deref(),
                                    &new_content,
                                );
                                continue;
                            }

                            // Case 2: Write inside live Mods folder (either physical file or symlink to Vault)
                            if let Ok(relative_path) = path.strip_prefix(&path_to_watch) {
                                let backup_dest = if is_symlink {
                                    std::fs::read_link(&path).unwrap_or_else(|_| {
                                        crate::utils::resolve_vault_config_destination(
                                            &vault_mods_path,
                                            relative_path,
                                            file_name,
                                        )
                                    })
                                } else {
                                    crate::utils::resolve_vault_config_destination(
                                        &vault_mods_path,
                                        relative_path,
                                        file_name,
                                    )
                                };

                                if crate::commands::game_info::was_recently_saved_by_workbench(
                                    &backup_dest.to_string_lossy(),
                                    3500,
                                ) {
                                    continue;
                                }

                                let prior_content = if !is_symlink && backup_dest.is_file() {
                                    std::fs::read_to_string(&backup_dest)
                                        .ok()
                                        .or_else(|| known_contents.get(&backup_dest).cloned())
                                } else {
                                    known_contents.get(&backup_dest).cloned()
                                };

                                if !is_symlink {
                                    if !symlink_meta.is_file() {
                                        continue;
                                    }
                                    if backup_dest.is_file() {
                                        if let (Ok(src_bytes), Ok(dst_bytes)) =
                                            (std::fs::read(&path), std::fs::read(&backup_dest))
                                        {
                                            if src_bytes == dst_bytes {
                                                continue;
                                            }
                                        }
                                    }
                                    if let Some(parent) = backup_dest.parent() {
                                        let _ = std::fs::create_dir_all(parent);
                                    }
                                    let _ = std::fs::copy(&path, &backup_dest);
                                }

                                if let Ok(new_content) = std::fs::read_to_string(&backup_dest) {
                                    if new_content.trim().is_empty() {
                                        continue;
                                    }
                                    if prior_content.as_deref() == Some(new_content.as_str()) {
                                        continue;
                                    }
                                    known_contents
                                        .insert(backup_dest.clone(), new_content.clone());
                                    let _ =
                                        crate::commands::game_info::record_in_game_config_snapshot(
                                            &app_handle,
                                            &backup_dest.to_string_lossy(),
                                            prior_content.as_deref(),
                                            &new_content,
                                        );
                                }
                            }
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        }
    });
}

use crate::state::DownloadsWatcherState;

#[tauri::command]
pub async fn start_downloads_watch(
    extensions: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, DownloadsWatcherState>,
) -> Result<(), String> {
    let mut watcher_lock = state.0.lock().map_err(|e| e.to_string())?;
    if watcher_lock.is_some() {
        return Ok(());
    }

    let download_dir = app
        .path()
        .download_dir()
        .map_err(|_| "Could not find Downloads folder")?;
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();

    *watcher_lock = Some(shutdown_tx);

    let app_clone = app.clone();
    std::thread::spawn(move || {
        use notify::RecursiveMode;
        let (event_tx, event_rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::RecommendedWatcher::new(event_tx, notify::Config::default())
        {
            Ok(w) => w,
            Err(_) => {
                return;
            }
        };

        if watcher
            .watch(&download_dir, RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }

        let mut recent_emits: HashMap<PathBuf, std::time::Instant> = HashMap::new();

        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            if let Ok(Ok(event)) = event_rx.recv_timeout(std::time::Duration::from_millis(500)) {
                match event.kind {
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_) => {
                        for path in event.paths {
                            if crate::utils::is_macos_or_os_metadata_path(&path) {
                                continue;
                            }
                            if path.is_file() {
                                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                    let file_name = path
                                        .file_name()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .to_string()
                                        .to_lowercase();
                                    if file_name.starts_with("._") || file_name == ".ds_store" {
                                        continue;
                                    }
                                    let ext_with_dot = format!(".{}", ext.to_lowercase());
                                    let path_str = path.to_string_lossy().to_string();
                                    if (extensions.contains(&ext_with_dot)
                                        || file_name == "override.json"
                                        || file_name == "manifest.json")
                                        && !path_str.ends_with(".crdownload")
                                        && !path_str.ends_with(".part")
                                    {
                                        let now = std::time::Instant::now();
                                        if let Some(prev) = recent_emits.get(&path) {
                                            if now.duration_since(*prev)
                                                < std::time::Duration::from_secs(2)
                                            {
                                                continue;
                                            }
                                        }
                                        recent_emits.insert(path.clone(), now);

                                        #[derive(Clone, serde::Serialize)]
                                        struct Payload {
                                            path: String,
                                        }
                                        let _ = app_clone.emit(
                                            "download_intercepted",
                                            Payload { path: path_str },
                                        );
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_downloads_watch(
    state: tauri::State<'_, DownloadsWatcherState>,
) -> Result<(), String> {
    let mut watcher_lock = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = watcher_lock.take() {
        let _ = tx.send(());
    }
    Ok(())
}
