use super::direct_downloader::{download_verified_url_to_temp, DownloadStageCleanupGuard};
use crate::commands::library::{
    read_mod_hidden_sidecar, read_saved_fomod_choices, read_saved_fomod_choices_doc,
    replay_fomod_session_headless, set_mod_hidden_files,
};
use crate::state::{AppState, SecurityState};
use crate::utils::{
    atomic_write_bytes, calculate_hash, ensure_strict_descendant_of_roots, get_vault_mods_lane,
    get_vault_root_dir, is_macos_or_os_metadata_path, resolve_case_insensitive_path,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;

const MAX_CONFIG_DELTA_BYTES: u64 = 256 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LockfileConfigDelta {
    pub rel_path: String,
    pub sha256: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModLockfileVaultEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fomod_wizard_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fomod_selections: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hidden_files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct BlueprintVaultLockState {
    pub mod_entries: HashMap<String, ModLockfileVaultEntry>,
    pub config_deltas: Vec<LockfileConfigDelta>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HydrationLockItem {
    pub id: String,
    pub name: String,
    pub download_url: String,
    #[serde(default)]
    pub fallback_url: Option<String>,
    #[serde(default)]
    pub expected_sha256: Option<String>,
    #[serde(default)]
    pub target_folder: Option<String>,
    #[serde(default)]
    pub force_replace: Option<bool>,
    #[serde(default)]
    pub fomod_selections: Option<Vec<String>>,
    #[serde(default)]
    pub hidden_files: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HydrationFailureItem {
    pub id: String,
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HydrationGatedItem {
    pub id: String,
    pub name: String,
    pub url: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HydrationBatchReport {
    pub hydrated_ids: Vec<String>,
    pub wizard_plans: Vec<serde_json::Value>,
    pub gated_browser_items: Vec<HydrationGatedItem>,
    pub failed_items: Vec<HydrationFailureItem>,
    pub applied_config_deltas: usize,
}

fn validate_rel_path_safe(raw: &str) -> Result<PathBuf, String> {
    let norm = raw.trim().replace('\\', "/");
    let trimmed = norm.trim_matches('/');
    if trimmed.is_empty() {
        return Err("Empty relative path".to_string());
    }
    let rel = PathBuf::from(trimmed);
    if rel.is_absolute()
        || rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::Prefix(_) | Component::RootDir))
    {
        return Err(format!("Blocked unsafe relative path: {}", raw));
    }
    Ok(rel)
}

fn resolve_mod_folder_in_vault(vault_mods_lane: &Path, mod_name: &str) -> Option<PathBuf> {
    let norm = mod_name.trim().replace('\\', "/");
    let clean = norm.trim_matches('/');
    if clean.is_empty() {
        return None;
    }
    let first_seg = clean.split('/').next().unwrap_or(clean);
    let root_slice = [vault_mods_lane.to_path_buf()];
    let candidate = resolve_case_insensitive_path(vault_mods_lane, first_seg);
    if candidate.is_dir() && ensure_strict_descendant_of_roots(&candidate, &root_slice).is_ok() {
        return Some(candidate);
    }
    let exact = resolve_case_insensitive_path(vault_mods_lane, clean);
    if exact.is_dir() && ensure_strict_descendant_of_roots(&exact, &root_slice).is_ok() {
        return Some(exact);
    }
    None
}

#[tauri::command]
pub async fn collect_blueprint_lockfile_state(
    vault_path: String,
    mod_names: Vec<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<BlueprintVaultLockState, String> {
    if vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".to_string());
    }
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<BlueprintVaultLockState, String> {
        let vault_mods_lane = get_vault_mods_lane(&vault_path);
        if !vault_mods_lane.is_dir() {
            return Ok(BlueprintVaultLockState::default());
        }
        let editable_exts: HashSet<String> =
            crate::game_logic::get_editable_config_extensions(&game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_ascii_lowercase())
                .collect();

        let mut mod_entries: HashMap<String, ModLockfileVaultEntry> = HashMap::new();
        let mut config_deltas: Vec<LockfileConfigDelta> = Vec::new();
        let mut seen_folders: HashSet<PathBuf> = HashSet::new();
        let mut seen_rel_configs: HashSet<String> = HashSet::new();

        for mod_name in mod_names {
            let Some(mod_dir) = resolve_mod_folder_in_vault(&vault_mods_lane, &mod_name) else {
                continue;
            };
            let folder_key = mod_dir
                .strip_prefix(&vault_mods_lane)
                .unwrap_or(&mod_dir)
                .to_string_lossy()
                .replace('\\', "/");

            let choices_doc = read_saved_fomod_choices_doc(&mod_dir);
            let fomod_wizard_kind = choices_doc.as_ref().and_then(|d| {
                d.get("wizard_kind")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });
            let fomod_selections = read_saved_fomod_choices(&mod_dir);
            let mut hidden_files: Vec<String> = read_mod_hidden_sidecar(&mod_dir).into_iter().collect();
            hidden_files.sort();

            if fomod_wizard_kind.is_some()
                || !fomod_selections.is_empty()
                || !hidden_files.is_empty()
            {
                let entry = ModLockfileVaultEntry {
                    fomod_wizard_kind,
                    fomod_selections,
                    hidden_files,
                };
                mod_entries.insert(mod_name.clone(), entry.clone());
                if folder_key != mod_name {
                    mod_entries.entry(folder_key.clone()).or_insert(entry);
                }
            }

            if !seen_folders.insert(mod_dir.clone()) || editable_exts.is_empty() {
                continue;
            }
            for w_entry in walkdir::WalkDir::new(&mod_dir)
                .max_depth(4)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !w_entry.file_type().is_file() {
                    continue;
                }
                let p = w_entry.path();
                if is_macos_or_os_metadata_path(p) {
                    continue;
                }
                let fname = w_entry.file_name().to_string_lossy();
                if fname.starts_with(".sanctuary") {
                    continue;
                }
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_lowercase())
                    .unwrap_or_default();
                if !editable_exts.contains(&ext) {
                    continue;
                }
                let meta_len = fs::metadata(p).map(|m| m.len()).unwrap_or(u64::MAX);
                if meta_len == 0 || meta_len > MAX_CONFIG_DELTA_BYTES {
                    continue;
                }
                let Ok(content) = fs::read_to_string(p) else {
                    continue;
                };
                let Ok(rel) = p.strip_prefix(&vault_mods_lane) else {
                    continue;
                };
                let rel_fwd = rel.to_string_lossy().replace('\\', "/");
                if !seen_rel_configs.insert(rel_fwd.to_ascii_lowercase()) {
                    continue;
                }
                let sha256 = calculate_hash(p).unwrap_or_default();
                config_deltas.push(LockfileConfigDelta {
                    rel_path: rel_fwd,
                    sha256,
                    content,
                });
            }
        }

        config_deltas.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        Ok(BlueprintVaultLockState {
            mod_entries,
            config_deltas,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn is_direct_download_candidate_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("nxm://") {
        return true;
    }
    if !lower.starts_with("https://") {
        return false;
    }
    if let Ok(parsed) = url::Url::parse(trimmed) {
        let path_low = parsed.path().to_ascii_lowercase();
        if path_low.ends_with(".html") || path_low.ends_with(".htm") || path_low.ends_with(".php") {
            return false;
        }
        return true;
    }
    false
}

enum StageDownloadOutcome {
    Downloaded {
        guard: DownloadStageCleanupGuard,
        file_path: PathBuf,
    },
    Gated {
        url: String,
        reason: String,
    },
    Failed {
        reason: String,
    },
}

#[tauri::command]
pub async fn hydrate_blueprint_lockfile_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, SecurityState>,
    app_state: tauri::State<'_, AppState>,
    items: Vec<HydrationLockItem>,
    config_deltas: Option<Vec<LockfileConfigDelta>>,
    concurrency: Option<usize>,
) -> Result<HydrationBatchReport, String> {
    let coords = crate::commands::state_ops::get_saved_coordinates();
    if coords.vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".to_string());
    }
    let vault_path = coords.vault_path.clone();
    let vault_root = get_vault_root_dir(&vault_path);
    let vault_mods_lane = get_vault_mods_lane(&vault_path);

    let mut report = HydrationBatchReport::default();
    let total_steps = items.len();
    let max_concurrent = concurrency.unwrap_or(4).clamp(1, 6);
    let sem = Arc::new(tokio::sync::Semaphore::new(max_concurrent));
    let completed_counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let _ = app.emit(
        "blueprint-hydration-progress",
        serde_json::json!({
            "completed": 0,
            "total": total_steps,
            "current_name": items.first().map(|i| i.name.as_str()).unwrap_or(""),
            "phase": "downloading",
        }),
    );

    // Stage 1: Parallel download + SHA-256 verification
    let mut join_handles = Vec::with_capacity(items.len());
    for item in items {
        let app_c = app.clone();
        let vault_root_c = vault_root.clone();
        let sem_c = sem.clone();
        let counter_c = completed_counter.clone();
        join_handles.push(tokio::spawn(async move {
            let _permit = sem_c.acquire_owned().await;
            let raw_url = item.download_url.trim().to_string();
            let fallback = item
                .fallback_url
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            let outcome = if !is_direct_download_candidate_url(&raw_url) {
                let target = fallback.unwrap_or(raw_url);
                StageDownloadOutcome::Gated {
                    url: target,
                    reason: "MANUAL_BROWSER_REQUIRED".to_string(),
                }
            } else {
                match download_verified_url_to_temp(
                    &app_c,
                    &vault_root_c,
                    &raw_url,
                    item.expected_sha256.as_deref(),
                    None,
                )
                .await
                {
                    Ok((guard, file_path, _actual_hex)) => {
                        StageDownloadOutcome::Downloaded { guard, file_path }
                    }
                    Err(err_code) => {
                        if err_code.contains("DIRECT_DOWNLOAD_HTML_GATE") {
                            StageDownloadOutcome::Gated {
                                url: fallback.unwrap_or(raw_url),
                                reason: "DIRECT_DOWNLOAD_HTML_GATE".to_string(),
                            }
                        } else {
                            StageDownloadOutcome::Failed { reason: err_code }
                        }
                    }
                }
            };

            let done = counter_c.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            let _ = app_c.emit(
                "blueprint-hydration-progress",
                serde_json::json!({
                    "completed": done.min(total_steps),
                    "total": total_steps,
                    "current_name": item.name,
                    "phase": "downloading",
                }),
            );
            (item, outcome)
        }));
    }

    let mut staged_items: Vec<(HydrationLockItem, DownloadStageCleanupGuard, PathBuf)> = Vec::new();
    for handle in join_handles {
        let Ok((item, outcome)) = handle.await else {
            continue;
        };
        match outcome {
            StageDownloadOutcome::Downloaded { guard, file_path } => {
                staged_items.push((item, guard, file_path));
            }
            StageDownloadOutcome::Gated { url, reason } => {
                report.gated_browser_items.push(HydrationGatedItem {
                    id: item.id,
                    name: item.name,
                    url,
                    reason,
                });
            }
            StageDownloadOutcome::Failed { reason } => {
                report.failed_items.push(HydrationFailureItem {
                    id: item.id,
                    name: item.name,
                    reason,
                });
            }
        }
    }

    // Stage 2: Ingest downloaded archives, replay saved/lockfile FOMOD options, and apply hidden files
    let staged_count = staged_items.len();
    for (idx, (item, mut guard, file_path)) in staged_items.into_iter().enumerate() {
        let _ = app.emit(
            "blueprint-hydration-progress",
            serde_json::json!({
                "completed": idx + 1,
                "total": staged_count.max(1),
                "current_name": item.name,
                "phase": "installing",
            }),
        );

        let existing_fomod_choices = item
            .target_folder
            .as_deref()
            .and_then(|tf| resolve_mod_folder_in_vault(&vault_mods_lane, tf))
            .or_else(|| resolve_mod_folder_in_vault(&vault_mods_lane, &item.name))
            .map(|dir| read_saved_fomod_choices(&dir))
            .unwrap_or_default();

        let ingest_res = crate::commands::library::ingest_dropped_file(
            app.clone(),
            state.clone(),
            app_state.clone(),
            file_path.to_string_lossy().to_string(),
            item.force_replace.unwrap_or(true),
            item.target_folder.clone(),
            Some(true),
        )
        .await;

        match ingest_res {
            Ok(raw_res) => {
                let parsed: Option<serde_json::Value> = serde_json::from_str(&raw_res).ok();
                if let Some(ref val) = parsed {
                    if val
                        .get("__fomod_wizard")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        if let Some(plan) = val.get("plan") {
                            let sess_id = plan
                                .get("session_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let replay_selections: Vec<String> = item
                                .fomod_selections
                                .clone()
                                .filter(|v| !v.is_empty())
                                .unwrap_or_else(|| existing_fomod_choices.clone());

                            if !sess_id.is_empty() && !replay_selections.is_empty() {
                                let target_folder = item.target_folder.clone().or_else(|| {
                                    plan.get("suggested_target_folder")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                });
                                match replay_fomod_session_headless(
                                    &app,
                                    &app_state,
                                    &sess_id,
                                    target_folder.clone(),
                                    replay_selections,
                                )
                                .await
                                {
                                    Ok(_) => {
                                        if let (Some(folder), Some(hidden)) =
                                            (target_folder, item.hidden_files.as_ref())
                                        {
                                            if !hidden.is_empty() {
                                                let _ = set_mod_hidden_files(
                                                    vault_path.clone(),
                                                    folder,
                                                    hidden.clone(),
                                                );
                                            }
                                        }
                                        report.hydrated_ids.push(item.id);
                                    }
                                    Err(err_msg) => {
                                        report.failed_items.push(HydrationFailureItem {
                                            id: item.id,
                                            name: item.name,
                                            reason: err_msg,
                                        });
                                    }
                                }
                            } else {
                                report.wizard_plans.push(plan.clone());
                                report.hydrated_ids.push(item.id);
                            }
                            continue;
                        }
                    }
                }

                if let Some(ref hidden) = item.hidden_files {
                    if !hidden.is_empty() {
                        if let Some(ref folder) = item.target_folder {
                            let _ = set_mod_hidden_files(
                                vault_path.clone(),
                                folder.clone(),
                                hidden.clone(),
                            );
                        }
                    }
                }
                report.hydrated_ids.push(item.id);
            }
            Err(err_code) => {
                if err_code == "DNA_MATCH" || err_code == "SETTINGS_CONFLICT" {
                    guard.disarm();
                }
                report.failed_items.push(HydrationFailureItem {
                    id: item.id,
                    name: item.name,
                    reason: err_code,
                });
            }
        }
    }

    // Stage 3: Apply validated editable config deltas (strictly schema-allowed & inside Vault/Mods)
    if let Some(deltas) = config_deltas {
        if !deltas.is_empty() {
            let game_schema = app_state
                .active_schema
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            let editable_exts: HashSet<String> =
                crate::game_logic::get_editable_config_extensions(&game_schema)
                    .into_iter()
                    .map(|e| e.trim_start_matches('.').to_ascii_lowercase())
                    .collect();

            let applied = tauri::async_runtime::spawn_blocking(move || -> usize {
                let mut count = 0usize;
                for delta in deltas {
                    if (delta.content.len() as u64) > MAX_CONFIG_DELTA_BYTES {
                        continue;
                    }
                    let Ok(rel_p) = validate_rel_path_safe(&delta.rel_path) else {
                        continue;
                    };
                    let ext = rel_p
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_ascii_lowercase())
                        .unwrap_or_default();
                    if !editable_exts.contains(&ext) {
                        continue;
                    }
                    let dest = vault_mods_lane.join(&rel_p);
                    if ensure_strict_descendant_of_roots(&dest, std::slice::from_ref(&vault_mods_lane))
                        .is_err()
                    {
                        continue;
                    }
                    if atomic_write_bytes(&dest, delta.content.as_bytes()).is_ok() {
                        count += 1;
                    }
                }
                count
            })
            .await
            .unwrap_or(0);
            report.applied_config_deltas = applied;
        }
    }

    Ok(report)
}
