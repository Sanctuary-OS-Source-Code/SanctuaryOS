use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn sanitize_vault(
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let is_deploying = state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = state.inner().last_deploy_epoch_ms.clone();
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        struct SanitizeGuard(
            Arc<std::sync::atomic::AtomicBool>,
            Arc<std::sync::atomic::AtomicU64>,
        );
        impl Drop for SanitizeGuard {
            fn drop(&mut self) {
                self.1.store(
                    crate::utils::current_epoch_ms(),
                    std::sync::atomic::Ordering::SeqCst,
                );
                self.0.store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
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
        let _guard = SanitizeGuard(is_deploying, last_deploy_epoch_ms);

        let vault_root = PathBuf::from(&vault_path);
        let _ = crate::utils::open_db_conn(&vault_path)?;

        let backups_dir = vault_root.join("Backups");
        let legacy_backups_world = backups_dir.join("World");
        let legacy_backups_engine = backups_dir.join("Engine");
        let backups_mods = backups_dir.join("Mods");
        let blueprints_dir = vault_root.join("Blueprints");
        let templates_dir = vault_root.join("Templates");
        let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let quarantine_dir = vault_root.join("Quarantine");
        let hidden_quarantine_dir = vault_root.join(".sanctuary_quarantine");
        let master_vault_root = crate::utils::get_master_vault_root(&vault_path);
        if master_vault_root != vault_root {
            let _ = std::fs::remove_file(master_vault_root.join(".sanctuary_cache.db"));
            let _ = std::fs::remove_file(master_vault_root.join(".sanctuary_cache.db-wal"));
            let _ = std::fs::remove_file(master_vault_root.join(".sanctuary_cache.db-shm"));
        }
        let master_data_dir = master_vault_root.join("Data");
        let theme_chameleon = master_data_dir.join("Themes");
        let theme_lexicon = master_data_dir.join("Lexicons");

        let _ = std::fs::remove_dir(&legacy_backups_world);
        let _ = std::fs::remove_dir(&legacy_backups_engine);
        let _ = std::fs::create_dir_all(&backups_mods);
        let _ = std::fs::create_dir_all(&blueprints_dir);
        let _ = std::fs::create_dir_all(&templates_dir);
        let _ = std::fs::create_dir_all(&mods_lane);
        let _ = std::fs::create_dir_all(&quarantine_dir);
        let _ = std::fs::create_dir_all(&hidden_quarantine_dir);
        crate::utils::mark_path_hidden(&hidden_quarantine_dir);
        let _ = std::fs::create_dir_all(&theme_chameleon);
        let _ = std::fs::create_dir_all(&theme_lexicon);

        let mut moved = 0;

        if let Ok(entries) = std::fs::read_dir(&vault_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "zst") {
                    let coords = get_saved_coordinates();
                    let docs_base = crate::utils::resolve_effective_docs_path(&coords, &game_schema);
                    let target_world_dir =
                        crate::utils::get_world_backups_dir(&docs_base, &vault_path)
                            .unwrap_or_else(|| backups_dir.clone());
                    let _ = std::fs::create_dir_all(&target_world_dir);
                    let dest = target_world_dir.join(path.file_name().unwrap());
                    if std::fs::rename(&path, &dest).is_ok()
                        || (std::fs::copy(&path, &dest).is_ok()
                            && std::fs::remove_file(&path).is_ok())
                    {
                        moved += 1;
                    }
                }
            }
        }

        fn sweep_empty_dirs(dir: &std::path::Path) -> std::io::Result<bool> {
            let mut is_empty = true;
            if dir.is_dir() {
                for entry in std::fs::read_dir(dir)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        let child_empty = sweep_empty_dirs(&path)?;
                        if child_empty {
                            let _ = std::fs::remove_dir(&path);
                        } else {
                            is_empty = false;
                        }
                    } else if path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.eq_ignore_ascii_case("tmp_sanctuary_conflict"))
                        .unwrap_or(false)
                    {
                        let _ = std::fs::remove_file(&path);
                    } else {
                        is_empty = false;
                    }
                }
            }
            Ok(is_empty)
        }

        let config_exts = crate::game_logic::get_config_extensions(&game_schema);
        crate::utils::deduplicate_vault_root_configs(&mods_lane, &config_exts, &game_schema);
        let _ = sweep_empty_dirs(&mods_lane);

        Ok(moved.to_string())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

fn recompute_snapshot_metadata(
    backup_dir: &Path,
    prev_backup: Option<&(String, PathBuf)>,
) -> (u64, u64) {
    let mut raw_entries: Vec<(PathBuf, String, u64, Option<std::time::SystemTime>)> = Vec::new();
    let mut total_size: u64 = 0;

    for entry in walkdir::WalkDir::new(backup_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(backup_dir) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if rel_str.is_empty() || rel_str.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        let meta = entry.metadata().ok();
        let len_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let mtime = meta.as_ref().and_then(|m| m.modified().ok());
        total_size += len_bytes;
        raw_entries.push((rel.to_path_buf(), rel_str, len_bytes, mtime));
    }

    let (diff_size, manifest) = if let Some((prev_name, prev_dir)) = prev_backup {
        let mut added_paths = Vec::new();
        let mut updated_paths = Vec::new();
        let mut current_rel_set = std::collections::HashSet::with_capacity(raw_entries.len());
        let mut written_bytes: u64 = 0;

        for (rel_path, rel_str, cur_len, cur_mtime) in &raw_entries {
            current_rel_set.insert(rel_str.clone());
            let prev_file = prev_dir.join(rel_path);
            if let Ok(prev_meta) = prev_file.metadata() {
                if prev_meta.is_file() {
                    if *cur_len != prev_meta.len() || *cur_mtime != prev_meta.modified().ok() {
                        updated_paths.push(rel_str.clone());
                        written_bytes += *cur_len;
                    }
                } else {
                    added_paths.push(rel_str.clone());
                    written_bytes += *cur_len;
                }
            } else {
                added_paths.push(rel_str.clone());
                written_bytes += *cur_len;
            }
        }

        let removed_files =
            collect_removed_files_from_previous(&Some(prev_dir.clone()), &current_rel_set);

        (
            written_bytes.min(total_size),
            DeltaManifest {
                previous_backup_name: Some(prev_name.clone()),
                is_baseline: false,
                added_paths,
                updated_paths,
                removed_files,
            },
        )
    } else {
        (
            total_size,
            DeltaManifest {
                previous_backup_name: None,
                is_baseline: true,
                added_paths: Vec::new(),
                updated_paths: Vec::new(),
                removed_files: Vec::new(),
            },
        )
    };

    crate::utils::write_snapshot_meta_file(
        &backup_dir.join(".size_bytes.txt"),
        &total_size.to_string(),
    );
    crate::utils::write_snapshot_meta_file(
        &backup_dir.join(".diff_size_bytes.txt"),
        &diff_size.to_string(),
    );
    if let Ok(json_str) = serde_json::to_string(&manifest) {
        crate::utils::write_snapshot_meta_file(&backup_dir.join(".delta_manifest.json"), &json_str);
    }

    (total_size, diff_size)
}

#[tauri::command]
pub async fn get_backups(vault_path: String) -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        struct RawBackupEntry {
            name: String,
            path: PathBuf,
            is_dir: bool,
            size_mb: f64,
            logical_size_mb: f64,
        }

        let mut raw_list: Vec<RawBackupEntry> = Vec::new();
        let config = get_saved_coordinates();
        let base = PathBuf::from(&vault_path).join("Backups");

        let mut process_dir = |dir: &std::path::Path| {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let entry_path = e.path();
                    if entry_path.is_dir() {
                        if name == "World"
                            || name == "Mods"
                            || name == "Engine"
                            || name == "Config"
                            || name.starts_with('.')
                        {
                            continue;
                        }
                        raw_list.push(RawBackupEntry {
                            name,
                            path: entry_path,
                            is_dir: true,
                            size_mb: 0.0,
                            logical_size_mb: 0.0,
                        });
                    } else if entry_path.is_file()
                        && (entry_path.extension() == Some(std::ffi::OsStr::new("zst"))
                            || entry_path.extension() == Some(std::ffi::OsStr::new("tar")))
                    {
                        let size = e
                            .metadata()
                            .map(|m| m.len() as f64 / 1_048_576.0)
                            .unwrap_or(0.0);
                        raw_list.push(RawBackupEntry {
                            name,
                            path: entry_path,
                            is_dir: false,
                            size_mb: size,
                            logical_size_mb: size,
                        });
                    }
                }
            }
        };

        process_dir(&base.join("World"));
        process_dir(&base);

        // Scan legacy vault Engine
        process_dir(&base.join("Engine"));

        // Scan relocated Engine backups (same drive as live_path)
        if let Some(engine_dir) =
            crate::utils::get_engine_backups_dir(&config.live_path, &vault_path)
        {
            if engine_dir != base.join("Engine") {
                process_dir(&engine_dir);
            }
        }

        // Scan relocated World State backups (same drive as docs_path / mods_path)
        let docs_base = crate::utils::resolve_effective_docs_path(&config, &None);
        if let Some(world_dir) =
            crate::utils::get_world_backups_dir(&docs_base, &vault_path)
        {
            if world_dir != base.join("World") {
                process_dir(&world_dir);
            }
        }

        let extract_ts = |name: &str| -> u64 {
            let clean = name
                .trim_end_matches(".tar.zst")
                .trim_end_matches(".tar")
                .trim_end_matches(".zst");
            if let Some(last) = clean.split("--").last() {
                if let Ok(ts) = last.parse::<u64>() {
                    return ts;
                }
            }
            if let Some(last) = clean.split("_").last() {
                if let Ok(ts) = last.parse::<u64>() {
                    return ts;
                }
            }
            0
        };

        raw_list.sort_by(|a, b| a.name.cmp(&b.name));
        raw_list.dedup_by(|a, b| a.name == b.name);

        // Sort oldest-first by timestamp so each snapshot knows its exact chronological predecessor in its lane
        raw_list.sort_by(|a, b| {
            let ts_a = extract_ts(&a.name);
            let ts_b = extract_ts(&b.name);
            ts_a.cmp(&ts_b).then_with(|| a.name.cmp(&b.name))
        });

        let mut prev_world: Option<(String, PathBuf)> = None;
        let mut prev_engine: Option<(String, PathBuf)> = None;
        let mut rebuild_jobs: Vec<(usize, PathBuf, Option<(String, PathBuf)>)> = Vec::new();

        for (idx, item) in raw_list.iter_mut().enumerate() {
            if !item.is_dir {
                continue;
            }
            let expected_prev = if item.name.starts_with("World_State") {
                let p = prev_world.clone();
                prev_world = Some((item.name.clone(), item.path.clone()));
                p
            } else if item.name.starts_with("Engine_Core") {
                let p = prev_engine.clone();
                prev_engine = Some((item.name.clone(), item.path.clone()));
                p
            } else {
                None
            };

            let is_baseline = expected_prev.is_none();
            let expected_prev_name = expected_prev.as_ref().map(|(n, _)| n.clone());

            let size_file = item.path.join(".size_bytes.txt");
            let diff_size_file = item.path.join(".diff_size_bytes.txt");
            let manifest_file = item.path.join(".delta_manifest.json");

            let meta_readonly = std::fs::metadata(&size_file)
                .map(|m| m.permissions().readonly())
                .unwrap_or(false)
                || std::fs::metadata(&diff_size_file)
                    .map(|m| m.permissions().readonly())
                    .unwrap_or(false)
                || std::fs::metadata(&manifest_file)
                    .map(|m| m.permissions().readonly())
                    .unwrap_or(false);

            let cached_logical = std::fs::read_to_string(&size_file)
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok())
                .unwrap_or(0);
            let cached_diff = std::fs::read_to_string(&diff_size_file)
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok());

            let parsed_manifest = std::fs::read_to_string(&manifest_file)
                .ok()
                .and_then(|raw| serde_json::from_str::<DeltaManifest>(&raw).ok());

            let manifest_matches_chain = match &parsed_manifest {
                Some(m) => {
                    if is_baseline {
                        m.is_baseline
                    } else {
                        !m.is_baseline && m.previous_backup_name == expected_prev_name
                    }
                }
                None => false,
            };

            if meta_readonly
                || cached_logical == 0
                || cached_diff.is_none()
                || !manifest_matches_chain
            {
                rebuild_jobs.push((idx, item.path.clone(), expected_prev));
            } else if let Some(m) = parsed_manifest {
                let final_diff = if is_baseline {
                    cached_logical
                } else if m.added_paths.is_empty() && m.updated_paths.is_empty() {
                    0
                } else {
                    let mut sum_delta: u64 = 0;
                    for rel_p in m.added_paths.iter().chain(m.updated_paths.iter()) {
                        if let Ok(fm) = item.path.join(rel_p).metadata() {
                            sum_delta += fm.len();
                        }
                    }
                    sum_delta.min(cached_logical)
                };

                if cached_diff != Some(final_diff) {
                    crate::utils::write_snapshot_meta_file(
                        &diff_size_file,
                        &final_diff.to_string(),
                    );
                }

                item.logical_size_mb = cached_logical as f64 / 1_048_576.0;
                item.size_mb = final_diff as f64 / 1_048_576.0;
            }
        }

        if !rebuild_jobs.is_empty() {
            use rayon::prelude::*;
            let rebuilt: Vec<(usize, u64, u64)> = rebuild_jobs
                .par_iter()
                .map(|(idx, dir_path, prev_opt)| {
                    let (log_b, diff_b) = recompute_snapshot_metadata(dir_path, prev_opt.as_ref());
                    (*idx, log_b, diff_b)
                })
                .collect();

            for (idx, log_b, diff_b) in rebuilt {
                if let Some(item) = raw_list.get_mut(idx) {
                    item.logical_size_mb = log_b as f64 / 1_048_576.0;
                    item.size_mb = diff_b as f64 / 1_048_576.0;
                }
            }
        }

        let mut files: Vec<BackupInfo> = raw_list
            .into_iter()
            .map(|r| BackupInfo {
                name: r.name,
                size_mb: r.size_mb,
                logical_size_mb: Some(r.logical_size_mb),
            })
            .collect();

        files.sort_by(|a, b| {
            let ts_a = extract_ts(&a.name);
            let ts_b = extract_ts(&b.name);
            ts_b.cmp(&ts_a).then_with(|| b.name.cmp(&a.name))
        });

        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn collect_allowed_backup_roots(
    vault_path: &str,
    config: &WorkspaceConfig,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<PathBuf> {
    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let backups_base = vault_root.join("Backups");
    let mut roots = vec![
        backups_base.clone(),
        backups_base.join("World"),
        backups_base.join("Engine"),
        vault_root,
    ];
    if let Some(engine_dir) = crate::utils::get_engine_backups_dir(&config.live_path, vault_path) {
        roots.push(engine_dir);
    }
    let docs_base = crate::utils::resolve_effective_docs_path(config, game_schema);
    if let Some(world_dir) = crate::utils::get_world_backups_dir(&docs_base, vault_path) {
        roots.push(world_dir);
    }
    roots
}

#[tauri::command]
pub async fn delete_backup(file_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::utils::is_safe_single_filename(&file_name) {
            return Err("Invalid backup name.".into());
        }
        let config = get_saved_coordinates();
        let allowed_roots = collect_allowed_backup_roots(&config.vault_path, &config, &None);
        if let Some(path) = find_backup(&config.vault_path, &file_name) {
            crate::utils::ensure_strict_descendant_of_roots(&path, &allowed_roots)?;
            if path.is_dir() {
                let now_ms = crate::utils::current_epoch_ms();
                let purging_path = path.with_file_name(format!(".purging_{}_{}", now_ms, file_name));
                crate::utils::ensure_strict_descendant_of_roots(&purging_path, &allowed_roots)?;
                if std::fs::rename(&path, &purging_path).is_ok() {
                    std::thread::spawn(move || {
                        let _ = crate::utils::remove_backup_dir_cow_safe(&purging_path);
                    });
                } else {
                    crate::utils::remove_backup_dir_cow_safe(&path).map_err(|e| e.to_string())?;
                }
            } else {
                if let Ok(meta) = std::fs::metadata(&path) {
                    if meta.permissions().readonly() {
                        let mut perms = meta.permissions();
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
            Ok("Deleted.".into())
        } else {
            Err("Not found.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn rename_backup(old_name: String, new_name: String) -> Result<String, String> {
    if !crate::utils::is_safe_single_filename(&old_name) {
        return Err("Invalid source backup name.".into());
    }
    let config = get_saved_coordinates();
    let allowed_roots = collect_allowed_backup_roots(&config.vault_path, &config, &None);
    if let Some(old_path) = find_backup(&config.vault_path, &old_name) {
        crate::utils::ensure_strict_descendant_of_roots(&old_path, &allowed_roots)?;
        let mut final_name = new_name.trim().to_string();
        if old_path.is_file() && !final_name.ends_with(".zst") {
            final_name = format!("{}.tar.zst", final_name);
        }
        if !crate::utils::is_safe_single_filename(&final_name) {
            return Err("Invalid target backup name.".into());
        }
        let new_path = old_path.with_file_name(&final_name);
        crate::utils::ensure_strict_descendant_of_roots(&new_path, &allowed_roots)?;
        std::fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
        Ok(final_name)
    } else {
        Err("Not found.".into())
    }
}

fn find_latest_previous_backup(search_dirs: &[PathBuf], prefix: &str) -> Option<PathBuf> {
    let mut folders: Vec<PathBuf> = Vec::new();
    for dir in search_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            folders.extend(
                entries
                    .flatten()
                    .filter(|e| {
                        e.file_type().map_or(false, |ft| ft.is_dir())
                            && e.file_name().to_string_lossy().starts_with(prefix)
                    })
                    .map(|e| e.path()),
            );
        }
    }
    folders.sort_by(|a, b| {
        let name_a = a.file_name().unwrap_or_default().to_string_lossy();
        let name_b = b.file_name().unwrap_or_default().to_string_lossy();
        let ts_a = crate::utils::extract_backup_timestamp(&name_a);
        let ts_b = crate::utils::extract_backup_timestamp(&name_b);
        ts_a.cmp(&ts_b).then_with(|| {
            let ma = a
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            let mb = b
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            ma.cmp(&mb)
        })
    });
    folders.pop()
}

fn collect_removed_files_from_previous(
    previous_backup: &Option<PathBuf>,
    current_rel_set: &std::collections::HashSet<String>,
) -> Vec<BackupFile> {
    let mut removed_files = Vec::new();
    if let Some(prev) = previous_backup {
        for entry in walkdir::WalkDir::new(prev).into_iter().flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Ok(rel) = entry.path().strip_prefix(prev) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if rel_str.is_empty() || rel_str.split('/').any(|part| part.starts_with('.')) {
                    continue;
                }
                if !current_rel_set.contains(&rel_str) {
                    let len_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    removed_files.push(BackupFile {
                        path: rel_str,
                        size_mb: len_bytes as f64 / 1_048_576.0,
                        delta_status: "Removed".into(),
                    });
                }
            }
        }
    }
    removed_files
}

#[tauri::command]
pub async fn backup_universe(
    app: tauri::AppHandle,
    docs_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let game_docs_path = PathBuf::from(&docs_path);
        let backup_name = format!(
            "World_State--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        // Anchor World State backups to the same physical drive as docs_path so hardlinks never break if Vault is on a different drive
        let parent_dir = crate::utils::get_world_backups_dir(&docs_path, &config.vault_path)
            .unwrap_or_else(|| {
                PathBuf::from(&config.vault_path)
                    .join("Backups")
                    .join("World")
            });
        let backup_path = parent_dir.join(&backup_name);

        let mut search_dirs = vec![parent_dir.clone()];
        let legacy_world_dir = PathBuf::from(&config.vault_path).join("Backups").join("World");
        if legacy_world_dir != parent_dir && legacy_world_dir.exists() {
            let same_drive =
                crate::utils::are_paths_on_same_filesystem(&parent_dir, &legacy_world_dir);
            if same_drive {
                search_dirs.push(legacy_world_dir);
            }
        }

        let previous_backup = find_latest_previous_backup(&search_dirs, "World_State--");

        let _ = std::fs::create_dir_all(&backup_path);
        crate::utils::clean_stray_snapshot_meta_files(&game_docs_path);

        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();

        // Automatically recover any stranded Save Airgap left by a prior OS/app crash before snapshotting
        let _ = crate::commands::deployment::recover_stranded_airgap_if_needed(
            &game_docs_path,
            &config.vault_path,
            &game_schema,
        );
        if crate::commands::deployment::is_airgap_active_for_docs(&game_docs_path, &game_schema) {
            return Err(
                "Save Airgap Shield is currently active for a live Lab test. Conclude the Lab test first so Time Capsule snapshots your real live saves."
                    .into(),
            );
        }

        let mut targets = Vec::new();
        if let Some(schema) = &game_schema {
            if let Some(time_capsule) = &schema.time_capsule {
                for target in &time_capsule.world_state_targets {
                    let resolved = crate::game_logic::expand_env_vars(&target.path);
                    if !resolved.trim().is_empty() {
                        targets.push((target.name.clone(), game_docs_path.join(&resolved)));
                    }
                }
            }
        }
        if targets.is_empty() {
            return Err(
                "No Time Capsule world_state_targets configured in active GameSchema.".into(),
            );
        }

        let mut files_to_backup = Vec::new();
        for (_name, path) in targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(&path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Err(format!(
                "No files found to backup in path: {}",
                game_docs_path.display()
            ));
        }
        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "files_done": 0,
                "files_total": total,
                "action": "Sealing World State..."
            }),
        );

        let (total_size, diff_size, current_rel_set, added_paths, updated_paths) =
            seal_snapshot_parallel_cow(
                &app,
                &files_to_backup,
                &game_docs_path,
                &backup_path,
                &previous_backup,
                "Sealing World State...",
            );

        crate::utils::write_snapshot_meta_file(
            &backup_path.join(".size_bytes.txt"),
            &total_size.to_string(),
        );
        crate::utils::write_snapshot_meta_file(
            &backup_path.join(".diff_size_bytes.txt"),
            &diff_size.to_string(),
        );

        let removed_files =
            collect_removed_files_from_previous(&previous_backup, &current_rel_set);
        let manifest = DeltaManifest {
            previous_backup_name: previous_backup
                .as_ref()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string()),
            is_baseline: previous_backup.is_none(),
            added_paths,
            updated_paths,
            removed_files,
        };
        if let Ok(json_str) = serde_json::to_string(&manifest) {
            crate::utils::write_snapshot_meta_file(
                &backup_path.join(".delta_manifest.json"),
                &json_str,
            );
        }

        if let Some(cycles) = config.world_retention_cycles {
            crate::utils::enforce_retention_policy(&parent_dir, cycles);
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 100,
                "total": 100,
                "files_done": total,
                "files_total": total,
                "action": "World Seal Complete!"
            }),
        );

        Ok(backup_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn backup_engine_full(
    app: tauri::AppHandle,
    live_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let base_path = crate::game_logic::resolve_game_engine_root(&live_path, &game_schema);
        let backup_name = format!(
            "Engine_Core--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let parent_dir = crate::utils::get_engine_backups_dir(&live_path, &config.vault_path)
            .unwrap_or_else(|| {
                PathBuf::from(&config.vault_path)
                    .join("Backups")
                    .join("Engine")
            });

        let backup_path = parent_dir.join(&backup_name);

        let mut search_dirs = vec![parent_dir.clone()];
        let legacy_engine_dir = PathBuf::from(&config.vault_path).join("Backups").join("Engine");
        if legacy_engine_dir != parent_dir && legacy_engine_dir.exists() {
            let same_drive =
                crate::utils::are_paths_on_same_filesystem(&parent_dir, &legacy_engine_dir);
            if same_drive {
                search_dirs.push(legacy_engine_dir);
            }
        }

        let previous_backup = find_latest_previous_backup(&search_dirs, "Engine_Core--");

        let _ = std::fs::create_dir_all(&backup_path);
        crate::utils::clean_stray_snapshot_meta_files(&base_path);

        let mut targets = Vec::new();
        if let Some(schema) = &game_schema {
            if let Some(time_capsule) = &schema.time_capsule {
                for target in &time_capsule.engine_state_targets {
                    let resolved = crate::game_logic::expand_env_vars(&target.path);
                    targets.push((target.name.clone(), base_path.join(&resolved)));
                }
            }
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "action": "Scanning Engine Core..."
            }),
        );
        let mut files_to_backup = Vec::new();
        for (_name, path) in targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(&path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Err(format!(
                "No files found to backup in engine path: {}",
                base_path.display()
            ));
        }
        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 0,
                "total": 100,
                "files_done": 0,
                "files_total": total,
                "action": "Sealing Engine Core..."
            }),
        );

        let (total_size, diff_size, current_rel_set, added_paths, updated_paths) =
            seal_snapshot_parallel_cow(
                &app,
                &files_to_backup,
                &base_path,
                &backup_path,
                &previous_backup,
                "Sealing Engine Core...",
            );

        crate::utils::write_snapshot_meta_file(
            &backup_path.join(".size_bytes.txt"),
            &total_size.to_string(),
        );
        crate::utils::write_snapshot_meta_file(
            &backup_path.join(".diff_size_bytes.txt"),
            &diff_size.to_string(),
        );

        let removed_files =
            collect_removed_files_from_previous(&previous_backup, &current_rel_set);
        let manifest = DeltaManifest {
            previous_backup_name: previous_backup
                .as_ref()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string()),
            is_baseline: previous_backup.is_none(),
            added_paths,
            updated_paths,
            removed_files,
        };
        if let Ok(json_str) = serde_json::to_string(&manifest) {
            crate::utils::write_snapshot_meta_file(
                &backup_path.join(".delta_manifest.json"),
                &json_str,
            );
        }

        if let Some(cycles) = config.engine_retention_cycles {
            crate::utils::enforce_retention_policy(&parent_dir, cycles);
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 100,
                "total": 100,
                "files_done": total,
                "files_total": total,
                "action": "Engine Core Seal Complete!"
            }),
        );

        Ok(backup_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn copy_file_with_progress<F>(
    src: &Path,
    dest: &Path,
    src_len: u64,
    src_mtime: Option<std::time::SystemTime>,
    set_readonly: bool,
    mut on_chunk: F,
) -> std::io::Result<()>
where
    F: FnMut(u64),
{
    use std::io::{Read, Write};

    // Strict Copy-on-Write (Break-Before-Write): always unlink dest first so we never
    // overwrite a shared hardlink in-place.
    if dest.exists() {
        if let Ok(dm) = std::fs::metadata(dest) {
            if dm.permissions().readonly() {
                let mut p = dm.permissions();
                p.set_readonly(false);
                let _ = std::fs::set_permissions(dest, p);
            }
        }
        let _ = std::fs::remove_file(dest);
    }

    const STREAM_THRESHOLD: u64 = 4 * 1024 * 1024; // 4 MB
    if src_len < STREAM_THRESHOLD {
        std::fs::copy(src, dest)?;
        if let Some(mtime) = src_mtime {
            let _ = filetime::set_file_mtime(dest, filetime::FileTime::from_system_time(mtime));
        }
        if let Ok(dm) = std::fs::metadata(dest) {
            if dm.permissions().readonly() != set_readonly {
                let mut p = dm.permissions();
                p.set_readonly(set_readonly);
                let _ = std::fs::set_permissions(dest, p);
            }
        }
        on_chunk(src_len);
        return Ok(());
    }

    let mut src_file = std::fs::File::open(src)?;
    let mut dest_file = std::fs::File::create(dest)?;
    let mut buf = vec![0u8; 4 * 1024 * 1024]; // 4 MB streaming buffer
    let mut copied: u64 = 0;

    loop {
        let n = src_file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dest_file.write_all(&buf[..n])?;
        copied += n as u64;
        on_chunk(n as u64);
    }

    if copied < src_len {
        on_chunk(src_len - copied);
    }

    let _ = dest_file.flush();
    if let Some(mtime) = src_mtime {
        let _ = dest_file.set_modified(mtime);
    }
    drop(dest_file);

    if let Some(mtime) = src_mtime {
        let _ = filetime::set_file_mtime(dest, filetime::FileTime::from_system_time(mtime));
    }

    if let Ok(dm) = std::fs::metadata(dest) {
        if dm.permissions().readonly() != set_readonly {
            let mut p = dm.permissions();
            p.set_readonly(set_readonly);
            let _ = std::fs::set_permissions(dest, p);
        }
    }

    Ok(())
}

fn seal_snapshot_parallel_cow(
    app: &tauri::AppHandle,
    files_to_backup: &[PathBuf],
    source_root: &Path,
    backup_path: &Path,
    previous_backup: &Option<PathBuf>,
    action_label: &str,
) -> (
    u64,
    u64,
    std::collections::HashSet<String>,
    Vec<String>,
    Vec<String>,
) {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    let total = files_to_backup.len();
    let prefix_lower = source_root.to_string_lossy().to_lowercase();

    struct FileJob {
        src_path: PathBuf,
        stripped: PathBuf,
        rel_norm: String,
        dest_path: PathBuf,
    }

    struct ClassifiedJob {
        src_path: PathBuf,
        rel_norm: String,
        dest_path: PathBuf,
        prev_file: Option<PathBuf>,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
        existed_in_prev: bool,
        can_hardlink: bool,
    }

    let mut current_rel_set = std::collections::HashSet::with_capacity(total);
    let mut unique_dirs = std::collections::HashSet::new();
    let mut jobs = Vec::with_capacity(total);

    for file_path in files_to_backup {
        let stripped = if let Ok(rel) = file_path.strip_prefix(source_root) {
            rel.to_path_buf()
        } else {
            let full_str = file_path.to_string_lossy();
            let path_lower = full_str.to_lowercase();
            if path_lower.starts_with(&prefix_lower) {
                let stripped_str = &full_str[prefix_lower.len()..];
                let stripped_str = stripped_str.trim_start_matches(|c| c == '/' || c == '\\');
                PathBuf::from(stripped_str)
            } else {
                PathBuf::from(file_path.file_name().unwrap_or_default())
            }
        };

        let rel_norm = stripped.to_string_lossy().replace('\\', "/");
        if rel_norm.is_empty() || rel_norm.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        current_rel_set.insert(rel_norm.clone());

        let dest_path = backup_path.join(&stripped);
        if let Some(parent) = dest_path.parent() {
            unique_dirs.insert(parent.to_path_buf());
        }

        jobs.push(FileJob {
            src_path: file_path.clone(),
            stripped,
            rel_norm,
            dest_path,
        });
    }

    // Pre-create all unique destination directories once up front
    for dir in unique_dirs {
        let _ = std::fs::create_dir_all(&dir);
    }

    // Fast parallel metadata pre-pass (~15-30ms) to classify hardlink vs physical copy
    // and compute exact byte weights so large multi-GB files never freeze the progress bar at 99%.
    let total_size_atomic = AtomicU64::new(0);
    let planned_copy_bytes_atomic = AtomicU64::new(0);

    let classified_jobs: Vec<ClassifiedJob> = jobs
        .into_par_iter()
        .map(|job| {
            let src_meta = job.src_path.metadata().ok();
            let src_len = src_meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let src_mtime = src_meta.as_ref().and_then(|m| m.modified().ok());
            total_size_atomic.fetch_add(src_len, Ordering::Relaxed);

            let mut existed_in_prev = false;
            let mut can_hardlink = false;
            let mut prev_file_opt = None;

            if let Some(prev) = previous_backup {
                let prev_file = prev.join(&job.stripped);
                if let Ok(prev_meta) = prev_file.metadata() {
                    if prev_meta.is_file() {
                        existed_in_prev = true;
                        if src_len == prev_meta.len() && src_mtime == prev_meta.modified().ok() {
                            can_hardlink = true;
                        }
                    }
                }
                prev_file_opt = Some(prev_file);
            }

            if !can_hardlink {
                planned_copy_bytes_atomic.fetch_add(src_len, Ordering::Relaxed);
            }

            ClassifiedJob {
                src_path: job.src_path,
                rel_norm: job.rel_norm,
                dest_path: job.dest_path,
                prev_file: prev_file_opt,
                src_len,
                src_mtime,
                existed_in_prev,
                can_hardlink,
            }
        })
        .collect();

    const FILE_OP_WEIGHT: u64 = 128 * 1024; // 128 KB baseline weight per file operation
    let planned_copy_bytes = planned_copy_bytes_atomic.load(Ordering::Relaxed);
    let total_work = ((total as u64).saturating_mul(FILE_OP_WEIGHT))
        .saturating_add(planned_copy_bytes)
        .max(1);

    // Separate heavy physical copy jobs (>= 4 MB) from fast hardlink / small copy jobs.
    // Scheduling heavy copy jobs with `.with_max_len(1)` sorted largest-first ensures
    // multi-GB engine archives immediately get dedicated Rayon worker threads at t=0ms
    // instead of sitting in the same chunk.
    let (mut heavy_copy_jobs, regular_jobs): (Vec<ClassifiedJob>, Vec<ClassifiedJob>) =
        classified_jobs
            .into_iter()
            .partition(|j| !j.can_hardlink && j.src_len >= 4 * 1024 * 1024);

    heavy_copy_jobs.sort_by(|a, b| b.src_len.cmp(&a.src_len));

    let diff_size_atomic = AtomicU64::new(0);
    let done_atomic = AtomicUsize::new(0);
    let work_done_atomic = AtomicU64::new(0);
    let last_emit = std::sync::Mutex::new(std::time::Instant::now());
    let added_mutex = std::sync::Mutex::new(Vec::new());
    let updated_mutex = std::sync::Mutex::new(Vec::new());

    let emit_progress = |current_file: &str, force: bool| {
        let should_emit = if force {
            true
        } else if let Ok(mut guard) = last_emit.try_lock() {
            if guard.elapsed() > std::time::Duration::from_millis(40) {
                *guard = std::time::Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        };

        if should_emit {
            let done = done_atomic.load(Ordering::Relaxed);
            let work_done = work_done_atomic.load(Ordering::Relaxed).min(total_work);
            let work_ratio = (work_done as f64 / total_work as f64).clamp(0.0, 1.0);
            let current_pct = if total > 0 {
                ((work_ratio * 99.0).round() as usize).clamp(1, 99)
            } else {
                0
            };
            // Blend displayed file counter with byte-weighted work progress while large files are streaming
            // so the counter never appears stuck near 99% while copying multi-GB engine archives.
            let display_files_done = if planned_copy_bytes > 0 && done < total {
                ((work_ratio * total as f64).floor() as usize).clamp(done.min(1), total.saturating_sub(1))
            } else {
                done
            };
            let _ = app.emit(
                "backup-progress",
                serde_json::json!({
                    "current": current_pct,
                    "total": 100,
                    "files_done": display_files_done,
                    "files_total": total,
                    "current_file": current_file,
                    "action": action_label
                }),
            );
        }
    };

    let process_job = |job: &ClassifiedJob| {
        let mut linked = false;

        if job.can_hardlink {
            if let Some(ref prev_file) = job.prev_file {
                if std::fs::hard_link(prev_file, &job.dest_path).is_ok() {
                    linked = true;
                }
            }
        }

        if !linked {
            let copy_res = copy_file_with_progress(
                &job.src_path,
                &job.dest_path,
                job.src_len,
                job.src_mtime,
                true,
                |chunk_bytes| {
                    if job.can_hardlink {
                        // Fallback if hard_link unexpectedly failed: don't exceed total_work
                    } else {
                        work_done_atomic.fetch_add(chunk_bytes, Ordering::Relaxed);
                    }
                    emit_progress(&job.rel_norm, false);
                },
            );
            if copy_res.is_err() && !job.can_hardlink {
                // Ensure work_done accounts for planned bytes even on error
                work_done_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            }

            diff_size_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            if previous_backup.is_some() {
                if job.existed_in_prev {
                    if let Ok(mut u) = updated_mutex.lock() {
                        u.push(job.rel_norm.clone());
                    }
                } else if let Ok(mut a) = added_mutex.lock() {
                    a.push(job.rel_norm.clone());
                }
            }
        }

        work_done_atomic.fetch_add(FILE_OP_WEIGHT, Ordering::Relaxed);
        let done = done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        emit_progress(&job.rel_norm, done == 1 || done == total);
    };

    rayon::join(
        || {
            heavy_copy_jobs
                .par_iter()
                .with_max_len(1)
                .for_each(process_job);
        },
        || {
            regular_jobs.par_iter().for_each(process_job);
        },
    );

    let added_paths = added_mutex.into_inner().unwrap_or_default();
    let updated_paths = updated_mutex.into_inner().unwrap_or_default();

    (
        total_size_atomic.load(Ordering::Relaxed),
        diff_size_atomic.load(Ordering::Relaxed),
        current_rel_set,
        added_paths,
        updated_paths,
    )
}

fn prune_extraneous_target_entries(arc_dir: &Path, target_dir: &Path) {
    if !target_dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            let arc_path = arc_dir.join(&file_name);
            let target_path = e.path();
            if !arc_path.exists() {
                if target_path.is_dir() {
                    let _ = crate::utils::remove_backup_dir_cow_safe(&target_path);
                } else {
                    if let Ok(meta) = std::fs::metadata(&target_path) {
                        if meta.permissions().readonly() {
                            let mut perms = meta.permissions();
                            perms.set_readonly(false);
                            let _ = std::fs::set_permissions(&target_path, perms);
                        }
                    }
                    let _ = std::fs::remove_file(&target_path);
                }
            } else if target_path.is_dir() && arc_path.is_dir() {
                prune_extraneous_target_entries(&arc_path, &target_path);
            }
        }
    }
}

fn restore_snapshot_parallel_cow(
    app: &tauri::AppHandle,
    arc: &Path,
    target: &Path,
    action_label: &str,
) -> Result<(), String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    if !target.exists() {
        std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
    }

    // Remove any stray internal snapshot metadata files that an older restore may have copied into target
    for internal_meta in [".size_bytes.txt", ".diff_size_bytes.txt", ".delta_manifest.json"] {
        let stray = target.join(internal_meta);
        if stray.is_file() {
            if let Ok(m) = std::fs::metadata(&stray) {
                if m.permissions().readonly() {
                    let mut p = m.permissions();
                    p.set_readonly(false);
                    let _ = std::fs::set_permissions(&stray, p);
                }
            }
            let _ = std::fs::remove_file(&stray);
        }
    }

    // Prune extraneous files/folders inside each top-level directory present in the snapshot
    if let Ok(entries) = std::fs::read_dir(arc) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            if file_name.to_string_lossy().starts_with('.') {
                continue;
            }
            let arc_sub = e.path();
            let target_sub = target.join(&file_name);
            if arc_sub.is_dir() {
                prune_extraneous_target_entries(&arc_sub, &target_sub);
            }
        }
    }

    struct RawRestoreItem {
        arc_path: PathBuf,
        target_path: PathBuf,
        rel_norm: String,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
    }

    struct ClassifiedRestoreJob {
        arc_path: PathBuf,
        target_path: PathBuf,
        rel_norm: String,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
        needs_copy: bool,
        needs_writable_fix: bool,
    }

    let mut raw_items = Vec::new();
    let mut unique_dirs = std::collections::HashSet::new();

    for entry in walkdir::WalkDir::new(arc).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let arc_path = entry.path().to_path_buf();
        let Ok(rel) = arc_path.strip_prefix(arc) else {
            continue;
        };
        let rel_norm = rel.to_string_lossy().replace('\\', "/");
        if rel_norm.split('/').any(|part| part.starts_with('.')) {
            continue;
        }

        let target_path = target.join(rel);
        if let Some(parent) = target_path.parent() {
            unique_dirs.insert(parent.to_path_buf());
        }

        let meta = entry.metadata().ok();
        let src_len = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let src_mtime = meta.as_ref().and_then(|m| m.modified().ok());

        raw_items.push(RawRestoreItem {
            arc_path,
            target_path,
            rel_norm,
            src_len,
            src_mtime,
        });
    }

    for dir in unique_dirs {
        let _ = std::fs::create_dir_all(&dir);
    }

    let total = raw_items.len();
    let planned_copy_bytes_atomic = AtomicU64::new(0);

    let classified_jobs: Vec<ClassifiedRestoreJob> = raw_items
        .into_par_iter()
        .map(|item| {
            let mut needs_copy = true;
            let mut needs_writable_fix = false;

            if let Ok(target_meta) = item.target_path.metadata() {
                if target_meta.is_file() {
                    if item.src_len == target_meta.len()
                        && item.src_mtime == target_meta.modified().ok()
                    {
                        needs_copy = false;
                        if target_meta.permissions().readonly() {
                            needs_writable_fix = true;
                        }
                    }
                }
            }

            if needs_copy {
                planned_copy_bytes_atomic.fetch_add(item.src_len, Ordering::Relaxed);
            }

            ClassifiedRestoreJob {
                arc_path: item.arc_path,
                target_path: item.target_path,
                rel_norm: item.rel_norm,
                src_len: item.src_len,
                src_mtime: item.src_mtime,
                needs_copy,
                needs_writable_fix,
            }
        })
        .collect();

    const FILE_OP_WEIGHT: u64 = 128 * 1024;
    let planned_copy_bytes = planned_copy_bytes_atomic.load(Ordering::Relaxed);
    let total_work = ((total as u64).saturating_mul(FILE_OP_WEIGHT))
        .saturating_add(planned_copy_bytes)
        .max(1);

    let (mut heavy_copy_jobs, regular_jobs): (
        Vec<ClassifiedRestoreJob>,
        Vec<ClassifiedRestoreJob>,
    ) = classified_jobs
        .into_iter()
        .partition(|j| j.needs_copy && j.src_len >= 4 * 1024 * 1024);

    heavy_copy_jobs.sort_by(|a, b| b.src_len.cmp(&a.src_len));

    let done_atomic = AtomicUsize::new(0);
    let work_done_atomic = AtomicU64::new(0);
    let last_emit = std::sync::Mutex::new(std::time::Instant::now());

    let emit_progress = |current_file: &str, force: bool| {
        let should_emit = if force {
            true
        } else if let Ok(mut guard) = last_emit.try_lock() {
            if guard.elapsed() > std::time::Duration::from_millis(40) {
                *guard = std::time::Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        };

        if should_emit {
            let done = done_atomic.load(Ordering::Relaxed);
            let work_done = work_done_atomic.load(Ordering::Relaxed).min(total_work);
            let work_ratio = (work_done as f64 / total_work as f64).clamp(0.0, 1.0);
            let current_pct = if total > 0 {
                ((work_ratio * 99.0).round() as usize).clamp(1, 99)
            } else {
                0
            };
            let display_files_done = if planned_copy_bytes > 0 && done < total {
                ((work_ratio * total as f64).floor() as usize).clamp(done.min(1), total.saturating_sub(1))
            } else {
                done
            };
            let _ = app.emit(
                "backup-progress",
                serde_json::json!({
                    "current": current_pct,
                    "total": 100,
                    "files_done": display_files_done,
                    "files_total": total,
                    "current_file": current_file,
                    "action": action_label
                }),
            );
        }
    };

    let process_job = |job: &ClassifiedRestoreJob| {
        if job.needs_copy {
            let res = copy_file_with_progress(
                &job.arc_path,
                &job.target_path,
                job.src_len,
                job.src_mtime,
                false,
                |chunk_bytes| {
                    work_done_atomic.fetch_add(chunk_bytes, Ordering::Relaxed);
                    emit_progress(&job.rel_norm, false);
                },
            );
            if res.is_err() {
                work_done_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            }
        } else if job.needs_writable_fix {
            if let Ok(meta) = std::fs::metadata(&job.target_path) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&job.target_path, perms);
                }
            }
        }

        work_done_atomic.fetch_add(FILE_OP_WEIGHT, Ordering::Relaxed);
        let done = done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        emit_progress(&job.rel_norm, done == 1 || done == total);
    };

    rayon::join(
        || {
            heavy_copy_jobs
                .par_iter()
                .with_max_len(1)
                .for_each(process_job);
        },
        || {
            regular_jobs.par_iter().for_each(process_job);
        },
    );

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BackupFile {
    pub path: String,
    pub size_mb: f64,
    #[serde(default)]
    pub delta_status: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct DeltaManifest {
    pub previous_backup_name: Option<String>,
    pub is_baseline: bool,
    pub added_paths: Vec<String>,
    pub updated_paths: Vec<String>,
    pub removed_files: Vec<BackupFile>,
}

#[derive(Serialize, Deserialize)]
pub struct BackupInspectionResult {
    pub files: Vec<BackupFile>,
    pub logical_size_bytes: u64,
    pub diff_size_bytes: u64,
    pub raw_diff_size_bytes: u64,
    pub location: String,
    pub previous_backup_name: Option<String>,
    pub is_baseline: bool,
    pub removed_from_previous: Vec<BackupFile>,
}

#[derive(Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub status: String,
    pub size_mb: f64,
    pub live_size_mb: Option<f64>,
}

#[tauri::command]
pub async fn get_backup_contents(
    vault_path: String,
    backup_name: String,
) -> Result<BackupInspectionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let backup_dir = match crate::utils::find_backup(&vault_path, &backup_name) {
            Some(dir) => dir,
            None => return Err("Backup not found".into()),
        };

        let mut files = Vec::new();
        let mut raw_entries: Vec<(PathBuf, String, u64, Option<std::time::SystemTime>)> = Vec::new();
        let mut total_scanned_bytes: u64 = 0;

        for entry in walkdir::WalkDir::new(&backup_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(rel) = entry.path().strip_prefix(&backup_dir) else {
                continue;
            };
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if rel_str.split('/').any(|part| part.starts_with('.')) {
                continue;
            }

            let meta = entry.metadata().ok();
            let len_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime = meta.as_ref().and_then(|m| m.modified().ok());
            total_scanned_bytes += len_bytes;
            let size = len_bytes as f64 / 1_048_576.0;
            files.push(BackupFile {
                path: rel_str.clone(),
                size_mb: size,
                delta_status: "Deduplicated".into(),
            });
            raw_entries.push((rel.to_path_buf(), rel_str, len_bytes, mtime));
        }

        files.sort_by(|a, b| a.path.cmp(&b.path));

        let size_file = backup_dir.join(".size_bytes.txt");
        let diff_size_file = backup_dir.join(".diff_size_bytes.txt");
        let manifest_path = backup_dir.join(".delta_manifest.json");

        let meta_readonly = std::fs::metadata(&size_file)
            .map(|m| m.permissions().readonly())
            .unwrap_or(false)
            || std::fs::metadata(&diff_size_file)
                .map(|m| m.permissions().readonly())
                .unwrap_or(false)
            || std::fs::metadata(&manifest_path)
                .map(|m| m.permissions().readonly())
                .unwrap_or(false);

        let cached_logical_size = std::fs::read_to_string(&size_file)
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or(0);
        let logical_size = if total_scanned_bytes > 0 {
            total_scanned_bytes
        } else {
            cached_logical_size
        };

        // Find the immediately preceding snapshot of the same prefix (World_State or Engine_Core)
        let prefix = if backup_name.starts_with("World_State") {
            Some("World_State")
        } else if backup_name.starts_with("Engine_Core") {
            Some("Engine_Core")
        } else {
            None
        };

        let mut prev_backup_entry: Option<(u64, String, PathBuf)> = None;
        if let Some(pfx) = prefix {
            let current_ts = crate::utils::extract_backup_timestamp(&backup_name);
            let mut candidate_dirs = Vec::new();
            if let Some(parent) = backup_dir.parent() {
                candidate_dirs.push(parent.to_path_buf());
            }
            let legacy_sub = if pfx == "World_State" { "World" } else { "Engine" };
            let legacy_dir = PathBuf::from(&vault_path).join("Backups").join(legacy_sub);
            if legacy_dir.exists() && !candidate_dirs.contains(&legacy_dir) {
                candidate_dirs.push(legacy_dir);
            }
            for dir in candidate_dirs {
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with(pfx) && name != backup_name && entry.path().is_dir() {
                            let ts = crate::utils::extract_backup_timestamp(&name);
                            let is_older = (ts > 0 && current_ts > 0 && ts < current_ts)
                                || (ts == current_ts && name < backup_name);
                            if is_older {
                                match &prev_backup_entry {
                                    None => {
                                        prev_backup_entry = Some((ts, name, entry.path()));
                                    }
                                    Some((best_ts, best_name, _)) => {
                                        if ts > *best_ts || (ts == *best_ts && name > *best_name) {
                                            prev_backup_entry = Some((ts, name, entry.path()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let is_baseline = prev_backup_entry.is_none();
        let prev_name = prev_backup_entry.as_ref().map(|(_, n, _)| n.clone());

        let mut loaded_manifest: Option<DeltaManifest> = None;
        if !meta_readonly
            && cached_logical_size == logical_size
            && manifest_path.exists()
        {
            if let Ok(raw_json) = std::fs::read_to_string(&manifest_path) {
                if let Ok(parsed) = serde_json::from_str::<DeltaManifest>(&raw_json) {
                    if (is_baseline && parsed.is_baseline)
                        || (!is_baseline && parsed.previous_backup_name == prev_name)
                    {
                        loaded_manifest = Some(parsed);
                    }
                }
            }
        }

        let manifest = if let Some(m) = loaded_manifest {
            m
        } else if let Some((_, ref p_name, ref prev_dir)) = prev_backup_entry {
            let mut added_paths = Vec::new();
            let mut updated_paths = Vec::new();
            let mut current_rel_set = std::collections::HashSet::with_capacity(raw_entries.len());

            for (rel_path, rel_str, cur_len, cur_mtime) in &raw_entries {
                current_rel_set.insert(rel_str.clone());
                let prev_file = prev_dir.join(rel_path);
                if let Ok(prev_meta) = prev_file.metadata() {
                    if prev_meta.is_file() {
                        if *cur_len != prev_meta.len() || *cur_mtime != prev_meta.modified().ok() {
                            updated_paths.push(rel_str.clone());
                        }
                    } else {
                        added_paths.push(rel_str.clone());
                    }
                } else {
                    added_paths.push(rel_str.clone());
                }
            }

            let removed_files =
                collect_removed_files_from_previous(&Some(prev_dir.clone()), &current_rel_set);

            let computed = DeltaManifest {
                previous_backup_name: Some(p_name.clone()),
                is_baseline: false,
                added_paths,
                updated_paths,
                removed_files,
            };
            if let Ok(json_str) = serde_json::to_string(&computed) {
                crate::utils::write_snapshot_meta_file(&manifest_path, &json_str);
            }
            computed
        } else {
            let computed = DeltaManifest {
                previous_backup_name: None,
                is_baseline: true,
                added_paths: Vec::new(),
                updated_paths: Vec::new(),
                removed_files: Vec::new(),
            };
            if let Ok(json_str) = serde_json::to_string(&computed) {
                crate::utils::write_snapshot_meta_file(&manifest_path, &json_str);
            }
            computed
        };

        let added_set: std::collections::HashSet<&str> =
            manifest.added_paths.iter().map(|s| s.as_str()).collect();
        let updated_set: std::collections::HashSet<&str> =
            manifest.updated_paths.iter().map(|s| s.as_str()).collect();

        let mut computed_written_bytes: u64 = 0;
        for (idx, f) in files.iter_mut().enumerate() {
            let file_bytes = raw_entries
                .get(idx)
                .map(|(_, _, b, _)| *b)
                .unwrap_or_else(|| (f.size_mb * 1_048_576.0).round() as u64);
            if is_baseline {
                f.delta_status = "Baseline".into();
                computed_written_bytes += file_bytes;
            } else if added_set.contains(f.path.as_str()) {
                f.delta_status = "Added".into();
                computed_written_bytes += file_bytes;
            } else if updated_set.contains(f.path.as_str()) {
                f.delta_status = "Updated".into();
                computed_written_bytes += file_bytes;
            } else {
                f.delta_status = "Deduplicated".into();
            }
        }

        let effective_raw_diff = if is_baseline {
            logical_size
        } else {
            computed_written_bytes.min(logical_size)
        };

        if cached_logical_size != logical_size || meta_readonly {
            crate::utils::write_snapshot_meta_file(&size_file, &logical_size.to_string());
        }
        let cached_diff_size = std::fs::read_to_string(&diff_size_file)
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok());
        if cached_diff_size != Some(effective_raw_diff) || meta_readonly {
            crate::utils::write_snapshot_meta_file(
                &diff_size_file,
                &effective_raw_diff.to_string(),
            );
        }

        Ok(BackupInspectionResult {
            files,
            logical_size_bytes: logical_size,
            diff_size_bytes: if is_baseline { logical_size } else { effective_raw_diff },
            raw_diff_size_bytes: effective_raw_diff,
            location: backup_dir.to_string_lossy().to_string(),
            previous_backup_name: prev_name,
            is_baseline,
            removed_from_previous: manifest.removed_files,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extract_backup_file(
    vault_path: String,
    docs_path: String,
    backup_name: String,
    file_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let parsed_rel = Path::new(&file_path);
        if file_path.trim().is_empty()
            || !parsed_rel
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Invalid backup file path.".into());
        }

        let backup_dir = match crate::utils::find_backup(&vault_path, &backup_name) {
            Some(dir) => dir,
            None => return Err("Backup not found".into()),
        };
        let config = get_saved_coordinates();
        let allowed_backup_roots =
            collect_allowed_backup_roots(&vault_path, &config, &game_schema);
        crate::utils::ensure_strict_descendant_of_roots(&backup_dir, &allowed_backup_roots)?;

        let src_file = backup_dir.join(&file_path);
        if !src_file.exists() {
            return Err("File not found in backup".into());
        }
        crate::utils::ensure_strict_descendant_of_roots(
            &src_file,
            std::slice::from_ref(&backup_dir),
        )?;

        let target_root = if backup_name.starts_with("Engine_Core") {
            crate::game_logic::resolve_game_engine_root(&config.live_path, &game_schema)
        } else {
            PathBuf::from(&docs_path)
        };
        if !crate::utils::is_safe_user_file_path(&target_root) {
            return Err("Blocked: Refusing to extract into a protected system path.".into());
        }

        let dest_file = target_root.join(&file_path);
        crate::utils::ensure_strict_descendant_of_roots(
            &dest_file,
            std::slice::from_ref(&target_root),
        )?;
        if !crate::utils::is_safe_user_file_path(&dest_file) {
            return Err("Blocked: Refusing to overwrite a protected system file.".into());
        }
        if let Some(parent_dir) = dest_file.parent() {
            let _ = std::fs::create_dir_all(parent_dir);
        }

        // Strict Copy-on-Write (Break-Before-Write): unlink dest_file first so we never overwrite a shared hardlink in-place
        if dest_file.exists() {
            if let Ok(meta) = std::fs::metadata(&dest_file) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&dest_file, perms);
                }
            }
            let _ = std::fs::remove_file(&dest_file);
        }

        std::fs::copy(&src_file, &dest_file).map_err(|e| e.to_string())?;
        if let Ok(meta) = std::fs::metadata(&dest_file) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(&dest_file, perms);
            }
        }
        Ok("Success".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn diff_backup(
    vault_path: String,
    docs_path: String,
    backup_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiffEntry>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        use rayon::prelude::*;

        let backup_dir = match crate::utils::find_backup(&vault_path, &backup_name) {
            Some(dir) => dir,
            None => return Err("Backup not found".into()),
        };
        let config = get_saved_coordinates();

        let target_root = if backup_name.starts_with("Engine_Core") {
            crate::game_logic::resolve_game_engine_root(&config.live_path, &game_schema)
        } else {
            PathBuf::from(&docs_path)
        };

        let mut backup_items: Vec<(PathBuf, String, u64, Option<std::time::SystemTime>)> =
            Vec::new();
        let mut checked_lower = std::collections::HashSet::new();

        for entry in walkdir::WalkDir::new(&backup_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(rel) = entry.path().strip_prefix(&backup_dir) else {
                continue;
            };
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if rel_str.split('/').any(|part| part.starts_with('.')) {
                continue;
            }

            checked_lower.insert(rel_str.to_lowercase());
            let b_meta = entry.metadata().ok();
            let b_len = b_meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let b_mtime = b_meta.as_ref().and_then(|m| m.modified().ok());
            backup_items.push((rel.to_path_buf(), rel_str, b_len, b_mtime));
        }

        let mut diffs: Vec<DiffEntry> = backup_items
            .into_par_iter()
            .filter_map(|(rel, rel_str, b_len, b_mtime)| {
                let b_size_mb = b_len as f64 / 1_048_576.0;
                let target_file = target_root.join(&rel);
                match std::fs::metadata(&target_file) {
                    Ok(t_meta) if t_meta.is_file() => {
                        let t_size_mb = Some(t_meta.len() as f64 / 1_048_576.0);
                        let status = if b_len != t_meta.len() || b_mtime != t_meta.modified().ok() {
                            "Modified"
                        } else {
                            "Identical"
                        };
                        Some(DiffEntry {
                            path: rel_str,
                            status: status.into(),
                            size_mb: b_size_mb,
                            live_size_mb: t_size_mb,
                        })
                    }
                    _ => Some(DiffEntry {
                        path: rel_str,
                        status: "Missing in Current".into(),
                        size_mb: b_size_mb,
                        live_size_mb: None,
                    }),
                }
            })
            .collect();

        // For World State backups, also detect new files in live world_state_targets that did not exist when this snapshot was sealed
        if !backup_name.starts_with("Engine_Core") {
            let mut sub_dirs: Vec<String> = Vec::new();
            if let Some(schema) = &game_schema {
                if let Some(tc) = &schema.time_capsule {
                    for target in &tc.world_state_targets {
                        let expanded = crate::game_logic::expand_env_vars(&target.path);
                        if !expanded.trim().is_empty() {
                            sub_dirs.push(expanded);
                        }
                    }
                }
            }

            let mut scanned_dirs = std::collections::HashSet::new();
            for sub in &sub_dirs {
                let live_sub = target_root.join(sub);
                if live_sub.exists() {
                    let canon = live_sub
                        .canonicalize()
                        .unwrap_or_else(|_| live_sub.clone())
                        .to_string_lossy()
                        .to_lowercase();
                    if scanned_dirs.insert(canon) {
                        for entry in walkdir::WalkDir::new(&live_sub)
                            .into_iter()
                            .filter_map(|e| e.ok())
                        {
                            if !entry.file_type().is_file() {
                                continue;
                            }
                            if let Ok(rel) = entry.path().strip_prefix(&target_root) {
                                let rel_str = rel.to_string_lossy().replace('\\', "/");
                                if rel_str.split('/').any(|part| part.starts_with('.')) {
                                    continue;
                                }
                                if checked_lower.insert(rel_str.to_lowercase()) {
                                    let l_size_mb = entry
                                        .metadata()
                                        .map(|m| m.len() as f64 / 1_048_576.0)
                                        .unwrap_or(0.0);
                                    diffs.push(DiffEntry {
                                        path: rel_str,
                                        status: "Added in Current".into(),
                                        size_mb: l_size_mb,
                                        live_size_mb: Some(l_size_mb),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        diffs.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(diffs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_game_data(
    app: tauri::AppHandle,
    docs_path: String,
    live_path: String,
    backup_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let arc =
            find_backup(&config.vault_path, &backup_name).ok_or("Backup not found in Vault")?;

        let target = if backup_name.contains("Engine") {
            crate::game_logic::resolve_game_engine_root(&live_path, &game_schema)
        } else {
            PathBuf::from(docs_path)
        };
        if !crate::utils::is_safe_user_file_path(&target) {
            return Err("Blocked: Refusing to restore into a protected system path.".into());
        }
        if !backup_name.contains("Engine") {
            let _ = crate::commands::deployment::recover_stranded_airgap_if_needed(
                &target,
                &config.vault_path,
                &game_schema,
            );
            if crate::commands::deployment::is_airgap_active_for_docs(&target, &game_schema) {
                return Err(
                    "Cannot restore World State while a Homestead Lab Save Airgap session is active. Conclude the Lab test first."
                        .into(),
                );
            }
        }
        let allowed_backup_roots =
            collect_allowed_backup_roots(&config.vault_path, &config, &game_schema);
        crate::utils::ensure_strict_descendant_of_roots(&arc, &allowed_backup_roots)?;

        let mut final_total: usize = 0;

        if arc.is_dir() {
            let _ = app.emit(
                "backup-progress",
                serde_json::json!({
                    "current": 0,
                    "total": 100,
                    "action": "Scanning Vault Data..."
                }),
            );

            let action_str: String = if backup_name.contains("Engine") {
                "Restoring Engine Core...".into()
            } else {
                "Restoring World State...".into()
            };

            restore_snapshot_parallel_cow(&app, &arc, &target, &action_str)?;

            final_total = walkdir::WalkDir::new(&arc)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path()
                            .strip_prefix(&arc)
                            .map(|r| !r.to_string_lossy().replace('\\', "/").split('/').any(|p| p.starts_with('.')))
                            .unwrap_or(false)
                })
                .count();
        } else {
            // Legacy tar.zst
            if !backup_name.contains("Engine") {
                let mut targets_to_clear: Vec<String> = Vec::new();
                if let Some(schema) = &game_schema {
                    if let Some(tc) = &schema.time_capsule {
                        for t in &tc.world_state_targets {
                            let expanded = crate::game_logic::expand_env_vars(&t.path);
                            if !expanded.trim().is_empty() {
                                targets_to_clear.push(expanded);
                            }
                        }
                    }
                }
                for sub in targets_to_clear {
                    let sub_path = target.join(sub);
                    if crate::utils::ensure_strict_descendant_of_roots(
                        &sub_path,
                        std::slice::from_ref(&target),
                    )
                    .is_ok()
                    {
                        let _ = std::fs::remove_dir_all(sub_path);
                    }
                }
            }

            let tar_file = std::fs::File::open(&arc).map_err(|e| e.to_string())?;
            let total_size = tar_file.metadata().map(|m| m.len() as usize).unwrap_or(1);

            struct ProgressReader<R> {
                inner: R,
                current: usize,
                total: usize,
                app: tauri::AppHandle,
                action: String,
                last_emit: std::time::Instant,
            }

            impl<R: std::io::Read> std::io::Read for ProgressReader<R> {
                fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                    let n = self.inner.read(buf)?;
                    self.current += n;
                    if self.last_emit.elapsed() > std::time::Duration::from_millis(50)
                        || self.current >= self.total
                        || n == 0
                    {
                        let mut current_pct = if self.total > 0 {
                            ((self.current as f64 / self.total as f64) * 100.0) as usize
                        } else {
                            0
                        };
                        if current_pct > 100 {
                            current_pct = 100;
                        }
                        let _ = self.app.emit(
                            "backup-progress",
                            serde_json::json!({
                                "current": current_pct,
                                "total": 100,
                                "action": self.action.clone()
                            }),
                        );
                        self.last_emit = std::time::Instant::now();
                    }
                    Ok(n)
                }
            }

            let progress_reader = ProgressReader {
                inner: tar_file,
                current: 0,
                total: total_size,
                app: app.clone(),
                action: if backup_name.contains("Engine") {
                    "Restoring Engine Core...".into()
                } else {
                    "Restoring World State...".into()
                },
                last_emit: std::time::Instant::now(),
            };

            let _ = std::fs::create_dir_all(&target);
            let mut archive =
                tar::Archive::new(zstd::Decoder::new(progress_reader).map_err(|e| e.to_string())?);
            for entry_res in archive.entries().map_err(|e| e.to_string())? {
                let mut entry = entry_res.map_err(|e| e.to_string())?;
                let entry_type = entry.header().entry_type();
                if entry_type.is_symlink() || entry_type.is_hard_link() {
                    return Err("Blocked symlink or hardlink entry inside backup archive.".into());
                }
                let rel_path = entry.path().map_err(|e| e.to_string())?.into_owned();
                if !rel_path
                    .components()
                    .all(|c| matches!(c, std::path::Component::Normal(_)))
                {
                    return Err("Blocked path traversal entry inside backup archive.".into());
                }
                let out_path = target.join(&rel_path);
                crate::utils::ensure_strict_descendant_of_roots(
                    &out_path,
                    std::slice::from_ref(&target),
                )?;
                if entry_type.is_dir() {
                    let _ = std::fs::create_dir_all(&out_path);
                } else if entry_type.is_file() {
                    if let Some(parent) = out_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    entry.unpack(&out_path).map_err(|e| e.to_string())?;
                    final_total += 1;
                }
            }
        }

        let _ = app.emit(
            "backup-progress",
            serde_json::json!({
                "current": 100,
                "total": 100,
                "files_done": final_total,
                "files_total": final_total,
                "action": "Restore Complete!"
            }),
        );
        std::thread::sleep(std::time::Duration::from_millis(120));

        Ok("Restored".into())
    })
    .await
    .map_err(|e| e.to_string())?
}
