#[allow(unused_imports)]
use crate::commands::state_ops::*;
use crate::state::*;
#[allow(unused_imports)]
use crate::utils::*;
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use std::collections::{HashMap, HashSet};
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::airgap::*;
#[allow(unused_imports)]
use super::airgap_journal::*;
#[allow(unused_imports)]
use super::launcher::*;
#[allow(unused_imports)]
use super::playset_deploy::*;
#[allow(unused_imports)]
use super::lab_types_and_audio::*;
#[allow(unused_imports)]
use super::lab_save_and_telemetry::*;
#[allow(unused_imports)]
use super::lab_session::*;

pub(super) fn normalize_mod_lookup_key(
    s: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> String {
    let trimmed = s.trim();
    let without_ext = if let Some((stem, ext)) = trimmed.rsplit_once('.') {
        let ext_lower = ext.to_lowercase();
        let is_schema_ext = crate::game_logic::get_supported_extensions(game_schema)
            .iter()
            .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower))
            || crate::game_logic::get_config_extensions(game_schema)
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
        if is_schema_ext
            || matches!(
                ext_lower.as_str(),
                "zip" | "7z" | "rar" | "jar" | "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml"
            )
        {
            stem
        } else {
            trimmed
        }
    } else {
        trimmed
    };
    without_ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

pub(super) fn resolve_single_mod_target(
    query: &str,
    dna_hash: Option<&str>,
    is_sandbox: bool,
    dev_lane: &Path,
    vault_mods_lane: &Path,
    priority_folders: &[String],
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<PathBuf> {
    let clean_query = query.trim().replace("\\", "/");
    if clean_query.is_empty() {
        return None;
    }
    let query_first_seg = clean_query.split('/').next().unwrap_or("").trim();
    let query_file_name = Path::new(&clean_query)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_stem = Path::new(&clean_query)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_norm = normalize_mod_lookup_key(&query_file_name, game_schema);

    let mut source_target: Option<PathBuf> = None;

    // 1. Check Dev/Sandbox first if is_sandbox or if it exists in Dev/Sandbox
    let query_has_subpath = clean_query.contains('/');
    if dev_lane.exists() {
        let direct_dev = dev_lane.join(&clean_query);
        if direct_dev.exists() && direct_dev != dev_lane {
            source_target = Some(direct_dev);
        } else if !query_has_subpath && !query_first_seg.is_empty() {
            let folder_dev = dev_lane.join(query_first_seg);
            if folder_dev.exists() && folder_dev != dev_lane {
                source_target = Some(folder_dev);
            }
        }
        if source_target.is_none() && is_sandbox {
            if let Ok(entries) = std::fs::read_dir(dev_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_lowercase();
                    let enorm = normalize_mod_lookup_key(&ename, game_schema);
                    if ename == query_file_name
                        || ename == query_stem
                        || (!query_has_subpath && ename == query_first_seg.to_lowercase())
                        || (!query_norm.is_empty() && enorm == query_norm)
                    {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 2. Search Vault Mods lane (and priority folders) if not found yet — return the exact matched file, NEVER its collection folder!
    if source_target.is_none() && vault_mods_lane.exists() {
        for pf in priority_folders {
            let base = if pf.is_empty() {
                vault_mods_lane.to_path_buf()
            } else {
                vault_mods_lane.join(pf)
            };
            if !base.exists() {
                continue;
            }
            let candidate = base.join(&clean_query);
            if candidate.exists() && candidate != base {
                source_target = Some(candidate);
                break;
            }
            if !query_has_subpath && !query_first_seg.is_empty() {
                let folder_cand = base.join(query_first_seg);
                if folder_cand.exists() && folder_cand != base {
                    source_target = Some(folder_cand);
                    break;
                }
            }
        }
    }

    // 3. Search by dna_hash in .sanctuary_cache.db if still not found — return the exact file matching dna_hash!
    if source_target.is_none() {
        if let Some(hash_str) = dna_hash.filter(|h| !h.trim().is_empty()) {
            let cache = load_cache(vault_path);
            for (cached_path, entry) in cache.iter() {
                if entry.dna_hash == hash_str {
                    let p = PathBuf::from(cached_path);
                    if p.exists() {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 4. Case-insensitive and normalized alphanumeric deep walk across Dev/Sandbox and Vault Mods lane
    if source_target.is_none() {
        for search_root in [dev_lane, vault_mods_lane] {
            if !search_root.exists() {
                continue;
            }
            for entry in walkdir::WalkDir::new(search_root)
                .max_depth(4)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let p = entry.path();
                if p == search_root {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                let fstem = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_lowercase();
                let fnorm = normalize_mod_lookup_key(&fname, game_schema);
                if (!query_file_name.is_empty() && fname == query_file_name)
                    || (!query_stem.is_empty() && fstem == query_stem && p.is_file())
                    || (!query_norm.is_empty() && fnorm == query_norm && p.is_file())
                {
                    source_target = Some(p.to_path_buf());
                    break;
                }
            }
            if source_target.is_some() {
                break;
            }
        }
    }

    source_target
}

pub fn deploy_single_mod_to_live_sync(
    mod_path_or_name: &str,
    dna_hash: Option<&str>,
    additional_mods: &[String],
    is_sandbox: bool,
    mods_path: &str,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<Vec<String>, String> {
    let mods_dir = PathBuf::from(mods_path);
    if !mods_dir.exists() {
        let _ = std::fs::create_dir_all(&mods_dir);
    }

    let vault_dir = PathBuf::from(vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir
            .parent()
            .unwrap_or(&vault_dir)
            .join("Dev")
            .join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    cleanup_routed_links(vault_path);
    crate::utils::safe_wipe_mods_dir_with_vault(&mods_dir, Some(vault_path), game_schema);
    crate::game_logic::generate_manifest_if_needed(game_schema, &mods_dir);

    let priority_folders = crate::game_logic::get_priority_folders(game_schema);

    let mut resolved_targets: Vec<PathBuf> = Vec::new();
    if let Some(primary) = resolve_single_mod_target(
        mod_path_or_name,
        dna_hash,
        is_sandbox,
        &dev_lane,
        &vault_mods_lane,
        &priority_folders,
        vault_path,
        game_schema,
    ) {
        resolved_targets.push(primary);
    }

    for extra_query in additional_mods {
        if let Some(extra_path) = resolve_single_mod_target(
            extra_query,
            None,
            false,
            &dev_lane,
            &vault_mods_lane,
            &priority_folders,
            vault_path,
            game_schema,
        ) {
            if !resolved_targets.contains(&extra_path) {
                resolved_targets.push(extra_path);
            }
        }
    }

    // Automatically include atomic script/module twins in Vault/Mods root (never same-extension pack siblings)
    if vault_mods_lane.exists() {
        let mut companion_targets: Vec<PathBuf> = Vec::new();
        for target in &resolved_targets {
            let base_name = target
                .file_stem()
                .or_else(|| target.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let target_ext = target
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let norm = normalize_mod_lookup_key(base_name, game_schema);
            if norm.is_empty() {
                continue;
            }
            let stripped_norm = norm
                .strip_suffix("scripts")
                .or_else(|| norm.strip_suffix("script"))
                .unwrap_or(&norm)
                .to_string();
            let scripts_norm = format!("{}scripts", stripped_norm);
            let script_norm = format!("{}script", stripped_norm);

            if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_string();
                    let e_stem = p
                        .file_stem()
                        .or_else(|| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or(&ename);
                    let enorm = normalize_mod_lookup_key(e_stem, game_schema);
                    let p_ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    let is_script_twin_dir =
                        p.is_dir() && (enorm == scripts_norm || enorm == script_norm);
                    let is_diff_ext_twin_file = p.is_file()
                        && !p_ext.is_empty()
                        && p_ext != target_ext
                        && (enorm == stripped_norm
                            || enorm == scripts_norm
                            || enorm == script_norm);
                    if !enorm.is_empty()
                        && (is_script_twin_dir || is_diff_ext_twin_file)
                        && !resolved_targets.contains(&p)
                        && !companion_targets.contains(&p)
                    {
                        companion_targets.push(p);
                    }
                }
            }
        }
        resolved_targets.extend(companion_targets);
    }

    if resolved_targets.is_empty() {
        return Err(format!(
            "Could not locate mod files for '{}' in Sandbox or Vault.",
            mod_path_or_name
        ));
    }

    // Collect (lane_root_or_mod_parent, src_file) pairs so relative subpaths are preserved
    let mut files_to_link: Vec<(PathBuf, PathBuf)> = Vec::new();

    let compute_anchor_root = |target_dir_or_file: &Path| -> PathBuf {
        if target_dir_or_file.starts_with(&dev_lane) {
            return dev_lane.clone();
        }
        for pf in &priority_folders {
            if !pf.is_empty() {
                let tier_root = vault_mods_lane.join(pf);
                if target_dir_or_file.starts_with(&tier_root) {
                    return tier_root;
                }
            }
        }
        if target_dir_or_file.starts_with(&vault_mods_lane) {
            return vault_mods_lane.clone();
        }
        target_dir_or_file
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| target_dir_or_file.to_path_buf())
    };

    for mut resolved in resolved_targets {
        // 5. If resolved is a .zip file or contains .zip files, extract them in place first
        let supported_exts_lower: Vec<String> =
            crate::game_logic::get_supported_extensions(game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();
        let zip_is_native_mod = supported_exts_lower.iter().any(|e| e == "zip");

        if !zip_is_native_mod
            && resolved.is_file()
            && resolved
                .extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
        {
            let extract_dir = resolved
                .parent()
                .map(|p| {
                    if p == dev_lane.as_path() || p == vault_mods_lane.as_path() {
                        p.join(resolved.file_stem().unwrap_or_default())
                    } else {
                        p.to_path_buf()
                    }
                })
                .unwrap_or_else(|| dev_lane.join("ExtractedMod"));
            if crate::commands::library::extract_sandbox_zip_in_place(
                &resolved,
                &extract_dir,
                game_schema,
            ) > 0
            {
                let _ = std::fs::remove_file(&resolved);
                resolved = extract_dir;
            }
        } else if !zip_is_native_mod && resolved.is_dir() {
            let mut zips = Vec::new();
            for entry in walkdir::WalkDir::new(&resolved)
                .max_depth(2)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file()
                    && entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
                {
                    zips.push(entry.path().to_path_buf());
                }
            }
            for z in zips {
                if crate::commands::library::extract_sandbox_zip_in_place(
                    &z,
                    &resolved,
                    game_schema,
                ) > 0
                {
                    let _ = std::fs::remove_file(&z);
                }
            }
        }

        // 6. Collect deployable files from resolved while retaining their lane anchor root.
        // CRITICAL: When `resolved` is a specific file inside a multi-item collection folder,
        // NEVER symlink every other mod in `parent` — only include `resolved` itself, any atomic
        // script/module twin sharing the same normalized stem with a different extension, and
        // (for single-mod folders on auxiliary-asset engines) non-mod sidecar assets.
        let anchor_root = compute_anchor_root(&resolved);
        if resolved.is_dir() {
            for entry in walkdir::WalkDir::new(&resolved)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let p = entry.path().to_path_buf();
                    if !files_to_link.iter().any(|(_, existing)| existing == &p) {
                        files_to_link.push((anchor_root.clone(), p));
                    }
                }
            }
        } else if resolved.is_file() {
            if !files_to_link.iter().any(|(_, existing)| existing == &resolved) {
                files_to_link.push((anchor_root.clone(), resolved.clone()));
            }
            if let Some(parent) = resolved.parent() {
                let is_shared_lane_root = parent == dev_lane.as_path()
                    || parent == vault_mods_lane.as_path()
                    || priority_folders
                        .iter()
                        .any(|pf| !pf.is_empty() && parent == vault_mods_lane.join(pf));
                if !is_shared_lane_root {
                    let resolved_stem = resolved
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default();
                    let resolved_norm = normalize_mod_lookup_key(resolved_stem, game_schema);
                    let stripped_norm = resolved_norm
                        .strip_suffix("scripts")
                        .or_else(|| resolved_norm.strip_suffix("script"))
                        .unwrap_or(&resolved_norm)
                        .to_string();
                    let scripts_norm = format!("{}scripts", stripped_norm);
                    let script_norm = format!("{}script", stripped_norm);
                    let resolved_ext = resolved
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();

                    let preserve_aux =
                        crate::game_logic::should_preserve_auxiliary_assets(game_schema);
                    let mut primary_mod_stems: std::collections::HashSet<String> =
                        std::collections::HashSet::new();
                    let mut parent_files: Vec<PathBuf> = Vec::new();

                    for entry in walkdir::WalkDir::new(parent)
                        .max_depth(2)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if !entry.file_type().is_file() {
                            continue;
                        }
                        let p = entry.path().to_path_buf();
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        if supported_exts_lower.is_empty()
                            || supported_exts_lower.iter().any(|se| se == &p_ext)
                        {
                            if let Some(st) = p.file_stem().and_then(|s| s.to_str()) {
                                let sn = normalize_mod_lookup_key(st, game_schema);
                                let sn_base = sn
                                    .strip_suffix("scripts")
                                    .or_else(|| sn.strip_suffix("script"))
                                    .unwrap_or(&sn)
                                    .to_string();
                                if !sn_base.is_empty() {
                                    primary_mod_stems.insert(sn_base);
                                }
                            }
                        }
                        parent_files.push(p);
                    }

                    let is_single_mod_folder = primary_mod_stems.len() <= 1;

                    for p in parent_files {
                        if p == resolved {
                            continue;
                        }
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        let p_stem = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or_default();
                        let p_norm = normalize_mod_lookup_key(p_stem, game_schema);

                        let is_atomic_twin = !stripped_norm.is_empty()
                            && !p_ext.is_empty()
                            && p_ext != resolved_ext
                            && (p_norm == stripped_norm
                                || p_norm == scripts_norm
                                || p_norm == script_norm);

                        let is_single_mod_aux_sidecar = preserve_aux
                            && is_single_mod_folder
                            && !supported_exts_lower.is_empty()
                            && !supported_exts_lower.iter().any(|se| se == &p_ext);

                        if (is_atomic_twin || is_single_mod_aux_sidecar)
                            && !files_to_link.iter().any(|(_, existing)| existing == &p)
                        {
                            files_to_link.push((anchor_root.clone(), p));
                        }
                    }
                }
            }
        }
    }

    let install_routes = crate::game_logic::get_install_routes(game_schema);
    let saved_coords = get_saved_coordinates();
    let live_root =
        crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, game_schema);
    let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
        &saved_coords,
        game_schema,
    ));
    let supported_exts_lower: Vec<String> =
        crate::game_logic::get_supported_extensions(game_schema)
            .into_iter()
            .map(|e| e.trim_start_matches('.').to_lowercase())
            .collect();
    let manifest_lower = crate::game_logic::resolve_manifest_filename(game_schema)
        .unwrap_or_default()
        .to_lowercase();
    let max_folder_depth = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.max_folder_depth);

    let mut routed_records: Vec<RoutedFileRecord> = Vec::new();
    let mut linked_names: Vec<String> = Vec::new();
    let mut deployed_links: Vec<String> = Vec::new();
    let mods_allowed_roots = [mods_dir.clone()];

    for (anchor_root, src_file) in files_to_link {
        let fname = match src_file.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let fname_lower = fname.to_lowercase();
        let ext_lower = src_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        if fname_lower.starts_with('.')
            || is_internal_sanctuary_or_archive_skip(
                &fname_lower,
                &ext_lower,
                &manifest_lower,
                &supported_exts_lower,
            )
        {
            continue;
        }

        let rel_sub = src_file
            .strip_prefix(&anchor_root)
            .map(|r| r.to_path_buf())
            .unwrap_or_else(|_| PathBuf::from(&fname));
        let rel_hint_str = rel_sub.to_string_lossy().replace('\\', "/");

        if let Some(rec) = route_file_if_matched(
            &src_file,
            &rel_hint_str,
            &install_routes,
            &live_root,
            &docs_root,
            &mods_dir,
        ) {
            routed_records.push(rec);
            linked_names.push(format!("{} (Routed)", rel_hint_str));
            continue;
        }

        // Preserve relative subpath within mod folder while respecting schema max_folder_depth if set
        let effective_rel: PathBuf = if let Some(max_d) = max_folder_depth {
            let comps: Vec<_> = rel_sub
                .components()
                .filter_map(|c| match c {
                    std::path::Component::Normal(os) => Some(os.to_os_string()),
                    _ => None,
                })
                .collect();
            let folder_depth = comps.len().saturating_sub(1);
            if folder_depth > max_d as usize {
                if max_d == 0 {
                    PathBuf::from(&fname)
                } else {
                    let mut capped = PathBuf::new();
                    for seg in comps.iter().take(max_d as usize) {
                        capped.push(seg);
                    }
                    capped.push(&fname);
                    capped
                }
            } else {
                rel_sub
            }
        } else {
            rel_sub
        };

        let dest_file = mods_dir.join(&effective_rel);
        if crate::utils::ensure_strict_descendant_of_roots(&dest_file, &mods_allowed_roots).is_err()
        {
            continue;
        }
        if let Some(parent_dir) = dest_file.parent() {
            let _ = std::fs::create_dir_all(parent_dir);
            let mut cur = Some(parent_dir);
            while let Some(dir_anc) = cur {
                if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir) {
                    break;
                }
                let dir_str = dir_anc.to_string_lossy().to_string();
                if !deployed_links.contains(&dir_str) {
                    deployed_links.push(dir_str);
                }
                cur = dir_anc.parent();
            }
        }

        if dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok() {
            let _ = std::fs::remove_file(&dest_file);
        }

        let link_res = create_symlink_file(&src_file, &dest_file)
            .or_else(|_| std::fs::hard_link(&src_file, &dest_file))
            .or_else(|_| std::fs::copy(&src_file, &dest_file).map(|_| ()));

        if link_res.is_ok() && (dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok())
        {
            let dest_str = dest_file.to_string_lossy().to_string();
            if !deployed_links.contains(&dest_str) {
                deployed_links.push(dest_str);
            }
            let display_rel = effective_rel.to_string_lossy().replace('\\', "/");
            if !linked_names.contains(&display_rel) {
                linked_names.push(display_rel);
            }
        }
    }

    // Activate load-order manifests & timestamps for Homestead Lab sessions as well
    let mut lab_entries: Vec<crate::load_order_engine::OrderedDeployEntry> = Vec::new();
    for dp_str in &deployed_links {
        let dp = Path::new(dp_str);
        if !dp.is_file() {
            continue;
        }
        let ext_l = dp
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !supported_exts_lower.is_empty() && !supported_exts_lower.contains(&ext_l) {
            continue;
        }
        let rel = dp
            .strip_prefix(&mods_dir)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if rel.is_empty() {
            continue;
        }
        let fname = dp.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        let stem = dp.file_stem().and_then(|s| s.to_str()).unwrap_or(&fname).to_string();
        let metadata = crate::load_order_engine::extract_metadata_for_path(dp, game_schema);
        lab_entries.push(crate::load_order_engine::OrderedDeployEntry {
            rel_path: rel,
            file_name: fname,
            stem,
            metadata,
            tier_folder: None,
            tier_priority: 0,
            deployed_path: Some(dp.to_path_buf()),
        });
    }
    if !lab_entries.is_empty() {
        let written = crate::load_order_engine::apply_load_order_outputs(
            game_schema,
            &mods_dir,
            &docs_root,
            &live_root,
            &lab_entries,
        );
        for wp in written {
            if wp.starts_with(&mods_dir) {
                let s = wp.to_string_lossy().to_string();
                if !deployed_links.contains(&s) {
                    deployed_links.push(s);
                }
            }
        }
    }

    if !deployed_links.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&deployed_links) {
            let _ = crate::utils::atomic_write_bytes(
                &mods_dir.join(".sanctuary_deployed_links.json"),
                json.as_bytes(),
            );
            crate::utils::set_vault_kv(vault_path, "deployed_links", &json);
        }
    }

    if !routed_records.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&routed_records) {
            crate::utils::set_vault_kv(vault_path, "routed_links", &json);
        }
    }

    if linked_names.is_empty() {
        return Err(format!(
            "No supported mod files found to symlink for '{}'.",
            mod_path_or_name
        ));
    }

    Ok(linked_names)
}

#[tauri::command]
pub async fn deploy_mod_for_lab_test(
    mod_path_or_name: String,
    dna_hash: Option<String>,
    additional_mods: Option<Vec<String>>,
    is_sandbox: bool,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
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
        let extra = additional_mods.unwrap_or_default();
        deploy_single_mod_to_live_sync(
            &mod_path_or_name,
            dna_hash.as_deref(),
            &extra,
            is_sandbox,
            &mods_path,
            &vault_path,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
