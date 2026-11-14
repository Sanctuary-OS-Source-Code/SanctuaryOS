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

fn resolve_spoke_vault_subdir(master_root: &std::path::Path, schema_id: &str) -> std::path::PathBuf {
    let trimmed = schema_id.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default_schema") {
        return master_root.to_path_buf();
    }
    if let Ok(entries) = fs::read_dir(master_root) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.eq_ignore_ascii_case(trimmed) {
                            return master_root.join(name);
                        }
                    }
                }
            }
        }
    }
    master_root.join(trimmed)
}

fn strip_spoke_suffix_from_master_vault(
    raw_master: &str,
    workspaces: &[WorkspaceConfig],
) -> String {
    let trimmed = raw_master.trim().trim_end_matches(&['/', '\\'][..]);
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
        return trimmed.to_string();
    }
    let path = std::path::Path::new(trimmed);
    if let Some(last_seg) = path.file_name().and_then(|n| n.to_str()) {
        let matches_workspace = workspaces.iter().any(|w| {
            (!w.schema_id.trim().is_empty() && w.schema_id.eq_ignore_ascii_case(last_seg))
                || (!w.id.trim().is_empty()
                    && !w.id.eq_ignore_ascii_case("default_workspace")
                    && w.id.eq_ignore_ascii_case(last_seg))
        });
        if matches_workspace {
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy().to_string();
                if !parent_str.trim().is_empty() {
                    return parent_str;
                }
            }
        }
    }
    trimmed.to_string()
}

fn normalize_solder_config(config: &mut SolderConfig, create_dirs: bool) -> bool {
    let mut healed = false;

    let raw_master = config
        .vault_path
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            config
                .workspaces
                .iter()
                .find_map(|w| w.master_vault_path.clone().filter(|s| !s.trim().is_empty()))
        })
        .or_else(|| {
            config
                .workspaces
                .iter()
                .find_map(|w| (!w.vault_path.trim().is_empty()).then(|| w.vault_path.clone()))
        });

    if let Some(raw_mv) = raw_master {
        let mv_trimmed = strip_spoke_suffix_from_master_vault(&raw_mv, &config.workspaces);
        if !mv_trimmed.is_empty() && !mv_trimmed.eq_ignore_ascii_case("web") {
            if config.vault_path.as_deref() != Some(mv_trimmed.as_str()) {
                config.vault_path = Some(mv_trimmed.clone());
                healed = true;
            }
            let mv_path = std::path::PathBuf::from(&mv_trimmed);
            if create_dirs {
                let _ = std::fs::create_dir_all(mv_path.join("Data").join("Themes"));
                let _ = std::fs::create_dir_all(mv_path.join("Data").join("Lexicons"));
            }

            for ws in config.workspaces.iter_mut() {
                if ws.master_vault_path.as_deref() != Some(mv_trimmed.as_str()) {
                    ws.master_vault_path = Some(mv_trimmed.clone());
                    healed = true;
                }
                let target_schema = if !ws.schema_id.trim().is_empty()
                    && ws.schema_id != "default_schema"
                {
                    ws.schema_id.trim()
                } else if !ws.id.trim().is_empty() && ws.id != "default_workspace" {
                    ws.id.trim()
                } else {
                    ""
                };
                if !target_schema.is_empty() {
                    let spoke_vp = resolve_spoke_vault_subdir(&mv_path, target_schema)
                        .to_string_lossy()
                        .to_string();
                    if ws.vault_path != spoke_vp {
                        ws.vault_path = spoke_vp;
                        healed = true;
                    }
                }
            }
        }
    }

    // Auto-heal any workspace whose live_path or mods_path was accidentally cloned from the primary workspace
    if config.workspaces.len() > 1 {
        let first_schema = config.workspaces[0].schema_id.to_lowercase();
        let first_live = config.workspaces[0].live_path.clone();
        let first_mods = config.workspaces[0].mods_path.clone();
        let first_docs = config.workspaces[0].docs_path.clone();
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
                if first_docs.is_some() && ws.docs_path == first_docs {
                    ws.docs_path = None;
                    healed = true;
                }
            }
        }
    }

    healed
}

#[tauri::command]
pub fn get_global_config() -> SolderConfig {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Ok(mut config) = serde_json::from_value::<SolderConfig>(v.clone()) {
                if !config.workspaces.is_empty() {
                    let _ = normalize_solder_config(&mut config, false);
                    return config;
                }
            }

            let live_path = v["live_path"]
                .as_str()
                .or(v["live_library_path"].as_str())
                .unwrap_or("")
                .to_string();
            let mods_path = v["mods_path"].as_str().unwrap_or("").to_string();
            let docs_path = v["docs_path"]
                .as_str()
                .or(v["user_data_path"].as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let vault_path = v["vault_path"].as_str().unwrap_or("").to_string();
            let schema_id = v["schema_id"]
                .as_str()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "default_schema".to_string());

            if !live_path.is_empty() || !mods_path.is_empty() || !vault_path.is_empty() {
                let default_workspace = WorkspaceConfig {
                    id: "default_workspace".to_string(),
                    name: "Default Game".to_string(),
                    schema_id,
                    live_path,
                    mods_path,
                    docs_path: docs_path.clone(),
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
                    docs_path,
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
                    docs_path: None,
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
        if let Some(mv) = master_vault {
            if !mv.is_empty() {
                workspace.master_vault_path = Some(mv.clone());
                let mv_path = std::path::PathBuf::from(&mv);
                let new_path = resolve_spoke_vault_subdir(&mv_path, &workspace.schema_id);
                workspace.vault_path = new_path.to_string_lossy().to_string();
            }
        }
        if workspace.master_vault_path.is_none() && !workspace.vault_path.is_empty() {
            let resolved_master = strip_spoke_suffix_from_master_vault(
                &workspace.vault_path,
                &global_config.workspaces,
            );
            workspace.master_vault_path = Some(resolved_master);
        }
        if workspace.docs_path.as_ref().map_or(true, |d| d.trim().is_empty()) {
            workspace.docs_path = global_config
                .docs_path
                .as_ref()
                .map(|d| d.trim().to_string())
                .filter(|d| !d.is_empty());
        }
        return workspace;
    }

    WorkspaceConfig::default()
}

#[tauri::command]
pub fn save_coordinates(mut config: SolderConfig) -> Result<String, String> {
    normalize_solder_config(&mut config, true);
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    let config_path = get_config_path();
    crate::utils::atomic_write_bytes(&config_path, json.as_bytes())?;

    // Enforce backup storage capacity cap asynchronously whenever workspace settings are saved
    let workspaces_for_cap = config.workspaces.clone();
    std::thread::spawn(move || {
        for ws in &workspaces_for_cap {
            if ws.vault_capacity_gb.unwrap_or(0) > 0 {
                crate::utils::enforce_workspace_backup_capacity(ws);
            }
        }
    });

    Ok("backend_locked".into())
}

#[tauri::command]
pub async fn auto_detect_paths(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut live_path = String::new();
        let mut mods_path = String::new();
        let mut docs_path = String::new();
        let mut vault_path = String::new();

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
            if let Some(schema) = &game_schema {
                if let Ok(volumes) = std::fs::read_dir("/Volumes") {
                    for vol in volumes.flatten() {
                        let vol_path = vol.path();
                        if vol_path.is_dir() {
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
            let expanded_p =
                crate::game_logic::expand_schema_path_for_os(&raw_p, &game_schema, None);
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
            .filter(|s| !s.trim().is_empty())
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
            } else if cfg!(target_os = "linux") {
                if let Some(ref res) = steam_resolution {
                    if let Some(ref pfx_user) = res.compatdata_pfx_user_dir {
                        let rel_mod = default_mod_raw
                            .replace('\\', "/")
                            .trim_start_matches('/')
                            .to_string();
                        let candidate = if rel_mod.to_lowercase().starts_with("documents/") {
                            pfx_user.join(&rel_mod)
                        } else {
                            pfx_user.join("Documents").join(&rel_mod)
                        };
                        if candidate.exists() || std::fs::create_dir_all(&candidate).is_ok() {
                            mods_path = candidate.to_string_lossy().to_string();
                        }
                    }
                }
            }
            if mods_path.is_empty() {
                if let Ok(profile) =
                    std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME"))
                {
                    let docs = std::path::Path::new(&profile);
                    let user_mods = docs.join(&expanded_mod);
                    if user_mods.exists() {
                        mods_path = user_mods.to_string_lossy().to_string();
                    }
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

        if let Some(schema) = &game_schema {
            if let Some(raw_user_data) = crate::game_logic::select_os_user_data_dir(&schema.paths) {
                let expanded_ud = crate::game_logic::expand_schema_path_for_os(
                    raw_user_data,
                    &game_schema,
                    if !live_path.is_empty() {
                        Some(&live_path)
                    } else if !mods_path.is_empty() {
                        Some(&mods_path)
                    } else {
                        None
                    },
                );
                let mut ud_path = std::path::PathBuf::from(&expanded_ud);
                if ud_path.is_relative() {
                    if let Some(home) = std::env::var("USERPROFILE")
                        .or_else(|_| std::env::var("HOME"))
                        .ok()
                        .map(std::path::PathBuf::from)
                        .or_else(dirs::home_dir)
                    {
                        ud_path = home.join(ud_path);
                    }
                }
                if ud_path.exists() {
                    docs_path = ud_path.to_string_lossy().to_string();
                }
            }
        }

        // Populate a default Vault path if none is configured yet
        let global_cfg = get_global_config();
        let schema_folder = game_schema
            .as_ref()
            .and_then(|s| {
                let gid = s.game_id.trim();
                if !gid.is_empty() && gid != "default_schema" {
                    Some(gid.to_string())
                } else {
                    s.id.clone()
                        .filter(|id| !id.trim().is_empty() && id != "default_schema")
                }
            })
            .or_else(|| global_cfg.active_workspace_id.clone())
            .unwrap_or_else(|| "default_workspace".to_string());

        if let Some(ref master_vault) = global_cfg.vault_path {
            let cleaned =
                strip_spoke_suffix_from_master_vault(master_vault, &global_cfg.workspaces);
            if !cleaned.is_empty() {
                vault_path = cleaned;
            }
        }
        if vault_path.is_empty() {
            if let Some(existing_ws) = global_cfg.workspaces.iter().find(|w| {
                w.id.eq_ignore_ascii_case(&schema_folder)
                    || w.schema_id.eq_ignore_ascii_case(&schema_folder)
            }) {
                if let Some(ref mv) = existing_ws.master_vault_path {
                    let cleaned = strip_spoke_suffix_from_master_vault(mv, &global_cfg.workspaces);
                    if !cleaned.is_empty() {
                        vault_path = cleaned;
                    }
                }
                if vault_path.is_empty() && !existing_ws.vault_path.trim().is_empty() {
                    vault_path = strip_spoke_suffix_from_master_vault(
                        &existing_ws.vault_path,
                        &global_cfg.workspaces,
                    );
                }
            }
        }
        if vault_path.is_empty() {
            if let Some(home) = std::env::var("HOME")
                .ok()
                .map(std::path::PathBuf::from)
                .or_else(dirs::home_dir)
            {
                let default_master = home.join("SanctuaryVault");
                let default_spoke = default_master.join(&schema_folder);
                let _ = std::fs::create_dir_all(&default_spoke);
                vault_path = default_master.to_string_lossy().to_string();
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

        Ok(serde_json::json!({
            "live_path": live_path,
            "mods_path": mods_path,
            "docs_path": docs_path,
            "vault_path": vault_path,
            "master_vault_path": vault_path,
            "steam_app_id": steam_app_id,
            "proton_prefix": proton_prefix
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
