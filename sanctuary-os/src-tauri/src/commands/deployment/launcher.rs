use crate::commands::state_ops::*;
use crate::state::*;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use super::airgap::*;
use super::lab_save_and_telemetry::current_epoch_secs;
use super::lab_types_and_audio::LAB_SESSION;
use super::playset_deploy::*;

const PROTON_OVERRIDE_BEGIN_MARKER: &str = "# BEGIN SANCTUARY OS DLL OVERRIDES";
const PROTON_OVERRIDE_END_MARKER: &str = "# END SANCTUARY OS DLL OVERRIDES";

fn sanitize_dll_override_token(raw: &str, allowed_extra: &[char]) -> String {
    raw.trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-' || allowed_extra.contains(c))
        .collect()
}

pub fn collect_wine_dll_overrides(
    schema: &Option<crate::schema::GameSchema>,
    mods_dir: &Path,
    live_root: &Path,
) -> Vec<(String, String)> {
    let mut dll_entries: Vec<(String, String)> = Vec::new();
    let mut push_override = |raw: &str| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return;
        }
        let (raw_stem, raw_mode) = match trimmed.split_once('=') {
            Some((lhs, rhs)) => (lhs.trim(), rhs.trim()),
            None => (trimmed, "n,b"),
        };
        let stem = sanitize_dll_override_token(
            raw_stem.trim_end_matches(".dll").trim_end_matches(".DLL"),
            &[],
        )
        .to_lowercase();
        let mode_sanitized = sanitize_dll_override_token(raw_mode, &[',']);
        let mode = if mode_sanitized.is_empty() {
            "n,b".to_string()
        } else {
            mode_sanitized
        };
        if !stem.is_empty() && !dll_entries.iter().any(|(s, _)| s == &stem) {
            dll_entries.push((stem, mode));
        }
    };
    if let Some(s) = schema.as_ref() {
        if let Some(overrides) = &s.wine_dll_overrides {
            for raw in overrides {
                push_override(raw);
            }
        }
        if let Some(routes) = &s.install_routes {
            for route in routes {
                if route.apply_wine_dll_override == Some(true) {
                    let check_dir = if route.target_subdir.trim().is_empty() {
                        live_root.to_path_buf()
                    } else {
                        crate::utils::resolve_case_insensitive_path(live_root, &route.target_subdir)
                    };
                    if let Some(names) = &route.file_names {
                        for n in names {
                            let stem = Path::new(n)
                                .file_stem()
                                .and_then(|st| st.to_str())
                                .unwrap_or_default()
                                .to_lowercase();
                            if !stem.is_empty()
                                && (check_dir.join(n).exists() || mods_dir.join(n).exists())
                            {
                                push_override(&stem);
                            }
                        }
                    }
                    if check_dir.is_dir() {
                        if let Ok(entries) = std::fs::read_dir(&check_dir) {
                            for entry in entries.flatten() {
                                let p = entry.path();
                                if p.extension()
                                    .and_then(|e| e.to_str())
                                    .map_or(false, |e| e.eq_ignore_ascii_case("dll"))
                                {
                                    if let Some(st) = p.file_stem().and_then(|s| s.to_str()) {
                                        push_override(st);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    dll_entries
}

fn strip_sanctuary_proton_block(existing: &str) -> (String, bool) {
    let mut kept_lines: Vec<&str> = Vec::new();
    let mut in_block = false;
    let mut had_block = false;
    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed == PROTON_OVERRIDE_BEGIN_MARKER {
            in_block = true;
            had_block = true;
            continue;
        }
        if in_block && trimmed == PROTON_OVERRIDE_END_MARKER {
            in_block = false;
            continue;
        }
        if !in_block {
            kept_lines.push(line);
        }
    }
    while kept_lines.last().map_or(false, |l| l.trim().is_empty()) {
        kept_lines.pop();
    }
    (kept_lines.join("\n"), had_block)
}

/// Manages Sanctuary OS's `# BEGIN SANCTUARY OS DLL OVERRIDES` block in Proton `user_settings.py`
/// while preserving any user-defined `user_settings` keys outside the managed markers.
pub fn sync_proton_user_settings_overrides(
    compat_app_dir: &Path,
    dll_entries: &[(String, String)],
) -> Result<bool, String> {
    if !compat_app_dir.is_dir() {
        return Ok(false);
    }
    let user_settings_path = compat_app_dir.join("user_settings.py");
    let existing = if user_settings_path.is_file() {
        std::fs::read_to_string(&user_settings_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };

    let (base_content, had_block) = strip_sanctuary_proton_block(&existing);
    let sanitized_tokens: Vec<String> = dll_entries
        .iter()
        .filter_map(|(stem, mode)| {
            let s = sanitize_dll_override_token(stem, &[]).to_lowercase();
            let m = sanitize_dll_override_token(mode, &[',']);
            if s.is_empty() {
                None
            } else {
                let effective_mode = if m.is_empty() { "n,b" } else { m.as_str() };
                Some(format!("\"{}={}\"", s, effective_mode))
            }
        })
        .collect();

    if sanitized_tokens.is_empty() {
        if !user_settings_path.exists() || !had_block {
            return Ok(false);
        }
        if base_content.trim().is_empty() {
            std::fs::remove_file(&user_settings_path).map_err(|e| e.to_string())?;
        } else {
            let output = format!("{}\n", base_content);
            std::fs::write(&user_settings_path, output).map_err(|e| e.to_string())?;
        }
        return Ok(true);
    }

    let managed_block = format!(
        "{begin}\nuser_settings = globals().get(\"user_settings\", {{}})\n_sanctuary_overrides = [{tokens}]\n_existing_overrides = [p.strip() for p in user_settings.get(\"WINEDLLOVERRIDES\", \"\").split(\";\") if p.strip()]\nfor _ov in _sanctuary_overrides:\n    _stem = _ov.split(\"=\", 1)[0].strip().lower()\n    if not any(e.split(\"=\", 1)[0].strip().lower() == _stem for e in _existing_overrides):\n        _existing_overrides.append(_ov)\nif _existing_overrides:\n    user_settings[\"WINEDLLOVERRIDES\"] = \";\".join(_existing_overrides)\n{end}\n",
        begin = PROTON_OVERRIDE_BEGIN_MARKER,
        tokens = sanitized_tokens.join(", "),
        end = PROTON_OVERRIDE_END_MARKER,
    );

    let next_content = if base_content.trim().is_empty() {
        managed_block
    } else {
        format!("{}\n\n{}", base_content, managed_block)
    };

    if next_content == existing {
        return Ok(false);
    }
    std::fs::write(&user_settings_path, next_content).map_err(|e| e.to_string())?;
    Ok(true)
}

fn proton_pfx_root_from_user_dir(pfx_user: &Path) -> Option<PathBuf> {
    pfx_user
        .parent()
        .and_then(|u| u.parent())
        .and_then(|dc| dc.parent())
        .map(|pfx| pfx.to_path_buf())
}

fn proton_compat_app_dir_from_user_dir(pfx_user: &Path) -> Option<PathBuf> {
    proton_pfx_root_from_user_dir(pfx_user)
        .and_then(|pfx| pfx.parent().map(|compat| compat.to_path_buf()))
}

fn parse_proton_script_from_config_info(compat_app_dir: &Path) -> Option<PathBuf> {
    let config_info_path = compat_app_dir.join("config_info");
    let raw = std::fs::read_to_string(&config_info_path).ok()?;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Only treat path-like lines (ignore timestamps/version headers on line 1)
        if !trimmed.contains('/') && !trimmed.contains('\\') {
            continue;
        }
        let mut cursor = Some(Path::new(trimmed));
        for _ in 0..=4 {
            let Some(dir) = cursor else {
                break;
            };
            let proton_script = dir.join("proton");
            if proton_script.is_file() {
                return Some(proton_script);
            }
            cursor = dir.parent();
        }
    }
    None
}

pub(crate) fn resolve_proton_runner_for_prefix(
    compat_app_dir: Option<&Path>,
    steam_libraries: &[PathBuf],
) -> Option<PathBuf> {
    if let Some(dir) = compat_app_dir {
        if let Some(exact) = parse_proton_script_from_config_info(dir) {
            return Some(exact);
        }
    }

    let mut compat_dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        compat_dirs.push(home.join(".steam").join("root").join("compatibilitytools.d"));
        compat_dirs.push(
            home.join(".local")
                .join("share")
                .join("Steam")
                .join("compatibilitytools.d"),
        );
        compat_dirs.push(
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join("data")
                .join("Steam")
                .join("compatibilitytools.d"),
        );
    }
    for lib in steam_libraries {
        compat_dirs.push(lib.join("compatibilitytools.d"));
        compat_dirs.push(lib.join("steamapps").join("compatibilitytools.d"));
    }

    let mut custom_runners: Vec<(String, PathBuf)> = Vec::new();
    for compat_dir in compat_dirs {
        if let Ok(entries) = std::fs::read_dir(&compat_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let proton_script = p.join("proton");
                if p.is_dir() && proton_script.is_file() {
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    custom_runners.push((name, proton_script));
                }
            }
        }
    }
    if !custom_runners.is_empty() {
        custom_runners.sort_by(|a, b| {
            let a_ge = a.0.starts_with("ge-proton");
            let b_ge = b.0.starts_with("ge-proton");
            b_ge.cmp(&a_ge).then_with(|| b.0.cmp(&a.0))
        });
        if let Some((_, best)) = custom_runners.into_iter().next() {
            return Some(best);
        }
    }

    let mut official_runners: Vec<(String, PathBuf)> = Vec::new();
    for lib in steam_libraries {
        let common_dir = lib.join("steamapps").join("common");
        if let Ok(entries) = std::fs::read_dir(&common_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let name_lower = name.to_lowercase();
                if p.is_dir() && name_lower.starts_with("proton") {
                    let proton_script = p.join("proton");
                    if proton_script.is_file() {
                        official_runners.push((name_lower, proton_script));
                    }
                }
            }
        }
    }
    if !official_runners.is_empty() {
        official_runners.sort_by(|a, b| {
            let rank = |n: &str| -> u8 {
                if n.contains("experimental") {
                    3
                } else if n.contains("hotfix") {
                    2
                } else {
                    1
                }
            };
            rank(&b.0).cmp(&rank(&a.0)).then_with(|| b.0.cmp(&a.0))
        });
        return official_runners.into_iter().next().map(|(_, p)| p);
    }

    None
}

fn resolve_steam_client_install_path(steam_libraries: &[PathBuf]) -> Option<PathBuf> {
    if let Ok(env_path) = std::env::var("STEAM_COMPAT_CLIENT_INSTALL_PATH") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if p.exists() {
                return Some(p);
            }
        }
    }
    if let Some(home) = dirs::home_dir() {
        for cand in [
            home.join(".local").join("share").join("Steam"),
            home.join(".steam").join("steam"),
            home.join(".steam").join("root"),
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join("data")
                .join("Steam"),
        ] {
            if cand.join("steamapps").is_dir() || cand.join("ubuntu12_32").is_dir() {
                return Some(cand);
            }
        }
    }
    steam_libraries
        .iter()
        .find(|lib| lib.join("ubuntu12_32").is_dir() || lib.join("steamapps").is_dir())
        .cloned()
}

fn try_spawn_via_proton(
    exe_path: &Path,
    launch_args: &[String],
    parent_dir: &Path,
    compat_app_dir: Option<&Path>,
    steam_app_id: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    mods_dir: &Path,
    live_root: &Path,
) -> Option<std::process::Child> {
    let compat_dir = compat_app_dir?;
    if !compat_dir.is_dir() {
        return None;
    }
    let steam_libs = crate::game_logic::discover_steam_libraries();
    let proton_script = resolve_proton_runner_for_prefix(Some(compat_dir), &steam_libs)?;
    let steam_client_dir = resolve_steam_client_install_path(&steam_libs).or_else(|| {
        compat_dir
            .parent()
            .and_then(|s| s.parent())
            .and_then(|root| root.parent())
            .map(|p| p.to_path_buf())
    });

    let mut proton_cmd = std::process::Command::new(&proton_script);
    sanitize_game_spawn_env(&mut proton_cmd);
    proton_cmd
        .arg("waitforexitandrun")
        .arg(exe_path)
        .args(launch_args)
        .current_dir(parent_dir)
        .env("STEAM_COMPAT_DATA_PATH", compat_dir);
    if let Some(client_dir) = steam_client_dir {
        proton_cmd.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", client_dir);
    }
    if !live_root.as_os_str().is_empty() && live_root.exists() {
        proton_cmd.env("STEAM_COMPAT_INSTALL_PATH", live_root);
    }
    if let Some(app_id) = steam_app_id.filter(|id| !id.trim().is_empty()) {
        proton_cmd.env("SteamAppId", app_id).env("SteamGameId", app_id);
    }
    apply_wine_dll_overrides(&mut proton_cmd, game_schema, mods_dir, live_root);
    proton_cmd.spawn().ok()
}

fn apply_wine_dll_overrides(
    cmd: &mut std::process::Command,
    schema: &Option<crate::schema::GameSchema>,
    mods_dir: &Path,
    live_root: &Path,
) {
    let dll_entries = collect_wine_dll_overrides(schema, mods_dir, live_root);
    if dll_entries.is_empty() {
        return;
    }
    let mut parts: Vec<String> = std::env::var("WINEDLLOVERRIDES")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    for (stem, mode) in dll_entries {
        let token = format!("{}={}", stem, mode);
        if !parts.iter().any(|p| p.to_lowercase().starts_with(&format!("{}=", stem))) {
            parts.push(token);
        }
    }
    if !parts.is_empty() {
        cmd.env("WINEDLLOVERRIDES", parts.join(";"));
    }
}

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

    let (exe_path, mut launch_args, using_custom_extender) =
        if let Some((extender_exe, extender_args)) =
            resolve_custom_script_extender_exe(&live_root, &default_exe_path, game_schema)
        {
            let is_custom = extender_exe != default_exe_path;
            (extender_exe, extender_args, is_custom)
        } else {
            (default_exe_path, Vec::new(), false)
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
        crate::utils::strip_macos_quarantine_xattr(&exe_path);
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
            let dll_entries =
                collect_wine_dll_overrides(&game_schema, Path::new(&mods_path), &live_root);
            let proton_pfx_user = resolved_steam
                .as_ref()
                .and_then(|r| r.compatdata_pfx_user_dir.clone())
                .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&mods_path));
            let compat_app_dir = proton_pfx_user
                .as_deref()
                .and_then(proton_compat_app_dir_from_user_dir)
                .or_else(|| {
                    std::env::var_os("STEAM_COMPAT_DATA_PATH")
                        .filter(|v| !v.is_empty())
                        .map(PathBuf::from)
                });
            if let Some(compat_dir) = compat_app_dir.as_deref() {
                let _ = sync_proton_user_settings_overrides(compat_dir, &dll_entries);
            }

            let steam_app_id = resolved_steam
                .as_ref()
                .map(|r| r.app_id.clone())
                .filter(|id| !id.trim().is_empty())
                .or_else(|| crate::game_logic::default_steam_app_id(game_schema));

            let mut launched_via_steam = false;
            if !using_custom_extender {
                if let Some(ref app_id) = steam_app_id {
                    let mut steam_cmd = std::process::Command::new("steam");
                    sanitize_game_spawn_env(&mut steam_cmd);
                    steam_cmd.args(["-applaunch", app_id]);
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
            }

            if launched_via_steam {
                None
            } else if let Some(proton_child) = try_spawn_via_proton(
                &exe_path,
                &launch_args,
                &parent_dir,
                compat_app_dir.as_deref(),
                steam_app_id.as_deref(),
                &game_schema,
                Path::new(&mods_path),
                &live_root,
            ) {
                Some(proton_child.id())
            } else {
                let mut wine_cmd = std::process::Command::new("wine");
                sanitize_game_spawn_env(&mut wine_cmd);
                apply_wine_dll_overrides(&mut wine_cmd, &game_schema, Path::new(&mods_path), &live_root);
                wine_cmd.arg(&exe_path).args(&launch_args).current_dir(&parent_dir);
                if let Some(pfx_user) = proton_pfx_user.as_deref() {
                    // pfx_user is .../pfx/drive_c/users/steamuser -> pfx is 3 parents up
                    if let Some(pfx_root) = proton_pfx_root_from_user_dir(pfx_user) {
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
    let should_airgap = enforce_airgap.unwrap_or(true);
    if should_airgap {
        let _ = apply_save_airgap(&resolved_docs, true, &game_schema);
    }

    let spawn_restore_watcher = |mut child: std::process::Child| {
        if !should_airgap {
            return;
        }
        let docs_restore = resolved_docs.clone();
        let schema_restore = game_schema.clone();
        std::thread::spawn(move || {
            let _ = child.wait();
            let _ = apply_save_airgap(&docs_restore, false, &schema_restore);
        });
    };

    if cfg!(target_os = "macos") && is_app_bundle {
        crate::utils::strip_macos_quarantine_xattr(&exe_path);
        let mut cmd = std::process::Command::new("open");
        sanitize_game_spawn_env(&mut cmd);
        if should_airgap {
            cmd.arg("-W");
        }
        cmd.arg("-a").arg(&exe_path);
        if !sanitized_args.is_empty() {
            cmd.arg("--args");
            for a in &sanitized_args {
                cmd.arg(a);
            }
        }
        return match cmd.spawn() {
            Ok(child) => {
                spawn_restore_watcher(child);
                Ok("backend_external_tool_started".to_string())
            }
            Err(e) => Err(e.to_string()),
        };
    }

    let parent_dir = exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    if cfg!(target_os = "linux") && ext_lower == "exe" {
        let live_root =
            crate::game_logic::resolve_game_engine_root(&coords.live_path, &game_schema);
        let mods_dir = if !coords.mods_path.trim().is_empty() {
            PathBuf::from(&coords.mods_path)
        } else {
            parent_dir.clone()
        };
        let resolved_steam = crate::game_logic::resolve_steam_app_and_proton_prefix(
            &game_schema,
            Some(&coords.live_path),
        );
        let proton_pfx_user = resolved_steam
            .as_ref()
            .and_then(|r| r.compatdata_pfx_user_dir.clone())
            .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&resolved_docs))
            .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&coords.mods_path));
        let compat_app_dir = proton_pfx_user
            .as_deref()
            .and_then(proton_compat_app_dir_from_user_dir)
            .or_else(|| {
                std::env::var_os("STEAM_COMPAT_DATA_PATH")
                    .filter(|v| !v.is_empty())
                    .map(PathBuf::from)
            });
        if let Some(compat_dir) = compat_app_dir.as_deref() {
            let dll_entries = collect_wine_dll_overrides(&game_schema, &mods_dir, &live_root);
            let _ = sync_proton_user_settings_overrides(compat_dir, &dll_entries);
        }
        let steam_app_id = resolved_steam
            .as_ref()
            .map(|r| r.app_id.clone())
            .filter(|id| !id.trim().is_empty())
            .or_else(|| crate::game_logic::default_steam_app_id(&game_schema));

        if let Some(proton_child) = try_spawn_via_proton(
            &exe_path,
            &sanitized_args,
            &parent_dir,
            compat_app_dir.as_deref(),
            steam_app_id.as_deref(),
            &game_schema,
            &mods_dir,
            &live_root,
        ) {
            spawn_restore_watcher(proton_child);
            return Ok("backend_external_tool_started".to_string());
        }

        let mut wine_cmd = std::process::Command::new("wine");
        sanitize_game_spawn_env(&mut wine_cmd);
        apply_wine_dll_overrides(&mut wine_cmd, &game_schema, &mods_dir, &live_root);
        wine_cmd.arg(&exe_path).current_dir(&parent_dir);
        if let Some(pfx_user) = proton_pfx_user.as_deref() {
            if let Some(pfx_root) = proton_pfx_root_from_user_dir(pfx_user) {
                wine_cmd.env("WINEPREFIX", pfx_root);
            }
        }
        for a in &sanitized_args {
            wine_cmd.arg(a);
        }
        return match wine_cmd.spawn() {
            Ok(child) => {
                spawn_restore_watcher(child);
                Ok("backend_external_tool_started".to_string())
            }
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
        Ok(child) => {
            spawn_restore_watcher(child);
            Ok("backend_external_tool_started".to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_proton_user_settings_writes_updates_and_removes_managed_block() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_proton_user_settings_test_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();

        let existing = "user_settings = {\n    \"PROTON_LOG\": \"1\",\n}\n";
        let settings_path = root.join("user_settings.py");
        std::fs::write(&settings_path, existing).unwrap();

        let changed = sync_proton_user_settings_overrides(
            &root,
            &[("dxgi".to_string(), "n,b".to_string()), ("version".to_string(), "n,b".to_string())],
        )
        .unwrap();
        assert!(changed);

        let after_write = std::fs::read_to_string(&settings_path).unwrap();
        assert!(after_write.contains("\"PROTON_LOG\": \"1\""));
        assert!(after_write.contains(PROTON_OVERRIDE_BEGIN_MARKER));
        assert!(after_write.contains("\"dxgi=n,b\""));
        assert!(after_write.contains("\"version=n,b\""));
        assert!(after_write.contains(PROTON_OVERRIDE_END_MARKER));

        // Idempotent second run with identical entries reports unchanged.
        let unchanged = sync_proton_user_settings_overrides(
            &root,
            &[("dxgi".to_string(), "n,b".to_string()), ("version".to_string(), "n,b".to_string())],
        )
        .unwrap();
        assert!(!unchanged);

        // Updating overrides replaces only the managed block while preserving existing keys.
        let updated = sync_proton_user_settings_overrides(
            &root,
            &[("winmm".to_string(), "n,b".to_string())],
        )
        .unwrap();
        assert!(updated);
        let after_update = std::fs::read_to_string(&settings_path).unwrap();
        assert!(after_update.contains("\"PROTON_LOG\": \"1\""));
        assert!(after_update.contains("\"winmm=n,b\""));
        assert!(!after_update.contains("\"dxgi=n,b\""));

        // Clearing overrides removes the managed block while restoring user_settings intact.
        let cleared = sync_proton_user_settings_overrides(&root, &[]).unwrap();
        assert!(cleared);
        let after_clear = std::fs::read_to_string(&settings_path).unwrap();
        assert!(!after_clear.contains(PROTON_OVERRIDE_BEGIN_MARKER));
        assert!(after_clear.contains("\"PROTON_LOG\": \"1\""));

        // Fresh directory without user settings deletes user_settings.py once overrides clear.
        let fresh_root = root.join("fresh");
        std::fs::create_dir_all(&fresh_root).unwrap();
        assert!(sync_proton_user_settings_overrides(&fresh_root, &[("d3d11".to_string(), "n,b".to_string())]).unwrap());
        assert!(fresh_root.join("user_settings.py").is_file());
        assert!(sync_proton_user_settings_overrides(&fresh_root, &[]).unwrap());
        assert!(!fresh_root.join("user_settings.py").exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_proton_runner_prefers_prefix_config_info_then_experimental() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_proton_runner_test_{}",
            uuid::Uuid::new_v4()
        ));
        let steam_lib = root.join("SteamLibrary");
        let custom_proton_dir = steam_lib.join("steamapps").join("common").join("CustomProton");
        let custom_bin_dir = custom_proton_dir.join("files").join("bin");
        let exp_proton_dir = steam_lib
            .join("steamapps")
            .join("common")
            .join("Proton - Experimental");
        let compat_dir = steam_lib.join("steamapps").join("compatdata").join("999999");

        std::fs::create_dir_all(&custom_bin_dir).unwrap();
        std::fs::create_dir_all(&exp_proton_dir).unwrap();
        std::fs::create_dir_all(&compat_dir).unwrap();

        let custom_proton_script = custom_proton_dir.join("proton");
        let exp_proton_script = exp_proton_dir.join("proton");
        std::fs::write(&custom_proton_script, b"#!/bin/sh\n").unwrap();
        std::fs::write(&exp_proton_script, b"#!/bin/sh\n").unwrap();

        // 1. config_info inside compat_app_dir resolves the exact Proton binary used for this prefix
        let config_info_body = format!("9.0-4\n{}/\n", custom_bin_dir.to_string_lossy());
        std::fs::write(compat_dir.join("config_info"), config_info_body).unwrap();
        let resolved_exact =
            resolve_proton_runner_for_prefix(Some(&compat_dir), std::slice::from_ref(&steam_lib));
        assert_eq!(resolved_exact.as_deref(), Some(custom_proton_script.as_path()));

        // 2. Without config_info, falls back to Proton - Experimental in Steam library
        let _ = std::fs::remove_file(compat_dir.join("config_info"));
        let resolved_exp =
            resolve_proton_runner_for_prefix(Some(&compat_dir), std::slice::from_ref(&steam_lib));
        assert_eq!(resolved_exp.as_deref(), Some(exp_proton_script.as_path()));

        let _ = std::fs::remove_dir_all(&root);
    }
}
