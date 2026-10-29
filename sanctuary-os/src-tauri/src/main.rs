#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod game_logic;
mod schema;
mod state;
mod telemetry;
mod utils;
mod watchers;

use crate::commands::backups::*;
use crate::commands::cache::*;
use crate::commands::config::*;
use crate::commands::deployment::*;
use crate::commands::edge_network::*;
use crate::commands::game_info::*;
use crate::commands::library::*;
use crate::commands::logs::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::state_ops::*;
use crate::commands::supporter::*;
use crate::commands::system::*;
use crate::commands::webauthn::*;
use crate::state::*;
use crate::watchers::*;

use std::collections::HashMap;
use tauri::Manager;

#[tauri::command]
fn sync_security_definitions(
    state: tauri::State<'_, SecurityState>,
    malware: Vec<String>,
    tier2: Vec<String>,
) -> Result<(), String> {
    if let Ok(mut m) = state.malware_hashes.lock() {
        *m = malware;
    }
    if let Ok(mut t) = state.tier2_hashes.lock() {
        *t = tier2;
    }
    Ok(())
}

#[tauri::command]
fn reveal_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Prevent WebKitGTK 4.1 DMABUF GBM buffer crashes on Linux Wayland + NVIDIA / custom compositors
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            let is_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
                || std::env::var("XDG_SESSION_TYPE")
                    .map(|s| s.eq_ignore_ascii_case("wayland"))
                    .unwrap_or(false);
            let has_nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
            if is_wayland && has_nvidia {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }
        }
    }

    std::thread::spawn(|| {
        ensure_windows_aumid_registered();
    });

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if let Some(win) = handle.get_webview_window("main") {
                    if !win.is_visible().unwrap_or(true) {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            active_schema: std::sync::Mutex::new(None),
            is_deploying: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            last_deploy_epoch_ms: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
        })
        .manage(state::DownloadsWatcherState(std::sync::Mutex::new(None)))
        .manage(SecurityState {
            malware_hashes: std::sync::Mutex::new(Vec::new()),
            tier2_hashes: std::sync::Mutex::new(Vec::new()),
            volatile_original_paths: std::sync::Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            watchers::start_downloads_watch,
            watchers::stop_downloads_watch,
            update_active_game_schema,
            get_workbench_files,
            scan_bunker,
            scan_sandbox,
            import_to_sandbox,
            delete_local_file,
            delete_mod,
            open_folder,
            detect_cloud_hijack,
            get_saved_coordinates,
            get_global_config,
            save_coordinates,
            sanitize_vault,
            auto_detect_paths,
            launch_game,
            launch_external_tool,
            airgap_saves,
            get_airgap_status,
            get_lab_test_save_status,
            configure_lab_test_save,
            deploy_mod_for_lab_test,
            start_lab_verification_session,
            poll_lab_verification_session,
            stop_lab_verification_session,
            get_lab_certificates,
            record_lab_certificate,
            get_backups,
            delete_backup,
            deploy_playset_bulk,
            initialize_vault_watch,
            run_conflict_radar,
            rename_backup,
            backup_universe,
            backup_engine_full,
            restore_game_data,
            evacuate_to_shelter,
            repopulate_from_shelter,
            wipe_symlinks,
            get_quarantine_list,
            purge_quarantined_file,
            shred_external_file,
            check_file_exists,
            get_volatile_original_path,
            clear_volatile_original_path,
            restore_quarantined_file,
            move_to_lab,
            get_shelter_list,
            read_config_file,
            save_config_file,
            scan_game_logs,
            get_scrubbed_game_logs,
            clear_old_logs,
            write_os_log,
            generate_full_dna_hash,
            scan_installed_dlc,
            rip_game_version,
            read_blueprint,
            save_blueprint,
            ingest_dropped_file,
            resolve_dna_match,
            save_master_cache,
            load_master_cache,
            sync_security_definitions,
            purge_vault_artifacts,
            initialize_airgap_watch,
            initialize_settings_watch,
            mark_explicitly_local,
            move_mod_to_priority_folder,
            get_hardware_id,
            open_developer_settings,
            check_symlink_permissions,
            get_system_info,
            webview_eval,
            webview_url,
            get_heuristic_signatures,
            save_heuristic_signatures,
            save_file_with_history,
            save_file_silently,
            get_file_history,
            toggle_pin_version,
            rename_version,
            delete_version,
            read_local_directives,
            write_local_directive,
            get_screenshots_root_dir,
            open_screenshots_dir,
            capture_window_screenshot,
            send_sanctuary_notification,
            telemetry::fetch_system_telemetry,
            telemetry::fetch_app_footprint,
            telemetry::get_directory_size,
            get_backup_contents,
            extract_backup_file,
            diff_backup,
            register_edge_override,
            fetch_and_sync_edge_manifest,
            get_all_edge_manifests,
            export_edge_release,
            push_static_edge_manifest,
            get_local_supporter_state,
            toggle_local_mason_follow,
            sync_mason_supporter_bridge,
            remove_local_mason_supporter,
            stack_local_dev_build_donation,
            download_and_install_update,
            native_webauthn_register,
            native_webauthn_authenticate,
            reveal_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
