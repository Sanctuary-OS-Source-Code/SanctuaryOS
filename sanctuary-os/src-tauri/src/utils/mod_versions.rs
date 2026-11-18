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
use super::backup_retention::*;
#[allow(unused_imports)]
use super::db_cache::*;
#[allow(unused_imports)]
use super::fs_ops::*;
#[allow(unused_imports)]
use super::heuristics::*;
#[allow(unused_imports)]
use super::path_security::*;

pub(super) fn is_skipped_vault_subdir(name_lower: &str) -> bool {
    name_lower == "sandbox"
        || name_lower == "dev"
        || name_lower == "quarantine"
        || name_lower == "__macosx"
        || name_lower.starts_with('.')
}

pub(super) fn is_plain_text_config_extension(ext_lower: &str) -> bool {
    matches!(
        ext_lower.trim_start_matches('.'),
        "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml" | "txt" | "log" | "md"
    )
}

pub(super) fn dir_contains_non_config_mod_assets(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower.starts_with('.')
                    || fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if !is_plain_text_config_extension(&ext_lower) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub fn resolve_vault_config_destination(
    vault_mods_path: &Path,
    relative_path: &Path,
    file_name: &str,
) -> PathBuf {
    if relative_path.components().count() > 1 {
        return vault_mods_path.join(relative_path);
    }

    let fname_lower = file_name.to_lowercase();

    // 1. Search 1-2 levels deep in vault_mods_path for an existing subfolder containing `file_name`
    if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
        for entry in entries.flatten() {
            let sub_path = entry.path();
            if !sub_path.is_dir() {
                continue;
            }
            let sub_name = entry.file_name().to_string_lossy().to_lowercase();
            if is_skipped_vault_subdir(&sub_name) {
                continue;
            }
            if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                for sub_entry in sub_entries.flatten() {
                    let p = sub_entry.path();
                    if p.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        return p;
                    } else if p.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            if let Ok(sub2_entries) = std::fs::read_dir(&p) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let p2 = sub2_entry.path();
                                    if p2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        return p2;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. If not yet present in any subfolder, check if a subfolder owns non-config mod files with a matching `<prefix>_`
    if let Some(underscore_idx) = fname_lower.find('_') {
        let prefix = &fname_lower[..=underscore_idx];
        if prefix.len() >= 3 {
            if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
                for entry in entries.flatten() {
                    let sub_path = entry.path();
                    if !sub_path.is_dir() {
                        continue;
                    }
                    let sub_name = entry.file_name().to_string_lossy().to_lowercase();
                    if is_skipped_vault_subdir(&sub_name) {
                        continue;
                    }
                    if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                        for sub_entry in sub_entries.flatten() {
                            let p = sub_entry.path();
                            if p.is_file() {
                                let child_lower =
                                    sub_entry.file_name().to_string_lossy().to_lowercase();
                                let child_ext = p
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_lowercase())
                                    .unwrap_or_default();
                                if child_lower.starts_with(prefix)
                                    && !child_ext.is_empty()
                                    && !is_plain_text_config_extension(&child_ext)
                                {
                                    return sub_path.join(file_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    vault_mods_path.join(relative_path)
}

pub(super) fn find_surviving_vault_file(
    vault_mods_lane: &Path,
    fname_lower: &str,
    excluded_path: &Path,
) -> Option<PathBuf> {
    if !vault_mods_lane.exists() {
        return None;
    }

    let mut fallback_match: Option<PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p == excluded_path {
                continue;
            }
            if p.is_file() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(fname_lower)
                {
                    fallback_match = Some(p);
                }
            } else if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if is_skipped_vault_subdir(&dname) {
                    continue;
                }
                if let Ok(sub_entries) = std::fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sp = sub_entry.path();
                        if sp == excluded_path {
                            continue;
                        }
                        if sp.is_file()
                            && sub_entry
                                .file_name()
                                .to_string_lossy()
                                .eq_ignore_ascii_case(fname_lower)
                        {
                            if dir_contains_non_config_mod_assets(&p) {
                                return Some(sp);
                            }
                            if fallback_match.is_none() {
                                fallback_match = Some(sp);
                            }
                        } else if sp.is_dir() {
                            let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                            if !is_skipped_vault_subdir(&sub2_name) {
                                if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                    for sub2_entry in sub2_entries.flatten() {
                                        let sp2 = sub2_entry.path();
                                        if sp2 == excluded_path {
                                            continue;
                                        }
                                        if sp2.is_file()
                                            && sub2_entry
                                                .file_name()
                                                .to_string_lossy()
                                                .eq_ignore_ascii_case(fname_lower)
                                        {
                                            if dir_contains_non_config_mod_assets(&sp)
                                                || dir_contains_non_config_mod_assets(&p)
                                            {
                                                return Some(sp2);
                                            }
                                            if fallback_match.is_none() {
                                                fallback_match = Some(sp2);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fallback_match
}

pub fn deduplicate_vault_root_configs(
    vault_mods_lane: &Path,
    config_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !vault_mods_lane.exists() {
        return;
    }

    let manifest_leaf_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    let is_config_ext = |ext_lower: &str| -> bool {
        is_plain_text_config_extension(ext_lower)
            || config_exts.iter().any(|e| e.eq_ignore_ascii_case(ext_lower))
    };

    let mut root_configs: Vec<(String, PathBuf)> = Vec::new();
    let mut subdirs: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if !is_skipped_vault_subdir(&dname) {
                    subdirs.push(p);
                }
            } else if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                    || fname_lower.starts_with('.')
                    || (!manifest_leaf_lower.is_empty() && fname_lower == manifest_leaf_lower)
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if is_config_ext(&ext.to_lowercase()) {
                        root_configs.push((fname_lower, p));
                    }
                }
            }
        }
    }

    if root_configs.is_empty() || subdirs.is_empty() {
        return;
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let mut removed_root_paths: Vec<String> = Vec::new();

    for (fname_lower, root_file) in root_configs {
        let mut preferred_match: Option<PathBuf> = None;
        let mut fallback_match: Option<PathBuf> = None;

        'search: for subdir in &subdirs {
            if let Ok(sub_entries) = std::fs::read_dir(subdir) {
                for sub_entry in sub_entries.flatten() {
                    let sp = sub_entry.path();
                    if sp.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        if dir_contains_non_config_mod_assets(subdir) {
                            preferred_match = Some(sp);
                            break 'search;
                        } else if fallback_match.is_none() {
                            fallback_match = Some(sp);
                        }
                    } else if sp.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let sp2 = sub2_entry.path();
                                    if sp2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        if dir_contains_non_config_mod_assets(&sp)
                                            || dir_contains_non_config_mod_assets(subdir)
                                        {
                                            preferred_match = Some(sp2);
                                            break 'search;
                                        } else if fallback_match.is_none() {
                                            fallback_match = Some(sp2);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(sub_file) = preferred_match.or(fallback_match) {
            let root_is_symlink = std::fs::symlink_metadata(&root_file)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
                || std::fs::read_link(&root_file).is_ok();

            if !root_is_symlink {
                let root_meta = std::fs::metadata(&root_file).ok();
                let sub_meta = std::fs::metadata(&sub_file).ok();
                if let (Some(rm), Some(sm)) = (root_meta, sub_meta) {
                    if rm.len() > 0 {
                        let should_preserve_root_data = if sm.len() == 0 {
                            true
                        } else if let (Ok(rt), Ok(st)) = (rm.modified(), sm.modified()) {
                            rt > st && rm.len() >= sm.len() / 2
                        } else {
                            false
                        };
                        if should_preserve_root_data {
                            let _ = std::fs::copy(&root_file, &sub_file);
                        }
                    }
                }
            }

            if std::fs::remove_file(&root_file).is_ok() {
                removed_root_paths.push(root_file.to_string_lossy().to_string());

                if !config.mods_path.trim().is_empty() {
                    if let Some(actual_name) = sub_file.file_name() {
                        let live_cfg = Path::new(&config.mods_path).join(actual_name);
                        if let Ok(link_target) = std::fs::read_link(&live_cfg) {
                            if link_target == root_file {
                                let _ = std::fs::remove_file(&live_cfg);
                                let _ = create_symlink_file(&sub_file, &live_cfg)
                                    .or_else(|_| std::fs::copy(&sub_file, &live_cfg).map(|_| ()));
                            }
                        }
                    }
                }
            }
        }
    }

    if !removed_root_paths.is_empty() && !config.vault_path.trim().is_empty() {
        if let Ok(db) = open_db_conn(&config.vault_path) {
            if let Ok(conn) = db.lock() {
                for p_str in &removed_root_paths {
                    let norm_win = p_str.replace('/', "\\");
                    let norm_unix = p_str.replace('\\', "/");
                    let _ = conn.execute(
                        "DELETE FROM cache WHERE path = ?1 OR path = ?2 OR path = ?3",
                        params![p_str, norm_win, norm_unix],
                    );
                }
            }
        }
    }
}

pub fn cleanup_live_counterparts_on_delete(deleted_path: &Path, deleted_file_names: &[String]) {
    let is_protected = |name_lower: &str| -> bool {
        matches!(
            name_lower,
            "desktop.ini"
                | "thumbs.db"
                | ".ds_store"
                | ".sanctuary_deployed_links.json"
                | ".sanctuary_cache.db"
                | ".sanctuary_cache.json"
                | SANCTUARY_EDGE_MANIFEST_FILE
                | SANCTUARY_EDGE_OVERRIDE_FILE
        )
    };

    let mut target_names_lower: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    if let Some(fname) = deleted_path.file_name().and_then(|n| n.to_str()) {
        let lower = fname.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }
    for name in deleted_file_names {
        let lower = name.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let vault_mods_lane = if !config.vault_path.trim().is_empty() {
        Some(get_vault_mods_lane(&config.vault_path))
    } else {
        None
    };

    let mut surviving_vault_copies: std::collections::HashMap<String, PathBuf> =
        std::collections::HashMap::new();
    if let Some(ref lane) = vault_mods_lane {
        for name_lower in &target_names_lower {
            if let Some(survivor) = find_surviving_vault_file(lane, name_lower, deleted_path) {
                surviving_vault_copies.insert(name_lower.clone(), survivor);
            }
        }
    }

    if let Some(ref lane) = vault_mods_lane {
        if let Ok(rel) = deleted_path.strip_prefix(lane) {
            if !config.mods_path.trim().is_empty() {
                let live_rel = Path::new(&config.mods_path).join(rel);
                if live_rel != deleted_path {
                    let fname_lower = live_rel
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                        if live_rel
                            .parent()
                            .map(|p| p == Path::new(&config.mods_path))
                            .unwrap_or(false)
                        {
                            let _ = std::fs::remove_file(&live_rel);
                            let _ = create_symlink_file(survivor, &live_rel)
                                .or_else(|_| std::fs::copy(survivor, &live_rel).map(|_| ()));
                        }
                    } else if let Ok(meta) = std::fs::symlink_metadata(&live_rel) {
                        if meta.file_type().is_symlink() || std::fs::read_link(&live_rel).is_ok() {
                            if live_rel.is_dir() {
                                let _ = std::fs::remove_dir(&live_rel);
                            } else {
                                let _ = std::fs::remove_file(&live_rel);
                            }
                        } else if meta.is_file() {
                            let _ = std::fs::remove_file(&live_rel);
                        }
                    }
                }
            }
        }
    }

    if !config.mods_path.trim().is_empty() {
        let mods_dir = PathBuf::from(&config.mods_path);
        if mods_dir.exists() && mods_dir != deleted_path {
            let remove_or_relink_in_dir = |dir: &Path| {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p == deleted_path {
                            continue;
                        }
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        if is_protected(&fname_lower) {
                            continue;
                        }
                        let mut matches_target = target_names_lower.contains(&fname_lower);
                        let mut points_to_deleted = false;
                        if let Ok(link_target) = std::fs::read_link(&p) {
                            if link_target == deleted_path || link_target.starts_with(deleted_path)
                            {
                                matches_target = true;
                                points_to_deleted = true;
                            }
                        }
                        if matches_target {
                            if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                                if points_to_deleted || dir == mods_dir {
                                    let _ = std::fs::remove_file(&p);
                                    let _ = create_symlink_file(survivor, &p)
                                        .or_else(|_| std::fs::copy(survivor, &p).map(|_| ()));
                                }
                                continue;
                            }

                            let is_link = std::fs::read_link(&p).is_ok()
                                || std::fs::symlink_metadata(&p)
                                    .map(|m| m.file_type().is_symlink())
                                    .unwrap_or(false);
                            if is_link {
                                if p.is_dir() {
                                    let _ = std::fs::remove_dir(&p);
                                } else {
                                    let _ = std::fs::remove_file(&p);
                                }
                            } else if p.is_file() {
                                let _ = std::fs::remove_file(&p);
                            }
                        }
                    }
                }
            };

            remove_or_relink_in_dir(&mods_dir);
            if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let dname = entry.file_name().to_string_lossy().to_lowercase();
                        if !dname.starts_with('.') {
                            remove_or_relink_in_dir(&p);
                        }
                    }
                }
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ArchivedModVersion {
    pub rel_path: String,
    pub dna_hash: String,
    #[serde(default)]
    pub backup_rel_path: String,
    #[serde(default)]
    pub mod_version: String,
    #[serde(default)]
    pub compatible_versions: Vec<String>,
    #[serde(default)]
    pub recorded_at: u64,
}

pub fn get_vault_backups_mods_dir(vault_path: &str) -> PathBuf {
    let p = Path::new(vault_path);
    let vault_root = if is_mods_dir(p) {
        p.parent().unwrap_or(p).to_path_buf()
    } else {
        p.to_path_buf()
    };
    vault_root.join("Backups").join("Mods")
}

pub fn load_mod_versions_index(
    vault_path: &str,
) -> std::collections::HashMap<String, Vec<ArchivedModVersion>> {
    let index_path = get_vault_backups_mods_dir(vault_path).join(".mod_versions.json");
    if let Ok(raw) = std::fs::read_to_string(&index_path) {
        if let Ok(parsed) =
            serde_json::from_str::<std::collections::HashMap<String, Vec<ArchivedModVersion>>>(&raw)
        {
            return parsed;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_mod_versions_index(
    vault_path: &str,
    index: &std::collections::HashMap<String, Vec<ArchivedModVersion>>,
) {
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let _ = std::fs::create_dir_all(&backups_mods);
    let index_path = backups_mods.join(".mod_versions.json");
    if let Ok(json_str) = serde_json::to_string_pretty(index) {
        let _ = atomic_write_bytes(&index_path, json_str.as_bytes());
    }
}

pub(super) fn compare_version_strs(v1: &str, v2: &str) -> std::cmp::Ordering {
    fn clean_parts(raw: &str) -> Vec<u64> {
        raw.trim()
            .trim_start_matches(|c: char| c == '>' || c == '<' || c == '=' || c == '!')
            .trim()
            .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
            .trim_end_matches('+')
            .trim()
            .split('.')
            .map(|seg| seg.parse::<u64>().unwrap_or(0))
            .collect()
    }
    let p1 = clean_parts(v1);
    let p2 = clean_parts(v2);
    let max_len = p1.len().max(p2.len());
    for i in 0..max_len {
        let a = *p1.get(i).unwrap_or(&0);
        let b = *p2.get(i).unwrap_or(&0);
        match a.cmp(&b) {
            std::cmp::Ordering::Equal => continue,
            ord => return ord,
        }
    }
    std::cmp::Ordering::Equal
}

pub(super) fn clean_single_ver_token(raw: &str) -> String {
    raw.trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim()
        .to_lowercase()
}

pub(super) fn matches_single_version_rule(raw_rule: &str, clean_target: &str) -> bool {
    let rule = clean_single_ver_token(raw_rule);
    if rule.is_empty() {
        return false;
    }
    if matches!(
        rule.as_str(),
        "any" | "all" | "unknown" | "vlocal" | "local" | "global"
    ) {
        return true;
    }
    if rule.contains("..") || rule.contains('-') {
        let parts: Vec<String> = if rule.contains("..") {
            rule.split("..")
                .map(clean_single_ver_token)
                .filter(|s| !s.is_empty())
                .collect()
        } else {
            rule.split('-')
                .map(clean_single_ver_token)
                .filter(|s| !s.is_empty())
                .collect()
        };
        if parts.len() == 2
            && parts[0].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
            && parts[1].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
        {
            let (low, high) =
                if compare_version_strs(&parts[0], &parts[1]) != std::cmp::Ordering::Greater {
                    (&parts[0], &parts[1])
                } else {
                    (&parts[1], &parts[0])
                };
            let ge_low = compare_version_strs(clean_target, low) != std::cmp::Ordering::Less;
            let le_high = compare_version_strs(clean_target, high) != std::cmp::Ordering::Greater
                || clean_target.starts_with(&format!("{}.", high));
            return ge_low && le_high;
        }
    }
    if rule.ends_with('+') || rule.starts_with(">=") {
        let min_ver =
            clean_single_ver_token(rule.trim_start_matches(">=").trim_end_matches('+'));
        if min_ver.is_empty() {
            return false;
        }
        return compare_version_strs(clean_target, &min_ver) != std::cmp::Ordering::Less;
    }
    if rule.starts_with("<=") {
        let max_ver = clean_single_ver_token(rule.trim_start_matches("<="));
        if max_ver.is_empty() {
            return false;
        }
        return compare_version_strs(clean_target, &max_ver) != std::cmp::Ordering::Greater
            || clean_target.starts_with(&format!("{}.", max_ver));
    }
    clean_target == rule
        || clean_target.starts_with(&format!("{}.", rule))
        || rule.starts_with(&format!("{}.", clean_target))
}

pub fn is_game_version_compatible(compatible_versions: &[String], target_game_version: &str) -> bool {
    let clean_target = clean_single_ver_token(target_game_version);
    if clean_target.is_empty() || matches!(clean_target.as_str(), "unknown" | "all" | "any") {
        return true;
    }
    if compatible_versions.is_empty() {
        return false;
    }
    let mut exclusions: Vec<String> = Vec::new();
    let mut positives: Vec<String> = Vec::new();
    for entry in compatible_versions {
        for raw_token in entry.split(',') {
            let trimmed = raw_token.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix('!') {
                let ex = rest.trim();
                if !ex.is_empty() {
                    exclusions.push(ex.to_string());
                }
            } else {
                positives.push(trimmed.to_string());
            }
        }
    }
    if exclusions
        .iter()
        .any(|ex| matches_single_version_rule(ex, &clean_target))
    {
        return false;
    }
    if positives.is_empty() {
        return !exclusions.is_empty();
    }
    positives
        .iter()
        .any(|pos| matches_single_version_rule(pos, &clean_target))
}

pub fn is_mod_version_archiving_enabled(vault_path: &str) -> bool {
    if vault_path.trim().is_empty() {
        return true;
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "archive_mod_versions") {
        return !val.trim().eq_ignore_ascii_case("false") && val.trim() != "0";
    }
    true
}

pub fn normalize_mod_version_key(rel_path: &str) -> String {
    rel_path.replace('\\', "/").trim_matches('/').to_lowercase()
}

pub fn is_mod_version_pinned(
    pins: &std::collections::HashMap<String, String>,
    rel_path: &str,
) -> bool {
    let key = normalize_mod_version_key(rel_path);
    if key.is_empty() {
        return false;
    }
    if pins.contains_key(&key) {
        return true;
    }
    if !key.contains('/') {
        let leaf = Path::new(&key)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if !leaf.is_empty() && pins.contains_key(&leaf) {
            return true;
        }
    }
    false
}

pub fn load_pinned_mod_versions(vault_path: &str) -> std::collections::HashMap<String, String> {
    if vault_path.trim().is_empty() {
        return std::collections::HashMap::new();
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "pinned_mod_versions") {
        if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&val) {
            return map;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_pinned_mod_versions(
    vault_path: &str,
    pins: &std::collections::HashMap<String, String>,
) {
    if vault_path.trim().is_empty() {
        return;
    }
    if let Ok(raw) = serde_json::to_string(pins) {
        set_vault_kv(vault_path, "pinned_mod_versions", &raw);
    }
}

pub fn archive_mod_binary_version(
    vault_path: &str,
    active_file_path: &Path,
    known_hash: Option<&str>,
    mod_version: Option<&str>,
    compatible_versions: Option<Vec<String>>,
) -> Option<ArchivedModVersion> {
    let keep_history = is_mod_version_archiving_enabled(vault_path);
    if !active_file_path.exists() || !active_file_path.is_file() {
        return None;
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let rel = active_file_path
        .strip_prefix(&mods_lane)
        .unwrap_or(active_file_path);
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    if rel_str.is_empty() || rel_str.starts_with('.') {
        return None;
    }

    let hash = match known_hash.filter(|h| !h.trim().is_empty()) {
        Some(h) => h.trim().to_lowercase(),
        None => calculate_hash(active_file_path).ok()?.to_lowercase(),
    };
    if hash.is_empty() {
        return None;
    }

    let short_hash: String = hash.chars().take(12).collect();
    let orig_file_name = active_file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let backup_rel_path = if let Some(parent) = rel.parent() {
        let p_str = parent.to_string_lossy().replace('\\', "/");
        if p_str.is_empty() {
            format!("{}/{}", short_hash, orig_file_name)
        } else {
            format!("{}/{}/{}", p_str, short_hash, orig_file_name)
        }
    } else {
        format!("{}/{}", short_hash, orig_file_name)
    };

    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let backup_full_path = backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(b_parent) = backup_full_path.parent() {
        let _ = std::fs::create_dir_all(b_parent);
    }

    if !backup_full_path.exists() {
        let linked = std::fs::hard_link(active_file_path, &backup_full_path)
            .or_else(|_| std::fs::copy(active_file_path, &backup_full_path).map(|_| ()));
        if linked.is_err() {
            return None;
        }
    }

    let mut index = load_mod_versions_index(vault_path);
    let key = rel_str.to_lowercase();
    let entries = index.entry(key).or_default();
    let now_secs = current_epoch_ms() / 1000;

    let entry = if let Some(existing) = entries.iter_mut().find(|e| e.dna_hash.eq_ignore_ascii_case(&hash)) {
        if existing.backup_rel_path != backup_rel_path && existing.backup_rel_path.contains("__") {
            let old_b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if old_b_full.exists() {
                let _ = std::fs::remove_file(&old_b_full);
            }
        }
        existing.rel_path = rel_str.clone();
        existing.backup_rel_path = backup_rel_path.clone();
        if let Some(mv) = mod_version.filter(|s| !s.trim().is_empty()) {
            existing.mod_version = mv.trim().to_string();
        }
        if let Some(cv) = compatible_versions {
            for v in cv {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                }
            }
        }
        existing.clone()
    } else {
        let created = ArchivedModVersion {
            rel_path: rel_str,
            dna_hash: hash.clone(),
            backup_rel_path,
            mod_version: mod_version.unwrap_or_default().trim().to_string(),
            compatible_versions: compatible_versions
                .unwrap_or_default()
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            recorded_at: now_secs,
        };
        entries.push(created.clone());
        created
    };

    if !keep_history {
        // When Version History is disabled ("Keep One" mode), prune any previous versions of this file on update
        entries.retain(|e| {
            let is_current = e.dna_hash.eq_ignore_ascii_case(&hash);
            if !is_current && !e.backup_rel_path.is_empty() {
                let old_full = backups_mods
                    .join(e.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                if old_full.exists() {
                    let _ = std::fs::remove_file(&old_full);
                    if let Some(p) = old_full.parent() {
                        let _ = std::fs::remove_dir(p);
                    }
                }
            }
            is_current
        });
    }

    save_mod_versions_index(vault_path, &index);
    Some(entry)
}

pub fn sync_vault_mod_versions_for_game(
    vault_path: &str,
    target_game_version: &str,
    metadata_updates: &[ArchivedModVersion],
) -> Vec<ArchivedModVersion> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let archiving_enabled = is_mod_version_archiving_enabled(vault_path);
    let mut index = load_mod_versions_index(vault_path);
    let mut index_dirty = false;

    for meta in metadata_updates {
        let rel_norm = meta.rel_path.replace('\\', "/");
        if rel_norm.is_empty() || meta.dna_hash.trim().is_empty() {
            continue;
        }
        let key = rel_norm.to_lowercase();
        let hash_lower = meta.dna_hash.trim().to_lowercase();
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));

        let entries = index.entry(key).or_default();
        if let Some(existing) = entries
            .iter_mut()
            .find(|e| e.dna_hash.eq_ignore_ascii_case(&hash_lower))
        {
            if !meta.mod_version.trim().is_empty() && existing.mod_version != meta.mod_version.trim() {
                existing.mod_version = meta.mod_version.trim().to_string();
                index_dirty = true;
            }
            for v in &meta.compatible_versions {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                    index_dirty = true;
                }
            }
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = Path::new(&rel_norm)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let canonical_backup_rel = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            if existing.backup_rel_path.is_empty() {
                existing.backup_rel_path = canonical_backup_rel.clone();
                index_dirty = true;
            } else if existing.backup_rel_path != canonical_backup_rel
                && existing.backup_rel_path.contains("__")
            {
                let old_b_full = backups_mods.join(
                    existing
                        .backup_rel_path
                        .replace('/', std::path::MAIN_SEPARATOR_STR),
                );
                let new_b_full = backups_mods
                    .join(canonical_backup_rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                if let Some(np) = new_b_full.parent() {
                    let _ = std::fs::create_dir_all(np);
                }
                if old_b_full.exists() {
                    if !new_b_full.exists() {
                        let _ = std::fs::rename(&old_b_full, &new_b_full);
                    } else {
                        let _ = std::fs::remove_file(&old_b_full);
                    }
                }
                existing.backup_rel_path = canonical_backup_rel;
                index_dirty = true;
            }
            let b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() && active_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
        } else if archiving_enabled && active_full.exists() {
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = active_full
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let backup_rel_path = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            let b_full =
                backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
            if b_full.exists() {
                entries.push(ArchivedModVersion {
                    rel_path: rel_norm,
                    dna_hash: hash_lower,
                    backup_rel_path,
                    mod_version: meta.mod_version.trim().to_string(),
                    compatible_versions: meta
                        .compatible_versions
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    recorded_at: current_epoch_ms() / 1000,
                });
                index_dirty = true;
            }
        }
    }

    let mut cache = load_cache(vault_path);
    let mut cache_dirty = false;

    // Index keys are normalized full relative paths (preserving folder boundaries).
    // Never delete files in other subfolders purely because they share a generic leaf filename
    // (e.g. manifest.json, modinfo.json, config.ini, Data.pak).

    let clean_target = target_game_version
        .trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim();
    if clean_target.is_empty() || clean_target.eq_ignore_ascii_case("unknown") {
        if index_dirty {
            save_mod_versions_index(vault_path, &index);
        }
        if cache_dirty {
            save_cache(vault_path, &cache);
        }
        return Vec::new();
    }

    let mut swapped = Vec::new();
    let pinned_map = load_pinned_mod_versions(vault_path);

    for entries in index.values() {
        if entries.is_empty() {
            continue;
        }
        let rel_norm = &entries[0].rel_path;
        if is_mod_version_pinned(&pinned_map, rel_norm) {
            // Respect manual power-user version pin until reset to Auto-Swap
            continue;
        }
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));
        let active_full_str = active_full.to_string_lossy().to_string();

        let current_hash = if let Some(c) = cache.get(&active_full_str) {
            if !c.dna_hash.is_empty() && active_full.exists() {
                c.dna_hash.to_lowercase()
            } else if active_full.exists() {
                calculate_hash(&active_full).unwrap_or_default().to_lowercase()
            } else {
                String::new()
            }
        } else if active_full.exists() {
            calculate_hash(&active_full).unwrap_or_default().to_lowercase()
        } else {
            String::new()
        };

        let current_entry = entries
            .iter()
            .find(|e| !current_hash.is_empty() && e.dna_hash.eq_ignore_ascii_case(&current_hash));

        if let Some(cur) = current_entry {
            if cur.compatible_versions.is_empty()
                || is_game_version_compatible(&cur.compatible_versions, clean_target)
            {
                continue;
            }
        } else if active_full.exists() {
            // Current file is not in version index or has no known version constraint
            continue;
        }

        // Look for an archived version that matches clean_target and exists in Backups/Mods
        let mut best_match: Option<&ArchivedModVersion> = None;
        for candidate in entries {
            if candidate.backup_rel_path.is_empty() {
                continue;
            }
            if !is_game_version_compatible(&candidate.compatible_versions, clean_target) {
                continue;
            }
            let b_full = backups_mods
                .join(candidate.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                continue;
            }
            match best_match {
                None => best_match = Some(candidate),
                Some(prev) => {
                    if candidate.recorded_at >= prev.recorded_at {
                        best_match = Some(candidate);
                    }
                }
            }
        }

        if let Some(winner) = best_match {
            if !current_hash.is_empty() && winner.dna_hash.eq_ignore_ascii_case(&current_hash) {
                continue;
            }
            let b_full =
                backups_mods.join(winner.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(ap) = active_full.parent() {
                let _ = std::fs::create_dir_all(ap);
            }
            if active_full.exists() {
                let _ = crate::utils::remove_file_clearing_readonly(&active_full);
            }
            let linked = std::fs::hard_link(&b_full, &active_full)
                .or_else(|_| create_symlink_file(&b_full, &active_full))
                .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()));
            if linked.is_ok() {
                let mtime = std::fs::metadata(&active_full)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if let Some(c) = cache.get_mut(&active_full_str) {
                    c.dna_hash = winner.dna_hash.clone();
                    c.mtime = mtime;
                    cache_dirty = true;
                } else {
                    cache.insert(
                        active_full_str,
                        crate::state::CacheEntry {
                            mtime,
                            dna_hash: winner.dna_hash.clone(),
                            explicitly_local: false,
                            quarantined: false,
                            heuristic_malware_sig: None,
                            heuristic_sigs_mtime: 0,
                        },
                    );
                    cache_dirty = true;
                }
                swapped.push(winner.clone());
            }
        }
    }

    if index_dirty {
        save_mod_versions_index(vault_path, &index);
    }
    if cache_dirty {
        save_cache(vault_path, &cache);
    }

    swapped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_vault_mod_versions_preserves_same_filename_in_other_mod_folder() {
        let root = std::env::temp_dir().join("sanctuary_fs_ops_sibling_unit_test");
        let _ = std::fs::remove_dir_all(&root);
        let mods_dir = root.join("Mods");
        let mod_a_dir = mods_dir.join("ModA");
        let mod_b_dir = mods_dir.join("ModB");
        let backup_a_dir = root.join("Backups").join("Mods").join("ModA");
        std::fs::create_dir_all(&mod_a_dir).unwrap();
        std::fs::create_dir_all(&mod_b_dir).unwrap();
        std::fs::create_dir_all(&backup_a_dir).unwrap();

        let file_a = mod_a_dir.join("manifest.json");
        let file_b = mod_b_dir.join("manifest.json");
        let backup_a = backup_a_dir.join("manifest.json");
        std::fs::write(&file_a, b"old-a").unwrap();
        std::fs::write(&file_b, b"keep-b").unwrap();
        std::fs::write(&backup_a, b"new-a").unwrap();

        let vault_str = root.to_string_lossy().to_string();
        let meta = vec![ArchivedModVersion {
            rel_path: "ModA/manifest.json".into(),
            dna_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
            backup_rel_path: "ModA/manifest.json".into(),
            mod_version: "2.0.0".into(),
            compatible_versions: vec!["1.6.15".into()],
            recorded_at: 100,
        }];
        let _ = sync_vault_mod_versions_for_game(&vault_str, "1.6.15", &meta);

        assert!(file_b.exists(), "ModB/manifest.json must NEVER be deleted when updating ModA/manifest.json");
        assert_eq!(std::fs::read(&file_b).unwrap(), b"keep-b");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_mod_version_keys_isolate_identical_leaf_filenames_across_folders() {
        let key_a = normalize_mod_version_key("ModA\\manifest.json");
        let key_b = normalize_mod_version_key("ModB/manifest.json");
        assert_ne!(key_a, key_b);
        assert_eq!(key_a, "moda/manifest.json");
        assert_eq!(key_b, "modb/manifest.json");

        let mut pins = std::collections::HashMap::new();
        pins.insert(key_a.clone(), "abc123".to_string());

        assert!(is_mod_version_pinned(&pins, "ModA/manifest.json"));
        assert!(
            !is_mod_version_pinned(&pins, "ModB/manifest.json"),
            "Pinning ModA/manifest.json must never leak onto sibling ModB/manifest.json"
        );
    }
}




