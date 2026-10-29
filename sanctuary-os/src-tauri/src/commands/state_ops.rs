use crate::state::*;
use crate::utils::*;
use std::fs;

#[tauri::command]
pub fn update_active_game_schema(
    schema: crate::schema::GameSchema,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    *state.active_schema.lock().unwrap_or_else(|e| e.into_inner()) = Some(schema);
    Ok(())
}

#[tauri::command]
pub fn get_global_config() -> SolderConfig {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Ok(mut config) = serde_json::from_value::<SolderConfig>(v.clone()) {
                if !config.workspaces.is_empty() {
                    // Auto-heal any workspace whose live_path or mods_path was accidentally cloned from the primary workspace
                    if config.workspaces.len() > 1 {
                        let first_schema = config.workspaces[0].schema_id.to_lowercase();
                        let first_live = config.workspaces[0].live_path.clone();
                        let first_mods = config.workspaces[0].mods_path.clone();
                        let mut healed = false;
                        for ws in config.workspaces.iter_mut().skip(1) {
                            if ws.schema_id.to_lowercase() != first_schema {
                                if !first_live.is_empty() && ws.live_path == first_live {
                                    ws.live_path.clear();
                                    healed = true;
                                }
                                if !first_mods.is_empty() && ws.mods_path == first_mods {
                                    ws.mods_path.clear();
                                    healed = true;
                                }
                            }
                        }
                        if healed {
                            if let Ok(healed_json) = serde_json::to_string_pretty(&config) {
                                let _ = fs::write(&path, healed_json);
                            }
                        }
                    }
                    return config;
                }
            }

            let live_path = v["live_path"]
                .as_str()
                .or(v["live_library_path"].as_str())
                .unwrap_or("")
                .to_string();
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
                    master_vault_path: Some(vault_path.clone()),
                    engine_agency_level: v["engine_agency_level"].as_u64().map(|n| n as u32),
                    defcon_backup_target: v["defcon_backup_target"].as_u64().map(|n| n as u32),
                    backup_preference: v["backup_preference"].as_u64().map(|n| n as u32),
                    engine_retention_cycles: v["engine_retention_cycles"]
                        .as_u64()
                        .map(|n| n as u32),
                    world_retention_cycles: v["world_retention_cycles"].as_u64().map(|n| n as u32),
                    vault_capacity_gb: v["vault_capacity_gb"].as_u64().map(|n| n as u32),
                    timeline_retention_copies: v["timeline_retention_copies"]
                        .as_u64()
                        .map(|n| n as u32),
                    timeline_retention_size_mb: v["timeline_retention_size_mb"]
                        .as_u64()
                        .map(|n| n as u32),
                    supabase_url: None,
                    supabase_anon_key: None,
                    ingest_file_mode: v["ingest_file_mode"].as_str().map(|s| s.to_string()),
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
        let trimmed_id = active_id.trim();
        if !trimmed_id.is_empty() {
            if let Some(workspace) = global_config.workspaces.iter().find(|w| {
                w.id.eq_ignore_ascii_case(trimmed_id)
                    || w.schema_id.eq_ignore_ascii_case(trimmed_id)
            }) {
                active_workspace = Some(workspace.clone());
            } else if trimmed_id.eq_ignore_ascii_case("default_workspace") {
                if let Some(workspace) = global_config.workspaces.first() {
                    active_workspace = Some(workspace.clone());
                }
            } else {
                // Never leak another spoke's paths into an unconfigured workspace
                active_workspace = Some(WorkspaceConfig {
                    id: trimmed_id.to_string(),
                    name: trimmed_id.to_string(),
                    schema_id: trimmed_id.to_string(),
                    live_path: String::new(),
                    mods_path: String::new(),
                    vault_path: String::new(),
                    ..WorkspaceConfig::default()
                });
            }
        }
    }

    if active_workspace.is_none() {
        if let Some(workspace) = global_config.workspaces.first() {
            active_workspace = Some(workspace.clone());
        }
    }

    if let Some(mut workspace) = active_workspace {
        // Enforce Master OS Vault Architecture dynamically:
        // Shared Themes & Lexicons live in <MasterVault>/Data/{Themes,Lexicons} (one level above spokes),
        // while each Spoke workspace lives in <MasterVault>/<schema_id>.
        if let Some(mv) = master_vault {
            if !mv.is_empty() {
                workspace.master_vault_path = Some(mv.clone());
                let mv_path = std::path::PathBuf::from(&mv);
                let _ = std::fs::create_dir_all(mv_path.join("Data").join("Themes"));
                let _ = std::fs::create_dir_all(mv_path.join("Data").join("Lexicons"));
                let new_path = mv_path.join(&workspace.schema_id);
                workspace.vault_path = new_path.to_string_lossy().to_string();
            }
        }
        if workspace.master_vault_path.is_none() && !workspace.vault_path.is_empty() {
            let vp = std::path::PathBuf::from(&workspace.vault_path);
            let resolved_master = if vp
                .file_name()
                .and_then(|n| n.to_str())
                .map_or(false, |name| {
                    name.eq_ignore_ascii_case(&workspace.schema_id)
                        || name.eq_ignore_ascii_case(&workspace.id)
                }) {
                vp.parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| workspace.vault_path.clone())
            } else {
                workspace.vault_path.clone()
            };
            workspace.master_vault_path = Some(resolved_master);
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
pub fn auto_detect_paths(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let mut live_path = String::new();
    let mut mods_path = String::new();
    let vault_path = String::new();
    let game_schema = state.active_schema.lock().unwrap().clone();

    let mut search_paths = if let Some(schema) = &game_schema {
        if cfg!(target_os = "linux") {
            let mut list = schema.paths.auto_scan_paths_linux.clone();
            for wp in &schema.paths.auto_scan_paths_windows {
                if !list.contains(wp) {
                    list.push(wp.clone());
                }
            }
            list
        } else if cfg!(target_os = "macos") {
            let mut list = schema.paths.auto_scan_paths_mac.clone();
            for wp in &schema.paths.auto_scan_paths_windows {
                if !list.contains(wp) {
                    list.push(wp.clone());
                }
            }
            list
        } else {
            schema.paths.auto_scan_paths_windows.clone()
        }
    } else {
        vec![]
    };

    // Resolve Steam libraryfolders.vdf & Proton compatdata prefix across Windows, macOS, Linux & SteamOS
    let steam_resolution =
        crate::game_logic::resolve_steam_app_and_proton_prefix(&game_schema, None);
    if let Some(ref res) = steam_resolution {
        if let Some(ref install_dir) = res.install_dir {
            let install_str = install_dir.to_string_lossy().to_string();
            if !search_paths.contains(&install_str) {
                search_paths.insert(0, install_str);
            }
        }
    }

    // Expand Steam library roots from libraryfolders.vdf for any steamapps/common/<Folder> targets
    let steam_libs = crate::game_logic::discover_steam_libraries();
    if !steam_libs.is_empty() {
        let mut extra_steam_paths = Vec::new();
        for raw_p in &search_paths {
            let norm = raw_p.replace('\\', "/");
            if let Some(idx) = norm.to_lowercase().find("steamapps/common/") {
                let rel_after_common = &norm[idx + "steamapps/common/".len()..];
                if !rel_after_common.is_empty() {
                    for lib in &steam_libs {
                        let candidate = lib
                            .join("steamapps")
                            .join("common")
                            .join(rel_after_common)
                            .to_string_lossy()
                            .to_string();
                        if !search_paths.contains(&candidate)
                            && !extra_steam_paths.contains(&candidate)
                        {
                            extra_steam_paths.push(candidate);
                        }
                    }
                }
            }
        }
        search_paths.extend(extra_steam_paths);
    }

    if cfg!(target_os = "macos") {
        if crate::game_logic::is_sims4_schema(&game_schema) {
            for default_mac_p in [
                "/Applications/The Sims 4.app",
                "~/Applications/The Sims 4.app",
                "/Applications/EA Games/The Sims 4.app",
                "~/Applications/EA Games/The Sims 4.app",
                "~/Library/Application Support/Steam/steamapps/common/The Sims 4",
            ] {
                if !search_paths.iter().any(|p| p == default_mac_p) {
                    search_paths.push(default_mac_p.to_string());
                }
            }
        }
        if let Ok(volumes) = std::fs::read_dir("/Volumes") {
            for vol in volumes.flatten() {
                let vol_path = vol.path();
                if vol_path.is_dir() {
                    if crate::game_logic::is_sims4_schema(&game_schema) {
                        for rel in [
                            "The Sims 4.app",
                            "Applications/The Sims 4.app",
                            "EA Games/The Sims 4.app",
                            "SteamLibrary/steamapps/common/The Sims 4",
                        ] {
                            let candidate = vol_path.join(rel).to_string_lossy().to_string();
                            if !search_paths.contains(&candidate) {
                                search_paths.push(candidate);
                            }
                        }
                    } else if let Some(schema) = &game_schema {
                        for exe_name in &schema.executable_names {
                            if exe_name.ends_with(".app") {
                                let candidate =
                                    vol_path.join(exe_name).to_string_lossy().to_string();
                                if !search_paths.contains(&candidate) {
                                    search_paths.push(candidate);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    for raw_p in search_paths {
        let expanded_p = crate::game_logic::expand_schema_path_for_os(&raw_p, &game_schema, None);
        let p_path = std::path::Path::new(&expanded_p);
        if p_path.exists() {
            let has_exe = game_schema
                .as_ref()
                .map(|s| {
                    s.executable_names.is_empty()
                        || crate::game_logic::resolve_executable_path(&expanded_p, &game_schema)
                            .is_some()
                })
                .unwrap_or(true);
            if has_exe {
                live_path = expanded_p;
                break;
            }
        }
    }

    if let Some(default_mods) = crate::game_logic::get_default_mods_folder(&game_schema) {
        if default_mods.exists() {
            mods_path = default_mods.to_string_lossy().to_string();
        }
    }

    let default_mod_raw = game_schema
        .as_ref()
        .map(|s| crate::game_logic::select_os_default_mod_dir(&s.paths).to_string())
        .unwrap_or_default();

    if mods_path.is_empty() && !default_mod_raw.is_empty() {
        let expanded_mod = crate::game_logic::expand_schema_path_for_os(
            &default_mod_raw,
            &game_schema,
            if live_path.is_empty() {
                None
            } else {
                Some(&live_path)
            },
        );
        let exp_path = std::path::Path::new(&expanded_mod);
        if exp_path.is_absolute() && exp_path.exists() {
            mods_path = exp_path.to_string_lossy().to_string();
        } else if let Ok(profile) =
            std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME"))
        {
            let docs = std::path::Path::new(&profile);
            let user_mods = docs.join(&expanded_mod);
            if user_mods.exists() {
                mods_path = user_mods.to_string_lossy().to_string();
            }
        }
        if mods_path.is_empty() && !live_path.is_empty() {
            let engine_root =
                crate::game_logic::resolve_game_engine_root(&live_path, &game_schema);
            if default_mod_raw == "." {
                mods_path = engine_root.to_string_lossy().to_string();
            } else {
                let engine_mods = engine_root.join(&expanded_mod);
                if engine_mods.exists() {
                    mods_path = engine_mods.to_string_lossy().to_string();
                }
            }
        }
    }

    let steam_app_id = steam_resolution
        .as_ref()
        .map(|r| r.app_id.clone())
        .or_else(|| crate::game_logic::default_steam_app_id(&game_schema))
        .unwrap_or_default();
    let proton_prefix = steam_resolution
        .and_then(|r| r.compatdata_pfx_user_dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    serde_json::json!({
        "live_path": live_path,
        "mods_path": mods_path,
        "vault_path": vault_path,
        "steam_app_id": steam_app_id,
        "proton_prefix": proton_prefix
    })
}
