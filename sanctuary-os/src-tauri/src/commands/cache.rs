use crate::commands::state_ops::*;
use crate::utils::*;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn mark_explicitly_local(vault_path: String, file_path: String) -> Result<(), String> {
    let db = open_db_conn(&vault_path)?;
    let conn = db
        .lock()
        .map_err(|_| "Database lock poisoned.".to_string())?;
    let rows = conn
        .execute(
            "UPDATE cache SET explicitly_local = 1 WHERE path = ?1",
            rusqlite::params![file_path],
        )
        .map_err(|e| e.to_string())?;
    if rows > 0 {
        Ok(())
    } else {
        Err("File not found in cache".to_string())
    }
}

#[tauri::command]
pub async fn generate_full_dna_hash(file_path: PathBuf) -> String {
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::utils::is_safe_user_file_path(&file_path) {
            return "0".into();
        }
        calculate_hash(&file_path).unwrap_or_else(|_| "0".into())
    })
    .await
    .unwrap_or_else(|_| "0".into())
}

fn cleanup_empty_vault_parents(start_file: &Path, stop_at_mods: &Path, stop_at_root: &Path) {
    let mut current_dir = start_file.parent().map(|p| p.to_path_buf());
    while let Some(dir) = current_dir {
        if dir == stop_at_mods
            || dir == stop_at_root
            || !crate::utils::path_is_within_root(&dir, stop_at_mods)
        {
            break;
        }
        if std::fs::remove_dir(&dir).is_err() {
            break;
        }
        current_dir = dir.parent().map(|p| p.to_path_buf());
    }
}

#[tauri::command]
pub async fn resolve_dna_match(
    path: String,
    existing_name: String,
    action: String,
    move_original: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = get_saved_coordinates();
        if cfg.vault_path.trim().is_empty() {
            return Err("Vault path not configured.".into());
        }
        let vault_root = crate::utils::get_vault_root_dir(&cfg.vault_path);
        let vault_mods = crate::utils::get_vault_mods_lane(&cfg.vault_path);
        let allowed_vault_roots = vec![vault_root.clone(), vault_mods.clone()];

        let source = Path::new(&path);
        if !crate::utils::is_safe_user_file_path(source) {
            return Err("Blocked: unsafe source path.".into());
        }
        let is_tmp_conflict = source
            .extension()
            .map_or(false, |ext| ext.to_string_lossy() == "tmp_sanctuary_conflict");
        if is_tmp_conflict {
            crate::utils::ensure_strict_descendant_of_roots(source, &allowed_vault_roots)?;
        }

        let mut resolved_existing = existing_name.clone();
        if resolved_existing.is_empty() {
            resolved_existing = path.replace(".tmp_sanctuary_conflict", "");
        }
        let existing = Path::new(&resolved_existing);

        let is_external_source = crate::utils::ensure_path_within_roots(source, &allowed_vault_roots).is_err();
        let should_move_original = is_external_source
            && move_original.unwrap_or_else(|| {
                cfg.ingest_file_mode
                    .as_deref()
                    .map(|m| m.eq_ignore_ascii_case("move"))
                    .unwrap_or(false)
            });

        if action == "replace" {
            crate::utils::ensure_strict_descendant_of_roots(existing, &allowed_vault_roots)?;

            let s_canon = crate::utils::resolve_canonical_target(source)
                .unwrap_or_else(|_| source.to_path_buf());
            let e_canon = crate::utils::resolve_canonical_target(existing)
                .unwrap_or_else(|_| existing.to_path_buf());

            if source.exists() && s_canon != e_canon {
                if let Some(parent) = existing.parent() {
                    let _ = std::fs::create_dir_all(parent);
                    let mut source_file_name = source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if source_file_name.ends_with(".tmp_sanctuary_conflict") {
                        source_file_name = source_file_name.replace(".tmp_sanctuary_conflict", "");
                    }
                    if !crate::utils::is_safe_single_filename(&source_file_name) {
                        return Err("Blocked: invalid target filename.".into());
                    }
                    let new_target = parent.join(&source_file_name);
                    crate::utils::ensure_strict_descendant_of_roots(
                        &new_target,
                        &allowed_vault_roots,
                    )?;

                    let is_setting_ext = new_target
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| {
                            matches!(
                                e.to_lowercase().as_str(),
                                "cfg" | "ini" | "json" | "txt" | "xml" | "toml" | "yaml" | "yml" | "log"
                            )
                        })
                        .unwrap_or(false);

                    if !is_setting_ext && existing.exists() {
                        let _ = crate::utils::archive_mod_binary_version(
                            &cfg.vault_path,
                            existing,
                            None,
                            None,
                            None,
                        );
                    }

                    let n_canon = crate::utils::resolve_canonical_target(&new_target)
                        .unwrap_or_else(|_| new_target.clone());

                    if s_canon != n_canon && new_target.exists() {
                        let _ = std::fs::remove_file(&new_target);
                    }

                    let copy_result = if s_canon == n_canon {
                        Ok(0)
                    } else {
                        std::fs::copy(source, &new_target)
                    };

                    match copy_result {
                        Ok(_) => {
                            let now = filetime::FileTime::now();
                            let _ = filetime::set_file_times(&new_target, now, now);

                            if !is_setting_ext {
                                let _ = crate::utils::archive_mod_binary_version(
                                    &cfg.vault_path,
                                    &new_target,
                                    None,
                                    None,
                                    None,
                                );
                            }

                            let n_canon_final = crate::utils::resolve_canonical_target(&new_target)
                                .unwrap_or_else(|_| new_target.clone());
                            if e_canon != n_canon_final && existing.exists() {
                                let _ = std::fs::remove_file(existing);
                            }

                            if is_tmp_conflict {
                                let _ = std::fs::remove_file(source);
                                cleanup_empty_vault_parents(source, &vault_mods, &vault_root);
                            } else if should_move_original
                                && s_canon != n_canon_final
                                && crate::utils::is_safe_user_file_path(source)
                            {
                                let _ = std::fs::remove_file(source);
                            }
                        }
                        Err(e) => {
                            return Err(format!("FAILED_TO_COPY: {}", e));
                        }
                    }
                }
            }
        } else if action == "discard" || action == "ignore" {
            if is_tmp_conflict {
                let _ = std::fs::remove_file(source);
                cleanup_empty_vault_parents(source, &vault_mods, &vault_root);
            } else if should_move_original
                && action == "discard"
                && crate::utils::is_safe_user_file_path(source)
            {
                let _ = std::fs::remove_file(source);
            }
        }

        Ok("Resolved".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn save_master_cache(vault_path: String, content: String) -> Result<String, String> {
    crate::utils::set_vault_kv(&vault_path, "master_registry_cache", &content);
    Ok("Saved".into())
}

#[tauri::command]
pub fn load_master_cache(vault_path: String) -> Result<String, String> {
    if let Some((raw, _)) = crate::utils::get_vault_kv(&vault_path, "master_registry_cache") {
        if !raw.trim().is_empty() {
            return Ok(raw);
        }
    }
    Ok("[]".into())
}

#[tauri::command]
pub fn purge_vault_artifacts(vault_path: String, filenames: Vec<String>) -> Result<String, String> {
    if vault_path.trim().is_empty() {
        return Err("Vault path not configured.".into());
    }
    let mut deleted = 0;
    let vault_root = crate::utils::get_vault_root_dir(&vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
    let allowed_roots = vec![vault_root.clone(), vault_mods_lane.clone()];

    for filename in filenames {
        let trimmed_rel = filename.trim().trim_start_matches(&['/', '\\'][..]);
        if trimmed_rel.is_empty() {
            continue;
        }
        let rel_path = std::path::Path::new(trimmed_rel);
        if !rel_path
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            continue;
        }
        let candidates = [
            vault_root.join(rel_path),
            vault_mods_lane.join(rel_path),
        ];
        for path in candidates {
            if crate::utils::ensure_strict_descendant_of_roots(&path, &allowed_roots).is_err()
                || !crate::utils::is_safe_user_file_path(&path)
            {
                continue;
            }
            if path.exists() || std::fs::symlink_metadata(&path).is_ok() {
                let mut deleted_names = Vec::new();
                if path.is_dir() {
                    for entry in walkdir::WalkDir::new(&path)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if entry.file_type().is_file() {
                            if let Some(fname) = entry.file_name().to_str() {
                                deleted_names.push(fname.to_string());
                            }
                        }
                    }
                    let _ = std::fs::remove_dir_all(&path);
                } else {
                    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                        deleted_names.push(fname.to_string());
                    }
                    let _ = std::fs::remove_file(&path);
                }

                cleanup_empty_vault_parents(&path, &vault_mods_lane, &vault_root);

                crate::utils::cleanup_live_counterparts_on_delete(&path, &deleted_names);
                deleted += 1;
            }
        }
    }
    Ok(format!("Purged {} artifacts.", deleted))
}

#[tauri::command]
pub async fn get_archived_mod_versions(
    vault_path: String,
) -> Result<Vec<crate::utils::ArchivedModVersion>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mut results = Vec::new();
        for entries in index.into_values() {
            for entry in entries {
                if !entry.backup_rel_path.is_empty() {
                    let full = backups_mods
                        .join(entry.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if full.exists() {
                        results.push(entry);
                    }
                }
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModVersionPoolItem {
    pub rel_path: String,
    pub dna_hash: String,
    pub backup_rel_path: String,
    pub mod_version: String,
    pub compatible_versions: Vec<String>,
    pub recorded_at: u64,
    pub size_bytes: u64,
    pub is_active: bool,
    #[serde(default)]
    pub is_pinned: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModVersionPoolStatus {
    pub enabled: bool,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
    pub total_versions: usize,
    pub older_versions: usize,
    pub items: Vec<ModVersionPoolItem>,
}

fn cleanup_empty_backup_parents(file_path: &Path, backups_mods_root: &Path) {
    let mut cur = file_path.parent().map(|p| p.to_path_buf());
    while let Some(dir) = cur {
        if dir == backups_mods_root
            || !crate::utils::path_is_within_root(&dir, backups_mods_root)
        {
            break;
        }
        if std::fs::remove_dir(&dir).is_err() {
            break;
        }
        cur = dir.parent().map(|p| p.to_path_buf());
    }
}

#[tauri::command]
pub async fn get_mod_version_pool_status(
    vault_path: String,
) -> Result<ModVersionPoolStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let enabled = crate::utils::is_mod_version_archiving_enabled(&vault_path);
        let index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let cache = load_cache(&vault_path);
        let pinned_map = crate::utils::load_pinned_mod_versions(&vault_path);

        let mut total_bytes: u64 = 0;
        let mut reclaimable_bytes: u64 = 0;
        let mut total_versions: usize = 0;
        let mut older_versions: usize = 0;
        let mut raw_items: Vec<ModVersionPoolItem> = Vec::new();

        for entries in index.into_values() {
            if entries.is_empty() {
                continue;
            }
            let rel_norm = &entries[0].rel_path;
            let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));
            let active_full_str = active_full.to_string_lossy().to_string();
            let active_hash = if let Some(c) = cache.get(&active_full_str) {
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

            for entry in entries.into_iter().rev() {
                if entry.backup_rel_path.is_empty() {
                    continue;
                }
                let full = backups_mods
                    .join(entry.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                if !full.exists() {
                    continue;
                }
                let size_bytes = std::fs::metadata(&full).map(|m| m.len()).unwrap_or(0);
                let is_active =
                    !active_hash.is_empty() && entry.dna_hash.eq_ignore_ascii_case(&active_hash);
                let f_name_lower = Path::new(&entry.rel_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                let is_pinned = !f_name_lower.is_empty() && pinned_map.contains_key(&f_name_lower);
                raw_items.push(ModVersionPoolItem {
                    rel_path: entry.rel_path,
                    dna_hash: entry.dna_hash,
                    backup_rel_path: entry.backup_rel_path,
                    mod_version: entry.mod_version,
                    compatible_versions: entry.compatible_versions,
                    recorded_at: entry.recorded_at,
                    size_bytes,
                    is_active,
                    is_pinned,
                });
            }
        }

        // Consolidate by filename + dna_hash so duplicate subfolder copies never produce two "Linked" versions
        let mut by_filename: std::collections::HashMap<String, Vec<ModVersionPoolItem>> =
            std::collections::HashMap::new();
        for item in raw_items {
            let f_name = Path::new(&item.rel_path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let group = by_filename.entry(f_name).or_default();
            if let Some(existing) = group
                .iter_mut()
                .find(|x| x.dna_hash.eq_ignore_ascii_case(&item.dna_hash))
            {
                if item.is_active && !existing.is_active {
                    existing.is_active = true;
                    existing.rel_path = item.rel_path;
                }
                if existing.mod_version.is_empty() && !item.mod_version.is_empty() {
                    existing.mod_version = item.mod_version;
                }
                for cv in item.compatible_versions {
                    if !existing
                        .compatible_versions
                        .iter()
                        .any(|c| c.eq_ignore_ascii_case(&cv))
                    {
                        existing.compatible_versions.push(cv);
                    }
                }
                if item.recorded_at > existing.recorded_at {
                    existing.recorded_at = item.recorded_at;
                }
            } else {
                group.push(item);
            }
        }

        let mut items: Vec<ModVersionPoolItem> = Vec::new();
        for (_, mut group) in by_filename {
            // Sort newest first; prefer items with known compatible_versions when breaking ties
            group.sort_by(|a, b| {
                let a_has_meta = !a.compatible_versions.is_empty() || !a.mod_version.is_empty();
                let b_has_meta = !b.compatible_versions.is_empty() || !b.mod_version.is_empty();
                b.recorded_at
                    .cmp(&a.recorded_at)
                    .then_with(|| b_has_meta.cmp(&a_has_meta))
                    .then_with(|| b.is_active.cmp(&a.is_active))
            });

            // Enforce at most one active version per binary filename
            let mut found_active = false;
            for v in group.iter_mut() {
                if v.is_active {
                    if !found_active {
                        found_active = true;
                    } else {
                        v.is_active = false;
                    }
                }
            }

            for v in group {
                total_bytes += v.size_bytes;
                total_versions += 1;
                if !v.is_active {
                    reclaimable_bytes += v.size_bytes;
                    older_versions += 1;
                }
                items.push(v);
            }
        }

        items.sort_by(|a, b| {
            a.rel_path
                .to_lowercase()
                .cmp(&b.rel_path.to_lowercase())
                .then_with(|| b.recorded_at.cmp(&a.recorded_at))
                .then_with(|| b.is_active.cmp(&a.is_active))
        });

        Ok(ModVersionPoolStatus {
            enabled,
            total_bytes,
            reclaimable_bytes,
            total_versions,
            older_versions,
            items,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_mod_version_archiving_enabled(
    vault_path: String,
    enabled: bool,
) -> Result<bool, String> {
    crate::utils::set_vault_kv(
        &vault_path,
        "archive_mod_versions",
        if enabled { "true" } else { "false" },
    );
    Ok(enabled)
}

#[tauri::command]
pub async fn delete_archived_mod_version(
    vault_path: String,
    rel_path: String,
    dna_hash: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let key = rel_path.replace('\\', "/").to_lowercase();
        let target_file_name = Path::new(&key)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let mut changed = false;

        for (k, entries) in index.iter_mut() {
            let k_file = Path::new(k)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if k == &key || (!target_file_name.is_empty() && k_file == target_file_name) {
                entries.retain(|entry| {
                    if entry.dna_hash.eq_ignore_ascii_case(&dna_hash) {
                        if !entry.backup_rel_path.is_empty() {
                            let full = backups_mods.join(
                                entry
                                    .backup_rel_path
                                    .replace('/', std::path::MAIN_SEPARATOR_STR),
                            );
                            if full.exists()
                                && crate::utils::ensure_strict_descendant_of_roots(
                                    &full,
                                    &[backups_mods.clone()],
                                )
                                .is_ok()
                            {
                                let _ = std::fs::remove_file(&full);
                                cleanup_empty_backup_parents(&full, &backups_mods);
                            }
                        }
                        changed = true;
                        false
                    } else {
                        true
                    }
                });
            }
        }

        if changed {
            index.retain(|_, v| !v.is_empty());
            crate::utils::save_mod_versions_index(&vault_path, &index);
        }

        Ok("Deleted".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn prune_archived_mod_versions(
    vault_path: String,
    keep_active_only: bool,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let cache = load_cache(&vault_path);
        let mut removed_count: usize = 0;

        for entries in index.values_mut() {
            if entries.is_empty() {
                continue;
            }
            let rel_norm = entries[0].rel_path.clone();
            let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));
            let active_full_str = active_full.to_string_lossy().to_string();
            let active_hash = if keep_active_only {
                if let Some(c) = cache.get(&active_full_str) {
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
                }
            } else {
                String::new()
            };

            entries.retain(|entry| {
                let keep = keep_active_only
                    && !active_hash.is_empty()
                    && entry.dna_hash.eq_ignore_ascii_case(&active_hash);
                if !keep {
                    if !entry.backup_rel_path.is_empty() {
                        let full = backups_mods.join(
                            entry
                                .backup_rel_path
                                .replace('/', std::path::MAIN_SEPARATOR_STR),
                        );
                        if full.exists()
                            && crate::utils::ensure_strict_descendant_of_roots(
                                &full,
                                &[backups_mods.clone()],
                            )
                            .is_ok()
                        {
                            let _ = std::fs::remove_file(&full);
                            cleanup_empty_backup_parents(&full, &backups_mods);
                        }
                    }
                    removed_count += 1;
                }
                keep
            });
        }

        index.retain(|_, v| !v.is_empty());
        crate::utils::save_mod_versions_index(&vault_path, &index);

        Ok(removed_count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn activate_archived_mod_version(
    vault_path: String,
    rel_path: String,
    dna_hash: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let key = rel_path.replace('\\', "/").to_lowercase();
        let target_file_name = Path::new(&key)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        let target_entry = index
            .get(&key)
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|e| e.dna_hash.eq_ignore_ascii_case(&dna_hash))
            })
            .or_else(|| {
                index.values().flat_map(|v| v.iter()).find(|e| {
                    let e_file = Path::new(&e.rel_path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();
                    !target_file_name.is_empty()
                        && e_file == target_file_name
                        && e.dna_hash.eq_ignore_ascii_case(&dna_hash)
                })
            })
            .ok_or_else(|| "Target version hash not found.".to_string())?;

        let b_full = backups_mods.join(
            target_entry
                .backup_rel_path
                .replace('/', std::path::MAIN_SEPARATOR_STR),
        );
        if !b_full.exists() {
            return Err("Archived binary missing on disk.".into());
        }
        crate::utils::ensure_strict_descendant_of_roots(&b_full, &[backups_mods.clone()])?;

        let mut target_rel_paths: Vec<String> = vec![rel_path.replace('\\', "/")];
        for entries in index.values() {
            if let Some(first) = entries.first() {
                let f_name = Path::new(&first.rel_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if !target_file_name.is_empty() && f_name == target_file_name {
                    let candidate = first.rel_path.replace('\\', "/");
                    let candidate_full =
                        mods_lane.join(candidate.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if candidate_full.exists()
                        && !target_rel_paths
                            .iter()
                            .any(|p| p.eq_ignore_ascii_case(&candidate))
                    {
                        target_rel_paths.push(candidate);
                    }
                }
            }
        }

        let _ = std::fs::create_dir_all(&mods_lane);
        let mut cache = load_cache(&vault_path);
        for rel_target in target_rel_paths {
            let active_full =
                mods_lane.join(rel_target.replace('/', std::path::MAIN_SEPARATOR_STR));
            crate::utils::ensure_strict_descendant_of_roots(&active_full, &[mods_lane.clone()])?;
            if let Some(ap) = active_full.parent() {
                let _ = std::fs::create_dir_all(ap);
            }
            if active_full.exists() {
                let _ = std::fs::remove_file(&active_full);
            }
            std::fs::hard_link(&b_full, &active_full)
                .or_else(|_| crate::utils::create_symlink_file(&b_full, &active_full))
                .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()))
                .map_err(|e| e.to_string())?;

            let active_full_str = active_full.to_string_lossy().to_string();
            let mtime = std::fs::metadata(&active_full)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if let Some(c) = cache.get_mut(&active_full_str) {
                c.dna_hash = target_entry.dna_hash.clone();
                c.mtime = mtime;
            } else {
                cache.insert(
                    active_full_str,
                    crate::state::CacheEntry {
                        mtime,
                        dna_hash: target_entry.dna_hash.clone(),
                        explicitly_local: false,
                        quarantined: false,
                        heuristic_malware_sig: None,
                        heuristic_sigs_mtime: 0,
                    },
                );
            }
        }
        save_cache(&vault_path, &cache);
        if !target_file_name.is_empty() {
            let mut pinned_map = crate::utils::load_pinned_mod_versions(&vault_path);
            pinned_map.insert(target_file_name, target_entry.dna_hash.to_lowercase());
            crate::utils::save_pinned_mod_versions(&vault_path, &pinned_map);
        }

        Ok("Activated".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModVersionBatchTarget {
    pub rel_path: String,
    pub dna_hash: String,
}

#[tauri::command]
pub async fn activate_archived_mod_versions_batch(
    vault_path: String,
    targets: Vec<ModVersionBatchTarget>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let mut cache = load_cache(&vault_path);
        let mut pinned_map = crate::utils::load_pinned_mod_versions(&vault_path);
        let mut activated_count = 0usize;

        for target in targets {
            let key = target.rel_path.replace('\\', "/").to_lowercase();
            let target_file_name = Path::new(&key)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let Some(target_entry) = index
                .get(&key)
                .and_then(|entries| {
                    entries
                        .iter()
                        .find(|e| e.dna_hash.eq_ignore_ascii_case(&target.dna_hash))
                })
                .or_else(|| {
                    index.values().flat_map(|v| v.iter()).find(|e| {
                        let e_file = Path::new(&e.rel_path)
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_lowercase();
                        !target_file_name.is_empty()
                            && e_file == target_file_name
                            && e.dna_hash.eq_ignore_ascii_case(&target.dna_hash)
                    })
                })
            else {
                continue;
            };

            let b_full = backups_mods.join(
                target_entry
                    .backup_rel_path
                    .replace('/', std::path::MAIN_SEPARATOR_STR),
            );
            if !b_full.exists()
                || crate::utils::ensure_strict_descendant_of_roots(&b_full, &[backups_mods.clone()])
                    .is_err()
            {
                continue;
            }

            let mut target_rel_paths: Vec<String> = vec![target.rel_path.replace('\\', "/")];
            for entries in index.values() {
                if let Some(first) = entries.first() {
                    let f_name = Path::new(&first.rel_path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();
                    if !target_file_name.is_empty() && f_name == target_file_name {
                        let candidate = first.rel_path.replace('\\', "/");
                        let candidate_full =
                            mods_lane.join(candidate.replace('/', std::path::MAIN_SEPARATOR_STR));
                        if candidate_full.exists()
                            && !target_rel_paths
                                .iter()
                                .any(|p| p.eq_ignore_ascii_case(&candidate))
                        {
                            target_rel_paths.push(candidate);
                        }
                    }
                }
            }

            let _ = std::fs::create_dir_all(&mods_lane);
            let mut any_linked = false;
            for rel_target in target_rel_paths {
                let active_full =
                    mods_lane.join(rel_target.replace('/', std::path::MAIN_SEPARATOR_STR));
                if crate::utils::ensure_strict_descendant_of_roots(&active_full, &[mods_lane.clone()])
                    .is_err()
                {
                    continue;
                }
                if let Some(ap) = active_full.parent() {
                    let _ = std::fs::create_dir_all(ap);
                }
                if active_full.exists() {
                    let _ = std::fs::remove_file(&active_full);
                }
                if std::fs::hard_link(&b_full, &active_full)
                    .or_else(|_| crate::utils::create_symlink_file(&b_full, &active_full))
                    .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()))
                    .is_ok()
                {
                    any_linked = true;
                    let active_full_str = active_full.to_string_lossy().to_string();
                    let mtime = std::fs::metadata(&active_full)
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    if let Some(c) = cache.get_mut(&active_full_str) {
                        c.dna_hash = target_entry.dna_hash.clone();
                        c.mtime = mtime;
                    } else {
                        cache.insert(
                            active_full_str,
                            crate::state::CacheEntry {
                                mtime,
                                dna_hash: target_entry.dna_hash.clone(),
                                explicitly_local: false,
                                quarantined: false,
                                heuristic_malware_sig: None,
                                heuristic_sigs_mtime: 0,
                            },
                        );
                    }
                }
            }

            if any_linked {
                activated_count += 1;
                if !target_file_name.is_empty() {
                    pinned_map.insert(target_file_name, target_entry.dna_hash.to_lowercase());
                }
            }
        }

        save_cache(&vault_path, &cache);
        crate::utils::save_pinned_mod_versions(&vault_path, &pinned_map);

        Ok(activated_count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reset_mod_versions_to_auto(
    vault_path: String,
    rel_paths: Option<Vec<String>>,
    target_game_version: String,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = crate::utils::load_mod_versions_index(&vault_path);
        let backups_mods = crate::utils::get_vault_backups_mods_dir(&vault_path);
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let mut cache = load_cache(&vault_path);
        let mut pinned_map = crate::utils::load_pinned_mod_versions(&vault_path);

        let target_files: std::collections::HashSet<String> = match rel_paths {
            Some(paths) if !paths.is_empty() => paths
                .into_iter()
                .filter_map(|p| {
                    let norm = p.replace('\\', "/");
                    let f = Path::new(&norm)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();
                    if f.is_empty() {
                        None
                    } else {
                        Some(f)
                    }
                })
                .collect(),
            _ => std::collections::HashSet::new(),
        };

        if target_files.is_empty() {
            pinned_map.clear();
        } else {
            for f in &target_files {
                pinned_map.remove(f);
            }
        }
        crate::utils::save_pinned_mod_versions(&vault_path, &pinned_map);

        let clean_target = target_game_version
            .trim()
            .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
            .trim();

        // Consolidate candidates by lowercase filename
        let mut by_filename: std::collections::HashMap<
            String,
            Vec<crate::utils::ArchivedModVersion>,
        > = std::collections::HashMap::new();
        let mut rel_paths_by_filename: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();

        for entries in index.values() {
            if entries.is_empty() {
                continue;
            }
            let first_rel = entries[0].rel_path.replace('\\', "/");
            let f_name = Path::new(&first_rel)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if f_name.is_empty() {
                continue;
            }
            if !target_files.is_empty() && !target_files.contains(&f_name) {
                continue;
            }
            let rel_list = rel_paths_by_filename.entry(f_name.clone()).or_default();
            if !rel_list.iter().any(|p| p.eq_ignore_ascii_case(&first_rel)) {
                rel_list.push(first_rel);
            }
            let group = by_filename.entry(f_name).or_default();
            for entry in entries.iter().rev() {
                if entry.backup_rel_path.is_empty() {
                    continue;
                }
                let b_full = backups_mods.join(
                    entry
                        .backup_rel_path
                        .replace('/', std::path::MAIN_SEPARATOR_STR),
                );
                if !b_full.exists() {
                    continue;
                }
                if let Some(existing) = group
                    .iter_mut()
                    .find(|x| x.dna_hash.eq_ignore_ascii_case(&entry.dna_hash))
                {
                    if entry.recorded_at > existing.recorded_at {
                        existing.recorded_at = entry.recorded_at;
                    }
                    for cv in &entry.compatible_versions {
                        if !existing
                            .compatible_versions
                            .iter()
                            .any(|c| c.eq_ignore_ascii_case(cv))
                        {
                            existing.compatible_versions.push(cv.clone());
                        }
                    }
                } else {
                    group.push(entry.clone());
                }
            }
        }

        let mut synced_count = 0usize;
        for (f_name, mut group) in by_filename {
            if group.is_empty() {
                continue;
            }
            // Sort newest first
            group.sort_by(|a, b| b.recorded_at.cmp(&a.recorded_at));

            // Pick best auto-swap candidate:
            // 1. Newest with explicit compatible_versions matching clean_target
            // 2. Newest compatible (including Any/All/untagged)
            // 3. Newest overall
            let winner = if !clean_target.is_empty() && !clean_target.eq_ignore_ascii_case("unknown")
            {
                group
                    .iter()
                    .find(|c| {
                        !c.compatible_versions.is_empty()
                            && crate::utils::is_game_version_compatible(
                                &c.compatible_versions,
                                clean_target,
                            )
                    })
                    .or_else(|| {
                        group.iter().find(|c| {
                            c.compatible_versions.is_empty()
                                || crate::utils::is_game_version_compatible(
                                    &c.compatible_versions,
                                    clean_target,
                                )
                        })
                    })
                    .or_else(|| group.first())
            } else {
                group.first()
            };

            let Some(winner) = winner else {
                continue;
            };
            let b_full = backups_mods.join(
                winner
                    .backup_rel_path
                    .replace('/', std::path::MAIN_SEPARATOR_STR),
            );
            if !b_full.exists()
                || crate::utils::ensure_strict_descendant_of_roots(&b_full, &[backups_mods.clone()])
                    .is_err()
            {
                continue;
            }

            let target_rels = rel_paths_by_filename
                .get(&f_name)
                .cloned()
                .unwrap_or_else(|| vec![winner.rel_path.replace('\\', "/")]);
            let _ = std::fs::create_dir_all(&mods_lane);
            let mut any_updated = false;

            for rel_target in target_rels {
                let active_full =
                    mods_lane.join(rel_target.replace('/', std::path::MAIN_SEPARATOR_STR));
                if crate::utils::ensure_strict_descendant_of_roots(&active_full, &[mods_lane.clone()])
                    .is_err()
                {
                    continue;
                }
                let active_full_str = active_full.to_string_lossy().to_string();
                let current_hash = if let Some(c) = cache.get(&active_full_str) {
                    if !c.dna_hash.is_empty() && active_full.exists() {
                        c.dna_hash.to_lowercase()
                    } else if active_full.exists() {
                        calculate_hash(&active_full).unwrap_or_default().to_lowercase()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                if !current_hash.is_empty()
                    && current_hash.eq_ignore_ascii_case(&winner.dna_hash)
                    && active_full.exists()
                {
                    any_updated = true;
                    continue;
                }

                if let Some(ap) = active_full.parent() {
                    let _ = std::fs::create_dir_all(ap);
                }
                if active_full.exists() {
                    let _ = std::fs::remove_file(&active_full);
                }
                if std::fs::hard_link(&b_full, &active_full)
                    .or_else(|_| crate::utils::create_symlink_file(&b_full, &active_full))
                    .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()))
                    .is_ok()
                {
                    any_updated = true;
                    let mtime = std::fs::metadata(&active_full)
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    if let Some(c) = cache.get_mut(&active_full_str) {
                        c.dna_hash = winner.dna_hash.clone();
                        c.mtime = mtime;
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
                    }
                }
            }

            if any_updated {
                synced_count += 1;
            }
        }

        save_cache(&vault_path, &cache);
        Ok(synced_count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_mod_versions_to_game(
    vault_path: String,
    target_game_version: String,
    version_metadata: Vec<crate::utils::ArchivedModVersion>,
) -> Result<Vec<crate::utils::ArchivedModVersion>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(crate::utils::sync_vault_mod_versions_for_game(
            &vault_path,
            &target_game_version,
            &version_metadata,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

