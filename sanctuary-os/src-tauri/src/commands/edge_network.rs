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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_fetched_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_fetched_metadata: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
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
    let archive_hashes_str = serde_json::to_string(&override_data.archive_hashes).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO edge_manifests (
            artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
            last_fetched_hash, last_fetched_metadata, created_at
         )
         VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6,
            COALESCE((SELECT last_fetched_hash FROM edge_manifests WHERE artifact_id = ?1), ''),
            COALESCE((SELECT last_fetched_metadata FROM edge_manifests WHERE artifact_id = ?1), ''),
            ?7
         )",
        rusqlite::params![
            override_data.artifact_id,
            override_data.mason_id,
            override_data.manifest_url,
            override_data.target_hash,
            archive_hashes_str,
            override_data.game_id,
            now
        ],
    ).map_err(|e| format!("DB Error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_and_sync_edge_manifest(vault_path: String, artifact_id: String) -> Result<EdgeManifest, String> {
    let (manifest_url, existing_target_hash, existing_archive_str): (String, String, String) = {
        let conn = get_db_conn(&vault_path);
        conn.query_row(
            "SELECT manifest_url, COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]') FROM edge_manifests WHERE artifact_id = ?1 OR target_hash = ?1",
            rusqlite::params![artifact_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        ).map_err(|e| format!("Edge manifest not found: {}", e))?
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_else(|_| Client::new());
    let resp = client.get(&manifest_url).send().await.map_err(|e| format!("HTTP request failed: {}", e))?;
    let manifest: EdgeManifest = resp.json().await.map_err(|e| format!("JSON parsing failed: {}", e))?;

    let metadata_str = serde_json::to_string(&manifest).unwrap_or_default();
    let mut archive_hashes: Vec<String> = serde_json::from_str(&existing_archive_str).unwrap_or_default();
    if !existing_target_hash.is_empty()
        && existing_target_hash != manifest.payload.sha256
        && !archive_hashes.contains(&existing_target_hash)
    {
        archive_hashes.push(existing_target_hash.clone());
    }
    for h in &manifest.previous_hashes {
        if !h.is_empty() && !archive_hashes.contains(h) {
            archive_hashes.push(h.clone());
        }
    }
    let updated_archive_str = serde_json::to_string(&archive_hashes).unwrap_or_else(|_| "[]".to_string());
    let new_target_hash = if !manifest.payload.sha256.is_empty() {
        manifest.payload.sha256.clone()
    } else {
        existing_target_hash
    };

    let conn = get_db_conn(&vault_path);
    conn.execute(
        "UPDATE edge_manifests SET last_fetched_hash = ?1, last_fetched_metadata = ?2, target_hash = ?3, archive_hashes = ?4 WHERE artifact_id = ?5 OR target_hash = ?5",
        rusqlite::params![manifest.payload.sha256, metadata_str, new_target_hash, updated_archive_str, artifact_id],
    ).map_err(|e| format!("Failed to update cache: {}", e))?;

    Ok(manifest)
}

#[tauri::command]
pub async fn get_all_edge_manifests(vault_path: String) -> Result<Vec<EdgeOverride>, String> {
    let conn = get_db_conn(&vault_path);
    let mut stmt = conn.prepare(
        "SELECT artifact_id, mason_id, manifest_url, COALESCE(game_id, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), last_fetched_hash, last_fetched_metadata FROM edge_manifests"
    ).map_err(|e| format!("{}", e))?;
    let iter = stmt.query_map([], |row| {
        let archive_str: String = row.get(5).unwrap_or_else(|_| "[]".to_string());
        let archive_hashes: Vec<String> = serde_json::from_str(&archive_str).unwrap_or_default();
        Ok(EdgeOverride {
            artifact_id: row.get(0)?,
            mason_id: row.get(1)?,
            manifest_url: row.get(2)?,
            game_id: row.get(3).unwrap_or_default(),
            target_hash: row.get(4).unwrap_or_default(),
            archive_hashes,
            last_fetched_hash: row.get(6).ok(),
            last_fetched_metadata: row.get(7).ok(),
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
use std::io::{Read, Write};
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
    let mods_lane = crate::utils::get_vault_mods_lane(&vault_path);

    let mut mod_dir = dev_lane.join(&sandbox_mod_name);
    let mut base_lane = dev_lane.clone();
    if !mod_dir.exists() {
        let direct_path = PathBuf::from(&sandbox_mod_name);
        if direct_path.exists() {
            mod_dir = direct_path.clone();
            if let Some(p) = direct_path.parent() {
                base_lane = p.to_path_buf();
            }
        } else {
            let vault_candidate = mods_lane.join(&sandbox_mod_name);
            if vault_candidate.exists() {
                mod_dir = vault_candidate;
                base_lane = mods_lane;
            }
        }
    }
    
    if !mod_dir.exists() {
        return Err(format!("Mod directory not found: {}", mod_dir.display()));
    }

    let mut target_file_for_hash = None;

    // Fix flat layout: If it's a floating file, move it into a dedicated folder.
    if mod_dir.is_file() {
        let file_stem = mod_dir.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let new_mod_dir = base_lane.join(&file_stem);
        
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
            vec!["package".to_string(), "ts4script".to_string()]
        };
        
        for entry in walkdir::WalkDir::new(&mod_dir).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() {
                let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                if mod_exts.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext)) {
                    if target_file_for_hash.is_none() {
                        target_file_for_hash = Some(p.to_path_buf());
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
    
    // Collect all hashes in the directory so a single override.json covers the entire mod family.
    let mut all_hashes = Vec::new();
    let game_schema = state.active_schema.lock().unwrap().clone();
    let mod_exts = if let Some(schema) = game_schema {
        schema.extensions.supported
    } else {
        vec!["package".to_string(), "ts4script".to_string()]
    };
    let mut package_files: Vec<PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(&mod_dir).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            if mod_exts.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext)) {
                package_files.push(p.to_path_buf());
                if let Ok(h) = crate::utils::calculate_hash(&p) {
                    if !all_hashes.contains(&h) {
                        all_hashes.push(h);
                    }
                }
            }
        }
    }
    
    // Read any existing override.json to preserve local lineage across exports
    let override_path = mod_dir.join("override.json");
    let mut local_lineage_hashes = Vec::new();
    if override_path.exists() {
        if let Ok(old_data) = fs::read_to_string(&override_path) {
            if let Ok(old_override) = serde_json::from_str::<EdgeOverride>(&old_data) {
                if !old_override.target_hash.is_empty() && old_override.target_hash != actual_hash {
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
    final_manifest.previous_hashes = merged_archive_hashes.clone();

    let manifest_path = mod_dir.join("manifest.json");
    let manifest_str = serde_json::to_string_pretty(&final_manifest).map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&manifest_path, &manifest_str).map_err(|e| format!("Write error manifest ({}) : {}", manifest_path.display(), e))?;

    let override_data = EdgeOverride {
        artifact_id: final_manifest.artifact.id.clone(),
        mason_id: final_manifest.artifact.author.clone(),
        game_id: final_manifest.artifact.game_id.clone(),
        manifest_url: if custom_url.is_empty() { "https://your-domain.com/manifest.json".to_string() } else { custom_url },
        target_hash: actual_hash.clone(),
        archive_hashes: merged_archive_hashes,
        last_fetched_hash: None,
        last_fetched_metadata: None,
    };

    let override_str = serde_json::to_string_pretty(&override_data).map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&override_path, &override_str).map_err(|e| format!("Write error override ({}) : {}", override_path.display(), e))?;

    // Package mod files + override.json into a clean release .zip archive in the mod directory
    let safe_name: String = final_manifest
        .artifact
        .name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe_ver: String = final_manifest
        .artifact
        .version
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let zip_filename = format!("{}_v{}.zip", if safe_name.is_empty() { "release".to_string() } else { safe_name }, if safe_ver.is_empty() { "1.0.0".to_string() } else { safe_ver });
    let zip_path = mod_dir.join(&zip_filename);
    if let Ok(zip_file) = fs::File::create(&zip_path) {
        let mut zip_writer = zip::ZipWriter::new(zip_file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for pkg in &package_files {
            if let Ok(rel) = pkg.strip_prefix(&mod_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if zip_writer.start_file(rel_str, options).is_ok() {
                    if let Ok(mut f) = fs::File::open(pkg) {
                        let mut buf = Vec::new();
                        if f.read_to_end(&mut buf).is_ok() {
                            let _ = zip_writer.write_all(&buf);
                        }
                    }
                }
            }
        }
        if zip_writer.start_file("override.json", options).is_ok() {
            let _ = zip_writer.write_all(override_str.as_bytes());
        }
        let _ = zip_writer.finish();
    }

    Ok(())
}
