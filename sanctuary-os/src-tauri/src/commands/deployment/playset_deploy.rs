use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::path::{Path, PathBuf};
use super::airgap_journal::*;

pub fn cleanup_routed_links(vault_path: &str) {
    if vault_path.trim().is_empty() {
        return;
    }
    let mut payloads = Vec::new();
    if let Some((raw, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
        payloads.push(raw);
        crate::utils::delete_vault_kv(vault_path, "routed_links");
    }
    let manifest_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.json");
    if manifest_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_file) {
            payloads.push(content);
        }
        let _ = std::fs::remove_file(&manifest_file);
    }

    for content in payloads {
        if let Ok(records) = serde_json::from_str::<Vec<RoutedFileRecord>>(&content) {
            for rec in records {
                let target = PathBuf::from(&rec.target_path);
                if target.exists() || std::fs::symlink_metadata(&target).is_ok() {
                    let _ = std::fs::remove_file(&target);
                }
                if let Some(bak_str) = rec.backup_path {
                    let bak = PathBuf::from(&bak_str);
                    if bak.exists() {
                        let _ = std::fs::rename(&bak, &target);
                    }
                }
            }
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
    let rel_lower = rel_trimmed.to_lowercase();

    for route in routes {
        let ext_matched = !route.extensions.is_empty()
            && route.extensions.iter().any(|re| {
                let clean = if re.starts_with('.') {
                    re.to_lowercase()
                } else {
                    format!(".{}", re.to_lowercase())
                };
                clean == ext
            });

        let file_name_matched = route
            .file_names
            .as_ref()
            .map(|names| {
                names
                    .iter()
                    .any(|n| !n.trim().is_empty() && n.trim().eq_ignore_ascii_case(&fname_lower))
            })
            .unwrap_or(false);

        let mut matched_subpath: Option<String> = None;
        let folder_matched = if let Some(fm) = route
            .folder_match
            .as_deref()
            .map(|s| s.trim().trim_matches('/').replace('\\', "/"))
            .filter(|s| !s.is_empty())
        {
            let fm_lower = fm.to_lowercase();
            let segs: Vec<&str> = rel_trimmed.split('/').filter(|s| !s.is_empty()).collect();
            let fm_segs: Vec<&str> = fm_lower.split('/').filter(|s| !s.is_empty()).collect();
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
                rel_lower.contains(&fm_lower)
            }
        } else {
            false
        };

        if ext_matched || file_name_matched || folder_matched {
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
                let _ = std::fs::remove_file(&target_file);
            }
        } else {
            let _ = std::fs::remove_file(&target_file);
            if bak_path.exists() {
                recorded_bak = Some(bak_path.to_string_lossy().to_string());
            }
        }
    } else if bak_path.exists() {
        recorded_bak = Some(bak_path.to_string_lossy().to_string());
    }

    let linked = create_symlink_file(source, &target_file)
        .or_else(|_| std::fs::hard_link(source, &target_file))
        .or_else(|_| std::fs::copy(source, &target_file).map(|_| ()));

    if linked.is_ok() {
        return Some(RoutedFileRecord {
            target_path: target_file.to_string_lossy().to_string(),
            backup_path: recorded_bak,
            source_path: source.to_string_lossy().to_string(),
        });
    }
    None
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
        safe_wipe_mods_dir(&mods_dir, &game_schema);

        crate::game_logic::generate_manifest_if_needed(&game_schema, &mods_dir);

        let mut vault_index = std::collections::HashMap::new();
        let priority_folders = crate::game_logic::get_priority_folders(&game_schema);
        let load_strategy = crate::game_logic::get_load_order_strategy(&game_schema);
        let install_routes = crate::game_logic::get_install_routes(&game_schema);
        let config_exts = crate::game_logic::get_config_extensions(&game_schema);
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

        fn populate_vault_index(
            dir: &PathBuf,
            index: &mut std::collections::HashMap<String, PathBuf>,
        ) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        populate_vault_index(&path, index);
                    } else if path.is_file() {
                        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                            index.insert(file_name.to_lowercase(), path.clone());
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
            populate_vault_index(&dir_path, &mut vault_index);
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

        let link_with_overwrite = |src: &Path, dst: &Path| -> bool {
            let dst_exists = dst.exists() || std::fs::symlink_metadata(dst).is_ok();
            if dst_exists {
                if asset_last_wins {
                    let _ = std::fs::remove_file(dst);
                } else {
                    return false;
                }
            }
            create_symlink_file(src, dst)
                .or_else(|_| std::fs::hard_link(src, dst))
                .or_else(|_| std::fs::copy(src, dst).map(|_| ()))
                .is_ok()
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

                if search_name.components().count() == 1 {
                    if let Some(file_name_str) = search_name.to_str() {
                        let file_lower = file_name_str.to_lowercase();
                        if let Some(p) = vault_index.get(&file_lower) {
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
                                if let Some(p) = vault_index.get(&test_name) {
                                    source = p.clone();
                                    found = true;
                                    break;
                                }
                            }
                        }
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

                if !found {
                    if let Some(file_name_only) = search_name.file_name() {
                        let file_lower = file_name_only.to_string_lossy().to_lowercase();
                        if let Some(p) = vault_index.get(&file_lower) {
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

                    if let Some(rec) = route_file_with_prefix_if_matched(
                        &source,
                        &m.path,
                        &install_routes,
                        &live_root,
                        &docs_root,
                        &mods_dir,
                        computed_prefix.as_deref(),
                    ) {
                        if let Ok(mut guard) = routed_records.lock() {
                            if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                guard.push(rec);
                            }
                        }
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

                let mut target = if let Some(ref t_path) = m.target_path {
                    mods_dir.join(t_path)
                } else {
                    mods_dir.join(search_name)
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
                                target = mods_dir.join(tier_folder).join(clean_t);
                            } else {
                                target = mods_dir.join(tier_folder).join(search_name);
                            }
                        }
                    }
                } else if let Some(ref formatted_prefix) = computed_prefix {
                    if let Some(fname) = target.file_name().and_then(|n| n.to_str()) {
                        target = target.with_file_name(format!("{}{}", formatted_prefix, fname));
                    }
                }

                if crate::utils::ensure_strict_descendant_of_roots(&target, &mods_allowed_roots)
                    .is_err()
                {
                    return 0;
                }

                // Directory-rooted mod unit: deploy full nested tree preserving relative subpaths
                if source.is_dir() {
                    let mut dir_linked = 0usize;
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
                        if let Some(rec) = route_file_with_prefix_if_matched(
                            file_path,
                            &rel_route_hint,
                            &install_routes,
                            &live_root,
                            &docs_root,
                            &mods_dir,
                            computed_prefix.as_deref(),
                        ) {
                            if let Ok(mut guard) = routed_records.lock() {
                                if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                    guard.push(rec);
                                }
                            }
                            dir_linked += 1;
                            continue;
                        }

                        let dest = target.join(rel_in_mod);
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
                        if link_with_overwrite(file_path, &dest) {
                            record_deployed_path(&dest);
                            dir_linked += 1;
                        }
                    }
                    if dir_linked > 0 {
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

                if link_with_overwrite(&source, &target) {
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
                            let _ = create_symlink_file(&twin_source, &twin_target)
                                .or_else(|_| std::fs::hard_link(&twin_source, &twin_target))
                                .or_else(|_| std::fs::copy(&twin_source, &twin_target).map(|_| ()));
                            record_deployed_path(&twin_target);
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
                                if let Some(rec) = route_file_if_matched(
                                    path,
                                    &rel_sub_str,
                                    &install_routes,
                                    &live_root,
                                    &docs_root,
                                    &mods_dir,
                                ) {
                                    if let Ok(mut guard) = routed_records.lock() {
                                        if !guard.iter().any(|r| r.target_path == rec.target_path) {
                                            guard.push(rec);
                                        }
                                    }
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

                                let dest = target_parent.join(rel_sub);
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
                                    if link_with_overwrite(path, &dest) {
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
                                let _ = create_symlink_file(&path, &dest)
                                    .or_else(|_| std::fs::hard_link(&path, &dest))
                                    .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
                                record_deployed_path(&dest);
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
    crate::utils::safe_wipe_mods_dir(&mods_dir, game_schema);
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

