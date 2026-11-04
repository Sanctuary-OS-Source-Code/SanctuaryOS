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

#[cfg(target_os = "linux")]
fn ensure_linux_desktop_integration() {
    use std::os::unix::fs::PermissionsExt;

    let home = match std::env::var("HOME") {
        Ok(h) if !h.trim().is_empty() => h,
        _ => return,
    };

    let exec_path = std::env::var("APPIMAGE")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        });
    let exec_path = match exec_path {
        Some(p) if !p.is_empty() => p,
        _ => return,
    };

    let icon_bytes = include_bytes!("../icons/128x128@2x.png");
    let icon_dirs = [
        format!("{}/.local/share/icons/hicolor/256x256/apps", home),
        format!("{}/.local/share/icons/hicolor/128x128/apps", home),
        format!("{}/.local/share/pixmaps", home),
    ];
    let primary_icon_path = format!(
        "{}/.local/share/icons/hicolor/256x256/apps/sanctuary-os.png",
        home
    );

    for dir in &icon_dirs {
        let _ = std::fs::create_dir_all(dir);
        let target = format!("{}/sanctuary-os.png", dir);
        let _ = std::fs::write(&target, icon_bytes);
    }

    if let Ok(meta) = std::fs::metadata(&exec_path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(&exec_path, perms);
    }

    let desktop_entry = format!(
        "[Desktop Entry]\nVersion=1.0\nType=Application\nName=Sanctuary OS\nComment=Sovereign Mod & Blueprint Operating System\nExec=\"{}\" %U\nTryExec={}\nIcon={}\nTerminal=false\nCategories=Game;Utility;\nStartupWMClass=SanctuaryOS\nStartupNotify=true\nX-KDE-SubstituteUID=false\n",
        exec_path, exec_path, primary_icon_path
    );

    let apps_dir = format!("{}/.local/share/applications", home);
    let _ = std::fs::create_dir_all(&apps_dir);
    let app_desktop_path = format!("{}/sanctuary-os.desktop", apps_dir);
    if std::fs::write(&app_desktop_path, &desktop_entry).is_ok() {
        if let Ok(meta) = std::fs::metadata(&app_desktop_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&app_desktop_path, perms);
        }
    }

    let user_desktop_dir = format!("{}/Desktop", home);
    if std::path::Path::new(&user_desktop_dir).is_dir() {
        let desktop_shortcut = format!("{}/Sanctuary OS.desktop", user_desktop_dir);
        if std::fs::write(&desktop_shortcut, &desktop_entry).is_ok() {
            if let Ok(meta) = std::fs::metadata(&desktop_shortcut) {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&desktop_shortcut, perms);
            }
            let _ = std::process::Command::new("gio")
                .args(["set", &desktop_shortcut, "metadata::trusted", "true"])
                .output();
        }
    }

    // Configure KDE Plasma / Dolphin (SteamOS Desktop Mode) to execute .AppImage and .desktop
    // launchers directly without the "Are you sure you want to execute this file?" prompt.
    let kiorc_path = format!("{}/.config/kiorc", home);
    let existing_kiorc = std::fs::read_to_string(&kiorc_path).unwrap_or_default();
    if !existing_kiorc.contains("behaviourOnLaunch=execute") {
        let updated_kiorc = if existing_kiorc.contains("[Executable scripts]") {
            existing_kiorc.replace(
                "[Executable scripts]",
                "[Executable scripts]\nbehaviourOnLaunch=execute",
            )
        } else if existing_kiorc.is_empty() {
            "[Executable scripts]\nbehaviourOnLaunch=execute\n".to_string()
        } else {
            format!(
                "{}\n[Executable scripts]\nbehaviourOnLaunch=execute\n",
                existing_kiorc.trim_end()
            )
        };
        let _ = std::fs::create_dir_all(format!("{}/.config", home));
        let _ = std::fs::write(&kiorc_path, updated_kiorc);
    }

    let _ = std::process::Command::new("update-desktop-database")
        .arg(&apps_dir)
        .output();
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

        // When running inside an Ubuntu-built AppImage on SteamOS / Arch / Fedora, AppRun puts
        // $APPDIR/usr/lib first in LD_LIBRARY_PATH, causing Ubuntu's older libwayland / libgbm /
        // libdrm / libEGL / libstdc++ to clash with the host's /usr/lib/dri/radeonsi_dri.so GPU
        // driver (falling back to slow CPU software rendering or failing with EGL_BAD_PARAMETER).
        // By preloading the host's native graphics/Wayland/C++ libraries and re-execing before
        // GTK/WebKit initializes, ld.so binds directly to the Steam Deck's native RDNA2 GPU stack.
        if is_appimage && std::env::var_os("SANCTUARY_APPIMAGE_REEXEC").is_none() {
            std::env::set_var("SANCTUARY_APPIMAGE_REEXEC", "1");
            if std::env::var_os("GDK_BACKEND").is_none() {
                std::env::set_var("GDK_BACKEND", "x11");
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
        #[cfg(target_os = "linux")]
        ensure_linux_desktop_integration();
    });

    tauri::Builder::default()
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
            reveal_main_window,
            get_native_gamepad_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
