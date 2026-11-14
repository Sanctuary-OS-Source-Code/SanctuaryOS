use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

static SANCTUARY_RUNTIME_INSTANCE_ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn get_runtime_instance_id() -> &'static str {
    SANCTUARY_RUNTIME_INSTANCE_ID
        .get_or_init(|| uuid::Uuid::new_v4().to_string())
        .as_str()
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
struct LaunchedGameInfo {
    pid: Option<u32>,
    exe_name: String,
    live_root_norm: String,
    launched_at_epoch: u64,
}

static LAST_LAUNCHED_GAME_INFO: std::sync::OnceLock<std::sync::Mutex<Option<LaunchedGameInfo>>> =
    std::sync::OnceLock::new();

fn record_launched_game_info(pid: Option<u32>, exe_path: &Path, live_root: &Path) {
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

fn sanitize_game_spawn_env(cmd: &mut std::process::Command) {
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

fn resolve_custom_script_extender_exe(
    live_root: &Path,
    default_exe: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<(PathBuf, Vec<String>)> {
    let tools = game_schema.as_ref()?.external_tools.as_ref()?;
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

        let extra_args: Vec<String> = obj
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

        let mut candidates = vec![live_root.join(rel_or_exe)];
        if let Some(exe_parent) = default_exe.parent() {
            candidates.push(exe_parent.join(rel_or_exe));
        }
        let direct = PathBuf::from(rel_or_exe);
        if direct.is_absolute() {
            candidates.push(direct);
        }

        for cand in candidates {
            if cand.is_file() {
                return Some((cand, extra_args));
            }
        }
    }
    None
}

fn build_dlc_mask_launch_args(
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

#[tauri::command]
pub fn launch_game(
    live_path: String,
    mods_path: String,
    disabled_dlc: Option<Vec<String>>,
    auto_purge_caches: Option<bool>,
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

    if cfg!(target_os = "macos")
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
        return match open_cmd.spawn() {
            Ok(_) => {
                record_launched_game_info(None, &exe_path, &live_root);
                Ok("backend_ignition_started".to_string())
            }
            Err(e) => Err(e.to_string()),
        };
    }

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

        if let Some(app_id) = steam_app_id {
            let mut steam_cmd = std::process::Command::new("steam");
            sanitize_game_spawn_env(&mut steam_cmd);
            steam_cmd.args(["-applaunch", &app_id]);
            if !launch_args.is_empty() {
                steam_cmd.args(&launch_args);
            }
            if steam_cmd.spawn().is_ok() {
                record_launched_game_info(None, &exe_path, &live_root);
                return Ok("backend_ignition_started".to_string());
            }
            let mut xdg_cmd = std::process::Command::new("xdg-open");
            sanitize_game_spawn_env(&mut xdg_cmd);
            if launch_args.is_empty()
                && xdg_cmd
                    .arg(format!("steam://rungameid/{}", app_id))
                    .spawn()
                    .is_ok()
            {
                record_launched_game_info(None, &exe_path, &live_root);
                return Ok("backend_ignition_started".to_string());
            }
        }

        let mut wine_cmd = std::process::Command::new("wine");
        sanitize_game_spawn_env(&mut wine_cmd);
        wine_cmd.arg(&exe_path).args(&launch_args).current_dir(&parent_dir);
        if let Some(pfx_user) = resolved_steam
            .and_then(|r| r.compatdata_pfx_user_dir)
            .or_else(|| crate::game_logic::extract_proton_user_dir_from_path(&mods_path))
        {
            // pfx_user is .../pfx/drive_c/users/steamuser -> pfx is 3 parents up
            if let Some(pfx_root) = pfx_user.parent().and_then(|u| u.parent()).and_then(|dc| dc.parent()) {
                wine_cmd.env("WINEPREFIX", pfx_root);
            }
        }
        return match wine_cmd.spawn() {
            Ok(child) => {
                record_launched_game_info(Some(child.id()), &exe_path, &live_root);
                Ok("backend_ignition_started".to_string())
            }
            Err(e) => Err(e.to_string()),
        };
    }

    let mut cmd = std::process::Command::new(&exe_path);
    sanitize_game_spawn_env(&mut cmd);
    match cmd
        .args(&launch_args)
        .current_dir(parent_dir)
        .spawn()
    {
        Ok(child) => {
            record_launched_game_info(Some(child.id()), &exe_path, &live_root);
            Ok("backend_ignition_started".to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AirgapStatus {
    pub active: bool,
    pub targets: Vec<String>,
    pub airgap_path: String,
    pub protected_files_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabSaveFileInfo {
    pub file_name: String,
    pub modified_epoch: u64,
    pub size_kb: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabTestSaveStatus {
    pub has_test_save: bool,
    pub active_test_save: Option<LabSaveFileInfo>,
    pub sandbox_saves: Vec<LabSaveFileInfo>,
    pub available_live_saves: Vec<LabSaveFileInfo>,
    pub vault_mirror_saves: Vec<LabSaveFileInfo>,
    pub fresh_sandbox_armed: bool,
    pub game_running: bool,
    pub airgap_active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct SandboxStateMeta {
    pub selected_save_name: Option<String>,
    pub fresh_sandbox_armed: bool,
    #[serde(default)]
    pub source_live_save_name: Option<String>,
}

#[derive(Clone, Debug)]
struct AirgapStoragePaths {
    pub primary_airgap_root: PathBuf,
    pub sandbox_root: PathBuf,
    pub secondary_vault_mirror: PathBuf,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RoutedFileRecord {
    pub target_path: String,
    pub backup_path: Option<String>,
    pub source_path: String,
}

fn resolve_save_extensions(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    game_schema
        .as_ref()
        .and_then(|s| s.lab_verification.as_ref())
        .and_then(|lv| lv.save_extensions.clone())
        .unwrap_or_default()
}

fn is_directory_save_mode(save_exts: &[String]) -> bool {
    save_exts.is_empty()
        || save_exts.iter().any(|e| {
            matches!(
                e.trim().to_lowercase().as_str(),
                "/" | "dir" | "directory" | "folder"
            )
        })
}

fn is_temporary_or_internal_save_artifact(fname_lower: &str) -> bool {
    fname_lower.is_empty()
        || fname_lower.starts_with('.')
        || fname_lower == "desktop.ini"
        || fname_lower == "thumbs.db"
        || fname_lower.ends_with(".tmp")
        || fname_lower.ends_with(".temp")
        || fname_lower.ends_with(".part")
        || fname_lower.ends_with(".partial")
        || fname_lower.ends_with(".crdownload")
        || fname_lower.ends_with(".writing")
        || fname_lower.ends_with(".lock")
        || fname_lower.ends_with(".lck")
        || fname_lower.ends_with('~')
        || fname_lower.contains("savetmp")
        || fname_lower.ends_with("_tmp")
}

fn matches_configured_save_file(fname_lower: &str, save_exts: &[String], file_exts: &[String]) -> bool {
    if is_temporary_or_internal_save_artifact(fname_lower) {
        return false;
    }
    if !file_exts.is_empty() {
        return file_exts.iter().any(|ext| fname_lower.ends_with(ext));
    }
    save_exts.is_empty()
}

fn matches_save_filename(fname: &str, save_exts: &[String]) -> bool {
    let fname_lower = fname.to_lowercase();
    let file_exts: Vec<String> = save_exts
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
        .collect();
    matches_configured_save_file(&fname_lower, save_exts, &file_exts)
}

fn compute_dir_save_slot_stats(slot_dir: &Path) -> Option<(u64, u64)> {
    let mut total_bytes: u64 = 0;
    let mut max_mtime: u64 = 0;
    let mut has_file = false;
    for entry in walkdir::WalkDir::new(slot_dir)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
        if is_temporary_or_internal_save_artifact(&fname_lower) {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if meta.len() > 0 {
                has_file = true;
                total_bytes = total_bytes.saturating_add(meta.len());
                let mtime_secs = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if mtime_secs > max_mtime {
                    max_mtime = mtime_secs;
                }
            }
        }
    }
    if has_file {
        Some((max_mtime, (total_bytes / 1024).max(1)))
    } else {
        None
    }
}

fn list_saves_in_dir(dir: &Path, save_exts: &[String]) -> Vec<LabSaveFileInfo> {
    let mut list = Vec::new();
    if !dir.exists() {
        return list;
    }

    let file_exts: Vec<String> = save_exts
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
        .collect();
    let allow_dir_slots = is_directory_save_mode(save_exts);
    let scan_files = !file_exts.is_empty() || save_exts.is_empty();

    if scan_files {
        let max_depth = if file_exts.is_empty() { 1 } else { 2 };
        for entry in walkdir::WalkDir::new(dir)
            .max_depth(max_depth)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            let name_lower = fname.to_lowercase();
            if !matches_configured_save_file(&name_lower, save_exts, &file_exts) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let size_bytes = meta.len();
                if size_bytes == 0 {
                    continue;
                }
                let modified_epoch = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                list.push(LabSaveFileInfo {
                    file_name: fname,
                    modified_epoch,
                    size_kb: (size_bytes / 1024).max(1),
                });
            }
        }
    }

    if allow_dir_slots {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let dname = entry.file_name().to_string_lossy().to_string();
                if dname.starts_with('.') {
                    continue;
                }
                if let Some((modified_epoch, size_kb)) = compute_dir_save_slot_stats(&path) {
                    if !list.iter().any(|s| s.file_name.eq_ignore_ascii_case(&dname)) {
                        list.push(LabSaveFileInfo {
                            file_name: dname,
                            modified_epoch,
                            size_kb,
                        });
                    }
                }
            }
        }
    }

    // Hide rolling engine backup revisions (e.g. "slot_01.ext.ver0") in human UI pickers ONLY when
    // their primary parent save ("slot_01.ext") is also present in the same directory; if a backup
    // revision is orphaned without its primary save, keep it visible so the user can still recover it!
    let lower_names: Vec<String> = list.iter().map(|s| s.file_name.to_lowercase()).collect();
    list.retain(|cand| {
        let cand_lower = cand.file_name.to_lowercase();
        !lower_names.iter().any(|prim| {
            cand_lower.len() > prim.len() + 1
                && cand_lower.starts_with(prim)
                && cand_lower.as_bytes().get(prim.len()) == Some(&b'.')
        })
    });

    list.sort_by(|a, b| b.modified_epoch.cmp(&a.modified_epoch));
    list
}

fn load_sandbox_state_meta(sandbox_root: &Path) -> SandboxStateMeta {
    let meta_path = sandbox_root.join(".sandbox_state.json");
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(parsed) = serde_json::from_str::<SandboxStateMeta>(&raw) {
            return parsed;
        }
    }
    SandboxStateMeta::default()
}

fn save_sandbox_state_meta(sandbox_root: &Path, meta: &SandboxStateMeta) -> Result<(), String> {
    std::fs::create_dir_all(sandbox_root).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_bytes(&sandbox_root.join(".sandbox_state.json"), &bytes)
}

fn touch_save_slot_mtime_now(slot_path: &Path) {
    let now_ft = filetime::FileTime::from_system_time(std::time::SystemTime::now());
    if slot_path.is_file() {
        let _ = filetime::set_file_mtime(slot_path, now_ft);
    } else if slot_path.is_dir() {
        for entry in walkdir::WalkDir::new(slot_path)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let _ = filetime::set_file_mtime(entry.path(), now_ft);
            }
        }
    }
}

fn find_named_save_in_dir(dir: &Path, target_name: &str, allow_dir_slots: bool) -> Option<PathBuf> {
    if !dir.exists() || target_name.trim().is_empty() {
        return None;
    }
    if allow_dir_slots {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir()
                    && entry
                        .file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(target_name)
                {
                    return Some(entry.path());
                }
            }
        }
    }
    for entry in walkdir::WalkDir::new(dir)
        .max_depth(2)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file()
            && entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(target_name)
        {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

/// Mounts a fresh disposable writable working copy of the read-only Golden Homestead Baseline
/// (`golden_dir`) into `working_dir` (`docs_dir/<target>`). Any mutations or corruption written
/// by the game during a test only touch `working_dir` and are discarded on teardown!
fn sync_golden_sandbox_to_working_dir(
    golden_dir: &Path,
    working_dir: &Path,
    docs_allowed: &[PathBuf],
    selected_save_name: Option<&str>,
    fresh_sandbox_armed: bool,
    save_exts: &[String],
) -> Result<(), String> {
    if working_dir.exists() {
        remove_save_tree_strict(working_dir, docs_allowed)?;
    }
    std::fs::create_dir_all(working_dir).map_err(|e| e.to_string())?;
    let allow_dir_slots = is_directory_save_mode(save_exts);
    if !fresh_sandbox_armed
        && golden_dir.exists()
        && !list_saves_in_dir(golden_dir, save_exts).is_empty()
    {
        copy_save_tree_verified(golden_dir, working_dir)?;
        set_tree_readonly(golden_dir, true);
        set_tree_readonly(working_dir, false);
        if let Some(sel) = selected_save_name.map(str::trim).filter(|s| !s.is_empty()) {
            if let Some(slot_path) = find_named_save_in_dir(working_dir, sel, allow_dir_slots) {
                touch_save_slot_mtime_now(&slot_path);
            }
        }
    } else {
        set_tree_readonly(working_dir, false);
    }
    Ok(())
}

/// Used ONLY when `golden_dir` has zero baseline saves (initial unseeded Homestead world creation):
/// audits candidate saves in `working_dir` so corrupted crash files are never promoted, copies
/// valid saves into `golden_dir`, and seals `golden_dir` read-only.
fn promote_valid_saves_into_golden_sandbox(
    working_dir: &Path,
    golden_dir: &Path,
    save_exts: &[String],
) -> Result<(), String> {
    if !working_dir.exists() {
        return Ok(());
    }
    let candidates = list_saves_in_dir(working_dir, save_exts);
    if candidates.is_empty() {
        return Ok(());
    }
    let allow_dir_slots = is_directory_save_mode(save_exts);
    std::fs::create_dir_all(golden_dir).map_err(|e| e.to_string())?;
    set_tree_readonly(golden_dir, false);
    for cand in &candidates {
        if let Some(src_path) = find_named_save_in_dir(working_dir, &cand.file_name, allow_dir_slots)
        {
            let valid = if src_path.is_file() {
                audit_save_file_corruption(&src_path, None).is_ok()
            } else {
                compute_dir_save_slot_stats(&src_path).is_some()
            };
            if valid {
                let _ = copy_save_item_into_dir(&src_path, golden_dir, false);
            }
        }
    }
    set_tree_readonly(golden_dir, true);
    Ok(())
}

fn compute_lab_test_save_status(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> LabTestSaveStatus {
    let game_running = is_any_game_process_running(game_schema);
    let targets = resolve_deduplicated_save_targets(docs_dir, game_schema);
    let Some(primary_save_rel) = targets.first().cloned() else {
        return LabTestSaveStatus {
            has_test_save: false,
            active_test_save: None,
            sandbox_saves: Vec::new(),
            available_live_saves: Vec::new(),
            vault_mirror_saves: Vec::new(),
            fresh_sandbox_armed: false,
            game_running,
            airgap_active: false,
        };
    };
    let save_exts = resolve_save_extensions(game_schema);
    let storage = resolve_airgap_storage_paths(docs_dir, None);
    migrate_legacy_inline_airgap_if_present(docs_dir, &storage, game_schema);

    let airgap_active = is_airgap_active_for_docs(docs_dir, game_schema);

    let golden_sandbox_dir =
        crate::utils::resolve_case_insensitive_path(&storage.sandbox_root, &primary_save_rel);
    let live_saves_dir = if airgap_active {
        crate::utils::resolve_case_insensitive_path(&storage.primary_airgap_root, &primary_save_rel)
    } else {
        crate::utils::resolve_case_insensitive_path(docs_dir, &primary_save_rel)
    };
    let vault_mirror_dir = crate::utils::resolve_case_insensitive_path(
        &storage.secondary_vault_mirror,
        &primary_save_rel,
    );

    let mut sandbox_saves = list_saves_in_dir(&golden_sandbox_dir, &save_exts);
    if sandbox_saves.is_empty() && airgap_active {
        let working_dir = crate::utils::resolve_case_insensitive_path(docs_dir, &primary_save_rel);
        sandbox_saves = list_saves_in_dir(&working_dir, &save_exts);
    }
    let available_live_saves = list_saves_in_dir(&live_saves_dir, &save_exts);
    let mut vault_mirror_saves = list_saves_in_dir(&vault_mirror_dir, &save_exts);
    if vault_mirror_saves.is_empty() {
        if let Some(clean_ws_dir) =
            find_clean_world_state_save_dir(docs_dir, None, &primary_save_rel, game_schema)
        {
            vault_mirror_saves = list_saves_in_dir(&clean_ws_dir, &save_exts);
        }
    }

    let state_meta = load_sandbox_state_meta(&storage.sandbox_root);
    let preferred_name = state_meta
        .selected_save_name
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let active_test_save = if let Some(ref pref) = preferred_name {
        sandbox_saves
            .iter()
            .find(|s| s.file_name.eq_ignore_ascii_case(pref))
            .cloned()
            .or_else(|| sandbox_saves.first().cloned())
    } else {
        sandbox_saves.first().cloned()
    };

    let has_test_save = active_test_save.is_some();
    let fresh_sandbox_armed = !has_test_save && state_meta.fresh_sandbox_armed;

    LabTestSaveStatus {
        has_test_save,
        active_test_save,
        sandbox_saves,
        available_live_saves,
        vault_mirror_saves,
        fresh_sandbox_armed,
        game_running,
        airgap_active,
    }
}

fn resolve_save_airgap_targets(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    if let Some(s) = game_schema {
        if let Some(tc) = &s.time_capsule {
            if let Some(targets) = &tc.save_airgap_targets {
                let non_empty: Vec<String> = targets
                    .iter()
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect();
                if !non_empty.is_empty() {
                    return non_empty;
                }
            }
            let save_targets: Vec<String> = tc
                .world_state_targets
                .iter()
                .filter(|t| {
                    !t.path.trim().is_empty()
                        && (t.path.to_lowercase().contains("save")
                            || t.name.to_lowercase().contains("save"))
                })
                .map(|t| t.path.trim().to_string())
                .collect();
            if !save_targets.is_empty() {
                return save_targets;
            }
        }
    }
    Vec::new()
}

/// Resolves save airgap target relative paths and deduplicates targets that resolve to the
/// exact same physical directory on case-insensitive filesystems (e.g. ["Saves", "saves"]).
pub(crate) fn resolve_deduplicated_save_targets(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<String> {
    let raw_targets = resolve_save_airgap_targets(game_schema);
    let mut seen_keys: HashSet<String> = HashSet::new();
    let mut deduped: Vec<String> = Vec::new();

    for t in raw_targets {
        let resolved_live = crate::utils::resolve_case_insensitive_path(docs_dir, &t);
        let key = if cfg!(any(target_os = "windows", target_os = "macos")) {
            crate::utils::normalize_path_key(&resolved_live).to_lowercase()
        } else if resolved_live.exists() {
            crate::utils::normalize_path_key(&resolved_live)
        } else {
            t.replace('\\', "/").trim_matches('/').to_string()
        };
        if seen_keys.insert(key) {
            if let Ok(rel_actual) = resolved_live.strip_prefix(docs_dir) {
                let rel_s = rel_actual.to_string_lossy().replace('\\', "/");
                if !rel_s.is_empty() {
                    deduped.push(rel_s);
                    continue;
                }
            }
            deduped.push(t);
        }
    }
    deduped
}

fn resolve_docs_root(
    docs_or_mods_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> PathBuf {
    let config = get_saved_coordinates();
    if docs_or_mods_path.trim().is_empty() {
        return PathBuf::from(crate::utils::resolve_effective_docs_path(&config, game_schema));
    }
    crate::game_logic::resolve_user_data_root(docs_or_mods_path, game_schema)
}

/// Scans Time Capsule `World_State--*` snapshots newest-first to locate the latest clean
/// (non-sandbox-contaminated) save directory containing matching save slots.
pub(crate) fn find_clean_world_state_save_dir(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
    target_rel: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<PathBuf> {
    let vault_raw = explicit_vault_path
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| get_saved_coordinates().vault_path.trim().to_string());

    let mut parent_dirs: Vec<PathBuf> = Vec::new();
    let docs_str = docs_dir.to_string_lossy().to_string();
    if let Some(wb) = crate::utils::get_world_backups_dir(&docs_str, &vault_raw) {
        if wb.exists() {
            parent_dirs.push(wb);
        }
    }
    if !vault_raw.is_empty() {
        let legacy_wb = PathBuf::from(&vault_raw).join("Backups").join("World");
        if legacy_wb.exists() && !parent_dirs.iter().any(|d| d == &legacy_wb) {
            parent_dirs.push(legacy_wb);
        }
    }
    if parent_dirs.is_empty() {
        return None;
    }

    let mut snapshots: Vec<(u64, PathBuf)> = Vec::new();
    for parent in parent_dirs {
        if let Ok(entries) = std::fs::read_dir(&parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_dir() {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_string();
                if !fname.starts_with("World_State--") {
                    continue;
                }
                let epoch_suffix = fname
                    .rsplit("--")
                    .next()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or_else(|| {
                        entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0)
                    });
                snapshots.push((epoch_suffix, p));
            }
        }
    }
    snapshots.sort_by(|a, b| b.0.cmp(&a.0));

    let save_exts = resolve_save_extensions(game_schema);
    for (_, snap_dir) in &snapshots {
        let cand_save_dir = crate::utils::resolve_case_insensitive_path(snap_dir, target_rel);
        if !cand_save_dir.is_dir() {
            continue;
        }
        // Skip any snapshot accidentally sealed while an isolated Lab sandbox marker was present
        if cand_save_dir.join(".sanctuary_sandbox_marker").exists()
            || cand_save_dir.join(".sanctuary_seeded_save").exists()
        {
            continue;
        }
        if !list_saves_in_dir(&cand_save_dir, &save_exts).is_empty() {
            return Some(cand_save_dir);
        }
    }

    None
}

/// Additively mirrors non-empty, clean live save directories into the read-only Secondary Vault Save Mirror.
pub(crate) fn mirror_live_saves_to_vault(
    docs_dir: &Path,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !docs_dir.exists() {
        return;
    }
    let vault_opt = if vault_path.trim().is_empty() {
        None
    } else {
        Some(vault_path)
    };
    if is_airgap_active_for_docs_with_vault(docs_dir, vault_opt, game_schema) {
        return;
    }
    let storage = resolve_airgap_storage_paths(docs_dir, vault_opt);
    let save_exts = resolve_save_extensions(game_schema);
    for target_name in resolve_deduplicated_save_targets(docs_dir, game_schema) {
        let live_target = crate::utils::resolve_case_insensitive_path(docs_dir, &target_name);
        if !live_target.is_dir()
            || live_target.join(".sanctuary_sandbox_marker").exists()
            || live_target.join(".sanctuary_seeded_save").exists()
        {
            continue;
        }
        if list_saves_in_dir(&live_target, &save_exts).is_empty() {
            continue;
        }
        let ext_target =
            crate::utils::resolve_case_insensitive_path(&storage.secondary_vault_mirror, &target_name);
        let _ = std::fs::create_dir_all(&storage.secondary_vault_mirror);
        if let Some(p) = storage.secondary_vault_mirror.parent() {
            set_hidden_dir_attribute(p, true);
        }
        set_tree_readonly(&ext_target, false);
        let _ = copy_save_tree_verified(&live_target, &ext_target);
        set_tree_readonly(&ext_target, true);
    }
}

fn set_tree_readonly(dir: &Path, readonly: bool) {
    if !dir.exists() {
        return;
    }
    for entry in walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                let mut perms = meta.permissions();
                perms.set_readonly(readonly);
                let _ = std::fs::set_permissions(entry.path(), perms);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn set_hidden_dir_attribute(dir: &Path, hidden: bool) {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN,
        FILE_FLAGS_AND_ATTRIBUTES, INVALID_FILE_ATTRIBUTES,
    };
    if !dir.exists() {
        return;
    }
    let wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let raw = GetFileAttributesW(PCWSTR(wide.as_ptr()));
        if raw == INVALID_FILE_ATTRIBUTES {
            return;
        }
        let new_attrs = if hidden {
            raw | FILE_ATTRIBUTE_HIDDEN.0
        } else {
            raw & !FILE_ATTRIBUTE_HIDDEN.0
        };
        if new_attrs != raw {
            let _ = SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(new_attrs));
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_hidden_dir_attribute(_dir: &Path, _hidden: bool) {}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SaveFileManifestEntry {
    pub rel_path: String,
    pub size_bytes: u64,
    pub mtime_secs: u64,
    pub fingerprint: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AirgapTargetJournal {
    pub target_name: String,
    pub had_live_target: bool,
    pub manifest: Vec<SaveFileManifestEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AirgapJournal {
    pub version: u32,
    pub phase: String,
    pub instance_id: String,
    pub created_at_epoch: u64,
    pub docs_dir: String,
    pub vault_mirror_dir: String,
    pub targets: Vec<AirgapTargetJournal>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AirgapRecoveryReport {
    pub recovered: bool,
    pub healed_from_vault_mirror: bool,
    pub restored_targets: usize,
    pub message: String,
}

fn sample_file_fingerprint(path: &Path) -> Result<(u64, u64, String), String> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Seek, SeekFrom};

    let meta = std::fs::metadata(path)
        .map_err(|e| format!("Failed reading save metadata {:?}: {}", path, e))?;
    let size_bytes = meta.len();
    let mtime_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut f = std::fs::File::open(path)
        .map_err(|e| format!("Failed opening save file {:?} for integrity hash: {}", path, e))?;
    let mut hasher = Sha256::new();
    hasher.update(size_bytes.to_le_bytes());

    let head_len = (size_bytes.min(65_536)) as usize;
    if head_len > 0 {
        let mut head_buf = vec![0u8; head_len];
        f.read_exact(&mut head_buf)
            .map_err(|e| format!("Failed reading save header {:?}: {}", path, e))?;
        hasher.update(&head_buf);
    }

    if size_bytes > 65_536 {
        let tail_offset = size_bytes.saturating_sub(65_536);
        let tail_len = (size_bytes - tail_offset) as usize;
        f.seek(SeekFrom::Start(tail_offset))
            .map_err(|e| format!("Failed seeking save trailer {:?}: {}", path, e))?;
        let mut tail_buf = vec![0u8; tail_len];
        f.read_exact(&mut tail_buf)
            .map_err(|e| format!("Failed reading save trailer {:?}: {}", path, e))?;
        hasher.update(&tail_buf);
    }

    Ok((size_bytes, mtime_secs, hex::encode(hasher.finalize())))
}

fn is_airgap_internal_marker_name(name_lower: &str) -> bool {
    matches!(
        name_lower,
        ".sanctuary_sandbox_marker"
            | ".sanctuary_seeded_save"
            | ".sandbox_state.json"
            | ".airgap_active.json"
            | ".airgap_journal.json"
    ) || name_lower.contains(".tmp.")
}

fn build_save_tree_manifest(root: &Path) -> Result<Vec<SaveFileManifestEntry>, String> {
    let mut entries = Vec::new();
    if !root.exists() {
        return Ok(entries);
    }
    for entry in walkdir::WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(|e| format!("Failed walking save folder {:?}: {}", root, e))?;
        if entry.file_type().is_symlink() {
            continue;
        }
        if entry.file_type().is_file() {
            let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
            if is_airgap_internal_marker_name(&fname_lower) {
                continue;
            }
            let rel_path = entry
                .path()
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let (size_bytes, mtime_secs, fingerprint) = sample_file_fingerprint(entry.path())?;
            entries.push(SaveFileManifestEntry {
                rel_path,
                size_bytes,
                mtime_secs,
                fingerprint,
            });
        }
    }
    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(entries)
}

fn verify_save_tree_manifest(root: &Path, expected: &[SaveFileManifestEntry]) -> Result<(), String> {
    if expected.is_empty() {
        return Ok(());
    }
    if !root.exists() {
        return Err(format!("Expected protected save folder {:?} does not exist.", root));
    }
    for item in expected {
        let candidate = root.join(item.rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if !candidate.exists() || !candidate.is_file() {
            return Err(format!(
                "Missing protected save file '{}' inside {:?}.",
                item.rel_path, root
            ));
        }
        let (actual_size, _, actual_fp) = sample_file_fingerprint(&candidate)?;
        if actual_size != item.size_bytes || actual_fp != item.fingerprint {
            return Err(format!(
                "Save file integrity mismatch for '{}' in {:?} (expected {} bytes / {}, got {} bytes / {}).",
                item.rel_path, root, item.size_bytes, item.fingerprint, actual_size, actual_fp
            ));
        }
    }
    Ok(())
}

pub fn copy_save_tree_verified(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed creating save target directory {:?}: {}", dst, e))?;
    let dst_allowed = [dst.to_path_buf()];

    for entry in walkdir::WalkDir::new(src).follow_links(false) {
        let entry = entry.map_err(|e| format!("Failed walking save tree {:?}: {}", src, e))?;
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| format!("Failed stripping prefix {:?}: {}", src, e))?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        if entry.file_type().is_symlink() {
            continue;
        }
        let target_path = dst.join(rel);
        crate::utils::ensure_strict_descendant_of_roots(&target_path, &dst_allowed)?;

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target_path).map_err(|e| {
                format!(
                    "Failed creating save subdirectory {:?}: {}",
                    target_path, e
                )
            })?;
        } else if entry.file_type().is_file() {
            let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
            if is_airgap_internal_marker_name(&fname_lower) {
                continue;
            }
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed creating save parent {:?}: {}", parent, e)
                })?;
            }
            if target_path.exists() {
                if let Ok(meta) = std::fs::metadata(&target_path) {
                    if meta.permissions().readonly() {
                        let mut perms = meta.permissions();
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&target_path, perms);
                    }
                }
            }

            // Copy via byte stream + explicit fsync so power loss cannot leave unwritten OS page-cache blocks
            {
                use std::io::Write;
                let mut reader = std::fs::File::open(entry.path()).map_err(|e| {
                    format!("Failed opening source save {:?}: {}", entry.path(), e)
                })?;
                let mut writer = std::fs::File::create(&target_path).map_err(|e| {
                    format!("Failed creating destination save {:?}: {}", target_path, e)
                })?;
                let copied = std::io::copy(&mut reader, &mut writer).map_err(|e| {
                    format!(
                        "Failed copying save {:?} -> {:?}: {}",
                        entry.path(),
                        target_path,
                        e
                    )
                })?;
                let src_len = entry
                    .metadata()
                    .map_err(|e| format!("Failed reading metadata {:?}: {}", entry.path(), e))?
                    .len();
                if copied != src_len {
                    return Err(format!(
                        "Incomplete save copy for {:?} (copied {} of {} bytes).",
                        target_path, copied, src_len
                    ));
                }
                writer.flush().map_err(|e| e.to_string())?;
                writer.sync_all().map_err(|e| {
                    format!("Failed fsyncing copied save {:?}: {}", target_path, e)
                })?;
            }

            if let Ok(src_meta) = entry.metadata() {
                if let Ok(mtime) = src_meta.modified() {
                    let ft = filetime::FileTime::from_system_time(mtime);
                    let _ = filetime::set_file_mtime(&target_path, ft);
                }
            }
        }
    }
    Ok(())
}

fn remove_save_tree_strict(dir: &Path, allowed_roots: &[PathBuf]) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    crate::utils::ensure_strict_descendant_of_roots(dir, allowed_roots)?;
    set_tree_readonly(dir, false);
    std::fs::remove_dir_all(dir).map_err(|e| {
        format!(
            "Save folder {:?} could not be moved cleanly (a file may still be locked by the game or OS): {}",
            dir, e
        )
    })
}

fn resolve_airgap_storage_paths(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
) -> AirgapStoragePaths {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(crate::utils::normalize_path_key(docs_dir).as_bytes());
    let docs_hash = hex::encode(hasher.finalize())[..16].to_string();

    let vault_raw = explicit_vault_path
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| get_saved_coordinates().vault_path.trim().to_string());

    let vault_backups_base = if !vault_raw.is_empty() {
        let vp = PathBuf::from(&vault_raw);
        if crate::utils::is_safe_user_file_path(&vp.join("Backups")) {
            Some(vp.join("Backups"))
        } else {
            None
        }
    } else {
        None
    };

    let app_local_base = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("SanctuarySaveVault");

    if let Some(vb) = vault_backups_base {
        AirgapStoragePaths {
            primary_airgap_root: app_local_base.join(".lab_save_airgap").join(&docs_hash),
            sandbox_root: app_local_base.join(".lab_save_sandbox").join(&docs_hash),
            secondary_vault_mirror: vb.join(".lab_save_vault").join(&docs_hash),
        }
    } else {
        AirgapStoragePaths {
            primary_airgap_root: app_local_base.join(".lab_save_airgap").join(&docs_hash),
            sandbox_root: app_local_base.join(".lab_save_sandbox").join(&docs_hash),
            secondary_vault_mirror: app_local_base.join(".lab_save_vault").join(&docs_hash),
        }
    }
}

/// Automatically migrates any legacy in-Documents `.sanctuary_lab_airgap` / `.sanctuary_lab_sandbox`
/// folders and strips `.sanctuary_*` marker files out of `docs_dir` so EA App / Steam Cloud / game engines
/// never encounter hidden foreign files inside the user's game folder.
fn migrate_legacy_inline_airgap_if_present(
    docs_dir: &Path,
    storage: &AirgapStoragePaths,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !docs_dir.exists() {
        return;
    }
    let docs_allowed = [docs_dir.to_path_buf()];
    let legacy_airgap = docs_dir.join(".sanctuary_lab_airgap");
    if legacy_airgap.exists() {
        let _ = std::fs::create_dir_all(&storage.primary_airgap_root);
        set_tree_readonly(&legacy_airgap, false);
        set_tree_readonly(&storage.primary_airgap_root, false);
        let _ = copy_save_tree_verified(&legacy_airgap, &storage.primary_airgap_root);
        for meta_name in [".airgap_journal.json", ".airgap_active.json"] {
            let src_meta = legacy_airgap.join(meta_name);
            let dst_meta = storage.primary_airgap_root.join(meta_name);
            if src_meta.exists() && !dst_meta.exists() {
                if let Ok(bytes) = std::fs::read(&src_meta) {
                    let _ = crate::utils::atomic_write_bytes(&dst_meta, &bytes);
                }
            }
        }
        let _ = remove_save_tree_strict(&legacy_airgap, &docs_allowed);
    }

    let legacy_sandbox = docs_dir.join(".sanctuary_lab_sandbox");
    if legacy_sandbox.exists() {
        let _ = std::fs::create_dir_all(&storage.sandbox_root);
        set_tree_readonly(&legacy_sandbox, false);
        let _ = copy_save_tree_verified(&legacy_sandbox, &storage.sandbox_root);
        let _ = remove_save_tree_strict(&legacy_sandbox, &docs_allowed);
    }

    for target_name in resolve_deduplicated_save_targets(docs_dir, game_schema) {
        for base in [docs_dir, &storage.sandbox_root, &storage.primary_airgap_root] {
            let dir = crate::utils::resolve_case_insensitive_path(base, &target_name);
            if !dir.exists() {
                continue;
            }
            let legacy_seeded = dir.join(".sanctuary_seeded_save");
            if legacy_seeded.exists() {
                if let Ok(raw_name) = std::fs::read_to_string(&legacy_seeded) {
                    let trimmed = raw_name.trim().to_string();
                    if !trimmed.is_empty() {
                        let mut meta = load_sandbox_state_meta(&storage.sandbox_root);
                        if meta.selected_save_name.is_none() {
                            meta.selected_save_name = Some(trimmed);
                            meta.fresh_sandbox_armed = false;
                            let _ = save_sandbox_state_meta(&storage.sandbox_root, &meta);
                        }
                    }
                }
                let _ = std::fs::remove_file(&legacy_seeded);
            }
            let legacy_marker = dir.join(".sanctuary_sandbox_marker");
            if legacy_marker.exists() {
                let _ = std::fs::remove_file(&legacy_marker);
            }
        }
    }
}

fn load_airgap_journal(airgap_root: &Path, external_vault_dir: Option<&Path>) -> Option<AirgapJournal> {
    let local_journal = airgap_root.join(".airgap_journal.json");
    if let Ok(raw) = std::fs::read_to_string(&local_journal) {
        if let Ok(parsed) = serde_json::from_str::<AirgapJournal>(&raw) {
            return Some(parsed);
        }
    }
    if let Some(ext_dir) = external_vault_dir {
        let ext_journal = ext_dir.join(".airgap_journal.json");
        if let Ok(raw) = std::fs::read_to_string(&ext_journal) {
            if let Ok(parsed) = serde_json::from_str::<AirgapJournal>(&raw) {
                return Some(parsed);
            }
        }
    }
    None
}

fn persist_airgap_journal(
    journal: &AirgapJournal,
    airgap_root: &Path,
    external_vault_dir: Option<&Path>,
) -> Result<(), String> {
    let serialized = serde_json::to_vec_pretty(journal).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(airgap_root).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_bytes(&airgap_root.join(".airgap_journal.json"), &serialized)?;
    if let Some(ext_dir) = external_vault_dir {
        let _ = std::fs::create_dir_all(ext_dir);
        let _ = crate::utils::atomic_write_bytes(&ext_dir.join(".airgap_journal.json"), &serialized);
    }
    Ok(())
}

pub(crate) fn passive_process_refresh_kind() -> sysinfo::ProcessRefreshKind {
    // Query ONLY passive OS process counters (PROCESS_QUERY_LIMITED_INFORMATION on Windows).
    // Never request cmdline/env/cwd, which would invoke ReadProcessMemory on the game's PEB and trip anti-cheats.
    sysinfo::ProcessRefreshKind::nothing()
        .with_memory()
        .with_disk_usage()
        .with_cpu()
        .with_exe(sysinfo::UpdateKind::OnlyIfNotSet)
}

fn collect_candidate_game_exe_names(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    let mut names = crate::game_logic::get_executable_names(game_schema);
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if !info.exe_name.is_empty()
                    && !names.iter().any(|n| n.eq_ignore_ascii_case(&info.exe_name))
                {
                    names.push(info.exe_name.clone());
                }
            }
        }
    }
    names
}

fn collect_active_game_live_roots_norm(
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<String> {
    let mut roots = Vec::new();
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if !info.live_root_norm.is_empty() {
                    roots.push(info.live_root_norm.clone());
                }
            }
        }
    }
    #[cfg(not(test))]
    {
        let saved_live = get_saved_coordinates().live_path;
        if !saved_live.trim().is_empty() {
            let engine_root =
                crate::game_logic::resolve_game_engine_root(&saved_live, game_schema);
            let norm = crate::utils::normalize_path_key(&engine_root);
            if !norm.is_empty() && !roots.contains(&norm) {
                roots.push(norm);
            }
        }
    }
    #[cfg(test)]
    let _ = game_schema;
    roots
}

fn process_matches_game_candidates(
    pid_u32: u32,
    proc_info: &sysinfo::Process,
    exe_candidates: &[String],
) -> bool {
    let pname = proc_info.name().to_string_lossy().to_lowercase();
    let is_wrapper = matches!(
        pname.as_str(),
        "reaper"
            | "steam-launch-wrapper"
            | "srt-bwrap"
            | "pressure-vessel-adverb"
            | "proton"
            | "python3"
            | "sh"
            | "bash"
            | "wineserver"
    );
    if is_wrapper {
        return false;
    }

    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if info.pid == Some(pid_u32) {
                    return true;
                }
            }
        }
    }

    let exe_path_lower = proc_info
        .exe()
        .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase())
        .unwrap_or_default();

    exe_candidates.iter().any(|exe| {
        let clean_exe = exe.trim().replace('\\', "/").to_lowercase();
        let exe_filename = clean_exe.rsplit('/').next().unwrap_or(&clean_exe);
        let stem = exe_filename
            .trim_end_matches(".exe")
            .trim_end_matches(".app");
        if stem.is_empty() {
            return false;
        }
        let stem_15: String = stem.chars().take(15).collect();
        let direct_name_match = pname == exe_filename
            || pname == stem
            || pname.starts_with(stem)
            || (stem_15.len() == 15 && pname == stem_15);
        let exe_path_match = !exe_path_lower.is_empty()
            && (exe_path_lower.ends_with(&format!("/{}", exe_filename))
                || exe_path_lower.ends_with(&format!("/{}", stem)));
        direct_name_match || exe_path_match
    })
}

fn process_matches_game_or_live_root(
    pid_u32: u32,
    proc_info: &sysinfo::Process,
    exe_candidates: &[String],
    live_roots_norm: &[String],
    tracked_lab_pid: Option<u32>,
) -> bool {
    if tracked_lab_pid == Some(pid_u32) {
        return true;
    }
    if process_matches_game_candidates(pid_u32, proc_info, exe_candidates) {
        return true;
    }
    if let Some(exe_path) = proc_info.exe() {
        let proc_norm = crate::utils::normalize_path_key(exe_path);
        if live_roots_norm.iter().any(|r| {
            let clean_r = r.trim_end_matches('/');
            !clean_r.is_empty()
                && (proc_norm == clean_r || proc_norm.starts_with(&format!("{}/", clean_r)))
        }) {
            let pname = proc_info.name().to_string_lossy().to_lowercase();
            let is_helper = pname.contains("crash")
                || pname.contains("uninstall")
                || pname.contains("redist")
                || pname.contains("setup")
                || pname.contains("updater")
                || pname.contains("activation");
            if !is_helper {
                return true;
            }
        }
    }
    false
}

pub fn is_any_game_process_running(game_schema: &Option<crate::schema::GameSchema>) -> bool {
    let candidates = collect_candidate_game_exe_names(game_schema);
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let tracked_lab_pid = LAB_SESSION
        .get()
        .and_then(|m| m.try_lock().ok())
        .and_then(|g| g.as_ref().and_then(|s| s.tracked_pid));
    let has_launch_pid = LAST_LAUNCHED_GAME_INFO
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|g| g.as_ref().and_then(|i| i.pid))
        .is_some();

    if candidates.is_empty() && live_roots.is_empty() && tracked_lab_pid.is_none() && !has_launch_pid {
        return false;
    }

    let mut sys = sysinfo::System::new();
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        passive_process_refresh_kind(),
    );
    sys.processes().iter().any(|(pid, proc_info)| {
        process_matches_game_or_live_root(
            pid.as_u32(),
            proc_info,
            &candidates,
            &live_roots,
            tracked_lab_pid,
        )
    })
}

fn wait_for_game_exit_before_airgap_swap(
    game_schema: &Option<crate::schema::GameSchema>,
    max_wait_ms: u64,
) -> Result<(), String> {
    let candidates = collect_candidate_game_exe_names(game_schema);
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let tracked_lab_pid = LAB_SESSION
        .get()
        .and_then(|m| m.try_lock().ok())
        .and_then(|g| g.as_ref().and_then(|s| s.tracked_pid));
    let has_tracked_pid = LAST_LAUNCHED_GAME_INFO
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|g| g.as_ref().and_then(|i| i.pid))
        .is_some();

    if candidates.is_empty() && live_roots.is_empty() && tracked_lab_pid.is_none() && !has_tracked_pid {
        return Ok(());
    }

    let mut sys = sysinfo::System::new();
    let started = std::time::Instant::now();
    loop {
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            passive_process_refresh_kind(),
        );
        let still_running = sys.processes().iter().any(|(pid, p)| {
            process_matches_game_or_live_root(
                pid.as_u32(),
                p,
                &candidates,
                &live_roots,
                tracked_lab_pid,
            )
        });
        if !still_running {
            return Ok(());
        }
        if started.elapsed().as_millis() as u64 >= max_wait_ms {
            return Err("lab_err_game_running_saves_locked".to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
}

pub fn is_airgap_active_for_docs(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    is_airgap_active_for_docs_with_vault(docs_dir, None, game_schema)
}

fn is_airgap_active_for_docs_with_vault(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if !docs_dir.exists() {
        return false;
    }
    let storage = resolve_airgap_storage_paths(docs_dir, explicit_vault_path);
    migrate_legacy_inline_airgap_if_present(docs_dir, &storage, game_schema);

    if storage.primary_airgap_root.join(".airgap_active.json").exists()
        || storage.primary_airgap_root.join(".airgap_journal.json").exists()
        || storage.secondary_vault_mirror.join(".airgap_journal.json").exists()
    {
        return true;
    }
    resolve_deduplicated_save_targets(docs_dir, game_schema)
        .iter()
        .any(|t| {
            crate::utils::resolve_case_insensitive_path(&storage.primary_airgap_root, t).exists()
        })
}

pub fn heal_active_airgap_if_tampered(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if !docs_dir.exists()
        || !is_airgap_active_for_docs_with_vault(docs_dir, explicit_vault_path, game_schema)
    {
        return false;
    }
    let storage = resolve_airgap_storage_paths(docs_dir, explicit_vault_path);
    let journal_opt = load_airgap_journal(
        &storage.primary_airgap_root,
        Some(storage.secondary_vault_mirror.as_path()),
    );
    let targets = resolve_deduplicated_save_targets(docs_dir, game_schema);
    let mut healed = false;

    let _ = std::fs::create_dir_all(&storage.primary_airgap_root);
    set_hidden_dir_attribute(&storage.primary_airgap_root, true);

    for target_name in &targets {
        let live_target = crate::utils::resolve_case_insensitive_path(docs_dir, target_name);
        let airgap_target =
            crate::utils::resolve_case_insensitive_path(&storage.primary_airgap_root, target_name);

        // Ensure native save directory in docs_dir exists if someone deleted it mid-test (zero foreign marker files!)
        if !live_target.exists() {
            let _ = std::fs::create_dir_all(&live_target);
            healed = true;
        }

        // Verify primary airgap against journal & self-heal from secondary immortal Vault mirror if tampered
        if let Some(ref journal) = journal_opt {
            if let Some(tj) = journal
                .targets
                .iter()
                .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            {
                if !tj.manifest.is_empty()
                    && verify_save_tree_manifest(&airgap_target, &tj.manifest).is_err()
                {
                    let ext_target = crate::utils::resolve_case_insensitive_path(
                        &storage.secondary_vault_mirror,
                        target_name,
                    );
                    if ext_target.exists()
                        && verify_save_tree_manifest(&ext_target, &tj.manifest).is_ok()
                    {
                        set_tree_readonly(&airgap_target, false);
                        if copy_manifest_entries_verified(&ext_target, &airgap_target, &tj.manifest)
                            .is_ok()
                        {
                            set_tree_readonly(&airgap_target, true);
                            healed = true;
                        }
                    }
                } else if airgap_target.exists() {
                    set_tree_readonly(&airgap_target, true);
                }
            }
        }
    }

    healed
}

fn copy_manifest_entries_verified(
    src_root: &Path,
    dst_root: &Path,
    manifest: &[SaveFileManifestEntry],
) -> Result<(), String> {
    if manifest.is_empty() {
        return std::fs::create_dir_all(dst_root).map_err(|e| e.to_string());
    }
    std::fs::create_dir_all(dst_root).map_err(|e| e.to_string())?;
    let dst_allowed = [dst_root.to_path_buf()];
    for item in manifest {
        let rel_os = item.rel_path.replace('/', std::path::MAIN_SEPARATOR_STR);
        let src_file = src_root.join(&rel_os);
        let dst_file = dst_root.join(&rel_os);
        crate::utils::ensure_strict_descendant_of_roots(&dst_file, &dst_allowed)?;
        if let Some(parent) = dst_file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if dst_file.exists() {
            if let Ok(meta) = std::fs::metadata(&dst_file) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&dst_file, perms);
                }
            }
        }
        {
            use std::io::Write;
            let mut reader = std::fs::File::open(&src_file).map_err(|e| e.to_string())?;
            let mut writer = std::fs::File::create(&dst_file).map_err(|e| e.to_string())?;
            let copied = std::io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
            if copied != item.size_bytes {
                return Err(format!(
                    "Incomplete manifest heal copy for '{}' ({} != {}).",
                    item.rel_path, copied, item.size_bytes
                ));
            }
            writer.flush().map_err(|e| e.to_string())?;
            writer.sync_all().map_err(|e| e.to_string())?;
        }
    }
    verify_save_tree_manifest(dst_root, manifest)
}

pub fn recover_stranded_airgap_if_needed(
    docs_dir: &Path,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<AirgapRecoveryReport, String> {
    let resolved_docs = resolve_docs_root(&docs_dir.to_string_lossy(), game_schema);
    let vault_opt = if vault_path.trim().is_empty() {
        None
    } else {
        Some(vault_path)
    };
    if !is_airgap_active_for_docs_with_vault(&resolved_docs, vault_opt, game_schema) {
        return Ok(AirgapRecoveryReport {
            recovered: false,
            healed_from_vault_mirror: false,
            restored_targets: 0,
            message: String::new(),
        });
    }

    let storage = resolve_airgap_storage_paths(&resolved_docs, vault_opt);
    let marker_file = storage.primary_airgap_root.join(".airgap_active.json");
    let current_instance = get_runtime_instance_id();

    let marker_instance = std::fs::read_to_string(&marker_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            v.get("instance_id")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        });
    let journal = load_airgap_journal(
        &storage.primary_airgap_root,
        Some(storage.secondary_vault_mirror.as_path()),
    );
    let journal_instance = journal.as_ref().map(|j| j.instance_id.clone());

    let is_owned_by_current_instance = marker_instance
        .as_deref()
        .or(journal_instance.as_deref())
        .map(|id| id == current_instance)
        .unwrap_or(false);

    let lab_session_active = LAB_SESSION
        .get()
        .and_then(|m| m.lock().ok())
        .map(|g| g.is_some())
        .unwrap_or(false);

    // Only auto-recover when the airgap belongs to a previous crashed/closed OS/app session
    // OR an interrupted mid-evacuation/mid-restore journal with no active Lab session.
    let interrupted_journal_phase = journal
        .as_ref()
        .map(|j| j.phase == "EVACUATING" || j.phase == "RESTORING")
        .unwrap_or(false);

    if is_owned_by_current_instance && (lab_session_active || !interrupted_journal_phase) {
        return Ok(AirgapRecoveryReport {
            recovered: false,
            healed_from_vault_mirror: false,
            restored_targets: 0,
            message: String::new(),
        });
    }

    // Never collide with a running game process during recovery
    if is_any_game_process_running(game_schema) {
        return Err("lab_err_game_running_saves_locked".to_string());
    }

    let healed_from_vault_mirror =
        heal_active_airgap_if_tampered(&resolved_docs, vault_opt, game_schema);
    let targets_count = resolve_deduplicated_save_targets(&resolved_docs, game_schema).len();
    let msg = apply_save_airgap_with_vault(
        &resolved_docs.to_string_lossy(),
        vault_opt,
        false,
        game_schema,
    )?;

    Ok(AirgapRecoveryReport {
        recovered: true,
        healed_from_vault_mirror,
        restored_targets: targets_count,
        message: msg,
    })
}

pub fn apply_save_airgap(
    docs_path: &str,
    enable: bool,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    apply_save_airgap_with_vault(docs_path, None, enable, game_schema)
}

pub fn apply_save_airgap_with_vault(
    docs_path: &str,
    explicit_vault_path: Option<&str>,
    enable: bool,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    let docs_dir = resolve_docs_root(docs_path, game_schema);
    if !docs_dir.exists() {
        return Ok("Documents directory not found".to_string());
    }
    if !crate::utils::is_safe_user_file_path(&docs_dir.join("__sanctuary_probe__")) {
        return Err("Refused to airgap unsafe system root path.".to_string());
    }

    let targets = resolve_deduplicated_save_targets(&docs_dir, game_schema);
    if targets.is_empty() {
        return Ok("No save airgap targets configured in schema".to_string());
    }

    // Refuse to swap save directories while the game executable is running and holding save locks
    wait_for_game_exit_before_airgap_swap(game_schema, if enable { 1500 } else { 4500 })?;

    let storage = resolve_airgap_storage_paths(&docs_dir, explicit_vault_path);
    migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, game_schema);

    let airgap_root = &storage.primary_airgap_root;
    let sandbox_root = &storage.sandbox_root;
    let ext_vault_dir = &storage.secondary_vault_mirror;
    let marker_file = airgap_root.join(".airgap_active.json");
    let existing_journal = load_airgap_journal(airgap_root, Some(ext_vault_dir.as_path()));
    let docs_allowed = [docs_dir.clone()];

    if enable {
        std::fs::create_dir_all(airgap_root)
            .map_err(|e| format!("Failed creating airgap root {:?}: {}", airgap_root, e))?;
        std::fs::create_dir_all(sandbox_root)
            .map_err(|e| format!("Failed creating sandbox root {:?}: {}", sandbox_root, e))?;
        std::fs::create_dir_all(ext_vault_dir)
            .map_err(|e| format!("Failed creating vault save mirror {:?}: {}", ext_vault_dir, e))?;
        if let Some(p) = airgap_root.parent() {
            set_hidden_dir_attribute(p, true);
        }
        if let Some(p) = sandbox_root.parent() {
            set_hidden_dir_attribute(p, true);
        }
        if let Some(p) = ext_vault_dir.parent() {
            set_hidden_dir_attribute(p, true);
        }

        let already_airgapped = marker_file.exists()
            || existing_journal
                .as_ref()
                .map(|j| j.phase == "ACTIVE" || j.phase == "EVACUATING")
                .unwrap_or(false);

        let mut target_journals: Vec<AirgapTargetJournal> = Vec::new();

        // Phase 1: Build manifests & write immortal additive Secondary Vault Mirror + EVACUATING journal BEFORE moving live saves
        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            if let Some(prev_tj) = existing_journal.as_ref().and_then(|j| {
                j.targets
                    .iter()
                    .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            }) {
                if already_airgapped || airgap_target.exists() {
                    target_journals.push(prev_tj.clone());
                    continue;
                }
            }

            if airgap_target.exists() {
                let manifest = build_save_tree_manifest(&airgap_target)?;
                if !manifest.is_empty() {
                    set_tree_readonly(&ext_target, false);
                    copy_save_tree_verified(&airgap_target, &ext_target)?;
                    verify_save_tree_manifest(&ext_target, &manifest)?;
                    set_tree_readonly(&ext_target, true);
                }
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: true,
                    manifest,
                });
            } else if live_target.exists() {
                let manifest = build_save_tree_manifest(&live_target)?;
                // IMMORTAL ADDITIVE VAULT RULE:
                // Never wipe or overwrite existing files in `secondary_vault_mirror` when live_target is empty;
                // when non-empty, merge/update verified live saves into `secondary_vault_mirror`!
                if !manifest.is_empty() {
                    set_tree_readonly(&ext_target, false);
                    copy_save_tree_verified(&live_target, &ext_target)?;
                    verify_save_tree_manifest(&ext_target, &manifest)?;
                    set_tree_readonly(&ext_target, true);
                }
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: true,
                    manifest,
                });
            } else {
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: false,
                    manifest: Vec::new(),
                });
            }
        }

        let mut journal = AirgapJournal {
            version: 3,
            phase: "EVACUATING".to_string(),
            instance_id: get_runtime_instance_id().to_string(),
            created_at_epoch: current_epoch_secs(),
            docs_dir: docs_dir.to_string_lossy().to_string(),
            vault_mirror_dir: ext_vault_dir.to_string_lossy().to_string(),
            targets: target_journals,
        };
        persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()))?;

        // Phase 2: Evacuate live save folders into external primary_airgap_root and swap in isolated sandbox folders
        for tj in &journal.targets {
            let target_name = &tj.target_name;
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let sandbox_target =
                crate::utils::resolve_case_insensitive_path(sandbox_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            let was_active_phase = existing_journal
                .as_ref()
                .map(|j| j.phase == "ACTIVE")
                .unwrap_or(false)
                || marker_file.exists();

            if !airgap_target.exists() {
                let mut healed_from_ext = false;
                if was_active_phase
                    && ext_target.exists()
                    && (tj.manifest.is_empty()
                        || verify_save_tree_manifest(&ext_target, &tj.manifest).is_ok())
                {
                    set_tree_readonly(&airgap_target, false);
                    copy_manifest_entries_verified(&ext_target, &airgap_target, &tj.manifest)?;
                    set_tree_readonly(&airgap_target, true);
                    healed_from_ext = true;
                }

                if !healed_from_ext && live_target.exists() && !was_active_phase {
                    if let Some(parent) = airgap_target.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    if std::fs::rename(&live_target, &airgap_target).is_err() {
                        copy_save_tree_verified(&live_target, &airgap_target)?;
                        verify_save_tree_manifest(&airgap_target, &tj.manifest)?;
                        remove_save_tree_strict(&live_target, &docs_allowed)?;
                    } else {
                        verify_save_tree_manifest(&airgap_target, &tj.manifest)?;
                    }
                    set_tree_readonly(&airgap_target, true);
                }
            } else {
                set_tree_readonly(&airgap_target, true);
            }

            let save_exts = resolve_save_extensions(game_schema);
            let allow_dir_slots = is_directory_save_mode(&save_exts);
            let mut state_meta = load_sandbox_state_meta(sandbox_root);

            // If Golden Homestead Baseline (`sandbox_target`) is empty/missing and was originally cloned
            // from a known live save slot, self-heal `sandbox_target` from the verified airgapped save!
            let mut golden_saves = list_saves_in_dir(&sandbox_target, &save_exts);
            if golden_saves.is_empty() && !state_meta.fresh_sandbox_armed {
                if let Some(ref src_name) = state_meta.source_live_save_name {
                    let healed_src = find_named_save_in_dir(&airgap_target, src_name, allow_dir_slots)
                        .or_else(|| find_named_save_in_dir(&ext_target, src_name, allow_dir_slots));
                    if let Some(src_path) = healed_src {
                        set_tree_readonly(&sandbox_target, false);
                        if copy_save_item_into_dir(&src_path, &sandbox_target, false).is_ok() {
                            set_tree_readonly(&sandbox_target, true);
                            golden_saves = list_saves_in_dir(&sandbox_target, &save_exts);
                        }
                    }
                }
            }

            let live_saves_safely_airgapped = tj.manifest.is_empty()
                || (airgap_target.exists()
                    && verify_save_tree_manifest(&airgap_target, &tj.manifest).is_ok());

            if (!golden_saves.is_empty() || state_meta.fresh_sandbox_armed) && live_saves_safely_airgapped {
                // Keep `sandbox_target` untouched & read-only, and mount a fresh disposable working copy in `live_target`!
                sync_golden_sandbox_to_working_dir(
                    &sandbox_target,
                    &live_target,
                    &docs_allowed,
                    state_meta.selected_save_name.as_deref(),
                    state_meta.fresh_sandbox_armed,
                    &save_exts,
                )?;
            } else {
                std::fs::create_dir_all(&live_target).map_err(|e| e.to_string())?;
                set_tree_readonly(&live_target, false);
                if !golden_saves.is_empty() {
                    set_tree_readonly(&sandbox_target, true);
                }
            }

            let effective_saves = if !golden_saves.is_empty() {
                golden_saves
            } else {
                list_saves_in_dir(&live_target, &save_exts)
            };
            if let Some(first_save) = effective_saves.first() {
                let existing_valid = state_meta
                    .selected_save_name
                    .as_deref()
                    .map(|m| {
                        effective_saves
                            .iter()
                            .any(|s| s.file_name.eq_ignore_ascii_case(m))
                    })
                    .unwrap_or(false);
                if !existing_valid {
                    state_meta.selected_save_name = Some(first_save.file_name.clone());
                }
                state_meta.fresh_sandbox_armed = false;
                let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
            } else if state_meta.selected_save_name.is_some() {
                state_meta.selected_save_name = None;
                let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
            }
        }

        journal.phase = "ACTIVE".to_string();
        persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()))?;

        let marker_payload = serde_json::json!({
            "active": true,
            "instance_id": get_runtime_instance_id(),
            "targets": targets,
            "vault_mirror_dir": journal.vault_mirror_dir,
        })
        .to_string();
        crate::utils::atomic_write_bytes(&marker_file, marker_payload.as_bytes())?;

        Ok("Saves physically airgapped and mirrored".to_string())
    } else {
        // Restore path (enable = false)
        if let Some(mut journal) = existing_journal.clone() {
            journal.phase = "RESTORING".to_string();
            let _ = persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()));
        }

        let airgap_allowed = [airgap_root.clone()];
        let save_exts = resolve_save_extensions(game_schema);
        let allow_dir_slots = is_directory_save_mode(&save_exts);

        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let sandbox_target =
                crate::utils::resolve_case_insensitive_path(sandbox_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            let target_journal = existing_journal.as_ref().and_then(|j| {
                j.targets
                    .iter()
                    .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            });
            let expected_manifest: &[SaveFileManifestEntry] = target_journal
                .map(|tj| tj.manifest.as_slice())
                .unwrap_or(&[]);
            let expected_non_empty = !expected_manifest.is_empty();

            // 1. Self-heal primary airgap_target from immortal secondary .lab_save_vault if missing or tampered
            let local_airgap_ok = airgap_target.exists()
                && (!expected_non_empty
                    || verify_save_tree_manifest(&airgap_target, expected_manifest).is_ok());

            if !local_airgap_ok
                && ext_target.exists()
                && (!expected_non_empty
                    || verify_save_tree_manifest(&ext_target, expected_manifest).is_ok())
            {
                set_tree_readonly(&airgap_target, false);
                if expected_non_empty {
                    copy_manifest_entries_verified(&ext_target, &airgap_target, expected_manifest)?;
                } else {
                    std::fs::create_dir_all(&airgap_target).map_err(|e| e.to_string())?;
                }
            }

            // 2. Safety check: if journal recorded live saves, refuse to move/clear live_target unless
            // we have a verified airgap_target OR live_target already holds the exact live saves (crash mid-restore).
            if expected_non_empty && !airgap_target.exists() {
                if verify_save_tree_manifest(&live_target, expected_manifest).is_ok() {
                    set_tree_readonly(&live_target, false);
                    continue;
                }
                return Err(format!(
                    "Refused to overwrite '{}' because neither primary airgap nor Vault save mirror passed verification.",
                    target_name
                ));
            }

            // Helper closure: rewind/discard mutated working save if a Golden Homestead Baseline already
            // exists in `sandbox_target`; otherwise promote only corruption-audited initial saves once!
            let reconcile_disposable_sandbox = |live_working_dir: &Path| -> Result<(), String> {
                let mut state_meta = load_sandbox_state_meta(sandbox_root);
                let has_golden_baseline = !list_saves_in_dir(&sandbox_target, &save_exts).is_empty();
                if has_golden_baseline {
                    // Discard mutated/saved disposable working copy so the Homestead test save NEVER corrupts!
                    remove_save_tree_strict(live_working_dir, &docs_allowed)?;
                    if let Some(ref src_name) = state_meta.source_live_save_name {
                        let baseline_slot =
                            find_named_save_in_dir(&sandbox_target, src_name, allow_dir_slots);
                        let needs_refresh = match baseline_slot {
                            Some(ref p) if p.is_file() => audit_save_file_corruption(p, None).is_err(),
                            Some(ref p) if p.is_dir() => compute_dir_save_slot_stats(p).is_none(),
                            _ => true,
                        };
                        if needs_refresh {
                            if let Some(clean_src) =
                                find_named_save_in_dir(&airgap_target, src_name, allow_dir_slots)
                                    .or_else(|| {
                                        find_named_save_in_dir(&ext_target, src_name, allow_dir_slots)
                                    })
                            {
                                set_tree_readonly(&sandbox_target, false);
                                let _ = copy_save_item_into_dir(&clean_src, &sandbox_target, false);
                            }
                        }
                    }
                    set_tree_readonly(&sandbox_target, true);
                } else {
                    // Initial unseeded Homestead world creation: promote only non-corrupted saves into Golden Baseline!
                    promote_valid_saves_into_golden_sandbox(
                        live_working_dir,
                        &sandbox_target,
                        &save_exts,
                    )?;
                    remove_save_tree_strict(live_working_dir, &docs_allowed)?;
                    if let Some(first_promoted) = list_saves_in_dir(&sandbox_target, &save_exts).first() {
                        state_meta.selected_save_name = Some(first_promoted.file_name.clone());
                        state_meta.fresh_sandbox_armed = false;
                        let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
                    }
                }
                Ok(())
            };

            if airgap_target.exists() {
                if expected_non_empty {
                    verify_save_tree_manifest(&airgap_target, expected_manifest)?;
                }
                set_tree_readonly(&airgap_target, false);

                if live_target.exists() {
                    let is_sandbox = existing_journal.is_some() || marker_file.exists();
                    if is_sandbox {
                        reconcile_disposable_sandbox(&live_target)?;
                    } else {
                        // Unexpected un-marked live files appeared alongside airgap: merge non-destructively into live_target
                        copy_save_tree_verified(&airgap_target, &live_target)?;
                        if expected_non_empty {
                            verify_save_tree_manifest(&live_target, expected_manifest)?;
                        }
                        remove_save_tree_strict(&airgap_target, &airgap_allowed)?;
                    }
                }

                if airgap_target.exists() {
                    if let Some(parent) = live_target.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    if std::fs::rename(&airgap_target, &live_target).is_err() {
                        copy_save_tree_verified(&airgap_target, &live_target)?;
                        if expected_non_empty {
                            verify_save_tree_manifest(&live_target, expected_manifest)?;
                        }
                        remove_save_tree_strict(&airgap_target, &airgap_allowed)?;
                    } else if expected_non_empty {
                        verify_save_tree_manifest(&live_target, expected_manifest)?;
                    }
                }
            } else if target_journal.is_some() && live_target.exists() {
                // Player originally had no live save files before entering the Lab:
                // reconcile disposable sandbox & recreate an empty writable live_target directory!
                reconcile_disposable_sandbox(&live_target)?;
            }

            // Always guarantee live_target directory exists and is writable on exit
            let _ = std::fs::create_dir_all(&live_target);
            set_tree_readonly(&live_target, false);
            if expected_non_empty {
                verify_save_tree_manifest(&live_target, expected_manifest)?;
            }
        }

        // Remove active airgap journal markers ONLY — NEVER delete `secondary_vault_mirror` save backups!
        let _ = std::fs::remove_file(&marker_file);
        let _ = std::fs::remove_file(airgap_root.join(".airgap_journal.json"));
        let _ = std::fs::remove_file(ext_vault_dir.join(".airgap_journal.json"));
        set_tree_readonly(ext_vault_dir, true);

        Ok("Live saves verified and restored from airgap".to_string())
    }
}

#[tauri::command]
pub async fn recover_interrupted_lab_airgap(
    docs_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<AirgapRecoveryReport, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        recover_stranded_airgap_if_needed(&docs_dir, &vault_path, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_lab_test_save_status(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let docs_dir = resolve_docs_root(&docs_path, &game_schema);
    Ok(compute_lab_test_save_status(&docs_dir, &game_schema))
}

fn copy_save_item_into_dir(
    src_path: &Path,
    dst_dir: &Path,
    touch_now: bool,
) -> Result<String, String> {
    if !src_path.exists() {
        return Err(format!("Source save {:?} does not exist.", src_path));
    }
    std::fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;
    let dst_allowed = [dst_dir.to_path_buf()];
    let clean_fname = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Invalid save filename.".to_string())?;
    let dst_path = dst_dir.join(&clean_fname);
    crate::utils::ensure_strict_descendant_of_roots(&dst_path, &dst_allowed)?;

    if src_path.is_dir() {
        set_tree_readonly(&dst_path, false);
        copy_save_tree_verified(src_path, &dst_path)?;
        set_tree_readonly(&dst_path, false);
    } else {
        if dst_path.exists() {
            if let Ok(meta) = std::fs::metadata(&dst_path) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&dst_path, perms);
                }
            }
        }
        {
            use std::io::Write;
            let mut reader = std::fs::File::open(src_path).map_err(|e| e.to_string())?;
            let mut writer = std::fs::File::create(&dst_path).map_err(|e| e.to_string())?;
            let copied = std::io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
            let expected_len = std::fs::metadata(src_path).map_err(|e| e.to_string())?.len();
            if copied != expected_len {
                return Err(format!(
                    "Incomplete save copy for '{}' ({} of {} bytes).",
                    clean_fname, copied, expected_len
                ));
            }
            writer.flush().map_err(|e| e.to_string())?;
            writer.sync_all().map_err(|e| e.to_string())?;
        }
        if touch_now {
            let now_ft = filetime::FileTime::from_system_time(std::time::SystemTime::now());
            let _ = filetime::set_file_mtime(&dst_path, now_ft);
        } else if let Ok(src_meta) = std::fs::metadata(src_path) {
            if let Ok(mtime) = src_meta.modified() {
                let _ = filetime::set_file_mtime(&dst_path, filetime::FileTime::from_system_time(mtime));
            }
        }
        // Also copy any rolling companion backup revisions (e.g. "<clean_fname>.*") in the same source folder
        if let Some(src_parent) = src_path.parent() {
            let prefix_lower = format!("{}.", clean_fname.to_lowercase());
            if let Ok(entries) = std::fs::read_dir(src_parent) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if !ep.is_file() {
                        continue;
                    }
                    let ename = entry.file_name().to_string_lossy().to_string();
                    if ename.to_lowercase().starts_with(&prefix_lower)
                        && !is_temporary_or_internal_save_artifact(&ename.to_lowercase())
                    {
                        let comp_dst = dst_dir.join(&ename);
                        if crate::utils::ensure_strict_descendant_of_roots(&comp_dst, &dst_allowed)
                            .is_ok()
                        {
                            if comp_dst.exists() {
                                if let Ok(m) = std::fs::metadata(&comp_dst) {
                                    let mut p = m.permissions();
                                    p.set_readonly(false);
                                    let _ = std::fs::set_permissions(&comp_dst, p);
                                }
                            }
                            let _ = std::fs::copy(&ep, &comp_dst);
                        }
                    }
                }
            }
        }
    }
    Ok(clean_fname)
}

#[tauri::command]
pub async fn configure_lab_test_save(
    docs_path: String,
    mode: String,
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        configure_lab_test_save_internal(
            &docs_path,
            &mode,
            source_save_name,
            external_file_paths,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn collect_external_save_input_paths(
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    if let Some(list) = external_file_paths {
        for raw in list {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                let key = crate::utils::normalize_path_key(&p);
                if seen.insert(key) {
                    paths.push(p);
                }
            }
        }
    }
    if let Some(raw_lines) = source_save_name {
        for line in raw_lines.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                let key = crate::utils::normalize_path_key(&p);
                if seen.insert(key) {
                    paths.push(p);
                }
            }
        }
    }
    paths
}

fn configure_lab_test_save_internal(
    docs_path: &str,
    mode: &str,
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<LabTestSaveStatus, String> {
    let docs_dir = resolve_docs_root(docs_path, game_schema);
    let targets = resolve_deduplicated_save_targets(&docs_dir, game_schema);
    let primary_save_rel = targets
        .first()
        .cloned()
        .ok_or_else(|| "No save airgap target configured in active GameSchema.".to_string())?;
    let save_exts = resolve_save_extensions(game_schema);
    let allow_dir_slots = is_directory_save_mode(&save_exts);

    let storage = resolve_airgap_storage_paths(&docs_dir, None);
    migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, game_schema);
    let airgap_active = is_airgap_active_for_docs(&docs_dir, game_schema);

    let game_running = is_any_game_process_running(game_schema);
    if mode != "select_sandbox_save" && game_running {
        return Err("lab_err_game_running_saves_locked".to_string());
    }

    let sandbox_saves_dir =
        crate::utils::resolve_case_insensitive_path(&storage.sandbox_root, &primary_save_rel);
    let working_saves_dir =
        crate::utils::resolve_case_insensitive_path(&docs_dir, &primary_save_rel);
    let live_saves_dir = if airgap_active {
        crate::utils::resolve_case_insensitive_path(
            &storage.primary_airgap_root,
            &primary_save_rel,
        )
    } else {
        working_saves_dir.clone()
    };
    let vault_mirror_dir = crate::utils::resolve_case_insensitive_path(
        &storage.secondary_vault_mirror,
        &primary_save_rel,
    );

    if airgap_active
        && list_saves_in_dir(&sandbox_saves_dir, &save_exts).is_empty()
        && !load_sandbox_state_meta(&storage.sandbox_root).fresh_sandbox_armed
        && working_saves_dir.exists()
    {
        let _ = promote_valid_saves_into_golden_sandbox(
            &working_saves_dir,
            &sandbox_saves_dir,
            &save_exts,
        );
    }

    let _ = std::fs::create_dir_all(&sandbox_saves_dir);
    set_tree_readonly(&sandbox_saves_dir, false);
    let sandbox_allowed = [sandbox_saves_dir.clone()];

    let refresh_airgap_journal_if_active = || -> Result<(), String> {
        if !airgap_active {
            return Ok(());
        }
        if let Some(mut journal) = load_airgap_journal(
            &storage.primary_airgap_root,
            Some(storage.secondary_vault_mirror.as_path()),
        ) {
            let updated_manifest = build_save_tree_manifest(&live_saves_dir)?;
            if let Some(tj) = journal
                .targets
                .iter_mut()
                .find(|t| t.target_name.eq_ignore_ascii_case(&primary_save_rel))
            {
                tj.had_live_target = true;
                tj.manifest = updated_manifest;
            }
            set_tree_readonly(&live_saves_dir, true);
            persist_airgap_journal(
                &journal,
                &storage.primary_airgap_root,
                Some(storage.secondary_vault_mirror.as_path()),
            )?;
        }
        Ok(())
    };

    match mode {
        "reset_for_fresh_save" => {
            if airgap_active
                && load_airgap_journal(
                    &storage.primary_airgap_root,
                    Some(storage.secondary_vault_mirror.as_path()),
                )
                .is_none()
            {
                return Err(
                    "Refused to reset active sandbox without a verified Save Airgap journal."
                        .to_string(),
                );
            }

            for entry in walkdir::WalkDir::new(&sandbox_saves_dir)
                .max_depth(2)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if matches_save_filename(&fname, &save_exts)
                        && crate::utils::ensure_strict_descendant_of_roots(
                            entry.path(),
                            &sandbox_allowed,
                        )
                        .is_ok()
                    {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
            if allow_dir_slots {
                if let Ok(entries) = std::fs::read_dir(&sandbox_saves_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if p.is_dir()
                            && !name.starts_with('.')
                            && crate::utils::ensure_strict_descendant_of_roots(
                                &p,
                                &sandbox_allowed,
                            )
                            .is_ok()
                        {
                            set_tree_readonly(&p, false);
                            let _ = std::fs::remove_dir_all(&p);
                        }
                    }
                }
            }
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: None,
                    fresh_sandbox_armed: true,
                    source_live_save_name: None,
                },
            )?;
        }
        "select_sandbox_save" => {
            let target_name = source_save_name
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "No sandbox save selected.".to_string())?;
            let prev_meta = load_sandbox_state_meta(&storage.sandbox_root);
            if let Some(slot_path) =
                find_named_save_in_dir(&sandbox_saves_dir, &target_name, allow_dir_slots)
            {
                touch_save_slot_mtime_now(&slot_path);
            }
            let preserved_live_source = prev_meta
                .source_live_save_name
                .filter(|src| src.eq_ignore_ascii_case(&target_name));
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: Some(target_name),
                    fresh_sandbox_armed: false,
                    source_live_save_name: preserved_live_source,
                },
            )?;
        }
        "copy_live_save" => {
            let target_name = source_save_name
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    list_saves_in_dir(&live_saves_dir, &save_exts)
                        .first()
                        .map(|s| s.file_name.clone())
                })
                .ok_or_else(|| "No save slot selected or available in live saves.".to_string())?;

            let src_path =
                find_named_save_in_dir(&live_saves_dir, &target_name, allow_dir_slots)
                    .ok_or_else(|| {
                        format!("Could not locate save '{}' in live saves.", target_name)
                    })?;

            let clean_fname = copy_save_item_into_dir(&src_path, &sandbox_saves_dir, true)?;
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: Some(clean_fname.clone()),
                    fresh_sandbox_armed: false,
                    source_live_save_name: Some(clean_fname),
                },
            )?;
        }
        "import_external_save" => {
            let paths = collect_external_save_input_paths(source_save_name, external_file_paths);
            if paths.is_empty() {
                return Err("No external save file selected.".to_string());
            }
            let mut last_copied_name: Option<String> = None;
            for p in paths {
                if !crate::utils::is_safe_user_file_path(&p) {
                    return Err("Selected path is outside safe user file boundaries.".to_string());
                }
                if p.is_dir() && !allow_dir_slots {
                    copy_save_tree_verified(&p, &sandbox_saves_dir)?;
                    if let Some(newest) = list_saves_in_dir(&p, &save_exts).first() {
                        last_copied_name = Some(newest.file_name.clone());
                    }
                } else {
                    let fname = copy_save_item_into_dir(&p, &sandbox_saves_dir, true)?;
                    last_copied_name = Some(fname);
                }
            }
            if let Some(sel) = last_copied_name {
                save_sandbox_state_meta(
                    &storage.sandbox_root,
                    &SandboxStateMeta {
                        selected_save_name: Some(sel),
                        fresh_sandbox_armed: false,
                        source_live_save_name: None,
                    },
                )?;
            }
        }
        "import_to_live_saves" => {
            let paths = collect_external_save_input_paths(source_save_name, external_file_paths);
            if paths.is_empty() {
                return Err("No external save file selected.".to_string());
            }
            std::fs::create_dir_all(&live_saves_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&live_saves_dir, false);
            std::fs::create_dir_all(&vault_mirror_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&vault_mirror_dir, false);

            let mut first_sandbox_candidate: Option<PathBuf> = None;
            for p in &paths {
                if !crate::utils::is_safe_user_file_path(p) {
                    return Err("Selected path is outside safe user file boundaries.".to_string());
                }
                if p.is_dir() && !allow_dir_slots {
                    copy_save_tree_verified(p, &live_saves_dir)?;
                    let _ = copy_save_tree_verified(p, &vault_mirror_dir);
                    if first_sandbox_candidate.is_none() {
                        if let Some(newest) = list_saves_in_dir(&live_saves_dir, &save_exts).first() {
                            let cand = live_saves_dir.join(&newest.file_name);
                            if cand.exists() {
                                first_sandbox_candidate = Some(cand);
                            }
                        }
                    }
                } else {
                    let _ = copy_save_item_into_dir(p, &live_saves_dir, false)?;
                    let _ = copy_save_item_into_dir(p, &vault_mirror_dir, false);
                    if first_sandbox_candidate.is_none() {
                        first_sandbox_candidate = Some(p.clone());
                    }
                }
            }
            set_tree_readonly(&vault_mirror_dir, true);
            refresh_airgap_journal_if_active()?;

            if let Some(first_src) = first_sandbox_candidate {
                let sel = copy_save_item_into_dir(&first_src, &sandbox_saves_dir, true)?;
                save_sandbox_state_meta(
                    &storage.sandbox_root,
                    &SandboxStateMeta {
                        selected_save_name: Some(sel.clone()),
                        fresh_sandbox_armed: false,
                        source_live_save_name: Some(sel),
                    },
                )?;
            }
        }
        "restore_from_vault_mirror" => {
            let source_dir = if vault_mirror_dir.exists()
                && !list_saves_in_dir(&vault_mirror_dir, &save_exts).is_empty()
            {
                vault_mirror_dir.clone()
            } else if let Some(clean_ws_dir) =
                find_clean_world_state_save_dir(&docs_dir, None, &primary_save_rel, game_schema)
            {
                clean_ws_dir
            } else {
                return Err(
                    "No saves found in Vault Save Mirror or Time Capsule snapshots.".to_string(),
                );
            };

            std::fs::create_dir_all(&live_saves_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&live_saves_dir, false);
            copy_save_tree_verified(&source_dir, &live_saves_dir)?;

            // Ensure the Secondary Vault Mirror also holds an immortal read-only copy
            if source_dir != vault_mirror_dir {
                let _ = std::fs::create_dir_all(&vault_mirror_dir);
                set_tree_readonly(&vault_mirror_dir, false);
                let _ = copy_save_tree_verified(&source_dir, &vault_mirror_dir);
                set_tree_readonly(&vault_mirror_dir, true);
            }
            refresh_airgap_journal_if_active()?;

            let restored_saves = list_saves_in_dir(&live_saves_dir, &save_exts);
            if sandbox_saves_dir.exists()
                && list_saves_in_dir(&sandbox_saves_dir, &save_exts).is_empty()
            {
                if let Some(newest) = restored_saves.first() {
                    let cand = live_saves_dir.join(&newest.file_name);
                    if cand.exists() {
                        if let Ok(sel) = copy_save_item_into_dir(&cand, &sandbox_saves_dir, true)
                        {
                            let _ = save_sandbox_state_meta(
                                &storage.sandbox_root,
                                &SandboxStateMeta {
                                    selected_save_name: Some(sel.clone()),
                                    fresh_sandbox_armed: false,
                                    source_live_save_name: Some(sel),
                                },
                            );
                        }
                    }
                }
            }
        }
        _ => return Err(format!("Unsupported Lab Test Save mode: {}", mode)),
    }

    // Seal Golden Homestead Baseline read-only, and if airgap is currently mounted while game is closed,
    // refresh the disposable working folder (`docs_dir/<target>`) from the Golden Baseline!
    set_tree_readonly(&sandbox_saves_dir, true);
    if airgap_active
        && !game_running
        && load_airgap_journal(
            &storage.primary_airgap_root,
            Some(storage.secondary_vault_mirror.as_path()),
        )
        .is_some()
    {
        let updated_meta = load_sandbox_state_meta(&storage.sandbox_root);
        let docs_allowed = [docs_dir.clone()];
        let _ = sync_golden_sandbox_to_working_dir(
            &sandbox_saves_dir,
            &working_saves_dir,
            &docs_allowed,
            updated_meta.selected_save_name.as_deref(),
            updated_meta.fresh_sandbox_armed,
            &save_exts,
        );
    }

    Ok(compute_lab_test_save_status(&docs_dir, game_schema))
}

#[tauri::command]
pub async fn airgap_saves(
    docs_path: String,
    enable: bool,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let vault_path = get_saved_coordinates().vault_path;
        apply_save_airgap_with_vault(
            &docs_path,
            if vault_path.trim().is_empty() {
                None
            } else {
                Some(vault_path.as_str())
            },
            enable,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_airgap_status(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<AirgapStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);
        let storage = resolve_airgap_storage_paths(&docs_dir, None);
        migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, &game_schema);
        let airgap_root = &storage.primary_airgap_root;

        let mut protected_files_count = 0usize;
        for t in &targets {
            let dir = crate::utils::resolve_case_insensitive_path(airgap_root, t);
            if dir.exists() {
                for entry in walkdir::WalkDir::new(&dir)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        if !is_airgap_internal_marker_name(&fname_lower) {
                            protected_files_count += 1;
                        }
                    }
                }
            }
        }

        Ok(AirgapStatus {
            active: is_airgap_active_for_docs(&docs_dir, &game_schema),
            targets,
            airgap_path: airgap_root.to_string_lossy().to_string(),
            protected_files_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn launch_external_tool(
    tool_path: String,
    args: Option<Vec<String>>,
    docs_path: Option<String>,
    enforce_airgap: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let exe_path = PathBuf::from(tool_path.trim());
    let is_app_bundle = exe_path.is_dir()
        && exe_path
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("app"));
    if !exe_path.exists() || (!exe_path.is_file() && !is_app_bundle) {
        return Err("backend_exe_not_found".to_string());
    }

    let ext_lower = exe_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let allowed_ext = matches!(
        ext_lower.as_str(),
        "exe" | "bat" | "cmd" | "app" | "sh" | "appimage"
    ) || (cfg!(target_os = "linux") && ext_lower.is_empty());
    if !allowed_ext {
        return Err("Invalid external tool extension.".to_string());
    }

    let file_name_lower = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let blocked_lolbins = [
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        "wscript.exe",
        "cscript.exe",
        "mshta.exe",
        "rundll32.exe",
        "regsvr32.exe",
        "certutil.exe",
        "bitsadmin.exe",
    ];
    if blocked_lolbins.contains(&file_name_lower.as_str()) {
        return Err("Blocked system shell or binary.".to_string());
    }

    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let resolved_docs = docs_path.unwrap_or_default();
    if enforce_airgap.unwrap_or(true) {
        let _ = apply_save_airgap(&resolved_docs, true, &game_schema);
    }

    if cfg!(target_os = "macos") && is_app_bundle {
        let mut cmd = std::process::Command::new("open");
        sanitize_game_spawn_env(&mut cmd);
        cmd.arg("-a").arg(&exe_path);
        if let Some(arg_list) = args {
            let cleaned_args: Vec<String> = arg_list
                .into_iter()
                .filter(|a| !a.trim().is_empty())
                .collect();
            if !cleaned_args.is_empty() {
                cmd.arg("--args");
                for a in cleaned_args {
                    cmd.arg(a);
                }
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
        if let Some(arg_list) = args {
            for a in arg_list {
                if !a.trim().is_empty() {
                    wine_cmd.arg(a);
                }
            }
        }
        return match wine_cmd.spawn() {
            Ok(_) => Ok("backend_external_tool_started".to_string()),
            Err(e) => Err(e.to_string()),
        };
    }

    let mut cmd = std::process::Command::new(&exe_path);
    sanitize_game_spawn_env(&mut cmd);
    cmd.current_dir(parent_dir);
    if let Some(arg_list) = args {
        for a in arg_list {
            if !a.trim().is_empty() {
                cmd.arg(a);
            }
        }
    }

    match cmd.spawn() {
        Ok(_) => Ok("backend_external_tool_started".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn cleanup_routed_links(vault_path: &str) {
    if vault_path.trim().is_empty() {
        return;
    }
    let mut payloads = Vec::new();
    if let Some((raw, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
        payloads.push(raw);
        crate::utils::delete_vault_kv(vault_path, "routed_links");
    }
    let manifest_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.json");
    if manifest_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_file) {
            payloads.push(content);
        }
        let _ = std::fs::remove_file(&manifest_file);
    }

    for content in payloads {
        if let Ok(records) = serde_json::from_str::<Vec<RoutedFileRecord>>(&content) {
            for rec in records {
                let target = PathBuf::from(&rec.target_path);
                if target.exists() || std::fs::symlink_metadata(&target).is_ok() {
                    let _ = std::fs::remove_file(&target);
                }
                if let Some(bak_str) = rec.backup_path {
                    let bak = PathBuf::from(&bak_str);
                    if bak.exists() {
                        let _ = std::fs::rename(&bak, &target);
                    }
                }
            }
        }
    }
}

pub fn resolve_route_for_file(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Option<(PathBuf, PathBuf, bool)> {
    if source.is_dir() || routes.is_empty() {
        return None;
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| format!(".{}", s.to_lowercase()))
        .unwrap_or_default();
    let rel_norm = rel_hint.replace('\\', "/");
    let rel_trimmed = rel_norm.trim_matches('/');
    let rel_lower = rel_trimmed.to_lowercase();

    for route in routes {
        let ext_matched = !route.extensions.is_empty()
            && route.extensions.iter().any(|re| {
                let clean = if re.starts_with('.') {
                    re.to_lowercase()
                } else {
                    format!(".{}", re.to_lowercase())
                };
                clean == ext
            });

        let mut matched_subpath: Option<String> = None;
        let folder_matched = if let Some(fm) = route
            .folder_match
            .as_deref()
            .map(|s| s.trim().trim_matches('/').replace('\\', "/"))
            .filter(|s| !s.is_empty())
        {
            let fm_lower = fm.to_lowercase();
            let segs: Vec<&str> = rel_trimmed.split('/').filter(|s| !s.is_empty()).collect();
            let fm_segs: Vec<&str> = fm_lower.split('/').filter(|s| !s.is_empty()).collect();
            let mut found_after: Option<String> = None;
            if !fm_segs.is_empty() && segs.len() > fm_segs.len() {
                for start in 0..=(segs.len() - fm_segs.len() - 1) {
                    let window_matches = segs[start..start + fm_segs.len()]
                        .iter()
                        .zip(fm_segs.iter())
                        .all(|(a, b)| a.eq_ignore_ascii_case(b));
                    if window_matches {
                        found_after = Some(segs[start + fm_segs.len()..].join("/"));
                        break;
                    }
                }
            }
            if let Some(after) = found_after {
                matched_subpath = Some(after);
                true
            } else {
                rel_lower.contains(&fm_lower)
            }
        } else {
            false
        };

        if ext_matched || folder_matched {
            let base_root = match route.target_root.to_lowercase().as_str() {
                "live_path" | "engine" | "game" => live_root,
                "docs_path" | "documents" | "docs" | "user_data" => docs_root,
                _ => mods_dir,
            };
            if base_root.as_os_str().is_empty() {
                continue;
            }
            let target_dir = if route.target_subdir.trim().is_empty() {
                base_root.to_path_buf()
            } else {
                crate::utils::resolve_case_insensitive_path(base_root, &route.target_subdir)
            };

            let rel_dest = if let Some(sub) = matched_subpath.filter(|s| !s.is_empty()) {
                sub
            } else {
                source.file_name()?.to_string_lossy().to_string()
            };
            let rel_dest_path = Path::new(&rel_dest);
            if !rel_dest_path
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
            {
                continue;
            }

            let target_file = crate::utils::resolve_case_insensitive_path(&target_dir, &rel_dest);
            let allowed_roots = [base_root.to_path_buf()];
            if crate::utils::ensure_strict_descendant_of_roots(&target_file, &allowed_roots)
                .is_err()
                || !crate::utils::is_safe_user_file_path(&target_file)
            {
                continue;
            }

            return Some((
                target_file,
                base_root.to_path_buf(),
                route.preserve_vanilla.unwrap_or(true),
            ));
        }
    }
    None
}

pub fn route_file_if_matched(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Option<RoutedFileRecord> {
    let (target_file, _base_root, preserve_vanilla) = resolve_route_for_file(
        source,
        rel_hint,
        routes,
        live_root,
        docs_root,
        mods_dir,
    )?;

    if let Some(parent_dir) = target_file.parent() {
        let _ = std::fs::create_dir_all(parent_dir);
    }

    let bak_path = PathBuf::from(format!(
        "{}.sanctuary_vanilla_bak",
        target_file.to_string_lossy()
    ));
    let mut recorded_bak: Option<String> = None;

    if target_file.exists() || std::fs::symlink_metadata(&target_file).is_ok() {
        let is_symlink = std::fs::read_link(&target_file).is_ok()
            || std::fs::symlink_metadata(&target_file)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);

        if preserve_vanilla && !is_symlink && !bak_path.exists() {
            if std::fs::rename(&target_file, &bak_path).is_ok() {
                recorded_bak = Some(bak_path.to_string_lossy().to_string());
            } else {
                let _ = std::fs::remove_file(&target_file);
            }
        } else {
            let _ = std::fs::remove_file(&target_file);
            if bak_path.exists() {
                recorded_bak = Some(bak_path.to_string_lossy().to_string());
            }
        }
    } else if bak_path.exists() {
        recorded_bak = Some(bak_path.to_string_lossy().to_string());
    }

    let linked = create_symlink_file(source, &target_file)
        .or_else(|_| std::fs::hard_link(source, &target_file))
        .or_else(|_| std::fs::copy(source, &target_file).map(|_| ()));

    if linked.is_ok() {
        return Some(RoutedFileRecord {
            target_path: target_file.to_string_lossy().to_string(),
            backup_path: recorded_bak,
            source_path: source.to_string_lossy().to_string(),
        });
    }
    None
}

fn is_internal_sanctuary_or_archive_skip(
    file_name_lower: &str,
    ext_lower: &str,
    manifest_lower: &str,
    supported_exts_lower: &[String],
) -> bool {
    if file_name_lower.starts_with(".sanctuary")
        || file_name_lower.starts_with("._")
        || file_name_lower == SANCTUARY_EDGE_MANIFEST_FILE
        || file_name_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || file_name_lower == "desktop.ini"
        || file_name_lower == ".ds_store"
        || file_name_lower == "thumbs.db"
        || (!manifest_lower.is_empty() && file_name_lower == manifest_lower)
    {
        return true;
    }

    if matches!(ext_lower, "zip" | "rar" | "7z")
        && !supported_exts_lower.iter().any(|s| s == ext_lower)
    {
        return true;
    }

    false
}

struct DeployGuard {
    flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
    last_deploy_epoch_ms: std::sync::Arc<std::sync::atomic::AtomicU64>,
}
impl Drop for DeployGuard {
    fn drop(&mut self) {
        self.last_deploy_epoch_ms.store(
            crate::utils::current_epoch_ms(),
            std::sync::atomic::Ordering::SeqCst,
        );
        self.flag.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn deploy_playset_bulk(
    mods: Vec<DeployMod>,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();

    let is_deploying = state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = state.inner().last_deploy_epoch_ms.clone();
    if is_deploying
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err("Deployment or scan already in progress.".into());
    }
    let guard = DeployGuard {
        flag: is_deploying,
        last_deploy_epoch_ms,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;

        let mods_dir = PathBuf::from(&mods_path);
        let vault_dir = PathBuf::from(&vault_path);

        let vault_mods_lane = if crate::utils::is_mods_dir(&vault_dir) {
            vault_dir.clone()
        } else {
            vault_dir.join("Mods")
        };

        if !mods_dir.exists() {
            return Err("Mods folder missing.".into());
        }

        cleanup_routed_links(&vault_path);
        safe_wipe_mods_dir(&mods_dir, &game_schema);

        crate::game_logic::generate_manifest_if_needed(&game_schema, &mods_dir);

        let mut vault_index = std::collections::HashMap::new();
        let priority_folders = crate::game_logic::get_priority_folders(&game_schema);
        let load_strategy = crate::game_logic::get_load_order_strategy(&game_schema);
        let install_routes = crate::game_logic::get_install_routes(&game_schema);
        let config_exts = crate::game_logic::get_config_extensions(&game_schema);
        let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(&game_schema);
        let supported_exts_lower: Vec<String> =
            crate::game_logic::get_supported_extensions(&game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();
        let manifest_lower = crate::game_logic::resolve_manifest_filename(&game_schema)
            .unwrap_or_default()
            .to_lowercase();

        crate::utils::deduplicate_vault_root_configs(&vault_mods_lane, &config_exts, &game_schema);
        let saved_coords = get_saved_coordinates();
        if let Ok(live_ver) = crate::commands::game_info::rip_game_version_with_schema(
            &saved_coords.live_path,
            &game_schema,
        ) {
            let _ = crate::utils::sync_vault_mod_versions_for_game(&vault_path, &live_ver, &[]);
        }
        let live_root =
            crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, &game_schema);
        let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
            &saved_coords,
            &game_schema,
        ));
        let routed_records: std::sync::Mutex<Vec<RoutedFileRecord>> =
            std::sync::Mutex::new(Vec::new());
        let deployed_links: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

        fn populate_vault_index(
            dir: &PathBuf,
            index: &mut std::collections::HashMap<String, PathBuf>,
        ) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        populate_vault_index(&path, index);
                    } else if path.is_file() {
                        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                            index.insert(file_name.to_lowercase(), path.clone());
                        }
                    }
                }
            }
        }

        for f in priority_folders.iter().rev() {
            let dir_path = if f.is_empty() {
                vault_mods_lane.clone()
            } else {
                vault_mods_lane.join(f)
            };
            populate_vault_index(&dir_path, &mut vault_index);
        }

        let mods_for_manifest = mods.clone();
        let mods_allowed_roots = [mods_dir.clone()];

        let record_deployed_path = |p: &Path| {
            if let Ok(mut dl) = deployed_links.lock() {
                let p_str = p.to_string_lossy().to_string();
                if !dl.contains(&p_str) {
                    dl.push(p_str);
                }
            }
        };

        use rayon::prelude::*;
        let count: usize = mods
            .into_par_iter()
            .map(|m| {
                let folders_to_check: Vec<&str> =
                    priority_folders.iter().map(|s| s.as_str()).collect();

                if let Some(structure_val) = &m.folder_structure {
                    if let Ok(nodes) =
                        serde_json::from_value::<Vec<StructureNode>>(structure_val.clone())
                    {
                        if !nodes.is_empty() {
                            let linked = process_structure_nodes(
                                &game_schema,
                                &nodes,
                                &mods_dir,
                                &vault_mods_lane,
                                &folders_to_check,
                                Some(&deployed_links),
                            );
                            if linked > 0 {
                                return linked;
                            }
                        }
                    }
                }

                let mut search_name = Path::new(&m.path);
                let mut detected_tier_folder: Option<String> = m
                    .priority_tier
                    .clone()
                    .filter(|s| !s.is_empty() && s != "default");

                loop {
                    let mut stripped_any = false;
                    for pf in &priority_folders {
                        if !pf.is_empty() {
                            if let Ok(stripped) = search_name.strip_prefix(pf) {
                                if detected_tier_folder.is_none() {
                                    detected_tier_folder =
                                        Some(pf.trim_start_matches('!').to_string());
                                }
                                search_name = stripped;
                                stripped_any = true;
                                break;
                            }
                        }
                    }
                    if !stripped_any {
                        break;
                    }
                }

                let mut source = vault_mods_lane.join(search_name);
                let mut found = false;

                if search_name.components().count() == 1 {
                    if let Some(file_name_str) = search_name.to_str() {
                        let file_lower = file_name_str.to_lowercase();
                        if let Some(p) = vault_index.get(&file_lower) {
                            source = p.clone();
                            found = true;
                        } else {
                            let stem_lower = search_name
                                .file_stem()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_lowercase();
                            for ext in &supported_exts_lower {
                                let test_name = format!("{}.{}", stem_lower, ext);
                                if let Some(p) = vault_index.get(&test_name) {
                                    source = p.clone();
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if !found {
                    for f in &folders_to_check {
                        let base_test = if f.is_empty() {
                            vault_mods_lane.join(search_name)
                        } else {
                            vault_mods_lane.join(f).join(search_name)
                        };

                        if base_test.is_file() || base_test.is_dir() {
                            source = base_test;
                            found = true;
                            break;
                        } else {
                            for ext in &supported_exts_lower {
                                if base_test.with_extension(ext).is_file() {
                                    source = base_test.with_extension(ext);
                                    found = true;
                                    break;
                                }
                            }
                            if found {
                                break;
                            }
                        }
                    }
                }

                if !found {
                    if let Some(file_name_only) = search_name.file_name() {
                        let file_lower = file_name_only.to_string_lossy().to_lowercase();
                        if let Some(p) = vault_index.get(&file_lower) {
                            source = p.clone();
                            found = true;
                            search_name = Path::new(file_name_only);
                        } else {
                            let flat_test = vault_mods_lane.join(file_name_only);
                            if flat_test.is_file() {
                                source = flat_test;
                                found = true;
                                search_name = Path::new(file_name_only);
                            } else {
                                for ext in &supported_exts_lower {
                                    if flat_test.with_extension(ext).is_file() {
                                        source = flat_test.with_extension(ext);
                                        found = true;
                                        search_name = Path::new(file_name_only);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                if !found || Path::new(&m.path).components().count() == 0 {
                    return 0;
                }

                if !source.is_dir() {
                    let fname_lower = source
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    let ext_lower = source
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();
                    if is_internal_sanctuary_or_archive_skip(
                        &fname_lower,
                        &ext_lower,
                        &manifest_lower,
                        &supported_exts_lower,
                    ) {
                        return 0;
                    }

                    if let Some(rec) = route_file_if_matched(
                        &source,
                        &m.path,
                        &install_routes,
                        &live_root,
                        &docs_root,
                        &mods_dir,
                    ) {
                        if let Ok(mut guard) = routed_records.lock() {
                            if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                guard.push(rec);
                            }
                        }
                        return 1;
                    }
                }

                let mut target = if let Some(ref t_path) = m.target_path {
                    mods_dir.join(t_path)
                } else {
                    mods_dir.join(search_name)
                };

                if load_strategy == "folder_priority" {
                    if let Some(ref tier_folder) = detected_tier_folder {
                        if !tier_folder.is_empty() {
                            if let Some(ref t_path) = m.target_path {
                                let mut clean_t = Path::new(t_path);
                                loop {
                                    let mut stripped_any = false;
                                    for pf in &priority_folders {
                                        if !pf.is_empty() {
                                            if let Ok(stripped) = clean_t.strip_prefix(pf) {
                                                clean_t = stripped;
                                                stripped_any = true;
                                                break;
                                            }
                                        }
                                    }
                                    if !stripped_any {
                                        break;
                                    }
                                }
                                target = mods_dir.join(tier_folder).join(clean_t);
                            } else {
                                target = mods_dir.join(tier_folder).join(search_name);
                            }
                        }
                    }
                } else if load_strategy == "numeric_prefix" {
                    if let Some(order_idx) = m.load_order_index {
                        if let Some(fname) = target.file_name().and_then(|n| n.to_str()) {
                            let sep = game_schema
                                .as_ref()
                                .and_then(|s| s.load_order.as_ref())
                                .and_then(|lo| lo.prefix_separator.as_deref())
                                .unwrap_or("_");
                            let prefix_fmt = game_schema
                                .as_ref()
                                .and_then(|s| s.load_order.as_ref())
                                .and_then(|lo| lo.prefix_format.as_deref())
                                .filter(|f| !f.is_empty());
                            let idx_num = order_idx + 1;
                            let formatted_prefix = if let Some(fmt_str) = prefix_fmt {
                                if fmt_str.contains("{index:03}") {
                                    fmt_str.replace("{index:03}", &format!("{:03}", idx_num))
                                } else if fmt_str.contains("{index:02}") {
                                    fmt_str.replace("{index:02}", &format!("{:02}", idx_num))
                                } else if fmt_str.contains("{index}") {
                                    fmt_str.replace("{index}", &idx_num.to_string())
                                } else {
                                    format!("{:03}{}", idx_num, sep)
                                }
                            } else {
                                format!("{:03}{}", idx_num, sep)
                            };
                            let prefixed_name = format!("{}{}", formatted_prefix, fname);
                            target = target.with_file_name(prefixed_name);
                        }
                    }
                }

                if crate::utils::ensure_strict_descendant_of_roots(&target, &mods_allowed_roots)
                    .is_err()
                {
                    return 0;
                }

                // Directory-rooted mod unit: deploy full nested tree preserving relative subpaths
                if source.is_dir() {
                    let mut dir_linked = 0usize;
                    for entry in walkdir::WalkDir::new(&source)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if !entry.file_type().is_file() {
                            continue;
                        }
                        let file_path = entry.path();
                        let Ok(rel_in_mod) = file_path.strip_prefix(&source) else {
                            continue;
                        };
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        let ext_lower = file_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if is_internal_sanctuary_or_archive_skip(
                            &fname_lower,
                            &ext_lower,
                            &manifest_lower,
                            &supported_exts_lower,
                        ) {
                            continue;
                        }

                        let rel_route_hint = format!(
                            "{}/{}",
                            m.path.trim_matches('/'),
                            rel_in_mod.to_string_lossy().replace('\\', "/")
                        );
                        if let Some(rec) = route_file_if_matched(
                            file_path,
                            &rel_route_hint,
                            &install_routes,
                            &live_root,
                            &docs_root,
                            &mods_dir,
                        ) {
                            if let Ok(mut guard) = routed_records.lock() {
                                if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                    guard.push(rec);
                                }
                            }
                            dir_linked += 1;
                            continue;
                        }

                        let dest = target.join(rel_in_mod);
                        if crate::utils::ensure_strict_descendant_of_roots(
                            &dest,
                            &mods_allowed_roots,
                        )
                        .is_err()
                        {
                            continue;
                        }
                        if let Some(parent) = dest.parent() {
                            let _ = std::fs::create_dir_all(parent);
                            let mut cur = Some(parent);
                            while let Some(dir_anc) = cur {
                                if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir)
                                {
                                    break;
                                }
                                record_deployed_path(dir_anc);
                                cur = dir_anc.parent();
                            }
                        }
                        if create_symlink_file(file_path, &dest)
                            .or_else(|_| std::fs::hard_link(file_path, &dest))
                            .or_else(|_| std::fs::copy(file_path, &dest).map(|_| ()))
                            .is_ok()
                        {
                            record_deployed_path(&dest);
                            dir_linked += 1;
                        }
                    }
                    return usize::from(dir_linked > 0);
                }

                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                    let mut cur = Some(parent);
                    while let Some(dir_anc) = cur {
                        if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir) {
                            break;
                        }
                        record_deployed_path(dir_anc);
                        cur = dir_anc.parent();
                    }
                }

                let _ = create_symlink_file(&source, &target)
                    .or_else(|_| std::fs::hard_link(&source, &target))
                    .or_else(|_| std::fs::copy(&source, &target).map(|_| ()));
                record_deployed_path(&target);

                // Schema-configured twin extensions only (zero game-specific fallbacks)
                if let Some(ext) = source.extension().and_then(|e| e.to_str()) {
                    let ext_clean = ext.trim_start_matches('.').to_lowercase();
                    let mut twin_exts: Vec<String> = Vec::new();
                    if let Some(ref s) = game_schema {
                        if let Some(ref groups) = s.extensions.twin_extensions {
                            for group in groups {
                                let cleaned_group: Vec<String> = group
                                    .iter()
                                    .map(|g| g.trim_start_matches('.').to_lowercase())
                                    .filter(|g| !g.is_empty())
                                    .collect();
                                if cleaned_group.contains(&ext_clean) {
                                    for sibling in cleaned_group {
                                        if sibling != ext_clean && !twin_exts.contains(&sibling) {
                                            twin_exts.push(sibling);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    for other_ext in twin_exts {
                        let twin_source = source.with_extension(&other_ext);
                        if twin_source.exists() {
                            let twin_target = target.with_extension(&other_ext);
                            let _ = create_symlink_file(&twin_source, &twin_target)
                                .or_else(|_| std::fs::hard_link(&twin_source, &twin_target))
                                .or_else(|_| std::fs::copy(&twin_source, &twin_target).map(|_| ()));
                            record_deployed_path(&twin_target);
                        }
                    }
                }

                // Preserve companion configs AND full nested auxiliary asset subtrees inside mod folders
                if let Some(source_parent) = source.parent() {
                    if let Some(target_parent) = target.parent() {
                        let mut is_top_level = source_parent == vault_mods_lane.as_path();
                        for f in &folders_to_check {
                            if !f.is_empty() {
                                let f_path = vault_mods_lane.join(f);
                                if source_parent == f_path.as_path() {
                                    is_top_level = true;
                                    break;
                                }
                            }
                        }
                        if !is_top_level {
                            let max_aux_depth = if preserve_aux { 16 } else { 1 };
                            for entry in walkdir::WalkDir::new(source_parent)
                                .max_depth(max_aux_depth)
                                .into_iter()
                                .filter_map(|e| e.ok())
                            {
                                if !entry.file_type().is_file() {
                                    continue;
                                }
                                let path = entry.path();
                                if path == source {
                                    continue;
                                }
                                let Ok(rel_sub) = path.strip_prefix(source_parent) else {
                                    continue;
                                };
                                let fname_lower =
                                    entry.file_name().to_string_lossy().to_lowercase();
                                let ext_lower = path
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_lowercase())
                                    .unwrap_or_default();
                                if is_internal_sanctuary_or_archive_skip(
                                    &fname_lower,
                                    &ext_lower,
                                    &manifest_lower,
                                    &supported_exts_lower,
                                ) {
                                    continue;
                                }

                                // Do not auto-pull disabled primary mod modules unless they are configs or auxiliary assets
                                if !preserve_aux && !config_exts.contains(&ext_lower) {
                                    continue;
                                }

                                let rel_sub_str = rel_sub.to_string_lossy().replace('\\', "/");
                                if let Some(rec) = route_file_if_matched(
                                    path,
                                    &rel_sub_str,
                                    &install_routes,
                                    &live_root,
                                    &docs_root,
                                    &mods_dir,
                                ) {
                                    if let Ok(mut guard) = routed_records.lock() {
                                        if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                            guard.push(rec);
                                        }
                                    }
                                    continue;
                                }

                                // Skip sibling primary mod binaries in the same folder that were NOT in the active playset,
                                // while deploying all auxiliary assets (.dds, .nif, .pex, .wem, .json, configs, subfolders, etc.)
                                let is_separate_primary_mod_binary = !supported_exts_lower.is_empty()
                                    && supported_exts_lower.contains(&ext_lower)
                                    && !config_exts.contains(&ext_lower);
                                if is_separate_primary_mod_binary {
                                    continue;
                                }

                                let dest = target_parent.join(rel_sub);
                                if crate::utils::ensure_strict_descendant_of_roots(
                                    &dest,
                                    &mods_allowed_roots,
                                )
                                .is_err()
                                {
                                    continue;
                                }
                                if !dest.exists() && std::fs::symlink_metadata(&dest).is_err() {
                                    if let Some(dest_parent) = dest.parent() {
                                        let _ = std::fs::create_dir_all(dest_parent);
                                        let mut cur = Some(dest_parent);
                                        while let Some(dir_anc) = cur {
                                            if dir_anc == mods_dir.as_path()
                                                || !dir_anc.starts_with(&mods_dir)
                                            {
                                                break;
                                            }
                                            record_deployed_path(dir_anc);
                                            cur = dir_anc.parent();
                                        }
                                    }
                                    if create_symlink_file(path, &dest)
                                        .or_else(|_| std::fs::hard_link(path, &dest))
                                        .or_else(|_| std::fs::copy(path, &dest).map(|_| ()))
                                        .is_ok()
                                    {
                                        record_deployed_path(&dest);
                                    }
                                }
                            }
                        }
                    }
                }

                1
            })
            .sum();

        if let Ok(guard) = routed_records.lock() {
            if !guard.is_empty() {
                if let Ok(json) = serde_json::to_string_pretty(&*guard) {
                    crate::utils::set_vault_kv(&vault_path, "routed_links", &json);
                }
            }
        }

        if load_strategy == "manifest_list" {
            let mut sorted_mods = mods_for_manifest;
            sorted_mods.sort_by_key(|m| m.load_order_index.unwrap_or(0));
            let ordered_files: Vec<String> = sorted_mods
                .into_iter()
                .map(|m| {
                    m.target_path
                        .unwrap_or_else(|| {
                            Path::new(&m.path)
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string()
                        })
                        .replace("\\", "/")
                })
                .collect();
            crate::game_logic::write_load_order_manifest(&game_schema, &mods_dir, &ordered_files);
        }

        if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                        let fname_lower = file_name.to_lowercase();
                        let ext_lower = path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if file_name.starts_with('.')
                            || is_internal_sanctuary_or_archive_skip(
                                &fname_lower,
                                &ext_lower,
                                &manifest_lower,
                                &supported_exts_lower,
                            )
                        {
                            continue;
                        }
                        if config_exts.contains(&ext_lower) {
                            let dest = mods_dir.join(file_name);
                            let already_deployed_by_subfolder = deployed_links
                                .lock()
                                .map(|dl| {
                                    dl.iter().any(|existing| {
                                        Path::new(existing)
                                            .file_name()
                                            .and_then(|n| n.to_str())
                                            .map_or(false, |n| n.eq_ignore_ascii_case(file_name))
                                    })
                                })
                                .unwrap_or(false);
                            if !already_deployed_by_subfolder
                                && !dest.exists()
                                && std::fs::symlink_metadata(&dest).is_err()
                            {
                                let _ = create_symlink_file(&path, &dest)
                                    .or_else(|_| std::fs::hard_link(&path, &dest))
                                    .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
                                record_deployed_path(&dest);
                            }
                        }
                    }
                }
            }
        }

        if let Ok(dl) = deployed_links.lock() {
            if !dl.is_empty() {
                if let Ok(json) = serde_json::to_string_pretty(&*dl) {
                    let _ = crate::utils::atomic_write_bytes(
                        &mods_dir.join(".sanctuary_deployed_links.json"),
                        json.as_bytes(),
                    );
                    crate::utils::set_vault_kv(&vault_path, "deployed_links", &json);
                }
            }
        }

        Ok(count.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn wipe_symlinks(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let config = get_saved_coordinates();
    cleanup_routed_links(&config.vault_path);
    let target_mods_path = if !config.mods_path.trim().is_empty() {
        &config.mods_path
    } else {
        &config.live_path
    };
    let mods_dir = std::path::PathBuf::from(target_mods_path);
    if !mods_dir.exists() {
        return Ok("No Mods folder".into());
    }
    let before_entries = std::fs::read_dir(&mods_dir)
        .map(|it| it.filter_map(Result::ok).count())
        .unwrap_or(0);
    crate::utils::safe_wipe_mods_dir(&mods_dir, &game_schema);
    let after_entries = std::fs::read_dir(&mods_dir)
        .map(|it| it.filter_map(Result::ok).count())
        .unwrap_or(0);
    let cleaned = before_entries.saturating_sub(after_entries);
    Ok(format!("{} active links severed.", cleaned))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabVerificationCertificate {
    pub dna_hash: String,
    pub mod_name: String,
    pub verified_at: u64,
    pub active_seconds: u32,
    pub baseline_ram_mb: u64,
    pub peak_ram_mb: u64,
    pub disk_read_mb: u64,
    pub save_file_verified: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LabNotificationLabels {
    pub failed_title: Option<String>,
    pub timer_complete_title: Option<String>,
    pub timer_complete_body: Option<String>,
    pub verified_title: Option<String>,
    pub verified_body: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabVerificationStatus {
    pub active: bool,
    pub dna_hash: String,
    pub mod_name: String,
    pub stage: String,
    pub pause_reason: Option<String>,
    pub tracked_pid: Option<u32>,
    pub baseline_ram_mb: u64,
    pub current_ram_mb: u64,
    pub peak_ram_mb: u64,
    pub ram_step_percent: u32,
    pub disk_read_mb: u64,
    pub min_disk_read_mb: u64,
    pub min_ram_step_percent: u32,
    pub required_active_seconds: u32,
    pub elapsed_active_seconds: u32,
    pub remaining_active_seconds: u32,
    pub max_idle_seconds: u32,
    pub current_idle_seconds: u32,
    pub is_focused: bool,
    pub require_focus: bool,
    pub require_save_checkpoint: bool,
    pub seeded_save_present: bool,
    pub verified_save_name: Option<String>,
    pub linked_files: Vec<String>,
    pub error_log: Option<String>,
    pub certificate: Option<LabVerificationCertificate>,
}

#[derive(Clone, Debug)]
struct SaveSlotSnapshot {
    mtime_ms: u128,
    size_bytes: u64,
    fingerprint: String,
}

#[derive(Clone, Debug)]
struct PendingSaveCandidate {
    path: PathBuf,
    display_name: String,
    prev_size_bytes: Option<u64>,
    observed_size_bytes: u64,
    observed_mtime_ms: u128,
    detected_epoch: u64,
}

#[derive(Serialize, Clone, Debug)]
struct LabMilestoneEvent {
    kind: String,
    title: String,
    body: String,
    dna_hash: String,
    mod_name: String,
    is_error: bool,
}

struct ActiveLabSession {
    dna_hash: String,
    mod_name: String,
    docs_dir: PathBuf,
    vault_path: String,
    executable_names: Vec<String>,
    save_targets: Vec<String>,
    save_extensions: Vec<String>,
    scratch_subdirs: Vec<String>,
    stage: String,
    pause_reason: Option<String>,
    started_at_epoch: u64,
    boot_detected_epoch: Option<u64>,
    menu_entered_epoch: Option<u64>,
    menu_had_focused_input: bool,
    menu_active_input_seconds: u32,
    world_load_settle_ticks: u32,
    world_post_settle_input_ticks: u32,
    awaiting_save_since_epoch: Option<u64>,
    awaiting_save_since_ms: u128,
    last_save_reminder_epoch: u64,
    save_reminder_count: u8,
    stage4_disk_write_bytes: u64,
    pending_save_candidate: Option<PendingSaveCandidate>,
    verified_save_name: Option<String>,
    tracked_pid: Option<u32>,
    missing_process_ticks: u32,
    last_focused_epoch: u64,
    baseline_ram_bytes: u64,
    baseline_disk_read_bytes: u64,
    current_ram_bytes: u64,
    cumulative_disk_read_bytes: u64,
    cumulative_disk_write_bytes: u64,
    prev_ram_bytes: u64,
    prev_disk_read_bytes: u64,
    prev_disk_write_bytes: u64,
    current_cpu_usage: f32,
    active_cpu_ema: f32,
    sim_freeze_ticks: u32,
    boot_plateau_ticks: u32,
    peak_ram_bytes: u64,
    peak_world_ram_delta_bytes: u64,
    required_active_seconds: u32,
    elapsed_active_seconds: u32,
    pending_idle_seconds: u32,
    recent_input_mask: u16,
    stage3_ticks: u32,
    consecutive_active_input_ticks: u32,
    stage3_loading_cooldown_ticks: u32,
    enable_hotkey_pause_detection: bool,
    pause_key_vk_codes: Vec<u32>,
    resume_key_vk_codes: Vec<u32>,
    hotkey_menu_paused: bool,
    hotkey_sim_paused: bool,
    prev_vk_down: HashSet<u32>,
    camera_drag_subticks: u8,
    gamepad_packets: [u32; 4],
    gamepad_connected_mask: u8,
    last_xinput_probe_epoch: u64,
    last_gamepad_input_epoch: u64,
    max_idle_seconds: u32,
    current_idle_seconds: u32,
    require_focus: bool,
    is_focused: bool,
    require_save_checkpoint: bool,
    stabilize_boot_seconds: u32,
    min_disk_read_mb: u64,
    min_ram_step_percent: u32,
    warm_cache_ram_step_percent: u32,
    seeded_save_present: bool,
    seeded_baseline_save_size: Option<u64>,
    initial_save_snapshots: HashMap<PathBuf, SaveSlotSnapshot>,
    initial_scratch_files: HashMap<PathBuf, (u64, u128)>,
    deployed_payload_fingerprints: Vec<(PathBuf, u64, String)>,
    last_integrity_sweep_epoch: u64,
    last_poll_epoch: u64,
    linked_files: Vec<String>,
    notification_labels: LabNotificationLabels,
    notified_awaiting_save: bool,
    notified_verified: bool,
    notified_failed: bool,
    error_log: Option<String>,
    certificate: Option<LabVerificationCertificate>,
    sys: sysinfo::System,
}

static LAB_SESSION: std::sync::OnceLock<std::sync::Mutex<Option<ActiveLabSession>>> =
    std::sync::OnceLock::new();
static LAB_SESSION_GENERATION: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

fn close_lab_overlay(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        if let Some(win) = app_handle.get_webview_window("lab-hud-overlay") {
            let _ = win.close();
        }
    });
}

fn synthesize_lab_chime_wav(kind: &str) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 44_100;
    let notes: &[(f32, u32, f32)] = match kind {
        "stage3_started" => &[(523.25, 110, 0.34), (783.99, 175, 0.38)],
        "timer_complete" => &[
            (587.33, 105, 0.44),
            (739.99, 105, 0.46),
            (880.00, 115, 0.48),
            (1174.66, 250, 0.52),
            (0.0, 55, 0.0),
            (1174.66, 220, 0.52),
        ],
        "verified" => &[
            (523.25, 110, 0.42),
            (659.25, 110, 0.44),
            (1046.50, 290, 0.50),
        ],
        "failed" => &[(440.00, 160, 0.45), (311.13, 270, 0.48)],
        _ => &[(659.25, 130, 0.38), (880.00, 190, 0.42)],
    };

    let mut samples: Vec<i16> = Vec::with_capacity(SAMPLE_RATE as usize);
    let mut phase_primary: f32 = 0.0;
    let mut phase_overtone: f32 = 0.0;

    for &(freq, dur_ms, amp) in notes {
        let count = ((SAMPLE_RATE as u64 * dur_ms as u64) / 1000) as usize;
        if count == 0 {
            continue;
        }
        if freq <= 1.0 || amp <= 0.0 {
            samples.extend(std::iter::repeat(0i16).take(count));
            phase_primary = 0.0;
            phase_overtone = 0.0;
            continue;
        }
        let attack_samples = ((SAMPLE_RATE as usize) * 8 / 1000).max(1);
        let step_primary = std::f32::consts::TAU * freq / (SAMPLE_RATE as f32);
        let step_overtone = std::f32::consts::TAU * (freq * 2.0) / (SAMPLE_RATE as f32);

        for i in 0..count {
            let progress = (i as f32) / (count as f32);
            let attack_env = if i < attack_samples {
                (i as f32) / (attack_samples as f32)
            } else {
                1.0
            };
            let decay_env = (1.0 - progress).powf(1.35);
            let env = attack_env * decay_env * amp;
            let wave = (phase_primary.sin() * 0.82) + (phase_overtone.sin() * 0.18);
            let pcm = (wave * env * 32_000.0).clamp(-32_760.0, 32_760.0) as i16;
            samples.push(pcm);

            phase_primary = (phase_primary + step_primary).rem_euclid(std::f32::consts::TAU);
            phase_overtone = (phase_overtone + step_overtone).rem_euclid(std::f32::consts::TAU);
        }
    }

    let data_bytes = (samples.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + data_bytes as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // Mono
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_bytes.to_le_bytes());
    for s in samples {
        wav.extend_from_slice(&s.to_le_bytes());
    }
    wav
}

fn play_native_lab_chime(kind: &str) {
    let kind_owned = kind.to_string();
    std::thread::spawn(move || {
        let wav = synthesize_lab_chime_wav(&kind_owned);

        #[cfg(target_os = "windows")]
        unsafe {
            #[link(name = "winmm")]
            extern "system" {
                fn PlaySoundW(
                    psz_sound: *const u8,
                    hmod: *mut std::ffi::c_void,
                    fdw_sound: u32,
                ) -> i32;
            }
            #[link(name = "user32")]
            extern "system" {
                fn MessageBeep(u_type: u32) -> i32;
            }
            // SND_SYNC (0x0000) | SND_NODEFAULT (0x0002) | SND_MEMORY (0x0004)
            let ok = PlaySoundW(wav.as_ptr(), std::ptr::null_mut(), 0x0004 | 0x0002);
            if ok == 0 {
                let _ = MessageBeep(if kind_owned == "failed" {
                    0x00000010
                } else {
                    0x00000040
                });
            }
        }

        #[cfg(target_os = "macos")]
        {
            let tmp_wav = std::env::temp_dir().join(format!(
                "sanctuary_chime_{}_{}.wav",
                std::process::id(),
                current_epoch_millis_u128()
            ));
            if std::fs::write(&tmp_wav, &wav).is_ok() {
                let _ = std::process::Command::new("afplay")
                    .arg(&tmp_wav)
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
                let _ = std::fs::remove_file(&tmp_wav);
            }
        }

        #[cfg(target_os = "linux")]
        {
            let tmp_wav = std::env::temp_dir().join(format!(
                "sanctuary_chime_{}_{}.wav",
                std::process::id(),
                current_epoch_millis_u128()
            ));
            if std::fs::write(&tmp_wav, &wav).is_ok() {
                for player in ["pw-play", "paplay", "aplay"] {
                    if let Ok(st) = std::process::Command::new(player)
                        .arg(&tmp_wav)
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .status()
                    {
                        if st.success() {
                            break;
                        }
                    }
                }
                let _ = std::fs::remove_file(&tmp_wav);
            }
        }
    });
}

fn notify_player_over_game(
    app: &tauri::AppHandle,
    milestone_kind: &str,
    title: &str,
    body: &str,
    is_error: bool,
    dna_hash: &str,
    mod_name: &str,
) {
    // Passive OS audio mixer chime + OS toast + taskbar flash ONLY —
    // never inject a transparent click-through window or overlay into the game!
    play_native_lab_chime(milestone_kind);

    let _ = app.emit(
        "sanctuary-lab-milestone",
        LabMilestoneEvent {
            kind: milestone_kind.to_string(),
            title: title.to_string(),
            body: body.to_string(),
            dna_hash: dna_hash.to_string(),
            mod_name: mod_name.to_string(),
            is_error,
        },
    );

    if let Some(win) = app.get_webview_window("main") {
        // Informational taskbar highlight never steals foreground focus from fullscreen games
        let _ = win.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }

    let _ = crate::commands::system::send_sanctuary_notification(
        app.clone(),
        title.to_string(),
        body.to_string(),
    );
}

#[cfg(target_os = "windows")]
fn poll_focused_hotkey_pause_subtick() {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }

    let Ok(mut guard) = get_lab_session_mutex().lock() else {
        return;
    };
    let Some(session) = guard.as_mut() else {
        return;
    };

    // Strictly opt-in per Master Schema (`enable_hotkey_pause_detection: false` in default.json)
    // and ONLY while the game window is focused in settled world gameplay!
    let settled_menu_handoff =
        session.stage == "MENU_WAITING" && session.world_load_settle_ticks >= 3;
    if !session.enable_hotkey_pause_detection
        || (session.stage != "ACTIVE_TESTING" && !settled_menu_handoff)
        || !session.is_focused
    {
        session.prev_vk_down.clear();
        session.camera_drag_subticks = 0;
        return;
    }

    // Verify foreground HWND still belongs to our tracked game process before sampling VK edges
    if let Some(pid) = session.tracked_pid {
        let still_fg = unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() || IsIconic(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
                false
            } else {
                let mut fg_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                if fg_pid == pid {
                    true
                } else if fg_pid != 0 {
                    session
                        .sys
                        .process(sysinfo::Pid::from_u32(fg_pid))
                        .map(|fg_proc| {
                            process_matches_game_candidates(
                                fg_pid,
                                fg_proc,
                                &session.executable_names,
                            )
                        })
                        .unwrap_or(false)
                } else {
                    false
                }
            }
        };
        if !still_fg {
            session.prev_vk_down.clear();
            session.camera_drag_subticks = 0;
            return;
        }
    }

    let is_vk_down = |vk: u32| -> bool {
        if vk == 0 || vk > 255 {
            return false;
        }
        unsafe { ((GetAsyncKeyState(vk as i32) as u16) & 0x8000) != 0 }
    };

    let check_rising_edge = |vk: u32, prev_set: &mut HashSet<u32>| -> bool {
        let down = is_vk_down(vk);
        let was_down = prev_set.contains(&vk);
        if down {
            prev_set.insert(vk);
        } else {
            prev_set.remove(&vk);
        }
        down && !was_down
    };

    // 1. Universal Escape Menu Toggle (VK_ESCAPE = 27)
    if check_rising_edge(27, &mut session.prev_vk_down) {
        session.hotkey_menu_paused = !session.hotkey_menu_paused;
        session.camera_drag_subticks = 0;
    }

    // 2. Schema Resume Hotkeys (e.g. Speed 1/2/3: 49, 50, 51, 97, 98, 99)
    let resume_vks = session.resume_key_vk_codes.clone();
    for vk in resume_vks {
        if check_rising_edge(vk, &mut session.prev_vk_down) {
            session.hotkey_sim_paused = false;
            session.hotkey_menu_paused = false;
            session.camera_drag_subticks = 0;
        }
    }

    // 3. Schema Pause Hotkeys (e.g. 0 / Numpad 0 = explicit pause; 192 `~` = toggle pause)
    let pause_vks = session.pause_key_vk_codes.clone();
    for vk in pause_vks {
        if check_rising_edge(vk, &mut session.prev_vk_down) {
            if vk == 192 {
                // If save loaded in paused state and player taps `~` in the first 3 ticks to unpause, don't invert!
                if session.stage3_ticks > 3 || session.hotkey_sim_paused {
                    session.hotkey_sim_paused = !session.hotkey_sim_paused;
                }
            } else {
                session.hotkey_sim_paused = true;
            }
        }
    }

    // 4. Auto-clear `hotkey_menu_paused` if the player clicked "Resume Game" with Left-Mouse
    // and then panned/rotated/zoomed the 3D world camera (WASD / Arrow keys / QEZ / ,. / PgUp-PgDn / Right- or Middle-Mouse hold >= 200ms).
    // Moving the cursor or Left-Clicking inside the Esc Pause Menu NEVER triggers this!
    if session.hotkey_menu_paused {
        const CAMERA_OR_MOVE_VKS: [u32; 20] = [
            0x02, // VK_RBUTTON (3D camera rotate hold)
            0x04, // VK_MBUTTON (3D camera pitch/orbit hold)
            0x57, // W
            0x41, // A
            0x53, // S
            0x44, // D
            0x51, // Q
            0x45, // E
            0x5A, // Z
            0x58, // X
            0xBC, // , (< rotate)
            0xBE, // . (> rotate)
            0x21, // PageUp
            0x22, // PageDown
            0x23, // End
            0x24, // Home
            0x25, // Left
            0x26, // Up
            0x27, // Right
            0x28, // Down
        ];
        let any_camera_control_held = CAMERA_OR_MOVE_VKS.iter().copied().any(is_vk_down);
        if any_camera_control_held {
            session.camera_drag_subticks = session.camera_drag_subticks.saturating_add(1);
            if session.camera_drag_subticks >= 2 {
                session.hotkey_menu_paused = false;
                session.camera_drag_subticks = 0;
            }
        } else {
            session.camera_drag_subticks = 0;
        }
    } else {
        session.camera_drag_subticks = 0;
    }

    if session.stage == "ACTIVE_TESTING" && (session.hotkey_menu_paused || session.hotkey_sim_paused) {
        session.pending_idle_seconds = 0;
        session.consecutive_active_input_ticks = 0;
        session.pause_reason = Some("GAME_PAUSED".to_string());
    }
}

#[cfg(not(target_os = "windows"))]
fn poll_focused_hotkey_pause_subtick() {}

struct Stage3TickMetrics {
    dt: u32,
    matched_process_stopped: bool,
    require_focus: bool,
    is_focused: bool,
    hotkey_paused: bool,
    baseline_ram_bytes: u64,
    current_ram_bytes: u64,
    ram_diff_bytes: u64,
    disk_io_bytes_this_tick: u64,
    current_cpu_usage: f32,
    current_idle_seconds: u32,
    max_idle_seconds: u32,
    required_active_seconds: u32,
}

fn evaluate_stage3_pause_and_credit(
    m: &Stage3TickMetrics,
    peak_world_ram_delta_bytes: &mut u64,
    elapsed_active_seconds: &mut u32,
    pending_idle_seconds: &mut u32,
    recent_input_mask: &mut u16,
    stage3_ticks: &mut u32,
    active_cpu_ema: &mut f32,
    sim_freeze_ticks: &mut u32,
    consecutive_active_input_ticks: &mut u32,
    stage3_loading_cooldown_ticks: &mut u32,
) -> Option<String> {
    let current_world_delta = m.current_ram_bytes.saturating_sub(m.baseline_ram_bytes);
    if current_world_delta > *peak_world_ram_delta_bytes {
        *peak_world_ram_delta_bytes = current_world_delta;
    }

    // Proportional world-unload threshold so both lightweight 2D and heavy 3D engines catch returning to Main Menu
    let min_world_delta_floor =
        (m.baseline_ram_bytes / 6).clamp(16 * 1024 * 1024, 64 * 1024 * 1024);
    let unloaded_back_to_menu = *peak_world_ram_delta_bytes >= min_world_delta_floor
        && current_world_delta < (*peak_world_ram_delta_bytes / 5);

    if m.matched_process_stopped {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }
    if m.require_focus && !m.is_focused {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("UNFOCUSED".to_string());
    }
    if unloaded_back_to_menu {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("MAIN_MENU".to_string());
    }

    // Pause the timer ONLY on unmistakable heavy secondary zone/lot loading bursts (never on routine scratch file touches)
    let heavy_zone_loading_now = m.disk_io_bytes_this_tick >= 24 * 1024 * 1024
        || (m.disk_io_bytes_this_tick >= 10 * 1024 * 1024 && m.ram_diff_bytes >= 40 * 1024 * 1024);
    if heavy_zone_loading_now {
        *stage3_loading_cooldown_ticks = 2;
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("LOADING_WORLD".to_string());
    }
    if *stage3_loading_cooldown_ticks > 0 {
        let settle_tol = (m.current_ram_bytes / 180).clamp(2 * 1024 * 1024, 12 * 1024 * 1024);
        if m.disk_io_bytes_this_tick <= 2 * 1024 * 1024 && m.ram_diff_bytes <= settle_tol {
            *stage3_loading_cooldown_ticks = stage3_loading_cooldown_ticks.saturating_sub(1);
        }
        if *stage3_loading_cooldown_ticks > 0 {
            *pending_idle_seconds = 0;
            *consecutive_active_input_ticks = 0;
            return Some("LOADING_WORLD".to_string());
        }
    }

    // Schema opt-in Pause / Escape Menu hotkey state (100ms rising-edge tracker)
    if m.hotkey_paused {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    *stage3_ticks = stage3_ticks.saturating_add(1);
    let active_input_now = m.current_idle_seconds <= 1;
    *recent_input_mask = ((*recent_input_mask << 1) | u16::from(active_input_now)) & 0x03FF;

    // Natural gameplay cadence ceiling (8..=12s) so watching an animation/interaction for a few seconds
    // NEVER throws false IDLE pauses, while going hands-off on a clicked Pause Menu stops & discards buffered time!
    let effective_idle_limit = m.max_idle_seconds.clamp(8, 12);
    if m.current_idle_seconds > effective_idle_limit {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("IDLE".to_string());
    }

    let static_memory_and_disk =
        m.ram_diff_bytes < 512 * 1024 && m.disk_io_bytes_this_tick < 64 * 1024;

    // Only flag CPU-drop simulation freeze when the player is NOT actively giving live gameplay input (`idle >= 3`),
    // eliminating false `GAME_PAUSED` triggers during normal in-lot CPU fluctuations!
    if m.current_idle_seconds >= 3
        && *active_cpu_ema >= 12.0
        && m.current_cpu_usage < (*active_cpu_ema * 0.45)
        && static_memory_and_disk
    {
        *sim_freeze_ticks = sim_freeze_ticks.saturating_add(1);
    } else if active_input_now
        || m.current_cpu_usage >= (*active_cpu_ema * 0.65)
        || !static_memory_and_disk
    {
        *sim_freeze_ticks = 0;
    }

    if *sim_freeze_ticks >= 3 {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    // Detect sparse periodic anti-AFK key-tapping once every several seconds on a static pause menu
    let sparse_pause_tapping = *stage3_ticks >= 10
        && recent_input_mask.count_ones() <= 2
        && m.current_idle_seconds >= 3
        && static_memory_and_disk
        && (*active_cpu_ema < 5.0 || m.current_cpu_usage < (*active_cpu_ema * 0.50));
    if sparse_pause_tapping {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    if m.current_idle_seconds <= 3 {
        if active_input_now {
            *consecutive_active_input_ticks = consecutive_active_input_ticks.saturating_add(1);
            if m.current_cpu_usage > 1.0 && *consecutive_active_input_ticks >= 2 {
                *active_cpu_ema = if *active_cpu_ema <= 0.1 {
                    m.current_cpu_usage
                } else {
                    (*active_cpu_ema * 0.88) + (m.current_cpu_usage * 0.12)
                };
            }
        }

        let credit = if active_input_now && *pending_idle_seconds > 0 && *consecutive_active_input_ticks >= 2 {
            let flushed = pending_idle_seconds.saturating_add(m.dt);
            *pending_idle_seconds = 0;
            flushed
        } else {
            m.dt
        };
        *elapsed_active_seconds = elapsed_active_seconds
            .saturating_add(credit)
            .min(m.required_active_seconds);
    } else {
        // Silent grace window (`idle == 4..=effective_idle_limit`) while watching an in-game interaction;
        // wiped to 0 if the player opens Esc/Pause, Alt-Tabs, or stays hands-off past `effective_idle_limit`!
        *consecutive_active_input_ticks = 0;
        *pending_idle_seconds = pending_idle_seconds
            .saturating_add(m.dt)
            .min(effective_idle_limit);
    }

    None
}

fn get_lab_session_mutex() -> &'static std::sync::Mutex<Option<ActiveLabSession>> {
    LAB_SESSION.get_or_init(|| std::sync::Mutex::new(None))
}

fn current_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn current_epoch_millis_u128() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn file_mtime_millis(meta: &std::fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn compute_dir_save_slot_snapshot(dir: &Path) -> Option<SaveSlotSnapshot> {
    use sha2::{Digest, Sha256};

    let mut latest_ms = 0u128;
    let mut total_bytes = 0u64;
    let mut file_count = 0usize;
    let mut hasher = Sha256::new();

    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();
    files.sort();

    for fpath in files {
        let fname_lower = fpath
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if is_temporary_or_internal_save_artifact(&fname_lower) {
            continue;
        }
        if let Ok(meta) = std::fs::metadata(&fpath) {
            file_count += 1;
            total_bytes = total_bytes.saturating_add(meta.len());
            let ms = file_mtime_millis(&meta);
            if ms > latest_ms {
                latest_ms = ms;
            }
            if let Ok((_, _, fp)) = sample_file_fingerprint(&fpath) {
                hasher.update(fp.as_bytes());
            }
        }
    }

    if file_count == 0 || total_bytes == 0 {
        None
    } else {
        Some(SaveSlotSnapshot {
            mtime_ms: latest_ms,
            size_bytes: total_bytes,
            fingerprint: hex::encode(hasher.finalize()),
        })
    }
}

fn snapshot_save_slots(
    docs_dir: &Path,
    vault_path_opt: Option<&str>,
    save_targets: &[String],
    save_extensions: &[String],
) -> (HashMap<PathBuf, SaveSlotSnapshot>, Option<u64>) {
    let mut map = HashMap::new();
    let mut seeded_size: Option<u64> = None;
    if save_targets.is_empty() {
        return (map, None);
    }
    let allow_dir_slots = is_directory_save_mode(save_extensions);
    let storage = resolve_airgap_storage_paths(docs_dir, vault_path_opt);
    let seeded_name = load_sandbox_state_meta(&storage.sandbox_root)
        .selected_save_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if allow_dir_slots && entry.depth() > 1 {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            if !matches_save_filename(&fname, save_extensions) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok((size_bytes, _, fingerprint)) = sample_file_fingerprint(entry.path()) {
                    let snap = SaveSlotSnapshot {
                        mtime_ms: file_mtime_millis(&meta),
                        size_bytes,
                        fingerprint,
                    };
                    if seeded_name
                        .as_ref()
                        .map_or(false, |sn| sn.eq_ignore_ascii_case(&fname))
                    {
                        seeded_size = Some(size_bytes);
                    }
                    map.insert(entry.path().to_path_buf(), snap);
                }
            }
        }

        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !name.starts_with('.') {
                        if let Some(snap) = compute_dir_save_slot_snapshot(&slot_path) {
                            if seeded_name
                                .as_ref()
                                .map_or(false, |sn| sn.eq_ignore_ascii_case(&name))
                            {
                                seeded_size = Some(snap.size_bytes);
                            }
                            map.insert(slot_path, snap);
                        }
                    }
                }
            }
        }
    }
    if seeded_size.is_none() && map.len() == 1 {
        seeded_size = map.values().next().map(|s| s.size_bytes);
    }
    (map, seeded_size)
}

fn has_inflight_temporary_save_files(docs_dir: &Path, save_targets: &[String]) -> bool {
    let now_ms = current_epoch_millis_u128();
    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(4)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let lower = entry.file_name().to_string_lossy().to_lowercase();
            let is_active_temp = lower.ends_with(".tmp")
                || lower.ends_with(".temp")
                || lower.ends_with(".part")
                || lower.ends_with(".partial")
                || lower.ends_with(".writing")
                || lower.ends_with(".savetmp")
                || lower.ends_with(".bak_tmp")
                || lower.ends_with(".lock")
                || lower.ends_with("-journal");
            if is_active_temp {
                if let Ok(meta) = entry.metadata() {
                    // Consider temp files touched within the last 15 seconds as actively serializing
                    if now_ms.saturating_sub(file_mtime_millis(&meta)) <= 15_000 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn snapshot_scratch_files(
    docs_dir: &Path,
    scratch_subdirs: &[String],
) -> HashMap<PathBuf, (u64, u128)> {
    let mut files = HashMap::new();
    for sub in scratch_subdirs {
        let dir = crate::utils::resolve_case_insensitive_path(docs_dir, sub);
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            // Strictly inspect real non-empty files ONLY — never match the empty scratch directory itself!
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy();
            if fname.starts_with('.') {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len > 0 {
                    files.insert(entry.path().to_path_buf(), (len, file_mtime_millis(&meta)));
                }
            }
        }
    }
    files
}

fn inspect_post_menu_scratch_activity(
    docs_dir: &Path,
    scratch_subdirs: &[String],
    baseline_files: &HashMap<PathBuf, (u64, u128)>,
    min_epoch_secs: u64,
    now_ms: u128,
) -> (bool, bool) {
    let min_ms = (min_epoch_secs as u128).saturating_mul(1000);
    let mut created_or_changed = false;
    let mut modified_recently = false;
    for sub in scratch_subdirs {
        let dir = crate::utils::resolve_case_insensitive_path(docs_dir, sub);
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy();
            if fname.starts_with('.') {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len == 0 {
                    continue;
                }
                let mtime_ms = file_mtime_millis(&meta);
                if mtime_ms < min_ms {
                    continue;
                }
                let changed = match baseline_files.get(entry.path()) {
                    None => true,
                    Some(&(prev_len, prev_ms)) => len != prev_len || mtime_ms > prev_ms,
                };
                if changed {
                    created_or_changed = true;
                    if now_ms > 0 && now_ms.saturating_sub(mtime_ms) <= 4_000 {
                        modified_recently = true;
                    }
                }
            }
        }
    }
    (created_or_changed, modified_recently)
}

#[cfg(test)]
fn has_post_menu_scratch_file_activity(
    docs_dir: &Path,
    scratch_subdirs: &[String],
    baseline_files: &HashMap<PathBuf, (u64, u128)>,
    min_epoch_secs: u64,
) -> bool {
    inspect_post_menu_scratch_activity(docs_dir, scratch_subdirs, baseline_files, min_epoch_secs, 0)
        .0
}

fn detect_fresh_save_candidate(
    docs_dir: &Path,
    save_targets: &[String],
    save_extensions: &[String],
    initial_snapshots: &HashMap<PathBuf, SaveSlotSnapshot>,
    seeded_baseline_size: Option<u64>,
    min_epoch_ms: u128,
) -> Option<PendingSaveCandidate> {
    if save_targets.is_empty() {
        return None;
    }
    let allow_dir_slots = is_directory_save_mode(save_extensions);
    let now_epoch = current_epoch_secs();

    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if allow_dir_slots && entry.depth() > 1 {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            if !matches_save_filename(&fname, save_extensions) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len == 0 {
                    continue;
                }
                let mtime_ms = file_mtime_millis(&meta);
                let prev_snap = initial_snapshots.get(entry.path());
                let prev_ms = prev_snap.map(|s| s.mtime_ms).unwrap_or(0);
                // Allow a 1500ms filesystem timestamp granularity tolerance relative to Stage 4 start,
                // while strictly requiring mtime_ms > prev_ms for pre-existing files!
                let after_stage_start = mtime_ms >= min_epoch_ms.saturating_sub(1500);
                if mtime_ms > prev_ms && after_stage_start {
                    // Reject byte-for-byte duplicate copy of another pre-existing save slot dropped into a new filename
                    if prev_snap.is_none() {
                        if let Ok((sz, _, fp)) = sample_file_fingerprint(entry.path()) {
                            let is_copied_old_slot = initial_snapshots
                                .values()
                                .any(|old| old.size_bytes == sz && old.fingerprint == fp);
                            if is_copied_old_slot {
                                continue;
                            }
                        }
                    }
                    return Some(PendingSaveCandidate {
                        path: entry.path().to_path_buf(),
                        display_name: fname,
                        prev_size_bytes: prev_snap
                            .map(|s| s.size_bytes)
                            .or(seeded_baseline_size),
                        observed_size_bytes: len,
                        observed_mtime_ms: mtime_ms,
                        detected_epoch: now_epoch,
                    });
                }
            }
        }

        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let dname = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !dname.starts_with('.') {
                        if let Some(snap) = compute_dir_save_slot_snapshot(&slot_path) {
                            let prev_snap = initial_snapshots.get(&slot_path);
                            let prev_ms = prev_snap.map(|s| s.mtime_ms).unwrap_or(0);
                            let after_stage_start =
                                snap.mtime_ms >= min_epoch_ms.saturating_sub(1500);
                            if snap.mtime_ms > prev_ms && after_stage_start {
                                if prev_snap.is_none() {
                                    let is_copied_old_slot = initial_snapshots.values().any(|old| {
                                        old.size_bytes == snap.size_bytes
                                            && old.fingerprint == snap.fingerprint
                                    });
                                    if is_copied_old_slot {
                                        continue;
                                    }
                                }
                                return Some(PendingSaveCandidate {
                                    path: slot_path,
                                    display_name: dname,
                                    prev_size_bytes: prev_snap
                                        .map(|s| s.size_bytes)
                                        .or(seeded_baseline_size),
                                    observed_size_bytes: snap.size_bytes,
                                    observed_mtime_ms: snap.mtime_ms,
                                    detected_epoch: now_epoch,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn audit_single_save_file_integrity(path: &Path, min_bytes: u64) -> Result<u64, String> {
    use std::io::{Read, Seek, SeekFrom};

    let meta = std::fs::metadata(path)
        .map_err(|e| format!("Save file {:?} could not be read: {}", path, e))?;
    let size = meta.len();
    if size < min_bytes {
        return Err(format!(
            "Save file '{}' is incomplete or truncated ({} bytes).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }

    let mut f = std::fs::File::open(path)
        .map_err(|e| format!("Save file {:?} is locked or unreadable: {}", path, e))?;

    let head_len = (size.min(65_536)) as usize;
    let mut head = vec![0u8; head_len];
    f.read_exact(&mut head)
        .map_err(|e| format!("Failed reading save header {:?}: {}", path, e))?;

    // Reject crash-zeroed or uninitialized 0x00 / 0xFF preallocated buffers
    let head_check_slice = &head[..head.len().min(4096)];
    if head_check_slice.iter().all(|&b| b == 0x00) {
        return Err(format!(
            "Save file '{}' contains a null-zeroed header (serialization aborted mid-write).",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
    }

    let tail = if size > 65_536 {
        let tail_offset = size - 65_536;
        f.seek(SeekFrom::Start(tail_offset))
            .map_err(|e| format!("Failed seeking save trailer {:?}: {}", path, e))?;
        let mut t = vec![0u8; 65_536];
        f.read_exact(&mut t)
            .map_err(|e| format!("Failed reading save trailer {:?}: {}", path, e))?;
        t
    } else {
        head.clone()
    };

    // Universal container & structured-format framing checks (100% magic-byte driven, zero hardcoded extensions)
    // 1. ZIP container (PK\x03\x04): must contain End of Central Directory (PK\x05\x06) in the trailer
    if head.starts_with(b"PK\x03\x04") {
        let has_eocd = tail.windows(4).any(|w| w == b"PK\x05\x06");
        if !has_eocd {
            return Err(format!(
                "Archive-backed save '{}' is missing its End-of-Central-Directory record (corrupted/truncated write).",
                path.file_name().unwrap_or_default().to_string_lossy()
            ));
        }
    }
    // 2. GZIP stream (\x1F\x8B): must have 10-byte header + 8-byte CRC32/ISIZE trailer
    else if head.starts_with(&[0x1F, 0x8B]) && size < 18 {
        return Err(format!(
            "Compressed save '{}' is truncated ({} bytes < 18-byte GZIP frame).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }
    // 3. Zstandard frame (\x28\xB5\x2F\xFD)
    else if head.starts_with(&[0x28, 0xB5, 0x2F, 0xFD]) && size < 12 {
        return Err(format!(
            "Compressed save '{}' is truncated ({} bytes < Zstd frame minimum).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }
    // 4. SQLite 3 database ("SQLite format 3\0"): verify header size >= 100 and page-aligned file length
    else if head.starts_with(b"SQLite format 3\0") {
        if size < 100 || head.len() < 18 {
            return Err("Database-backed save header is truncated (< 100 bytes).".to_string());
        }
        let raw_page = u16::from_be_bytes([head[16], head[17]]) as u64;
        let page_size = if raw_page == 1 { 65_536 } else { raw_page };
        if page_size >= 512 && page_size.is_power_of_two() && (size < page_size || size % page_size != 0) {
            return Err(format!(
                "Database-backed save '{}' has an incomplete page write ({} bytes not aligned to {}B page).",
                path.file_name().unwrap_or_default().to_string_lossy(),
                size,
                page_size
            ));
        }
    } else {
        // 5. Structured UTF-8 JSON / XML text saves: verify closing delimiter was flushed completely
        let bom_stripped = if head.starts_with(&[0xEF, 0xBB, 0xBF]) {
            &head[3..]
        } else {
            &head[..]
        };
        let probe_len = bom_stripped.len().min(512);
        if let Ok(head_text) = std::str::from_utf8(&bom_stripped[..probe_len]) {
            let trimmed_start = head_text.trim_start();
            let trimmed_tail_bytes = {
                let mut end = tail.len();
                while end > 0
                    && matches!(tail[end - 1], b' ' | b'\t' | b'\r' | b'\n' | 0x00)
                {
                    if tail[end - 1] == 0x00 {
                        // Null padding at the end of a UTF-8 JSON/XML text file indicates mid-flush crash truncation!
                        return Err(format!(
                            "Structured save '{}' ends with null bytes instead of a closing delimiter.",
                            path.file_name().unwrap_or_default().to_string_lossy()
                        ));
                    }
                    end -= 1;
                }
                &tail[..end]
            };

            if trimmed_start.starts_with('{') {
                if trimmed_tail_bytes.last().copied() != Some(b'}') {
                    return Err(format!(
                        "JSON save '{}' is truncated (missing closing '}}').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            } else if trimmed_start.starts_with('[') {
                if trimmed_tail_bytes.last().copied() != Some(b']') {
                    return Err(format!(
                        "JSON array save '{}' is truncated (missing closing ']').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            } else if trimmed_start.starts_with("<?xml")
                || (trimmed_start.starts_with('<')
                    && trimmed_start
                        .as_bytes()
                        .get(1)
                        .map_or(false, |c| c.is_ascii_alphabetic()))
            {
                if trimmed_tail_bytes.last().copied() != Some(b'>') {
                    return Err(format!(
                        "XML save '{}' is truncated (missing closing '>').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            }
        }
    }

    Ok(size)
}

pub fn audit_save_file_corruption(
    save_path: &Path,
    prev_size_bytes: Option<u64>,
) -> Result<u64, String> {
    if !save_path.exists() {
        return Err("Save checkpoint disappeared before integrity verification completed.".to_string());
    }

    let total_size = if save_path.is_dir() {
        let mut sum = 0u64;
        let mut valid_files = 0usize;
        for entry in walkdir::WalkDir::new(save_path)
            .max_depth(4)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let lower = entry.file_name().to_string_lossy().to_lowercase();
            if lower.ends_with(".tmp")
                || lower.ends_with(".part")
                || lower.ends_with(".savetmp")
                || lower.ends_with(".corrupt")
            {
                return Err(format!(
                    "Save folder contains incomplete temporary artifact '{}'.",
                    lower
                ));
            }
            if is_temporary_or_internal_save_artifact(&lower) {
                continue;
            }
            let fsize = audit_single_save_file_integrity(entry.path(), 1)?;
            sum = sum.saturating_add(fsize);
            valid_files += 1;
        }
        if valid_files == 0 || sum < 32 {
            return Err("Save directory slot contains no complete save data.".to_string());
        }
        sum
    } else {
        audit_single_save_file_integrity(save_path, 32)?
    };

    // Guard against catastrophic truncation compared to the seeded/previous save slot size
    if let Some(prev_sz) = prev_size_bytes {
        if prev_sz >= 4096 && total_size < prev_sz / 4 {
            return Err(format!(
                "Save size collapsed unexpectedly from {} bytes to {} bytes (< 25% of baseline — probable save truncation).",
                prev_sz, total_size
            ));
        }
    }

    Ok(total_size)
}

fn collect_deployed_payload_fingerprints(
    vault_path: &str,
    linked_files: &[String],
) -> Result<Vec<(PathBuf, u64, String)>, String> {
    let coords = get_saved_coordinates();
    let mods_root_str = if !coords.mods_path.trim().is_empty() {
        coords.mods_path.trim()
    } else {
        coords.live_path.trim()
    };
    let mods_dir = PathBuf::from(mods_root_str);

    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    if !mods_root_str.is_empty() && mods_dir.exists() {
        if let Ok(raw) = std::fs::read_to_string(mods_dir.join(".sanctuary_deployed_links.json")) {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for p_str in list {
                    let p = PathBuf::from(p_str);
                    if p.is_file() && !candidate_paths.contains(&p) {
                        candidate_paths.push(p);
                    }
                }
            }
        }
        for rel in linked_files {
            let cleaned = rel.trim().replace('/', std::path::MAIN_SEPARATOR_STR);
            if cleaned.is_empty() {
                continue;
            }
            let p = mods_dir.join(&cleaned);
            if p.is_file() && !candidate_paths.contains(&p) {
                candidate_paths.push(p);
            }
        }
    }

    if !vault_path.trim().is_empty() {
        if let Some((raw_routed, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
            if let Ok(records) = serde_json::from_str::<Vec<serde_json::Value>>(&raw_routed) {
                for rec in records {
                    let dest_opt = rec
                        .get("dest")
                        .or_else(|| rec.get("path"))
                        .and_then(|v| v.as_str())
                        .or_else(|| rec.as_str());
                    if let Some(d_str) = dest_opt {
                        let p = PathBuf::from(d_str);
                        if p.is_file() && !candidate_paths.contains(&p) {
                            candidate_paths.push(p);
                        }
                    }
                }
            }
        }
    }

    let mut verified = Vec::new();
    for p in candidate_paths {
        let fname_lower = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if fname_lower.starts_with(".sanctuary") {
            continue;
        }
        let (sz, _, fp) = sample_file_fingerprint(&p)?;
        verified.push((p, sz, fp));
    }

    Ok(verified)
}

fn verify_deployed_payload_intact(expected: &[(PathBuf, u64, String)]) -> Result<(), String> {
    for (path, expected_sz, expected_fp) in expected {
        if !path.exists() || !path.is_file() {
            return Err("lab_err_payload_tampered".to_string());
        }
        let (actual_sz, _, actual_fp) =
            sample_file_fingerprint(path).map_err(|_| "lab_err_payload_tampered".to_string())?;
        if actual_sz != *expected_sz || actual_fp != *expected_fp {
            return Err("lab_err_payload_tampered".to_string());
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn process_has_visible_window(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
) -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    let Some(pid) = target_pid else {
        return false;
    };

    struct EnumWinCtx<'a> {
        target_pid: u32,
        sys: &'a sysinfo::System,
        exe_candidates: &'a [String],
        live_root_norm_opt: Option<&'a str>,
        found: bool,
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            lp_enum_func: unsafe extern "system" fn(isize, isize) -> i32,
            l_param: isize,
        ) -> i32;
    }

    unsafe extern "system" fn enum_proc(hwnd_raw: isize, lparam: isize) -> i32 {
        let ctx = &mut *(lparam as *mut EnumWinCtx<'_>);
        if hwnd_raw == 0 {
            return 1;
        }
        let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return 1;
        }
        let mut rect = RECT::default();
        if GetClientRect(hwnd, &mut rect).is_err() {
            return 1;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 320 || height < 200 {
            return 1;
        }

        let mut win_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid == 0 {
            return 1;
        }
        let mut matches = win_pid == ctx.target_pid;
        if !matches {
            if let Some(proc_info) = ctx.sys.process(sysinfo::Pid::from_u32(win_pid)) {
                if process_matches_game_candidates(win_pid, proc_info, ctx.exe_candidates) {
                    matches = true;
                } else if let (Some(root_norm), Some(exe_path)) =
                    (ctx.live_root_norm_opt, proc_info.exe())
                {
                    let proc_norm = crate::utils::normalize_path_key(exe_path);
                    if !root_norm.is_empty() && proc_norm.starts_with(root_norm) {
                        matches = true;
                    }
                }
            }
        }
        if matches {
            ctx.found = true;
            return 0;
        }
        1
    }

    let mut ctx = EnumWinCtx {
        target_pid: pid,
        sys,
        exe_candidates,
        live_root_norm_opt,
        found: false,
    };
    unsafe {
        let _ = EnumWindows(enum_proc, (&mut ctx as *mut EnumWinCtx<'_>) as isize);
    }
    ctx.found
}

#[cfg(not(target_os = "windows"))]
fn process_has_visible_window(
    target_pid: Option<u32>,
    _sys: &sysinfo::System,
    _exe_candidates: &[String],
    _live_root_norm_opt: Option<&str>,
) -> bool {
    target_pid.map_or(false, |pid| pid > 0)
}

#[cfg(target_os = "windows")]
fn poll_optional_xinput_activity(
    gamepad_packets: &mut [u32; 4],
    gamepad_connected_mask: &mut u8,
    last_xinput_probe_epoch: &mut u64,
    last_gamepad_input_epoch: &mut u64,
    kb_mouse_idle_secs: u32,
    now_epoch: u64,
) {
    // When keyboard/mouse is actively receiving input, skip XInput completely so we never
    // trigger Windows HID PnP stalls on disconnected controller slots during DX11 rendering!
    if kb_mouse_idle_secs <= 2 {
        return;
    }

    #[repr(C)]
    struct RawXInputState {
        dw_packet_number: u32,
        gamepad: [u8; 12],
    }
    type XInputGetStateFn = unsafe extern "system" fn(u32, *mut RawXInputState) -> u32;

    static XINPUT_GET_STATE: std::sync::OnceLock<Option<XInputGetStateFn>> =
        std::sync::OnceLock::new();

    let func_opt = XINPUT_GET_STATE.get_or_init(|| unsafe {
        #[link(name = "kernel32")]
        extern "system" {
            fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut std::ffi::c_void;
            fn GetProcAddress(
                h_module: *mut std::ffi::c_void,
                lp_proc_name: *const u8,
            ) -> *const std::ffi::c_void;
        }
        let mut hmod = LoadLibraryA(b"xinput1_4.dll\0".as_ptr());
        if hmod.is_null() {
            hmod = LoadLibraryA(b"xinput9_1_0.dll\0".as_ptr());
        }
        if hmod.is_null() {
            return None;
        }
        let proc_ptr = GetProcAddress(hmod, b"XInputGetState\0".as_ptr());
        if proc_ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute::<*const std::ffi::c_void, XInputGetStateFn>(proc_ptr))
        }
    });

    if let Some(xinput_get_state) = func_opt {
        let allow_disconnected_probe =
            *last_xinput_probe_epoch == 0 || now_epoch.saturating_sub(*last_xinput_probe_epoch) >= 30;
        if allow_disconnected_probe {
            *last_xinput_probe_epoch = now_epoch;
        }

        for (slot, prev_pkt) in gamepad_packets.iter_mut().enumerate() {
            let bit = 1u8 << slot;
            let was_connected = (*gamepad_connected_mask & bit) != 0;
            if !was_connected && !allow_disconnected_probe {
                continue;
            }
            let mut state = RawXInputState {
                dw_packet_number: 0,
                gamepad: [0u8; 12],
            };
            let res = unsafe { xinput_get_state(slot as u32, &mut state) };
            if res == 0 {
                *gamepad_connected_mask |= bit;
                if *prev_pkt != 0 && *prev_pkt != state.dw_packet_number {
                    *last_gamepad_input_epoch = now_epoch;
                }
                *prev_pkt = state.dw_packet_number;
            } else {
                *gamepad_connected_mask &= !bit;
                *prev_pkt = 0;
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn get_os_focus_and_idle(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
    gamepad_packets: &mut [u32; 4],
    gamepad_connected_mask: &mut u8,
    last_xinput_probe_epoch: &mut u64,
    last_gamepad_input_epoch: &mut u64,
    now_epoch: u64,
) -> (bool, u32) {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    let mut is_focused = false;
    if let Some(pid) = target_pid {
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.0.is_null() && !IsIconic(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() {
                let mut fg_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                if fg_pid == pid {
                    is_focused = true;
                } else if fg_pid != 0 {
                    // Multi-process engines or custom schemas with separate render/window child process
                    if let Some(fg_proc) = sys.process(sysinfo::Pid::from_u32(fg_pid)) {
                        if process_matches_game_candidates(fg_pid, fg_proc, exe_candidates) {
                            is_focused = true;
                        } else if let (Some(root_norm), Some(exe_path)) =
                            (live_root_norm_opt, fg_proc.exe())
                        {
                            let proc_norm = crate::utils::normalize_path_key(exe_path);
                            if !root_norm.is_empty() && proc_norm.starts_with(root_norm) {
                                is_focused = true;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut idle_secs = 0u32;
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii).as_bool() {
            let now_ticks = GetTickCount();
            let elapsed_ms = now_ticks.wrapping_sub(lii.dwTime);
            idle_secs = elapsed_ms / 1000;
        }
    }

    poll_optional_xinput_activity(
        gamepad_packets,
        gamepad_connected_mask,
        last_xinput_probe_epoch,
        last_gamepad_input_epoch,
        idle_secs,
        now_epoch,
    );
    if *last_gamepad_input_epoch > 0 {
        let gp_idle = now_epoch.saturating_sub(*last_gamepad_input_epoch) as u32;
        idle_secs = idle_secs.min(gp_idle);
    }

    (is_focused, idle_secs)
}

#[cfg(not(target_os = "windows"))]
fn get_os_focus_and_idle(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
    _gamepad_packets: &mut [u32; 4],
    _gamepad_connected_mask: &mut u8,
    _last_xinput_probe_epoch: &mut u64,
    _last_gamepad_input_epoch: &mut u64,
    _now_epoch: u64,
) -> (bool, u32) {
    let Some(pid) = target_pid else {
        return (false, 0);
    };
    #[cfg(target_os = "linux")]
    {
        let stat_path = format!("/proc/{}/stat", pid);
        let mut alive_and_running = std::path::Path::new(&format!("/proc/{}", pid)).exists();
        if let Ok(stat) = std::fs::read_to_string(&stat_path) {
            if let Some(rparen) = stat.rfind(')') {
                let after = stat[rparen + 1..].trim();
                let state_char = after.chars().next().unwrap_or('S');
                alive_and_running = !matches!(state_char, 'T' | 't' | 'Z' | 'X');
            }
        }
        if !alive_and_running {
            return (false, 0);
        }

        // Passive X11/XWayland active window PID check when available; Gamescope/Wayland sessions without _NET_WM_PID stay permissive
        let mut is_focused = true;
        if std::env::var_os("DISPLAY").is_some()
            && std::env::var_os("GAMESCOPE_WAYLAND_DISPLAY").is_none()
        {
            if let Ok(root_out) = std::process::Command::new("xprop")
                .args(["-root", "_NET_ACTIVE_WINDOW"])
                .output()
            {
                if root_out.status.success() {
                    let root_txt = String::from_utf8_lossy(&root_out.stdout);
                    if let Some(win_id) = root_txt
                        .rsplit(|c: char| c.is_whitespace() || c == ',')
                        .find(|tok| tok.starts_with("0x"))
                    {
                        if win_id == "0x0" {
                            is_focused = false;
                        } else if let Ok(pid_out) = std::process::Command::new("xprop")
                            .args(["-id", win_id, "_NET_WM_PID"])
                            .output()
                        {
                            let pid_txt = String::from_utf8_lossy(&pid_out.stdout);
                            if let Some(eq) = pid_txt.find('=') {
                                if let Ok(active_pid) = pid_txt[eq + 1..].trim().parse::<u32>() {
                                    if active_pid > 0 {
                                        is_focused = active_pid == pid
                                            || sys
                                                .process(sysinfo::Pid::from_u32(active_pid))
                                                .map(|fg_proc| {
                                                    process_matches_game_candidates(
                                                        active_pid,
                                                        fg_proc,
                                                        exe_candidates,
                                                    ) || live_root_norm_opt
                                                        .zip(fg_proc.exe())
                                                        .map(|(r, p)| {
                                                            !r.is_empty()
                                                                && crate::utils::normalize_path_key(p)
                                                                    .starts_with(r)
                                                        })
                                                        .unwrap_or(false)
                                                })
                                                .unwrap_or(false);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Passive Linux session idle query (xprintidle or freedesktop ScreenSaver DBus)
        let mut idle_secs = 0u32;
        if let Ok(out) = std::process::Command::new("xprintidle").output() {
            if out.status.success() {
                if let Ok(ms) = String::from_utf8_lossy(&out.stdout).trim().parse::<u64>() {
                    idle_secs = (ms / 1000) as u32;
                }
            }
        } else if let Ok(out) = std::process::Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.ScreenSaver",
                "--object-path",
                "/org/freedesktop/ScreenSaver",
                "--method",
                "org.freedesktop.ScreenSaver.GetSessionIdleTime",
            ])
            .output()
        {
            if out.status.success() {
                let txt = String::from_utf8_lossy(&out.stdout);
                let digits: String = txt.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(val) = digits.parse::<u64>() {
                    // freedesktop ScreenSaver returns seconds or milliseconds depending on DE
                    idle_secs = if val > 86_400 {
                        (val / 1000) as u32
                    } else {
                        val as u32
                    };
                }
            }
        }

        return (is_focused, idle_secs);
    }
    #[cfg(target_os = "macos")]
    {
        let mut is_focused = false;
        // Passive lsappinfo frontmost PID check (zero Accessibility/AppleEvents TCC prompts)
        if let Ok(front_out) = std::process::Command::new("lsappinfo").arg("front").output() {
            let asn = String::from_utf8_lossy(&front_out.stdout).trim().to_string();
            if !asn.is_empty() {
                if let Ok(info_out) = std::process::Command::new("lsappinfo")
                    .args(["info", "-only", "pid", &asn])
                    .output()
                {
                    let info_txt = String::from_utf8_lossy(&info_out.stdout);
                    if let Some(eq) = info_txt.find('=') {
                        if let Ok(front_pid) = info_txt[eq + 1..].trim().parse::<u32>() {
                            if front_pid > 0 {
                                is_focused = front_pid == pid
                                    || sys
                                        .process(sysinfo::Pid::from_u32(front_pid))
                                        .map(|fg_proc| {
                                            process_matches_game_candidates(
                                                front_pid,
                                                fg_proc,
                                                exe_candidates,
                                            ) || live_root_norm_opt
                                                .zip(fg_proc.exe())
                                                .map(|(r, p)| {
                                                    !r.is_empty()
                                                        && crate::utils::normalize_path_key(p)
                                                            .starts_with(r)
                                                })
                                                .unwrap_or(false)
                                        })
                                        .unwrap_or(false);
                            }
                        }
                    }
                }
            }
        } else {
            is_focused = pid > 0;
        }

        let mut idle_secs = 0u32;
        if let Ok(out) = std::process::Command::new("ioreg")
            .args(["-c", "IOHIDSystem", "-d", "4"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("\"HIDIdleTime\"") {
                    if let Some(eq) = line.find('=') {
                        if let Ok(ns) = line[eq + 1..].trim().parse::<u64>() {
                            idle_secs = (ns / 1_000_000_000) as u32;
                            break;
                        }
                    }
                }
            }
        }
        return (is_focused, idle_secs);
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (sys, exe_candidates, live_root_norm_opt);
        (pid > 0, 0)
    }
}

fn persist_certificate_to_vault(vault_path: &str, cert: &LabVerificationCertificate) {
    if vault_path.trim().is_empty() {
        return;
    }
    let Ok(conn_arc) = crate::utils::open_db_conn(vault_path) else {
        return;
    };
    let Ok(conn) = conn_arc.lock() else {
        return;
    };
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if let Ok(json_str) = serde_json::to_string(cert) {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO lab_certificates (dna_hash, cert_json, verified_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![cert.dna_hash, json_str, now_secs],
        );
    }
}

fn scan_logs_sync(docs_dir: &Path, game_schema: &Option<crate::schema::GameSchema>) -> Option<String> {
    if !docs_dir.exists() {
        return None;
    }
    let mut exceptions = Vec::new();
    let mut has_crash = false;

    let walker = walkdir::WalkDir::new(docs_dir)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let lower = e.file_name().to_string_lossy().to_lowercase();
            if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
                return false;
            }
            true
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let full_path = entry.path().to_path_buf();
        let rel_str = full_path
            .strip_prefix(docs_dir)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");
        if crate::game_logic::is_exception_log(game_schema, &rel_str) {
            if rel_str.to_lowercase().contains("crash") {
                has_crash = true;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
                    exceptions.push((mtime, rel_str, full_path));
                }
            }
        }
    }

    if has_crash {
        for (_mtime, _rel, log_path) in &exceptions {
            let _ = crate::commands::logs::read_and_scrub_exception_file(log_path);
        }
        return Some("crash_detected".to_string());
    }
    if exceptions.is_empty() {
        return None;
    }
    exceptions.sort_by(|a, b| b.0.cmp(&a.0));
    for (_mtime, rel_str, log_path) in &exceptions {
        if let Some(scrubbed) = crate::commands::logs::read_and_scrub_exception_file(log_path) {
            if crate::game_logic::is_ignored_lab_exception(game_schema, rel_str, &scrubbed) {
                continue;
            }
            return Some(format!("EXCEPTION DETECTED: {}", scrubbed));
        }
    }
    None
}

fn build_session_status(s: &ActiveLabSession) -> LabVerificationStatus {
    let baseline_mb = s.baseline_ram_bytes / (1024 * 1024);
    let current_mb = s.current_ram_bytes / (1024 * 1024);
    let peak_mb = s.peak_ram_bytes / (1024 * 1024);
    let ram_step_percent = if s.baseline_ram_bytes > 0 && s.current_ram_bytes > s.baseline_ram_bytes
    {
        (((s.current_ram_bytes - s.baseline_ram_bytes) * 100) / s.baseline_ram_bytes) as u32
    } else {
        0
    };
    let disk_read_mb = s
        .cumulative_disk_read_bytes
        .saturating_sub(s.baseline_disk_read_bytes)
        / (1024 * 1024);

    LabVerificationStatus {
        active: true,
        dna_hash: s.dna_hash.clone(),
        mod_name: s.mod_name.clone(),
        stage: s.stage.clone(),
        pause_reason: s.pause_reason.clone(),
        tracked_pid: s.tracked_pid,
        baseline_ram_mb: baseline_mb,
        current_ram_mb: current_mb,
        peak_ram_mb: peak_mb,
        ram_step_percent,
        disk_read_mb,
        min_disk_read_mb: s.min_disk_read_mb,
        min_ram_step_percent: s.min_ram_step_percent,
        required_active_seconds: s.required_active_seconds,
        elapsed_active_seconds: s.elapsed_active_seconds,
        remaining_active_seconds: s
            .required_active_seconds
            .saturating_sub(s.elapsed_active_seconds),
        max_idle_seconds: s.max_idle_seconds,
        current_idle_seconds: s.current_idle_seconds,
        is_focused: s.is_focused,
        require_focus: s.require_focus,
        require_save_checkpoint: s.require_save_checkpoint,
        seeded_save_present: s.seeded_save_present,
        verified_save_name: s.verified_save_name.clone(),
        linked_files: s.linked_files.clone(),
        error_log: s.error_log.clone(),
        certificate: s.certificate.clone(),
    }
}

fn normalize_mod_lookup_key(
    s: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> String {
    let trimmed = s.trim();
    let without_ext = if let Some((stem, ext)) = trimmed.rsplit_once('.') {
        let ext_lower = ext.to_lowercase();
        let is_schema_ext = crate::game_logic::get_supported_extensions(game_schema)
            .iter()
            .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower))
            || crate::game_logic::get_config_extensions(game_schema)
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
        if is_schema_ext
            || matches!(
                ext_lower.as_str(),
                "zip" | "7z" | "rar" | "jar" | "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml"
            )
        {
            stem
        } else {
            trimmed
        }
    } else {
        trimmed
    };
    without_ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn resolve_single_mod_target(
    query: &str,
    dna_hash: Option<&str>,
    is_sandbox: bool,
    dev_lane: &Path,
    vault_mods_lane: &Path,
    priority_folders: &[String],
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<PathBuf> {
    let clean_query = query.trim().replace("\\", "/");
    if clean_query.is_empty() {
        return None;
    }
    let query_first_seg = clean_query.split('/').next().unwrap_or("").trim();
    let query_file_name = Path::new(&clean_query)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_stem = Path::new(&clean_query)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_norm = normalize_mod_lookup_key(&query_file_name, game_schema);

    let mut source_target: Option<PathBuf> = None;

    // 1. Check Dev/Sandbox first if is_sandbox or if it exists in Dev/Sandbox
    let query_has_subpath = clean_query.contains('/');
    if dev_lane.exists() {
        let direct_dev = dev_lane.join(&clean_query);
        if direct_dev.exists() && direct_dev != dev_lane {
            source_target = Some(direct_dev);
        } else if !query_has_subpath && !query_first_seg.is_empty() {
            let folder_dev = dev_lane.join(query_first_seg);
            if folder_dev.exists() && folder_dev != dev_lane {
                source_target = Some(folder_dev);
            }
        }
        if source_target.is_none() && is_sandbox {
            if let Ok(entries) = std::fs::read_dir(dev_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_lowercase();
                    let enorm = normalize_mod_lookup_key(&ename, game_schema);
                    if ename == query_file_name
                        || ename == query_stem
                        || (!query_has_subpath && ename == query_first_seg.to_lowercase())
                        || (!query_norm.is_empty() && enorm == query_norm)
                    {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 2. Search Vault Mods lane (and priority folders) if not found yet — return the exact matched file, NEVER its collection folder!
    if source_target.is_none() && vault_mods_lane.exists() {
        for pf in priority_folders {
            let base = if pf.is_empty() {
                vault_mods_lane.to_path_buf()
            } else {
                vault_mods_lane.join(pf)
            };
            if !base.exists() {
                continue;
            }
            let candidate = base.join(&clean_query);
            if candidate.exists() && candidate != base {
                source_target = Some(candidate);
                break;
            }
            if !query_has_subpath && !query_first_seg.is_empty() {
                let folder_cand = base.join(query_first_seg);
                if folder_cand.exists() && folder_cand != base {
                    source_target = Some(folder_cand);
                    break;
                }
            }
        }
    }

    // 3. Search by dna_hash in .sanctuary_cache.db if still not found — return the exact file matching dna_hash!
    if source_target.is_none() {
        if let Some(hash_str) = dna_hash.filter(|h| !h.trim().is_empty()) {
            let cache = load_cache(vault_path);
            for (cached_path, entry) in cache.iter() {
                if entry.dna_hash == hash_str {
                    let p = PathBuf::from(cached_path);
                    if p.exists() {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 4. Case-insensitive and normalized alphanumeric deep walk across Dev/Sandbox and Vault Mods lane
    if source_target.is_none() {
        for search_root in [dev_lane, vault_mods_lane] {
            if !search_root.exists() {
                continue;
            }
            for entry in walkdir::WalkDir::new(search_root)
                .max_depth(4)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let p = entry.path();
                if p == search_root {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                let fstem = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_lowercase();
                let fnorm = normalize_mod_lookup_key(&fname, game_schema);
                if (!query_file_name.is_empty() && fname == query_file_name)
                    || (!query_stem.is_empty() && fstem == query_stem && p.is_file())
                    || (!query_norm.is_empty() && fnorm == query_norm && p.is_file())
                {
                    source_target = Some(p.to_path_buf());
                    break;
                }
            }
            if source_target.is_some() {
                break;
            }
        }
    }

    source_target
}

pub fn deploy_single_mod_to_live_sync(
    mod_path_or_name: &str,
    dna_hash: Option<&str>,
    additional_mods: &[String],
    is_sandbox: bool,
    mods_path: &str,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<Vec<String>, String> {
    let mods_dir = PathBuf::from(mods_path);
    if !mods_dir.exists() {
        let _ = std::fs::create_dir_all(&mods_dir);
    }

    let vault_dir = PathBuf::from(vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir
            .parent()
            .unwrap_or(&vault_dir)
            .join("Dev")
            .join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    cleanup_routed_links(vault_path);
    crate::utils::safe_wipe_mods_dir_with_vault(&mods_dir, Some(vault_path), game_schema);
    crate::game_logic::generate_manifest_if_needed(game_schema, &mods_dir);

    let priority_folders = crate::game_logic::get_priority_folders(game_schema);

    let mut resolved_targets: Vec<PathBuf> = Vec::new();
    if let Some(primary) = resolve_single_mod_target(
        mod_path_or_name,
        dna_hash,
        is_sandbox,
        &dev_lane,
        &vault_mods_lane,
        &priority_folders,
        vault_path,
        game_schema,
    ) {
        resolved_targets.push(primary);
    }

    for extra_query in additional_mods {
        if let Some(extra_path) = resolve_single_mod_target(
            extra_query,
            None,
            false,
            &dev_lane,
            &vault_mods_lane,
            &priority_folders,
            vault_path,
            game_schema,
        ) {
            if !resolved_targets.contains(&extra_path) {
                resolved_targets.push(extra_path);
            }
        }
    }

    // Automatically include atomic script/module twins in Vault/Mods root (never same-extension pack siblings)
    if vault_mods_lane.exists() {
        let mut companion_targets: Vec<PathBuf> = Vec::new();
        for target in &resolved_targets {
            let base_name = target
                .file_stem()
                .or_else(|| target.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let target_ext = target
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let norm = normalize_mod_lookup_key(base_name, game_schema);
            if norm.is_empty() {
                continue;
            }
            let stripped_norm = norm
                .strip_suffix("scripts")
                .or_else(|| norm.strip_suffix("script"))
                .unwrap_or(&norm)
                .to_string();
            let scripts_norm = format!("{}scripts", stripped_norm);
            let script_norm = format!("{}script", stripped_norm);

            if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_string();
                    let e_stem = p
                        .file_stem()
                        .or_else(|| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or(&ename);
                    let enorm = normalize_mod_lookup_key(e_stem, game_schema);
                    let p_ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    let is_script_twin_dir =
                        p.is_dir() && (enorm == scripts_norm || enorm == script_norm);
                    let is_diff_ext_twin_file = p.is_file()
                        && !p_ext.is_empty()
                        && p_ext != target_ext
                        && (enorm == stripped_norm
                            || enorm == scripts_norm
                            || enorm == script_norm);
                    if !enorm.is_empty()
                        && (is_script_twin_dir || is_diff_ext_twin_file)
                        && !resolved_targets.contains(&p)
                        && !companion_targets.contains(&p)
                    {
                        companion_targets.push(p);
                    }
                }
            }
        }
        resolved_targets.extend(companion_targets);
    }

    if resolved_targets.is_empty() {
        return Err(format!(
            "Could not locate mod files for '{}' in Sandbox or Vault.",
            mod_path_or_name
        ));
    }

    // Collect (lane_root_or_mod_parent, src_file) pairs so relative subpaths are preserved
    let mut files_to_link: Vec<(PathBuf, PathBuf)> = Vec::new();

    let compute_anchor_root = |target_dir_or_file: &Path| -> PathBuf {
        if target_dir_or_file.starts_with(&dev_lane) {
            return dev_lane.clone();
        }
        for pf in &priority_folders {
            if !pf.is_empty() {
                let tier_root = vault_mods_lane.join(pf);
                if target_dir_or_file.starts_with(&tier_root) {
                    return tier_root;
                }
            }
        }
        if target_dir_or_file.starts_with(&vault_mods_lane) {
            return vault_mods_lane.clone();
        }
        target_dir_or_file
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| target_dir_or_file.to_path_buf())
    };

    for mut resolved in resolved_targets {
        // 5. If resolved is a .zip file or contains .zip files, extract them in place first
        let supported_exts_lower: Vec<String> =
            crate::game_logic::get_supported_extensions(game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();
        let zip_is_native_mod = supported_exts_lower.iter().any(|e| e == "zip");

        if !zip_is_native_mod
            && resolved.is_file()
            && resolved
                .extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
        {
            let extract_dir = resolved
                .parent()
                .map(|p| {
                    if p == dev_lane.as_path() || p == vault_mods_lane.as_path() {
                        p.join(resolved.file_stem().unwrap_or_default())
                    } else {
                        p.to_path_buf()
                    }
                })
                .unwrap_or_else(|| dev_lane.join("ExtractedMod"));
            if crate::commands::library::extract_sandbox_zip_in_place(
                &resolved,
                &extract_dir,
                game_schema,
            ) > 0
            {
                let _ = std::fs::remove_file(&resolved);
                resolved = extract_dir;
            }
        } else if !zip_is_native_mod && resolved.is_dir() {
            let mut zips = Vec::new();
            for entry in walkdir::WalkDir::new(&resolved)
                .max_depth(2)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file()
                    && entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
                {
                    zips.push(entry.path().to_path_buf());
                }
            }
            for z in zips {
                if crate::commands::library::extract_sandbox_zip_in_place(
                    &z,
                    &resolved,
                    game_schema,
                ) > 0
                {
                    let _ = std::fs::remove_file(&z);
                }
            }
        }

        // 6. Collect deployable files from resolved while retaining their lane anchor root.
        // CRITICAL: When `resolved` is a specific file inside a multi-item collection folder,
        // NEVER symlink every other mod in `parent` — only include `resolved` itself, any atomic
        // script/module twin sharing the same normalized stem with a different extension, and
        // (for single-mod folders on auxiliary-asset engines) non-mod sidecar assets.
        let anchor_root = compute_anchor_root(&resolved);
        if resolved.is_dir() {
            for entry in walkdir::WalkDir::new(&resolved)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let p = entry.path().to_path_buf();
                    if !files_to_link.iter().any(|(_, existing)| existing == &p) {
                        files_to_link.push((anchor_root.clone(), p));
                    }
                }
            }
        } else if resolved.is_file() {
            if !files_to_link.iter().any(|(_, existing)| existing == &resolved) {
                files_to_link.push((anchor_root.clone(), resolved.clone()));
            }
            if let Some(parent) = resolved.parent() {
                let is_shared_lane_root = parent == dev_lane.as_path()
                    || parent == vault_mods_lane.as_path()
                    || priority_folders
                        .iter()
                        .any(|pf| !pf.is_empty() && parent == vault_mods_lane.join(pf));
                if !is_shared_lane_root {
                    let resolved_stem = resolved
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default();
                    let resolved_norm = normalize_mod_lookup_key(resolved_stem, game_schema);
                    let stripped_norm = resolved_norm
                        .strip_suffix("scripts")
                        .or_else(|| resolved_norm.strip_suffix("script"))
                        .unwrap_or(&resolved_norm)
                        .to_string();
                    let scripts_norm = format!("{}scripts", stripped_norm);
                    let script_norm = format!("{}script", stripped_norm);
                    let resolved_ext = resolved
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();

                    let preserve_aux =
                        crate::game_logic::should_preserve_auxiliary_assets(game_schema);
                    let mut primary_mod_stems: std::collections::HashSet<String> =
                        std::collections::HashSet::new();
                    let mut parent_files: Vec<PathBuf> = Vec::new();

                    for entry in walkdir::WalkDir::new(parent)
                        .max_depth(2)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if !entry.file_type().is_file() {
                            continue;
                        }
                        let p = entry.path().to_path_buf();
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        if supported_exts_lower.is_empty()
                            || supported_exts_lower.iter().any(|se| se == &p_ext)
                        {
                            if let Some(st) = p.file_stem().and_then(|s| s.to_str()) {
                                let sn = normalize_mod_lookup_key(st, game_schema);
                                let sn_base = sn
                                    .strip_suffix("scripts")
                                    .or_else(|| sn.strip_suffix("script"))
                                    .unwrap_or(&sn)
                                    .to_string();
                                if !sn_base.is_empty() {
                                    primary_mod_stems.insert(sn_base);
                                }
                            }
                        }
                        parent_files.push(p);
                    }

                    let is_single_mod_folder = primary_mod_stems.len() <= 1;

                    for p in parent_files {
                        if p == resolved {
                            continue;
                        }
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        let p_stem = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or_default();
                        let p_norm = normalize_mod_lookup_key(p_stem, game_schema);

                        let is_atomic_twin = !stripped_norm.is_empty()
                            && !p_ext.is_empty()
                            && p_ext != resolved_ext
                            && (p_norm == stripped_norm
                                || p_norm == scripts_norm
                                || p_norm == script_norm);

                        let is_single_mod_aux_sidecar = preserve_aux
                            && is_single_mod_folder
                            && !supported_exts_lower.is_empty()
                            && !supported_exts_lower.iter().any(|se| se == &p_ext);

                        if (is_atomic_twin || is_single_mod_aux_sidecar)
                            && !files_to_link.iter().any(|(_, existing)| existing == &p)
                        {
                            files_to_link.push((anchor_root.clone(), p));
                        }
                    }
                }
            }
        }
    }

    let install_routes = crate::game_logic::get_install_routes(game_schema);
    let saved_coords = get_saved_coordinates();
    let live_root =
        crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, game_schema);
    let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
        &saved_coords,
        game_schema,
    ));
    let supported_exts_lower: Vec<String> =
        crate::game_logic::get_supported_extensions(game_schema)
            .into_iter()
            .map(|e| e.trim_start_matches('.').to_lowercase())
            .collect();
    let manifest_lower = crate::game_logic::resolve_manifest_filename(game_schema)
        .unwrap_or_default()
        .to_lowercase();
    let max_folder_depth = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.max_folder_depth);

    let mut routed_records: Vec<RoutedFileRecord> = Vec::new();
    let mut linked_names: Vec<String> = Vec::new();
    let mut deployed_links: Vec<String> = Vec::new();
    let mods_allowed_roots = [mods_dir.clone()];

    for (anchor_root, src_file) in files_to_link {
        let fname = match src_file.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let fname_lower = fname.to_lowercase();
        let ext_lower = src_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        if fname_lower.starts_with('.')
            || is_internal_sanctuary_or_archive_skip(
                &fname_lower,
                &ext_lower,
                &manifest_lower,
                &supported_exts_lower,
            )
        {
            continue;
        }

        let rel_sub = src_file
            .strip_prefix(&anchor_root)
            .map(|r| r.to_path_buf())
            .unwrap_or_else(|_| PathBuf::from(&fname));
        let rel_hint_str = rel_sub.to_string_lossy().replace('\\', "/");

        if let Some(rec) = route_file_if_matched(
            &src_file,
            &rel_hint_str,
            &install_routes,
            &live_root,
            &docs_root,
            &mods_dir,
        ) {
            routed_records.push(rec);
            linked_names.push(format!("{} (Routed)", rel_hint_str));
            continue;
        }

        // Preserve relative subpath within mod folder while respecting schema max_folder_depth if set
        let effective_rel: PathBuf = if let Some(max_d) = max_folder_depth {
            let comps: Vec<_> = rel_sub
                .components()
                .filter_map(|c| match c {
                    std::path::Component::Normal(os) => Some(os.to_os_string()),
                    _ => None,
                })
                .collect();
            let folder_depth = comps.len().saturating_sub(1);
            if folder_depth > max_d as usize {
                if max_d == 0 {
                    PathBuf::from(&fname)
                } else {
                    let mut capped = PathBuf::new();
                    for seg in comps.iter().take(max_d as usize) {
                        capped.push(seg);
                    }
                    capped.push(&fname);
                    capped
                }
            } else {
                rel_sub
            }
        } else {
            rel_sub
        };

        let dest_file = mods_dir.join(&effective_rel);
        if crate::utils::ensure_strict_descendant_of_roots(&dest_file, &mods_allowed_roots).is_err()
        {
            continue;
        }
        if let Some(parent_dir) = dest_file.parent() {
            let _ = std::fs::create_dir_all(parent_dir);
            let mut cur = Some(parent_dir);
            while let Some(dir_anc) = cur {
                if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir) {
                    break;
                }
                let dir_str = dir_anc.to_string_lossy().to_string();
                if !deployed_links.contains(&dir_str) {
                    deployed_links.push(dir_str);
                }
                cur = dir_anc.parent();
            }
        }

        if dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok() {
            let _ = std::fs::remove_file(&dest_file);
        }

        let link_res = create_symlink_file(&src_file, &dest_file)
            .or_else(|_| std::fs::hard_link(&src_file, &dest_file))
            .or_else(|_| std::fs::copy(&src_file, &dest_file).map(|_| ()));

        if link_res.is_ok() && (dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok())
        {
            let dest_str = dest_file.to_string_lossy().to_string();
            if !deployed_links.contains(&dest_str) {
                deployed_links.push(dest_str);
            }
            let display_rel = effective_rel.to_string_lossy().replace('\\', "/");
            if !linked_names.contains(&display_rel) {
                linked_names.push(display_rel);
            }
        }
    }

    if !deployed_links.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&deployed_links) {
            let _ = crate::utils::atomic_write_bytes(
                &mods_dir.join(".sanctuary_deployed_links.json"),
                json.as_bytes(),
            );
            crate::utils::set_vault_kv(vault_path, "deployed_links", &json);
        }
    }

    if !routed_records.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&routed_records) {
            crate::utils::set_vault_kv(vault_path, "routed_links", &json);
        }
    }

    if linked_names.is_empty() {
        return Err(format!(
            "No supported mod files found to symlink for '{}'.",
            mod_path_or_name
        ));
    }

    Ok(linked_names)
}

#[tauri::command]
pub async fn deploy_mod_for_lab_test(
    mod_path_or_name: String,
    dna_hash: Option<String>,
    additional_mods: Option<Vec<String>>,
    is_sandbox: bool,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_deploying = state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = state.inner().last_deploy_epoch_ms.clone();
    if is_deploying
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err("Deployment or scan already in progress.".into());
    }
    let guard = DeployGuard {
        flag: is_deploying,
        last_deploy_epoch_ms,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let extra = additional_mods.unwrap_or_default();
        deploy_single_mod_to_live_sync(
            &mod_path_or_name,
            dna_hash.as_deref(),
            &extra,
            is_sandbox,
            &mods_path,
            &vault_path,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_lab_verification_session(
    app: tauri::AppHandle,
    dna_hash: String,
    mod_name: String,
    docs_path: String,
    vault_path: String,
    linked_files: Option<Vec<String>>,
    notification_labels: Option<LabNotificationLabels>,
    state: tauri::State<'_, AppState>,
) -> Result<LabVerificationStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let exe_names = collect_candidate_game_exe_names(&game_schema);
        let save_targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);

        let lv = game_schema.as_ref().and_then(|s| s.lab_verification.clone());
        let wls = lv.as_ref().and_then(|l| l.world_load_signature.clone());

        let required_active_seconds = lv
            .as_ref()
            .and_then(|l| l.required_active_seconds)
            .unwrap_or(120)
            .max(15);
        let max_idle_seconds = lv
            .as_ref()
            .and_then(|l| l.max_idle_seconds)
            .unwrap_or(10)
            .clamp(8, 12);
        let require_focus = lv.as_ref().and_then(|l| l.require_focus).unwrap_or(true);
        let require_save_checkpoint = lv
            .as_ref()
            .and_then(|l| l.require_save_checkpoint)
            .unwrap_or(true);
        let save_extensions = lv
            .as_ref()
            .and_then(|l| l.save_extensions.clone())
            .unwrap_or_default();
        let enable_hotkey_pause_detection = lv
            .as_ref()
            .and_then(|l| l.enable_hotkey_pause_detection)
            .unwrap_or(false);
        let pause_key_vk_codes = lv
            .as_ref()
            .and_then(|l| l.pause_key_vk_codes.clone())
            .unwrap_or_default();
        let resume_key_vk_codes = lv
            .as_ref()
            .and_then(|l| l.resume_key_vk_codes.clone())
            .unwrap_or_default();

        let stabilize_boot_seconds = wls
            .as_ref()
            .and_then(|w| w.stabilize_boot_seconds)
            .unwrap_or(10)
            .max(8);
        let min_disk_read_mb = wls.as_ref().and_then(|w| w.min_disk_read_mb).unwrap_or(75);
        let min_ram_step_percent = wls
            .as_ref()
            .and_then(|w| w.min_ram_step_percent)
            .unwrap_or(20);
        let warm_cache_ram_step_percent = wls
            .as_ref()
            .and_then(|w| w.warm_cache_ram_step_percent)
            .unwrap_or(35);
        let scratch_subdirs = wls
            .as_ref()
            .and_then(|w| w.scratch_activity_subdirs.clone())
            .unwrap_or_default();

        let linked_list = linked_files.unwrap_or_default();
        let deployed_payload_fingerprints =
            collect_deployed_payload_fingerprints(&vault_path, &linked_list)?;
        if !linked_list.is_empty() && deployed_payload_fingerprints.is_empty() {
            return Err("lab_err_payload_tampered".to_string());
        }

        let vault_opt = if vault_path.trim().is_empty() {
            None
        } else {
            Some(vault_path.as_str())
        };
        let now = current_epoch_secs();
        let (initial_save_snapshots, seeded_baseline_save_size) =
            snapshot_save_slots(&docs_dir, vault_opt, &save_targets, &save_extensions);
        let seeded_save_present = !initial_save_snapshots.is_empty();
        let initial_scratch_files = snapshot_scratch_files(&docs_dir, &scratch_subdirs);

        let session = ActiveLabSession {
            dna_hash,
            mod_name,
            docs_dir,
            vault_path,
            executable_names: exe_names,
            save_targets,
            save_extensions,
            scratch_subdirs,
            stage: "BOOTING".to_string(),
            pause_reason: None,
            started_at_epoch: now,
            boot_detected_epoch: None,
            menu_entered_epoch: None,
            menu_had_focused_input: false,
            menu_active_input_seconds: 0,
            world_load_settle_ticks: 0,
            world_post_settle_input_ticks: 0,
            awaiting_save_since_epoch: None,
            awaiting_save_since_ms: 0,
            last_save_reminder_epoch: 0,
            save_reminder_count: 0,
            stage4_disk_write_bytes: 0,
            pending_save_candidate: None,
            verified_save_name: None,
            tracked_pid: None,
            missing_process_ticks: 0,
            last_focused_epoch: 0,
            baseline_ram_bytes: 0,
            baseline_disk_read_bytes: 0,
            current_ram_bytes: 0,
            cumulative_disk_read_bytes: 0,
            cumulative_disk_write_bytes: 0,
            prev_ram_bytes: 0,
            prev_disk_read_bytes: 0,
            prev_disk_write_bytes: 0,
            current_cpu_usage: 0.0,
            active_cpu_ema: 0.0,
            sim_freeze_ticks: 0,
            boot_plateau_ticks: 0,
            peak_ram_bytes: 0,
            peak_world_ram_delta_bytes: 0,
            required_active_seconds,
            elapsed_active_seconds: 0,
            pending_idle_seconds: 0,
            recent_input_mask: 0,
            stage3_ticks: 0,
            consecutive_active_input_ticks: 0,
            stage3_loading_cooldown_ticks: 0,
            enable_hotkey_pause_detection,
            pause_key_vk_codes,
            resume_key_vk_codes,
            hotkey_menu_paused: false,
            hotkey_sim_paused: false,
            prev_vk_down: HashSet::new(),
            camera_drag_subticks: 0,
            gamepad_packets: [0u32; 4],
            gamepad_connected_mask: 0,
            last_xinput_probe_epoch: 0,
            last_gamepad_input_epoch: 0,
            max_idle_seconds,
            current_idle_seconds: 0,
            require_focus,
            is_focused: false,
            require_save_checkpoint,
            stabilize_boot_seconds,
            min_disk_read_mb,
            min_ram_step_percent,
            warm_cache_ram_step_percent,
            seeded_save_present,
            seeded_baseline_save_size,
            initial_save_snapshots,
            initial_scratch_files,
            deployed_payload_fingerprints,
            last_integrity_sweep_epoch: now,
            last_poll_epoch: now,
            linked_files: linked_list,
            notification_labels: notification_labels.unwrap_or_default(),
            notified_awaiting_save: false,
            notified_verified: false,
            notified_failed: false,
            error_log: None,
            certificate: None,
            sys: sysinfo::System::new(),
        };

        let status = build_session_status(&session);
        if let Ok(mut guard) = get_lab_session_mutex().lock() {
            *guard = Some(session);
        }

        // Autonomous background ticker (100ms opt-in focused hotkey edge subticks + 1s telemetry ticks)
        // so pause enforcement and timer-complete / save-verified alerts stay instant even if UI drawers unmount!
        let gen = LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let app_bg = app.clone();
        let schema_bg = game_schema.clone();
        std::thread::spawn(move || {
            let mut subtick: u8 = 0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if LAB_SESSION_GENERATION.load(std::sync::atomic::Ordering::SeqCst) != gen {
                    break;
                }
                poll_focused_hotkey_pause_subtick();
                subtick = subtick.wrapping_add(1);
                if subtick < 10 {
                    continue;
                }
                subtick = 0;
                match tick_lab_verification_session_sync(&app_bg, &schema_bg) {
                    Ok(Some(st)) => {
                        if st.stage == "VERIFIED" || st.stage == "FAILED" {
                            break;
                        }
                    }
                    _ => break,
                }
            }
        });

        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}

struct Stage2TickInput {
    dt: u32,
    require_focus: bool,
    is_focused: bool,
    matched_process_stopped: bool,
    current_idle_seconds: u32,
    current_ram_bytes: u64,
    ram_diff_bytes: u64,
    cumulative_disk_read_bytes: u64,
    disk_io_bytes_this_tick: u64,
    disk_rate_mb: u64,
    min_disk_read_mb: u64,
    min_ram_step_percent: u32,
    warm_cache_ram_step_percent: u32,
    scratch_file_created: bool,
    scratch_modified_recently: bool,
}

fn evaluate_stage2_world_loaded(
    inp: &Stage2TickInput,
    baseline_ram_bytes: &mut u64,
    baseline_disk_read_bytes: &mut u64,
    menu_had_focused_input: &mut bool,
    menu_active_input_seconds: &mut u32,
    world_load_settle_ticks: &mut u32,
    world_post_settle_input_ticks: &mut u32,
) -> bool {
    let focused_active_input = (!inp.require_focus || inp.is_focused)
        && !inp.matched_process_stopped
        && inp.current_idle_seconds <= 1;

    if focused_active_input {
        *menu_had_focused_input = true;
        *menu_active_input_seconds = menu_active_input_seconds.saturating_add(inp.dt);
    }

    let disk_delta_bytes = inp
        .cumulative_disk_read_bytes
        .saturating_sub(*baseline_disk_read_bytes);
    let ram_step_bytes = inp.current_ram_bytes.saturating_sub(*baseline_ram_bytes);
    let ram_step_pct = if *baseline_ram_bytes > 0 && inp.current_ram_bytes > *baseline_ram_bytes {
        (((inp.current_ram_bytes - *baseline_ram_bytes) * 100) / *baseline_ram_bytes) as u32
    } else {
        0
    };

    let configured_disk_bytes = inp.min_disk_read_mb * 1024 * 1024;
    let scaled_disk_target_bytes =
        configured_disk_bytes.min((*baseline_ram_bytes / 3).max(2 * 1024 * 1024));
    let scaled_ram_abs_target_bytes =
        (*baseline_ram_bytes / 5).clamp(8 * 1024 * 1024, 180 * 1024 * 1024);

    let primary_world_loaded = disk_delta_bytes >= scaled_disk_target_bytes
        && (ram_step_pct >= inp.min_ram_step_percent
            || ram_step_bytes >= scaled_ram_abs_target_bytes);

    // Never allow background Main Menu 3D scene/banner streaming (before the player has ever
    // interacted with the focused game window on the menu) to masquerade as a world load —
    // while preserving an unmistakable full world-load burst if the player clicked "Load" right
    // before Stage 1 finished stabilizing!
    let unmistakable_world_burst = primary_world_loaded
        && disk_delta_bytes >= configured_disk_bytes.max(48 * 1024 * 1024)
        && ram_step_pct >= inp.min_ram_step_percent;

    if !*menu_had_focused_input {
        if !unmistakable_world_burst {
            if inp.current_ram_bytes > *baseline_ram_bytes && inp.disk_rate_mb <= 8 {
                *baseline_ram_bytes = inp.current_ram_bytes;
            }
            if inp.cumulative_disk_read_bytes > *baseline_disk_read_bytes && inp.disk_rate_mb <= 8
            {
                *baseline_disk_read_bytes = inp.cumulative_disk_read_bytes;
            }
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        }
        if inp.require_focus && !inp.is_focused {
            return false;
        }
        *menu_had_focused_input = true;
    }

    let scratch_world_loaded = inp.scratch_file_created
        && disk_delta_bytes >= (scaled_disk_target_bytes * 2 / 3).max(24 * 1024 * 1024)
        && (ram_step_pct >= (inp.min_ram_step_percent * 3 / 4).max(15)
            || ram_step_bytes >= (scaled_ram_abs_target_bytes * 3 / 4));

    let warm_cache_world_loaded = ram_step_pct >= inp.warm_cache_ram_step_percent.max(35)
        && ram_step_bytes >= scaled_ram_abs_target_bytes
        && (disk_delta_bytes >= (scaled_disk_target_bytes / 2).max(16 * 1024 * 1024)
            || inp.scratch_file_created);

    let preloaded_engine_world_active = if *baseline_ram_bytes < 256 * 1024 * 1024
        || inp.min_disk_read_mb <= 15
    {
        *menu_active_input_seconds >= 25
            && (ram_step_pct >= 8
                || disk_delta_bytes >= 2 * 1024 * 1024
                || inp.scratch_file_created)
    } else {
        *menu_active_input_seconds >= 35
            && disk_delta_bytes >= (scaled_disk_target_bytes / 2).max(16 * 1024 * 1024)
            && (ram_step_pct >= 12 || ram_step_bytes >= (scaled_ram_abs_target_bytes / 2))
    };

    if primary_world_loaded
        || scratch_world_loaded
        || warm_cache_world_loaded
        || preloaded_engine_world_active
    {
        // Wait until BOTH disk reads+writes AND RAM growth AND scratch-file writes finish settling
        // so mid-loading-screen decompression/instantiation never starts Stage 3 prematurely!
        let settle_ram_tol =
            (inp.current_ram_bytes / 180).clamp(2 * 1024 * 1024, 12 * 1024 * 1024);
        let new_loading_burst = inp.disk_io_bytes_this_tick > 6 * 1024 * 1024
            || inp.ram_diff_bytes > settle_ram_tol.saturating_mul(3)
            || inp.scratch_modified_recently;
        let settled_this_tick = inp.disk_io_bytes_this_tick <= 2 * 1024 * 1024
            && inp.ram_diff_bytes <= settle_ram_tol
            && !inp.scratch_modified_recently;

        if new_loading_burst {
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        } else if settled_this_tick {
            *world_load_settle_ticks = world_load_settle_ticks.saturating_add(1);
        } else {
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        }

        let required_settle_ticks = if inp.min_disk_read_mb <= 25 { 3 } else { 4 };
        if *world_load_settle_ticks < required_settle_ticks {
            return false;
        }

        // Require live focused player input AFTER the loading screen has fully settled, plus 1 follow-up
        // settled tick (so clicking a Household on a World Select Map resets on the subsequent lot load!)
        if *world_post_settle_input_ticks == 0 {
            if focused_active_input {
                *world_post_settle_input_ticks = 1;
            }
            false
        } else {
            *world_post_settle_input_ticks = world_post_settle_input_ticks.saturating_add(1);
            *world_post_settle_input_ticks >= 2
        }
    } else {
        *world_load_settle_ticks = 0;
        *world_post_settle_input_ticks = 0;
        false
    }
}

fn tick_lab_verification_session_sync(
    app: &tauri::AppHandle,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<Option<LabVerificationStatus>, String> {
    let mut guard = get_lab_session_mutex().lock().map_err(|e| e.to_string())?;
    let session = match guard.as_mut() {
        Some(s) => s,
        None => return Ok(None),
    };

    if session.stage == "VERIFIED" || session.stage == "FAILED" {
        return Ok(Some(build_session_status(session)));
    }

    let now = current_epoch_secs();
    if now <= session.last_poll_epoch {
        return Ok(Some(build_session_status(session)));
    }
    let dt = now.saturating_sub(session.last_poll_epoch).clamp(1, 3) as u32;
    session.last_poll_epoch = now;

    // Dynamically adopt any game executable launched right after start_lab_verification_session (supports custom games with executables: [])
    let mut live_root_norm_opt: Option<String> = None;
    let mut direct_launched_pid: Option<u32> = None;
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(info_guard) = mutex.lock() {
            if let Some(info) = info_guard.as_ref() {
                if info.launched_at_epoch >= session.started_at_epoch.saturating_sub(15) {
                    direct_launched_pid = info.pid;
                    if !info.live_root_norm.is_empty() {
                        live_root_norm_opt = Some(info.live_root_norm.clone());
                    }
                    if !info.exe_name.is_empty()
                        && !session
                            .executable_names
                            .iter()
                            .any(|n| n.eq_ignore_ascii_case(&info.exe_name))
                    {
                        session.executable_names.push(info.exe_name.clone());
                    }
                }
            }
        }
    }

    // 1. Check for crash/exception logs first
    if let Some(err_msg) = scan_logs_sync(&session.docs_dir, game_schema) {
        session.stage = "FAILED".to_string();
        session.error_log = Some(err_msg.clone());
        if !session.notified_failed {
            session.notified_failed = true;
            let failed_title = session
                .notification_labels
                .failed_title
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("Lab Simulation Failed");
            notify_player_over_game(
                app,
                "failed",
                failed_title,
                &err_msg,
                true,
                &session.dna_hash,
                &session.mod_name,
            );
        }
        return Ok(Some(build_session_status(session)));
    }

    // Periodic passive airgap self-healing + deployed mod payload tamper check
    if now.saturating_sub(session.last_integrity_sweep_epoch) >= 8 {
        session.last_integrity_sweep_epoch = now;
        let _ = heal_active_airgap_if_tampered(
            &session.docs_dir,
            if session.vault_path.trim().is_empty() {
                None
            } else {
                Some(session.vault_path.as_str())
            },
            game_schema,
        );
        if !session.deployed_payload_fingerprints.is_empty() {
            if let Err(tamper_err) =
                verify_deployed_payload_intact(&session.deployed_payload_fingerprints)
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(tamper_err.clone());
                if !session.notified_failed {
                    session.notified_failed = true;
                    let failed_title = session
                        .notification_labels
                        .failed_title
                        .as_deref()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or("Lab Simulation Failed");
                    notify_player_over_game(
                        app,
                        "failed",
                        failed_title,
                        &tamper_err,
                        true,
                        &session.dna_hash,
                        &session.mod_name,
                    );
                }
                return Ok(Some(build_session_status(session)));
            }
        }
    }

    // 2. Refresh processes via passive OS counters ONLY (zero ReadProcessMemory / PEB scraping)
    let refresh_kind = passive_process_refresh_kind();
    let needs_full_refresh = if let Some(pid) = session.tracked_pid {
        let sys_pid = sysinfo::Pid::from_u32(pid);
        session.sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&[sys_pid]),
            true,
            refresh_kind,
        );
        !session.sys.processes().contains_key(&sys_pid)
    } else {
        true
    };
    if needs_full_refresh {
        session.sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            refresh_kind,
        );
    }

    let mut matched_pid: Option<u32> = None;
    let mut matched_process_stopped = false;
    let mut best_ram: u64 = 0;
    let mut best_disk_read: u64 = 0;
    let mut best_disk_write: u64 = 0;
    let mut best_cpu: f32 = 0.0;

    for (pid, proc_info) in session.sys.processes() {
        let pid_u32 = pid.as_u32();
        let mut is_match =
            process_matches_game_candidates(pid_u32, proc_info, &session.executable_names);

        if !is_match && direct_launched_pid == Some(pid_u32) {
            is_match = true;
        }
        // Fallback for launcher-to-child handoff inside the same game installation directory
        if !is_match {
            if let (Some(ref live_root_norm), Some(exe_path)) =
                (&live_root_norm_opt, proc_info.exe())
            {
                let proc_norm = crate::utils::normalize_path_key(exe_path);
                if !live_root_norm.is_empty() && proc_norm.starts_with(live_root_norm) {
                    let pname = proc_info.name().to_string_lossy().to_lowercase();
                    let is_helper = pname.contains("crash")
                        || pname.contains("uninstall")
                        || pname.contains("redist")
                        || pname.contains("setup")
                        || pname.contains("updater");
                    if !is_helper {
                        is_match = true;
                    }
                }
            }
        }

        if is_match {
            let mem = proc_info.memory();
            if mem >= best_ram {
                best_ram = mem;
                let du = proc_info.disk_usage();
                best_disk_read = du.total_read_bytes;
                best_disk_write = du.total_written_bytes;
                best_cpu = proc_info.cpu_usage();
                matched_pid = Some(pid_u32);
                matched_process_stopped =
                    matches!(proc_info.status(), sysinfo::ProcessStatus::Stop);
            }
        }
    }

    if matched_pid.is_some() {
        session.missing_process_ticks = 0;
    } else {
        session.missing_process_ticks = session.missing_process_ticks.saturating_add(1);
    }
    session.tracked_pid = matched_pid;
    session.current_cpu_usage = best_cpu;

    if best_ram > 0 {
        session.current_ram_bytes = best_ram;
        session.cumulative_disk_read_bytes = best_disk_read;
        session.cumulative_disk_write_bytes = best_disk_write;
        if best_ram > session.peak_ram_bytes {
            session.peak_ram_bytes = best_ram;
        }
    }

    let (focused, idle_secs) = get_os_focus_and_idle(
        matched_pid,
        &session.sys,
        &session.executable_names,
        live_root_norm_opt.as_deref(),
        &mut session.gamepad_packets,
        &mut session.gamepad_connected_mask,
        &mut session.last_xinput_probe_epoch,
        &mut session.last_gamepad_input_epoch,
        now,
    );
    session.is_focused = focused;
    session.current_idle_seconds = idle_secs;
    if focused {
        session.last_focused_epoch = now;
    }

    let disk_read_delta_tick = session
        .cumulative_disk_read_bytes
        .saturating_sub(session.prev_disk_read_bytes);
    let disk_write_delta_tick = session
        .cumulative_disk_write_bytes
        .saturating_sub(session.prev_disk_write_bytes);
    let disk_io_bytes_this_tick = disk_read_delta_tick.saturating_add(disk_write_delta_tick);
    let disk_rate_mb = disk_read_delta_tick / (1024 * 1024);
    let ram_diff_bytes = session.current_ram_bytes.abs_diff(session.prev_ram_bytes);
    session.prev_ram_bytes = session.current_ram_bytes;
    session.prev_disk_read_bytes = session.cumulative_disk_read_bytes;
    session.prev_disk_write_bytes = session.cumulative_disk_write_bytes;

    let session_vault_opt: Option<String> = if session.vault_path.trim().is_empty() {
        None
    } else {
        Some(session.vault_path.clone())
    };

    // 3. Evaluate universal, engine-agnostic 4-stage pipeline
    match session.stage.as_str() {
        "BOOTING" => {
            let min_boot_ram_bytes = if session.min_disk_read_mb <= 10 {
                8 * 1024 * 1024
            } else {
                32 * 1024 * 1024
            };
            let has_visible_window = process_has_visible_window(
                matched_pid,
                &session.sys,
                &session.executable_names,
                live_root_norm_opt.as_deref(),
            );

            // Only begin the boot stabilization clock once a real visible game window (>= 320x200) is open!
            if matched_pid.is_some()
                && session.current_ram_bytes >= min_boot_ram_bytes
                && has_visible_window
            {
                let boot_epoch = *session.boot_detected_epoch.get_or_insert(now);
                let boot_elapsed = now.saturating_sub(boot_epoch);

                if boot_elapsed >= session.stabilize_boot_seconds.max(8) as u64 {
                    let plateau_ram_tol = (session.current_ram_bytes / 100)
                        .clamp(2 * 1024 * 1024, 14 * 1024 * 1024);
                    let quiet_disk = disk_io_bytes_this_tick <= 2 * 1024 * 1024;
                    if quiet_disk && ram_diff_bytes <= plateau_ram_tol {
                        session.boot_plateau_ticks += 1;
                    } else {
                        session.boot_plateau_ticks = 0;
                    }

                    // Require 4 consecutive quiet plateau ticks (zero blind timeout — slow boots wait cleanly!)
                    if session.boot_plateau_ticks >= 4 {
                        session.baseline_ram_bytes = session.current_ram_bytes;
                        session.baseline_disk_read_bytes = session.cumulative_disk_read_bytes;
                        let (snaps, seeded_sz) = snapshot_save_slots(
                            &session.docs_dir,
                            session_vault_opt.as_deref(),
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.initial_save_snapshots = snaps;
                        if seeded_sz.is_some() {
                            session.seeded_baseline_save_size = seeded_sz;
                        }
                        session.initial_scratch_files =
                            snapshot_scratch_files(&session.docs_dir, &session.scratch_subdirs);
                        session.menu_entered_epoch = Some(now);
                        session.menu_had_focused_input = false;
                        session.menu_active_input_seconds = 0;
                        session.world_load_settle_ticks = 0;
                        session.world_post_settle_input_ticks = 0;
                        session.stage = "MENU_WAITING".to_string();
                    }
                }
            } else if matched_pid.is_none()
                && session.boot_detected_epoch.is_some()
                && session.missing_process_ticks >= 6
                && now.saturating_sub(session.started_at_epoch) > 45
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process exited during startup before reaching the Main Menu."
                        .to_string(),
                );
            }
        }
        "MENU_WAITING" => {
            if matched_pid.is_none()
                && session.missing_process_ticks >= 4
                && now.saturating_sub(session.started_at_epoch) > 35
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process terminated on Main Menu before entering a loaded world."
                        .to_string(),
                );
            } else if matched_pid.is_some() {
                let now_ms = current_epoch_millis_u128();
                let (scratch_file_created, scratch_modified_recently) =
                    inspect_post_menu_scratch_activity(
                        &session.docs_dir,
                        &session.scratch_subdirs,
                        &session.initial_scratch_files,
                        session.menu_entered_epoch.unwrap_or(session.started_at_epoch),
                        now_ms,
                    );
                let stage2_inp = Stage2TickInput {
                    dt,
                    require_focus: session.require_focus,
                    is_focused: session.is_focused,
                    matched_process_stopped,
                    current_idle_seconds: session.current_idle_seconds,
                    current_ram_bytes: session.current_ram_bytes,
                    ram_diff_bytes,
                    cumulative_disk_read_bytes: session.cumulative_disk_read_bytes,
                    disk_io_bytes_this_tick,
                    disk_rate_mb,
                    min_disk_read_mb: session.min_disk_read_mb,
                    min_ram_step_percent: session.min_ram_step_percent,
                    warm_cache_ram_step_percent: session.warm_cache_ram_step_percent,
                    scratch_file_created,
                    scratch_modified_recently,
                };

                if evaluate_stage2_world_loaded(
                    &stage2_inp,
                    &mut session.baseline_ram_bytes,
                    &mut session.baseline_disk_read_bytes,
                    &mut session.menu_had_focused_input,
                    &mut session.menu_active_input_seconds,
                    &mut session.world_load_settle_ticks,
                    &mut session.world_post_settle_input_ticks,
                ) {
                    if !session.deployed_payload_fingerprints.is_empty() {
                        if let Err(tamper_err) = verify_deployed_payload_intact(
                            &session.deployed_payload_fingerprints,
                        ) {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(tamper_err);
                            return Ok(Some(build_session_status(session)));
                        }
                    }
                    let (snaps, seeded_sz) = snapshot_save_slots(
                        &session.docs_dir,
                        session_vault_opt.as_deref(),
                        &session.save_targets,
                        &session.save_extensions,
                    );
                    session.initial_save_snapshots = snaps;
                    if seeded_sz.is_some() {
                        session.seeded_baseline_save_size = seeded_sz;
                    }
                    // Refresh scratch snapshot at Stage 3 entry so only *new* zone/lot loads trigger LOADING_WORLD
                    session.initial_scratch_files =
                        snapshot_scratch_files(&session.docs_dir, &session.scratch_subdirs);
                    session.peak_world_ram_delta_bytes = session
                        .current_ram_bytes
                        .saturating_sub(session.baseline_ram_bytes);
                    let entered_paused = session.enable_hotkey_pause_detection
                        && (session.hotkey_menu_paused || session.hotkey_sim_paused);
                    session.elapsed_active_seconds = if entered_paused {
                        0
                    } else {
                        2.min(session.required_active_seconds)
                    };
                    session.pending_idle_seconds = 0;
                    session.recent_input_mask = if entered_paused { 0 } else { 0b11 };
                    session.stage3_ticks = 0;
                    session.consecutive_active_input_ticks = if entered_paused { 0 } else { 1 };
                    session.stage3_loading_cooldown_ticks = 0;
                    session.sim_freeze_ticks = 0;
                    session.camera_drag_subticks = 0;
                    session.stage = "ACTIVE_TESTING".to_string();
                    session.pause_reason = if entered_paused {
                        Some("GAME_PAUSED".to_string())
                    } else {
                        None
                    };
                    play_native_lab_chime("stage3_started");
                } else if session.world_load_settle_ticks < 3 {
                    session.hotkey_menu_paused = false;
                    session.hotkey_sim_paused = false;
                }
            }
        }
        "ACTIVE_TESTING" => {
            if matched_pid.is_none() && session.missing_process_ticks >= 2 {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process exited prematurely before completing active gameplay verification."
                        .to_string(),
                );
            } else if matched_pid.is_some() {
                // If user paused simulation with `0`/`~` and then clicked the on-screen UI Play (`>`) button with the mouse,
                // auto-clear `hotkey_sim_paused` once live simulation CPU + memory churn clearly resumes!
                if session.hotkey_sim_paused
                    && !session.hotkey_menu_paused
                    && session.current_idle_seconds == 0
                    && session.active_cpu_ema >= 10.0
                    && session.current_cpu_usage >= (session.active_cpu_ema * 0.88)
                    && ram_diff_bytes >= 1024 * 1024
                {
                    session.hotkey_sim_paused = false;
                }
                let hotkey_paused = session.enable_hotkey_pause_detection
                    && (session.hotkey_menu_paused || session.hotkey_sim_paused);
                let metrics = Stage3TickMetrics {
                    dt,
                    matched_process_stopped,
                    require_focus: session.require_focus,
                    is_focused: session.is_focused,
                    hotkey_paused,
                    baseline_ram_bytes: session.baseline_ram_bytes,
                    current_ram_bytes: session.current_ram_bytes,
                    ram_diff_bytes,
                    disk_io_bytes_this_tick,
                    current_cpu_usage: session.current_cpu_usage,
                    current_idle_seconds: session.current_idle_seconds,
                    max_idle_seconds: session.max_idle_seconds,
                    required_active_seconds: session.required_active_seconds,
                };
                session.pause_reason = evaluate_stage3_pause_and_credit(
                    &metrics,
                    &mut session.peak_world_ram_delta_bytes,
                    &mut session.elapsed_active_seconds,
                    &mut session.pending_idle_seconds,
                    &mut session.recent_input_mask,
                    &mut session.stage3_ticks,
                    &mut session.active_cpu_ema,
                    &mut session.sim_freeze_ticks,
                    &mut session.consecutive_active_input_ticks,
                    &mut session.stage3_loading_cooldown_ticks,
                );

                if session.elapsed_active_seconds >= session.required_active_seconds {
                    if !session.deployed_payload_fingerprints.is_empty() {
                        if let Err(tamper_err) = verify_deployed_payload_intact(
                            &session.deployed_payload_fingerprints,
                        ) {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(tamper_err);
                            return Ok(Some(build_session_status(session)));
                        }
                    }

                    let must_verify_save =
                        session.require_save_checkpoint && !session.save_targets.is_empty();
                    if must_verify_save {
                        session.stage = "AWAITING_SAVE".to_string();
                        session.pause_reason = None;
                        session.awaiting_save_since_epoch = Some(now);
                        session.awaiting_save_since_ms = current_epoch_millis_u128();
                        session.last_save_reminder_epoch = now;
                        session.save_reminder_count = 0;
                        session.stage4_disk_write_bytes = session.cumulative_disk_write_bytes;
                        let (snaps, seeded_sz) = snapshot_save_slots(
                            &session.docs_dir,
                            session_vault_opt.as_deref(),
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.initial_save_snapshots = snaps;
                        if seeded_sz.is_some() {
                            session.seeded_baseline_save_size = seeded_sz;
                        }
                        session.pending_save_candidate = None;
                        session.verified_save_name = None;

                        if !session.notified_awaiting_save {
                            session.notified_awaiting_save = true;
                            let title = session
                                .notification_labels
                                .timer_complete_title
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Lab Timer Complete — Save & End Test!");
                            let body = session
                                .notification_labels
                                .timer_complete_body
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Active gameplay timer is up! Save your game in-world now to verify save integrity and finish the test.");
                            notify_player_over_game(
                                app,
                                "timer_complete",
                                title,
                                body,
                                false,
                                &session.dna_hash,
                                &session.mod_name,
                            );
                        }
                    } else {
                        let cert = LabVerificationCertificate {
                            dna_hash: session.dna_hash.clone(),
                            mod_name: session.mod_name.clone(),
                            verified_at: now,
                            active_seconds: session.elapsed_active_seconds,
                            baseline_ram_mb: session.baseline_ram_bytes / (1024 * 1024),
                            peak_ram_mb: session.peak_ram_bytes / (1024 * 1024),
                            disk_read_mb: session
                                .cumulative_disk_read_bytes
                                .saturating_sub(session.baseline_disk_read_bytes)
                                / (1024 * 1024),
                            save_file_verified: "no_save_targets_in_schema".to_string(),
                        };
                        persist_certificate_to_vault(&session.vault_path, &cert);
                        session.certificate = Some(cert);
                        session.stage = "VERIFIED".to_string();
                        if !session.notified_verified {
                            session.notified_verified = true;
                            let title = session
                                .notification_labels
                                .verified_title
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Lab Verification Passed & Signed!");
                            let body = session
                                .notification_labels
                                .verified_body
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("SHA-256 verification certificate recorded! You may now safely close the game and end the test.");
                            notify_player_over_game(
                                app,
                                "verified",
                                title,
                                body,
                                false,
                                &session.dna_hash,
                                &session.mod_name,
                            );
                        }
                    }
                }
            }
        }
        "AWAITING_SAVE" => {
            // Try detecting a fresh post-Stage-4 save write if none is currently staged
            if session.pending_save_candidate.is_none() {
                if let Some(cand) = detect_fresh_save_candidate(
                    &session.docs_dir,
                    &session.save_targets,
                    &session.save_extensions,
                    &session.initial_save_snapshots,
                    session.seeded_baseline_save_size,
                    session.awaiting_save_since_ms,
                ) {
                    // Correlate with real engine activity so external file-copying while unfocused cannot spoof Stage 4
                    let engine_wrote_bytes =
                        session.cumulative_disk_write_bytes > session.stage4_disk_write_bytes;
                    let recently_focused = !session.require_focus
                        || session.is_focused
                        || now.saturating_sub(session.last_focused_epoch) <= 15;

                    if engine_wrote_bytes || recently_focused {
                        session.verified_save_name = Some(cand.display_name.clone());
                        session.pending_save_candidate = Some(cand);
                    }
                } else if matched_pid.is_some()
                    && session.save_reminder_count < 3
                    && session.last_save_reminder_epoch > 0
                    && now.saturating_sub(session.last_save_reminder_epoch) >= 45
                {
                    // Gentle periodic audio reminder over WASAPI if player missed the initial fullscreen chime
                    session.save_reminder_count += 1;
                    session.last_save_reminder_epoch = now;
                    play_native_lab_chime("timer_complete");
                }
            }

            if matched_pid.is_none()
                && session.pending_save_candidate.is_none()
                && session.missing_process_ticks >= 2
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game closed before writing an in-game Save Checkpoint.".to_string(),
                );
            } else if let Some(mut cand) = session.pending_save_candidate.clone() {
                // Wait for temporary serialization files (.tmp/.part/.savetmp/-journal) to settle
                let temp_inflight =
                    has_inflight_temporary_save_files(&session.docs_dir, &session.save_targets);

                // Check if the candidate save is still growing/updating across polls
                let current_stat: Option<(u64, u128)> = if cand.path.is_dir() {
                    compute_dir_save_slot_snapshot(&cand.path)
                        .map(|s| (s.size_bytes, s.mtime_ms))
                } else {
                    std::fs::metadata(&cand.path)
                        .ok()
                        .map(|m| (m.len(), file_mtime_millis(&m)))
                };

                match current_stat {
                    None => {
                        // Candidate vanished (e.g. engine rolled back a failed temporary save)
                        session.pending_save_candidate = None;
                        session.verified_save_name = None;
                        if matched_pid.is_none() && session.missing_process_ticks >= 2 {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(
                                "Game exited and save checkpoint rolled back before completion."
                                    .to_string(),
                            );
                        }
                    }
                    Some((cur_sz, cur_ms)) => {
                        if cur_sz != cand.observed_size_bytes
                            || cur_ms != cand.observed_mtime_ms
                        {
                            // Save serialization is still flushing blocks to disk; reset stabilization clock
                            cand.observed_size_bytes = cur_sz;
                            cand.observed_mtime_ms = cur_ms;
                            cand.detected_epoch = now;
                            session.pending_save_candidate = Some(cand);
                        } else if !temp_inflight && now.saturating_sub(cand.detected_epoch) >= 3
                        {
                            // Final crash/exception sweep + deployed payload check + save corruption audit
                            if let Some(err_msg) =
                                scan_logs_sync(&session.docs_dir, game_schema)
                            {
                                session.stage = "FAILED".to_string();
                                session.error_log = Some(err_msg.clone());
                                if !session.notified_failed {
                                    session.notified_failed = true;
                                    let failed_title = session
                                        .notification_labels
                                        .failed_title
                                        .as_deref()
                                        .filter(|s| !s.trim().is_empty())
                                        .unwrap_or("Lab Simulation Failed");
                                    notify_player_over_game(
                                        app,
                                        "failed",
                                        failed_title,
                                        &err_msg,
                                        true,
                                        &session.dna_hash,
                                        &session.mod_name,
                                    );
                                }
                                return Ok(Some(build_session_status(session)));
                            }

                            if !session.deployed_payload_fingerprints.is_empty() {
                                if let Err(tamper_err) = verify_deployed_payload_intact(
                                    &session.deployed_payload_fingerprints,
                                ) {
                                    session.stage = "FAILED".to_string();
                                    session.error_log = Some(tamper_err);
                                    return Ok(Some(build_session_status(session)));
                                }
                            }

                            match audit_save_file_corruption(&cand.path, cand.prev_size_bytes) {
                                Ok(_verified_bytes) => {
                                    let storage = resolve_airgap_storage_paths(
                                        &session.docs_dir,
                                        session_vault_opt.as_deref(),
                                    );
                                    let mut sb_meta = load_sandbox_state_meta(&storage.sandbox_root);
                                    let primary_target = session.save_targets.first().cloned();
                                    let has_existing_baseline = primary_target
                                        .as_deref()
                                        .map(|rel| {
                                            let sb_dir = crate::utils::resolve_case_insensitive_path(
                                                &storage.sandbox_root,
                                                rel,
                                            );
                                            !list_saves_in_dir(&sb_dir, &session.save_extensions)
                                                .is_empty()
                                        })
                                        .unwrap_or(false);

                                    if !has_existing_baseline {
                                        // Initial unseeded test save creation: seal this verified clean save as the Golden Baseline!
                                        if let Some(ref rel) = primary_target {
                                            let sb_dir = crate::utils::resolve_case_insensitive_path(
                                                &storage.sandbox_root,
                                                rel,
                                            );
                                            set_tree_readonly(&sb_dir, false);
                                            if copy_save_item_into_dir(&cand.path, &sb_dir, false)
                                                .is_ok()
                                            {
                                                set_tree_readonly(&sb_dir, true);
                                            }
                                        }
                                        sb_meta.selected_save_name = Some(cand.display_name.clone());
                                        sb_meta.fresh_sandbox_armed = false;
                                        let _ =
                                            save_sandbox_state_meta(&storage.sandbox_root, &sb_meta);
                                    } else if sb_meta.fresh_sandbox_armed {
                                        sb_meta.fresh_sandbox_armed = false;
                                        let _ =
                                            save_sandbox_state_meta(&storage.sandbox_root, &sb_meta);
                                    }

                                    let cert = LabVerificationCertificate {
                                        dna_hash: session.dna_hash.clone(),
                                        mod_name: session.mod_name.clone(),
                                        verified_at: now,
                                        active_seconds: session.elapsed_active_seconds,
                                        baseline_ram_mb: session.baseline_ram_bytes
                                            / (1024 * 1024),
                                        peak_ram_mb: session.peak_ram_bytes / (1024 * 1024),
                                        disk_read_mb: session
                                            .cumulative_disk_read_bytes
                                            .saturating_sub(session.baseline_disk_read_bytes)
                                            / (1024 * 1024),
                                        save_file_verified: cand.display_name.clone(),
                                    };
                                    persist_certificate_to_vault(&session.vault_path, &cert);
                                    session.verified_save_name = Some(cand.display_name);
                                    session.certificate = Some(cert);
                                    session.stage = "VERIFIED".to_string();
                                    if !session.notified_verified {
                                        session.notified_verified = true;
                                        let title = session
                                            .notification_labels
                                            .verified_title
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Lab Verification Passed & Signed!");
                                        let body = session
                                            .notification_labels
                                            .verified_body
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Save checkpoint verified without corruption! You may now safely close the game and end the test.");
                                        notify_player_over_game(
                                            app,
                                            "verified",
                                            title,
                                            body,
                                            false,
                                            &session.dna_hash,
                                            &session.mod_name,
                                        );
                                    }
                                }
                                Err(corrupt_reason) => {
                                    session.stage = "FAILED".to_string();
                                    session.error_log = Some(corrupt_reason.clone());
                                    if !session.notified_failed {
                                        session.notified_failed = true;
                                        let failed_title = session
                                            .notification_labels
                                            .failed_title
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Lab Save Integrity Failed");
                                        notify_player_over_game(
                                            app,
                                            "failed",
                                            failed_title,
                                            &corrupt_reason,
                                            true,
                                            &session.dna_hash,
                                            &session.mod_name,
                                        );
                                    }
                                }
                            }
                        } else if temp_inflight
                            && matched_pid.is_none()
                            && session.missing_process_ticks >= 3
                        {
                            // Engine terminated while temporary serialization files were still open!
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(
                                "Game crashed or exited mid-serialization while temporary save files were still open."
                                    .to_string(),
                            );
                        }
                    }
                }
            }
        }
        _ => {}
    }

    Ok(Some(build_session_status(session)))
}

#[tauri::command]
pub async fn poll_lab_verification_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LabVerificationStatus>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        tick_lab_verification_session_sync(&app, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn post_wm_close_to_pids(pids: &[u32]) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    if pids.is_empty() {
        return;
    }

    struct CloseWinCtx<'a> {
        pids: &'a [u32],
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            lp_enum_func: unsafe extern "system" fn(isize, isize) -> i32,
            l_param: isize,
        ) -> i32;
        fn PostMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> i32;
    }

    unsafe extern "system" fn enum_close_proc(hwnd_raw: isize, lparam: isize) -> i32 {
        let ctx = &*(lparam as *const CloseWinCtx<'_>);
        if hwnd_raw == 0 {
            return 1;
        }
        let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
        let mut win_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid != 0 && ctx.pids.contains(&win_pid) {
            // WM_CLOSE = 0x0010 (standard graceful OS window close message — zero hooks/injection)
            let _ = PostMessageW(hwnd_raw, 0x0010, 0, 0);
        }
        1
    }

    let ctx = CloseWinCtx { pids };
    unsafe {
        let _ = EnumWindows(enum_close_proc, (&ctx as *const CloseWinCtx<'_>) as isize);
    }
}

fn terminate_running_sandbox_game_processes(
    docs_dir: &Path,
    save_targets: &[String],
    extra_exe_names: &[String],
    tracked_pid: Option<u32>,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    let mut candidates = collect_candidate_game_exe_names(game_schema);
    for ex in extra_exe_names {
        let lower = ex.trim().to_lowercase();
        if !lower.is_empty() && !candidates.iter().any(|c| c == &lower) {
            candidates.push(lower);
        }
    }
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let self_pid = std::process::id();

    let collect_matching_pids = |sys: &mut sysinfo::System| -> Vec<u32> {
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            passive_process_refresh_kind(),
        );
        sys.processes()
            .iter()
            .filter_map(|(pid, proc_info)| {
                let p_u32 = pid.as_u32();
                if p_u32 == self_pid {
                    return None;
                }
                if process_matches_game_or_live_root(
                    p_u32,
                    proc_info,
                    &candidates,
                    &live_roots,
                    tracked_pid,
                ) {
                    Some(p_u32)
                } else {
                    None
                }
            })
            .collect()
    };

    let mut sys = sysinfo::System::new();
    let initial_pids = collect_matching_pids(&mut sys);
    if !initial_pids.is_empty() {
        // 1. Wait briefly if temporary save serialization files are actively being flushed
        for _ in 0..12 {
            if !has_inflight_temporary_save_files(docs_dir, save_targets) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        // 2. Request graceful OS window/process close first
        #[cfg(target_os = "windows")]
        post_wm_close_to_pids(&initial_pids);

        #[cfg(not(target_os = "windows"))]
        {
            for &pid_u32 in &initial_pids {
                if let Some(p) = sys.process(sysinfo::Pid::from_u32(pid_u32)) {
                    let _ = p.kill_with(sysinfo::Signal::Term);
                }
            }
        }

        let mut exited_gracefully = false;
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if collect_matching_pids(&mut sys).is_empty() {
                exited_gracefully = true;
                break;
            }
        }

        // 3. Fallback: if game stayed stuck on an exit confirmation prompt, terminate remaining PIDs
        if !exited_gracefully {
            let remaining = collect_matching_pids(&mut sys);
            for pid_u32 in remaining {
                if let Some(p) = sys.process(sysinfo::Pid::from_u32(pid_u32)) {
                    let _ = p.kill();
                }
            }
            for _ in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(250));
                if collect_matching_pids(&mut sys).is_empty() {
                    break;
                }
            }
        }
    }

    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(mut g) = mutex.lock() {
            *g = None;
        }
    }
}

#[tauri::command]
pub async fn stop_lab_verification_session(app: tauri::AppHandle) -> Result<(), String> {
    LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    close_lab_overlay(&app);
    if let Ok(mut guard) = get_lab_session_mutex().lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn teardown_lab_sandbox_session(
    app: tauri::AppHandle,
    docs_path: String,
    close_game: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    close_lab_overlay(&app);

    let (tracked_pid, extra_exe_names, session_vault_path) = {
        let mut guard = get_lab_session_mutex().lock().map_err(|e| e.to_string())?;
        let info = guard
            .as_ref()
            .map(|s| {
                (
                    s.tracked_pid,
                    s.executable_names.clone(),
                    s.vault_path.clone(),
                )
            })
            .unwrap_or((None, Vec::new(), String::new()));
        *guard = None;
        info
    };

    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let save_targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);
        if close_game.unwrap_or(true) {
            terminate_running_sandbox_game_processes(
                &docs_dir,
                &save_targets,
                &extra_exe_names,
                tracked_pid,
                &game_schema,
            );
        }
        let coords = get_saved_coordinates();
        let effective_vault = if !session_vault_path.trim().is_empty() {
            Some(session_vault_path.as_str())
        } else if !coords.vault_path.trim().is_empty() {
            Some(coords.vault_path.as_str())
        } else {
            None
        };
        apply_save_airgap_with_vault(&docs_path, effective_vault, false, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_lab_certificates(vault_path: String) -> Result<Vec<LabVerificationCertificate>, String> {
    if vault_path.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn_arc = crate::utils::open_db_conn(&vault_path)?;
    let conn = conn_arc
        .lock()
        .map_err(|_| "Failed to lock Vault SQLite connection.".to_string())?;
    let mut certs = Vec::new();
    if let Ok(mut stmt) =
        conn.prepare("SELECT cert_json FROM lab_certificates ORDER BY verified_at DESC")
    {
        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
            for r in rows.flatten() {
                if let Ok(cert) = serde_json::from_str::<LabVerificationCertificate>(&r) {
                    certs.push(cert);
                }
            }
        }
    }
    Ok(certs)
}

#[tauri::command]
pub fn verify_lab_certificate_exists(vault_path: String, dna_hash: String) -> Result<bool, String> {
    let clean_hash = dna_hash.trim();
    if vault_path.trim().is_empty() || clean_hash.is_empty() {
        return Ok(false);
    }
    let conn_arc = crate::utils::open_db_conn(&vault_path)?;
    let conn = conn_arc
        .lock()
        .map_err(|_| "Failed to lock Vault SQLite connection.".to_string())?;
    let cert_json: Option<String> = conn
        .query_row(
            "SELECT cert_json FROM lab_certificates WHERE dna_hash = ?1",
            rusqlite::params![clean_hash],
            |row| row.get(0),
        )
        .ok();
    if let Some(raw) = cert_json {
        if let Ok(cert) = serde_json::from_str::<LabVerificationCertificate>(&raw) {
            return Ok(cert.active_seconds >= 15 && !cert.save_file_verified.trim().is_empty());
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn record_lab_certificate(
    vault_path: String,
    certificate: LabVerificationCertificate,
) -> Result<(), String> {
    // Only allow persisting certificates that were genuinely issued by the Rust Lab Verification Engine
    let authorized = get_lab_session_mutex()
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref().and_then(|s| {
                if s.stage == "VERIFIED" && s.dna_hash == certificate.dna_hash {
                    s.certificate.clone()
                } else {
                    None
                }
            })
        });
    let Some(signed_cert) = authorized else {
        return Err("Refused to record unsigned Lab certificate.".to_string());
    };
    persist_certificate_to_vault(&vault_path, &signed_cert);
    Ok(())
}

#[cfg(test)]
mod lab_safety_tests {
    use super::*;

    fn make_test_schema(save_folders: Vec<&str>, save_exts: Vec<&str>) -> Option<crate::schema::GameSchema> {
        let json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "executable_names": [],
            "time_capsule": {
                "save_airgap_targets": save_folders,
                "world_state_targets": [],
                "engine_state_targets": []
            },
            "lab_verification": {
                "required_active_seconds": 60,
                "require_focus": true,
                "require_save_checkpoint": true,
                "save_extensions": save_exts
            }
        });
        Some(serde_json::from_value(json).expect("valid test schema"))
    }

    #[test]
    fn test_dual_vault_airgap_evacuates_mirrors_and_heals_external_tampering() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_airgap_test_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("SaveSlots");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let original_save_bytes = b"{\"world\":\"PreciousUserCampaign\",\"playtime_hours\":412,\"gold\":999999}";
        let live_slot_path = live_saves.join("campaign_01.json");
        std::fs::write(&live_slot_path, original_save_bytes).unwrap();

        // Include case-variant duplicate targets ("SaveSlots" + "saveslots") to verify zero double-swap!
        let schema = make_test_schema(vec!["SaveSlots", "saveslots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(
            &docs_dir,
            Some(&vault_dir.to_string_lossy()),
        );

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable must succeed");

        // Live folder is now an isolated sandbox; original save is NOT in live folder,
        // and ZERO .sanctuary_* marker files/folders exist inside docs_dir (EA App / Steam Cloud safe)!
        assert!(!live_saves.join("campaign_01.json").exists());
        assert!(!live_saves.join(".sanctuary_sandbox_marker").exists());
        assert!(!docs_dir.join(".sanctuary_lab_airgap").exists());
        assert!(!docs_dir.join(".sanctuary_lab_sandbox").exists());

        // Write a sandbox test save inside the live folder during test
        std::fs::write(
            live_saves.join("sandbox_run.json"),
            b"{\"world\":\"DisposableLabSandboxRun\"}",
        )
        .unwrap();

        // Simulate catastrophic user/external interference: delete the primary airgap save folder!
        let primary_airgap_target = storage.primary_airgap_root.join("SaveSlots");
        set_tree_readonly(&primary_airgap_target, false);
        std::fs::remove_dir_all(&primary_airgap_target).unwrap();
        assert!(!primary_airgap_target.exists());

        // Re-invoke enable=true while primary airgap folder is missing: must STILL refuse to overwrite the Vault mirror!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Idempotent airgap re-enable must succeed safely");

        // Now disable airgap: must self-heal from external Vault mirror and restore campaign_01.json byte-for-byte!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap restore must self-heal from Vault mirror");

        let restored = std::fs::read(live_saves.join("campaign_01.json"))
            .expect("Original campaign save must be restored");
        assert_eq!(restored.as_slice(), original_save_bytes);

        // Immortal Secondary Vault Mirror MUST remain intact even after airgap is disabled!
        assert!(storage
            .secondary_vault_mirror
            .join("SaveSlots")
            .join("campaign_01.json")
            .exists());

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_crash_stranded_airgap_recovery_from_stale_instance() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_crash_rec_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("Profiles");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let payload = vec![0x42u8; 8192];
        std::fs::write(live_saves.join("slot_alpha"), &payload).unwrap();

        // Generic schema with empty save_extensions = [] (extensionless save files!)
        let schema = make_test_schema(vec!["Profiles"], vec![]);
        let storage = resolve_airgap_storage_paths(
            &docs_dir,
            Some(&vault_dir.to_string_lossy()),
        );

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .unwrap();

        // Simulate OS reboot / crashed previous app session by stamping a stale runtime instance_id
        let marker_file = storage.primary_airgap_root.join(".airgap_active.json");
        std::fs::write(
            &marker_file,
            r#"{"active":true,"instance_id":"crashed-old-os-boot-uuid","targets":["Profiles"]}"#,
        )
        .unwrap();

        let report = recover_stranded_airgap_if_needed(
            &docs_dir,
            &vault_dir.to_string_lossy(),
            &schema,
        )
        .expect("Stranded crash recovery must succeed");
        assert!(report.recovered);
        assert_eq!(
            std::fs::read(live_saves.join("slot_alpha")).unwrap(),
            payload
        );

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_stage2_never_starts_countdown_on_main_menu_stream_or_empty_scratch_dir() {
        let dir = std::env::temp_dir().join(format!(
            "sanctuary_stage2_menu_guard_{}",
            uuid::Uuid::new_v4()
        ));
        let empty_scratch = dir.join("saves").join("scratch");
        std::fs::create_dir_all(&empty_scratch).unwrap();

        let scratch_subdirs = vec!["saves/scratch".to_string()];
        let initial_scratch = snapshot_scratch_files(&dir, &scratch_subdirs);
        assert!(initial_scratch.is_empty());
        assert!(
            !has_post_menu_scratch_file_activity(&dir, &scratch_subdirs, &initial_scratch, 0),
            "An empty scratch directory must NEVER count as post-menu world load activity"
        );

        let mut baseline_ram = 2_566 * 1024 * 1024u64;
        let mut baseline_disk = 120 * 1024 * 1024u64;
        let mut menu_had_focused_input = false;
        let mut menu_active_secs = 0u32;
        let mut settle_ticks = 0u32;
        let mut post_settle_input_ticks = 0u32;

        // 1. Reproduce exact live bug: game streams 3D Main Menu scene to 3,516 MB (+37%) with 31 MB disk while unfocused
        for _ in 0..5 {
            let triggered = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: false,
                    matched_process_stopped: false,
                    current_idle_seconds: 0,
                    current_ram_bytes: 3_516 * 1024 * 1024,
                    ram_diff_bytes: 2 * 1024 * 1024,
                    cumulative_disk_read_bytes: baseline_disk + 31 * 1024 * 1024,
                    disk_io_bytes_this_tick: 2 * 1024 * 1024,
                    disk_rate_mb: 2,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: false,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!triggered, "Main Menu streaming while unfocused must NEVER start Stage 3");
        }
        assert!(!menu_had_focused_input);
        assert_eq!(baseline_ram, 3_516 * 1024 * 1024);

        // 2. Player focuses the Main Menu and clicks Resume/Load Game -> world streams +110 MB disk & +720 MB RAM
        let world_ram = baseline_ram + 720 * 1024 * 1024;
        let world_disk = baseline_disk + 110 * 1024 * 1024;
        let loading_screen_tick = evaluate_stage2_world_loaded(
            &Stage2TickInput {
                dt: 1,
                require_focus: true,
                is_focused: true,
                matched_process_stopped: false,
                current_idle_seconds: 0,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 95 * 1024 * 1024,
                cumulative_disk_read_bytes: world_disk,
                disk_io_bytes_this_tick: 24 * 1024 * 1024,
                disk_rate_mb: 24,
                min_disk_read_mb: 75,
                min_ram_step_percent: 20,
                warm_cache_ram_step_percent: 35,
                scratch_file_created: false,
                scratch_modified_recently: false,
            },
            &mut baseline_ram,
            &mut baseline_disk,
            &mut menu_had_focused_input,
            &mut menu_active_secs,
            &mut settle_ticks,
            &mut post_settle_input_ticks,
        );
        assert!(menu_had_focused_input);
        assert!(!loading_screen_tick, "Must wait until loading screen disk burst settles");

        // 3. Mid-loading-screen lull: disk reads dip to 0 MB/s while RAM still instantiates meshes/shaders (+42 MB/s)
        //    or scratch files are still being unpacked -> MUST NOT settle or start Stage 3!
        for scratch_busy in [false, true] {
            let mid_load = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: 0,
                    current_ram_bytes: world_ram + 42 * 1024 * 1024,
                    ram_diff_bytes: if scratch_busy { 512 * 1024 } else { 42 * 1024 * 1024 },
                    cumulative_disk_read_bytes: world_disk,
                    disk_io_bytes_this_tick: 512 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: scratch_busy,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!mid_load, "Mid-load RAM surges or active scratch unpacking must never start Stage 3");
            assert_eq!(settle_ticks, 0);
        }

        // 4. 2-Stage Map -> Household Lot Loading Screen:
        //    Map screen settles for 4 quiet ticks, player clicks Household (tick 4), then lot loading burst starts -> resets!
        for i in 0..4 {
            let map_tick = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: if i == 3 { 0 } else { 3 },
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 1024 * 1024,
                    cumulative_disk_read_bytes: world_disk,
                    disk_io_bytes_this_tick: 512 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!map_tick, "Clicking Household on World Map must wait 1 verification tick before starting");
        }
        assert_eq!(post_settle_input_ticks, 1);

        // Lot loading screen kicks off right after clicking the Household -> resets back to waiting!
        let lot_burst = evaluate_stage2_world_loaded(
            &Stage2TickInput {
                dt: 1,
                require_focus: true,
                is_focused: true,
                matched_process_stopped: false,
                current_idle_seconds: 2,
                current_ram_bytes: world_ram + 160 * 1024 * 1024,
                ram_diff_bytes: 55 * 1024 * 1024,
                cumulative_disk_read_bytes: world_disk + 35 * 1024 * 1024,
                disk_io_bytes_this_tick: 18 * 1024 * 1024,
                disk_rate_mb: 18,
                min_disk_read_mb: 75,
                min_ram_step_percent: 20,
                warm_cache_ram_step_percent: 35,
                scratch_file_created: true,
                scratch_modified_recently: true,
            },
            &mut baseline_ram,
            &mut baseline_disk,
            &mut menu_had_focused_input,
            &mut menu_active_secs,
            &mut settle_ticks,
            &mut post_settle_input_ticks,
        );
        assert!(!lot_burst);
        assert_eq!(settle_ticks, 0);
        assert_eq!(post_settle_input_ticks, 0);

        // 5. Household lot finishes loading: 4 quiet settled ticks + live player input + 1 settled verification tick -> Stage 3 starts!
        let final_ram = world_ram + 160 * 1024 * 1024;
        let final_disk = world_disk + 35 * 1024 * 1024;
        for i in 0..5 {
            let started = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: if i >= 3 { 0 } else { 2 },
                    current_ram_bytes: final_ram,
                    ram_diff_bytes: 1024 * 1024,
                    cumulative_disk_read_bytes: final_disk,
                    disk_io_bytes_this_tick: 256 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            if i < 4 {
                assert!(!started);
            } else {
                assert!(started, "Stage 3 must start cleanly once world settles and player interacts in live gameplay");
            }
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_corruption_audit_catches_truncation_nulls_and_broken_containers() {
        let dir = std::env::temp_dir().join(format!(
            "sanctuary_save_audit_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        // 1. Null-zeroed crash file -> rejected
        let null_save = dir.join("crashed_zero.bin");
        std::fs::write(&null_save, vec![0u8; 4096]).unwrap();
        assert!(audit_save_file_corruption(&null_save, None).is_err());

        // 2. Truncated JSON save (missing closing brace) -> rejected
        let bad_json = dir.join("truncated.json");
        std::fs::write(&bad_json, b"{\"player\":\"Hero\",\"inventory\":[\"sword\",\"shield\"").unwrap();
        assert!(audit_save_file_corruption(&bad_json, None).is_err());

        // 3. Valid JSON save -> accepted
        let good_json = dir.join("valid.json");
        std::fs::write(&good_json, b"{\"player\":\"Hero\",\"inventory\":[\"sword\",\"shield\"]}\n").unwrap();
        assert!(audit_save_file_corruption(&good_json, None).is_ok());

        // 4. Truncated ZIP container (PK\x03\x04 without PK\x05\x06 EOCD) -> rejected
        let bad_zip = dir.join("truncated_world.sav");
        let mut fake_zip = b"PK\x03\x04".to_vec();
        fake_zip.extend_from_slice(&[0x14; 128]);
        std::fs::write(&bad_zip, &fake_zip).unwrap();
        assert!(audit_save_file_corruption(&bad_zip, None).is_err());

        // 5. Catastrophic size collapse (< 25% of >= 4KB baseline) -> rejected
        let collapsed = dir.join("collapsed.bin");
        std::fs::write(&collapsed, &[0xAB; 512]).unwrap();
        assert!(audit_save_file_corruption(&collapsed, Some(32_768)).is_err());
        assert!(audit_save_file_corruption(&collapsed, Some(600)).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_stage3_timer_stops_on_unfocused_idle_and_pause_menu_cheese() {
        let baseline_ram = 2_400 * 1024 * 1024u64;
        let world_ram = 3_200 * 1024 * 1024u64;
        let mut peak_world_delta = world_ram - baseline_ram;
        let mut elapsed = 0u32;
        let mut pending_idle = 0u32;
        let mut input_mask = 0u16;
        let mut ticks = 0u32;
        let mut cpu_ema = 0.0f32;
        let mut freeze_ticks = 0u32;
        let mut consecutive_active = 0u32;
        let mut loading_cooldown = 0u32;

        // 1. 10 seconds of active focused gameplay -> timer advances cleanly to 10s
        for _ in 0..10 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 6 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 52.0,
                    current_idle_seconds: 0,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None);
        }
        assert_eq!(elapsed, 10);

        // 2. Normal indoor CPU dip while actively playing (`idle == 0..=2`, low RAM/Disk delta)
        //    -> MUST NOT throw a false `GAME_PAUSED`!
        for idle_s in 0..=2 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 128 * 1024,
                    disk_io_bytes_this_tick: 0,
                    current_cpu_usage: 20.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None, "Active input must never trigger false CPU-freeze pause");
        }
        assert_eq!(elapsed, 13);
        assert_eq!(freeze_ticks, 0);

        // 3. Watching an in-game interaction hands-off for 6s (`idle = 1..=6` within `max_idle_seconds: 10`)
        //    followed by resuming active input -> zero false IDLE pause and seamless cadence bridge!
        for idle_s in 1..=6 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 2 * 1024 * 1024,
                    disk_io_bytes_this_tick: 64 * 1024,
                    current_cpu_usage: 45.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None, "Short animation-watch pause must not throw false IDLE");
        }
        assert_eq!(elapsed, 16);
        assert_eq!(pending_idle, 3);

        for _ in 0..2 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 4 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 48.0,
                    current_idle_seconds: 0,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None);
        }
        assert_eq!(elapsed, 21);
        assert_eq!(pending_idle, 0);

        // 4. Player presses Esc / Pause hotkey (`hotkey_paused: true`) and keeps moving mouse around the Pause Menu
        //    -> IMMEDIATELY pauses with GAME_PAUSED and credits 0 seconds!
        for _ in 0..4 {
            let esc_reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: true,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 6 * 1024 * 1024,
                    disk_io_bytes_this_tick: 64 * 1024,
                    current_cpu_usage: 40.0,
                    current_idle_seconds: 0, // moving mouse inside Esc menu!
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(esc_reason.as_deref(), Some("GAME_PAUSED"));
        }
        assert_eq!(elapsed, 21);

        // 5. Player goes hands-off past `max_idle_seconds: 10` -> wipes buffered pending_idle to 0 and flags IDLE!
        for idle_s in 4..=11 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 4 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 44.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(elapsed, 21);
            if idle_s <= 10 {
                assert_eq!(reason, None);
            } else {
                assert_eq!(reason.as_deref(), Some("IDLE"));
                assert_eq!(pending_idle, 0);
            }
        }

        // 6. Alt-tabbing / unfocused stops immediately and discards buffered grace seconds
        let _ = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 4 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 44.0,
                current_idle_seconds: 5,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(pending_idle, 1);
        let unfocused_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: false,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 4 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 44.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(unfocused_reason.as_deref(), Some("UNFOCUSED"));
        assert_eq!(pending_idle, 0);
        assert_eq!(elapsed, 21);

        // 7. Hands-off frozen simulation (`idle >= 3`, static RAM/Disk, `< active_cpu_ema * 0.45` for 3 ticks)
        //    -> catches GAME_PAUSED and discards pending_idle!
        freeze_ticks = 0;
        let mut modal_pause_reason = None;
        for idle_s in 4..=6 {
            modal_pause_reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 128 * 1024,
                    disk_io_bytes_this_tick: 0,
                    current_cpu_usage: 14.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
        }
        assert_eq!(modal_pause_reason.as_deref(), Some("GAME_PAUSED"));
        assert_eq!(pending_idle, 0);
        assert_eq!(elapsed, 21);

        // 8. Heavy secondary lot/zone travel loading burst mid-test -> pauses with LOADING_WORLD
        let zone_load_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 32 * 1024 * 1024,
                disk_io_bytes_this_tick: 28 * 1024 * 1024,
                current_cpu_usage: 55.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(zone_load_reason.as_deref(), Some("LOADING_WORLD"));
        loading_cooldown = 0;

        // 9. Resuming genuine active gameplay clears freeze_ticks and increments cleanly
        let resume_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 6 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 48.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(resume_reason, None);
        assert_eq!(elapsed, 22);
    }

    #[test]
    fn test_configure_lab_test_save_accepts_external_file_paths_and_folder_imports() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_save_import_test_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let ext_backup_dir = base.join("ExternalBackupSaves");
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::create_dir_all(&ext_backup_dir).unwrap();

        let slot_a = ext_backup_dir.join("Slot_Alpha.json");
        let slot_a_rev = ext_backup_dir.join("Slot_Alpha.json.ver0");
        let slot_b = ext_backup_dir.join("Slot_Beta.json");
        std::fs::write(&slot_a, b"{\"slot\":\"alpha\"}").unwrap();
        std::fs::write(&slot_a_rev, b"{\"slot\":\"alpha_rev0\"}").unwrap();
        std::fs::write(&slot_b, b"{\"slot\":\"beta\"}").unwrap();

        let schema = make_test_schema(vec!["SaveSlots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(&docs_dir, None);

        let status = configure_lab_test_save_internal(
            &docs_dir.to_string_lossy(),
            "import_to_live_saves",
            None,
            Some(vec![
                slot_a.to_string_lossy().to_string(),
                slot_b.to_string_lossy().to_string(),
            ]),
            &schema,
        )
        .expect("import_to_live_saves with external_file_paths must succeed");

        assert!(status.has_test_save);
        assert_eq!(status.available_live_saves.len(), 2);
        assert!(docs_dir
            .join("SaveSlots")
            .join("Slot_Alpha.json.ver0")
            .exists());
        assert!(storage
            .secondary_vault_mirror
            .join("SaveSlots")
            .join("Slot_Alpha.json")
            .exists());

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_lab_deploy_stages_only_selected_mod_and_atomic_twin_never_collection_siblings() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_lab_single_mod_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let vault_mods = crate::utils::get_vault_mods_lane(&vault_dir.to_string_lossy());
        let pack_dir = vault_mods.join("Garden Collection Pack");
        let live_mods = base.join("LiveMods");
        std::fs::create_dir_all(&pack_dir).unwrap();
        std::fs::create_dir_all(&live_mods).unwrap();

        let target_pkg = pack_dir.join("Juniper_Short.pkg");
        let target_twin = pack_dir.join("Juniper_Short.script");
        let sibling_a = pack_dir.join("Garden_Gate.pkg");
        let sibling_b = pack_dir.join("Picnic_Table.pkg");
        std::fs::write(&target_pkg, b"juniper_mesh").unwrap();
        std::fs::write(&target_twin, b"juniper_logic").unwrap();
        std::fs::write(&sibling_a, b"gate_mesh").unwrap();
        std::fs::write(&sibling_b, b"table_mesh").unwrap();

        let schema_json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "supported_extensions": [".pkg", ".script"]
        });
        let schema: Option<crate::schema::GameSchema> =
            Some(serde_json::from_value(schema_json).unwrap());

        let linked = deploy_single_mod_to_live_sync(
            "Garden Collection Pack/Juniper_Short.pkg",
            None,
            &[],
            false,
            &live_mods.to_string_lossy(),
            &vault_dir.to_string_lossy(),
            &schema,
        )
        .expect("single mod lab deploy should succeed");

        assert_eq!(
            linked.len(),
            2,
            "Expected ONLY Juniper_Short.pkg + Juniper_Short.script twin, got: {:?}",
            linked
        );
        assert!(linked.iter().any(|p| p.ends_with("Juniper_Short.pkg")));
        assert!(linked.iter().any(|p| p.ends_with("Juniper_Short.script")));
        assert!(!linked.iter().any(|p| p.contains("Garden_Gate")));
        assert!(!linked.iter().any(|p| p.contains("Picnic_Table")));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_safe_wipe_mods_dir_clears_subfolders_metadata_and_rescues_real_files() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_wipe_mods_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let live_mods = base.join("mods");
        let nested_mod_dir = live_mods.join("SubFolderMod");
        std::fs::create_dir_all(&vault_dir).unwrap();
        std::fs::create_dir_all(&nested_mod_dir).unwrap();

        std::fs::write(
            live_mods.join(".sanctuary_deployed_links.json"),
            b"[\"old_link\"]",
        )
        .unwrap();
        std::fs::write(live_mods.join("Manifest.cfg"), b"Priority 500").unwrap();
        std::fs::write(nested_mod_dir.join("RealNestedMod.pkg"), b"real_mod_payload").unwrap();
        std::fs::write(nested_mod_dir.join("mod_settings.cfg"), b"setting=true").unwrap();

        let schema_json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "supported_extensions": [".pkg"],
            "paths": {
                "manifest_file": "Manifest.cfg"
            },
            "load_order": {
                "strategy": "folder_priority"
            }
        });
        let schema: Option<crate::schema::GameSchema> =
            Some(serde_json::from_value(schema_json).unwrap());

        crate::utils::safe_wipe_mods_dir_with_vault(
            &live_mods,
            Some(&vault_dir.to_string_lossy()),
            &schema,
        );

        assert!(
            !live_mods.join(".sanctuary_deployed_links.json").exists(),
            "Internal deployment JSON must be removed during Vault Lockdown"
        );
        assert!(
            !nested_mod_dir.exists(),
            "Subfolders inside mods directory must be evacuated and removed during Vault Lockdown"
        );
        assert!(
            live_mods.join("Manifest.cfg").exists(),
            "Root schema manifest file must remain intact"
        );
        let vault_mods = crate::utils::get_vault_mods_lane(&vault_dir.to_string_lossy());
        assert!(
            vault_mods.join("SubFolderMod").join("RealNestedMod.pkg").exists(),
            "Real nested mod file must be rescued into Vault/Mods"
        );
        assert!(
            vault_mods.join("SubFolderMod").join("mod_settings.cfg").exists(),
            "Nested user config file must also be preserved in Vault/Mods"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_homestead_sandbox_save_verifies_write_then_rewinds_to_pristine_airgapped_baseline() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_immutable_homestead_save_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("SaveSlots");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let pristine_save_bytes =
            b"{\"world\":\"CleanHomesteadWorld\",\"tick\":100,\"mod_taint\":false}\n";
        std::fs::write(live_saves.join("Slot_01.json"), pristine_save_bytes).unwrap();

        let schema = make_test_schema(vec!["SaveSlots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(&docs_dir, Some(&vault_dir.to_string_lossy()));

        // 1. User clones `Slot_01.json` as their Homestead test save
        let configured = configure_lab_test_save_internal(
            &docs_dir.to_string_lossy(),
            "copy_live_save",
            Some("Slot_01.json".to_string()),
            None,
            &schema,
        )
        .expect("copy_live_save must succeed");
        assert!(configured.has_test_save);

        // 2. Test #1 launches (`enable = true`): mounts a disposable writable copy in `docs_dir/SaveSlots`
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable for Test #1 must succeed");

        let working_slot = live_saves.join("Slot_01.json");
        let golden_slot = storage.sandbox_root.join("SaveSlots").join("Slot_01.json");
        assert_eq!(std::fs::read(&working_slot).unwrap(), pristine_save_bytes);
        assert_eq!(std::fs::read(&golden_slot).unwrap(), pristine_save_bytes);

        // 3. During Stage 4 (`AWAITING_SAVE`), the game saves over `working_slot` (and even drops an extra Save-As file)
        let mutated_test1_bytes =
            b"{\"world\":\"CleanHomesteadWorld\",\"tick\":940,\"mod_taint\":true,\"injected_items\":42}\n";
        std::fs::write(&working_slot, mutated_test1_bytes).unwrap();
        std::fs::write(
            live_saves.join("Slot_99_ExtraSaveAs.json"),
            b"{\"extra\":true}\n",
        )
        .unwrap();

        // Stage 4 save serialization audit succeeds on the real in-engine save write...
        assert!(audit_save_file_corruption(&working_slot, Some(pristine_save_bytes.len() as u64)).is_ok());

        // ...and on teardown (`enable = false`), the mutated working copy is DISCARDED while the
        // Homestead test save remains 100% byte-for-byte identical to the pristine airgapped version!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap teardown after Test #1 must rewind disposable save");

        assert_eq!(
            std::fs::read(&golden_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Golden Homestead baseline save must NEVER retain test mutations"
        );
        assert!(
            !storage
                .sandbox_root
                .join("SaveSlots")
                .join("Slot_99_ExtraSaveAs.json")
                .exists(),
            "Extra test-time Save-As files must not pollute the Homestead baseline"
        );
        assert_eq!(
            std::fs::read(live_saves.join("Slot_01.json"))
                .unwrap()
                .as_slice(),
            pristine_save_bytes,
            "User's normal live save must also be restored byte-for-byte"
        );

        // 4. Test #2 launches with a broken mod that corrupts `working_slot` on save -> teardown STILL keeps Homestead save clean!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable for Test #2 must mount pristine Homestead save again");
        assert_eq!(
            std::fs::read(&working_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Test #2 must start from the untouched pristine Homestead save"
        );

        std::fs::write(&working_slot, vec![0u8; 4096]).unwrap(); // catastrophic null-zeroed crash write!
        assert!(audit_save_file_corruption(&working_slot, Some(pristine_save_bytes.len() as u64)).is_err());

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap teardown after corrupted Test #2 must discard corrupted working copy");

        assert_eq!(
            std::fs::read(&golden_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Even after a save-corrupting mod failure, Homestead test save remains 100% uncorrupted!"
        );

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.sandbox_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }
}



