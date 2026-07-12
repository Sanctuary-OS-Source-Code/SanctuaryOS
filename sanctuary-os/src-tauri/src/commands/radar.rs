use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
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
use rayon::prelude::*;


#[tauri::command]
pub async fn run_conflict_radar(
    mods_path: String,
    target_files: Option<Vec<String>>,
    state: tauri::State<'_, AppState>
) -> Result<serde_json::Value, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mods_dir = Path::new(&mods_path);
    let mut packages = Vec::new();
    walk_packages(&game_schema, mods_dir, &mut packages);

    if let Some(targets) = target_files {
        packages.retain(|p| {
            if let Ok(rel) = p.strip_prefix(mods_dir) {
                let name = rel.to_string_lossy().replace("\\", "/");
                targets.contains(&name) || targets.contains(&format!("Sanctuary/{}", name))
            } else {
                false
            }
        });
    }

    let installed_files: Vec<String> = packages.iter().map(|path| {
        path.strip_prefix(mods_dir)
            .unwrap_or(path)
            .to_string_lossy()
            .replace("\\", "/")
    }).collect();

    let (tx, rx) = std::sync::mpsc::channel();

    let game_schema_merge = game_schema.clone();
    let merge_thread = std::thread::spawn(move || {
        let mut resource_map: HashMap<(u32, u32, u64), String> = HashMap::new();
        let mut conflicts: HashMap<String, Conflict> = HashMap::new();

        while let Ok((file_name, resources)) = rx.recv() {
            let file_name: String = file_name;
            let resources: Vec<(u32, u32, u64)> = resources;
            for key in resources {
                if let Some(clash) = resource_map.get(&key) {
                    if clash != &file_name {
                        let mut pair = vec![clash.clone(), file_name.clone()];
                        pair.sort();
                        let pair_key = format!("{}  ⚔️  {}", pair[0], pair[1]);

                        let entry = conflicts.entry(pair_key.clone()).or_insert(Conflict {
                            mod_pair: pair_key,
                            shared_assets: 0,
                            severity_rank: 0,
                        });
                        entry.shared_assets += 1;

                        let (_, rank) = crate::game_logic::get_severity_rank(&game_schema_merge, key.0);
                        if (rank as u32) > entry.severity_rank {
                            entry.severity_rank = rank as u32;
                        }
                    }
                } else {
                    resource_map.insert(key, file_name.clone());
                }
            }
        }
        conflicts
    });

    let pool = rayon::ThreadPoolBuilder::new().build().unwrap();
    pool.install(|| {
        packages
            .into_par_iter()
            .for_each_with(tx, |s, path| {
                let file_name = path
                .strip_prefix(mods_dir)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace("\\", "/");

            let mut resources = Vec::new();
            if let Ok(file_resources) = crate::dbpf::read_dbpf_index(&path) {
                for res in file_resources {
                    let (is_harmless, _) = crate::game_logic::get_severity_rank(&game_schema, res.t);
                    if !is_harmless {
                        resources.push((res.t, res.g, res.i));
                    }
                }
            }
            let _ = s.send((file_name, resources));
        });
    });

    let conflicts = merge_thread.join().unwrap();

    Ok(serde_json::json!({
        "total_packages": installed_files.len(),
        "installed_mods": installed_files,
        "conflicts": conflicts.into_values().collect::<Vec<Conflict>>()
    }))
    }).await.map_err(|e| e.to_string())?
}

