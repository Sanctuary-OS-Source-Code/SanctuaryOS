#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use std::collections::HashSet;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use super::airgap::*;
#[allow(unused_imports)]
use super::lab_types_and_audio::*;
#[allow(unused_imports)]
use super::lab_save_and_telemetry::*;
#[allow(unused_imports)]
use super::lab_staging::*;
#[allow(unused_imports)]
use super::lab_session::*;
#[allow(unused_imports)]
use super::launcher::*;

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
pub(super) struct SandboxStateMeta {
    pub selected_save_name: Option<String>,
    pub fresh_sandbox_armed: bool,
    #[serde(default)]
    pub source_live_save_name: Option<String>,
}

#[derive(Clone, Debug)]
pub(super) struct AirgapStoragePaths {
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

pub(super) fn resolve_save_extensions(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    game_schema
        .as_ref()
        .and_then(|s| s.lab_verification.as_ref())
        .and_then(|lv| lv.save_extensions.clone())
        .unwrap_or_default()
}

pub(super) fn is_directory_save_mode(save_exts: &[String]) -> bool {
    save_exts.is_empty()
        || save_exts.iter().any(|e| {
            matches!(
                e.trim().to_lowercase().as_str(),
                "/" | "dir" | "directory" | "folder"
            )
        })
}

pub(super) fn is_temporary_or_internal_save_artifact(fname_lower: &str) -> bool {
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

pub(super) fn matches_configured_save_file(fname_lower: &str, save_exts: &[String], file_exts: &[String]) -> bool {
    if is_temporary_or_internal_save_artifact(fname_lower) {
        return false;
    }
    if !file_exts.is_empty() {
        return file_exts.iter().any(|ext| fname_lower.ends_with(ext));
    }
    save_exts.is_empty()
}

pub(super) fn matches_save_filename(fname: &str, save_exts: &[String]) -> bool {
    let fname_lower = fname.to_lowercase();
    let file_exts: Vec<String> = save_exts
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty() && !matches!(e.as_str(), "/" | "dir" | "directory" | "folder"))
        .collect();
    matches_configured_save_file(&fname_lower, save_exts, &file_exts)
}

pub(super) fn compute_dir_save_slot_stats(slot_dir: &Path) -> Option<(u64, u64)> {
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

pub(super) fn list_saves_in_dir(dir: &Path, save_exts: &[String]) -> Vec<LabSaveFileInfo> {
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

pub(super) fn load_sandbox_state_meta(sandbox_root: &Path) -> SandboxStateMeta {
    let meta_path = sandbox_root.join(".sandbox_state.json");
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(parsed) = serde_json::from_str::<SandboxStateMeta>(&raw) {
            return parsed;
        }
    }
    SandboxStateMeta::default()
}

pub(super) fn save_sandbox_state_meta(sandbox_root: &Path, meta: &SandboxStateMeta) -> Result<(), String> {
    std::fs::create_dir_all(sandbox_root).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_bytes(&sandbox_root.join(".sandbox_state.json"), &bytes)
}

pub(super) fn touch_save_slot_mtime_now(slot_path: &Path) {
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

pub(super) fn find_named_save_in_dir(dir: &Path, target_name: &str, allow_dir_slots: bool) -> Option<PathBuf> {
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
pub(super) fn sync_golden_sandbox_to_working_dir(
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
pub(super) fn promote_valid_saves_into_golden_sandbox(
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

pub(super) fn compute_lab_test_save_status(
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

pub(super) fn resolve_save_airgap_targets(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    if let Some(s) = game_schema {
        if let Some(tc) = &s.time_capsule {
            if let Some(targets) = &tc.save_airgap_targets {
                if !targets.is_empty() {
                    let normalized: Vec<String> = targets
                        .iter()
                        .map(|t| {
                            let tr = t.trim();
                            if tr.is_empty() || tr == "." {
                                ".".to_string()
                            } else {
                                tr.to_string()
                            }
                        })
                        .collect();
                    if !normalized.is_empty() {
                        return normalized;
                    }
                }
            }
            let save_targets: Vec<String> = tc
                .world_state_targets
                .iter()
                .filter(|t| {
                    t.path.to_lowercase().contains("save")
                        || t.name.to_lowercase().contains("save")
                })
                .map(|t| {
                    let tr = t.path.trim();
                    if tr.is_empty() || tr == "." {
                        ".".to_string()
                    } else {
                        tr.to_string()
                    }
                })
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

pub(super) fn resolve_docs_root(
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

pub(super) fn set_tree_readonly(dir: &Path, readonly: bool) {
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
pub(super) fn set_hidden_dir_attribute(dir: &Path, hidden: bool) {
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
pub(super) fn set_hidden_dir_attribute(_dir: &Path, _hidden: bool) {}

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

pub(super) fn sample_file_fingerprint(path: &Path) -> Result<(u64, u64, String), String> {
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

pub(super) fn is_airgap_internal_marker_name(name_lower: &str) -> bool {
    matches!(
        name_lower,
        ".sanctuary_sandbox_marker"
            | ".sanctuary_seeded_save"
            | ".sandbox_state.json"
            | ".airgap_active.json"
            | ".airgap_journal.json"
    ) || name_lower.contains(".tmp.")
}

pub(super) fn build_save_tree_manifest(root: &Path) -> Result<Vec<SaveFileManifestEntry>, String> {
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

pub(super) fn verify_save_tree_manifest(root: &Path, expected: &[SaveFileManifestEntry]) -> Result<(), String> {
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

pub(super) fn remove_save_tree_strict(dir: &Path, allowed_roots: &[PathBuf]) -> Result<(), String> {
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

pub(super) fn resolve_airgap_storage_paths(
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
pub(super) fn migrate_legacy_inline_airgap_if_present(
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

pub(super) fn load_airgap_journal(airgap_root: &Path, external_vault_dir: Option<&Path>) -> Option<AirgapJournal> {
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

pub(super) fn persist_airgap_journal(
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
