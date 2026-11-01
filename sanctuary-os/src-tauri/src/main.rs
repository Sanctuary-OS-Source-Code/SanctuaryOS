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
        // Prevent WebKitGTK 4.1 DMABUF / GBM EGL initialization crashes on SteamOS (AMD RDNA2 APU),
        // Wayland compositors, NVIDIA drivers, and cross-distro AppImage containers.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // Silence atk-bridge DBus signature warnings on SteamOS / KDE Plasma
        if std::env::var_os("NO_AT_BRIDGE").is_none() {
            std::env::set_var("NO_AT_BRIDGE", "1");
        }

        // When running inside an Ubuntu-built AppImage on Wayland (such as SteamOS 3.6+ KDE Plasma 6),
        // the AppImage's bundled libwayland-client.so.0 has a different wl_display_interface symbol
        // address than the host's /usr/lib/libEGL_mesa.so.0, causing Mesa eglGetDisplay() to abort
        // with "Could not create default EGL Display: EGL_BAD_PARAMETER. Aborting...".
        // Routing GTK/WebKitGTK through XWayland (GDK_BACKEND=x11) and preloading host libstdc++ /
        // libwayland-client prevents the symbol mismatch completely.
        let is_appimage =
            std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some();
        if is_appimage && std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }

        if is_appimage {
            let candidate_libs = [
                "/usr/lib/libstdc++.so.6",
                "/usr/lib64/libstdc++.so.6",
                "/usr/lib/libwayland-client.so.0",
                "/usr/lib64/libwayland-client.so.0",
            ];
            let mut preload_parts: Vec<String> = std::env::var("LD_PRELOAD")
                .unwrap_or_default()
                .split(':')
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
                .collect();

            for candidate in candidate_libs {
                if std::path::Path::new(candidate).exists() {
                    let file_name = candidate.rsplit('/').next().unwrap_or(candidate);
                    if !preload_parts.iter().any(|p| p.contains(file_name)) {
                        preload_parts.push(candidate.to_string());
                    }
                }
            }

            if !preload_parts.is_empty() {
                std::env::set_var("LD_PRELOAD", preload_parts.join(":"));
            }
        }
    }

    std::thread::spawn(|| {
        ensure_windows_aumid_registered();
    });

    tauri::Builder::default()
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let scale = monitor.scale_factor();
                    let phys = monitor.size();
                    let logical_w = (phys.width as f64) / scale;
                    let logical_h = (phys.height as f64) / scale;
                    if logical_w < 1800.0 || logical_h < 1200.0 {
                        let target_w = (logical_w * 0.96).max(1024.0).min(logical_w);
                        let target_h = (logical_h * 0.94).max(700.0).min(logical_h);
                        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                            width: target_w,
                            height: target_h,
                        }));
                        let _ = win.center();
                        #[cfg(target_os = "linux")]
                        if logical_w <= 1366.0 && logical_h <= 840.0 {
                            let _ = win.maximize();
                        }
                    }
                }
            }
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
            get_archived_mod_versions,
            get_mod_version_pool_status,
            set_mod_version_archiving_enabled,
            delete_archived_mod_version,
            prune_archived_mod_versions,
            activate_archived_mod_version,
            activate_archived_mod_versions_batch,
            reset_mod_versions_to_auto,
            sync_mod_versions_to_game,
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
