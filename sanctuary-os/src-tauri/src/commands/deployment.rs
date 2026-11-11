use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::Manager;

pub fn purge_stale_caches_in_docs(
    root: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !root.exists() || !root.is_dir() || !crate::utils::is_safe_user_file_path(root) {
        return;
    }

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
            if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
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

    purge_stale_caches_in_docs(&doc_dir, game_schema);
    purge_stale_caches_in_docs(std::path::Path::new(&mods_path), game_schema);

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
        open_cmd.arg("-a").arg(&exe_path);
        if !launch_args.is_empty() {
            open_cmd.arg("--args").args(&launch_args);
        }
        return match open_cmd.spawn() {
            Ok(_) => Ok("backend_ignition_started".to_string()),
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
            steam_cmd.args(["-applaunch", &app_id]);
            if !launch_args.is_empty() {
                steam_cmd.args(&launch_args);
            }
            if steam_cmd.spawn().is_ok() {
                return Ok("backend_ignition_started".to_string());
            }
            if launch_args.is_empty()
                && std::process::Command::new("xdg-open")
                    .arg(format!("steam://rungameid/{}", app_id))
                    .spawn()
                    .is_ok()
            {
                return Ok("backend_ignition_started".to_string());
            }
        }

        let mut wine_cmd = std::process::Command::new("wine");
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
            Ok(_) => Ok("backend_ignition_started".to_string()),
            Err(e) => Err(e.to_string()),
        };
    }

    match std::process::Command::new(&exe_path)
        .args(&launch_args)
        .current_dir(parent_dir)
        .spawn()
    {
        Ok(_) => Ok("backend_ignition_started".to_string()),
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
    pub airgap_active: bool,
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
        let fname = entry.file_name().to_string_lossy();
        if fname.starts_with(".sanctuary") {
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

fn copy_save_directory_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in walkdir::WalkDir::new(src)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        let Ok(rel) = p.strip_prefix(src) else {
            continue;
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(p, &out).map_err(|e| e.to_string())?;
            if let Ok(meta) = std::fs::metadata(&out) {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(&out, perms);
            }
        }
    }
    Ok(())
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

    if !file_exts.is_empty() {
        for entry in walkdir::WalkDir::new(dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            let name_lower = fname.to_lowercase();
            let matches_ext = file_exts.iter().any(|ext| name_lower.ends_with(ext));
            if !matches_ext {
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

    list.sort_by(|a, b| b.modified_epoch.cmp(&a.modified_epoch));
    list
}

fn compute_lab_test_save_status(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> LabTestSaveStatus {
    let targets = resolve_save_airgap_targets(game_schema);
    let Some(primary_save_rel) = targets.first().cloned() else {
        return LabTestSaveStatus {
            has_test_save: false,
            active_test_save: None,
            sandbox_saves: Vec::new(),
            available_live_saves: Vec::new(),
            airgap_active: false,
        };
    };
    let save_exts = resolve_save_extensions(game_schema);

    let airgap_root = docs_dir.join(".sanctuary_lab_airgap");
    let sandbox_root = docs_dir.join(".sanctuary_lab_sandbox");
    let marker_file = airgap_root.join(".airgap_active.json");
    let airgap_active = marker_file.exists() || airgap_root.join(&primary_save_rel).exists();

    let (sandbox_saves_dir, live_saves_dir) = if airgap_active {
        (
            crate::utils::resolve_case_insensitive_path(docs_dir, &primary_save_rel),
            crate::utils::resolve_case_insensitive_path(&airgap_root, &primary_save_rel),
        )
    } else {
        (
            crate::utils::resolve_case_insensitive_path(&sandbox_root, &primary_save_rel),
            crate::utils::resolve_case_insensitive_path(docs_dir, &primary_save_rel),
        )
    };

    let sandbox_saves = list_saves_in_dir(&sandbox_saves_dir, &save_exts);
    let available_live_saves = list_saves_in_dir(&live_saves_dir, &save_exts);

    let seeded_marker = sandbox_saves_dir.join(".sanctuary_seeded_save");
    let preferred_name = std::fs::read_to_string(&seeded_marker)
        .ok()
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

    LabTestSaveStatus {
        has_test_save: active_test_save.is_some(),
        active_test_save,
        sandbox_saves,
        available_live_saves,
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

fn set_tree_readonly(dir: &Path, readonly: bool) {
    if !dir.exists() {
        return;
    }
    for entry in walkdir::WalkDir::new(dir)
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

pub fn apply_save_airgap(
    docs_path: &str,
    enable: bool,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    let docs_dir = resolve_docs_root(docs_path, game_schema);
    if !docs_dir.exists() {
        return Ok("Documents directory not found".to_string());
    }

    let targets = resolve_save_airgap_targets(game_schema);
    let airgap_root = docs_dir.join(".sanctuary_lab_airgap");
    let sandbox_root = docs_dir.join(".sanctuary_lab_sandbox");
    let marker_file = airgap_root.join(".airgap_active.json");

    if enable {
        let _ = std::fs::create_dir_all(&airgap_root);
        let _ = std::fs::create_dir_all(&sandbox_root);

        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target = crate::utils::resolve_case_insensitive_path(&airgap_root, target_name);
            let sandbox_target = crate::utils::resolve_case_insensitive_path(&sandbox_root, target_name);
            let is_sandbox_already = live_target.join(".sanctuary_sandbox_marker").exists();

            // Evacuate live saves only if not already airgapped and not a sandbox folder
            if live_target.exists() && !airgap_target.exists() && !is_sandbox_already {
                if let Some(parent) = airgap_target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if std::fs::rename(&live_target, &airgap_target).is_err() {
                    let _ = deploy_air_gap(&live_target, &airgap_target);
                    set_tree_readonly(&live_target, false);
                    let _ = std::fs::remove_dir_all(&live_target);
                }
                // Hardware-lock all evacuated live save files as read-only
                set_tree_readonly(&airgap_target, true);
            } else if airgap_target.exists() {
                set_tree_readonly(&airgap_target, true);
            }

            // Swap in the isolated Lab sandbox folder so test runs have their own dedicated test save space
            if !live_target.exists() {
                if sandbox_target.exists() {
                    if std::fs::rename(&sandbox_target, &live_target).is_err() {
                        let _ = deploy_air_gap(&sandbox_target, &live_target);
                        set_tree_readonly(&sandbox_target, false);
                        let _ = std::fs::remove_dir_all(&sandbox_target);
                    }
                }
                let _ = std::fs::create_dir_all(&live_target);
            }
            set_tree_readonly(&live_target, false);

            // Sync .sanctuary_seeded_save marker with the dedicated test save in the sandbox (if one exists)
            let save_exts = resolve_save_extensions(game_schema);
            let current_sandbox_saves = list_saves_in_dir(&live_target, &save_exts);
            let seeded_marker = live_target.join(".sanctuary_seeded_save");
            if let Some(first_save) = current_sandbox_saves.first() {
                let existing_marker_valid = std::fs::read_to_string(&seeded_marker)
                    .ok()
                    .map(|s| s.trim().to_string())
                    .map(|m| {
                        current_sandbox_saves
                            .iter()
                            .any(|s| s.file_name.eq_ignore_ascii_case(&m))
                    })
                    .unwrap_or(false);
                if !existing_marker_valid {
                    let _ = std::fs::write(&seeded_marker, first_save.file_name.as_bytes());
                }
            } else {
                let _ = std::fs::remove_file(&seeded_marker);
            }

            let _ = std::fs::write(
                live_target.join(".sanctuary_sandbox_marker"),
                "SANCTUARY_ISOLATED_LAB_SANDBOX",
            );
        }

        let _ = std::fs::write(
            &marker_file,
            serde_json::json!({
                "active": true,
                "targets": targets,
            })
            .to_string(),
        );
        Ok("Saves physically airgapped and sandboxed".to_string())
    } else {
        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target = crate::utils::resolve_case_insensitive_path(&airgap_root, target_name);
            let sandbox_target = crate::utils::resolve_case_insensitive_path(&sandbox_root, target_name);

            if airgap_target.exists() {
                // Unlock evacuated saves before restoring
                set_tree_readonly(&airgap_target, false);

                if live_target.exists() {
                    if let Some(parent) = sandbox_target.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if sandbox_target.exists() {
                        set_tree_readonly(&sandbox_target, false);
                        let _ = std::fs::remove_dir_all(&sandbox_target);
                    }
                    // Move sandbox saves back to .sanctuary_lab_sandbox so the dedicated test save persists
                    if std::fs::rename(&live_target, &sandbox_target).is_err() {
                        let _ = deploy_air_gap(&live_target, &sandbox_target);
                        set_tree_readonly(&live_target, false);
                        let _ = std::fs::remove_dir_all(&live_target);
                    }
                }

                // Restore real live saves
                if std::fs::rename(&airgap_target, &live_target).is_err() {
                    let _ = deploy_air_gap(&airgap_target, &live_target);
                    let _ = std::fs::remove_dir_all(&airgap_target);
                }
            }

            // Ensure live saves are unlocked (clears any legacy read-only flags too)
            set_tree_readonly(&live_target, false);
            let _ = std::fs::remove_file(live_target.join(".sanctuary_sandbox_marker"));
        }

        let _ = std::fs::remove_file(&marker_file);
        Ok("Live saves restored from airgap".to_string())
    }
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

#[tauri::command]
pub async fn configure_lab_test_save(
    docs_path: String,
    mode: String,
    source_save_name: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let targets = resolve_save_airgap_targets(&game_schema);
        let primary_save_rel = targets
            .first()
            .cloned()
            .ok_or_else(|| "No save airgap target configured in active GameSchema.".to_string())?;
        let save_exts = resolve_save_extensions(&game_schema);
        let allow_dir_slots = is_directory_save_mode(&save_exts);
        let file_exts: Vec<String> = save_exts
            .iter()
            .map(|e| e.trim().to_lowercase())
            .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
            .collect();

        let airgap_root = docs_dir.join(".sanctuary_lab_airgap");
        let sandbox_root = docs_dir.join(".sanctuary_lab_sandbox");
        let marker_file = airgap_root.join(".airgap_active.json");
        let airgap_active = marker_file.exists() || airgap_root.join(&primary_save_rel).exists();

        let (sandbox_saves_dir, live_saves_dir) = if airgap_active {
            (
                docs_dir.join(&primary_save_rel),
                airgap_root.join(&primary_save_rel),
            )
        } else {
            (
                sandbox_root.join(&primary_save_rel),
                docs_dir.join(&primary_save_rel),
            )
        };

        let _ = std::fs::create_dir_all(&sandbox_saves_dir);
        set_tree_readonly(&sandbox_saves_dir, false);
        let seeded_marker = sandbox_saves_dir.join(".sanctuary_seeded_save");
        let sandbox_allowed = [sandbox_saves_dir.clone()];

        let clear_sandbox_saves = || {
            if !file_exts.is_empty() {
                for entry in walkdir::WalkDir::new(&sandbox_saves_dir)
                    .max_depth(2)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        let matches_save_ext =
                            file_exts.iter().any(|ext| fname_lower.ends_with(ext));
                        if (matches_save_ext || fname_lower == ".sanctuary_seeded_save")
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
            }
            if allow_dir_slots {
                if let Ok(entries) = std::fs::read_dir(&sandbox_saves_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if p.is_dir()
                            && !name.starts_with('.')
                            && crate::utils::ensure_strict_descendant_of_roots(&p, &sandbox_allowed)
                                .is_ok()
                        {
                            set_tree_readonly(&p, false);
                            let _ = std::fs::remove_dir_all(&p);
                        }
                    }
                }
            }
        };

        match mode.as_str() {
            "reset_for_fresh_save" => {
                clear_sandbox_saves();
                let _ = std::fs::remove_file(&seeded_marker);
            }
            "select_sandbox_save" => {
                if let Some(target_name) = source_save_name.filter(|s| !s.trim().is_empty()) {
                    let _ = std::fs::write(&seeded_marker, target_name.trim().as_bytes());
                }
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

                let mut found_src: Option<PathBuf> = None;
                if live_saves_dir.exists() {
                    if allow_dir_slots {
                        if let Ok(entries) = std::fs::read_dir(&live_saves_dir) {
                            for entry in entries.flatten() {
                                if entry.path().is_dir()
                                    && entry
                                        .file_name()
                                        .to_string_lossy()
                                        .eq_ignore_ascii_case(&target_name)
                                {
                                    found_src = Some(entry.path());
                                    break;
                                }
                            }
                        }
                    }
                    if found_src.is_none() {
                        for entry in walkdir::WalkDir::new(&live_saves_dir)
                            .max_depth(2)
                            .into_iter()
                            .filter_map(|e| e.ok())
                        {
                            if entry.file_type().is_file()
                                && entry
                                    .file_name()
                                    .to_string_lossy()
                                    .eq_ignore_ascii_case(&target_name)
                            {
                                found_src = Some(entry.path().to_path_buf());
                                break;
                            }
                        }
                    }
                }

                let src_path = found_src.ok_or_else(|| {
                    format!("Could not locate save '{}' in live saves.", target_name)
                })?;

                clear_sandbox_saves();

                let clean_fname = src_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&target_name)
                    .to_string();
                let dst_path = sandbox_saves_dir.join(&clean_fname);
                crate::utils::ensure_strict_descendant_of_roots(&dst_path, &sandbox_allowed)?;

                if src_path.is_dir() {
                    copy_save_directory_recursive(&src_path, &dst_path)?;
                } else {
                    std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
                    if let Ok(meta) = std::fs::metadata(&dst_path) {
                        let mut perms = meta.permissions();
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&dst_path, perms);
                    }
                }
                let _ = std::fs::write(&seeded_marker, clean_fname.as_bytes());
            }
            _ => return Err(format!("Unsupported Lab Test Save mode: {}", mode)),
        }

        Ok(compute_lab_test_save_status(&docs_dir, &game_schema))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn airgap_saves(
    docs_path: String,
    enable: bool,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        apply_save_airgap(&docs_path, enable, &game_schema)
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
        let targets = resolve_save_airgap_targets(&game_schema);
        let airgap_root = docs_dir.join(".sanctuary_lab_airgap");
        let marker_file = airgap_root.join(".airgap_active.json");

        let mut protected_files_count = 0usize;
        let mut any_airgap_dir = false;
        for t in &targets {
            let dir = airgap_root.join(t);
            if dir.exists() {
                any_airgap_dir = true;
                for entry in walkdir::WalkDir::new(&dir)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        protected_files_count += 1;
                    }
                }
            }
        }

        Ok(AirgapStatus {
            active: marker_file.exists() || any_airgap_dir,
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
pub fn wipe_symlinks() -> Result<String, String> {
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
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.filter_map(Result::ok) {
            if let Ok(meta) = std::fs::symlink_metadata(&entry.path()) {
                if meta.file_type().is_symlink() || entry.path().read_link().is_ok() {
                    if entry.path().is_dir() {
                        let _ = std::fs::remove_dir(&entry.path());
                    } else {
                        let _ = std::fs::remove_file(&entry.path());
                    }
                    count += 1;
                }
            }
        }
    }
    Ok(format!("{} active links severed.", count))
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
    awaiting_save_since_epoch: Option<u64>,
    save_detected_epoch: Option<u64>,
    verified_save_name: Option<String>,
    tracked_pid: Option<u32>,
    baseline_ram_bytes: u64,
    baseline_disk_read_bytes: u64,
    current_ram_bytes: u64,
    cumulative_disk_read_bytes: u64,
    prev_ram_bytes: u64,
    prev_disk_read_bytes: u64,
    boot_plateau_ticks: u32,
    peak_ram_bytes: u64,
    required_active_seconds: u32,
    elapsed_active_seconds: u32,
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
    initial_save_mtimes: HashMap<PathBuf, u64>,
    last_poll_epoch: u64,
    linked_files: Vec<String>,
    notified_awaiting_save: bool,
    notified_verified: bool,
    notified_failed: bool,
    error_log: Option<String>,
    certificate: Option<LabVerificationCertificate>,
    sys: sysinfo::System,
}

static LAB_SESSION: std::sync::OnceLock<std::sync::Mutex<Option<ActiveLabSession>>> =
    std::sync::OnceLock::new();

struct LabInputWatchState {
    running: std::sync::atomic::AtomicBool,
    target_pid: std::sync::atomic::AtomicU32,
    game_paused: std::sync::atomic::AtomicBool,
}

static LAB_INPUT_WATCH: std::sync::OnceLock<Arc<LabInputWatchState>> = std::sync::OnceLock::new();

fn get_lab_input_watch() -> &'static Arc<LabInputWatchState> {
    LAB_INPUT_WATCH.get_or_init(|| {
        Arc::new(LabInputWatchState {
            running: std::sync::atomic::AtomicBool::new(false),
            target_pid: std::sync::atomic::AtomicU32::new(0),
            game_paused: std::sync::atomic::AtomicBool::new(false),
        })
    })
}

#[cfg(target_os = "windows")]
fn start_windows_pause_key_watcher(game_schema: &Option<crate::schema::GameSchema>) {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let hotkey_enabled = game_schema
        .as_ref()
        .and_then(|s| s.lab_verification.as_ref())
        .and_then(|lv| lv.enable_hotkey_pause_detection)
        .unwrap_or(false);

    let pause_vks = game_schema
        .as_ref()
        .and_then(|s| s.lab_verification.as_ref())
        .and_then(|lv| lv.pause_key_vk_codes.clone())
        .filter(|v| !v.is_empty());
    let resume_vks = game_schema
        .as_ref()
        .and_then(|s| s.lab_verification.as_ref())
        .and_then(|lv| lv.resume_key_vk_codes.clone())
        .filter(|v| !v.is_empty());

    let watch = get_lab_input_watch().clone();
    watch.game_paused.store(false, Ordering::SeqCst);
    let Some(pause_vks) = pause_vks.filter(|_| hotkey_enabled) else {
        watch.running.store(false, Ordering::SeqCst);
        return;
    };

    if watch
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::Builder::new()
        .name("sanctuary-lab-key-watcher".to_string())
        .spawn(move || {
            let mut was_pause_down = false;

            while watch.running.load(Ordering::SeqCst) {
                let pid = watch.target_pid.load(Ordering::SeqCst);
                let mut focused = false;
                if pid != 0 {
                    unsafe {
                        let hwnd = GetForegroundWindow();
                        if !hwnd.0.is_null() {
                            let mut fg_pid: u32 = 0;
                            GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                            if fg_pid == pid {
                                focused = true;
                            }
                        }
                    }
                }

                if focused {
                    unsafe {
                        let is_down = |vk: i32| -> bool {
                            (GetAsyncKeyState(vk) as u16 & 0x8000) != 0
                        };

                        let any_pause = pause_vks.iter().any(|&vk| is_down(vk as i32));
                        if any_pause && !was_pause_down {
                            let cur = watch.game_paused.load(Ordering::SeqCst);
                            watch.game_paused.store(!cur, Ordering::SeqCst);
                        }
                        was_pause_down = any_pause;

                        if let Some(ref resume_list) = resume_vks {
                            if resume_list.iter().any(|&vk| is_down(vk as i32)) {
                                watch.game_paused.store(false, Ordering::SeqCst);
                            }
                        }
                    }
                } else {
                    was_pause_down = false;
                }

                std::thread::sleep(std::time::Duration::from_millis(60));
            }
        })
        .ok();
}

#[cfg(not(target_os = "windows"))]
fn start_windows_pause_key_watcher(_game_schema: &Option<crate::schema::GameSchema>) {}

fn stop_windows_pause_key_watcher() {
    let watch = get_lab_input_watch();
    watch.running.store(false, Ordering::SeqCst);
    watch.target_pid.store(0, Ordering::SeqCst);
    watch.game_paused.store(false, Ordering::SeqCst);
}

fn spawn_or_refresh_lab_overlay(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    std::thread::Builder::new()
        .name("sanctuary-lab-overlay-spawn".to_string())
        .spawn(move || {
            if let Some(win) = app_handle.get_webview_window("lab-hud-overlay") {
                let _ = win.set_always_on_top(true);
                let _ = win.set_ignore_cursor_events(true);
                let _ = win.show();
            } else if let Ok(win) = tauri::WebviewWindowBuilder::new(
                &app_handle,
                "lab-hud-overlay",
                tauri::WebviewUrl::App("index.html?lab_overlay=1".into()),
            )
            .title("Sanctuary Lab HUD")
            .inner_size(390.0, 118.0)
            .position(24.0, 24.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .resizable(false)
            .shadow(false)
            .build()
            {
                let _ = win.set_ignore_cursor_events(true);
            }
        })
        .ok();
}

fn close_lab_overlay(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        if let Some(win) = app_handle.get_webview_window("lab-hud-overlay") {
            let _ = win.close();
        }
    });
}

fn notify_player_over_game(app: &tauri::AppHandle, title: &str, body: &str, is_error: bool) {
    let _ = is_error;
    #[cfg(target_os = "windows")]
    unsafe {
        #[link(name = "user32")]
        extern "system" {
            fn MessageBeep(uType: u32) -> i32;
        }
        // MB_ICONHAND = 0x10, MB_ICONASTERISK = 0x40
        let _ = MessageBeep(if is_error { 0x00000010 } else { 0x00000040 });
    }

    let _ = crate::commands::system::send_sanctuary_notification(
        app.clone(),
        title.to_string(),
        body.to_string(),
    );
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

fn snapshot_save_mtimes(
    docs_dir: &Path,
    save_targets: &[String],
    save_extensions: &[String],
) -> HashMap<PathBuf, u64> {
    let mut map = HashMap::new();
    if save_targets.is_empty() {
        return map;
    }
    let file_exts: Vec<String> = save_extensions
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
        .collect();
    let allow_dir_slots = is_directory_save_mode(save_extensions);

    for rel in save_targets {
        let saves_dir = docs_dir.join(rel);
        if !saves_dir.exists() {
            continue;
        }
        if !file_exts.is_empty() {
            for entry in walkdir::WalkDir::new(&saves_dir)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let name_lower = entry.file_name().to_string_lossy().to_lowercase();
                if file_exts.iter().any(|ext| name_lower.ends_with(ext)) {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(mtime) = meta.modified() {
                            if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                                map.insert(entry.path().to_path_buf(), dur.as_secs());
                            }
                        }
                    }
                }
            }
        }
        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !name.starts_with('.') {
                        if let Some((slot_mtime, _)) = compute_dir_save_slot_stats(&slot_path) {
                            map.insert(slot_path, slot_mtime);
                        }
                    }
                }
            }
        }
    }
    map
}

fn check_scratch_activity(docs_dir: &Path, scratch_subdirs: &[String], since_epoch: u64) -> bool {
    for sub in scratch_subdirs {
        let dir = docs_dir.join(sub);
        if dir.exists() {
            for entry in walkdir::WalkDir::new(&dir)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(mtime) = meta.modified() {
                        if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                            if dur.as_secs() >= since_epoch {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

fn detect_new_save_file(
    docs_dir: &Path,
    save_targets: &[String],
    save_extensions: &[String],
    initial_mtimes: &HashMap<PathBuf, u64>,
    min_epoch: u64,
) -> Option<String> {
    if save_targets.is_empty() {
        return None;
    }
    let file_exts: Vec<String> = save_extensions
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
        .collect();
    let allow_dir_slots = is_directory_save_mode(save_extensions);

    for rel in save_targets {
        let saves_dir = docs_dir.join(rel);
        if !saves_dir.exists() {
            continue;
        }
        if !file_exts.is_empty() {
            for entry in walkdir::WalkDir::new(&saves_dir)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_string();
                let name_lower = fname.to_lowercase();
                if !file_exts.iter().any(|ext| name_lower.ends_with(ext)) {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if meta.len() == 0 {
                        continue;
                    }
                    if let Ok(mtime) = meta.modified() {
                        if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                            let secs = dur.as_secs();
                            let prev = initial_mtimes.get(entry.path()).copied().unwrap_or(0);
                            if secs > prev && secs >= min_epoch {
                                let _ = std::fs::write(
                                    saves_dir.join(".sanctuary_seeded_save"),
                                    fname.as_bytes(),
                                );
                                return Some(fname);
                            }
                        }
                    }
                }
            }
        }
        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let dname = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !dname.starts_with('.') {
                        if let Some((secs, _)) = compute_dir_save_slot_stats(&slot_path) {
                            let prev = initial_mtimes.get(&slot_path).copied().unwrap_or(0);
                            if secs > prev && secs >= min_epoch {
                                let _ = std::fs::write(
                                    saves_dir.join(".sanctuary_seeded_save"),
                                    dname.as_bytes(),
                                );
                                return Some(dname);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_windows_focus_and_idle(target_pid: Option<u32>) -> (bool, u32) {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let mut is_focused = false;
    if let Some(pid) = target_pid {
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.0.is_null() {
                let mut fg_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                if fg_pid == pid {
                    is_focused = true;
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

    (is_focused, idle_secs)
}

#[cfg(not(target_os = "windows"))]
fn get_windows_focus_and_idle(target_pid: Option<u32>) -> (bool, u32) {
    let Some(pid) = target_pid else {
        return (false, 0);
    };
    #[cfg(target_os = "linux")]
    {
        // Verify process is alive in /proc/<pid> and not stopped (T) or zombie (Z)
        let stat_path = format!("/proc/{}/stat", pid);
        if let Ok(stat) = std::fs::read_to_string(&stat_path) {
            if let Some(rparen) = stat.rfind(')') {
                let after = stat[rparen + 1..].trim();
                let state_char = after.chars().next().unwrap_or('S');
                let alive_and_running = !matches!(state_char, 'T' | 't' | 'Z' | 'X');
                return (alive_and_running, 0);
            }
        }
        return (std::path::Path::new(&format!("/proc/{}", pid)).exists(), 0);
    }
    #[cfg(target_os = "macos")]
    {
        // Query macOS HIDIdleTime (nanoseconds) via ioreg if available
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
        return (pid > 0, idle_secs);
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
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
    if dev_lane.exists() {
        let direct_dev = dev_lane.join(&clean_query);
        let folder_dev = if !query_first_seg.is_empty() {
            dev_lane.join(query_first_seg)
        } else {
            direct_dev.clone()
        };

        if folder_dev.exists() && folder_dev != dev_lane {
            source_target = Some(folder_dev);
        } else if direct_dev.exists() && direct_dev != dev_lane {
            source_target = Some(direct_dev);
        } else if is_sandbox {
            if let Ok(entries) = std::fs::read_dir(dev_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_lowercase();
                    let enorm = normalize_mod_lookup_key(&ename, game_schema);
                    if ename == query_file_name
                        || ename == query_stem
                        || ename == query_first_seg.to_lowercase()
                        || (!query_norm.is_empty() && enorm == query_norm)
                    {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 2. Search Vault Mods lane (and priority folders) if not found yet
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
                if candidate.is_file() {
                    if let Some(parent) = candidate.parent() {
                        if parent != base.as_path() && parent != vault_mods_lane {
                            source_target = Some(parent.to_path_buf());
                        } else {
                            source_target = Some(candidate);
                        }
                    }
                } else {
                    source_target = Some(candidate);
                }
                break;
            }
            if !query_first_seg.is_empty() {
                let folder_cand = base.join(query_first_seg);
                if folder_cand.exists() && folder_cand != base {
                    source_target = Some(folder_cand);
                    break;
                }
            }
        }
    }

    // 3. Search by dna_hash in .sanctuary_cache.db if still not found
    if source_target.is_none() {
        if let Some(hash_str) = dna_hash.filter(|h| !h.trim().is_empty()) {
            let cache = load_cache(vault_path);
            for (cached_path, entry) in cache.iter() {
                if entry.dna_hash == hash_str {
                    let p = PathBuf::from(cached_path);
                    if p.exists() {
                        if let Some(parent) = p.parent() {
                            if parent != vault_mods_lane
                                && !priority_folders
                                    .iter()
                                    .any(|pf| !pf.is_empty() && parent == vault_mods_lane.join(pf))
                            {
                                source_target = Some(parent.to_path_buf());
                            } else {
                                source_target = Some(p);
                            }
                        }
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
                .max_depth(3)
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
                    || (!query_stem.is_empty() && fstem == query_stem)
                    || (!query_norm.is_empty() && fnorm == query_norm)
                {
                    if p.is_file() {
                        if let Some(parent) = p.parent() {
                            if parent != search_root {
                                source_target = Some(parent.to_path_buf());
                            } else {
                                source_target = Some(p.to_path_buf());
                            }
                        }
                    } else {
                        source_target = Some(p.to_path_buf());
                    }
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
    safe_wipe_mods_dir(&mods_dir, game_schema);
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

    // Automatically include companion script/module twin folders in Vault/Mods
    if vault_mods_lane.exists() {
        let mut companion_targets: Vec<PathBuf> = Vec::new();
        for target in &resolved_targets {
            let base_name = target
                .file_stem()
                .or_else(|| target.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or_default();
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
                    let enorm = normalize_mod_lookup_key(&ename, game_schema);
                    if !enorm.is_empty()
                        && (enorm == stripped_norm
                            || enorm == scripts_norm
                            || enorm == script_norm)
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

        // 6. Collect all deployable files from resolved while retaining their lane anchor root
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
            if let Some(parent) = resolved.parent() {
                if parent != dev_lane.as_path()
                    && parent != vault_mods_lane.as_path()
                    && !priority_folders
                        .iter()
                        .any(|pf| !pf.is_empty() && parent == vault_mods_lane.join(pf))
                {
                    for entry in walkdir::WalkDir::new(parent)
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
                } else if !files_to_link.iter().any(|(_, existing)| existing == &resolved) {
                    files_to_link.push((anchor_root, resolved));
                }
            } else if !files_to_link.iter().any(|(_, existing)| existing == &resolved) {
                files_to_link.push((anchor_root, resolved));
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
    _app: tauri::AppHandle,
    dna_hash: String,
    mod_name: String,
    docs_path: String,
    vault_path: String,
    linked_files: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<LabVerificationStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let exe_names = crate::game_logic::get_executable_names(&game_schema);
        let save_targets = resolve_save_airgap_targets(&game_schema);

        let lv = game_schema.as_ref().and_then(|s| s.lab_verification.clone());
        let wls = lv.as_ref().and_then(|l| l.world_load_signature.clone());

        let required_active_seconds = lv
            .as_ref()
            .and_then(|l| l.required_active_seconds)
            .unwrap_or(120)
            .max(15);
        // Default max_idle_seconds to 8s so pausing gameplay or sitting on a menu screen pauses the countdown quickly
        let max_idle_seconds = lv
            .as_ref()
            .and_then(|l| l.max_idle_seconds)
            .unwrap_or(8)
            .clamp(5, 12);
        let require_focus = lv.as_ref().and_then(|l| l.require_focus).unwrap_or(true);
        let require_save_checkpoint = lv
            .as_ref()
            .and_then(|l| l.require_save_checkpoint)
            .unwrap_or(true);
        let save_extensions = lv
            .as_ref()
            .and_then(|l| l.save_extensions.clone())
            .unwrap_or_default();

        let stabilize_boot_seconds = wls
            .as_ref()
            .and_then(|w| w.stabilize_boot_seconds)
            .unwrap_or(14)
            .max(12);
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

        let seeded_save_present = save_targets
            .iter()
            .any(|t| docs_dir.join(t).join(".sanctuary_seeded_save").exists());
        let now = current_epoch_secs();
        let initial_save_mtimes =
            snapshot_save_mtimes(&docs_dir, &save_targets, &save_extensions);

        start_windows_pause_key_watcher(&game_schema);

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
            awaiting_save_since_epoch: None,
            save_detected_epoch: None,
            verified_save_name: None,
            tracked_pid: None,
            baseline_ram_bytes: 0,
            baseline_disk_read_bytes: 0,
            current_ram_bytes: 0,
            cumulative_disk_read_bytes: 0,
            prev_ram_bytes: 0,
            prev_disk_read_bytes: 0,
            boot_plateau_ticks: 0,
            peak_ram_bytes: 0,
            required_active_seconds,
            elapsed_active_seconds: 0,
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
            initial_save_mtimes,
            last_poll_epoch: now,
            linked_files: linked_files.unwrap_or_default(),
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
        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn poll_lab_verification_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LabVerificationStatus>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = get_lab_session_mutex().lock().map_err(|e| e.to_string())?;
        let session = match guard.as_mut() {
            Some(s) => s,
            None => return Ok(None),
        };

    if session.stage == "VERIFIED" || session.stage == "FAILED" {
        return Ok(Some(build_session_status(session)));
    }

    let now = current_epoch_secs();
    let dt = now.saturating_sub(session.last_poll_epoch).clamp(1, 3) as u32;
    session.last_poll_epoch = now;

    // 1. Check for crash/exception logs first
    if let Some(err_msg) = scan_logs_sync(&session.docs_dir, &game_schema) {
        session.stage = "FAILED".to_string();
        session.error_log = Some(err_msg.clone());
        if !session.notified_failed {
            session.notified_failed = true;
            notify_player_over_game(
                &app,
                "Sanctuary Lab — Simulation Failed",
                &err_msg,
                true,
            );
        }
        stop_windows_pause_key_watcher();
        return Ok(Some(build_session_status(session)));
    }

    // 2. Refresh processes via sysinfo (single PID when already tracked, fallback to All)
    let needs_full_refresh = if let Some(pid) = session.tracked_pid {
        let sys_pid = sysinfo::Pid::from_u32(pid);
        session
            .sys
            .refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sys_pid]), true);
        !session.sys.processes().contains_key(&sys_pid)
    } else {
        true
    };
    if needs_full_refresh {
        session
            .sys
            .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    }

    let mut matched_pid: Option<u32> = None;
    let mut best_ram: u64 = 0;
    let mut best_disk_read: u64 = 0;

    for (pid, proc_info) in session.sys.processes() {
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
            continue;
        }
        let exe_path_lower = proc_info
            .exe()
            .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase())
            .unwrap_or_default();
        let cmd_joined_lower: String = proc_info
            .cmd()
            .iter()
            .map(|arg| arg.to_string_lossy().replace('\\', "/").to_lowercase())
            .collect::<Vec<_>>()
            .join(" ");

        let is_match = session.executable_names.iter().any(|exe| {
            let clean_exe = exe.trim().replace('\\', "/").to_lowercase();
            let exe_filename = clean_exe.rsplit('/').next().unwrap_or(&clean_exe);
            let stem = exe_filename
                .trim_end_matches(".exe")
                .trim_end_matches(".app");
            if stem.is_empty() {
                return false;
            }
            // Linux /proc/<pid>/comm truncates process names to 15 chars (TASK_COMM_LEN - 1)
            let stem_15: String = stem.chars().take(15).collect();
            let direct_name_match = pname == exe_filename
                || pname == stem
                || pname.starts_with(stem)
                || (stem_15.len() == 15 && pname == stem_15);
            let cmd_or_exe_match = (!exe_path_lower.is_empty()
                && (exe_path_lower.ends_with(&format!("/{}", exe_filename))
                    || exe_path_lower.ends_with(&format!("/{}", stem))))
                || (!cmd_joined_lower.is_empty()
                    && (cmd_joined_lower.contains(&format!("/{}", exe_filename))
                        || cmd_joined_lower.ends_with(exe_filename)));
            direct_name_match || cmd_or_exe_match
        });
        if is_match {
            let mem = proc_info.memory();
            if mem >= best_ram {
                best_ram = mem;
                best_disk_read = proc_info.disk_usage().total_read_bytes;
                matched_pid = Some(pid.as_u32());
            }
        }
    }

    session.tracked_pid = matched_pid;
    get_lab_input_watch()
        .target_pid
        .store(matched_pid.unwrap_or(0), Ordering::SeqCst);

    if best_ram > 0 {
        session.current_ram_bytes = best_ram;
        session.cumulative_disk_read_bytes = best_disk_read;
        if best_ram > session.peak_ram_bytes {
            session.peak_ram_bytes = best_ram;
        }
    }

    let (focused, idle_secs) = get_windows_focus_and_idle(matched_pid);
    session.is_focused = focused;
    session.current_idle_seconds = idle_secs;

    let disk_rate_mb = session
        .cumulative_disk_read_bytes
        .saturating_sub(session.prev_disk_read_bytes)
        / (1024 * 1024);
    let ram_diff_mb = session.current_ram_bytes.abs_diff(session.prev_ram_bytes) / (1024 * 1024);
    session.prev_ram_bytes = session.current_ram_bytes;
    session.prev_disk_read_bytes = session.cumulative_disk_read_bytes;

    // 3. Evaluate 4-stage pipeline
    match session.stage.as_str() {
        "BOOTING" => {
            if matched_pid.is_some() && session.current_ram_bytes > 100 * 1024 * 1024 {
                let boot_epoch = *session.boot_detected_epoch.get_or_insert(now);
                let boot_elapsed = now.saturating_sub(boot_epoch);

                // Wait for initial boot Disk I/O and RAM to plateau on the Main Menu
                if boot_elapsed >= session.stabilize_boot_seconds as u64 {
                    if disk_rate_mb <= 4 && ram_diff_mb <= 18 {
                        session.boot_plateau_ticks += 1;
                    } else {
                        session.boot_plateau_ticks = 0;
                    }

                    if session.boot_plateau_ticks >= 3 || boot_elapsed >= 42 {
                        session.baseline_ram_bytes = session.current_ram_bytes;
                        session.baseline_disk_read_bytes = session.cumulative_disk_read_bytes;
                        session.initial_save_mtimes = snapshot_save_mtimes(
                            &session.docs_dir,
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.stage = "MENU_WAITING".to_string();
                    }
                }
            }
        }
        "MENU_WAITING" => {
            if matched_pid.is_none() && now.saturating_sub(session.started_at_epoch) > 30 {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process terminated while on Main Menu before entering a loaded world."
                        .to_string(),
                );
                stop_windows_pause_key_watcher();
            } else if matched_pid.is_some() {
                let disk_delta_mb = session
                    .cumulative_disk_read_bytes
                    .saturating_sub(session.baseline_disk_read_bytes)
                    / (1024 * 1024);
                let ram_step_mb = session
                    .current_ram_bytes
                    .saturating_sub(session.baseline_ram_bytes)
                    / (1024 * 1024);
                let ram_step_pct = if session.baseline_ram_bytes > 0
                    && session.current_ram_bytes > session.baseline_ram_bytes
                {
                    (((session.current_ram_bytes - session.baseline_ram_bytes) * 100)
                        / session.baseline_ram_bytes) as u32
                } else {
                    0
                };
                let scratch_active = check_scratch_activity(
                    &session.docs_dir,
                    &session.scratch_subdirs,
                    session.boot_detected_epoch.unwrap_or(session.started_at_epoch) + 10,
                );

                let primary_world_loaded = disk_delta_mb >= session.min_disk_read_mb
                    && (ram_step_pct >= session.min_ram_step_percent || ram_step_mb >= 180);
                let warm_cache_loaded = ram_step_pct >= session.warm_cache_ram_step_percent
                    || (scratch_active && (ram_step_pct >= 12 || ram_step_mb >= 90));

                if primary_world_loaded || warm_cache_loaded {
                    // Wait until the loading screen disk burst finishes settling into live gameplay
                    if disk_rate_mb <= 15 {
                        session.initial_save_mtimes = snapshot_save_mtimes(
                            &session.docs_dir,
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        get_lab_input_watch()
                            .game_paused
                            .store(false, Ordering::SeqCst);
                        session.stage = "ACTIVE_TESTING".to_string();
                        session.pause_reason = None;
                    }
                }
            }
        }
        "ACTIVE_TESTING" => {
            if matched_pid.is_none() {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process exited prematurely before completing timed verification and save checkpoint."
                        .to_string(),
                );
                stop_windows_pause_key_watcher();
            } else {
                // Check if user already triggered a save during active testing
                if session.verified_save_name.is_none() {
                    if let Some(sname) = detect_new_save_file(
                        &session.docs_dir,
                        &session.save_targets,
                        &session.save_extensions,
                        &session.initial_save_mtimes,
                        session.started_at_epoch,
                    ) {
                        session.verified_save_name = Some(sname);
                    }
                }

                let ram_step_mb = session
                    .current_ram_bytes
                    .saturating_sub(session.baseline_ram_bytes)
                    / (1024 * 1024);
                let game_paused_key = get_lab_input_watch().game_paused.load(Ordering::SeqCst);

                if session.require_focus && !session.is_focused {
                    session.pause_reason = Some("UNFOCUSED".to_string());
                } else if ram_step_mb < 40 && session.baseline_ram_bytes > 0 {
                    // Player exited world back to Main Menu
                    session.pause_reason = Some("MAIN_MENU".to_string());
                } else if game_paused_key {
                    // Player pressed Esc (Pause Menu) or 0/P/~ (Paused simulation speed)
                    session.pause_reason = Some("GAME_PAUSED".to_string());
                } else if session.current_idle_seconds > session.max_idle_seconds {
                    session.pause_reason = Some("IDLE".to_string());
                } else {
                    session.pause_reason = None;
                    session.elapsed_active_seconds = (session.elapsed_active_seconds + dt)
                        .min(session.required_active_seconds);
                }

                if session.elapsed_active_seconds >= session.required_active_seconds {
                    if session.require_save_checkpoint {
                        session.stage = "AWAITING_SAVE".to_string();
                        session.pause_reason = None;
                        session.awaiting_save_since_epoch = Some(now);
                        session.initial_save_mtimes = snapshot_save_mtimes(
                            &session.docs_dir,
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.verified_save_name = None;
                        if !session.notified_awaiting_save {
                            session.notified_awaiting_save = true;
                            spawn_or_refresh_lab_overlay(&app);
                            notify_player_over_game(
                                &app,
                                "Sanctuary Lab — Test Timer Complete (0:00)!",
                                "Active simulation timer finished! Save your game now (Esc -> Save) to verify save serialization and unlock publishing.",
                                false,
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
                            save_file_verified: "checkpoint_bypassed_by_schema".to_string(),
                        };
                        persist_certificate_to_vault(&session.vault_path, &cert);
                        session.certificate = Some(cert);
                        session.stage = "VERIFIED".to_string();
                        if !session.notified_verified {
                            session.notified_verified = true;
                            notify_player_over_game(
                                &app,
                                "Sanctuary Lab — Verification Passed & Signed!",
                                "SHA-256 certificate recorded. You may now safely exit the game.",
                                false,
                            );
                        }
                        stop_windows_pause_key_watcher();
                    }
                }
            }
        }
        "AWAITING_SAVE" => {
            if matched_pid.is_none() && session.save_detected_epoch.is_none() {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game closed before triggering an in-game Save Checkpoint.".to_string(),
                );
                stop_windows_pause_key_watcher();
            } else {
                if session.save_detected_epoch.is_none() {
                    if let Some(sname) = detect_new_save_file(
                        &session.docs_dir,
                        &session.save_targets,
                        &session.save_extensions,
                        &session.initial_save_mtimes,
                        session.awaiting_save_since_epoch.unwrap_or(session.started_at_epoch),
                    ) {
                        session.verified_save_name = Some(sname);
                        session.save_detected_epoch = Some(now);
                    }
                }

                if let Some(save_epoch) = session.save_detected_epoch {
                    // Wait 2 seconds after save to confirm serialization didn't crash the engine
                    if now.saturating_sub(save_epoch) >= 2 {
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
                            save_file_verified: session
                                .verified_save_name
                                .clone()
                                .unwrap_or_else(|| "checkpoint_verified".to_string()),
                        };
                        persist_certificate_to_vault(&session.vault_path, &cert);
                        session.certificate = Some(cert);
                        session.stage = "VERIFIED".to_string();
                        if !session.notified_verified {
                            session.notified_verified = true;
                            notify_player_over_game(
                                &app,
                                "Sanctuary Lab — Verification Passed & Signed!",
                                "Save checkpoint verified and SHA-256 certificate recorded! You may now safely exit the game.",
                                false,
                            );
                        }
                        stop_windows_pause_key_watcher();
                    }
                }
            }
        }
        _ => {}
    }

        Ok(Some(build_session_status(session)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_lab_verification_session(app: tauri::AppHandle) -> Result<(), String> {
    stop_windows_pause_key_watcher();
    close_lab_overlay(&app);
    if let Ok(mut guard) = get_lab_session_mutex().lock() {
        *guard = None;
    }
    Ok(())
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
    if let Ok(mut stmt) = conn.prepare("SELECT cert_json FROM lab_certificates ORDER BY verified_at DESC") {
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
pub fn record_lab_certificate(
    vault_path: String,
    certificate: LabVerificationCertificate,
) -> Result<(), String> {
    persist_certificate_to_vault(&vault_path, &certificate);
    Ok(())
}


