#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use rusqlite::{params, Connection};
#[allow(unused_imports)]
use sha2::{Digest, Sha256};
#[allow(unused_imports)]
use std::collections::HashMap;
#[allow(unused_imports)]
use std::fs;
#[allow(unused_imports)]
use std::io::Read;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use rayon::prelude::*;
#[allow(unused_imports)]
use super::archive_ops::*;
#[allow(unused_imports)]
use super::db_cache::*;
#[allow(unused_imports)]
use super::fs_ops::*;
#[allow(unused_imports)]
use super::heuristics::*;
#[allow(unused_imports)]
use super::mod_versions::*;
#[allow(unused_imports)]
use super::path_security::*;

pub fn find_backup(vault_path: &str, file_name: &str) -> Option<PathBuf> {
    if !is_safe_single_filename(file_name) {
        return None;
    }
    let base = PathBuf::from(vault_path).join("Backups");
    let p = base.join(file_name);
    if p.exists() {
        return Some(p);
    }
    for sub in &["World", "Engine", "Mods"] {
        let p2 = base.join(sub).join(file_name);
        if p2.exists() {
            return Some(p2);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    if let Some(engine_dir) = get_engine_backups_dir(&config.live_path, vault_path) {
        let p3 = engine_dir.join(file_name);
        if p3.exists() {
            return Some(p3);
        }
    }
    let docs_base = resolve_effective_docs_path(&config, &None);
    if let Some(world_dir) = get_world_backups_dir(&docs_base, vault_path) {
        let p4 = world_dir.join(file_name);
        if p4.exists() {
            return Some(p4);
        }
    }

    None
}

pub fn extract_backup_timestamp(name: &str) -> u64 {
    let clean = name
        .trim_end_matches(".tar.zst")
        .trim_end_matches(".tar")
        .trim_end_matches(".zst");
    if let Some(last) = clean.split("--").last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    if let Some(last) = clean.split('_').last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    0
}

pub fn write_snapshot_meta_file(path: &Path, content: &str) {
    if path.exists() {
        if let Ok(meta) = std::fs::metadata(path) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(path, perms);
            }
        }
        let _ = std::fs::remove_file(path);
    }
    let _ = std::fs::write(path, content);
}

pub fn clean_stray_snapshot_meta_files(dir: &Path) {
    for meta_name in [".size_bytes.txt", ".diff_size_bytes.txt", ".delta_manifest.json"] {
        let stray = dir.join(meta_name);
        if stray.is_file() {
            if let Ok(meta) = std::fs::metadata(&stray) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&stray, perms);
                }
            }
            let _ = std::fs::remove_file(&stray);
        }
    }
}

pub fn get_all_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if dir.is_file() {
        if let Some(fname) = dir.file_name().and_then(|n| n.to_str()) {
            if !fname.starts_with('.') {
                files.push(dir.to_path_buf());
            }
        }
        return files;
    }
    for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            let p = entry.path();
            if let Ok(rel) = p.strip_prefix(dir) {
                let has_dot_component = rel
                    .components()
                    .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
                if has_dot_component {
                    continue;
                }
            } else if p
                .file_name()
                .map_or(false, |n| n.to_string_lossy().starts_with('.'))
            {
                continue;
            }
            files.push(entry.into_path());
        }
    }
    files
}

pub fn remove_backup_dir_cow_safe(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    use rayon::prelude::*;
    let readonly_paths: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if meta.permissions().readonly() {
                Some(entry.into_path())
            } else {
                None
            }
        })
        .collect();

    readonly_paths.par_iter().for_each(|p| {
        if let Ok(meta) = std::fs::metadata(p) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(p, perms);
            }
        }
    });

    std::fs::remove_dir_all(dir)
}

fn read_snapshot_manifest_lane(dir: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(dir.join(".delta_manifest.json")).ok()?;
    let val: serde_json::Value = serde_json::from_str(&raw).ok()?;
    val.get("lane")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| s == "engine" || s == "world")
}

pub fn enforce_retention_policy(target_dir: &Path, keep_count: u32) {
    if keep_count >= 999 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let mut backups: Vec<PathBuf> = Vec::new();
        let mut stale_purging: Vec<PathBuf> = Vec::new();

        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with(".purging_") && p.is_dir() {
                stale_purging.push(p);
                continue;
            }
            let is_archive = p.is_file()
                && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                    || p.extension() == Some(std::ffi::OsStr::new("tar")));
            let is_snapshot_dir = p.is_dir()
                && !name.starts_with('.')
                && !matches!(name.as_str(), "World" | "Engine" | "Mods" | "Config")
                && (name.starts_with("World_State")
                    || name.starts_with("Engine_Core")
                    || p.join(".delta_manifest.json").exists());
            if is_archive || is_snapshot_dir {
                backups.push(p);
            }
        }

        backups.sort_by(|a, b| {
            let name_a = a.file_name().unwrap_or_default().to_string_lossy();
            let name_b = b.file_name().unwrap_or_default().to_string_lossy();
            let ts_a = extract_backup_timestamp(&name_a);
            let ts_b = extract_backup_timestamp(&name_b);
            ts_b.cmp(&ts_a).then_with(|| {
                let m_a = a
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                let m_b = b
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                m_b.cmp(&m_a)
            })
        });

        let mut dirs_to_purge_async: Vec<PathBuf> = stale_purging;

        if backups.len() > keep_count as usize {
            let now_ms = current_epoch_ms();
            for (idx, old_backup) in backups.iter().skip(keep_count as usize).enumerate() {
                if old_backup.is_dir() {
                    let old_name = old_backup
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                    let purging_path =
                        old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                    if std::fs::rename(old_backup, &purging_path).is_ok() {
                        dirs_to_purge_async.push(purging_path);
                    } else {
                        dirs_to_purge_async.push(old_backup.clone());
                    }
                } else {
                    let _ = std::fs::remove_file(old_backup);
                }
            }
        }

        if !dirs_to_purge_async.is_empty() {
            std::thread::spawn(move || {
                for dir in dirs_to_purge_async {
                    let _ = remove_backup_dir_cow_safe(&dir);
                }
            });
        }
    }
}

pub(super) fn estimate_backup_snapshot_physical_bytes(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".diff_size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    0
}

pub fn enforce_backup_capacity_limit(backup_dirs: &[PathBuf], capacity_gb: u32) {
    if capacity_gb == 0 {
        return;
    }
    let max_bytes = (capacity_gb as u64).saturating_mul(1024 * 1024 * 1024);
    let mut unique_dirs: Vec<PathBuf> = Vec::new();
    for d in backup_dirs {
        if d.exists() && !unique_dirs.contains(d) {
            unique_dirs.push(d.clone());
        }
    }
    if unique_dirs.is_empty() {
        return;
    }

    let mut snapshots: Vec<(PathBuf, u64, bool)> = Vec::new();
    let mut dirs_to_purge_async: Vec<PathBuf> = Vec::new();

    for dir in &unique_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with(".purging_") && p.is_dir() {
                    dirs_to_purge_async.push(p);
                    continue;
                }
                let is_archive = p.is_file()
                    && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                        || p.extension() == Some(std::ffi::OsStr::new("tar")));
                let manifest_lane = if p.is_dir() {
                    read_snapshot_manifest_lane(&p)
                } else {
                    None
                };
                let is_world = name.starts_with("World_State");
                let is_engine = manifest_lane
                    .as_deref()
                    .map(|l| l == "engine")
                    .unwrap_or_else(|| {
                        name.starts_with("Engine_Core") || name.contains("Engine")
                    });
                let is_snapshot_dir = p.is_dir()
                    && !name.starts_with('.')
                    && !matches!(name.as_str(), "World" | "Engine" | "Mods" | "Config")
                    && (is_world || is_engine || manifest_lane.is_some());
                if is_archive || is_snapshot_dir {
                    let bytes = estimate_backup_snapshot_physical_bytes(&p);
                    snapshots.push((p, bytes, is_engine));
                }
            }
        }
    }

    snapshots.sort_by(|(a, _, _), (b, _, _)| {
        let name_a = a.file_name().unwrap_or_default().to_string_lossy();
        let name_b = b.file_name().unwrap_or_default().to_string_lossy();
        let ts_a = extract_backup_timestamp(&name_a);
        let ts_b = extract_backup_timestamp(&name_b);
        ts_b.cmp(&ts_a).then_with(|| {
            let m_a = a
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            let m_b = b
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            m_b.cmp(&m_a)
        })
    });

    // Always protect the single newest snapshot in each lane (World_State and Engine_Core)
    let mut newest_world_idx: Option<usize> = None;
    let mut newest_engine_idx: Option<usize> = None;
    let mut total_bytes: u64 = 0;

    for (idx, (_, bytes, is_engine)) in snapshots.iter().enumerate() {
        total_bytes = total_bytes.saturating_add(*bytes);
        if *is_engine {
            if newest_engine_idx.is_none() {
                newest_engine_idx = Some(idx);
            }
        } else if newest_world_idx.is_none() {
            newest_world_idx = Some(idx);
        }
    }

    if total_bytes > max_bytes && snapshots.len() > 1 {
        let now_ms = current_epoch_ms();
        for (idx, (old_backup, bytes, _)) in snapshots.iter().enumerate().rev() {
            if total_bytes <= max_bytes {
                break;
            }
            if Some(idx) == newest_world_idx || Some(idx) == newest_engine_idx {
                continue;
            }
            if old_backup.is_dir() {
                let old_name = old_backup
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                let purging_path =
                    old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                if std::fs::rename(old_backup, &purging_path).is_ok() {
                    dirs_to_purge_async.push(purging_path);
                } else {
                    dirs_to_purge_async.push(old_backup.clone());
                }
            } else {
                let _ = std::fs::remove_file(old_backup);
            }
            total_bytes = total_bytes.saturating_sub(*bytes);
        }
    }

    if !dirs_to_purge_async.is_empty() {
        std::thread::spawn(move || {
            for dir in dirs_to_purge_async {
                let _ = remove_backup_dir_cow_safe(&dir);
            }
        });
    }
}

pub fn enforce_workspace_backup_capacity(config: &crate::state::WorkspaceConfig) {
    let cap_gb = config.vault_capacity_gb.unwrap_or(0);
    if cap_gb == 0 || config.vault_path.trim().is_empty() {
        return;
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    let docs_base = config
        .docs_path
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&config.mods_path);
    if let Some(wd) = get_world_backups_dir(docs_base, &config.vault_path) {
        dirs.push(wd);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("World"));

    if let Some(ed) = get_engine_backups_dir(&config.live_path, &config.vault_path) {
        dirs.push(ed);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("Engine"));

    enforce_backup_capacity_limit(&dirs, cap_gb);
}

pub fn are_paths_on_same_filesystem(p1: &Path, p2: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let existing_ancestor = |p: &Path| -> Option<PathBuf> {
            for anc in p.ancestors() {
                if !anc.as_os_str().is_empty() && anc.exists() {
                    return Some(anc.to_path_buf());
                }
            }
            None
        };
        if let (Some(a1), Some(a2)) = (existing_ancestor(p1), existing_ancestor(p2)) {
            if let (Ok(m1), Ok(m2)) = (std::fs::metadata(a1), std::fs::metadata(a2)) {
                return m1.dev() == m2.dev();
            }
        }
        false
    }
    #[cfg(not(unix))]
    {
        p1.components().next() == p2.components().next()
    }
}

#[cfg(unix)]
pub(super) fn resolve_unix_backup_dir(source_path: &Path, vault_path: &str, lane: &str) -> Option<PathBuf> {
    let vault_p = PathBuf::from(vault_path);
    if !vault_path.trim().is_empty() && are_paths_on_same_filesystem(source_path, &vault_p) {
        return Some(vault_p.join("Backups").join(lane));
    }

    let vault_name = vault_p
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();

    let src_str = source_path.to_string_lossy();
    if let Some(rest) = src_str.strip_prefix("/Volumes/") {
        if let Some(vol_name) = rest.split('/').next().filter(|s| !s.is_empty()) {
            let vol_root = PathBuf::from("/Volumes").join(vol_name);
            return Some(
                vol_root
                    .join(".sanctuary_backups")
                    .join(&vault_name)
                    .join(lane),
            );
        }
    }
    for prefix in ["/run/media/", "/media/", "/mnt/"] {
        if let Some(rest) = src_str.strip_prefix(prefix) {
            let parts: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
            let mount_root = if (prefix == "/run/media/" || prefix == "/media/") && parts.len() >= 2 {
                // e.g. /run/media/deck/SDCard or /media/user/Drive
                let candidate_two = PathBuf::from(prefix).join(parts[0]).join(parts[1]);
                if candidate_two.is_dir() {
                    Some(candidate_two)
                } else {
                    Some(PathBuf::from(prefix).join(parts[0]))
                }
            } else if !parts.is_empty() {
                // e.g. /run/media/mmcblk0p1 or /mnt/gamedrive
                Some(PathBuf::from(prefix).join(parts[0]))
            } else {
                None
            };
            if let Some(root_dir) = mount_root {
                return Some(
                    root_dir
                        .join(".sanctuary_backups")
                        .join(&vault_name)
                        .join(lane),
                );
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        return Some(home.join(".sanctuary_backups").join(vault_name).join(lane));
    }

    None
}

pub fn get_engine_backups_dir(live_path: &str, vault_path: &str) -> Option<PathBuf> {
    if live_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(live_path);

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "Engine");
    }

    #[cfg(not(unix))]
    {
        let root = p.ancestors().last()?;
        if root.as_os_str().is_empty() {
            return None;
        }

        let vault_name = PathBuf::from(vault_path)
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("default"))
            .to_string_lossy()
            .into_owned();

        Some(
            root.join(".sanctuary_backups")
                .join(vault_name)
                .join("Engine"),
        )
    }
}

pub fn get_docs_base_from_mods_path(mods_path: &str) -> String {
    if mods_path.trim().is_empty() {
        return String::new();
    }
    let mut doc_dir = PathBuf::from(mods_path);
    if doc_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .eq_ignore_ascii_case("mods")
    {
        doc_dir.pop();
    }
    doc_dir.to_string_lossy().to_string()
}

pub fn resolve_effective_docs_path(
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> String {
    if let Some(ref explicit_docs) = config.docs_path {
        if !explicit_docs.trim().is_empty() {
            return explicit_docs.trim().to_string();
        }
    }
    let resolved = crate::game_logic::resolve_user_data_root(&config.mods_path, schema);
    if !resolved.as_os_str().is_empty() {
        return resolved.to_string_lossy().to_string();
    }
    get_docs_base_from_mods_path(&config.mods_path)
}

pub fn resolve_effective_docs_path_with_override(
    explicit_docs: &str,
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> PathBuf {
    let trimmed = explicit_docs.trim();
    if !trimmed.is_empty() {
        let candidate = PathBuf::from(trimmed);
        if is_mods_dir(&candidate) {
            let resolved = crate::game_logic::resolve_user_data_root(trimmed, schema);
            if !resolved.as_os_str().is_empty() {
                return resolved;
            }
        }
        return candidate;
    }
    let fallback = resolve_effective_docs_path(config, schema);
    if fallback.trim().is_empty() {
        PathBuf::new()
    } else {
        PathBuf::from(fallback.trim())
    }
}

pub fn get_world_backups_dir(docs_path: &str, vault_path: &str) -> Option<PathBuf> {
    if docs_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(docs_path);

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "World");
    }

    #[cfg(not(unix))]
    {
        let root = p.ancestors().last()?;
        if root.as_os_str().is_empty() {
            return None;
        }

        let vault_name = PathBuf::from(vault_path)
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("default"))
            .to_string_lossy()
            .into_owned();

        Some(
            root.join(".sanctuary_backups")
                .join(vault_name)
                .join("World"),
        )
    }
}


pub fn current_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
