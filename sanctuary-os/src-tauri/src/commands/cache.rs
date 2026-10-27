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
                let new_target = parent.join(source_file_name);

                let s_canon = source
                    .canonicalize()
                    .unwrap_or_else(|_| source.to_path_buf());
                let n_canon = new_target
                    .canonicalize()
                    .unwrap_or_else(|_| new_target.clone());

                let copy_result = if s_canon == n_canon {
                    Ok(0) // Dummy success if it's already the exact same file
                } else {
                    std::fs::copy(source, &new_target)
                };

                match copy_result {
                    Ok(_) => {
                        let now = filetime::FileTime::now();
                        let _ = filetime::set_file_times(&new_target, now, now);

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
    let data_dir = Path::new(&vault_path).join("Data");
    let _ = std::fs::create_dir_all(&data_dir);
    let path = data_dir.join(".sanctuary_master_cache.json");
    std::fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_master_cache(vault_path: String) -> Result<String, String> {
    let data_dir = Path::new(&vault_path).join("Data");
    let path = data_dir.join(".sanctuary_master_cache.json");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok("[]".into())
    }
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
