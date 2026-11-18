#[allow(unused_imports)]
use crate::commands::game_info::get_heuristic_signatures;
#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use crate::utils::*;
#[allow(unused_imports)]
use rayon::prelude::*;
#[allow(unused_imports)]
use std::collections::HashSet;
#[allow(unused_imports)]
use std::fs;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use std::sync::Arc;
#[allow(unused_imports)]
use std::time::SystemTime;
#[allow(unused_imports)]
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::{ingest::*, scanner::*};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct WorkbenchCatalogFile {
    pub name: String,
    pub path: String,
    pub is_template: bool,
    pub source: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct LocalInstalledTemplateSummary {
    pub file_name: String,
    pub path: String,
    pub template_id: String,
    pub target_file: String,
    pub template_version: String,
    pub template_name: String,
    pub schema_version: String,
    pub mod_author: Option<String>,
    pub template_author: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct WorkbenchCatalogPayload {
    pub files: Vec<WorkbenchCatalogFile>,
    pub installed_templates: Vec<LocalInstalledTemplateSummary>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct WorkbenchResolvedConfig {
    pub name: String,
    pub path: String,
    pub content: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct VaultJsonAssetEntry {
    pub file_name: String,
    pub path: String,
    pub content: String,
}

pub(super) fn collect_workbench_file_paths_sync(
    vault_path: &str,
    mods_path: Option<&str>,
    docs_path: Option<&str>,
    active_schema: &Option<crate::schema::GameSchema>,
) -> Vec<(PathBuf, String)> {
    let config_exts = crate::game_logic::get_config_extensions(active_schema);
    let editable_exts = crate::game_logic::get_editable_config_extensions(active_schema);
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(active_schema);

    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(vault_path);
    if vault_mods_lane.exists() {
        crate::utils::deduplicate_vault_root_configs(&vault_mods_lane, &config_exts, active_schema);
    }

    let mut scan_roots: Vec<(PathBuf, &'static str)> = vec![
        (vault_mods_lane, "vault"),
        (vault_root.join("Templates"), "templates"),
        (vault_root.join("Data").join("Templates"), "templates"),
    ];
    for (extra, src) in [(mods_path, "mods"), (docs_path, "docs")] {
        if let Some(raw) = extra {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let p_buf = PathBuf::from(trimmed);
                if !scan_roots.iter().any(|(existing, _)| existing == &p_buf) {
                    scan_roots.push((p_buf, src));
                }
            }
        }
    }

    let mut seen = HashSet::new();
    let mut results: Vec<(PathBuf, String)> = Vec::new();

    for (root, src_label) in scan_roots {
        if !root.exists() {
            continue;
        }
        let mut queue = vec![(root, 0usize)];
        while let Some((current, depth)) = queue.pop() {
            if depth > 3 {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if crate::utils::is_macos_or_os_metadata_path(&entry_path) {
                        continue;
                    }
                    let Ok(ft) = entry.file_type() else {
                        continue;
                    };
                    if ft.is_dir() {
                        let d_name = entry.file_name().to_string_lossy().to_lowercase();
                        if d_name.starts_with('.')
                            || d_name == "quarantine"
                            || d_name == "__macosx"
                        {
                            continue;
                        }
                        queue.push((entry_path, depth + 1));
                    } else if ft.is_file() {
                        let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) else {
                            continue;
                        };
                        let name_lower = name.to_lowercase();
                        if name_lower.starts_with('.')
                            || name_lower.starts_with("._")
                            || name_lower == "desktop.ini"
                            || is_edge_sidecar_filename(&name_lower)
                            || (!manifest_name_lower.is_empty()
                                && name_lower == manifest_name_lower)
                        {
                            continue;
                        }

                        let is_sanctuary_template =
                            name_lower.ends_with(".sanctuary.template.json");
                        let ext_matches = entry_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| {
                                let el = e.to_lowercase();
                                editable_exts.contains(&el) || config_exts.contains(&el)
                            })
                            .unwrap_or(false);

                        if is_sanctuary_template || ext_matches {
                            let canonical_key = crate::utils::resolve_canonical_target(&entry_path)
                                .unwrap_or_else(|_| entry_path.clone())
                                .to_string_lossy()
                                .to_lowercase();
                            if seen.insert(canonical_key) {
                                results.push((entry_path, src_label.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| {
        let name_a = a.0.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        let name_b = b.0.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        name_a.cmp(&name_b)
    });
    results
}

pub(super) fn parse_template_summary_from_json(
    file_name: &str,
    path: &Path,
    val: &serde_json::Value,
) -> Option<LocalInstalledTemplateSummary> {
    let item = if let Some(arr) = val.as_array() {
        arr.first()?
    } else {
        val
    };
    let obj = item.as_object()?;
    let target_file = obj
        .get("target_file")
        .or_else(|| obj.get("targetFile"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let template_id = obj
        .get("template_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            file_name
                .trim_end_matches(".sanctuary.template.json")
                .trim_end_matches("_template.json")
                .trim_end_matches(".json")
                .to_string()
        });
    let template_version = obj
        .get("template_version")
        .or_else(|| obj.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0")
        .trim()
        .to_string();
    let template_name = obj
        .get("name")
        .or_else(|| obj.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&template_id)
        .trim()
        .to_string();
    let schema_version = obj
        .get("schema_version")
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
        .unwrap_or_else(|| "1".to_string());
    let mod_author = obj
        .get("mod_author")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let template_author = obj
        .get("template_author")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    Some(LocalInstalledTemplateSummary {
        file_name: file_name.to_string(),
        path: path.to_string_lossy().to_string(),
        template_id,
        target_file,
        template_version,
        template_name,
        schema_version,
        mod_author,
        template_author,
    })
}

pub(super) fn is_sanctuary_template_json_file(path: &Path) -> bool {
    let fname_lower = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if fname_lower.ends_with(".sanctuary.template.json") {
        return true;
    }
    if !fname_lower.ends_with(".json") {
        return false;
    }
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > 10 * 1024 * 1024 {
            return false;
        }
    }
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    let candidate = if let Some(arr) = val.as_array() {
        arr.first()
    } else {
        Some(&val)
    };
    let Some(obj) = candidate.and_then(|v| v.as_object()) else {
        return false;
    };
    obj.get("template_id").and_then(|v| v.as_str()).is_some()
        && obj.get("target_file").and_then(|v| v.as_str()).is_some()
        && obj.get("settings").and_then(|v| v.as_array()).is_some()
}

pub(super) fn collect_local_installed_templates_sync(vault_path: &str) -> Vec<LocalInstalledTemplateSummary> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let candidate_dirs = [
        vault_root.join("Data").join("Templates"),
        vault_root.join("Templates"),
    ];
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for templates_dir in candidate_dirs {
        if !templates_dir.exists() || !templates_dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&templates_dir) {
            for entry in entries.flatten().take(512) {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let Some(fname) = p.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if !fname.to_lowercase().ends_with(".json") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 10 * 1024 * 1024 {
                        continue;
                    }
                }
                if let Ok(raw) = std::fs::read_to_string(&p) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                        if let Some(summary) = parse_template_summary_from_json(fname, &p, &val) {
                            if seen.insert(summary.file_name.to_lowercase()) {
                                out.push(summary);
                            }
                        }
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    out
}

pub(super) fn scan_vault_json_dirs_sync(vault_path: &str, rel_dirs: &[&[&str]]) -> Vec<VaultJsonAssetEntry> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let mut entries_out = Vec::new();
    let mut seen_names = HashSet::new();
    for segs in rel_dirs {
        let mut target_dir = vault_root.clone();
        for s in *segs {
            target_dir = target_dir.join(s);
        }
        if !target_dir.exists() || !target_dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&target_dir) {
            for entry in entries.flatten().take(512) {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let Some(fname) = p.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                let fname_lower = fname.to_lowercase();
                if !fname_lower.ends_with(".json") {
                    continue;
                }
                if !seen_names.insert(fname_lower) {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 5 * 1024 * 1024 {
                        continue;
                    }
                }
                if let Ok(content) = std::fs::read_to_string(&p) {
                    entries_out.push(VaultJsonAssetEntry {
                        file_name: fname.to_string(),
                        path: p.to_string_lossy().to_string(),
                        content,
                    });
                }
            }
        }
    }
    entries_out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    entries_out
}

#[tauri::command]
pub async fn get_workbench_files(
    vault_path: String,
    mods_path: Option<String>,
    game_schema: Option<crate::schema::GameSchema>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let active_schema = game_schema.or_else(|| {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    });
    tauri::async_runtime::spawn_blocking(move || {
        let items = collect_workbench_file_paths_sync(
            &vault_path,
            mods_path.as_deref(),
            None,
            &active_schema,
        );
        Ok(items
            .into_iter()
            .map(|(p, _)| p.to_string_lossy().to_string())
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_workbench_catalog(
    vault_path: String,
    mods_path: Option<String>,
    docs_path: Option<String>,
    game_schema: Option<crate::schema::GameSchema>,
    state: tauri::State<'_, AppState>,
) -> Result<WorkbenchCatalogPayload, String> {
    let active_schema = game_schema.or_else(|| {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    });
    tauri::async_runtime::spawn_blocking(move || {
        let items = collect_workbench_file_paths_sync(
            &vault_path,
            mods_path.as_deref(),
            docs_path.as_deref(),
            &active_schema,
        );
        let vault_mods_lane = crate::utils::get_vault_mods_lane(&vault_path);
        let mods_root_opt = mods_path.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(PathBuf::from);
        let docs_root_opt = docs_path.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(PathBuf::from);
        let mut leaf_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for (p, src) in &items {
            if src != "templates" && !is_sanctuary_template_json_file(p) {
                if let Some(leaf) = p.file_name().and_then(|n| n.to_str()) {
                    *leaf_counts.entry(leaf.to_lowercase()).or_insert(0) += 1;
                }
            }
        }
        let files = items
            .into_iter()
            .map(|(p, source)| {
                let leaf = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let is_template = source == "templates"
                    || is_sanctuary_template_json_file(&p);
                let display_name = if !is_template
                    && leaf_counts.get(&leaf.to_lowercase()).copied().unwrap_or(0) > 1
                {
                    let rel_opt = p
                        .strip_prefix(&vault_mods_lane)
                        .ok()
                        .or_else(|| mods_root_opt.as_ref().and_then(|r| p.strip_prefix(r).ok()))
                        .or_else(|| docs_root_opt.as_ref().and_then(|r| p.strip_prefix(r).ok()));
                    rel_opt
                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| leaf.clone())
                } else {
                    leaf
                };
                WorkbenchCatalogFile {
                    name: display_name,
                    path: p.to_string_lossy().to_string(),
                    is_template,
                    source,
                }
            })
            .collect();
        let installed_templates = collect_local_installed_templates_sync(&vault_path);
        Ok(WorkbenchCatalogPayload {
            files,
            installed_templates,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn resolve_workbench_target_config(
    file_name: String,
    vault_path: Option<String>,
    mods_path: Option<String>,
    docs_path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Option<WorkbenchResolvedConfig>, String> {
    let clean_target = Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if clean_target.is_empty() {
        return Ok(None);
    }
    let active_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let coords = get_saved_coordinates();
        let eff_vault = vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(coords.vault_path.as_str())
            .to_string();
        let eff_mods = mods_path
            .or_else(|| {
                let s = coords.mods_path.trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            });
        let eff_docs = docs_path.or(coords.docs_path);

        let candidate_files = collect_workbench_file_paths_sync(
            &eff_vault,
            eff_mods.as_deref(),
            eff_docs.as_deref(),
            &active_schema,
        );
        let requested_norm = file_name.trim().replace('\\', "/").trim_matches('/').to_lowercase();
        let clean_lower = clean_target.to_lowercase();
        for (p, source) in candidate_files {
            if source == "templates" {
                continue;
            }
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let full_norm = p.to_string_lossy().replace('\\', "/").to_lowercase();
            let matches_rel = !requested_norm.is_empty() && requested_norm.contains('/')
                && (full_norm.ends_with(&format!("/{}", requested_norm)) || full_norm == requested_norm);
            if matches_rel || (!requested_norm.contains('/') && name.to_lowercase() == clean_lower) {
                if let Ok(meta) = fs::metadata(&p) {
                    if meta.len() > 16 * 1024 * 1024 {
                        return Err("Target configuration file exceeds 16 MiB safety limit.".into());
                    }
                }
                let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
                return Ok(Some(WorkbenchResolvedConfig {
                    name: name.to_string(),
                    path: p.to_string_lossy().to_string(),
                    content,
                }));
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_local_installed_templates(
    vault_path: String,
) -> Result<Vec<LocalInstalledTemplateSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(collect_local_installed_templates_sync(&vault_path)))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn resolve_vault_subdir(vault_path: &str, segments: &[&str]) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() {
        return Err("Vault path not configured.".into());
    }
    let mut dir = crate::utils::get_vault_root_dir(vault_path);
    for seg in segments {
        dir = dir.join(seg);
    }
    Ok(dir)
}

#[tauri::command]
pub async fn scan_vault_themes(
    vault_path: String,
    is_dev: Option<bool>,
) -> Result<Vec<VaultJsonAssetEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if is_dev.unwrap_or(false) {
            Ok(scan_vault_json_dirs_sync(&vault_path, &[&["Data", "Dev", "Themes"]]))
        } else {
            Ok(scan_vault_json_dirs_sync(
                &vault_path,
                &[&["Data", "Themes"], &["Themes"]],
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_vault_theme(
    vault_path: String,
    file_name: String,
    content: String,
    is_dev: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_name = file_name.trim().to_string();
        if !crate::utils::is_safe_single_node_component(&clean_name)
            || !clean_name.to_lowercase().ends_with(".json")
        {
            return Err("Invalid theme filename.".into());
        }
        if content.len() > 5 * 1024 * 1024 {
            return Err("Theme payload exceeds 5 MiB limit.".into());
        }
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|_| "Invalid theme JSON payload.".to_string())?;
        let segs: &[&str] = if is_dev.unwrap_or(false) {
            &["Data", "Dev", "Themes"]
        } else {
            &["Data", "Themes"]
        };
        let themes_dir = resolve_vault_subdir(&vault_path, segs)?;
        let _ = fs::create_dir_all(&themes_dir);
        let target = themes_dir.join(&clean_name);
        crate::utils::ensure_strict_descendant_of_roots(&target, &[themes_dir])?;
        crate::utils::atomic_write_bytes(&target, content.as_bytes())?;
        Ok(target.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_vault_theme(
    vault_path: String,
    file_name: String,
    is_dev: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_name = file_name.trim().to_string();
        if !crate::utils::is_safe_single_node_component(&clean_name)
            || !clean_name.to_lowercase().ends_with(".json")
        {
            return Err("Invalid theme filename.".into());
        }
        let segs: &[&str] = if is_dev.unwrap_or(false) {
            &["Data", "Dev", "Themes"]
        } else {
            &["Data", "Themes"]
        };
        let themes_dir = resolve_vault_subdir(&vault_path, segs)?;
        let target = themes_dir.join(&clean_name);
        crate::utils::ensure_strict_descendant_of_roots(&target, std::slice::from_ref(&themes_dir))?;
        if target.exists() {
            fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
        let stem = clean_name.trim_end_matches(".json");
        for ext in ["webp", "png", "jpg", "jpeg"] {
            let companion = themes_dir.join(format!("{}.{}", stem, ext));
            if crate::utils::ensure_strict_descendant_of_roots(&companion, std::slice::from_ref(&themes_dir)).is_ok()
                && companion.exists()
            {
                let _ = fs::remove_file(&companion);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scan_vault_lexicons(vault_path: String) -> Result<Vec<VaultJsonAssetEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(scan_vault_json_dirs_sync(
            &vault_path,
            &[&["Data", "Lexicons"], &["Lexicons"]],
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn validate_blueprint_path_safety(target: &Path) -> Result<PathBuf, String> {
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing access to protected system path.".into());
    }
    let resolved = crate::utils::resolve_canonical_target(target)?;
    let is_json = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map_or(false, |e| e.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("Blocked: Blueprint files must use the .json extension.".into());
    }
    // Reject hidden dot-directories (.ssh, .aws, .gnupg, .config, .git, .vscode, etc.)
    for comp in resolved.components() {
        let seg = comp.as_os_str().to_string_lossy();
        if seg.starts_with('.') && seg != "." && seg != ".." {
            return Err("Blocked: Refusing blueprint access inside hidden dot-directory.".into());
        }
    }
    Ok(resolved)
}

#[tauri::command]
pub fn read_blueprint(path: String) -> Result<String, String> {
    use std::io::Read;
    const MAX_BLUEPRINT_BYTES: u64 = 10 * 1024 * 1024;
    let resolved = validate_blueprint_path_safety(Path::new(&path))?;
    let file = std::fs::File::open(&resolved).map_err(|e| e.to_string())?;
    let mut raw = String::new();
    file.take(MAX_BLUEPRINT_BYTES + 1)
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    if raw.len() as u64 > MAX_BLUEPRINT_BYTES {
        return Err("Blocked: Blueprint JSON exceeds 10 MiB safety limit.".into());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "Invalid Blueprint JSON format.".to_string())?;
    let is_profile = parsed.get("sanctuary_profile").and_then(|v| v.as_bool()) == Some(true)
        || parsed.get("mods").and_then(|v| v.as_array()).is_some();
    if !is_profile {
        return Err("Blocked: JSON file is not a valid Sanctuary Blueprint.".into());
    }
    Ok(raw)
}

#[tauri::command]
pub fn save_blueprint(path: String, content: String) -> Result<(), String> {
    if content.len() > 10 * 1024 * 1024 {
        return Err("Blocked: Blueprint payload exceeds 10 MiB limit.".into());
    }
    let resolved = validate_blueprint_path_safety(Path::new(&path))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|_| "Invalid Blueprint JSON format.".to_string())?;
    let is_profile = parsed.get("sanctuary_profile").and_then(|v| v.as_bool()) == Some(true)
        || parsed.get("mods").and_then(|v| v.as_array()).is_some();
    if !is_profile {
        return Err("Blocked: Refusing to save non-Blueprint JSON payload.".into());
    }
    crate::utils::atomic_write_bytes(&resolved, content.as_bytes())
}
