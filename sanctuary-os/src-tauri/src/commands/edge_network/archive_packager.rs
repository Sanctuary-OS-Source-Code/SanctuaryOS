#![allow(unused_imports)]
use crate::utils::{
    atomic_write_bytes, ensure_path_within_roots, ensure_strict_descendant_of_roots,
    get_vault_mods_lane, get_vault_root_dir, is_mods_dir, is_safe_user_file_path, open_db_conn,
    SANCTUARY_EDGE_MANIFEST_FILE, SANCTUARY_EDGE_OVERRIDE_FILE,
};
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use super::types::*;
use super::manifest_sync::*;
use super::batch_poller::*;

pub(super) fn has_parent_dir_component(p: &Path) -> bool {
    p.components().any(|c| matches!(c, Component::ParentDir))
}

pub(super) fn should_skip_export_file(rel_path: &Path, target_zip_name: &str) -> bool {
    let fname = rel_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if fname.is_empty() {
        return true;
    }
    let lower = fname.to_ascii_lowercase();
    if lower == SANCTUARY_EDGE_MANIFEST_FILE
        || lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || lower == ".ds_store"
        || lower == "thumbs.db"
        || lower == "desktop.ini"
        || lower.starts_with(".sanctuary")
        || lower.contains(".tmp.")
    {
        return true;
    }
    if fname.eq_ignore_ascii_case(target_zip_name) {
        return true;
    }
    // Avoid recursively bundling a prior exported `*_vX.Y.Z.zip` sitting at the root of `mod_dir`
    if rel_path.components().count() == 1 && lower.ends_with(".zip") && lower.contains("_v") {
        return true;
    }
    false
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
    let game_schema = state.active_schema.lock().unwrap().clone();
    let vp_stage = vault_path.clone();
    let manifest_stage = manifest.clone();
    let custom_url_stage = custom_url.clone();

    let (
        mod_dir,
        export_files,
        actual_hash,
        mut final_manifest,
        mut sqlite_archive_hashes,
        mut effective_url,
        zip_filename,
    ) = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let vault_root = get_vault_root_dir(&vp_stage);
        if !is_safe_user_file_path(&vault_root) {
            return Err("Refusing to export release from unsafe Vault path.".to_string());
        }
        let vault_dir = PathBuf::from(&vp_stage);
        let dev_lane = if is_mods_dir(&vault_dir) {
            vault_dir
                .parent()
                .unwrap_or(&vault_dir)
                .join("Dev")
                .join("Sandbox")
        } else {
            vault_dir.join("Dev").join("Sandbox")
        };
        let mods_lane = get_vault_mods_lane(&vp_stage);
        fs::create_dir_all(&dev_lane)
            .map_err(|e| format!("Failed to initialize Sandbox lane: {}", e))?;

        let allowed_vault_roots = vec![dev_lane.clone(), mods_lane.clone(), vault_root];

        let raw_input_path = Path::new(sandbox_mod_name.trim());
        if has_parent_dir_component(raw_input_path) {
            return Err("Invalid sandbox mod path: parent traversal ('..') is forbidden.".to_string());
        }

        let mut mod_dir = dev_lane.join(raw_input_path);
        let mut base_lane = dev_lane.clone();
        let mut is_from_mods_lane = false;

        if !mod_dir.exists() {
            let direct_path = PathBuf::from(sandbox_mod_name.trim());
            if direct_path.is_absolute() && direct_path.exists() {
                let checked = ensure_strict_descendant_of_roots(&direct_path, &allowed_vault_roots)?;
                if let Ok(canon_mods) = ensure_path_within_roots(&mods_lane, &allowed_vault_roots) {
                    if crate::utils::path_is_within_root(&checked, &canon_mods) {
                        is_from_mods_lane = true;
                    }
                }
                if !is_from_mods_lane {
                    if let Some(p) = checked.parent() {
                        base_lane = p.to_path_buf();
                    }
                }
                mod_dir = checked;
            } else {
                let vault_candidate = mods_lane.join(raw_input_path);
                if vault_candidate.exists() {
                    mod_dir = ensure_strict_descendant_of_roots(
                        &vault_candidate,
                        &allowed_vault_roots,
                    )?;
                    is_from_mods_lane = true;
                }
            }
        } else {
            mod_dir = ensure_strict_descendant_of_roots(&mod_dir, &allowed_vault_roots)?;
        }

        if !mod_dir.exists() {
            let fallback_folder: String = manifest_stage
                .artifact
                .name
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            let folder_name = if fallback_folder.trim_matches('_').is_empty() {
                "sanctuary_export".to_string()
            } else {
                fallback_folder
            };
            let staged_dir = dev_lane.join(&folder_name);
            fs::create_dir_all(&staged_dir).map_err(|e| e.to_string())?;
            mod_dir = ensure_strict_descendant_of_roots(&staged_dir, &allowed_vault_roots)?;
        }

        if !is_safe_user_file_path(&mod_dir) {
            return Err("Target mod path failed safety containment check.".to_string());
        }

        // If `mod_dir` points to a loose file, stage or move it into a dedicated folder inside `Dev/Sandbox`
        if mod_dir.is_file() {
            let file_stem = mod_dir
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let safe_stem = if file_stem.trim().is_empty() {
                "sanctuary_export".to_string()
            } else {
                file_stem
            };
            let target_parent = if is_from_mods_lane {
                &dev_lane
            } else {
                &base_lane
            };
            let new_mod_dir = target_parent.join(&safe_stem);
            fs::create_dir_all(&new_mod_dir).map_err(|e| e.to_string())?;
            let checked_new_dir =
                ensure_strict_descendant_of_roots(&new_mod_dir, &allowed_vault_roots)?;
            let file_name = mod_dir
                .file_name()
                .ok_or_else(|| "Invalid loose mod filename".to_string())?;
            let new_file_path = checked_new_dir.join(file_name);
            if is_from_mods_lane {
                fs::copy(&mod_dir, &new_file_path)
                    .map_err(|e| format!("Failed to stage file from Vault to Sandbox: {}", e))?;
            } else {
                fs::rename(&mod_dir, &new_file_path)
                    .map_err(|e| format!("Failed to move file to folder: {}", e))?;
            }
            mod_dir = checked_new_dir;
        }

        let safe_name: String = manifest_stage
            .artifact
            .name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let safe_ver: String = manifest_stage
            .artifact
            .version
            .trim_start_matches(|c| c == 'v' || c == 'V')
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let zip_filename = format!(
            "{}_v{}.zip",
            if safe_name.is_empty() {
                "release".to_string()
            } else {
                safe_name
            },
            if safe_ver.is_empty() {
                "1.0.0".to_string()
            } else {
                safe_ver
            }
        );

        let mod_exts = crate::game_logic::get_supported_extensions(&game_schema);
        let preserve_aux = game_schema
            .as_ref()
            .and_then(|s| s.extensions.preserve_auxiliary_assets)
            .unwrap_or(true);

        let mut export_files: Vec<PathBuf> = Vec::new();
        for entry in walkdir::WalkDir::new(&mod_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.path();
            let rel = match p.strip_prefix(&mod_dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            if should_skip_export_file(rel, &zip_filename) {
                continue;
            }
            let ext = p
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_primary = mod_exts
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext));
            if preserve_aux || mod_exts.is_empty() || is_primary {
                export_files.push(p.to_path_buf());
            }
        }
        export_files.sort();

        let target_file_for_hash = export_files
            .iter()
            .find(|p| {
                let ext = p
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                mod_exts
                    .iter()
                    .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext))
            })
            .cloned()
            .or_else(|| export_files.first().cloned());

        let actual_hash = if let Some(ref target) = target_file_for_hash {
            crate::utils::calculate_hash(target)
                .unwrap_or_else(|_| manifest_stage.payload.sha256.clone())
        } else {
            manifest_stage.payload.sha256.clone()
        };

        let mut current_hashes = Vec::new();
        let mut current_modules = Vec::new();
        for p in &export_files {
            let ext = p
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_primary = mod_exts
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext));
            let file_hash_res = if target_file_for_hash.as_ref() == Some(p) && !actual_hash.is_empty()
            {
                Ok(actual_hash.clone())
            } else {
                crate::utils::calculate_hash(p)
            };
            if let Ok(h) = file_hash_res {
                push_unique_hash(&mut current_hashes, &h);
                let rel_name = p
                    .strip_prefix(&mod_dir)
                    .unwrap_or(p)
                    .to_string_lossy()
                    .replace('\\', "/");
                let role = if crate::game_logic::is_script_extension(&game_schema, &ext) {
                    "script"
                } else if is_primary || mod_exts.is_empty() {
                    "module"
                } else {
                    "asset"
                };
                current_modules.push(EdgeModuleEntry {
                    name: rel_name,
                    sha256: h,
                    role: Some(role.to_string()),
                });
            }
        }
        push_unique_hash(&mut current_hashes, &actual_hash);

        let mut candidate_lineage_hashes = Vec::new();
        for h in &manifest_stage.previous_hashes {
            push_unique_hash(&mut candidate_lineage_hashes, h);
        }

        let manifest_path = mod_dir.join(SANCTUARY_EDGE_MANIFEST_FILE);
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

        let override_path = mod_dir.join(SANCTUARY_EDGE_OVERRIDE_FILE);
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

        if let Ok(conn_arc) = open_db_conn(&vp_stage) {
            if let Ok(conn) = conn_arc.lock() {
                if let Ok((existing_target, existing_archive_str, existing_meta_str)) = conn
                    .query_row(
                        "SELECT COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
                         FROM edge_manifests WHERE artifact_id = ?1 OR (target_hash != '' AND target_hash = ?2)",
                        rusqlite::params![manifest_stage.artifact.id, actual_hash],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                            ))
                        },
                    )
                {
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
        }

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

        let default_placeholder_url =
            format!("https://your-domain.com/{}", SANCTUARY_EDGE_MANIFEST_FILE);
        let effective_url = if !custom_url_stage.trim().is_empty() {
            custom_url_stage.trim().to_string()
        } else if let Some(ref m_url) = manifest_stage.manifest_url {
            if !m_url.trim().is_empty() {
                m_url.trim().to_string()
            } else {
                default_placeholder_url
            }
        } else {
            default_placeholder_url
        };

        let mut final_manifest = manifest_stage;
        final_manifest.manifest_url = Some(effective_url.clone());
        final_manifest.payload.sha256 = actual_hash.clone();
        final_manifest.modules = current_modules;
        final_manifest.current_hashes = current_hashes;
        final_manifest.previous_hashes = historical_previous_hashes;

        Ok((
            mod_dir,
            export_files,
            actual_hash,
            final_manifest,
            sqlite_archive_hashes,
            effective_url,
            zip_filename,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // If an Auto-Push provider is configured, push (and merge remote lineage / catalog.json)
    // BEFORE writing `.sanctuary.manifest.json`, `.sanctuary.override.json`, and the release `.zip`
    if let Some(ref cfg) = push_config {
        let p = cfg.provider.trim().to_lowercase();
        if !p.is_empty() && p != "manual" && p != "none" {
            let push_res =
                execute_edge_manifest_push(&mut final_manifest, cfg, &effective_url).await?;
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

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let manifest_path = mod_dir.join(SANCTUARY_EDGE_MANIFEST_FILE);
        let manifest_str = serde_json::to_string_pretty(&final_manifest)
            .map_err(|e| format!("JSON error: {}", e))?;
        atomic_write_bytes(&manifest_path, manifest_str.as_bytes()).map_err(|e| {
            format!(
                "Write error manifest ({}): {}",
                manifest_path.display(),
                e
            )
        })?;

        let override_data = EdgeOverride {
            artifact_id: final_manifest.artifact.id.clone(),
            mason_id: final_manifest.artifact.author.clone(),
            game_id: final_manifest.artifact.game_id.clone(),
            manifest_url: effective_url,
            target_hash: actual_hash.clone(),
            archive_hashes: sqlite_archive_hashes,
            last_fetched_hash: Some(actual_hash.clone()),
            last_fetched_metadata: Some(manifest_str.clone()),
            etag: None,
            last_modified: None,
            last_polled_at: None,
            last_http_status: None,
        };

        let override_str = serde_json::to_string_pretty(&override_data)
            .map_err(|e| format!("JSON error: {}", e))?;

        if let Ok(conn_arc) = open_db_conn(&vault_path) {
            if let Ok(conn) = conn_arc.lock() {
                let now = now_epoch_secs();
                let archive_hashes_str = serde_json::to_string(&override_data.archive_hashes)
                    .unwrap_or_else(|_| "[]".to_string());
                let _ = conn.execute(
                    "INSERT INTO edge_manifests (
                        artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                        last_fetched_hash, last_fetched_metadata, created_at
                     )
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                     ON CONFLICT(artifact_id) DO UPDATE SET
                        mason_id = excluded.mason_id,
                        manifest_url = excluded.manifest_url,
                        target_hash = excluded.target_hash,
                        archive_hashes = excluded.archive_hashes,
                        game_id = excluded.game_id,
                        last_fetched_hash = excluded.last_fetched_hash,
                        last_fetched_metadata = excluded.last_fetched_metadata",
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
        }

        // Package ALL preserved mod files (preserving relative subpaths) + `.sanctuary.manifest.json`
        // + `.sanctuary.override.json` into the release `.zip` archive
        let zip_path = mod_dir.join(&zip_filename);
        let zip_file = fs::File::create(&zip_path)
            .map_err(|e| format!("Failed creating release zip {:?}: {}", zip_path, e))?;
        let mut zip_writer = zip::ZipWriter::new(zip_file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let mut added_entries: HashSet<String> = HashSet::new();
        for file_path in &export_files {
            if let Ok(rel) = file_path.strip_prefix(&mod_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if rel_str.is_empty() || !added_entries.insert(rel_str.to_lowercase()) {
                    continue;
                }
                if zip_writer.start_file(&rel_str, options).is_ok() {
                    if let Ok(mut f) = fs::File::open(file_path) {
                        let _ = std::io::copy(&mut f, &mut zip_writer);
                    }
                }
            }
        }
        if zip_writer
            .start_file(SANCTUARY_EDGE_MANIFEST_FILE, options)
            .is_ok()
        {
            let _ = zip_writer.write_all(manifest_str.as_bytes());
        }
        if zip_writer
            .start_file(SANCTUARY_EDGE_OVERRIDE_FILE, options)
            .is_ok()
        {
            let _ = zip_writer.write_all(override_str.as_bytes());
        }
        zip_writer
            .finish()
            .map_err(|e| format!("Failed finalizing release zip: {}", e))?;

        Ok(mod_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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

pub(super) fn base64_encode_bytes(input: &[u8]) -> String {
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

pub(super) fn base64_decode_str(input: &str) -> Option<String> {
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

pub(super) fn url_encode_component(s: &str) -> String {
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

pub(super) fn absorb_existing_remote_lineage_and_prepare_payload(
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
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(ch))
            {
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
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(ph))
            {
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

        let key = if catalog_val
            .get("manifests")
            .and_then(|v| v.as_array())
            .is_some()
        {
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
                        && old_m
                            .artifact
                            .name
                            .eq_ignore_ascii_case(&manifest.artifact.name))
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
        format!("{}/{}", manifest.artifact.id, SANCTUARY_EDGE_MANIFEST_FILE)
    };
    let remote_path = if cfg.remote_path.trim().is_empty() {
        default_filename
    } else {
        cfg.remote_path.trim().trim_start_matches('/').to_string()
    };

    let client = get_http_client();

    match provider.as_str() {
        "github_repo" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err(
                    "GitHub Personal Access Token is required for GitHub Repo Auto-Push."
                        .to_string(),
                );
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
                validate_safe_https_url_syntax(current_url)?;
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
                .get(&format!(
                    "{}?ref={}",
                    api_url,
                    url_encode_component(&branch_name)
                ))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", EDGE_USER_AGENT)
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        if let Ok(val) = parse_bounded_json(&bytes) {
                            existing_sha = val
                                .get("sha")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                                existing_content = base64_decode_str(b64);
                            }
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
                .header("User-Agent", EDGE_USER_AGENT)
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
                return Err(
                    "GitHub Token (with 'gist' scope) is required for GitHub Gist Auto-Push."
                        .to_string(),
                );
            }

            let gist_filename = if is_catalog {
                "catalog.json".to_string()
            } else if !cfg.remote_path.trim().is_empty() {
                cfg.remote_path
                    .trim()
                    .split('/')
                    .last()
                    .unwrap_or(SANCTUARY_EDGE_MANIFEST_FILE)
                    .to_string()
            } else {
                format!("{}{}", manifest.artifact.id, SANCTUARY_EDGE_MANIFEST_FILE)
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            if let Ok(val) = parse_bounded_json(&bytes) {
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
                }

                let resolved_url = if !owner_login.is_empty() {
                    format!(
                        "https://gist.githubusercontent.com/{}/{}/raw/{}",
                        owner_login, gist_id, gist_filename
                    )
                } else if !is_placeholder_manifest_url(current_url) {
                    validate_safe_https_url_syntax(current_url)?;
                    current_url.to_string()
                } else {
                    format!(
                        "https://gist.githubusercontent.com/raw/{}/{}",
                        gist_id, gist_filename
                    )
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .json(&patch_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist PATCH failed: {}", e))?;

                if !patch_resp.status().is_success() {
                    let status = patch_resp.status();
                    let err_txt = patch_resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "GitHub Gist update failed ({}): {}",
                        status, err_txt
                    ));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: gist_id,
                    message: "Updated GitHub Gist".to_string(),
                })
            } else {
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .json(&create_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist creation failed: {}", e))?;

                if !post_resp.status().is_success() {
                    let status = post_resp.status();
                    let err_txt = post_resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "GitHub Gist create failed ({}): {}",
                        status, err_txt
                    ));
                }

                let created_bytes = read_bounded_response_bytes(post_resp).await?;
                let created_val = parse_bounded_json(&created_bytes)?;
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
                        .header("User-Agent", EDGE_USER_AGENT)
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
                return Err(
                    "Access Token is required for GitLab / Codeberg Auto-Push.".to_string()
                );
            }
            let base_host = if cfg.custom_endpoint.trim().is_empty() {
                if current_url.contains("codeberg.org") {
                    "https://codeberg.org".to_string()
                } else {
                    "https://gitlab.com".to_string()
                }
            } else {
                let ep = cfg.custom_endpoint.trim().trim_end_matches('/').to_string();
                validate_safe_https_url(&ep).await?;
                ep
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            if let Ok(val) = parse_bounded_json(&bytes) {
                                existing_sha = val
                                    .get("sha")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                                    existing_content = base64_decode_str(b64);
                                }
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Codeberg/Gitea request failed: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_txt = resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "Codeberg/Gitea push failed ({}): {}",
                        status, err_txt
                    ));
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
                    .header("User-Agent", EDGE_USER_AGENT)
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        file_exists = true;
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            existing_content = String::from_utf8(bytes).ok();
                        }
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
                    .header("User-Agent", EDGE_USER_AGENT)
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
                return Err(
                    "Enter your Neocities site name (e.g. 'mycreatorname') or full URL."
                        .to_string(),
                );
            };
            validate_safe_https_url(&resolved_url).await?;
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client
                .get(&resolved_url)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT)
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        existing_content = String::from_utf8(bytes).ok();
                    }
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
                .header("User-Agent", EDGE_USER_AGENT)
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
            validate_safe_https_url(&target_endpoint).await?;
            validate_safe_https_url(&resolved_url).await?;
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client
                .get(&resolved_url)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT)
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        existing_content = String::from_utf8(bytes).ok();
                    }
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
                .header("User-Agent", EDGE_USER_AGENT);
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
                return Err(
                    "Select a Local Synced Folder path for Local Folder Auto-Push.".to_string(),
                );
            }
            let local_root_str = cfg.local_folder_path.trim().to_string();
            let rel_remote = remote_path.clone();
            let current_url_owned = current_url.to_string();
            let mut manifest_clone = manifest.clone();

            let (updated_manifest, push_res) =
                tauri::async_runtime::spawn_blocking(move || -> Result<(EdgeManifest, EdgePushResult), String> {
                    let dest_root = PathBuf::from(&local_root_str);
                    if !dest_root.is_absolute() || !is_safe_user_file_path(&dest_root) {
                        return Err(
                            "Refusing to write to unsafe or non-absolute local synced folder."
                                .to_string(),
                        );
                    }

                    let mut allowed_user_roots: Vec<PathBuf> = [
                        dirs::home_dir(),
                        dirs::document_dir(),
                        dirs::desktop_dir(),
                        dirs::download_dir(),
                    ]
                    .into_iter()
                    .flatten()
                    .collect();
                    let saved = crate::commands::state_ops::get_saved_coordinates();
                    if !saved.vault_path.trim().is_empty() {
                        allowed_user_roots.push(get_vault_root_dir(&saved.vault_path));
                    }

                    let canon_dest_root = ensure_path_within_roots(&dest_root, &allowed_user_roots)?;

                    let rel_p = Path::new(&rel_remote);
                    if rel_p.is_absolute()
                        || has_parent_dir_component(rel_p)
                        || rel_p
                            .components()
                            .any(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
                    {
                        return Err(
                            "Invalid relative remote path for Local Folder Auto-Push.".to_string(),
                        );
                    }

                    let candidate_dest = canon_dest_root.join(rel_p);
                    if let Some(parent) = candidate_dest.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create target folder: {}", e))?;
                    }
                    let dest_file = ensure_strict_descendant_of_roots(
                        &candidate_dest,
                        std::slice::from_ref(&canon_dest_root),
                    )?;
                    if !is_safe_user_file_path(&dest_file) {
                        return Err("Destination file failed safety containment check.".to_string());
                    }

                    let existing_content = if dest_file.exists() {
                        fs::read_to_string(&dest_file).ok()
                    } else {
                        None
                    };

                    let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                        existing_content.as_deref(),
                        &mut manifest_clone,
                        is_catalog,
                    )?;

                    atomic_write_bytes(&dest_file, payload_str.as_bytes()).map_err(|e| {
                        format!("Failed to write to local synced folder: {}", e)
                    })?;

                    let res = EdgePushResult {
                        resolved_manifest_url: current_url_owned,
                        provider_ref: dest_file.to_string_lossy().to_string(),
                        message: format!("Synced to {}", dest_file.display()),
                    };
                    Ok((manifest_clone, res))
                })
                .await
                .map_err(|e| format!("Task join error: {}", e))??;

            *manifest = updated_manifest;
            Ok(push_res)
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

