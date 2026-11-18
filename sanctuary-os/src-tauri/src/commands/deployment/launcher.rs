use crate::commands::state_ops::*;
use crate::state::*;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use super::airgap::*;
use super::lab_session::*;
use super::playset_deploy::*;

pub(super) static SANCTUARY_RUNTIME_INSTANCE_ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub(super) fn get_runtime_instance_id() -> &'static str {
    SANCTUARY_RUNTIME_INSTANCE_ID
        .get_or_init(|| uuid::Uuid::new_v4().to_string())
        .as_str()
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
pub(super) struct LaunchedGameInfo {
    pub(super) pid: Option<u32>,
    pub(super) exe_name: String,
    pub(super) live_root_norm: String,
    pub(super) launched_at_epoch: u64,
}

pub(super) static LAST_LAUNCHED_GAME_INFO: std::sync::OnceLock<std::sync::Mutex<Option<LaunchedGameInfo>>> =
    std::sync::OnceLock::new();

pub(super) fn record_launched_game_info(pid: Option<u32>, exe_path: &Path, live_root: &Path) {
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let live_root_norm = crate::utils::normalize_path_key(live_root);
    let launched_at_epoch = current_epoch_secs();
    let mutex = LAST_LAUNCHED_GAME_INFO.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = Some(LaunchedGameInfo {
            pid,
            exe_name,
            live_root_norm,
            launched_at_epoch,
        });
    }
}

pub(super) fn sanitize_game_spawn_env(cmd: &mut std::process::Command) {
    // Never leak Sanctuary AppImage WebKit host library preloads or open stdio pipes into game processes, launchers, or anti-cheats
    cmd.env_remove("LD_PRELOAD")
        .env_remove("SANCTUARY_APPIMAGE_REEXEC")
        .env_remove("SANCTUARY_REAL_APPIMAGE")
        .env_remove("GDK_BACKEND")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
}

pub fn purge_stale_caches_in_docs(
    root: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !root.exists()
        || !root.is_dir()
        || !crate::utils::is_safe_user_file_path(&root.join("__sanctuary_probe__"))
    {
        return;
    }

    let saved_coords = get_saved_coordinates();
    let allowed = [root.to_path_buf()];
    let mut dirs_to_remove: Vec<PathBuf> = Vec::new();

    let walker = walkdir::WalkDir::new(root)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let lower = e.file_name().to_string_lossy().to_lowercase();
            if e.file_type().is_dir()
                && (lower.starts_with(".sanctuary")
                    || lower == ".lab_save_vault"
                    || lower == ".git")
            {
                return false;
            }
            if crate::utils::is_protected_save_or_airgap_path(e.path(), &saved_coords, game_schema) {
                return false;
            }
            true
        });

    for entry in walker.flatten() {
        if entry.depth() == 0 {
            continue;
        }
        let full_path = entry.path().to_path_buf();
        let rel_str = full_path
            .strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");

        if entry.file_type().is_file() {
            if crate::game_logic::is_exception_log(game_schema, &rel_str)
                || crate::game_logic::is_cache_file(game_schema, &rel_str)
            {
                if crate::utils::ensure_strict_descendant_of_roots(&full_path, &allowed).is_ok() {
                    let _ = std::fs::remove_file(&full_path);
                }
            }
        } else if entry.file_type().is_dir()
            && crate::game_logic::is_cache_file(game_schema, &rel_str)
            && crate::utils::ensure_strict_descendant_of_roots(&full_path, &allowed).is_ok()
        {
            dirs_to_remove.push(full_path);
        }
    }

    for cache_dir in dirs_to_remove {
        let _ = std::fs::remove_dir_all(cache_dir);
    }
}

pub(super) fn is_blocked_shell_or_interpreter_binary(exe_path: &Path) -> bool {
    let file_name_lower = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let stem_lower = exe_path
        .file_stem()
        .and_then(|n| n.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let blocked_names = [
        "cmd",
        "cmd.exe",
        "powershell",
        "powershell.exe",
        "pwsh",
        "pwsh.exe",
        "wscript",
        "wscript.exe",
        "cscript",
        "cscript.exe",
        "mshta",
        "mshta.exe",
        "rundll32",
        "rundll32.exe",
        "regsvr32",
        "regsvr32.exe",
        "certutil",
        "certutil.exe",
        "bitsadmin",
        "bitsadmin.exe",
        "wsl",
        "wsl.exe",
        "msbuild",
        "msbuild.exe",
        "installutil",
        "installutil.exe",
        "conhost",
        "conhost.exe",
        "sh",
        "bash",
        "zsh",
        "dash",
        "ksh",
        "csh",
        "osascript",
        "open",
        "xdg-open",
        "python",
        "python3",
        "node",
        "perl",
        "ruby",
    ];
    blocked_names.contains(&file_name_lower.as_str()) || blocked_names.contains(&stem_lower.as_str())
}

pub(super) fn sanitize_launch_args_list(raw_args: Vec<String>) -> Result<Vec<String>, String> {
    let mut cleaned = Vec::new();
    for arg in raw_args {
        let trimmed = arg.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().any(|c| {
            matches!(c, '\0' | '\r' | '\n' | '&' | '|' | ';' | '`' | '<' | '>')
        }) || trimmed.contains("$(")
        {
            return Err("Blocked unsafe control characters in launch arguments.".to_string());
        }
        cleaned.push(trimmed.to_string());
    }
    Ok(cleaned)
}

pub(super) fn resolve_custom_script_extender_exe(
    live_root: &Path,
    default_exe: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<(PathBuf, Vec<String>)> {
    let tools = game_schema.as_ref()?.external_tools.as_ref()?;
    let canon_live_root = crate::utils::resolve_canonical_target(live_root).ok()?;
    for tool_val in tools {
        let Some(obj) = tool_val.as_object() else {
            continue;
        };
        let role = obj
            .get("role")
            .or_else(|| obj.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_lowercase();
        let auto_launch = obj
            .get("auto_launch")
            .or_else(|| obj.get("use_as_launcher"))
            .or_else(|| obj.get("is_script_extender"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if role != "script_extender" && !auto_launch {
            continue;
        }

        let rel_or_exe = obj
            .get("executable")
            .or_else(|| obj.get("exe"))
            .or_else(|| obj.get("path"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())?;

        let rel_path = Path::new(rel_or_exe);
        if rel_path.is_absolute()
            || rel_path.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::Prefix(_)
                )
            })
        {
            continue;
        }

        let raw_extra_args: Vec<String> = obj
            .get("args")
            .or_else(|| obj.get("launch_args"))
            .and_then(|v| {
                if let Some(arr) = v.as_array() {
                    Some(
                        arr.iter()
                            .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                            .filter(|s| !s.is_empty())
                            .collect(),
                    )
                } else {
                    v.as_str().map(|s| {
                        s.split_whitespace()
                            .map(|tok| tok.to_string())
                            .collect::<Vec<_>>()
                    })
                }
            })
            .unwrap_or_default();
        let Ok(extra_args) = sanitize_launch_args_list(raw_extra_args) else {
            continue;
        };

        let mut candidates = vec![live_root.join(rel_path)];
        if let Some(exe_parent) = default_exe.parent() {
            candidates.push(exe_parent.join(rel_path));
        }

        for cand in candidates {
            if !cand.is_file() {
                continue;
            }
            if is_blocked_shell_or_interpreter_binary(&cand) {
                continue;
            }
            if crate::utils::ensure_strict_descendant_of_roots(
                &cand,
                std::slice::from_ref(&canon_live_root),
            )
            .is_ok()
            {
                return Some((cand, extra_args));
            }
        }
    }
    None
}

pub(super) fn build_dlc_mask_launch_args(
    disabled_dlc: Option<Vec<String>>,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<String> {
    let Some(template) = game_schema
        .as_ref()
        .and_then(|s| s.launch_args_dlc_mask_template.as_deref())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    else {
        return Vec::new();
    };

    let codes: Vec<String> = disabled_dlc
        .or_else(|| {
            if vault_path.trim().is_empty() {
                return None;
            }
            let (raw, _) = crate::utils::get_vault_kv(vault_path, "disabled_dlc")?;
            serde_json::from_str::<Vec<String>>(&raw).ok()
        })
        .unwrap_or_default()
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty() && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'))
        .collect();

    if codes.is_empty() {
        return Vec::new();
    }

    let joined = codes.join(",");
    let formatted = template
        .replace("{dlc_list}", &joined)
        .replace("{packs}", &joined)
        .replace("{dlc}", &joined);

    formatted
        .split_whitespace()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub(super) static CLOUD_SESSION_CLEANUP_GEN: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

pub(super) fn spawn_post_game_symlink_cleanup_watcher(
    app_handle: tauri::AppHandle,
    vault_path: String,
    mods_path: String,
    game_schema: Option<crate::schema::GameSchema>,
    spawned_pid: Option<u32>,
) {
    let my_gen = CLOUD_SESSION_CLEANUP_GEN
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;
    std::thread::spawn(move || {
        let is_still_current = || {
            CLOUD_SESSION_CLEANUP_GEN.load(std::sync::atomic::Ordering::SeqCst) == my_gen
        };
        let is_spawned_pid_alive = |pid_opt: Option<u32>| -> bool {
            let Some(pid_u32) = pid_opt else {
                return false;
            };
            let mut sys = sysinfo::System::new();
            let spid = sysinfo::Pid::from_u32(pid_u32);
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::Some(&[spid]),
                true,
                passive_process_refresh_kind(),
            );
            sys.process(spid).is_some()
        };

        let started = std::time::Instant::now();
        let mut saw_running = is_spawned_pid_alive(spawned_pid)
            || is_any_game_process_running(&game_schema);

        // Wait up to 45s for launcher/extender handoff or main game process startup
        while started.elapsed() < std::time::Duration::from_secs(45) {
            if !is_still_current() {
                return;
            }
            if is_spawned_pid_alive(spawned_pid) || is_any_game_process_running(&game_schema) {
                saw_running = true;
            }
            // Wait at least 12s after ignition before declaring exit so launcher stubs don't trigger early cleanup
            if saw_running && started.elapsed() >= std::time::Duration::from_secs(12) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(2500));
        }

        if !saw_running && spawned_pid.is_none() {
            return;
        }

        // Wait until both the direct spawned PID and any schema/live-root game processes stay exited for 3 polls (9s)
        let mut quiet_streak = 0u8;
        loop {
            if !is_still_current() {
                return;
            }
            let running_now = is_spawned_pid_alive(spawned_pid)
                || is_any_game_process_running(&game_schema);
            if running_now {
                quiet_streak = 0;
            } else {
                quiet_streak = quiet_streak.saturating_add(1);
                if quiet_streak >= 3 {
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
        }

        if !is_still_current() {
            return;
        }
        // Never wipe symlinks if a Homestead Lab verification session is active
        let lab_active = LAB_SESSION
            .get()
            .and_then(|m| m.lock().ok())
            .map_or(false, |g| g.is_some());
        if lab_active {
            return;
        }

        cleanup_routed_links(&vault_path);
        let mods_dir = PathBuf::from(&mods_path);
        if mods_dir.exists() {
            if !vault_path.trim().is_empty() {
                crate::utils::safe_wipe_mods_dir_with_vault(
                    &mods_dir,
                    Some(&vault_path),
                    &game_schema,
                );
            } else {
                crate::utils::safe_wipe_mods_dir(&mods_dir, &game_schema);
            }
        }
        let _ = app_handle.emit(
            "sanctuary-cloud-session-mods-cleaned",
            serde_json::json!({ "mods_path": mods_path }),
        );
    });
}

#[tauri::command]
pub fn launch_game(
    live_path: String,
    mods_path: String,
    disabled_dlc: Option<Vec<String>>,
    auto_purge_caches: Option<bool>,
    cleanup_symlinks_on_exit: Option<bool>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = &state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let saved_coords = get_saved_coordinates();
    let doc_dir = if let Some(explicit_docs) = saved_coords
        .docs_path
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        PathBuf::from(explicit_docs)
    } else {
        crate::game_logic::resolve_user_data_root(&mods_path, game_schema)
    };

    // Automatically recover any stranded Save Airgap from a prior crashed Sanctuary OS session before launching
    let _ = recover_stranded_airgap_if_needed(&doc_dir, &saved_coords.vault_path, game_schema);

    if auto_purge_caches.unwrap_or(true) {
        purge_stale_caches_in_docs(&doc_dir, game_schema);
        purge_stale_caches_in_docs(std::path::Path::new(&mods_path), game_schema);
    }

    let default_exe_path = match crate::game_logic::resolve_executable_path(&live_path, game_schema) {
        Some(p) => p,
        None => return Err("backend_exe_not_found".to_string()),
    };
    let live_root = crate::game_logic::resolve_game_engine_root(&live_path, game_schema);

    let (exe_path, mut launch_args) =
        if let Some((extender_exe, extender_args)) =
            resolve_custom_script_extender_exe(&live_root, &default_exe_path, game_schema)
        {
            (extender_exe, extender_args)
        } else {
            (default_exe_path, Vec::new())
        };

    launch_args.extend(build_dlc_mask_launch_args(
        disabled_dlc,
        &saved_coords.vault_path,
        game_schema,
    ));

    let spawned_pid: Option<u32> = if cfg!(target_os = "macos")
        && exe_path
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("app"))
    {
        let mut open_cmd = std::process::Command::new("open");
        sanitize_game_spawn_env(&mut open_cmd);
        open_cmd.arg("-a").arg(&exe_path);
        if !launch_args.is_empty() {
            open_cmd.arg("--args").args(&launch_args);
        }
        open_cmd.spawn().map_err(|e| e.to_string())?;
        None
    } else {
        let parent_dir = exe_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        if cfg!(target_os = "linux")
            && exe_path
                .extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("exe"))
        {
            let resolved_steam =
                crate::game_logic::resolve_steam_app_and_proton_prefix(game_schema, Some(&live_path));
            let steam_app_id = resolved_steam
                .as_ref()
                .map(|r| r.app_id.clone())
                .filter(|id| !id.trim().is_empty())
                .or_else(|| crate::game_logic::default_steam_app_id(game_schema));

            let mut launched_via_steam = false;
            if let Some(app_id) = steam_app_id {
                let mut steam_cmd = std::process::Command::new("steam");
                sanitize_game_spawn_env(&mut steam_cmd);
                steam_cmd.args(["-applaunch", &app_id]);
                if !launch_args.is_empty() {
                    steam_cmd.args(&launch_args);
                }
                if steam_cmd.spawn().is_ok() {
                    launched_via_steam = true;
                } else {
                    let mut xdg_cmd = std::process::Command::new("xdg-open");
                    sanitize_game_spawn_env(&mut xdg_cmd);
                    if launch_args.is_empty()
                        && xdg_cmd
                            .arg(format!("steam://rungameid/{}", app_id))
                            .spawn()
                            .is_ok()
                    {
                        launched_via_steam = true;
                    }
                }
            }

            if launched_via_steam {
                None
            } else {
                let mut wine_cmd = std::process::Command::new("wine");
                sanitize_game_spawn_env(&mut wine_cmd);
                wine_cmd.arg(&exe_path).args(&launch_args).current_dir(&parent_dir);
                if let Some(pfx_user) = resolved_steam
                    .and_then(|r| r.compatdata_pfx_user_dir)
                    .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&mods_path))
                {
                    // pfx_user is .../pfx/drive_c/users/steamuser -> pfx is 3 parents up
                    if let Some(pfx_root) =
                        pfx_user.parent().and_then(|u| u.parent()).and_then(|dc| dc.parent())
                    {
                        wine_cmd.env("WINEPREFIX", pfx_root);
                    }
                }
                let child = wine_cmd.spawn().map_err(|e| e.to_string())?;
                Some(child.id())
            }
        } else {
            let mut cmd = std::process::Command::new(&exe_path);
            sanitize_game_spawn_env(&mut cmd);
            let child = cmd
                .args(&launch_args)
                .current_dir(parent_dir)
                .spawn()
                .map_err(|e| e.to_string())?;
            Some(child.id())
        }
    };

    record_launched_game_info(spawned_pid, &exe_path, &live_root);
    if cleanup_symlinks_on_exit.unwrap_or(false) {
        spawn_post_game_symlink_cleanup_watcher(
            app_handle,
            saved_coords.vault_path.clone(),
            mods_path,
            game_schema.clone(),
            spawned_pid,
        );
    } else {
        CLOUD_SESSION_CLEANUP_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
    Ok("backend_ignition_started".to_string())
}


#[tauri::command]
pub fn launch_external_tool(
    tool_path: String,
    args: Option<Vec<String>>,
    docs_path: Option<String>,
    enforce_airgap: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let raw_exe_path = PathBuf::from(tool_path.trim());
    let is_app_bundle = raw_exe_path.is_dir()
        && raw_exe_path
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("app"));
    if !raw_exe_path.exists() || (!raw_exe_path.is_file() && !is_app_bundle) {
        return Err("backend_exe_not_found".to_string());
    }

    let ext_lower = raw_exe_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let allowed_ext = matches!(ext_lower.as_str(), "exe" | "app" | "appimage")
        || (cfg!(target_os = "linux") && ext_lower.is_empty());
    if !allowed_ext {
        return Err("Invalid or script-wrapper external tool extension.".to_string());
    }

    if is_blocked_shell_or_interpreter_binary(&raw_exe_path) {
        return Err("Blocked system shell or binary.".to_string());
    }

    let coords = get_saved_coordinates();
    let allowed_roots = crate::utils::get_allowed_workspace_roots(&coords);
    if allowed_roots.is_empty() {
        return Err("Blocked: No configured workspace roots to validate external tool.".into());
    }
    let exe_path = crate::utils::ensure_strict_descendant_of_roots(&raw_exe_path, &allowed_roots)?;
    let sanitized_args = sanitize_launch_args_list(args.unwrap_or_default())?;

    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let resolved_docs = docs_path.unwrap_or_default();
    if enforce_airgap.unwrap_or(true) {
        let _ = apply_save_airgap(&resolved_docs, true, &game_schema);
    }

    if cfg!(target_os = "macos") && is_app_bundle {
        let mut cmd = std::process::Command::new("open");
        sanitize_game_spawn_env(&mut cmd);
        cmd.arg("-a").arg(&exe_path);
        if !sanitized_args.is_empty() {
            cmd.arg("--args");
            for a in &sanitized_args {
                cmd.arg(a);
            }
        }
        return match cmd.spawn() {
            Ok(_) => Ok("backend_external_tool_started".to_string()),
            Err(e) => Err(e.to_string()),
        };
    }

    let parent_dir = exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    if cfg!(target_os = "linux") && ext_lower == "exe" {
        let mut wine_cmd = std::process::Command::new("wine");
        sanitize_game_spawn_env(&mut wine_cmd);
        wine_cmd.arg(&exe_path).current_dir(&parent_dir);
        if let Some(pfx_user) = crate::game_logic::resolve_steam_app_and_proton_prefix(
            &game_schema,
            Some(&resolved_docs),
        )
        .and_then(|r| r.compatdata_pfx_user_dir)
        .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&resolved_docs))
        {
            if let Some(pfx_root) = pfx_user
                .parent()
                .and_then(|u| u.parent())
                .and_then(|dc| dc.parent())
            {
                wine_cmd.env("WINEPREFIX", pfx_root);
            }
        }
        for a in &sanitized_args {
            wine_cmd.arg(a);
        }
        return match wine_cmd.spawn() {
            Ok(_) => Ok("backend_external_tool_started".to_string()),
            Err(e) => Err(e.to_string()),
        };
    }

    let mut cmd = std::process::Command::new(&exe_path);
    sanitize_game_spawn_env(&mut cmd);
    cmd.current_dir(parent_dir);
    for a in &sanitized_args {
        cmd.arg(a);
    }

    match cmd.spawn() {
        Ok(_) => Ok("backend_external_tool_started".to_string()),
        Err(e) => Err(e.to_string()),
    }
}
