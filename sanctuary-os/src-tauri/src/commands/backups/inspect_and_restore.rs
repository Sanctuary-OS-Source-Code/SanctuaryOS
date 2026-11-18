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
use super::{cow_engine::*, snapshot_ops::*};

#[derive(Serialize, Deserialize, Clone)]
pub struct BackupFile {
    pub path: String,
    pub size_mb: f64,
    #[serde(default)]
    pub delta_status: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct DeltaManifest {
    #[serde(default)]
    pub lane: Option<String>,
    pub previous_backup_name: Option<String>,
    pub is_baseline: bool,
    pub added_paths: Vec<String>,
    pub updated_paths: Vec<String>,
    pub removed_files: Vec<BackupFile>,
}

/// Resolves whether a Time Capsule snapshot belongs to the `"engine"` or `"world"` lane,
/// preferring `.delta_manifest.json`'s persisted `"lane"` field, then its containing folder,
/// and falling back to legacy snapshot naming (`Engine_Core` / `contains("Engine")`) so
/// renamed snapshots never restore into the wrong root directory.
pub(crate) fn is_engine_backup_lane(
    backup_path: &Path,
    backup_name: &str,
    vault_path: &str,
    live_path: &str,
) -> bool {
    if backup_path.is_dir() {
        if let Ok(raw) = std::fs::read_to_string(backup_path.join(".delta_manifest.json")) {
            if let Ok(parsed) = serde_json::from_str::<DeltaManifest>(&raw) {
                if let Some(lane) = parsed.lane.as_deref() {
                    let clean = lane.trim();
                    if clean.eq_ignore_ascii_case("engine") {
                        return true;
                    }
                    if clean.eq_ignore_ascii_case("world") {
                        return false;
                    }
                }
            }
        }
    }

    if let Some(parent) = backup_path.parent() {
        let parent_norm = crate::utils::normalize_path_key(parent);
        if !vault_path.trim().is_empty() {
            let vault_backups = crate::utils::get_vault_root_dir(vault_path).join("Backups");
            if parent_norm == crate::utils::normalize_path_key(&vault_backups.join("Engine")) {
                return true;
            }
            if parent_norm == crate::utils::normalize_path_key(&vault_backups.join("World")) {
                return false;
            }
            if !live_path.trim().is_empty() {
                if let Some(engine_dir) =
                    crate::utils::get_engine_backups_dir(live_path, vault_path)
                {
                    if parent_norm == crate::utils::normalize_path_key(&engine_dir) {
                        return true;
                    }
                }
            }
        }
    }

    backup_name.starts_with("Engine_Core") || backup_name.contains("Engine")
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

        // Find the immediately preceding snapshot of the same lane ("world" or "engine")
        let config = get_saved_coordinates();
        let is_engine = is_engine_backup_lane(&backup_dir, &backup_name, &vault_path, &config.live_path);
        let lane_str = if is_engine { "engine" } else { "world" };
        let legacy_sub = if is_engine { "Engine" } else { "World" };

        let mut prev_backup_entry: Option<(u64, String, PathBuf)> = None;
        {
            let current_ts = crate::utils::extract_backup_timestamp(&backup_name);
            let mut candidate_dirs = Vec::new();
            if let Some(parent) = backup_dir.parent() {
                candidate_dirs.push(parent.to_path_buf());
            }
            let legacy_dir = PathBuf::from(&vault_path).join("Backups").join(legacy_sub);
            if legacy_dir.exists() && !candidate_dirs.contains(&legacy_dir) {
                candidate_dirs.push(legacy_dir);
            }
            for dir in candidate_dirs {
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name == backup_name
                            || !entry.path().is_dir()
                            || name.starts_with('.')
                            || name == "World"
                            || name == "Engine"
                            || name == "Mods"
                            || name == "Config"
                        {
                            continue;
                        }
                        let is_snapshot = name.starts_with("World_State")
                            || name.starts_with("Engine_Core")
                            || entry.path().join(".delta_manifest.json").exists();
                        if !is_snapshot {
                            continue;
                        }
                        if is_engine_backup_lane(&entry.path(), &name, &vault_path, &config.live_path)
                            == is_engine
                        {
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
                    if parsed.lane.as_deref() == Some(lane_str)
                        && ((is_baseline && parsed.is_baseline)
                            || (!is_baseline && parsed.previous_backup_name == prev_name))
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
                lane: Some(lane_str.to_string()),
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
                lane: Some(lane_str.to_string()),
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

        let target_root = if is_engine_backup_lane(&backup_dir, &backup_name, &vault_path, &config.live_path) {
            crate::game_logic::resolve_game_engine_root(&config.live_path, &game_schema)
        } else {
            crate::utils::resolve_effective_docs_path_with_override(
                &docs_path,
                &config,
                &game_schema,
            )
        };
        if !crate::utils::is_safe_workspace_target_dir(&target_root) {
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

        let is_engine_backup =
            is_engine_backup_lane(&backup_dir, &backup_name, &vault_path, &config.live_path);
        let target_root = if is_engine_backup {
            crate::game_logic::resolve_game_engine_root(&config.live_path, &game_schema)
        } else {
            crate::utils::resolve_effective_docs_path_with_override(
                &docs_path,
                &config,
                &game_schema,
            )
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
        if !is_engine_backup {
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

        if crate::commands::deployment::is_any_game_process_running(&game_schema) {
            return Err(
                "Close the running game before restoring a snapshot so files are not locked."
                    .into(),
            );
        }

        let arc =
            find_backup(&config.vault_path, &backup_name).ok_or("Backup not found in Vault")?;

        let effective_live = if live_path.trim().is_empty() {
            config.live_path.clone()
        } else {
            live_path
        };
        let is_engine_restore =
            is_engine_backup_lane(&arc, &backup_name, &config.vault_path, &effective_live);
        let target = if is_engine_restore {
            crate::game_logic::resolve_game_engine_root(&effective_live, &game_schema)
        } else {
            crate::utils::resolve_effective_docs_path_with_override(
                &docs_path,
                &config,
                &game_schema,
            )
        };
        if !crate::utils::is_safe_workspace_target_dir(&target) {
            return Err("Blocked: Refusing to restore into a protected system path.".into());
        }

        let mut protected_save_dirs: Vec<String> = Vec::new();
        let mut substituted_save_dirs: Vec<(String, PathBuf)> = Vec::new();

        if !is_engine_restore {
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

            // Mirror any existing live saves into the Secondary Vault Mirror before modifying World State
            crate::commands::deployment::mirror_live_saves_to_vault(
                &target,
                &config.vault_path,
                &game_schema,
            );

            protected_save_dirs =
                crate::commands::deployment::resolve_deduplicated_save_targets(&target, &game_schema);

            // If this snapshot accidentally captured a legacy Lab sandbox marker inside a save directory,
            // automatically substitute the newest clean World State save directory so real live saves are restored!
            if arc.is_dir() {
                for save_rel in &protected_save_dirs {
                    let arc_save_dir = crate::utils::resolve_case_insensitive_path(&arc, save_rel);
                    if arc_save_dir.is_dir()
                        && (arc_save_dir.join(".sanctuary_sandbox_marker").exists()
                            || arc_save_dir.join(".sanctuary_seeded_save").exists())
                    {
                        if let Some(clean_save_dir) =
                            crate::commands::deployment::find_clean_world_state_save_dir(
                                &target,
                                Some(&config.vault_path),
                                save_rel,
                                &game_schema,
                            )
                        {
                            substituted_save_dirs.push((save_rel.clone(), clean_save_dir));
                        }
                    }
                }
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

            let action_str: String = if is_engine_restore {
                "Restoring Engine Core...".into()
            } else {
                "Restoring World State...".into()
            };

            final_total = restore_snapshot_parallel_cow(
                Some(&app),
                &arc,
                &target,
                &action_str,
                &protected_save_dirs,
                &substituted_save_dirs,
            )?;
        } else {
            // Legacy tar.zst
            if !is_engine_restore {
                let mut targets_to_clear: Vec<String> = Vec::new();
                if let Some(schema) = &game_schema {
                    if let Some(tc) = &schema.time_capsule {
                        for t in &tc.world_state_targets {
                            let expanded = crate::game_logic::expand_env_vars(&t.path);
                            if !expanded.trim().is_empty()
                                && !is_rel_under_protected_dir(&expanded, &protected_save_dirs)
                            {
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
                action: if is_engine_restore {
                    "Restoring Engine Core...".into()
                } else {
                    "Restoring World State...".into()
                },
                last_emit: std::time::Instant::now(),
            };

            const MAX_TAR_ZST_RESTORE_BYTES: u64 = 32 * 1024 * 1024 * 1024; // 32 GiB safety ceiling
            const MAX_TAR_ZST_ENTRY_BYTES: u64 = 4 * 1024 * 1024 * 1024;
            let _ = std::fs::create_dir_all(&target);
            let mut archive =
                tar::Archive::new(zstd::Decoder::new(progress_reader).map_err(|e| e.to_string())?);
            let mut total_extracted_bytes: u64 = 0;
            for entry_res in archive.entries().map_err(|e| e.to_string())? {
                let mut entry = entry_res.map_err(|e| e.to_string())?;
                let entry_type = entry.header().entry_type();
                if entry_type.is_symlink() || entry_type.is_hard_link() {
                    return Err("Blocked symlink or hardlink entry inside backup archive.".into());
                }
                let entry_size = entry.header().size().unwrap_or(0);
                if entry_size > MAX_TAR_ZST_ENTRY_BYTES {
                    return Err("Blocked oversized entry inside backup archive.".into());
                }
                total_extracted_bytes = total_extracted_bytes.saturating_add(entry_size);
                if total_extracted_bytes > MAX_TAR_ZST_RESTORE_BYTES {
                    return Err("Blocked: Decompressed backup archive exceeds 32 GiB safety cap.".into());
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
                    // Unlink existing file/CoW hardlink before writing restored bytes so shared snapshots stay immutable
                    if let Ok(meta) = std::fs::symlink_metadata(&out_path) {
                        if meta.file_type().is_symlink() || meta.is_file() {
                            let _ = std::fs::remove_file(&out_path);
                        }
                    }
                    use std::io::Read;
                    let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(
                        &mut entry.by_ref().take(MAX_TAR_ZST_ENTRY_BYTES + 1),
                        &mut out_file,
                    )
                    .map_err(|e| e.to_string())?;
                    final_total += 1;
                }
            }
        }

        if !is_engine_restore {
            crate::commands::deployment::mirror_live_saves_to_vault(
                &target,
                &config.vault_path,
                &game_schema,
            );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_world_state_restore_is_additive_on_saves_and_substitutes_contaminated_sandbox_snapshot() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_tc_restore_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&tmp);

        let clean_saves = tmp.join("clean_snapshot_saves");
        let contaminated_arc = tmp.join("World_State--contaminated");
        let target_docs = tmp.join("GameUserData");

        std::fs::create_dir_all(&clean_saves).unwrap();
        std::fs::write(clean_saves.join("Slot_0001.sav"), b"CLEAN_SLOT_1").unwrap();
        std::fs::write(clean_saves.join("Slot_0002.sav"), b"CLEAN_SLOT_2").unwrap();

        std::fs::create_dir_all(contaminated_arc.join("Saves")).unwrap();
        std::fs::write(
            contaminated_arc.join("Saves").join(".sanctuary_sandbox_marker"),
            b"isolated",
        )
        .unwrap();
        std::fs::write(
            contaminated_arc.join("Saves").join("Slot_ffff.sav"),
            b"SANDBOX_ONLY",
        )
        .unwrap();

        std::fs::create_dir_all(contaminated_arc.join("BlueprintsData")).unwrap();
        std::fs::write(
            contaminated_arc.join("BlueprintsData").join("item_a.bin"),
            b"BLUEPRINT_A",
        )
        .unwrap();

        // Pre-populate target_docs with an extra user save slot (`Slot_9999.sav`) and an extraneous non-save file
        std::fs::create_dir_all(target_docs.join("Saves")).unwrap();
        std::fs::write(
            target_docs.join("Saves").join("Slot_9999.sav"),
            b"EXISTING_LIVE_SLOT_9999",
        )
        .unwrap();
        std::fs::create_dir_all(target_docs.join("BlueprintsData")).unwrap();
        std::fs::write(
            target_docs.join("BlueprintsData").join("stale_item.bin"),
            b"STALE",
        )
        .unwrap();

        assert!(crate::utils::is_safe_workspace_target_dir(&target_docs));
        assert!(!crate::utils::is_safe_workspace_target_dir(Path::new("")));

        let protected = vec!["Saves".to_string()];
        let substituted = vec![("Saves".to_string(), clean_saves.clone())];

        let restored_count = restore_snapshot_parallel_cow(
            None,
            &contaminated_arc,
            &target_docs,
            "Testing Restore...",
            &protected,
            &substituted,
        )
        .expect("restore_snapshot_parallel_cow should succeed");

        assert_eq!(restored_count, 3);
        // Clean snapshot saves restored:
        assert_eq!(
            std::fs::read(target_docs.join("Saves").join("Slot_0001.sav")).unwrap(),
            b"CLEAN_SLOT_1"
        );
        assert_eq!(
            std::fs::read(target_docs.join("Saves").join("Slot_0002.sav")).unwrap(),
            b"CLEAN_SLOT_2"
        );
        // Existing non-overlapping live save NEVER deleted:
        assert_eq!(
            std::fs::read(target_docs.join("Saves").join("Slot_9999.sav")).unwrap(),
            b"EXISTING_LIVE_SLOT_9999"
        );
        // Sandbox save NOT copied into live saves:
        assert!(!target_docs.join("Saves").join("Slot_ffff.sav").exists());
        // Non-save folder restored & extraneous file pruned normally:
        assert_eq!(
            std::fs::read(target_docs.join("BlueprintsData").join("item_a.bin")).unwrap(),
            b"BLUEPRINT_A"
        );
        assert!(!target_docs.join("BlueprintsData").join("stale_item.bin").exists());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_renamed_engine_snapshot_preserves_engine_lane_from_delta_manifest() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_renamed_engine_lane_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = tmp.join("Vault");
        let renamed_snapshot = vault_dir.join("Backups").join("PrePatchBackup");
        std::fs::create_dir_all(&renamed_snapshot).unwrap();

        let manifest = DeltaManifest {
            lane: Some("engine".to_string()),
            previous_backup_name: None,
            is_baseline: true,
            added_paths: vec![],
            updated_paths: vec![],
            removed_files: vec![],
        };
        std::fs::write(
            renamed_snapshot.join(".delta_manifest.json"),
            serde_json::to_string(&manifest).unwrap(),
        )
        .unwrap();

        assert!(
            is_engine_backup_lane(
                &renamed_snapshot,
                "PrePatchBackup",
                &vault_dir.to_string_lossy(),
                "",
            ),
            "Renamed Engine backup with lane=\"engine\" in .delta_manifest.json must route back to Engine Root, never Documents"
        );

        let renamed_world = vault_dir.join("Backups").join("Engine_Named_World_Trap");
        std::fs::create_dir_all(&renamed_world).unwrap();
        let world_manifest = DeltaManifest {
            lane: Some("world".to_string()),
            previous_backup_name: None,
            is_baseline: true,
            added_paths: vec![],
            updated_paths: vec![],
            removed_files: vec![],
        };
        std::fs::write(
            renamed_world.join(".delta_manifest.json"),
            serde_json::to_string(&world_manifest).unwrap(),
        )
        .unwrap();
        assert!(
            !is_engine_backup_lane(
                &renamed_world,
                "Engine_Named_World_Trap",
                &vault_dir.to_string_lossy(),
                "",
            ),
            "Snapshot with explicit lane=\"world\" in .delta_manifest.json must stay in World lane regardless of name"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
