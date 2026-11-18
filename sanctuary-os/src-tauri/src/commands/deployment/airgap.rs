use crate::commands::state_ops::*;
use crate::state::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use super::lab_session::*;
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

pub(crate) fn passive_process_refresh_kind() -> sysinfo::ProcessRefreshKind {
    // Query ONLY passive OS process counters (PROCESS_QUERY_LIMITED_INFORMATION on Windows).
    // Never request cmdline/env/cwd, which would invoke ReadProcessMemory on the game's PEB and trip anti-cheats.
    sysinfo::ProcessRefreshKind::nothing()
        .with_memory()
        .with_disk_usage()
        .with_cpu()
        .with_exe(sysinfo::UpdateKind::OnlyIfNotSet)
}

pub(super) fn collect_candidate_game_exe_names(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
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

pub(super) fn collect_active_game_live_roots_norm(
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

pub(super) fn process_matches_game_candidates(
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

pub(super) fn process_matches_game_or_live_root(
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

pub(super) fn wait_for_game_exit_before_airgap_swap(
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

pub(super) fn is_airgap_active_for_docs_with_vault(
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

pub(super) fn copy_manifest_entries_verified(
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
pub async fn get_lab_test_save_status(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        Ok(compute_lab_test_save_status(&docs_dir, &game_schema))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn copy_save_item_into_dir(
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

pub(super) fn collect_external_save_input_paths(
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

pub(super) fn configure_lab_test_save_internal(
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

