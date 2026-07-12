use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
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
pub fn set_mod_override(file_name: String, mods_path: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let mods_dir = PathBuf::from(&mods_path);
    crate::game_logic::generate_manifest_if_needed(&game_schema, &mods_dir);

    let source = mods_dir.join(&file_name);
    if let Some(parent) = source.parent() {
        let override_dir = parent.join("Sanctuary");
        let _ = fs::create_dir_all(&override_dir);
        let dest = override_dir.join(source.file_name().unwrap());
        fs::rename(&source, &dest)
            .or_else(|_| fs::copy(&source, &dest).and_then(|_| fs::remove_file(&source)))
            .map_err(|e| format!("Failed to set override {}: {}", file_name, e))?;
    }
    Ok("Override Applied".into())
}

#[tauri::command]
pub fn undo_mod_override(file_name: String, mods_path: String) -> Result<String, String> {
    let mods_dir = PathBuf::from(&mods_path);
    let source_original = mods_dir.join(&file_name);
    
    if let Some(parent) = source_original.parent() {
        let override_dir = parent.join("Sanctuary");
        let current_location = override_dir.join(source_original.file_name().unwrap());
        
        if current_location.exists() {
            fs::rename(&current_location, &source_original)
                .or_else(|_| fs::copy(&current_location, &source_original).and_then(|_| fs::remove_file(&current_location)))
                .map_err(|e| format!("Failed to undo override {}: {}", file_name, e))?;
        } else {
            return Err("File is not currently overridden".into());
        }
    }
    Ok("Override Undone".into())
}

#[tauri::command]
pub fn clear_overrides(mods_path: String) -> Result<String, String> {
    let mods_dir = PathBuf::from(&mods_path);
    let mut count = 0;
    
    for entry in walkdir::WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() && entry.file_name() == "Sanctuary" {
            for sub_entry in walkdir::WalkDir::new(entry.path()).into_iter().filter_map(|e| e.ok()) {
                if sub_entry.file_type().is_file() {
                    let parent = entry.path().parent().unwrap();
                    let dest = parent.join(sub_entry.file_name());
                    if let Ok(_) = fs::rename(sub_entry.path(), &dest)
                        .or_else(|_| fs::copy(sub_entry.path(), &dest).and_then(|_| fs::remove_file(sub_entry.path()))) {
                            count += 1;
                        }
                }
            }
        }
    }
    
    Ok(format!("Cleared {} overrides.", count))
}

#[tauri::command]
pub fn get_overrides(mods_path: String) -> Result<Vec<String>, String> {
    let mods_dir = PathBuf::from(&mods_path);
    let mut overrides = Vec::new();
    
    for entry in walkdir::WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() && entry.file_name() == "Sanctuary" {
            for sub_entry in walkdir::WalkDir::new(entry.path()).into_iter().filter_map(|e| e.ok()) {
                if sub_entry.file_type().is_file() {
                    if let Some(file_name) = sub_entry.file_name().to_str() {
                        overrides.push(file_name.to_string());
                    }
                }
            }
        }
    }
    
    Ok(overrides)
}

