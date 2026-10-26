use serde::{Deserialize, Deserializer, Serialize};
use reqwest::Client;
use crate::utils::get_db_conn;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeOverride {
    pub artifact_id: String,
    pub mason_id: String,
    pub game_id: String,
    pub manifest_url: String,
    pub target_hash: String,
    pub archive_hashes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fetched_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fetched_metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeArtifactMeta {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub game_version: String,
    pub release_date: String,
    pub game_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgePayloadMeta {
    pub download_url: String,
    pub sha256: String,
    pub archive_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeModuleEntry {
    pub name: String,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct DependencyRule {
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_version: Option<String>,
}

impl<'de> Deserialize<'de> for DependencyRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawDep {
            Str(String),
            Obj {
                #[serde(default)]
                hash: String,
                #[serde(default)]
                id: Option<String>,
                #[serde(default)]
                name: Option<String>,
                #[serde(default)]
                min_version: Option<String>,
            },
        }
        match RawDep::deserialize(deserializer)? {
            RawDep::Str(s) => Ok(DependencyRule {
                hash: s.clone(),
                id: Some(s.clone()),
                name: Some(s),
                min_version: None,
            }),
            RawDep::Obj {
                hash,
                id,
                name,
                min_version,
            } => {
                let resolved_hash = if !hash.is_empty() {
                    hash
                } else if let Some(ref i) = id {
                    i.clone()
                } else if let Some(ref n) = name {
                    n.clone()
                } else {
                    String::new()
                };
                Ok(DependencyRule {
                    hash: resolved_hash,
                    id,
                    name,
                    min_version,
                })
            }
        }
    }
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ConflictRule {
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub severity: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl<'de> Deserialize<'de> for ConflictRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawConflict {
            Str(String),
            Obj {
                #[serde(default)]
                hash: String,
                #[serde(default)]
                id: Option<String>,
                #[serde(default)]
                name: Option<String>,
                #[serde(default)]
                severity: Option<u8>,
                #[serde(default)]
                tier: Option<u8>,
                #[serde(default)]
                description: Option<String>,
            },
        }
        match RawConflict::deserialize(deserializer)? {
            RawConflict::Str(s) => Ok(ConflictRule {
                hash: s.clone(),
                id: Some(s.clone()),
                name: Some(s),
                severity: 3,
                description: None,
            }),
            RawConflict::Obj {
                hash,
                id,
                name,
                severity,
                tier,
                description,
            } => {
                let resolved_hash = if !hash.is_empty() {
                    hash
                } else if let Some(ref i) = id {
                    i.clone()
                } else if let Some(ref n) = name {
                    n.clone()
                } else {
                    String::new()
                };
                Ok(ConflictRule {
                    hash: resolved_hash,
                    id,
                    name,
                    severity: severity.or(tier).unwrap_or(3),
                    description,
                })
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeAtomicLogic {
    pub required_dlc: Vec<String>,
    pub dependencies: Vec<DependencyRule>,
    pub twins: Vec<String>,
    pub addons: Vec<String>,
    pub conflicts: Vec<ConflictRule>,
    pub flavors: Vec<String>,
    pub collections: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeVirtualFilesystem {
    pub overrides: Vec<String>,
    pub injected_folders: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeManifest {
    pub schema_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_url: Option<String>,
    pub artifact: EdgeArtifactMeta,
    pub payload: EdgePayloadMeta,
    #[serde(default)]
    pub modules: Vec<EdgeModuleEntry>,
    #[serde(default)]
    pub current_hashes: Vec<String>,
    pub atomic_logic: EdgeAtomicLogic,
    pub virtual_filesystem: EdgeVirtualFilesystem,
    pub changelog: Vec<String>,
    #[serde(default)]
    pub previous_hashes: Vec<String>,
}

fn push_unique_hash(vec: &mut Vec<String>, hash: &str) {
    let trimmed = hash.trim();
    if trimmed.is_empty() {
        return;
    }
    if !vec.iter().any(|h| h.eq_ignore_ascii_case(trimmed)) {
        vec.push(trimmed.to_string());
    }
}

fn is_placeholder_manifest_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.is_empty()
        || lower.contains("your-domain.com")
        || lower.contains("example.com")
}

pub fn parse_manifest_or_catalog(
    raw_value: serde_json::Value,
    artifact_id_or_hash: &str,
) -> Result<EdgeManifest, String> {
    let needle = artifact_id_or_hash.trim().to_lowercase();
    let candidates_opt = if let Some(arr) = raw_value.as_array() {
        Some(arr.clone())
    } else if let Some(arr) = raw_value.get("artifacts").and_then(|v| v.as_array()) {
        Some(arr.clone())
    } else if let Some(arr) = raw_value.get("manifests").and_then(|v| v.as_array()) {
        Some(arr.clone())
    } else {
        None
    };

    if let Some(candidates) = candidates_opt {
        let mut parsed_list: Vec<EdgeManifest> = Vec::new();
        for item in candidates {
            if let Ok(m) = serde_json::from_value::<EdgeManifest>(item) {
                parsed_list.push(m);
            }
        }
        if parsed_list.is_empty() {
            return Err("Catalog contained no valid manifest entries".to_string());
        }
        if !needle.is_empty() {
            if let Some(found) = parsed_list.iter().find(|m| {
                m.artifact.id.to_lowercase() == needle
                    || m.artifact.name.to_lowercase() == needle
                    || m.payload.sha256.to_lowercase() == needle
                    || m.current_hashes.iter().any(|h| h.to_lowercase() == needle)
                    || m.modules
                        .iter()
                        .any(|mod_entry| mod_entry.sha256.to_lowercase() == needle)
                    || m.previous_hashes.iter().any(|h| h.to_lowercase() == needle)
            }) {
                return Ok(found.clone());
            }
        }
        return Ok(parsed_list.remove(0));
    }

    serde_json::from_value::<EdgeManifest>(raw_value)
        .map_err(|e| format!("JSON parsing failed: {}", e))
}

/// Parses an embedded or dropped `manifest.json` or `override.json`, merges extracted file hashes
/// and historical lineage hashes, and auto-registers into SQLite `edge_manifests` when no conflicting
/// URL exists for that artifact.
pub fn auto_ingest_edge_json(
    vault_path: &str,
    raw_json: &str,
    extracted_hashes: &[String],
) -> Option<(EdgeOverride, Option<EdgeManifest>, bool)> {
    let val: serde_json::Value = serde_json::from_str(raw_json).ok()?;
    let is_manifest_doc = val.get("artifact").is_some()
        || val.get("payload").is_some()
        || val.get("atomic_logic").is_some();
    let is_override_doc = val.get("manifest_url").is_some()
        && (val.get("artifact_id").is_some() || val.get("target_hash").is_some());

    if !is_manifest_doc && !is_override_doc {
        return None;
    }

    let mut manifest_opt: Option<EdgeManifest> = None;
    let mut ovr = if is_manifest_doc {
        let mut m: EdgeManifest = serde_json::from_value(val.clone()).ok()?;
        for eh in extracted_hashes {
            push_unique_hash(&mut m.current_hashes, eh);
        }
        if m.payload.sha256.trim().is_empty() {
            if let Some(first_h) = extracted_hashes
                .first()
                .or_else(|| m.modules.first().map(|e| &e.sha256))
                .or_else(|| m.current_hashes.first())
            {
                m.payload.sha256 = first_h.clone();
            }
        }
        for mod_entry in &m.modules {
            push_unique_hash(&mut m.current_hashes, &mod_entry.sha256);
        }
        push_unique_hash(&mut m.current_hashes, &m.payload.sha256);

        let mut all_archive_hashes = Vec::new();
        for h in &m.current_hashes {
            if !h.eq_ignore_ascii_case(&m.payload.sha256) {
                push_unique_hash(&mut all_archive_hashes, h);
            }
        }
        for h in &m.previous_hashes {
            push_unique_hash(&mut all_archive_hashes, h);
        }
        for h in &m.atomic_logic.flavors {
            push_unique_hash(&mut all_archive_hashes, h);
        }

        let resolved_url = m
            .manifest_url
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        let resolved_id = if !m.artifact.id.trim().is_empty() {
            m.artifact.id.trim().to_string()
        } else if !m.artifact.name.trim().is_empty() {
            m.artifact.name.trim().to_string()
        } else {
            m.payload.sha256.clone()
        };

        let meta_str = serde_json::to_string(&m).ok();
        let built = EdgeOverride {
            artifact_id: resolved_id,
            mason_id: m.artifact.author.clone(),
            game_id: m.artifact.game_id.clone(),
            manifest_url: resolved_url,
            target_hash: m.payload.sha256.clone(),
            archive_hashes: all_archive_hashes,
            last_fetched_hash: if m.payload.sha256.is_empty() {
                None
            } else {
                Some(m.payload.sha256.clone())
            },
            last_fetched_metadata: meta_str,
        };
        manifest_opt = Some(m);
        built
    } else {
        let mut o: EdgeOverride = serde_json::from_value(val).ok()?;
        if o.target_hash.trim().is_empty() {
            if let Some(first_h) = extracted_hashes.first() {
                o.target_hash = first_h.clone();
            }
        }
        for eh in extracted_hashes {
            if !eh.eq_ignore_ascii_case(&o.target_hash) {
                push_unique_hash(&mut o.archive_hashes, eh);
            }
        }
        if let Some(ref meta_str) = o.last_fetched_metadata {
            if let Ok(mut m) = serde_json::from_str::<EdgeManifest>(meta_str) {
                for eh in extracted_hashes {
                    push_unique_hash(&mut m.current_hashes, eh);
                }
                manifest_opt = Some(m);
            }
        }
        o
    };

    if vault_path.trim().is_empty() {
        return Some((ovr, manifest_opt, true));
    }

    let conn = get_db_conn(vault_path);
    let existing_row: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT COALESCE(manifest_url, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests
             WHERE artifact_id = ?1 OR (target_hash != '' AND target_hash = ?2)",
            rusqlite::params![ovr.artifact_id, ovr.target_hash],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let mut auto_accepted = true;
    if let Some((existing_url, existing_target, existing_arch_str, existing_meta)) = existing_row {
        if !is_placeholder_manifest_url(&existing_url)
            && !is_placeholder_manifest_url(&ovr.manifest_url)
            && !existing_url.eq_ignore_ascii_case(&ovr.manifest_url)
        {
            auto_accepted = false;
        }
        if is_placeholder_manifest_url(&ovr.manifest_url) && !existing_url.is_empty() {
            ovr.manifest_url = existing_url;
        }
        if !existing_target.is_empty() && !existing_target.eq_ignore_ascii_case(&ovr.target_hash) {
            push_unique_hash(&mut ovr.archive_hashes, &existing_target);
        }
        if let Ok(existing_arch) = serde_json::from_str::<Vec<String>>(&existing_arch_str) {
            for h in existing_arch {
                if !h.eq_ignore_ascii_case(&ovr.target_hash) {
                    push_unique_hash(&mut ovr.archive_hashes, &h);
                }
            }
        }
        if ovr.last_fetched_metadata.is_none() && !existing_meta.is_empty() {
            ovr.last_fetched_metadata = Some(existing_meta);
        }
    }

    if auto_accepted {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let archive_hashes_str =
            serde_json::to_string(&ovr.archive_hashes).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute(
            "INSERT OR REPLACE INTO edge_manifests (
                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                last_fetched_hash, last_fetched_metadata, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                ovr.artifact_id,
                ovr.mason_id,
                ovr.manifest_url,
                ovr.target_hash,
                archive_hashes_str,
                ovr.game_id,
                ovr.last_fetched_hash.clone().unwrap_or_default(),
                ovr.last_fetched_metadata.clone().unwrap_or_default(),
                now
            ],
        );
    }

    Some((ovr, manifest_opt, auto_accepted))
}

#[tauri::command]
pub async fn register_edge_override(vault_path: String, override_data: EdgeOverride) -> Result<(), String> {
    let conn = get_db_conn(&vault_path);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    let mut merged_archives = override_data.archive_hashes.clone();
    let mut existing_meta = override_data.last_fetched_metadata.clone().unwrap_or_default();
    let mut existing_fetched_hash = override_data.last_fetched_hash.clone().unwrap_or_default();

    if let Ok((old_target, old_archives_str, old_hash, old_meta)) = conn.query_row(
        "SELECT COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_hash, ''), COALESCE(last_fetched_metadata, '')
         FROM edge_manifests WHERE artifact_id = ?1",
        rusqlite::params![override_data.artifact_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    ) {
        if !old_target.is_empty() && !old_target.eq_ignore_ascii_case(&override_data.target_hash) {
            push_unique_hash(&mut merged_archives, &old_target);
        }
        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&old_archives_str) {
            for h in parsed {
                if !h.eq_ignore_ascii_case(&override_data.target_hash) {
                    push_unique_hash(&mut merged_archives, &h);
                }
            }
        }
        if existing_meta.is_empty() && !old_meta.is_empty() {
            existing_meta = old_meta;
        }
        if existing_fetched_hash.is_empty() && !old_hash.is_empty() {
            existing_fetched_hash = old_hash;
        }
    }

    let archive_hashes_str = serde_json::to_string(&merged_archives).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO edge_manifests (
            artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
            last_fetched_hash, last_fetched_metadata, created_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            override_data.artifact_id,
            override_data.mason_id,
            override_data.manifest_url,
            override_data.target_hash,
            archive_hashes_str,
            override_data.game_id,
            existing_fetched_hash,
            existing_meta,
            now
        ],
    ).map_err(|e| format!("DB Error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_and_sync_edge_manifest(vault_path: String, artifact_id: String) -> Result<EdgeManifest, String> {
    let (resolved_artifact_id, manifest_url, existing_target_hash, existing_archive_str): (String, String, String, String) = {
        let conn = get_db_conn(&vault_path);
        let like_pattern = format!("%\"{}\"%", artifact_id);
        conn.query_row(
            "SELECT artifact_id, manifest_url, COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]')
             FROM edge_manifests
             WHERE artifact_id = ?1 OR target_hash = ?1 OR archive_hashes LIKE ?2",
            rusqlite::params![artifact_id, like_pattern],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        ).map_err(|e| format!("Edge manifest not found: {}", e))?
    };

    if is_placeholder_manifest_url(&manifest_url) {
        return Err("Placeholder manifest URL cannot be polled".to_string());
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_else(|_| Client::new());
    let resp = client.get(&manifest_url).send().await.map_err(|e| format!("HTTP request failed: {}", e))?;
    let raw_val: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parsing failed: {}", e))?;
    let mut manifest = parse_manifest_or_catalog(raw_val, &resolved_artifact_id)?;

    if manifest.manifest_url.is_none() {
        manifest.manifest_url = Some(manifest_url.clone());
    }
    for mod_entry in &manifest.modules {
        push_unique_hash(&mut manifest.current_hashes, &mod_entry.sha256);
    }
    push_unique_hash(&mut manifest.current_hashes, &manifest.payload.sha256);

    let mut archive_hashes: Vec<String> = serde_json::from_str(&existing_archive_str).unwrap_or_default();
    if !existing_target_hash.is_empty()
        && !existing_target_hash.eq_ignore_ascii_case(&manifest.payload.sha256)
    {
        push_unique_hash(&mut archive_hashes, &existing_target_hash);
        if !manifest
            .current_hashes
            .iter()
            .any(|ch| ch.eq_ignore_ascii_case(&existing_target_hash))
        {
            push_unique_hash(&mut manifest.previous_hashes, &existing_target_hash);
        }
    }
    for h in &manifest.previous_hashes {
        push_unique_hash(&mut archive_hashes, h);
    }
    for h in &manifest.current_hashes {
        if !h.eq_ignore_ascii_case(&manifest.payload.sha256) {
            push_unique_hash(&mut archive_hashes, h);
        }
    }

    let metadata_str = serde_json::to_string(&manifest).unwrap_or_default();
    let updated_archive_str = serde_json::to_string(&archive_hashes).unwrap_or_else(|_| "[]".to_string());
    let new_target_hash = if !manifest.payload.sha256.is_empty() {
        manifest.payload.sha256.clone()
    } else {
        existing_target_hash
    };

    let conn = get_db_conn(&vault_path);
    conn.execute(
        "UPDATE edge_manifests SET last_fetched_hash = ?1, last_fetched_metadata = ?2, target_hash = ?3, archive_hashes = ?4 WHERE artifact_id = ?5",
        rusqlite::params![manifest.payload.sha256, metadata_str, new_target_hash, updated_archive_str, resolved_artifact_id],
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

#[tauri::command]
pub async fn export_edge_release(
    vault_path: String,
    sandbox_mod_name: String,
    manifest: EdgeManifest,
    custom_url: String,
    push_config: Option<EdgePushConfig>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<String, String> {
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
    
    // Collect all current release hashes and module entries in the directory
    let mut current_hashes = Vec::new();
    let mut current_modules = Vec::new();
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
                    push_unique_hash(&mut current_hashes, &h);
                    let rel_name = p
                        .strip_prefix(&mod_dir)
                        .unwrap_or(p)
                        .to_string_lossy()
                        .replace('\\', "/");
                    current_modules.push(EdgeModuleEntry {
                        name: rel_name,
                        sha256: h,
                        role: Some(if ext == "ts4script" { "script".to_string() } else { "package".to_string() }),
                    });
                }
            }
        }
    }
    push_unique_hash(&mut current_hashes, &actual_hash);

    // Gather all historical lineage hashes from:
    // 1. Incoming manifest.previous_hashes
    // 2. Existing manifest.json in mod_dir (before we overwrite it)
    // 3. Existing override.json in mod_dir
    // 4. SQLite edge_manifests table (target_hash, archive_hashes, and cached manifest metadata)
    let mut candidate_lineage_hashes = Vec::new();
    for h in &manifest.previous_hashes {
        push_unique_hash(&mut candidate_lineage_hashes, h);
    }

    let manifest_path = mod_dir.join("manifest.json");
    if manifest_path.exists() {
        if let Ok(old_manifest_str) = fs::read_to_string(&manifest_path) {
            if let Ok(old_manifest) = serde_json::from_str::<EdgeManifest>(&old_manifest_str) {
                push_unique_hash(&mut candidate_lineage_hashes, &old_manifest.payload.sha256);
                for m_entry in &old_manifest.modules {
                    push_unique_hash(&mut candidate_lineage_hashes, &m_entry.sha256);
                }
                for ch in &old_manifest.current_hashes {
                    push_unique_hash(&mut candidate_lineage_hashes, ch);
                }
                for ph in &old_manifest.previous_hashes {
                    push_unique_hash(&mut candidate_lineage_hashes, ph);
                }
            }
        }
    }

    let override_path = mod_dir.join("override.json");
    if override_path.exists() {
        if let Ok(old_data) = fs::read_to_string(&override_path) {
            if let Ok(old_override) = serde_json::from_str::<EdgeOverride>(&old_data) {
                push_unique_hash(&mut candidate_lineage_hashes, &old_override.target_hash);
                for h in old_override.archive_hashes {
                    push_unique_hash(&mut candidate_lineage_hashes, &h);
                }
            }
        }
        let _ = fs::remove_file(&override_path);
    }

    {
        let conn = get_db_conn(&vault_path);
        if let Ok((existing_target, existing_archive_str, existing_meta_str)) = conn.query_row(
            "SELECT COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests WHERE artifact_id = ?1 OR target_hash = ?2",
            rusqlite::params![manifest.artifact.id, actual_hash],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
        ) {
            push_unique_hash(&mut candidate_lineage_hashes, &existing_target);
            if let Ok(db_archives) = serde_json::from_str::<Vec<String>>(&existing_archive_str) {
                for h in db_archives {
                    push_unique_hash(&mut candidate_lineage_hashes, &h);
                }
            }
            if let Ok(old_db_manifest) = serde_json::from_str::<EdgeManifest>(&existing_meta_str) {
                push_unique_hash(&mut candidate_lineage_hashes, &old_db_manifest.payload.sha256);
                for m_entry in &old_db_manifest.modules {
                    push_unique_hash(&mut candidate_lineage_hashes, &m_entry.sha256);
                }
                for ch in &old_db_manifest.current_hashes {
                    push_unique_hash(&mut candidate_lineage_hashes, ch);
                }
                for ph in &old_db_manifest.previous_hashes {
                    push_unique_hash(&mut candidate_lineage_hashes, ph);
                }
            }
        }
    }

    // Separate historical previous_hashes (hashes from prior versions not in current_hashes)
    // from sqlite_archive_hashes (union of sibling module hashes + historical previous_hashes)
    let mut historical_previous_hashes = Vec::new();
    for h in &candidate_lineage_hashes {
        if !current_hashes.iter().any(|ch| ch.eq_ignore_ascii_case(h)) {
            push_unique_hash(&mut historical_previous_hashes, h);
        }
    }

    let mut sqlite_archive_hashes = historical_previous_hashes.clone();
    for h in &current_hashes {
        if !h.eq_ignore_ascii_case(&actual_hash) {
            push_unique_hash(&mut sqlite_archive_hashes, h);
        }
    }

    let mut effective_url = if !custom_url.trim().is_empty() {
        custom_url.trim().to_string()
    } else if let Some(ref m_url) = manifest.manifest_url {
        if !m_url.trim().is_empty() {
            m_url.trim().to_string()
        } else {
            "https://your-domain.com/manifest.json".to_string()
        }
    } else {
        "https://your-domain.com/manifest.json".to_string()
    };

    let mut final_manifest = manifest.clone();
    final_manifest.manifest_url = Some(effective_url.clone());
    final_manifest.payload.sha256 = actual_hash.clone();
    final_manifest.modules = current_modules;
    final_manifest.current_hashes = current_hashes.clone();
    final_manifest.previous_hashes = historical_previous_hashes;

    // If an Auto-Push provider is configured, push (and merge remote lineage / catalog.json)
    // BEFORE writing manifest.json, override.json, and the release .zip so the resolved live URL
    // and any remote lineage hashes are baked into the release!
    if let Some(ref cfg) = push_config {
        let p = cfg.provider.trim().to_lowercase();
        if !p.is_empty() && p != "manual" && p != "none" {
            let push_res = execute_edge_manifest_push(&mut final_manifest, cfg, &effective_url).await?;
            if !push_res.resolved_manifest_url.trim().is_empty() {
                effective_url = push_res.resolved_manifest_url.clone();
                final_manifest.manifest_url = Some(effective_url.clone());
            }
            for ph in &final_manifest.previous_hashes {
                if !ph.eq_ignore_ascii_case(&actual_hash) {
                    push_unique_hash(&mut sqlite_archive_hashes, ph);
                }
            }
        }
    }

    let manifest_str = serde_json::to_string_pretty(&final_manifest).map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&manifest_path, &manifest_str).map_err(|e| format!("Write error manifest ({}) : {}", manifest_path.display(), e))?;

    let override_data = EdgeOverride {
        artifact_id: final_manifest.artifact.id.clone(),
        mason_id: final_manifest.artifact.author.clone(),
        game_id: final_manifest.artifact.game_id.clone(),
        manifest_url: effective_url,
        target_hash: actual_hash.clone(),
        archive_hashes: sqlite_archive_hashes,
        last_fetched_hash: Some(actual_hash.clone()),
        last_fetched_metadata: Some(manifest_str.clone()),
    };

    let override_str = serde_json::to_string_pretty(&override_data).map_err(|e| format!("JSON error: {}", e))?;

    // Sync lineage directly into the local SQLite database so no loose override.json is needed on disk
    {
        let conn = get_db_conn(&vault_path);
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let archive_hashes_str = serde_json::to_string(&override_data.archive_hashes).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute(
            "INSERT OR REPLACE INTO edge_manifests (
                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                last_fetched_hash, last_fetched_metadata, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                override_data.artifact_id,
                override_data.mason_id,
                override_data.manifest_url,
                override_data.target_hash,
                archive_hashes_str,
                override_data.game_id,
                actual_hash,
                manifest_str,
                now
            ],
        );
    }

    // Package mod files + manifest.json + override.json into a clean release .zip archive in the mod directory
    let safe_name: String = final_manifest
        .artifact
        .name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe_ver: String = final_manifest
        .artifact
        .version
        .trim_start_matches(|c| c == 'v' || c == 'V')
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let zip_filename = format!(
        "{}_v{}.zip",
        if safe_name.is_empty() { "release".to_string() } else { safe_name },
        if safe_ver.is_empty() { "1.0.0".to_string() } else { safe_ver }
    );
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
        if zip_writer.start_file("manifest.json", options).is_ok() {
            let _ = zip_writer.write_all(manifest_str.as_bytes());
        }
        if zip_writer.start_file("override.json", options).is_ok() {
            let _ = zip_writer.write_all(override_str.as_bytes());
        }
        let _ = zip_writer.finish();
    }

    Ok(mod_dir.to_string_lossy().to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgePushConfig {
    pub provider: String,
    pub target_mode: String,
    pub token: String,
    pub repo_or_project: String,
    pub branch: String,
    pub remote_path: String,
    pub custom_endpoint: String,
    pub local_folder_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EdgePushResult {
    pub resolved_manifest_url: String,
    pub provider_ref: String,
    pub message: String,
}

fn base64_encode_bytes(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn base64_decode_str(input: &str) -> Option<String> {
    let mut val = 0u32;
    let mut bits = 0i32;
    let mut bytes = Vec::new();
    for ch in input.bytes() {
        let d = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b'\r' | b'\n' | b' ' | b'\t' => continue,
            _ => return None,
        };
        val = (val << 6) | (d as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes.push(((val >> bits) & 0xFF) as u8);
        }
    }
    String::from_utf8(bytes).ok()
}

fn url_encode_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn absorb_existing_remote_lineage_and_prepare_payload(
    existing_json_str: Option<&str>,
    manifest: &mut EdgeManifest,
    is_catalog: bool,
) -> Result<String, String> {
    let absorb_from_old = |old_m: &EdgeManifest, target: &mut EdgeManifest| {
        if !old_m.payload.sha256.is_empty()
            && !target
                .current_hashes
                .iter()
                .any(|ch| ch.eq_ignore_ascii_case(&old_m.payload.sha256))
        {
            push_unique_hash(&mut target.previous_hashes, &old_m.payload.sha256);
        }
        for ch in &old_m.current_hashes {
            if !target.current_hashes.iter().any(|c| c.eq_ignore_ascii_case(ch)) {
                push_unique_hash(&mut target.previous_hashes, ch);
            }
        }
        for mod_entry in &old_m.modules {
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(&mod_entry.sha256))
            {
                push_unique_hash(&mut target.previous_hashes, &mod_entry.sha256);
            }
        }
        for ph in &old_m.previous_hashes {
            if !target.current_hashes.iter().any(|c| c.eq_ignore_ascii_case(ph)) {
                push_unique_hash(&mut target.previous_hashes, ph);
            }
        }
    };

    if is_catalog {
        let mut catalog_val: serde_json::Value = existing_json_str
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .unwrap_or_else(|| {
                serde_json::json!({
                    "schema_version": 2,
                    "author": manifest.artifact.author,
                    "artifacts": []
                })
            });

        if !catalog_val.is_object() {
            catalog_val = serde_json::json!({
                "schema_version": 2,
                "author": manifest.artifact.author,
                "artifacts": []
            });
        }

        let key = if catalog_val.get("manifests").and_then(|v| v.as_array()).is_some() {
            "manifests"
        } else {
            "artifacts"
        };

        let mut arr = catalog_val
            .get(key)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut matched_idx: Option<usize> = None;
        for (idx, item) in arr.iter().enumerate() {
            if let Ok(old_m) = serde_json::from_value::<EdgeManifest>(item.clone()) {
                if (!old_m.artifact.id.is_empty()
                    && old_m.artifact.id.eq_ignore_ascii_case(&manifest.artifact.id))
                    || (!old_m.artifact.name.is_empty()
                        && old_m.artifact.name.eq_ignore_ascii_case(&manifest.artifact.name))
                {
                    absorb_from_old(&old_m, manifest);
                    matched_idx = Some(idx);
                    break;
                }
            }
        }

        let new_entry_val =
            serde_json::to_value(&*manifest).map_err(|e| format!("JSON serialize error: {}", e))?;
        if let Some(idx) = matched_idx {
            arr[idx] = new_entry_val;
        } else {
            arr.push(new_entry_val);
        }

        if let Some(obj) = catalog_val.as_object_mut() {
            obj.insert(key.to_string(), serde_json::Value::Array(arr));
        }

        serde_json::to_string_pretty(&catalog_val).map_err(|e| format!("Catalog JSON error: {}", e))
    } else {
        if let Some(raw) = existing_json_str {
            if let Ok(old_m) = serde_json::from_str::<EdgeManifest>(raw) {
                absorb_from_old(&old_m, manifest);
            }
        }
        serde_json::to_string_pretty(manifest).map_err(|e| format!("Manifest JSON error: {}", e))
    }
}

pub async fn execute_edge_manifest_push(
    manifest: &mut EdgeManifest,
    cfg: &EdgePushConfig,
    current_url: &str,
) -> Result<EdgePushResult, String> {
    let provider = cfg.provider.trim().to_lowercase();
    let is_catalog = cfg.target_mode.trim().eq_ignore_ascii_case("catalog");
    let branch = if cfg.branch.trim().is_empty() {
        "main".to_string()
    } else {
        cfg.branch.trim().to_string()
    };
    let default_filename = if is_catalog {
        "catalog.json".to_string()
    } else {
        format!("{}/manifest.json", manifest.artifact.id)
    };
    let remote_path = if cfg.remote_path.trim().is_empty() {
        default_filename
    } else {
        cfg.remote_path.trim().trim_start_matches('/').to_string()
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| Client::new());

    match provider.as_str() {
        "github_repo" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err("GitHub Personal Access Token is required for GitHub Repo Auto-Push.".to_string());
            }

            let mut repo_slug = cfg
                .repo_or_project
                .trim()
                .trim_start_matches("https://github.com/")
                .trim_start_matches("http://github.com/")
                .trim_end_matches(".git")
                .trim_matches('/')
                .to_string();
            let mut path_in_repo = remote_path.clone();
            let mut branch_name = branch.clone();

            // Auto-extract owner/repo/branch/path from raw.githubusercontent.com URL if repo_slug is empty
            if repo_slug.is_empty() && current_url.contains("raw.githubusercontent.com/") {
                if let Some(after) = current_url.split("raw.githubusercontent.com/").nth(1) {
                    let parts: Vec<&str> = after.split('/').collect();
                    if parts.len() >= 4 {
                        repo_slug = format!("{}/{}", parts[0], parts[1]);
                        if cfg.branch.trim().is_empty() {
                            branch_name = parts[2].to_string();
                        }
                        if cfg.remote_path.trim().is_empty() {
                            path_in_repo = parts[3..].join("/");
                        }
                    }
                }
            }

            if !repo_slug.contains('/') {
                return Err("GitHub Repository must be formatted as 'owner/repo' (e.g. 'myname/my-manifests').".to_string());
            }

            let resolved_url = if !is_placeholder_manifest_url(current_url)
                && !current_url.contains("raw.githubusercontent.com/")
            {
                current_url.to_string()
            } else {
                format!(
                    "https://raw.githubusercontent.com/{}/{}/{}",
                    repo_slug, branch_name, path_in_repo
                )
            };
            manifest.manifest_url = Some(resolved_url.clone());

            let api_url = format!(
                "https://api.github.com/repos/{}/contents/{}",
                repo_slug, path_in_repo
            );

            let mut existing_sha: Option<String> = None;
            let mut existing_content: Option<String> = None;

            if let Ok(get_resp) = client
                .get(&format!("{}?ref={}", api_url, url_encode_component(&branch_name)))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "Sanctuary-OS")
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(val) = get_resp.json::<serde_json::Value>().await {
                        existing_sha = val.get("sha").and_then(|v| v.as_str()).map(|s| s.to_string());
                        if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                            existing_content = base64_decode_str(b64);
                        }
                    }
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let mut body = serde_json::json!({
                "message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version),
                "content": base64_encode_bytes(payload_str.as_bytes()),
                "branch": branch_name,
            });
            if let Some(ref sha) = existing_sha {
                body["sha"] = serde_json::Value::String(sha.clone());
            }

            let put_resp = client
                .put(&api_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "Sanctuary-OS")
                .header("Accept", "application/vnd.github+json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("GitHub API request failed: {}", e))?;

            if !put_resp.status().is_success() {
                let status = put_resp.status();
                let err_txt = put_resp.text().await.unwrap_or_default();
                return Err(format!("GitHub Repo push failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: repo_slug,
                message: "Pushed to GitHub Repository".to_string(),
            })
        }

        "github_gist" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err("GitHub Token (with 'gist' scope) is required for GitHub Gist Auto-Push.".to_string());
            }

            let gist_filename = if is_catalog {
                "catalog.json".to_string()
            } else if !cfg.remote_path.trim().is_empty() {
                cfg.remote_path
                    .trim()
                    .split('/')
                    .last()
                    .unwrap_or("manifest.json")
                    .to_string()
            } else {
                format!("{}_manifest.json", manifest.artifact.id)
            };

            let mut gist_id = cfg
                .repo_or_project
                .trim()
                .trim_end_matches('/')
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();

            if gist_id.is_empty() && current_url.contains("gist.githubusercontent.com/") {
                if let Some(after) = current_url.split("gist.githubusercontent.com/").nth(1) {
                    let parts: Vec<&str> = after.split('/').collect();
                    if parts.len() >= 2 {
                        gist_id = parts[1].to_string();
                    }
                }
            }

            if !gist_id.is_empty() {
                let gist_api = format!("https://api.github.com/gists/{}", gist_id);
                let mut existing_content: Option<String> = None;
                let mut owner_login = String::new();

                if let Ok(get_resp) = client
                    .get(&gist_api)
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", "Sanctuary-OS")
                    .header("Accept", "application/vnd.github+json")
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(val) = get_resp.json::<serde_json::Value>().await {
                            owner_login = val
                                .get("owner")
                                .and_then(|o| o.get("login"))
                                .and_then(|l| l.as_str())
                                .unwrap_or("")
                                .to_string();
                            existing_content = val
                                .get("files")
                                .and_then(|f| f.get(&gist_filename))
                                .and_then(|f| f.get("content"))
                                .and_then(|c| c.as_str())
                                .map(|s| s.to_string());
                        }
                    }
                }

                let resolved_url = if !owner_login.is_empty() {
                    format!(
                        "https://gist.githubusercontent.com/{}/{}/raw/{}",
                        owner_login, gist_id, gist_filename
                    )
                } else if !is_placeholder_manifest_url(current_url) {
                    current_url.to_string()
                } else {
                    format!("https://gist.githubusercontent.com/raw/{}/{}", gist_id, gist_filename)
                };
                manifest.manifest_url = Some(resolved_url.clone());

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;

                let mut files_map = serde_json::Map::new();
                files_map.insert(
                    gist_filename.clone(),
                    serde_json::json!({ "content": payload_str }),
                );
                let patch_body = serde_json::json!({
                    "description": format!("Sanctuary OS Static Manifest: {}", manifest.artifact.name),
                    "files": files_map
                });

                let patch_resp = client
                    .patch(&gist_api)
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", "Sanctuary-OS")
                    .header("Accept", "application/vnd.github+json")
                    .json(&patch_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist PATCH failed: {}", e))?;

                if !patch_resp.status().is_success() {
                    let status = patch_resp.status();
                    let err_txt = patch_resp.text().await.unwrap_or_default();
                    return Err(format!("GitHub Gist update failed ({}): {}", status, err_txt));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: gist_id,
                    message: "Updated GitHub Gist".to_string(),
                })
            } else {
                // Create a brand-new Gist automatically on first push!
                let initial_payload =
                    absorb_existing_remote_lineage_and_prepare_payload(None, manifest, is_catalog)?;
                let mut files_map = serde_json::Map::new();
                files_map.insert(
                    gist_filename.clone(),
                    serde_json::json!({ "content": initial_payload }),
                );
                let create_body = serde_json::json!({
                    "description": format!("Sanctuary OS Static Manifest: {}", manifest.artifact.name),
                    "public": false,
                    "files": files_map
                });

                let post_resp = client
                    .post("https://api.github.com/gists")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", "Sanctuary-OS")
                    .header("Accept", "application/vnd.github+json")
                    .json(&create_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist creation failed: {}", e))?;

                if !post_resp.status().is_success() {
                    let status = post_resp.status();
                    let err_txt = post_resp.text().await.unwrap_or_default();
                    return Err(format!("GitHub Gist create failed ({}): {}", status, err_txt));
                }

                let created_val: serde_json::Value = post_resp
                    .json()
                    .await
                    .map_err(|e| format!("Invalid Gist response: {}", e))?;
                let new_gist_id = created_val
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let owner_login = created_val
                    .get("owner")
                    .and_then(|o| o.get("login"))
                    .and_then(|l| l.as_str())
                    .unwrap_or("anonymous")
                    .to_string();

                let resolved_url = format!(
                    "https://gist.githubusercontent.com/{}/{}/raw/{}",
                    owner_login, new_gist_id, gist_filename
                );
                manifest.manifest_url = Some(resolved_url.clone());

                // Patch the Gist immediately so its own manifest_url is embedded inside the JSON
                if let Ok(updated_payload) =
                    absorb_existing_remote_lineage_and_prepare_payload(None, manifest, is_catalog)
                {
                    let mut updated_files = serde_json::Map::new();
                    updated_files.insert(
                        gist_filename.clone(),
                        serde_json::json!({ "content": updated_payload }),
                    );
                    let _ = client
                        .patch(&format!("https://api.github.com/gists/{}", new_gist_id))
                        .header("Authorization", format!("Bearer {}", token))
                        .header("User-Agent", "Sanctuary-OS")
                        .header("Accept", "application/vnd.github+json")
                        .json(&serde_json::json!({ "files": updated_files }))
                        .send()
                        .await;
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: new_gist_id,
                    message: "Created & linked new GitHub Gist".to_string(),
                })
            }
        }

        "gitlab" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err("Access Token is required for GitLab / Codeberg Auto-Push.".to_string());
            }
            let base_host = if cfg.custom_endpoint.trim().is_empty() {
                if current_url.contains("codeberg.org") {
                    "https://codeberg.org".to_string()
                } else {
                    "https://gitlab.com".to_string()
                }
            } else {
                cfg.custom_endpoint.trim().trim_end_matches('/').to_string()
            };
            let project_slug = cfg
                .repo_or_project
                .trim()
                .trim_start_matches(&base_host)
                .trim_end_matches(".git")
                .trim_matches('/')
                .to_string();

            if !project_slug.contains('/') {
                return Err("Project path must be formatted as 'owner/repo'.".to_string());
            }

            if base_host.contains("codeberg.org") || base_host.contains("gitea") {
                let resolved_url = format!(
                    "{}/{}/raw/branch/{}/{}",
                    base_host, project_slug, branch, remote_path
                );
                manifest.manifest_url = Some(resolved_url.clone());

                let api_url = format!(
                    "{}/api/v1/repos/{}/contents/{}",
                    base_host, project_slug, remote_path
                );
                let mut existing_sha: Option<String> = None;
                let mut existing_content: Option<String> = None;

                if let Ok(get_resp) = client
                    .get(&format!("{}?ref={}", api_url, url_encode_component(&branch)))
                    .header("Authorization", format!("token {}", token))
                    .header("User-Agent", "Sanctuary-OS")
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(val) = get_resp.json::<serde_json::Value>().await {
                            existing_sha = val.get("sha").and_then(|v| v.as_str()).map(|s| s.to_string());
                            if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                                existing_content = base64_decode_str(b64);
                            }
                        }
                    }
                }

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;
                let mut body = serde_json::json!({
                    "message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version),
                    "content": base64_encode_bytes(payload_str.as_bytes()),
                    "branch": branch,
                });
                let req = if let Some(sha) = existing_sha {
                    body["sha"] = serde_json::Value::String(sha);
                    client.put(&api_url)
                } else {
                    client.post(&api_url)
                };

                let resp = req
                    .header("Authorization", format!("token {}", token))
                    .header("User-Agent", "Sanctuary-OS")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Codeberg/Gitea request failed: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_txt = resp.text().await.unwrap_or_default();
                    return Err(format!("Codeberg/Gitea push failed ({}): {}", status, err_txt));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: project_slug,
                    message: "Pushed to Codeberg / Gitea".to_string(),
                })
            } else {
                let resolved_url = format!(
                    "{}/{}/-/raw/{}/{}",
                    base_host, project_slug, branch, remote_path
                );
                manifest.manifest_url = Some(resolved_url.clone());

                let enc_proj = url_encode_component(&project_slug);
                let enc_path = url_encode_component(&remote_path);
                let raw_api = format!(
                    "{}/api/v4/projects/{}/repository/files/{}/raw?ref={}",
                    base_host,
                    enc_proj,
                    enc_path,
                    url_encode_component(&branch)
                );
                let file_api = format!(
                    "{}/api/v4/projects/{}/repository/files/{}",
                    base_host, enc_proj, enc_path
                );

                let mut file_exists = false;
                let mut existing_content: Option<String> = None;
                if let Ok(get_resp) = client
                    .get(&raw_api)
                    .header("PRIVATE-TOKEN", token)
                    .header("User-Agent", "Sanctuary-OS")
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        file_exists = true;
                        existing_content = get_resp.text().await.ok();
                    }
                }

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;
                let body = serde_json::json!({
                    "branch": branch,
                    "content": payload_str,
                    "commit_message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version)
                });

                let req = if file_exists {
                    client.put(&file_api)
                } else {
                    client.post(&file_api)
                };
                let resp = req
                    .header("PRIVATE-TOKEN", token)
                    .header("User-Agent", "Sanctuary-OS")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("GitLab request failed: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_txt = resp.text().await.unwrap_or_default();
                    return Err(format!("GitLab push failed ({}): {}", status, err_txt));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: project_slug,
                    message: "Pushed to GitLab Repository".to_string(),
                })
            }
        }

        "neocities" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err("Neocities API Key is required for Neocities Auto-Push.".to_string());
            }
            let site_name = cfg
                .repo_or_project
                .trim()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches(".neocities.org")
                .trim_matches('/')
                .to_string();

            let resolved_url = if !site_name.is_empty() {
                format!("https://{}.neocities.org/{}", site_name, remote_path)
            } else if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                return Err("Enter your Neocities site name (e.g. 'mycreatorname') or full URL.".to_string());
            };
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client.get(&resolved_url).send().await {
                if get_resp.status().is_success() {
                    existing_content = get_resp.text().await.ok();
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let boundary = "----SanctuaryOSNeocitiesBoundary987654321";
            let mut body_bytes = Vec::new();
            let header_part = format!(
                "--{}\r\nContent-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: application/json\r\n\r\n",
                boundary, remote_path, remote_path
            );
            body_bytes.extend_from_slice(header_part.as_bytes());
            body_bytes.extend_from_slice(payload_str.as_bytes());
            body_bytes.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

            let auth_header = if token.contains(':') {
                format!("Basic {}", base64_encode_bytes(token.as_bytes()))
            } else {
                format!("Bearer {}", token)
            };

            let resp = client
                .post("https://neocities.org/api/upload")
                .header("Authorization", auth_header)
                .header("User-Agent", "Sanctuary-OS")
                .header(
                    "Content-Type",
                    format!("multipart/form-data; boundary={}", boundary),
                )
                .body(body_bytes)
                .send()
                .await
                .map_err(|e| format!("Neocities upload failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                return Err(format!("Neocities push failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: site_name,
                message: "Uploaded to Neocities".to_string(),
            })
        }

        "custom_http" => {
            let target_endpoint = if !cfg.custom_endpoint.trim().is_empty() {
                cfg.custom_endpoint.trim().to_string()
            } else if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                return Err("Custom HTTP PUT/WebDAV URL is required.".to_string());
            };

            let resolved_url = if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                target_endpoint.clone()
            };
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client.get(&resolved_url).send().await {
                if get_resp.status().is_success() {
                    existing_content = get_resp.text().await.ok();
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let mut req = client
                .put(&target_endpoint)
                .header("Content-Type", "application/json")
                .header("User-Agent", "Sanctuary-OS");
            let token = cfg.token.trim();
            if !token.is_empty() {
                let auth_header = if token.contains(':') {
                    format!("Basic {}", base64_encode_bytes(token.as_bytes()))
                } else {
                    format!("Bearer {}", token)
                };
                req = req.header("Authorization", auth_header);
            }

            let resp = req
                .body(payload_str)
                .send()
                .await
                .map_err(|e| format!("Custom HTTP PUT failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                return Err(format!("Custom HTTP PUT failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: target_endpoint,
                message: "Pushed via Custom HTTP PUT / WebDAV".to_string(),
            })
        }

        "local_folder" => {
            if cfg.local_folder_path.trim().is_empty() {
                return Err("Select a Local Synced Folder path for Local Folder Auto-Push.".to_string());
            }
            let dest_root = PathBuf::from(cfg.local_folder_path.trim());
            let dest_file = dest_root.join(&remote_path);
            if let Some(parent) = dest_file.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create target folder: {}", e))?;
            }

            let existing_content = if dest_file.exists() {
                fs::read_to_string(&dest_file).ok()
            } else {
                None
            };

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            fs::write(&dest_file, &payload_str)
                .map_err(|e| format!("Failed to write to local synced folder: {}", e))?;

            Ok(EdgePushResult {
                resolved_manifest_url: current_url.to_string(),
                provider_ref: dest_file.to_string_lossy().to_string(),
                message: format!("Synced to {}", dest_file.display()),
            })
        }

        other => Err(format!("Unsupported Auto-Push provider: {}", other)),
    }
}

#[tauri::command]
pub async fn push_static_edge_manifest(
    mut manifest: EdgeManifest,
    custom_url: String,
    push_config: EdgePushConfig,
) -> Result<EdgePushResult, String> {
    let effective_url = if !custom_url.trim().is_empty() {
        custom_url.trim().to_string()
    } else {
        manifest.manifest_url.clone().unwrap_or_default()
    };
    execute_edge_manifest_push(&mut manifest, &push_config, &effective_url).await
}
