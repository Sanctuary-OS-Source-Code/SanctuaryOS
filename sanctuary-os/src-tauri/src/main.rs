#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod game_logic;
mod load_order_engine;
mod schema;
mod state;
mod storefront_discovery;
mod telemetry;
mod utils;
mod watchers;

use crate::commands::backups::*;
use crate::commands::cache::*;
use crate::commands::config::*;
use crate::commands::deployment::*;
use crate::load_order_engine::*;
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
use tauri::{Emitter, Manager};

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
        #[cfg(target_os = "linux")]
        {
            let in_gamescope = std::env::var_os("GAMESCOPE_WAYLAND_DISPLAY").is_some();
            if let Ok(Some(monitor)) = win.current_monitor() {
                let scale = monitor.scale_factor();
                let phys = monitor.size();
                let logical_w = (phys.width as f64) / scale;
                let logical_h = (phys.height as f64) / scale;
                if in_gamescope || (logical_w <= 1366.0 && logical_h <= 840.0) {
                    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                        width: logical_w,
                        height: logical_h,
                    }));
                    let _ = win.maximize();
                }
            } else if in_gamescope {
                let _ = win.maximize();
            }
        }
        let _ = win.set_focus();
    }
}

fn sanitize_incoming_deep_link_arg(raw: &str) -> Option<String> {
    let cleaned = raw.trim().trim_matches('"').trim();
    if cleaned.is_empty() {
        return None;
    }
    let lower = cleaned.to_ascii_lowercase();
    if lower.starts_with("sanctuary://")
        || lower.starts_with("sanctuary-uplink://")
        || lower.starts_with("nxm://")
        || lower.starts_with("ror2mm://")
        || lower.starts_with("curseforge://")
    {
        return Some(cleaned.to_string());
    }
    let p = std::path::Path::new(cleaned);
    if p.exists() && utils::is_safe_user_file_path(p) {
        return Some(cleaned.to_string());
    }
    None
}

fn dispatch_runtime_deep_links(app: &tauri::AppHandle, items: Vec<String>) {
    if items.is_empty() {
        return;
    }
    reveal_main_window(app.clone());
    if let Some(sec) = app.try_state::<SecurityState>() {
        if !sec
            .deep_link_listener_ready
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            if let Ok(mut guard) = sec.startup_deep_links.lock() {
                for item in &items {
                    if !guard.contains(item) {
                        guard.push(item.clone());
                    }
                }
            }
        }
    }
    let _ = app.emit("sanctuary-deep-link", items);
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Silence atk-bridge DBus signature warnings on SteamOS / KDE Plasma
        if std::env::var_os("NO_AT_BRIDGE").is_none() {
            std::env::set_var("NO_AT_BRIDGE", "1");
        }

        // Only disable WebKitGTK's DMA-BUF hardware renderer on proprietary NVIDIA drivers
        // where explicit sync may fail. On Steam Deck (AMD RDNA2 APU) and Intel GPUs, keep
        // DMA-BUF hardware acceleration enabled so WebKitGTK renders on the GPU at 60 FPS!
        let has_nvidia = std::path::Path::new("/proc/driver/nvidia").exists();
        if has_nvidia && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        let is_appimage =
            std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some();
        let in_gamescope_or_steam = std::env::var_os("GAMESCOPE_WAYLAND_DISPLAY").is_some()
            || std::env::var_os("SteamGameId").is_some()
            || std::env::var_os("SteamAppId").is_some();

        // When launched as a Non-Steam Game on Steam Deck (Gamescope) or via Steam Input,
        // Gamescope exports both DISPLAY (XWayland) and WAYLAND_DISPLAY. Forcing X11 while
        // clearing WAYLAND_DISPLAY ensures GTK, WebKitWebProcess, Steam Overlay, and Gamescope's
        // XWayland window/controller focus router all bind to the exact same X11 surface.
        if in_gamescope_or_steam && std::env::var_os("DISPLAY").is_some() {
            if std::env::var_os("GDK_BACKEND").is_none() {
                std::env::set_var("GDK_BACKEND", "x11");
            }
            if std::env::var("GDK_BACKEND")
                .map(|v| v.eq_ignore_ascii_case("x11"))
                .unwrap_or(false)
            {
                std::env::remove_var("WAYLAND_DISPLAY");
            }
        }

        // When running inside an Ubuntu-built AppImage on SteamOS / Arch / Fedora, AppRun puts
        // $APPDIR/usr/lib first in LD_LIBRARY_PATH, causing Ubuntu's older libwayland / libgbm /
        // libdrm / libEGL / libstdc++ to clash with the host's /usr/lib/dri/radeonsi_dri.so GPU
        // driver (falling back to slow CPU software rendering or failing with EGL_BAD_PARAMETER).
        // By preloading the host's native graphics/Wayland/C++ libraries and re-execing before
        // GTK/WebKit initializes, ld.so binds directly to the Steam Deck's native RDNA2 GPU stack.
        if is_appimage && std::env::var_os("SANCTUARY_APPIMAGE_REEXEC").is_none() {
            std::env::set_var("SANCTUARY_APPIMAGE_REEXEC", "1");
            if let Ok(appimage_path) = std::env::var("APPIMAGE") {
                if !appimage_path.trim().is_empty() {
                    std::env::set_var("SANCTUARY_REAL_APPIMAGE", appimage_path);
                }
            }
            if std::env::var_os("GDK_BACKEND").is_none() {
                std::env::set_var("GDK_BACKEND", "x11");
            }
            if in_gamescope_or_steam && std::env::var_os("DISPLAY").is_some() {
                std::env::remove_var("WAYLAND_DISPLAY");
            }

            let host_lib_dirs = ["/usr/lib", "/usr/lib64", "/usr/lib/x86_64-linux-gnu"];
            let host_lib_names = [
                "libstdc++.so.6",
                "libgcc_s.so.1",
                "libwayland-client.so.0",
                "libwayland-server.so.0",
                "libwayland-egl.so.1",
                "libwayland-cursor.so.0",
                "libEGL.so.1",
                "libGLX.so.0",
                "libOpenGL.so.0",
                "libGLdispatch.so.0",
                "libgbm.so.1",
                "libdrm.so.2",
            ];

            let mut preload_parts: Vec<String> = std::env::var("LD_PRELOAD")
                .unwrap_or_default()
                .split(':')
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
                .collect();

            for lib_name in host_lib_names {
                for dir in host_lib_dirs {
                    let candidate = format!("{}/{}", dir, lib_name);
                    if std::path::Path::new(&candidate).exists() {
                        if !preload_parts.iter().any(|p| p.ends_with(lib_name)) {
                            preload_parts.push(candidate);
                        }
                        break;
                    }
                }
            }

            if !preload_parts.is_empty() {
                std::env::set_var("LD_PRELOAD", preload_parts.join(":"));
            }

            let current_ld = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
            let mut ld_parts: Vec<String> = Vec::new();
            for dir in host_lib_dirs {
                if std::path::Path::new(dir).is_dir() {
                    ld_parts.push(dir.to_string());
                }
            }
            for part in current_ld.split(':').filter(|s| !s.trim().is_empty()) {
                if !ld_parts.iter().any(|p| p == part) {
                    ld_parts.push(part.to_string());
                }
            }
            std::env::set_var("LD_LIBRARY_PATH", ld_parts.join(":"));

            if let Ok(exe) = std::env::current_exe() {
                use std::os::unix::process::CommandExt;
                let args: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
                let _ = std::process::Command::new(exe).args(args).exec();
            }
        }
    }

    std::thread::spawn(|| {
        ensure_windows_aumid_registered();
        let initial_prefs = commands::state_ops::get_protocol_handler_preferences();
        #[cfg(target_os = "linux")]
        commands::system::sync_linux_desktop_integration(&initial_prefs, true);
        #[cfg(not(target_os = "linux"))]
        commands::system::sync_os_url_protocol_handlers(&initial_prefs);
        commands::deployment::recover_all_stranded_workspaces_on_boot();
    });

    let startup_deep_links: Vec<String> = std::env::args()
        .skip(1)
        .filter_map(|arg| sanitize_incoming_deep_link_arg(&arg))
        .collect();
    let initial_malware_override =
        commands::state_ops::get_global_config().malware_protocol_overridden;

    let mut builder = tauri::Builder::default();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(move |app, argv, _cwd| {
            reveal_main_window(app.clone());
            let items: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter_map(|arg| sanitize_incoming_deep_link_arg(&arg))
                .collect();
            dispatch_runtime_deep_links(app, items);
        }));
    }

    builder
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    let _ = win.set_icon(icon);
                }
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
            start_linux_gamepad_poller(handle.clone());
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if let Some(win) = handle.get_webview_window("main") {
                    if !win.is_visible().unwrap_or(true) {
                        reveal_main_window(handle.clone());
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
        .manage(state::DownloadsWatcherState::default())
        .manage(SecurityState {
            malware_hashes: std::sync::Mutex::new(Vec::new()),
            tier2_hashes: std::sync::Mutex::new(Vec::new()),
            volatile_original_paths: std::sync::Mutex::new(HashMap::new()),
            malware_protocol_overridden: std::sync::atomic::AtomicBool::new(
                initial_malware_override,
            ),
            startup_deep_links: std::sync::Mutex::new(startup_deep_links),
            deep_link_listener_ready: std::sync::atomic::AtomicBool::new(false),
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            watchers::start_downloads_watch,
            watchers::stop_downloads_watch,
            update_active_game_schema,
            get_malware_protocol_override,
            set_malware_protocol_override,
            get_protocol_handler_preferences,
            set_protocol_handler_preferences,
            consume_startup_deep_links,
            get_workbench_files,
            get_workbench_catalog,
            resolve_workbench_target_config,
            list_local_installed_templates,
            scan_vault_themes,
            save_vault_theme,
            delete_vault_theme,
            scan_vault_lexicons,
            scan_bunker,
            scan_sandbox,
            import_to_sandbox,
            delete_local_file,
            open_folder,
            get_saved_coordinates,
            get_global_config,
            save_coordinates,
            sanitize_vault,
            auto_detect_paths,
            launch_game,
            launch_external_tool,
            airgap_saves,
            recover_interrupted_lab_airgap,
            get_airgap_status,
            record_save_doctor_manifest,
            check_save_doctor_prelaunch,
            get_lab_test_save_status,
            configure_lab_test_save,
            deploy_mod_for_lab_test,
            start_lab_verification_session,
            poll_lab_verification_session,
            stop_lab_verification_session,
            teardown_lab_sandbox_session,
            get_lab_certificates,
            verify_lab_certificate_seal,
            verify_lab_certificate_exists,
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
            get_quarantine_details,
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
            analyze_crash_autopsy,
            read_workspace_telemetry_log,
            clear_old_logs,
            write_os_log,
            generate_full_dna_hash,
            scan_installed_dlc,
            rip_game_version,
            read_blueprint,
            save_blueprint,
            get_mod_hidden_files,
            set_mod_hidden_files,
            ingest_dropped_file,
            commit_installer_wizard_session,
            cancel_installer_wizard_session,
            inspect_dropped_json_bundles,
            save_dropped_os_asset,
            import_external_mod_manager,
            extract_blueprint_mod_metadata,
            evaluate_blueprint_load_order_diagnostics,
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
            rename_file_with_history,
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
            poll_edge_manifests_batch,
            get_all_edge_manifests,
            export_edge_release,
            push_static_edge_manifest,
            get_edge_push_token,
            set_edge_push_token,
            download_and_ingest_direct_artifact,
            get_local_supporter_state,
            toggle_local_mason_follow,
            sync_mason_supporter_bridge,
            remove_local_mason_supporter,
            import_synced_supporter_vault,
            stack_local_dev_build_donation,
            download_and_install_update,
            native_webauthn_register,
            native_webauthn_authenticate,
            reveal_main_window,
            get_native_gamepad_state,
            open_steam_osk,
            inspect_cloud_sync_status,
            pin_cloud_folder_local_hydration,
            relocate_master_vault_with_consent,
            apply_cloud_sync_folder_exclusion,
            open_cloud_sync_provider_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                let items: Vec<String> = urls
                    .iter()
                    .filter_map(|u| sanitize_incoming_deep_link_arg(u.as_str()))
                    .collect();
                dispatch_runtime_deep_links(app_handle, items);
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = &event
            {
                reveal_main_window(app_handle.clone());
            }
            let _ = (app_handle, event);
        });
}
