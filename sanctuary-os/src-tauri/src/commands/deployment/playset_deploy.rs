use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::io::Write;
use std::path::{Path, PathBuf};
use super::airgap_journal::*;

pub fn cleanup_routed_links(vault_path: &str) {
    if vault_path.trim().is_empty() {
        return;
    }
    let mut records_all: Vec<RoutedFileRecord> = Vec::new();
    let mut json_payloads = Vec::new();
    if let Some((raw, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
        json_payloads.push(raw);
        crate::utils::delete_vault_kv(vault_path, "routed_links");
    }
    let manifest_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.json");
    if manifest_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_file) {
            json_payloads.push(content);
        }
        let _ = std::fs::remove_file(&manifest_file);
    }
    for content in json_payloads {
        if let Ok(records) = serde_json::from_str::<Vec<RoutedFileRecord>>(&content) {
            records_all.extend(records);
        }
    }

    let wal_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.jsonl");
    if wal_file.exists() {
        if let Ok(wal_content) = std::fs::read_to_string(&wal_file) {
            for line in wal_content.lines() {
                if let Ok(rec) = serde_json::from_str::<RoutedFileRecord>(line.trim()) {
                    if !records_all.iter().any(|r| r.target_path == rec.target_path) {
                        records_all.push(rec);
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&wal_file);
    }

    for rec in records_all {
        let target = PathBuf::from(&rec.target_path);
        if target.exists() || std::fs::symlink_metadata(&target).is_ok() {
            let _ = crate::utils::remove_file_clearing_readonly(&target);
        }
        if let Some(bak_str) = rec.backup_path {
            let bak = PathBuf::from(&bak_str);
            if bak.exists() {
                let _ = std::fs::rename(&bak, &target);
            }
        } else {
            crate::utils::restore_vanilla_backup_if_present(&target);
        }
    }
}

pub fn resolve_route_for_file(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Option<(PathBuf, PathBuf, bool, bool)> {
    if source.is_dir() || routes.is_empty() {
        return None;
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| format!(".{}", s.to_lowercase()))
        .unwrap_or_default();
    let fname_lower = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let rel_norm = rel_hint.replace('\\', "/");
    let rel_trimmed = rel_norm.trim_matches('/');

    for route in routes {
        let has_ext = !route.extensions.is_empty();
        let has_names = route
            .file_names
            .as_ref()
            .map_or(false, |names| names.iter().any(|n| !n.trim().is_empty()));
        let clean_fm = route
            .folder_match
            .as_deref()
            .map(|s| s.trim().trim_matches(&['/', '\\'][..]).replace('\\', "/"))
            .filter(|s| !s.is_empty());
        let has_folder = clean_fm.is_some();

        if !has_ext && !has_names && !has_folder {
            continue;
        }

        let ext_matched = has_ext
            && route.extensions.iter().any(|re| {
                let clean = if re.starts_with('.') {
                    re.to_lowercase()
                } else {
                    format!(".{}", re.to_lowercase())
                };
                clean == ext
            });

        let file_name_matched = has_names
            && route
                .file_names
                .as_ref()
                .map(|names| {
                    names
                        .iter()
                        .any(|n| !n.trim().is_empty() && n.trim().eq_ignore_ascii_case(&fname_lower))
                })
                .unwrap_or(false);

        let mut matched_subpath: Option<String> = None;
        let folder_matched = if let Some(fm) = clean_fm {
            let segs: Vec<&str> = rel_trimmed.split('/').filter(|s| !s.is_empty()).collect();
            let fm_segs: Vec<&str> = fm.split('/').filter(|s| !s.is_empty()).collect();
            let mut found_after: Option<String> = None;
            if !fm_segs.is_empty() && segs.len() > fm_segs.len() {
                for start in 0..=(segs.len() - fm_segs.len() - 1) {
                    let window_matches = segs[start..start + fm_segs.len()]
                        .iter()
                        .zip(fm_segs.iter())
                        .all(|(a, b)| a.eq_ignore_ascii_case(b));
                    if window_matches {
                        found_after = Some(segs[start + fm_segs.len()..].join("/"));
                        break;
                    }
                }
            }
            if let Some(after) = found_after {
                matched_subpath = Some(after);
                true
            } else {
                false
            }
        } else {
            false
        };

        if (!has_ext || ext_matched)
            && (!has_names || file_name_matched)
            && (!has_folder || folder_matched)
        {
            let base_root = match route.target_root.to_lowercase().as_str() {
                "live_path" | "engine" | "game" => live_root,
                "docs_path" | "documents" | "docs" | "user_data" => docs_root,
                _ => mods_dir,
            };
            if base_root.as_os_str().is_empty() {
                continue;
            }
            let target_dir = if route.target_subdir.trim().is_empty() {
                base_root.to_path_buf()
            } else {
                crate::utils::resolve_case_insensitive_path(base_root, &route.target_subdir)
            };

            let rel_dest = if let Some(sub) = matched_subpath.filter(|s| !s.is_empty()) {
                sub
            } else {
                source.file_name()?.to_string_lossy().to_string()
            };
            let rel_dest_path = Path::new(&rel_dest);
            if !rel_dest_path
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
            {
                continue;
            }

            let target_file = crate::utils::resolve_case_insensitive_path(&target_dir, &rel_dest);
            let allowed_roots = [base_root.to_path_buf()];
            if crate::utils::ensure_strict_descendant_of_roots(&target_file, &allowed_roots)
                .is_err()
                || !crate::utils::is_safe_user_file_path(&target_file)
            {
                continue;
            }

            return Some((
                target_file,
                base_root.to_path_buf(),
                route.preserve_vanilla.unwrap_or(true),
                route.apply_load_order_prefix.unwrap_or(false),
            ));
        }
    }
    None
}

pub fn route_file_if_matched(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Option<RoutedFileRecord> {
    route_file_with_prefix_if_matched(source, rel_hint, routes, live_root, docs_root, mods_dir, None)
}

pub fn route_file_with_prefix_if_matched(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
    prefix: Option<&str>,
) -> Option<RoutedFileRecord> {
    route_file_with_prefix_and_mode_if_matched(
        source,
        rel_hint,
        routes,
        live_root,
        docs_root,
        mods_dir,
        prefix,
        true,
        false,
    )
}

pub fn route_file_with_prefix_and_mode_if_matched(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
    prefix: Option<&str>,
    allow_write: bool,
    is_mutable_config: bool,
) -> Option<RoutedFileRecord> {
    route_file_with_prefix_and_mode_inner(
        source,
        rel_hint,
        routes,
        live_root,
        docs_root,
        mods_dir,
        prefix,
        allow_write,
        is_mutable_config,
        true,
    )
}

fn route_file_with_prefix_and_mode_inner(
    source: &Path,
    rel_hint: &str,
    routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
    prefix: Option<&str>,
    allow_write: bool,
    is_mutable_config: bool,
    check_space_on_copy: bool,
) -> Option<RoutedFileRecord> {
    let (mut target_file, _base_root, preserve_vanilla, apply_prefix) = resolve_route_for_file(
        source,
        rel_hint,
        routes,
        live_root,
        docs_root,
        mods_dir,
    )?;

    if apply_prefix {
        if let (Some(pfx), Some(fname)) = (prefix.filter(|p| !p.is_empty()), target_file.file_name().and_then(|n| n.to_str())) {
            target_file = target_file.with_file_name(format!("{}{}", pfx, fname));
        }
    }

    if let Some(parent_dir) = target_file.parent() {
        let _ = std::fs::create_dir_all(parent_dir);
    }

    let bak_path = PathBuf::from(format!(
        "{}.sanctuary_vanilla_bak",
        target_file.to_string_lossy()
    ));
    let mut recorded_bak: Option<String> = None;

    if target_file.exists() || std::fs::symlink_metadata(&target_file).is_ok() {
        let is_symlink = std::fs::read_link(&target_file).is_ok()
            || std::fs::symlink_metadata(&target_file)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);

        if preserve_vanilla && !is_symlink && !bak_path.exists() {
            if std::fs::rename(&target_file, &bak_path).is_ok() {
                recorded_bak = Some(bak_path.to_string_lossy().to_string());
            } else {
                let _ = crate::utils::remove_file_clearing_readonly(&target_file);
            }
        } else {
            let _ = crate::utils::remove_file_clearing_readonly(&target_file);
            if bak_path.exists() {
                recorded_bak = Some(bak_path.to_string_lossy().to_string());
            }
        }
    } else if bak_path.exists() {
        recorded_bak = Some(bak_path.to_string_lossy().to_string());
    }

    if crate::utils::deploy_file_link_batched(
        source,
        &target_file,
        allow_write,
        is_mutable_config,
        check_space_on_copy,
    )
    .is_ok()
    {
        return Some(RoutedFileRecord {
            target_path: target_file.to_string_lossy().to_string(),
            backup_path: recorded_bak,
            source_path: source.to_string_lossy().to_string(),
        });
    }
    None
}

pub(super) fn collect_effective_hidden_set(
    source: &Path,
    payload_hidden: &[String],
) -> std::collections::HashSet<String> {
    let mut set = crate::commands::library::read_mod_hidden_sidecar(source);
    for raw in payload_hidden {
        let norm = raw
            .trim()
            .replace('\\', "/")
            .trim_matches('/')
            .to_ascii_lowercase();
        if !norm.is_empty() {
            set.insert(norm);
        }
    }
    set
}

pub(super) fn is_internal_sanctuary_or_archive_skip(
    file_name_lower: &str,
    ext_lower: &str,
    manifest_lower: &str,
    supported_exts_lower: &[String],
) -> bool {
    if file_name_lower.starts_with(".sanctuary")
        || file_name_lower.starts_with("._")
        || file_name_lower == SANCTUARY_EDGE_MANIFEST_FILE
        || file_name_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || file_name_lower == "desktop.ini"
        || file_name_lower == ".ds_store"
        || file_name_lower == "thumbs.db"
        || (!manifest_lower.is_empty() && file_name_lower == manifest_lower)
    {
        return true;
    }

    if matches!(ext_lower, "zip" | "rar" | "7z")
        && !supported_exts_lower.iter().any(|s| s == ext_lower)
    {
        return true;
    }

    false
}

pub(super) struct DeployGuard {
    pub(super) flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub(super) last_deploy_epoch_ms: std::sync::Arc<std::sync::atomic::AtomicU64>,
}
impl Drop for DeployGuard {
    fn drop(&mut self) {
        self.last_deploy_epoch_ms.store(
            crate::utils::current_epoch_ms(),
            std::sync::atomic::Ordering::SeqCst,
        );
        self.flag.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn deploy_playset_bulk(
    mods: Vec<DeployMod>,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();

    let is_deploying = state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = state.inner().last_deploy_epoch_ms.clone();
    if is_deploying
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err("Deployment or scan already in progress.".into());
    }
    let guard = DeployGuard {
        flag: is_deploying,
        last_deploy_epoch_ms,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;

        let mods_dir = PathBuf::from(&mods_path);
        let vault_dir = PathBuf::from(&vault_path);

        let vault_mods_lane = if crate::utils::is_mods_dir(&vault_dir) {
            vault_dir.clone()
        } else {
            vault_dir.join("Mods")
        };

        if !mods_dir.exists() {
            return Err("Mods folder missing.".into());
        }

        cleanup_routed_links(&vault_path);
        crate::utils::safe_wipe_mods_dir_with_vault(&mods_dir, Some(&vault_path), &game_schema);

        crate::game_logic::generate_manifest_if_needed(&game_schema, &mods_dir);

        let mut vault_rel_index: std::collections::HashMap<String, PathBuf> =
            std::collections::HashMap::new();
        let mut vault_unique_leaf_index: std::collections::HashMap<String, Option<PathBuf>> =
            std::collections::HashMap::new();
        let priority_folders = crate::game_logic::get_priority_folders(&game_schema);
        let load_strategy = crate::game_logic::get_load_order_strategy(&game_schema);
        let install_routes = crate::game_logic::get_install_routes(&game_schema);
        let config_exts = crate::game_logic::get_config_extensions(&game_schema);
        let editable_exts = crate::game_logic::get_editable_config_extensions(&game_schema);
        let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(&game_schema);
        let supported_exts_lower: Vec<String> =
            crate::game_logic::get_supported_extensions(&game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();
        let manifest_lower = crate::game_logic::resolve_manifest_filename(&game_schema)
            .unwrap_or_default()
            .to_lowercase();

        crate::utils::deduplicate_vault_root_configs(&vault_mods_lane, &config_exts, &game_schema);
        let saved_coords = get_saved_coordinates();
        if let Ok(live_ver) = crate::commands::game_info::rip_game_version_with_schema(
            &saved_coords.live_path,
            &game_schema,
        ) {
            let _ = crate::utils::sync_vault_mod_versions_for_game(&vault_path, &live_ver, &[]);
        }
        let live_root =
            crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, &game_schema);
        let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
            &saved_coords,
            &game_schema,
        ));
        let routed_records: std::sync::Mutex<Vec<RoutedFileRecord>> =
            std::sync::Mutex::new(Vec::new());
        let deployed_links: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
        let shared_with_vanilla = crate::utils::dir_looks_like_shared_game_folder(
            &mods_dir,
            &saved_coords.live_path,
            &game_schema,
        );
        let manifest_include_exts: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.load_order.as_ref())
            .and_then(|lo| lo.manifest_targets.as_ref())
            .map(|targets| {
                targets
                    .iter()
                    .flat_map(|t| t.include_extensions.iter())
                    .map(|e| {
                        let c = e.trim().to_ascii_lowercase();
                        if c.starts_with('.') { c } else { format!(".{}", c) }
                    })
                    .filter(|e| e.len() > 1)
                    .collect()
            })
            .unwrap_or_default();

        let journal_lock = std::sync::Mutex::new(());
        let vault_deploy_journal = (!vault_path.trim().is_empty())
            .then(|| PathBuf::from(&vault_path).join(".sanctuary_deploy_journal.jsonl"));
        let mods_deploy_journal = mods_dir.join(".sanctuary_deploy_journal.jsonl");
        let routed_wal_path = (!vault_path.trim().is_empty())
            .then(|| PathBuf::from(&vault_path).join(".sanctuary_routed_links.jsonl"));

        let append_deploy_journal = |dst: &Path| {
            let line = format!("{}\n", dst.to_string_lossy());
            let _jl = journal_lock.lock();
            for jpath in [vault_deploy_journal.as_ref(), Some(&mods_deploy_journal)]
                .into_iter()
                .flatten()
            {
                if let Ok(mut f) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(jpath)
                {
                    let _ = f.write_all(line.as_bytes());
                }
            }
        };

        let record_routed_entry = |rec: RoutedFileRecord| {
            if let Ok(mut guard) = routed_records.lock() {
                if !guard.iter().any(|r| r.target_path == rec.target_path) {
                    if let Some(ref wpath) = routed_wal_path {
                        if let Ok(json_line) = serde_json::to_string(&rec) {
                            let _jl = journal_lock.lock();
                            if let Ok(mut f) = std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(wpath)
                            {
                                let _ = writeln!(f, "{}", json_line);
                            }
                        }
                    }
                    guard.push(rec);
                }
            }
        };

        fn populate_vault_index(
            base_dir: &Path,
            dir: &Path,
            rel_index: &mut std::collections::HashMap<String, PathBuf>,
            unique_leaf_index: &mut std::collections::HashMap<String, Option<PathBuf>>,
        ) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        populate_vault_index(base_dir, &path, rel_index, unique_leaf_index);
                    } else if path.is_file() {
                        if let Ok(rel) = path.strip_prefix(base_dir) {
                            let rel_lower =
                                rel.to_string_lossy().replace('\\', "/").to_lowercase();
                            if !rel_lower.is_empty() {
                                rel_index.insert(rel_lower, path.clone());
                            }
                        }
                        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                            let leaf_lower = file_name.to_lowercase();
                            let is_root_file = path.parent() == Some(base_dir);
                            match unique_leaf_index.get_mut(&leaf_lower) {
                                None => {
                                    unique_leaf_index.insert(leaf_lower, Some(path.clone()));
                                }
                                Some(slot) => {
                                    if is_root_file {
                                        *slot = Some(path.clone());
                                    } else if let Some(existing) = slot.as_ref() {
                                        if existing != &path
                                            && existing.parent() != Some(base_dir)
                                        {
                                            *slot = None;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        for f in priority_folders.iter().rev() {
            let dir_path = if f.is_empty() {
                vault_mods_lane.clone()
            } else {
                vault_mods_lane.join(f)
            };
            populate_vault_index(
                &dir_path,
                &dir_path,
                &mut vault_rel_index,
                &mut vault_unique_leaf_index,
            );
        }

        // Phase 1: Sort DeployMods deterministically by (tier_priority, load_order_index)
        let mut sorted_mods = mods;
        let lo_cfg_ref = game_schema.as_ref().and_then(|s| s.load_order.as_ref());
        let lower_wins = lo_cfg_ref
            .and_then(|l| l.direction.as_deref())
            .map_or(false, |d| d.trim().eq_ignore_ascii_case("lower_wins"));
        sorted_mods.sort_by(|a, b| {
            let pa = crate::load_order_engine::resolve_tier_priority(&game_schema, a.priority_tier.as_deref());
            let pb = crate::load_order_engine::resolve_tier_priority(&game_schema, b.priority_tier.as_deref());
            let ord = pa.cmp(&pb).then_with(|| a.load_order_index.unwrap_or(0).cmp(&b.load_order_index.unwrap_or(0)));
            if lower_wins { ord.reverse() } else { ord }
        });

        let asset_last_wins = !lo_cfg_ref
            .and_then(|l| l.asset_overwrite_order.as_deref())
            .map_or(false, |o| o.trim().eq_ignore_ascii_case("first_wins"));

        // Hoist disk-space preflight once per deployment target root instead of refreshing Disks per file
        let mut checked_space_roots: Vec<PathBuf> = Vec::new();
        for probe_root in [&mods_dir, &live_root, &docs_root] {
            if probe_root.as_os_str().is_empty() || !probe_root.exists() {
                continue;
            }
            if !checked_space_roots.iter().any(|existing| existing == probe_root) {
                let _ = crate::utils::check_available_disk_space(probe_root, 0)?;
                checked_space_roots.push(probe_root.clone());
            }
        }

        let link_with_overwrite = |src: &Path, dst: &Path, allow_write: bool| -> bool {
            append_deploy_journal(dst);
            let dst_exists = dst.exists() || std::fs::symlink_metadata(dst).is_ok();
            if dst_exists {
                let bak_path = PathBuf::from(format!(
                    "{}.sanctuary_vanilla_bak",
                    dst.to_string_lossy()
                ));
                let is_link = crate::utils::is_symlink_or_reparse_point(dst);
                let already_deployed_in_pass = deployed_links
                    .lock()
                    .map(|dl| {
                        let d_str = dst.to_string_lossy();
                        dl.iter().any(|x| x.eq_ignore_ascii_case(&d_str))
                    })
                    .unwrap_or(false);

                if shared_with_vanilla && !is_link && !already_deployed_in_pass && !bak_path.exists() {
                    let _ = std::fs::rename(dst, &bak_path);
                } else if asset_last_wins {
                    let _ = crate::utils::remove_file_clearing_readonly(dst);
                } else {
                    return false;
                }
            }
            let ext_low = src
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();
            let is_mutable_cfg = config_exts.contains(&ext_low) || editable_exts.contains(&ext_low);
            crate::utils::deploy_file_link_batched(src, dst, allow_write, is_mutable_cfg, false).is_ok()
        };

        let ordered_deploy_entries: std::sync::Mutex<Vec<crate::load_order_engine::OrderedDeployEntry>> =
            std::sync::Mutex::new(Vec::new());
        let mods_allowed_roots = [mods_dir.clone()];

        let record_deployed_path = |p: &Path| {
            if let Ok(mut dl) = deployed_links.lock() {
                let p_str = p.to_string_lossy().to_string();
                if !dl.contains(&p_str) {
                    dl.push(p_str);
                }
            }
        };

        // Phase 2: Materialize links deterministically in sorted load order
        let count: usize = sorted_mods
            .into_iter()
            .enumerate()
            .map(|(sorted_idx, m)| {
                let mod_allow_write = m.allow_write;
                let folders_to_check: Vec<&str> =
                    priority_folders.iter().map(|s| s.as_str()).collect();
                let lo_cfg_opt = game_schema.as_ref().and_then(|s| s.load_order.as_ref());
                let tier_prio = crate::load_order_engine::resolve_tier_priority(
                    &game_schema,
                    m.priority_tier.as_deref(),
                );
                let order_idx = m.load_order_index.unwrap_or(sorted_idx);
                let computed_prefix = if load_strategy == "numeric_prefix" {
                    Some(crate::load_order_engine::compute_load_order_prefix(
                        order_idx,
                        lo_cfg_opt,
                        tier_prio,
                    ))
                } else {
                    None
                };

                if let Some(structure_val) = &m.folder_structure {
                    if let Ok(nodes) =
                        serde_json::from_value::<Vec<StructureNode>>(structure_val.clone())
                    {
                        if !nodes.is_empty() {
                            let linked = process_structure_nodes(
                                &game_schema,
                                &nodes,
                                &mods_dir,
                                &vault_mods_lane,
                                &folders_to_check,
                                Some(&deployed_links),
                            );
                            if linked > 0 {
                                return linked;
                            }
                        }
                    }
                }

                let mut search_name = Path::new(&m.path);
                let mut detected_tier_folder: Option<String> = m
                    .priority_tier
                    .clone()
                    .filter(|s| !s.is_empty() && s != "default");

                loop {
                    let mut stripped_any = false;
                    for pf in &priority_folders {
                        if !pf.is_empty() {
                            if let Ok(stripped) = search_name.strip_prefix(pf) {
                                if detected_tier_folder.is_none() {
                                    detected_tier_folder =
                                        Some(pf.trim_start_matches('!').to_string());
                                }
                                search_name = stripped;
                                stripped_any = true;
                                break;
                            }
                        }
                    }
                    if !stripped_any {
                        break;
                    }
                }

                let mut source = vault_mods_lane.join(search_name);
                let mut found = false;
                let search_comp_count = search_name.components().count();

                if search_comp_count == 1 {
                    if let Some(file_name_str) = search_name.to_str() {
                        let file_lower = file_name_str.to_lowercase();
                        if let Some(p) = vault_rel_index
                            .get(&file_lower)
                            .or_else(|| {
                                vault_unique_leaf_index
                                    .get(&file_lower)
                                    .and_then(|o| o.as_ref())
                            })
                        {
                            source = p.clone();
                            found = true;
                        } else {
                            let stem_lower = search_name
                                .file_stem()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_lowercase();
                            for ext in &supported_exts_lower {
                                let test_name = format!("{}.{}", stem_lower, ext);
                                if let Some(p) = vault_rel_index
                                    .get(&test_name)
                                    .or_else(|| {
                                        vault_unique_leaf_index
                                            .get(&test_name)
                                            .and_then(|o| o.as_ref())
                                    })
                                {
                                    source = p.clone();
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    let search_rel_lower = search_name
                        .to_string_lossy()
                        .replace('\\', "/")
                        .trim_matches('/')
                        .to_lowercase();
                    if let Some(p) = vault_rel_index.get(&search_rel_lower) {
                        source = p.clone();
                        found = true;
                    }
                }

                if !found {
                    for f in &folders_to_check {
                        let base_test = if f.is_empty() {
                            vault_mods_lane.join(search_name)
                        } else {
                            vault_mods_lane.join(f).join(search_name)
                        };

                        if base_test.is_file() || base_test.is_dir() {
                            source = base_test;
                            found = true;
                            break;
                        } else {
                            for ext in &supported_exts_lower {
                                if base_test.with_extension(ext).is_file() {
                                    source = base_test.with_extension(ext);
                                    found = true;
                                    break;
                                }
                            }
                            if found {
                                break;
                            }
                        }
                    }
                }

                if !found && search_comp_count == 1 {
                    if let Some(file_name_only) = search_name.file_name() {
                        let file_lower = file_name_only.to_string_lossy().to_lowercase();
                        if let Some(Some(p)) = vault_unique_leaf_index.get(&file_lower) {
                            source = p.clone();
                            found = true;
                            search_name = Path::new(file_name_only);
                        } else {
                            let flat_test = vault_mods_lane.join(file_name_only);
                            if flat_test.is_file() {
                                source = flat_test;
                                found = true;
                                search_name = Path::new(file_name_only);
                            } else {
                                for ext in &supported_exts_lower {
                                    if flat_test.with_extension(ext).is_file() {
                                        source = flat_test.with_extension(ext);
                                        found = true;
                                        search_name = Path::new(file_name_only);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                if !found || Path::new(&m.path).components().count() == 0 {
                    return 0;
                }

                if !source.is_dir() {
                    let fname_lower = source
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    let ext_lower = source
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();
                    if is_internal_sanctuary_or_archive_skip(
                        &fname_lower,
                        &ext_lower,
                        &manifest_lower,
                        &supported_exts_lower,
                    ) {
                        return 0;
                    }

                    let is_mutable_cfg = config_exts.contains(&ext_lower) || editable_exts.contains(&ext_lower);
                    if let Some(rec) = route_file_with_prefix_and_mode_inner(
                        &source,
                        &m.path,
                        &install_routes,
                        &live_root,
                        &docs_root,
                        &mods_dir,
                        computed_prefix.as_deref(),
                        mod_allow_write,
                        is_mutable_cfg,
                        false,
                    ) {
                        record_routed_entry(rec);
                        if let Ok(mut oe) = ordered_deploy_entries.lock() {
                            let fname = source.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
                            let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or(&fname).to_string();
                            oe.push(crate::load_order_engine::OrderedDeployEntry {
                                rel_path: m.target_path.clone().unwrap_or_else(|| fname.clone()).replace('\\', "/"),
                                file_name: fname,
                                stem,
                                metadata: crate::load_order_engine::extract_metadata_for_path(&source, &game_schema),
                                tier_folder: detected_tier_folder.clone(),
                                tier_priority: tier_prio,
                                deployed_path: None,
                            });
                        }
                        return 1;
                    }
                }

                let mut rel_target_path = if let Some(ref t_path) = m.target_path {
                    PathBuf::from(t_path)
                } else {
                    search_name.to_path_buf()
                };

                if load_strategy == "folder_priority" {
                    if let Some(ref tier_folder) = detected_tier_folder {
                        if !tier_folder.is_empty() {
                            if let Some(ref t_path) = m.target_path {
                                let mut clean_t = Path::new(t_path);
                                loop {
                                    let mut stripped_any = false;
                                    for pf in &priority_folders {
                                        if !pf.is_empty() {
                                            if let Ok(stripped) = clean_t.strip_prefix(pf) {
                                                clean_t = stripped;
                                                stripped_any = true;
                                                break;
                                            }
                                        }
                                    }
                                    if !stripped_any {
                                        break;
                                    }
                                }
                                rel_target_path = PathBuf::from(tier_folder).join(clean_t);
                            } else {
                                rel_target_path = PathBuf::from(tier_folder).join(search_name);
                            }
                        }
                    }
                } else if let Some(ref formatted_prefix) = computed_prefix {
                    if let Some(fname) = rel_target_path.file_name().and_then(|n| n.to_str()) {
                        rel_target_path =
                            rel_target_path.with_file_name(format!("{}{}", formatted_prefix, fname));
                    }
                }

                let target = if rel_target_path.as_os_str().is_empty() {
                    mods_dir.clone()
                } else {
                    crate::utils::resolve_case_insensitive_path(
                        &mods_dir,
                        &rel_target_path.to_string_lossy(),
                    )
                };

                let target_boundary_ok = if source.is_dir() {
                    crate::utils::ensure_path_within_roots(&target, &mods_allowed_roots).is_ok()
                } else {
                    crate::utils::ensure_strict_descendant_of_roots(&target, &mods_allowed_roots)
                        .is_ok()
                };
                if !target_boundary_ok {
                    return 0;
                }

                // Directory-rooted mod unit: deploy full nested tree preserving relative subpaths
                if source.is_dir() {
                    let hidden_set = collect_effective_hidden_set(&source, &m.hidden_files);
                    let mut dir_linked = 0usize;
                    let mut collected_plugin_entries = false;
                    for entry in walkdir::WalkDir::new(&source)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if !entry.file_type().is_file() {
                            continue;
                        }
                        let file_path = entry.path();
                        let Ok(rel_in_mod) = file_path.strip_prefix(&source) else {
                            continue;
                        };
                        let rel_in_mod_low = rel_in_mod
                            .to_string_lossy()
                            .replace('\\', "/")
                            .trim_matches('/')
                            .to_ascii_lowercase();
                        if hidden_set.contains(&rel_in_mod_low) {
                            continue;
                        }
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        let ext_lower = file_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if is_internal_sanctuary_or_archive_skip(
                            &fname_lower,
                            &ext_lower,
                            &manifest_lower,
                            &supported_exts_lower,
                        ) {
                            continue;
                        }

                        let rel_route_hint = format!(
                            "{}/{}",
                            m.path.trim_matches('/'),
                            rel_in_mod.to_string_lossy().replace('\\', "/")
                        );
                        let is_mutable_cfg = config_exts.contains(&ext_lower) || editable_exts.contains(&ext_lower);
                        if let Some(rec) = route_file_with_prefix_and_mode_inner(
                            file_path,
                            &rel_route_hint,
                            &install_routes,
                            &live_root,
                            &docs_root,
                            &mods_dir,
                            computed_prefix.as_deref(),
                            mod_allow_write,
                            is_mutable_cfg,
                            false,
                        ) {
                            record_routed_entry(rec);
                            dir_linked += 1;
                            continue;
                        }

                        let dest = crate::utils::resolve_case_insensitive_path(
                            &target,
                            &rel_in_mod.to_string_lossy(),
                        );
                        if crate::utils::ensure_strict_descendant_of_roots(
                            &dest,
                            &mods_allowed_roots,
                        )
                        .is_err()
                        {
                            continue;
                        }
                        if let Some(parent) = dest.parent() {
                            let _ = std::fs::create_dir_all(parent);
                            let mut cur = Some(parent);
                            while let Some(dir_anc) = cur {
                                if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir)
                                {
                                    break;
                                }
                                record_deployed_path(dir_anc);
                                cur = dir_anc.parent();
                            }
                        }
                        if link_with_overwrite(file_path, &dest, mod_allow_write) {
                            record_deployed_path(&dest);
                            dir_linked += 1;
                            if !manifest_include_exts.is_empty()
                                && manifest_include_exts
                                    .iter()
                                    .any(|ie| fname_lower.ends_with(ie))
                            {
                                if let Ok(mut oe) = ordered_deploy_entries.lock() {
                                    let fname = dest
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or_default()
                                        .to_string();
                                    let stem = dest
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .unwrap_or(&fname)
                                        .to_string();
                                    let d_rel = dest
                                        .strip_prefix(&mods_dir)
                                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                                        .unwrap_or_else(|_| fname.clone());
                                    oe.push(crate::load_order_engine::OrderedDeployEntry {
                                        rel_path: d_rel,
                                        file_name: fname,
                                        stem,
                                        metadata: crate::load_order_engine::extract_metadata_for_path(
                                            file_path,
                                            &game_schema,
                                        ),
                                        tier_folder: detected_tier_folder.clone(),
                                        tier_priority: tier_prio,
                                        deployed_path: Some(dest.clone()),
                                    });
                                    collected_plugin_entries = true;
                                }
                            }
                        }
                    }
                    if dir_linked > 0 && !collected_plugin_entries {
                        if let Ok(mut oe) = ordered_deploy_entries.lock() {
                            let d_name = source.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
                            let d_rel = target.strip_prefix(&mods_dir).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| d_name.clone());
                            oe.push(crate::load_order_engine::OrderedDeployEntry {
                                rel_path: d_rel,
                                file_name: d_name.clone(),
                                stem: d_name,
                                metadata: crate::load_order_engine::extract_metadata_for_path(&source, &game_schema),
                                tier_folder: detected_tier_folder.clone(),
                                tier_priority: tier_prio,
                                deployed_path: Some(target.clone()),
                            });
                        }
                    }
                    return usize::from(dir_linked > 0);
                }

                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                    let mut cur = Some(parent);
                    while let Some(dir_anc) = cur {
                        if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir) {
                            break;
                        }
                        record_deployed_path(dir_anc);
                        cur = dir_anc.parent();
                    }
                }

                if link_with_overwrite(&source, &target, mod_allow_write) {
                    record_deployed_path(&target);
                }
                if let Ok(mut oe) = ordered_deploy_entries.lock() {
                    let fname = target.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
                    let stem = target.file_stem().and_then(|s| s.to_str()).unwrap_or(&fname).to_string();
                    let d_rel = target.strip_prefix(&mods_dir).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| fname.clone());
                    oe.push(crate::load_order_engine::OrderedDeployEntry {
                        rel_path: d_rel,
                        file_name: fname,
                        stem,
                        metadata: crate::load_order_engine::extract_metadata_for_path(&source, &game_schema),
                        tier_folder: detected_tier_folder.clone(),
                        tier_priority: tier_prio,
                        deployed_path: Some(target.clone()),
                    });
                }

                // Schema-configured twin extensions only (zero game-specific fallbacks)
                if let Some(ext) = source.extension().and_then(|e| e.to_str()) {
                    let ext_clean = ext.trim_start_matches('.').to_lowercase();
                    let mut twin_exts: Vec<String> = Vec::new();
                    if let Some(ref s) = game_schema {
                        if let Some(ref groups) = s.extensions.twin_extensions {
                            for group in groups {
                                let cleaned_group: Vec<String> = group
                                    .iter()
                                    .map(|g| g.trim_start_matches('.').to_lowercase())
                                    .filter(|g| !g.is_empty())
                                    .collect();
                                if cleaned_group.contains(&ext_clean) {
                                    for sibling in cleaned_group {
                                        if sibling != ext_clean && !twin_exts.contains(&sibling) {
                                            twin_exts.push(sibling);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    for other_ext in twin_exts {
                        let twin_source = source.with_extension(&other_ext);
                        if twin_source.exists() {
                            let twin_target = target.with_extension(&other_ext);
                            if link_with_overwrite(&twin_source, &twin_target, mod_allow_write) {
                                record_deployed_path(&twin_target);
                            }
                        }
                    }
                }

                // Preserve companion configs AND full nested auxiliary asset subtrees inside mod folders
                if let Some(source_parent) = source.parent() {
                    if let Some(target_parent) = target.parent() {
                        let mut is_top_level = source_parent == vault_mods_lane.as_path();
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
                            let max_aux_depth = if preserve_aux { 16 } else { 1 };
                            for entry in walkdir::WalkDir::new(source_parent)
                                .max_depth(max_aux_depth)
                                .into_iter()
                                .filter_map(|e| e.ok())
                            {
                                if !entry.file_type().is_file() {
                                    continue;
                                }
                                let path = entry.path();
                                if path == source {
                                    continue;
                                }
                                let Ok(rel_sub) = path.strip_prefix(source_parent) else {
                                    continue;
                                };
                                let fname_lower =
                                    entry.file_name().to_string_lossy().to_lowercase();
                                let ext_lower = path
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_lowercase())
                                    .unwrap_or_default();
                                if is_internal_sanctuary_or_archive_skip(
                                    &fname_lower,
                                    &ext_lower,
                                    &manifest_lower,
                                    &supported_exts_lower,
                                ) {
                                    continue;
                                }

                                // Do not auto-pull disabled primary mod modules unless they are configs or auxiliary assets
                                if !preserve_aux && !config_exts.contains(&ext_lower) {
                                    continue;
                                }

                                let rel_sub_str = rel_sub.to_string_lossy().replace('\\', "/");
                                let is_mutable_cfg = config_exts.contains(&ext_lower) || editable_exts.contains(&ext_lower);
                                if let Some(rec) = route_file_with_prefix_and_mode_inner(
                                    path,
                                    &rel_sub_str,
                                    &install_routes,
                                    &live_root,
                                    &docs_root,
                                    &mods_dir,
                                    None,
                                    mod_allow_write,
                                    is_mutable_cfg,
                                    false,
                                ) {
                                    record_routed_entry(rec);
                                    continue;
                                }

                                // Skip sibling primary mod binaries in the same folder that were NOT in the active playset,
                                // while deploying all auxiliary assets (.dds, .nif, .pex, .wem, .json, configs, subfolders, etc.)
                                let is_separate_primary_mod_binary = !supported_exts_lower.is_empty()
                                    && supported_exts_lower.contains(&ext_lower)
                                    && !config_exts.contains(&ext_lower);
                                if is_separate_primary_mod_binary {
                                    continue;
                                }

                                let dest = crate::utils::resolve_case_insensitive_path(
                                    target_parent,
                                    &rel_sub.to_string_lossy(),
                                );
                                if crate::utils::ensure_strict_descendant_of_roots(
                                    &dest,
                                    &mods_allowed_roots,
                                )
                                .is_err()
                                {
                                    continue;
                                }
                                if asset_last_wins || (!dest.exists() && std::fs::symlink_metadata(&dest).is_err()) {
                                    if let Some(dest_parent) = dest.parent() {
                                        let _ = std::fs::create_dir_all(dest_parent);
                                        let mut cur = Some(dest_parent);
                                        while let Some(dir_anc) = cur {
                                            if dir_anc == mods_dir.as_path()
                                                || !dir_anc.starts_with(&mods_dir)
                                            {
                                                break;
                                            }
                                            record_deployed_path(dir_anc);
                                            cur = dir_anc.parent();
                                        }
                                    }
                                    if link_with_overwrite(path, &dest, mod_allow_write) {
                                        record_deployed_path(&dest);
                                    }
                                }
                            }
                        }
                    }
                }

                1
            })
            .sum();

        if let Ok(guard) = routed_records.lock() {
            if !guard.is_empty() {
                if let Ok(json) = serde_json::to_string_pretty(&*guard) {
                    crate::utils::set_vault_kv(&vault_path, "routed_links", &json);
                }
            }
        }

        if let Ok(entries) = ordered_deploy_entries.lock() {
            let written_manifests = crate::load_order_engine::apply_load_order_outputs(
                &game_schema,
                &mods_dir,
                &docs_root,
                &live_root,
                &entries,
            );
            for wp in written_manifests {
                if wp.starts_with(&mods_dir) {
                    record_deployed_path(&wp);
                }
            }
        }

        if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                        let fname_lower = file_name.to_lowercase();
                        let ext_lower = path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if file_name.starts_with('.')
                            || is_internal_sanctuary_or_archive_skip(
                                &fname_lower,
                                &ext_lower,
                                &manifest_lower,
                                &supported_exts_lower,
                            )
                        {
                            continue;
                        }
                        if config_exts.contains(&ext_lower) {
                            let dest = mods_dir.join(file_name);
                            let already_deployed_by_subfolder = deployed_links
                                .lock()
                                .map(|dl| {
                                    dl.iter().any(|existing| {
                                        Path::new(existing)
                                            .file_name()
                                            .and_then(|n| n.to_str())
                                            .map_or(false, |n| n.eq_ignore_ascii_case(file_name))
                                    })
                                })
                                .unwrap_or(false);
                            if !already_deployed_by_subfolder
                                && !dest.exists()
                                && std::fs::symlink_metadata(&dest).is_err()
                            {
                                if link_with_overwrite(&path, &dest, false) {
                                    record_deployed_path(&dest);
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Ok(dl) = deployed_links.lock() {
            if !dl.is_empty() {
                if let Ok(json) = serde_json::to_string_pretty(&*dl) {
                    let _ = crate::utils::atomic_write_bytes(
                        &mods_dir.join(".sanctuary_deployed_links.json"),
                        json.as_bytes(),
                    );
                    crate::utils::set_vault_kv(&vault_path, "deployed_links", &json);
                }
            }
        }
        let _ = std::fs::remove_file(&mods_deploy_journal);
        if let Some(ref vj) = vault_deploy_journal {
            let _ = std::fs::remove_file(vj);
        }
        if let Some(ref rw) = routed_wal_path {
            let _ = std::fs::remove_file(rw);
        }

        Ok(count.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn wipe_symlinks_sync(game_schema: &Option<crate::schema::GameSchema>) -> Result<String, String> {
    let config = get_saved_coordinates();
    cleanup_routed_links(&config.vault_path);
    let target_mods_path = if !config.mods_path.trim().is_empty() {
        &config.mods_path
    } else {
        &config.live_path
    };
    let mods_dir = std::path::PathBuf::from(target_mods_path);
    if !mods_dir.exists() {
        return Ok("No Mods folder".into());
    }
    let before_entries = std::fs::read_dir(&mods_dir)
        .map(|it| it.filter_map(Result::ok).count())
        .unwrap_or(0);
    crate::utils::safe_wipe_mods_dir_with_vault(&mods_dir, Some(&config.vault_path), game_schema);
    let after_entries = std::fs::read_dir(&mods_dir)
        .map(|it| it.filter_map(Result::ok).count())
        .unwrap_or(0);
    let cleaned = before_entries.saturating_sub(after_entries);
    Ok(format!("{} active links severed.", cleaned))
}

#[tauri::command]
pub async fn wipe_symlinks(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || wipe_symlinks_sync(&game_schema))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_routes_logical_and_matching() {
        let tmp = std::env::temp_dir().join("sanctuary_install_route_and_test");
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::create_dir_all(&tmp);
        let live_root = tmp.join("live");
        let docs_root = tmp.join("docs");
        let mods_dir = live_root.join("Data");
        let src_dir = tmp.join("vault");
        let _ = std::fs::create_dir_all(&mods_dir);
        let _ = std::fs::create_dir_all(&docs_root);
        let _ = std::fs::create_dir_all(src_dir.join("SKSE/Plugins"));
        let _ = std::fs::create_dir_all(src_dir.join("Root"));

        let skse_dll = src_dir.join("SKSE/Plugins/po3_Tweaks.dll");
        let root_d3d = src_dir.join("d3d11.dll");
        let dwrite_dll = src_dir.join("DWrite.dll");
        let other_dll = src_dir.join("RandomPlugin.dll");
        let _ = std::fs::write(&skse_dll, b"mz");
        let _ = std::fs::write(&root_d3d, b"mz");
        let _ = std::fs::write(&dwrite_dll, b"mz");
        let _ = std::fs::write(&other_dll, b"mz");

        let routes = vec![
            crate::schema::SchemaInstallRoute {
                id: "skse_plugins".into(),
                extensions: vec![".dll".into(), ".ini".into()],
                folder_match: Some("SKSE/Plugins".into()),
                target_root: "mods_path".into(),
                target_subdir: "SKSE/Plugins".into(),
                preserve_vanilla: Some(true),
                ..Default::default()
            },
            crate::schema::SchemaInstallRoute {
                id: "named_loader".into(),
                extensions: vec![".dll".into()],
                file_names: Some(vec!["DWrite.dll".into()]),
                target_root: "live_path".into(),
                target_subdir: "bin".into(),
                preserve_vanilla: Some(true),
                ..Default::default()
            },
        ];

        // 1. SKSE plugin inside SKSE/Plugins matches extension + folder_match
        let m1 = resolve_route_for_file(
            &skse_dll,
            "MyMod/SKSE/Plugins/po3_Tweaks.dll",
            &routes,
            &live_root,
            &docs_root,
            &mods_dir,
        );
        assert!(m1.is_some());
        assert!(m1.unwrap().0.ends_with(Path::new("SKSE").join("Plugins").join("po3_Tweaks.dll")));

        // 2. Root d3d11.dll must NOT be hijacked by skse_plugins or named_loader
        let m2 = resolve_route_for_file(
            &root_d3d,
            "d3d11.dll",
            &routes,
            &live_root,
            &docs_root,
            &mods_dir,
        );
        assert!(m2.is_none());

        // 3. Exact file_names + ext matches DWrite.dll, ignores RandomPlugin.dll
        let m3 = resolve_route_for_file(
            &dwrite_dll,
            "DWrite.dll",
            &routes,
            &live_root,
            &docs_root,
            &mods_dir,
        );
        assert!(m3.is_some());
        assert!(m3.unwrap().0.ends_with(Path::new("bin").join("DWrite.dll")));

        let m4 = resolve_route_for_file(
            &other_dll,
            "RandomPlugin.dll",
            &routes,
            &live_root,
            &docs_root,
            &mods_dir,
        );
        assert!(m4.is_none());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_selective_file_masking_hidden_files() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_hidden_mask_test_{}",
            uuid::Uuid::new_v4()
        ));
        let mod_src = tmp.join("Mods").join("VisualPack");
        std::fs::create_dir_all(mod_src.join("textures")).unwrap();
        std::fs::write(mod_src.join("textures/keep.dds"), b"dds1").unwrap();
        std::fs::write(mod_src.join("textures/mask_sidecar.dds"), b"dds2").unwrap();
        std::fs::write(mod_src.join("textures/mask_payload.dds"), b"dds3").unwrap();
        std::fs::write(
            mod_src.join(".sanctuary_hidden.json"),
            br#"["Textures\\mask_sidecar.dds"]"#,
        )
        .unwrap();

        let hidden = collect_effective_hidden_set(
            &mod_src,
            &["/textures/mask_payload.dds".to_string()],
        );
        assert!(hidden.contains("textures/mask_sidecar.dds"));
        assert!(hidden.contains("textures/mask_payload.dds"));
        assert!(!hidden.contains("textures/keep.dds"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}

