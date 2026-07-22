#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod parser;
#[macro_use]
pub mod state;
#[macro_use]
pub mod utils;
#[macro_use]
pub mod watchers;
#[macro_use]
pub mod commands;
use crate::state::*;
use crate::utils::*;
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
use crate::watchers::*;

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
mod telemetry;
pub mod schema;
mod game_logic;
mod dbpf;

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

use rayon::prelude::*;
#[tauri::command]
fn test_package_scanner(_: String) -> Result<String, String> {
    Ok("Done".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            active_schema: std::sync::Mutex::new(None),
        })
        .manage(state::DownloadsWatcherState(std::sync::Mutex::new(None)))
        .manage(SecurityState {
            malware_hashes: std::sync::Mutex::new(Vec::new()),
            tier2_hashes: std::sync::Mutex::new(Vec::new()),
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
            get_sandbox_files,
            get_saved_coordinates,
            get_global_config,
            save_coordinates,
            sanitize_vault,
            auto_detect_paths,
            launch_game,
            airgap_saves,
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
            reset_coordinates,
            get_suggested_paths,
            get_quarantine_list,
            purge_quarantined_file,
            purge_external_file,
            restore_quarantined_file,
            trigger_emp,
            move_to_lab,
            purge_from_shelter,
            get_shelter_list,
            read_config_file,
            save_config_file,
            test_package_scanner,
            commission_mod,
            move_to_vault,
            set_mod_override,
            undo_mod_override,
            clear_overrides,
            get_overrides,
            get_config,
            update_config,
            scan_game_logs,
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
            overwrite_local_schema,
            telemetry::fetch_system_telemetry,
            telemetry::fetch_app_footprint,
            telemetry::get_directory_size])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
