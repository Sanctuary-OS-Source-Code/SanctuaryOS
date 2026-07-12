use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::system::*;
use crate::commands::logs::*;
use crate::commands::cache::*;
use crate::commands::game_info::*;
use notify::Watcher;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};
use crate::state::*;
use crate::utils::*;


#[tauri::command]
pub fn launch_game(live_path: String, mods_path: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = &state.active_schema.lock().unwrap().clone();
    let mut doc_dir = std::path::PathBuf::from(&mods_path);
    if doc_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase()
        == "mods"
    {
        doc_dir.pop();
    }

    let check_and_delete = |dir: &std::path::Path| {
        if dir.exists() && dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    if crate::game_logic::is_exception_log(game_schema, &name)
                        || crate::game_logic::is_cache_file(game_schema, &name)
                    {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    };

    check_and_delete(&doc_dir);
    check_and_delete(std::path::Path::new(&mods_path));

    let mut base_path = std::path::PathBuf::from(&live_path);
    if !base_path.ends_with("Bin") && !base_path.ends_with("bin") {
        base_path.push("Game");
        base_path.push("Bin");
    }

    let exe_names = crate::game_logic::get_executable_names(game_schema);
    let mut exe_path = None;
    for name in exe_names {
        let test_path = base_path.join(&name);
        if test_path.exists() {
            exe_path = Some(test_path);
            break;
        }
    }

    let exe_path = match exe_path {
        Some(p) => p,
        None => return Err("backend_exe_not_found".to_string()),
    };

    let parent_dir = exe_path.parent().unwrap();

    match std::process::Command::new(&exe_path)
        .current_dir(parent_dir)
        .spawn()
    {
        Ok(_) => Ok("backend_ignition_started".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn airgap_saves(docs_path: String, enable: bool) -> Result<String, String> {
    let saves_dir = std::path::PathBuf::from(&docs_path).join("saves");
    if !saves_dir.exists() {
        return Ok("No saves folder found".to_string());
    }

    let walk_dir = walkdir::WalkDir::new(&saves_dir);
    for entry in walk_dir.into_iter().filter_map(|e| e.ok()) {
        if let Ok(metadata) = entry.metadata() {
            let mut perms = metadata.permissions();
            perms.set_readonly(enable);
            let _ = std::fs::set_permissions(entry.path(), perms);
        }
    }
    
    Ok(format!("Saves airgap: {}", enable))
}

#[tauri::command]
pub async fn deploy_playset_bulk(
    mods: Vec<DeployMod>,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mods_dir = PathBuf::from(&mods_path);
        let vault_dir = PathBuf::from(&vault_path);
        
        let vault_mods_lane = if vault_dir.ends_with("Mods") {
            vault_dir.clone()
        } else {
            vault_dir.join("Mods")
        };

        if !mods_dir.exists() {
            return Err("Mods folder missing.".into());
        }

        safe_wipe_mods_dir(&mods_dir, &game_schema);

        crate::game_logic::generate_manifest_if_needed(&game_schema, &mods_dir);

        let mut count = 0;
        for m in mods {
            if let Some(structure_val) = &m.folder_structure {
                match serde_json::from_value::<Vec<StructureNode>>(structure_val.clone()) {
                    Ok(nodes) => {
                        let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
                        process_structure_nodes(&game_schema, &nodes, &mods_dir, &vault_mods_lane, &folders_to_check);
                        continue;
                    }
                    Err(e) => {
                        println!("ERROR PARSING STRUCTURE NODE FOR {}: {}", m.path, e);
                    }
                }
            }

            let mut search_name = Path::new(&m.path);
            if m.path.starts_with("Sanctuary/") || m.path.starts_with("Sanctuary\\") {
                if let Ok(stripped) = search_name.strip_prefix("Sanctuary") {
                    search_name = stripped;
                }
            }

            let mut source = vault_mods_lane.join(search_name);
            let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
            let mut found = false;
            for f in &folders_to_check {
                let base_test = if f.is_empty() {
                    vault_mods_lane.join(search_name)
                } else {
                    vault_mods_lane.join(f).join(search_name)
                };
                
                                let exts = crate::game_logic::get_supported_extensions(&game_schema);
                if base_test.is_file() {
                    source = base_test;
                    found = true;
                    break;
                } else {
                    for ext in exts {
                        if base_test.with_extension(&ext).is_file() {
                            source = base_test.with_extension(&ext);
                            found = true;
                            break;
                        }
                    }
                    if found { break; }
                }
            }

            if !found {
                if let Some(file_name_only) = search_name.file_name() {
                    let flat_test = vault_mods_lane.join(file_name_only);
                    if flat_test.is_file() {
                        source = flat_test;
                        found = true;
                        search_name = Path::new(file_name_only);
                    } else {
                        let exts = crate::game_logic::get_supported_extensions(&game_schema);
                        for ext in exts {
                            if flat_test.with_extension(&ext).is_file() {
                                source = flat_test.with_extension(&ext);
                                found = true;
                                search_name = Path::new(file_name_only);
                                break;
                            }
                        }
                    }
                }
            }

            if !found {
                continue;
            }

            let path_parts: Vec<_> = Path::new(&m.path).components().collect();
            if path_parts.len() < 1 {
                continue;
            }

            if !source.is_dir() {
                if let Some(file_name_str) = source.file_name().and_then(|n| n.to_str()) {
                    if file_name_str.eq_ignore_ascii_case("desktop.ini") {
                        continue;
                    }
                }
            }

            let mut target = if let Some(ref t_path) = m.target_path {
                mods_dir.join(t_path)
            } else {
                mods_dir.join(search_name)
            };
            
            if m.path.starts_with("Sanctuary/") || m.path.starts_with("Sanctuary\\") {
                if m.target_path.is_none() {
                    target = mods_dir.join("Sanctuary").join(search_name);
                }
            }

            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            if m.allow_write {
                if !source.is_dir() {
                    let _ = create_symlink_file(&source, &target)
                        .or_else(|_| std::fs::hard_link(&source, &target))
                        .or_else(|_| std::fs::copy(&source, &target).map(|_| ()));
                }
            } else {
                if !source.is_dir() {
                    let _ = create_symlink_file(&source, &target)
                        .or_else(|_| std::fs::hard_link(&source, &target))
                        .or_else(|_| std::fs::copy(&source, &target).map(|_| ()));
                }
            }
            
            if !source.is_dir() {
                if let Some(ext) = source.extension().and_then(|e| e.to_str()) {
                    let schema_exts = crate::game_logic::get_supported_extensions(&game_schema);
                    let target_ext = if schema_exts.len() >= 2 {
                        if ext.eq_ignore_ascii_case(&schema_exts[0]) {
                            Some(schema_exts[1].clone())
                        } else if ext.eq_ignore_ascii_case(&schema_exts[1]) {
                            Some(schema_exts[0].clone())
                        } else {
                            None
                        }
                    } else {
                        None
                    };
                    
                    if let Some(other_ext) = target_ext {
                        let twin_source = source.with_extension(&other_ext);
                        if twin_source.exists() {
                            let twin_target = target.with_extension(&other_ext);
                            let _ = create_symlink_file(&twin_source, &twin_target)
                                .or_else(|_| std::fs::hard_link(&twin_source, &twin_target))
                                .or_else(|_| std::fs::copy(&twin_source, &twin_target).map(|_| ()));
                        }
                    }
                }
            }

            if let Some(source_parent) = source.parent() {
                if let Some(target_parent) = target.parent() {
                    let mut is_top_level = source_parent == vault_mods_lane.as_path();
                    let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
                    for f in &folders_to_check {
                        if !f.is_empty() {
                            let f_path = vault_mods_lane.join(f);
                            if source_parent == f_path.as_path() {
                                is_top_level = true;
                                break;
                            }
                        }
                    }
                    if !is_top_level {
                        if let Ok(entries) = std::fs::read_dir(source_parent) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_file() {
                                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                        if !file_name.eq_ignore_ascii_case("desktop.ini") && !file_name.eq_ignore_ascii_case("Default.ini") {
                                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                                let ext_lower = ext.to_lowercase();
                                                if ext_lower == "cfg" || ext_lower == "ini" || ext_lower == "json" || ext_lower == "txt" {
                                                    let dest = target_parent.join(file_name);
                                                    if !dest.exists() {
                                                        let _ = create_symlink_file(&path, &dest)
                                                            .or_else(|_| std::fs::hard_link(&path, &dest))
                                                            .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
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

            count += 1;
        }

        if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                        if file_name.eq_ignore_ascii_case("desktop.ini") || file_name.eq_ignore_ascii_case("Default.ini") {
                            continue;
                        }
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            let ext_lower = ext.to_lowercase();
                            if ext_lower == "cfg" || ext_lower == "ini" || ext_lower == "json" || ext_lower == "txt" || ext_lower == "xml" {
                                let dest = mods_dir.join(file_name);
                                if !dest.exists() {
                                    let _ = create_symlink_file(&path, &dest)
                                        .or_else(|_| std::fs::hard_link(&path, &dest))
                                        .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
                                }
                            }
                        }
                    }
                }
            }
        }


        Ok(count.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn wipe_symlinks() -> Result<String, String> {
    let config = get_saved_coordinates();
    let mods_dir = std::path::PathBuf::from(&config.live_path);
    if !mods_dir.exists() {
        return Ok("No Mods folder".into());
    }
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.filter_map(Result::ok) {
            if let Ok(meta) = std::fs::symlink_metadata(&entry.path()) {
                if meta.file_type().is_symlink() || entry.path().read_link().is_ok() {
                    if entry.path().is_dir() {
                        let _ = std::fs::remove_dir(&entry.path());
                    } else {
                        let _ = std::fs::remove_file(&entry.path());
                    }
                    count += 1;
                }
            }
        }
    }
    Ok(format!("{} active links severed.", count))
}

