#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use crate::utils::*;
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use std::sync::Arc;
#[allow(unused_imports)]
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::{cow_engine::*, inspect_and_restore::*};

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

pub(super) fn recompute_snapshot_metadata(
    backup_dir: &Path,
    prev_backup: Option<&(String, PathBuf)>,
    lane: &str,
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
                lane: Some(lane.to_string()),
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
                lane: Some(lane.to_string()),
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
            is_engine: bool,
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
                        let is_engine = is_engine_backup_lane(
                            &entry_path,
                            &name,
                            &vault_path,
                            &config.live_path,
                        );
                        raw_list.push(RawBackupEntry {
                            name,
                            path: entry_path,
                            is_dir: true,
                            is_engine,
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
                        let is_engine = is_engine_backup_lane(
                            &entry_path,
                            &name,
                            &vault_path,
                            &config.live_path,
                        );
                        raw_list.push(RawBackupEntry {
                            name,
                            path: entry_path,
                            is_dir: false,
                            is_engine,
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
        let mut rebuild_jobs: Vec<(usize, PathBuf, Option<(String, PathBuf)>, &'static str)> =
            Vec::new();

        for (idx, item) in raw_list.iter_mut().enumerate() {
            if !item.is_dir {
                continue;
            }
            let lane_str: &'static str = if item.is_engine { "engine" } else { "world" };
            let expected_prev = if item.is_engine {
                let p = prev_engine.clone();
                prev_engine = Some((item.name.clone(), item.path.clone()));
                p
            } else {
                let p = prev_world.clone();
                prev_world = Some((item.name.clone(), item.path.clone()));
                p
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
                    m.lane.as_deref() == Some(lane_str)
                        && if is_baseline {
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
                rebuild_jobs.push((idx, item.path.clone(), expected_prev, lane_str));
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
                .map(|(idx, dir_path, prev_opt, lane_str)| {
                    let (log_b, diff_b) =
                        recompute_snapshot_metadata(dir_path, prev_opt.as_ref(), lane_str);
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

pub(super) fn collect_allowed_backup_roots(
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

pub(super) fn find_latest_previous_backup(search_dirs: &[PathBuf], prefix: &str) -> Option<PathBuf> {
    let want_engine = prefix.starts_with("Engine");
    let mut folders: Vec<PathBuf> = Vec::new();
    for dir in search_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                if !e.file_type().map_or(false, |ft| ft.is_dir()) {
                    continue;
                }
                let p = e.path();
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.')
                    || matches!(name.as_str(), "World" | "Engine" | "Mods" | "Config")
                {
                    continue;
                }
                let matches_prefix = name.starts_with(prefix);
                let matches_manifest_lane = p.join(".delta_manifest.json").exists()
                    && std::fs::read_to_string(p.join(".delta_manifest.json"))
                        .ok()
                        .and_then(|raw| serde_json::from_str::<DeltaManifest>(&raw).ok())
                        .and_then(|m| m.lane)
                        .map_or(false, |l| {
                            if want_engine {
                                l.trim().eq_ignore_ascii_case("engine")
                            } else {
                                l.trim().eq_ignore_ascii_case("world")
                            }
                        });
                if matches_prefix || matches_manifest_lane {
                    folders.push(p);
                }
            }
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

pub(super) fn collect_removed_files_from_previous(
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
        let app_state = app.state::<AppState>();
        let game_schema = app_state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();

        if crate::commands::deployment::is_any_game_process_running(&game_schema) {
            return Err(
                "Close the running game before sealing a World State snapshot so save files are not locked."
                    .into(),
            );
        }

        let game_docs_path =
            crate::utils::resolve_effective_docs_path_with_override(&docs_path, &config, &game_schema);
        if !crate::utils::is_safe_workspace_target_dir(&game_docs_path) {
            return Err("Blocked: Refusing to snapshot an invalid or protected system path.".into());
        }
        let effective_docs_str = game_docs_path.to_string_lossy().to_string();

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
        crate::commands::deployment::mirror_live_saves_to_vault(
            &game_docs_path,
            &config.vault_path,
            &game_schema,
        );

        let backup_name = format!(
            "World_State--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        // Anchor World State backups to the same physical drive as docs_path so hardlinks never break if Vault is on a different drive
        let parent_dir =
            crate::utils::get_world_backups_dir(&effective_docs_str, &config.vault_path)
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

        let mut targets = Vec::new();
        if let Some(schema) = &game_schema {
            if let Some(time_capsule) = &schema.time_capsule {
                for target in &time_capsule.world_state_targets {
                    let resolved = crate::game_logic::expand_env_vars(&target.path);
                    let trimmed = resolved.trim();
                    if trimmed.is_empty() || trimmed == "." {
                        targets.push((target.name.clone(), game_docs_path.clone()));
                    } else {
                        targets.push((target.name.clone(), game_docs_path.join(trimmed)));
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
            lane: Some("world".to_string()),
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
        crate::utils::enforce_workspace_backup_capacity(&config);

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
        if crate::commands::deployment::is_any_game_process_running(&game_schema) {
            return Err("Close the running game before sealing an Engine Core snapshot.".into());
        }
        let effective_live = if live_path.trim().is_empty() {
            config.live_path.clone()
        } else {
            live_path
        };
        let base_path = crate::game_logic::resolve_game_engine_root(&effective_live, &game_schema);
        if !crate::utils::is_safe_workspace_target_dir(&base_path) {
            return Err("Blocked: Refusing to snapshot an invalid or protected engine path.".into());
        }
        let backup_name = format!(
            "Engine_Core--{}--{}",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let parent_dir =
            crate::utils::get_engine_backups_dir(&effective_live, &config.vault_path)
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
            lane: Some("engine".to_string()),
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
        crate::utils::enforce_workspace_backup_capacity(&config);

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
