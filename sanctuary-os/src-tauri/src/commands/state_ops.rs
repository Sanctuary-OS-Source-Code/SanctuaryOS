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
pub fn update_active_game_schema(schema: crate::schema::GameSchema, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.active_schema.lock().unwrap() = Some(schema);
    Ok(())
}

#[tauri::command]
pub fn get_global_config() -> SolderConfig {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Ok(config) = serde_json::from_value::<SolderConfig>(v.clone()) {
                if !config.workspaces.is_empty() {
                    return config;
                }
            }

            let live_path = v["live_path"].as_str().or(v["live_library_path"].as_str()).unwrap_or("").to_string();
            let mods_path = v["mods_path"].as_str().unwrap_or("").to_string();
            let vault_path = v["vault_path"].as_str().unwrap_or("").to_string();
            
            if !live_path.is_empty() || !mods_path.is_empty() || !vault_path.is_empty() {
                let default_workspace = WorkspaceConfig {
                    id: "default_workspace".to_string(),
                    name: "Default Game".to_string(),
                    schema_id: "sims4".to_string(),
                    live_path,
                    mods_path,
                    vault_path: vault_path.clone(),
                    engine_agency_level: v["engine_agency_level"].as_u64().map(|n| n as u32),
                    defcon_backup_target: v["defcon_backup_target"].as_u64().map(|n| n as u32),
                    backup_preference: v["backup_preference"].as_u64().map(|n| n as u32),
                    engine_retention_cycles: v["engine_retention_cycles"].as_u64().map(|n| n as u32),
                    world_retention_cycles: v["world_retention_cycles"].as_u64().map(|n| n as u32),
                    vault_capacity_gb: v["vault_capacity_gb"].as_u64().map(|n| n as u32),
                    timeline_retention_copies: v["timeline_retention_copies"].as_u64().map(|n| n as u32),
                    timeline_retention_size_mb: v["timeline_retention_size_mb"].as_u64().map(|n| n as u32),
                    supabase_url: None,
                    supabase_anon_key: None,
                };
                
                return SolderConfig {
                    active_workspace_id: Some("default_workspace".to_string()),
                    workspaces: vec![default_workspace],
                    live_path: None,
                    mods_path: None,
                    vault_path: Some(vault_path),
                };
            }
        }
    }
    SolderConfig::default()
}

#[tauri::command]
pub fn get_saved_coordinates() -> WorkspaceConfig {
    let global_config = get_global_config();
    let master_vault = global_config.vault_path.clone();
    let mut active_workspace = None;

    if let Some(active_id) = &global_config.active_workspace_id {
        if let Some(workspace) = global_config.workspaces.iter().find(|w| w.id == *active_id) {
            active_workspace = Some(workspace.clone());
        }
    }
    
    if active_workspace.is_none() {
        if let Some(workspace) = global_config.workspaces.first() {
            active_workspace = Some(workspace.clone());
        }
    }

    if let Some(mut workspace) = active_workspace {
        // Enforce Master OS Vault Architecture dynamically
        if let Some(mv) = master_vault {
            if !mv.is_empty() {
                let new_path = std::path::PathBuf::from(mv).join(&workspace.schema_id);
                workspace.vault_path = new_path.to_string_lossy().to_string();
            }
        }
        return workspace;
    }
    
    WorkspaceConfig::default()
}

#[tauri::command]
pub fn save_coordinates(config: SolderConfig) -> Result<String, String> {
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    
    let config_path = get_config_path();
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok("backend_locked".into())
}

#[tauri::command]
pub fn get_suggested_paths(state: tauri::State<'_, AppState>) -> WorkspaceConfig {
    let mut config = WorkspaceConfig::default();
    let game_schema = state.active_schema.lock().unwrap().clone();
    
    let default_mod = if let Some(schema) = &game_schema {
        schema.paths.default_mod_dir_windows.clone()
    } else {
        String::new()
    };

    if !default_mod.is_empty() {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let docs_path = std::path::Path::new(&profile).join(&default_mod);
            config.mods_path = docs_path.to_string_lossy().to_string();
        }
    }

    let possible_bins = if let Some(schema) = &game_schema {
        schema.paths.auto_scan_paths_windows.clone()
    } else {
        vec![]
    };

    for bin in &possible_bins {
        if std::path::Path::new(bin).exists() {
            config.live_path = bin.to_string();
            break;
        }
    }

    if config.live_path.is_empty() && !possible_bins.is_empty() {
        config.live_path = possible_bins[0].clone();
    }

    config
}

#[tauri::command]
pub fn reset_coordinates() -> String {
    "Reset".into()
}

#[tauri::command]
pub fn auto_detect_paths(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let mut live_path = String::new();
    let mut mods_path = String::new();
    let mut vault_path = String::new();
    let game_schema = state.active_schema.lock().unwrap().clone();

    let default_mod = game_schema.as_ref().map(|s| s.paths.default_mod_dir_windows.clone()).unwrap_or_default();

    if let Ok(profile) = std::env::var("USERPROFILE") {
        let docs = std::path::Path::new(&profile);
        let ts4_mods = docs.join(&default_mod);
        if ts4_mods.exists() {
            mods_path = ts4_mods.to_string_lossy().to_string();
        }
    }

    let search_paths = if let Some(schema) = &game_schema {
        schema.paths.auto_scan_paths_windows.clone()
    } else {
        vec![]
    };

    for p in search_paths {
        if std::path::Path::new(&p).exists() {
            live_path = p.to_string();
            break;
        }
    }

    serde_json::json!({
        "live_path": live_path,
        "mods_path": mods_path,
        "vault_path": vault_path
    })
}

