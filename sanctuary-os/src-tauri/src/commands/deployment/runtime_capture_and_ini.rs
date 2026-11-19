use super::airgap_journal::RoutedFileRecord;
use crate::commands::state_ops::*;
use crate::schema::{GameSchema, SchemaIniMutation, SchemaRuntimeOutputCapture};
use crate::state::WorkspaceConfig;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecordedIniMutation {
    target_path: String,
    section: String,
    key: String,
    injected_value: String,
    file_existed_before: bool,
    prior_value: Option<String>,
    restore_on_purge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BaselineFileStamp {
    len: u64,
    mtime_secs: u64,
}

fn ini_journal_path(vault_path: &str) -> PathBuf {
    get_vault_root_dir(vault_path).join(".sanctuary_ini_mutations.json")
}

fn runtime_baseline_path(vault_path: &str) -> PathBuf {
    get_vault_root_dir(vault_path).join(".sanctuary_runtime_baseline.json")
}

fn deployed_links_manifest_path(mods_dir: &Path) -> PathBuf {
    mods_dir.join(".sanctuary_deployed_links.json")
}

fn sanitize_vault_capture_folder(raw: Option<&str>) -> String {
    let cleaned: String = raw
        .unwrap_or("_RuntimeOutput")
        .trim()
        .trim_matches(&['/', '\\'][..])
        .replace('\\', "/");
    if cleaned.is_empty() || cleaned.contains("..") || cleaned.contains(':') {
        "_RuntimeOutput".to_string()
    } else {
        cleaned
    }
}

fn resolve_mutation_or_watch_root(
    root_source: &str,
    schema: &Option<GameSchema>,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
) -> Option<PathBuf> {
    let chosen = match root_source.trim().to_ascii_lowercase().as_str() {
        "docs_path" | "documents" | "docs" | "user_data" => docs_root.to_path_buf(),
        "live_path" | "game" | "engine" => live_root.to_path_buf(),
        "local_appdata" | "appdata_local" => {
            crate::load_order_engine::resolve_local_appdata_root(schema, live_root)?
        }
        _ => mods_dir.to_path_buf(),
    };
    if chosen.as_os_str().is_empty() {
        None
    } else {
        Some(chosen)
    }
}

fn read_ini_key_in_section(content: &str, section: &str, key: &str) -> Option<String> {
    let target_sec = section.trim().to_ascii_lowercase();
    let target_key = key.trim().to_ascii_lowercase();
    let mut in_target_sec = target_sec.is_empty();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let sec_name = trimmed[1..trimmed.len() - 1].trim().to_ascii_lowercase();
            in_target_sec = sec_name == target_sec;
            continue;
        }
        if in_target_sec {
            if let Some((lhs, rhs)) = trimmed.split_once('=') {
                if lhs.trim().to_ascii_lowercase() == target_key {
                    return Some(rhs.trim().to_string());
                }
            }
        }
    }
    None
}

fn upsert_or_remove_ini_key(
    content: &str,
    section: &str,
    key: &str,
    new_value: Option<&str>,
) -> (String, bool) {
    let eol = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let target_sec = section.trim();
    let target_sec_lower = target_sec.to_ascii_lowercase();
    let target_key = key.trim();
    let target_key_lower = target_key.to_ascii_lowercase();

    let mut lines: Vec<String> = if content.is_empty() {
        Vec::new()
    } else {
        content.lines().map(|l| l.to_string()).collect()
    };

    let mut sec_start: Option<usize> = None;
    let mut sec_end: usize = lines.len();
    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let name = trimmed[1..trimmed.len() - 1].trim().to_ascii_lowercase();
            if sec_start.is_some() {
                sec_end = idx;
                break;
            }
            if name == target_sec_lower {
                sec_start = Some(idx);
            }
        }
    }

    let mut mutated = false;
    match (sec_start, new_value) {
        (Some(start_idx), Some(val)) => {
            let mut key_line_idx: Option<usize> = None;
            for i in (start_idx + 1)..sec_end {
                let trimmed = lines[i].trim();
                if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((lhs, _)) = trimmed.split_once('=') {
                    if lhs.trim().to_ascii_lowercase() == target_key_lower {
                        key_line_idx = Some(i);
                        break;
                    }
                }
            }
            let desired = format!("{}={}", target_key, val);
            if let Some(kidx) = key_line_idx {
                if lines[kidx].trim() != desired {
                    lines[kidx] = desired;
                    mutated = true;
                }
            } else {
                let mut insert_at = sec_end;
                while insert_at > start_idx + 1 && lines[insert_at - 1].trim().is_empty() {
                    insert_at -= 1;
                }
                lines.insert(insert_at, desired);
                mutated = true;
            }
        }
        (Some(start_idx), None) => {
            let mut remove_idx: Option<usize> = None;
            for i in (start_idx + 1)..sec_end {
                let trimmed = lines[i].trim();
                if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((lhs, _)) = trimmed.split_once('=') {
                    if lhs.trim().to_ascii_lowercase() == target_key_lower {
                        remove_idx = Some(i);
                        break;
                    }
                }
            }
            if let Some(ridx) = remove_idx {
                lines.remove(ridx);
                mutated = true;
            }
        }
        (None, Some(val)) => {
            if !lines.is_empty() && !lines.last().map_or(false, |l| l.trim().is_empty()) {
                lines.push(String::new());
            }
            if !target_sec.is_empty() {
                lines.push(format!("[{}]", target_sec));
            }
            lines.push(format!("{}={}", target_key, val));
            mutated = true;
        }
        (None, None) => {}
    }

    let rendered = if lines.is_empty() {
        String::new()
    } else {
        format!("{}{}", lines.join(eol), eol)
    };
    (rendered, mutated)
}

pub fn apply_schema_ini_mutations(
    schema: &Option<GameSchema>,
    vault_path: &str,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let Some(mutations) = schema
        .as_ref()
        .and_then(|s| s.deployment.as_ref())
        .and_then(|d| d.ini_mutations.as_ref())
    else {
        return Ok(0);
    };
    if mutations.is_empty() {
        return Ok(0);
    }

    let jpath = ini_journal_path(vault_path);
    let mut records: Vec<RecordedIniMutation> = fs::read_to_string(&jpath)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let mut applied = 0usize;

    for mut_rule in mutations {
        let SchemaIniMutation {
            root_source,
            relative_path,
            section,
            key,
            value,
            restore_on_purge,
        } = mut_rule;
        let rel = relative_path.trim().trim_matches(&['/', '\\'][..]);
        if rel.is_empty() || key.trim().is_empty() {
            continue;
        }
        let Some(base_root) =
            resolve_mutation_or_watch_root(root_source, schema, mods_dir, docs_root, live_root)
        else {
            continue;
        };
        let target_path = resolve_case_insensitive_path(&base_root, rel);
        if ensure_strict_descendant_of_roots(&target_path, std::slice::from_ref(&base_root)).is_err()
            || !is_safe_user_file_path(&target_path)
        {
            continue;
        }

        let existed_before = target_path.is_file();
        let existing_content = if existed_before {
            fs::read_to_string(&target_path).unwrap_or_default()
        } else {
            String::new()
        };

        let target_key_norm = normalize_path_key(&target_path);
        let already_recorded = records.iter().any(|r| {
            normalize_path_key(Path::new(&r.target_path)) == target_key_norm
                && r.section.eq_ignore_ascii_case(section.trim())
                && r.key.eq_ignore_ascii_case(key.trim())
        });
        if !already_recorded {
            let prior_value = if existed_before {
                read_ini_key_in_section(&existing_content, section, key)
            } else {
                None
            };
            records.push(RecordedIniMutation {
                target_path: target_path.to_string_lossy().to_string(),
                section: section.trim().to_string(),
                key: key.trim().to_string(),
                injected_value: value.clone(),
                file_existed_before: existed_before,
                prior_value,
                restore_on_purge: restore_on_purge.unwrap_or(true),
            });
        }

        let (updated, changed) =
            upsert_or_remove_ini_key(&existing_content, section, key, Some(value));
        if changed || !existed_before {
            atomic_write_bytes(&target_path, updated.as_bytes())?;
            applied += 1;
        }
    }

    if !records.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&records) {
            let _ = atomic_write_bytes(&jpath, json.as_bytes());
        }
    }

    Ok(applied)
}

pub fn revert_schema_ini_mutations(vault_path: &str) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let jpath = ini_journal_path(vault_path);
    if !jpath.exists() {
        return Ok(0);
    }
    let raw = match fs::read_to_string(&jpath) {
        Ok(r) => r,
        Err(_) => {
            let _ = fs::remove_file(&jpath);
            return Ok(0);
        }
    };
    let records: Vec<RecordedIniMutation> = serde_json::from_str(&raw).unwrap_or_default();
    let mut restored = 0usize;

    for rec in records {
        if !rec.restore_on_purge {
            continue;
        }
        let target_path = PathBuf::from(&rec.target_path);
        if !target_path.is_file() || !is_safe_user_file_path(&target_path) {
            continue;
        }
        let content = fs::read_to_string(&target_path).unwrap_or_default();
        let (updated, changed) = upsert_or_remove_ini_key(
            &content,
            &rec.section,
            &rec.key,
            rec.prior_value.as_deref(),
        );
        if !rec.file_existed_before {
            let has_real_entries = updated.lines().any(|l| {
                let t = l.trim();
                !t.is_empty()
                    && !t.starts_with(';')
                    && !t.starts_with('#')
                    && !(t.starts_with('[') && t.ends_with(']'))
            });
            if !has_real_entries {
                let _ = remove_file_clearing_readonly(&target_path);
                restored += 1;
                continue;
            }
        }
        if changed {
            let _ = atomic_write_bytes(&target_path, updated.as_bytes());
            restored += 1;
        }
    }

    let _ = fs::remove_file(&jpath);
    Ok(restored)
}

fn load_tracked_deployed_set(vault_path: &str, mods_dir: &Path) -> HashSet<String> {
    let mut set = HashSet::new();
    let mpath = deployed_links_manifest_path(mods_dir);
    if let Ok(raw) = fs::read_to_string(&mpath) {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            for p in list {
                set.insert(normalize_path_key(Path::new(&p)));
            }
        }
    }
    if !vault_path.trim().is_empty() {
        if let Some((raw, _)) = get_vault_kv(vault_path, "deployed_links") {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for p in list {
                    set.insert(normalize_path_key(Path::new(&p)));
                }
            }
        }
        if let Some((raw, _)) = get_vault_kv(vault_path, "routed_links") {
            if let Ok(recs) = serde_json::from_str::<Vec<RoutedFileRecord>>(&raw) {
                for r in recs {
                    set.insert(normalize_path_key(Path::new(&r.target_path)));
                }
            }
        }
    }
    set
}

fn runtime_capture_config(schema: &Option<GameSchema>) -> Option<&SchemaRuntimeOutputCapture> {
    let cfg = schema
        .as_ref()?
        .deployment
        .as_ref()?
        .runtime_output_capture
        .as_ref()?;
    if cfg.enabled == Some(true) {
        Some(cfg)
    } else {
        None
    }
}

fn resolve_watch_root_list(
    cfg: &SchemaRuntimeOutputCapture,
    schema: &Option<GameSchema>,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
) -> Vec<PathBuf> {
    let raw_roots: Vec<String> = if cfg.watch_roots.is_empty() {
        vec!["mods_path".to_string()]
    } else {
        cfg.watch_roots.clone()
    };
    let mut out = Vec::new();
    for rs in &raw_roots {
        if let Some(root) = resolve_mutation_or_watch_root(rs, schema, mods_dir, docs_root, live_root) {
            if root.exists() && !out.contains(&root) {
                out.push(root);
            }
        }
    }
    out
}

fn matches_runtime_capture_filters(
    rel_slash_lower: &str,
    fname_lower: &str,
    cfg: &SchemaRuntimeOutputCapture,
    schema: &Option<GameSchema>,
    saved_coords: &WorkspaceConfig,
    full_path: &Path,
) -> bool {
    if fname_lower.starts_with('.')
        || fname_lower.starts_with("._")
        || fname_lower == "desktop.ini"
        || fname_lower == "thumbs.db"
    {
        return false;
    }
    let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(schema);
    if !manifest_leaf.is_empty() && rel_slash_lower == manifest_leaf {
        return false;
    }
    if crate::game_logic::is_cache_file(schema, rel_slash_lower)
        || crate::game_logic::is_exception_log(schema, rel_slash_lower)
        || is_protected_save_or_airgap_path(full_path, saved_coords, schema)
    {
        return false;
    }
    if let Some(ref exts) = cfg.include_extensions {
        if !exts.is_empty() {
            let ext_matched = exts.iter().any(|raw| {
                let clean = raw.trim().to_ascii_lowercase();
                let dot_ext = if clean.starts_with('.') {
                    clean
                } else {
                    format!(".{}", clean)
                };
                dot_ext.len() > 1 && fname_lower.ends_with(&dot_ext)
            });
            if !ext_matched {
                return false;
            }
        }
    }
    if let Some(ref excludes) = cfg.exclude_patterns {
        for pat in excludes {
            let clean = pat.trim().trim_matches('*').to_ascii_lowercase();
            if !clean.is_empty() && rel_slash_lower.contains(&clean) {
                return false;
            }
        }
    }
    true
}

fn file_mtime_secs(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Snapshots pre-launch untracked files inside configured `watch_roots` so runtime capture never sweeps vanilla assets.
pub fn record_runtime_capture_baseline(
    vault_path: &str,
    mods_dir: &Path,
    live_root: &Path,
    docs_root: &Path,
    schema: &Option<GameSchema>,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let Some(cfg) = runtime_capture_config(schema) else {
        return Ok(0);
    };
    let saved_coords = get_saved_coordinates();
    let tracked = load_tracked_deployed_set(vault_path, mods_dir);
    let roots = resolve_watch_root_list(cfg, schema, mods_dir, docs_root, live_root);
    let mut baseline: HashMap<String, BaselineFileStamp> = HashMap::new();

    for root in roots {
        let scan_bases: Vec<PathBuf> = match cfg.include_subdirs.as_ref() {
            Some(subs) if !subs.is_empty() => subs
                .iter()
                .map(|s| resolve_case_insensitive_path(&root, s.trim().trim_matches(&['/', '\\'][..])))
                .filter(|p| p.is_dir())
                .collect(),
            _ => vec![root.clone()],
        };
        for base in scan_bases {
            for entry in walkdir::WalkDir::new(&base)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    let lower = e.file_name().to_string_lossy().to_ascii_lowercase();
                    !(e.depth() > 0 && (lower.starts_with(".sanctuary") || lower == ".lab_save_vault"))
                })
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() || is_symlink_or_reparse_point(entry.path()) {
                    continue;
                }
                let fp = entry.path();
                let norm = normalize_path_key(fp);
                if tracked.contains(&norm) {
                    continue;
                }
                let Ok(rel) = fp.strip_prefix(&root) else { continue; };
                let rel_slash_lower = rel.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
                let fname_lower = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !matches_runtime_capture_filters(
                    &rel_slash_lower,
                    &fname_lower,
                    cfg,
                    schema,
                    &saved_coords,
                    fp,
                ) {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    baseline.insert(
                        norm,
                        BaselineFileStamp {
                            len: meta.len(),
                            mtime_secs: file_mtime_secs(&meta),
                        },
                    );
                }
            }
        }
    }

    let bpath = runtime_baseline_path(vault_path);
    if let Ok(json) = serde_json::to_string(&baseline) {
        let _ = atomic_write_bytes(&bpath, json.as_bytes());
    }
    Ok(baseline.len())
}

/// Captures newly created or tool-regenerated runtime outputs from `watch_roots` into `{Vault}/Mods/<target_vault_folder>`.
pub fn capture_runtime_outputs_to_vault(
    vault_path: &str,
    mods_dir: &Path,
    live_root: &Path,
    docs_root: &Path,
    schema: &Option<GameSchema>,
    relink_into_live: bool,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let Some(cfg) = runtime_capture_config(schema) else {
        return Ok(0);
    };
    let vault_mods_lane = get_vault_mods_lane(vault_path);
    fs::create_dir_all(&vault_mods_lane).map_err(|e| e.to_string())?;
    let target_folder = sanitize_vault_capture_folder(cfg.target_vault_folder.as_deref());
    let output_vault_root = vault_mods_lane.join(&target_folder);
    ensure_strict_descendant_of_roots(&output_vault_root, std::slice::from_ref(&vault_mods_lane))?;

    let saved_coords = get_saved_coordinates();
    let tracked = load_tracked_deployed_set(vault_path, mods_dir);
    let bpath = runtime_baseline_path(vault_path);
    let baseline: HashMap<String, BaselineFileStamp> = fs::read_to_string(&bpath)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let mut deployed_list: Vec<String> = fs::read_to_string(deployed_links_manifest_path(mods_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    let roots = resolve_watch_root_list(cfg, schema, mods_dir, docs_root, live_root);
    let mut captured = 0usize;

    for root in roots {
        let scan_bases: Vec<PathBuf> = match cfg.include_subdirs.as_ref() {
            Some(subs) if !subs.is_empty() => subs
                .iter()
                .map(|s| resolve_case_insensitive_path(&root, s.trim().trim_matches(&['/', '\\'][..])))
                .filter(|p| p.is_dir())
                .collect(),
            _ => vec![root.clone()],
        };
        for base in scan_bases {
            for entry in walkdir::WalkDir::new(&base)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    let lower = e.file_name().to_string_lossy().to_ascii_lowercase();
                    !(e.depth() > 0 && (lower.starts_with(".sanctuary") || lower == ".lab_save_vault"))
                })
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() || is_symlink_or_reparse_point(entry.path()) {
                    continue;
                }
                let fp = entry.path().to_path_buf();
                let Ok(rel) = fp.strip_prefix(&root) else { continue; };
                let rel_slash_lower = rel.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
                let fname_lower = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !matches_runtime_capture_filters(
                    &rel_slash_lower,
                    &fname_lower,
                    cfg,
                    schema,
                    &saved_coords,
                    &fp,
                ) {
                    continue;
                }

                let Ok(meta) = fs::metadata(&fp) else { continue; };
                let norm = normalize_path_key(&fp);
                let vault_dest = output_vault_root.join(rel);

                if tracked.contains(&norm) {
                    // Only recapture tracked path when already owned by Overwrite folder and modified unlinked on disk
                    if !vault_dest.is_file() {
                        continue;
                    }
                    let same_bytes = fs::metadata(&vault_dest)
                        .map(|vm| vm.len() == meta.len())
                        .unwrap_or(false)
                        && calculate_hash(&fp).ok() == calculate_hash(&vault_dest).ok();
                    if same_bytes {
                        continue;
                    }
                } else if let Some(base_stamp) = baseline.get(&norm) {
                    if base_stamp.len == meta.len()
                        && base_stamp.mtime_secs == file_mtime_secs(&meta)
                    {
                        continue;
                    }
                }

                if ensure_strict_descendant_of_roots(&vault_dest, std::slice::from_ref(&output_vault_root))
                    .is_err()
                {
                    continue;
                }
                if let Some(par) = vault_dest.parent() {
                    let _ = fs::create_dir_all(par);
                }
                if fs::copy(&fp, &vault_dest).is_err() {
                    continue;
                }

                let _ = remove_file_clearing_readonly(&fp);
                if relink_into_live {
                    if deploy_file_link_batched(&vault_dest, &fp, false, false, false).is_ok() {
                        let p_str = fp.to_string_lossy().to_string();
                        if !deployed_list.iter().any(|x| x.eq_ignore_ascii_case(&p_str)) {
                            deployed_list.push(p_str);
                        }
                    }
                }
                captured += 1;
            }
        }
    }

    if relink_into_live && captured > 0 {
        if let Ok(json) = serde_json::to_string_pretty(&deployed_list) {
            let _ = atomic_write_bytes(&deployed_links_manifest_path(mods_dir), json.as_bytes());
            set_vault_kv(vault_path, "deployed_links", &json);
        }
    }

    Ok(captured)
}

#[tauri::command]
pub async fn capture_runtime_outputs(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<usize, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let coords = get_saved_coordinates();
        if coords.vault_path.trim().is_empty() || coords.mods_path.trim().is_empty() {
            return Ok(0);
        }
        let mods_dir = PathBuf::from(coords.mods_path.trim());
        let live_root = crate::game_logic::resolve_game_engine_root(&coords.live_path, &game_schema);
        let docs_root = PathBuf::from(resolve_effective_docs_path(&coords, &game_schema));
        capture_runtime_outputs_to_vault(
            &coords.vault_path,
            &mods_dir,
            &live_root,
            &docs_root,
            &game_schema,
            true,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::SchemaDeploymentConfig;

    #[test]
    fn runtime_output_capture_and_ini_mutations_roundtrip() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_runtime_ini_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_root = root.join("Vault");
        let vault_mods = vault_root.join("Mods");
        let live_root = root.join("GameRoot");
        let mods_dir = live_root.join("Content");
        let docs_root = root.join("Docs");
        fs::create_dir_all(&vault_mods).unwrap();
        fs::create_dir_all(&mods_dir).unwrap();
        fs::create_dir_all(&docs_root).unwrap();

        let ini_path = docs_root.join("EngineCustom.ini");
        fs::write(&ini_path, "[Audio]\nVolume=80\n").unwrap();

        let schema = Some(GameSchema {
            id: Some("test_ce".into()),
            game_id: "test_ce".into(),
            deployment: Some(SchemaDeploymentConfig {
                runtime_output_capture: Some(SchemaRuntimeOutputCapture {
                    enabled: Some(true),
                    target_vault_folder: Some("_RuntimeOutput".into()),
                    watch_roots: vec!["mods_path".into()],
                    include_subdirs: None,
                    include_extensions: None,
                    exclude_patterns: None,
                }),
                ini_mutations: Some(vec![SchemaIniMutation {
                    root_source: "docs_path".into(),
                    relative_path: "EngineCustom.ini".into(),
                    section: "Archive".into(),
                    key: "bInvalidateOlderFiles".into(),
                    value: "1".into(),
                    restore_on_purge: Some(true),
                }]),
                ..Default::default()
            }),
            ..Default::default()
        });

        let applied = apply_schema_ini_mutations(
            &schema,
            &vault_root.to_string_lossy(),
            &mods_dir,
            &docs_root,
            &live_root,
        )
        .unwrap();
        assert_eq!(applied, 1);
        let mutated_ini = fs::read_to_string(&ini_path).unwrap();
        assert!(mutated_ini.contains("[Archive]"));
        assert!(mutated_ini.contains("bInvalidateOlderFiles=1"));

        // Pre-existing vanilla file must be ignored by runtime capture once baselined
        let vanilla = mods_dir.join("VanillaBase.bin");
        fs::write(&vanilla, b"vanilla").unwrap();
        assert_eq!(
            record_runtime_capture_baseline(
                &vault_root.to_string_lossy(),
                &mods_dir,
                &live_root,
                &docs_root,
                &schema,
            )
            .unwrap(),
            1
        );

        // Runtime tool generates a brand new file into mods_dir
        let gen_rel = Path::new("Generated/OutputPatch.bin");
        let gen_live = mods_dir.join(gen_rel);
        fs::create_dir_all(gen_live.parent().unwrap()).unwrap();
        fs::write(&gen_live, b"generated-by-tool").unwrap();

        let captured = capture_runtime_outputs_to_vault(
            &vault_root.to_string_lossy(),
            &mods_dir,
            &live_root,
            &docs_root,
            &schema,
            false,
        )
        .unwrap();
        assert_eq!(captured, 1);
        let stored_vault_file = vault_mods.join("_RuntimeOutput").join(gen_rel);
        assert!(stored_vault_file.is_file());
        assert_eq!(fs::read(&stored_vault_file).unwrap(), b"generated-by-tool");
        assert!(vanilla.is_file());
        assert!(!vault_mods.join("_RuntimeOutput").join("VanillaBase.bin").exists());

        // Revert INI mutations restores exact pre-deploy state
        let reverted = revert_schema_ini_mutations(&vault_root.to_string_lossy()).unwrap();
        assert_eq!(reverted, 1);
        let restored_ini = fs::read_to_string(&ini_path).unwrap();
        assert!(!restored_ini.contains("bInvalidateOlderFiles=1"));
        assert!(restored_ini.contains("Volume=80"));

        let _ = fs::remove_dir_all(&root);
    }
}
