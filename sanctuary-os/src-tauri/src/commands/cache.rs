use crate::commands::state_ops::*;
use crate::utils::*;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn mark_explicitly_local(vault_path: String, file_path: String) -> Result<(), String> {
    let conn = get_db_conn(&vault_path);
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
        calculate_hash(&file_path).unwrap_or_else(|_| "0".into())
    })
    .await
    .unwrap_or_else(|_| "0".into())
}

#[tauri::command]
pub async fn resolve_dna_match(
    path: String,
    existing_name: String,
    action: String,
    move_original: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = Path::new(&path);
    let mut resolved_existing = existing_name.clone();
    if resolved_existing.is_empty() {
        resolved_existing = path.replace(".tmp_sanctuary_conflict", "");
    }
    let existing = Path::new(&resolved_existing);
    let config_opt = Some(get_saved_coordinates());
    let is_external_source = config_opt
        .as_ref()
        .map(|cfg| {
            let vault_mods = crate::utils::get_vault_mods_lane(&cfg.vault_path);
            let vault_root = if crate::utils::is_mods_dir(Path::new(&cfg.vault_path)) {
                Path::new(&cfg.vault_path)
                    .parent()
                    .unwrap_or(Path::new(&cfg.vault_path))
                    .to_path_buf()
            } else {
                PathBuf::from(&cfg.vault_path)
            };
            !source.starts_with(&vault_root)
                && !source.starts_with(&vault_mods)
                && !source.starts_with(&cfg.vault_path)
        })
        .unwrap_or(false);
    let should_move_original = is_external_source
        && move_original.unwrap_or_else(|| {
            config_opt
                .as_ref()
                .and_then(|cfg| cfg.ingest_file_mode.as_deref())
                .map(|m| m.eq_ignore_ascii_case("move"))
                .unwrap_or(false)
        });

    if action == "replace" {
        let s_canon = source
            .canonicalize()
            .unwrap_or_else(|_| source.to_path_buf());
        let e_canon = existing
            .canonicalize()
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
                let new_target = parent.join(&source_file_name);

                let is_setting_ext = new_target
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| {
                        matches!(
                            e.to_lowercase().as_str(),
                            "cfg" | "ini" | "json" | "txt" | "xml" | "log"
                        )
                    })
                    .unwrap_or(false);

                if !is_setting_ext && existing.exists() {
                    if let Some(cfg) = &config_opt {
                        if !cfg.vault_path.trim().is_empty() {
                            let _ = crate::utils::archive_mod_binary_version(
                                &cfg.vault_path,
                                existing,
                                None,
                                None,
                                None,
                            );
                        }
                    }
                }

                let s_canon = source
                    .canonicalize()
                    .unwrap_or_else(|_| source.to_path_buf());
                let n_canon = new_target
                    .canonicalize()
                    .unwrap_or_else(|_| new_target.clone());

                if s_canon != n_canon && new_target.exists() {
                    let _ = std::fs::remove_file(&new_target);
                }

                let copy_result = if s_canon == n_canon {
                    Ok(0) // Dummy success if it's already the exact same file
                } else {
                    std::fs::copy(source, &new_target)
                };

                match copy_result {
                    Ok(_) => {
                        let now = filetime::FileTime::now();
                        let _ = filetime::set_file_times(&new_target, now, now);

                        if !is_setting_ext {
                            if let Some(cfg) = &config_opt {
                                if !cfg.vault_path.trim().is_empty() {
                                    let _ = crate::utils::archive_mod_binary_version(
                                        &cfg.vault_path,
                                        &new_target,
                                        None,
                                        None,
                                        None,
                                    );
                                }
                            }
                        }

                        let n_canon_final = new_target
                            .canonicalize()
                            .unwrap_or_else(|_| new_target.clone());
                        if e_canon != n_canon_final {
                            let _ = std::fs::remove_file(existing);
                        }

                        if let Some(ext) = source.extension() {
                            if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                                let _ = std::fs::remove_file(source);
                                let mut current_dir = source.parent().map(|p| p.to_path_buf());
                                while let Some(dir) = current_dir {
                                    if std::fs::remove_dir(&dir).is_err() {
                                        break;
                                    }
                                    current_dir = dir.parent().map(|p| p.to_path_buf());
                                }
                            } else if should_move_original && s_canon != n_canon_final {
                                let _ = std::fs::remove_file(source);
                            }
                        } else if should_move_original && s_canon != n_canon_final {
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
        if let Some(ext) = source.extension() {
            if ext.to_string_lossy() == "tmp_sanctuary_conflict" {
                let _ = std::fs::remove_file(source);
                let mut current_dir = source.parent().map(|p| p.to_path_buf());
                while let Some(dir) = current_dir {
                    if std::fs::remove_dir(&dir).is_err() {
                        break;
                    }
                    current_dir = dir.parent().map(|p| p.to_path_buf());
                }
            } else if should_move_original && action == "discard" {
                let _ = std::fs::remove_file(source);
            }
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
    let mut deleted = 0;
    let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);

    for filename in filenames {
        let candidates = [
            std::path::PathBuf::from(&vault_path).join(&filename),
            vault_mods_lane.join(&filename),
        ];
        for path in candidates {
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

                let mut current = path.parent().map(|d| d.to_path_buf());
                while let Some(dir) = current {
                    if dir == vault_mods_lane
                        || dir.file_name().and_then(|s| s.to_str()) == Some("Mods")
                    {
                        break;
                    }
                    if std::fs::remove_dir(&dir).is_err() {
                        break;
                    }
                    current = dir.parent().map(|d| d.to_path_buf());
                }

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
        if dir == backups_mods_root || !dir.starts_with(backups_mods_root) {
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
                raw_items.push(ModVersionPoolItem {
                    rel_path: entry.rel_path,
                    dna_hash: entry.dna_hash,
                    backup_rel_path: entry.backup_rel_path,
                    mod_version: entry.mod_version,
                    compatible_versions: entry.compatible_versions,
                    recorded_at: entry.recorded_at,
                    size_bytes,
                    is_active,
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
                            if full.exists() {
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
                        if full.exists() {
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

        let mut cache = load_cache(&vault_path);
        for rel_target in target_rel_paths {
            let active_full =
                mods_lane.join(rel_target.replace('/', std::path::MAIN_SEPARATOR_STR));
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

        Ok("Activated".into())
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

