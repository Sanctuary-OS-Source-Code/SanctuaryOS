use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeOverride {
    pub artifact_id: String,
    pub mason_id: String,
    #[serde(default)]
    pub game_id: String,
    pub manifest_url: String,
    #[serde(default)]
    pub target_hash: String,
    #[serde(default)]
    pub archive_hashes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeArtifactMeta {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub game_version: String,
    pub release_date: String,
    #[serde(default)]
    pub game_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgePayloadMeta {
    pub download_url: String,
    pub sha256: String,
    pub archive_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DependencyRule {
    pub hash: String,
    pub min_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictRule {
    pub hash: String,
    pub severity: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeAtomicLogic {
    pub required_dlc: Vec<String>,
    pub dependencies: Vec<DependencyRule>,
    pub twins: Vec<String>,
    pub addons: Vec<String>,
    pub conflicts: Vec<ConflictRule>,
    #[serde(default)]
    pub flavors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeVirtualFilesystem {
    pub overrides: Vec<String>,
    pub injected_folders: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeManifest {
    pub schema_version: String,
    pub artifact: EdgeArtifactMeta,
    pub payload: EdgePayloadMeta,
    pub atomic_logic: EdgeAtomicLogic,
    pub virtual_filesystem: EdgeVirtualFilesystem,
    pub changelog: Vec<String>,
    #[serde(default)]
    pub previous_hashes: Vec<String>,
}

use reqwest::Client;
use crate::utils::get_db_conn;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn register_edge_override(vault_path: String, override_data: EdgeOverride) -> Result<(), String> {
    let conn = get_db_conn(&vault_path);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    conn.execute(
        "INSERT OR REPLACE INTO edge_manifests (artifact_id, mason_id, manifest_url, last_fetched_hash, last_fetched_metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            override_data.artifact_id,
            override_data.mason_id,
            override_data.manifest_url,
            "",
            "",
            now
        ],
    ).map_err(|e| format!("DB Error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_and_sync_edge_manifest(vault_path: String, artifact_id: String) -> Result<EdgeManifest, String> {
    let conn = get_db_conn(&vault_path);
    
    let manifest_url: String = conn.query_row(
        "SELECT manifest_url FROM edge_manifests WHERE artifact_id = ?1",
        rusqlite::params![artifact_id],
        |row| row.get(0)
    ).map_err(|e| format!("Edge manifest not found: {}", e))?;

    let client = Client::new();
    let resp = client.get(&manifest_url).send().await.map_err(|e| format!("HTTP request failed: {}", e))?;
    let manifest: EdgeManifest = resp.json().await.map_err(|e| format!("JSON parsing failed: {}", e))?;

    let metadata_str = serde_json::to_string(&manifest).unwrap();
    
    conn.execute(
        "UPDATE edge_manifests SET last_fetched_hash = ?1, last_fetched_metadata = ?2 WHERE artifact_id = ?3",
        rusqlite::params![manifest.payload.sha256, metadata_str, artifact_id],
    ).map_err(|e| format!("Failed to update cache: {}", e))?;

    Ok(manifest)
}

#[tauri::command]
pub async fn get_all_edge_manifests(vault_path: String) -> Result<Vec<EdgeOverride>, String> {
    let conn = get_db_conn(&vault_path);
    let mut stmt = conn.prepare("SELECT artifact_id, mason_id, manifest_url FROM edge_manifests").map_err(|e| format!("{}", e))?;
    let iter = stmt.query_map([], |row| {
        Ok(EdgeOverride {
            artifact_id: row.get(0)?,
            mason_id: row.get(1)?,
            manifest_url: row.get(2)?,
            game_id: String::new(), // Should probably add game_id to DB schema later
            target_hash: String::new(),
            archive_hashes: vec![],
        })
    }).map_err(|e| format!("{}", e))?;
    
    let mut overrides = Vec::new();
    for row in iter {
        if let Ok(o) = row {
            overrides.push(o);
        }
    }
    Ok(overrides)
}

use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn export_edge_release(
    vault_path: String,
    sandbox_mod_name: String,
    manifest: EdgeManifest,
    custom_url: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    let vault_dir = PathBuf::from(&vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir.parent().unwrap_or(&vault_dir).join("Dev").join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };
    let mut mod_dir = dev_lane.join(&sandbox_mod_name);
    
    if !mod_dir.exists() {
        return Err(format!("Sandbox mod directory not found: {}", mod_dir.display()));
    }

    let mut target_file_for_hash = None;

    // Fix flat layout: If it's a floating file, move it into a dedicated folder.
    if mod_dir.is_file() {
        let file_stem = mod_dir.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let new_mod_dir = dev_lane.join(&file_stem);
        
        if !new_mod_dir.exists() {
            fs::create_dir_all(&new_mod_dir).map_err(|e| e.to_string())?;
        }
        
        let new_file_path = new_mod_dir.join(mod_dir.file_name().unwrap());
        fs::rename(&mod_dir, &new_file_path).map_err(|e| format!("Failed to move file to folder: {}", e))?;
        
        target_file_for_hash = Some(new_file_path);
        mod_dir = new_mod_dir;
    } else {
        let game_schema = state.active_schema.lock().unwrap().clone();
        let mod_exts = if let Some(schema) = game_schema {
            schema.extensions.supported
        } else {
            vec!["package".to_string()]
        };
        
        let mut all_hashes = Vec::new();
        for entry in walkdir::WalkDir::new(&mod_dir).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() {
                let ext = p.extension().unwrap_or_default().to_string_lossy().to_string();
                if mod_exts.contains(&ext) {
                    if target_file_for_hash.is_none() {
                        target_file_for_hash = Some(p.to_path_buf());
                    }
                    if let Ok(h) = crate::utils::calculate_hash(&p) {
                        all_hashes.push(h);
                    }
                }
            }
        }
    }

    let actual_hash = if let Some(target) = &target_file_for_hash {
        crate::utils::calculate_hash(target).unwrap_or_else(|_| manifest.payload.sha256.clone())
    } else {
        manifest.payload.sha256.clone()
    };
    
    // We will collect all hashes in the directory so a single override.json covers the entire mod family.
    let mut all_hashes = Vec::new();
    let game_schema = state.active_schema.lock().unwrap().clone();
    let mod_exts = if let Some(schema) = game_schema {
        schema.extensions.supported
    } else {
        vec!["package".to_string()]
    };
    for entry in walkdir::WalkDir::new(&mod_dir).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            let ext = p.extension().unwrap_or_default().to_string_lossy().to_string();
            if mod_exts.contains(&ext) {
                if let Ok(h) = crate::utils::calculate_hash(&p) {
                    if !all_hashes.contains(&h) {
                        all_hashes.push(h);
                    }
                }
            }
        }
    }
    
    // First read any existing override.json to preserve local lineage across exports
    let override_path = mod_dir.join("override.json");
    let mut local_lineage_hashes = Vec::new();
    if override_path.exists() {
        if let Ok(old_data) = fs::read_to_string(&override_path) {
            if let Ok(old_override) = serde_json::from_str::<EdgeOverride>(&old_data) {
                if !old_override.target_hash.is_empty() {
                    local_lineage_hashes.push(old_override.target_hash);
                }
                for h in old_override.archive_hashes {
                    if !local_lineage_hashes.contains(&h) {
                        local_lineage_hashes.push(h);
                    }
                }
            }
        }
    }

    // Combine directory hashes with any backward-compatible previous hashes + local lineage
    let mut merged_archive_hashes = manifest.previous_hashes.clone();
    for h in local_lineage_hashes {
        if !merged_archive_hashes.contains(&h) {
            merged_archive_hashes.push(h);
        }
    }
    for h in all_hashes {
        if h != actual_hash && !merged_archive_hashes.contains(&h) {
            merged_archive_hashes.push(h);
        }
    }

    let mut final_manifest = manifest.clone();
    final_manifest.payload.sha256 = actual_hash.clone();

    let manifest_path = mod_dir.join("manifest.json");
    let manifest_str = serde_json::to_string_pretty(&final_manifest).map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&manifest_path, manifest_str).map_err(|e| format!("Write error manifest ({}) : {}", manifest_path.display(), e))?;

    let override_data = EdgeOverride {
        artifact_id: final_manifest.artifact.id.clone(),
        mason_id: final_manifest.artifact.author.clone(),
        game_id: final_manifest.artifact.game_id.clone(),
        manifest_url: if custom_url.is_empty() { "https://your-domain.com/manifest.json".to_string() } else { custom_url },
        target_hash: actual_hash.clone(),
        archive_hashes: merged_archive_hashes,
    };

    let override_path = mod_dir.join("override.json");
    let override_str = serde_json::to_string_pretty(&override_data).map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&override_path, override_str).map_err(|e| format!("Write error override ({}) : {}", override_path.display(), e))?;

    Ok(())
}
