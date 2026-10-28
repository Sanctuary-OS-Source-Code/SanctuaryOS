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
                Ok(Err(_)) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

#[tauri::command]
pub fn initialize_settings_watch(
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
        let Ok(mut watcher) = notify::RecommendedWatcher::new(tx, notify::Config::default()) else {
            return;
        };
        if watcher
            .watch(&path_to_watch, notify::RecursiveMode::NonRecursive)
            .is_ok()
        {
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

                        for path in event.paths {
                            if crate::utils::is_macos_or_os_metadata_path(&path) {
                                continue;
                            }
                            let Ok(symlink_meta) = std::fs::symlink_metadata(&path) else {
                                continue;
                            };
                            if symlink_meta.file_type().is_symlink()
                                || std::fs::read_link(&path).is_ok()
                            {
                                // Never copy a symlink back into Vault/Mods root — it already points to the Vault file
                                continue;
                            }
                            if !symlink_meta.is_file() {
                                continue;
                            }
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if ext_lower == "cfg"
                                    || ext_lower == "ini"
                                    || ext_lower == "json"
                                    || ext_lower == "txt"
                                    || ext_lower == "xml"
                                {
                                    let Some(file_name) = path.file_name().and_then(|n| n.to_str())
                                    else {
                                        continue;
                                    };
                                    if file_name.starts_with('.')
                                        || file_name.starts_with("._")
                                        || file_name.eq_ignore_ascii_case("Default.ini")
                                        || file_name.eq_ignore_ascii_case("Resource.cfg")
                                        || file_name.eq_ignore_ascii_case("desktop.ini")
                                        || file_name.eq_ignore_ascii_case(".DS_Store")
                                        || file_name
                                            .eq_ignore_ascii_case(".sanctuary_deployed_links.json")
                                    {
                                        continue;
                                    }
                                    if let Ok(relative_path) = path.strip_prefix(&path_to_watch) {
                                        let backup_dest =
                                            crate::utils::resolve_vault_config_destination(
                                                &vault_mods_path,
                                                relative_path,
                                                file_name,
                                            );
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
