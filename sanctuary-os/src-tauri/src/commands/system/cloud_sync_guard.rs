#![allow(unused_imports)]
use super::file_ops::open_folder;
use super::cloud_provider_detect::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

pub(super) fn count_shallow_symlinks(dir: &std::path::Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    let mut count = 0usize;
    let mut inspected = 0usize;
    let mut queue = std::collections::VecDeque::new();
    queue.push_back((dir.to_path_buf(), 0usize));

    while let Some((cur_dir, depth)) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&cur_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if inspected >= 1000 {
                return count;
            }
            inspected += 1;
            let p = entry.path();
            if crate::utils::is_symlink_or_reparse_point(&p) {
                count += 1;
                continue;
            }
            if depth + 1 < 5 && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                queue.push_back((p, depth + 1));
            }
        }
    }
    count
}

pub(super) fn role_priority(role: &str) -> u8 {
    match role {
        "master_vault" => 6,
        "workspace_vault" => 5,
        "mods_target" => 4,
        "install_route" => 3,
        "user_data" => 2,
        "game_root" => 1,
        _ => 0,
    }
}

pub(super) fn is_symlink_risk_role(role: &str) -> bool {
    matches!(
        role,
        "master_vault" | "workspace_vault" | "mods_target" | "install_route"
    )
}

pub(super) fn supports_provider_folder_exclusion(provider: &str) -> bool {
    matches!(
        provider,
        "Dropbox" | "Nextcloud" | "ownCloud" | "Syncthing" | "Resilio Sync" | "MEGA"
    )
}

pub(super) fn ignore_file_rel_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "Syncthing" => Some(".stignore"),
        "Resilio Sync" => Some(".sync/IgnoreList"),
        "Nextcloud" | "ownCloud" => Some(".sync-exclude.lst"),
        "MEGA" => Some(".megaignore"),
        _ => None,
    }
}

pub(super) fn check_ignore_list_contains_target(
    list_file: &std::path::Path,
    base_root: &std::path::Path,
    target: &std::path::Path,
) -> bool {
    let Ok(raw) = std::fs::read_to_string(list_file) else {
        return false;
    };
    let rel_forward = target
        .strip_prefix(base_root)
        .ok()
        .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_lowercase())
        .filter(|s| !s.is_empty());
    let leaf_lower = target
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }
        let cleaned = trimmed
            .trim_start_matches('/')
            .trim_end_matches('/')
            .trim_end_matches("/*")
            .replace('\\', "/")
            .to_lowercase();
        if let Some(ref rel) = rel_forward {
            if cleaned == *rel {
                return true;
            }
        }
        if let Some(ref leaf) = leaf_lower {
            if cleaned == *leaf {
                return true;
            }
        }
    }
    false
}

pub(super) fn check_is_folder_excluded_from_sync(
    resolved_path: &std::path::Path,
    provider: &str,
    cloud_root_path: Option<&std::path::Path>,
) -> bool {
    if provider == "Dropbox" {
        let mut candidates: Vec<PathBuf> = vec![resolved_path.to_path_buf()];
        if let Some(root) = cloud_root_path {
            let mut cur = resolved_path.parent();
            let mut steps = 0usize;
            while let Some(p) = cur {
                if steps > 8 || normalize_cloud_cmp_path(p) == normalize_cloud_cmp_path(root) {
                    break;
                }
                candidates.push(p.to_path_buf());
                cur = p.parent();
                steps += 1;
            }
        }
        for cand in candidates {
            #[cfg(target_os = "windows")]
            {
                let ads = PathBuf::from(format!(
                    "{}:com.dropbox.ignored",
                    cand.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                ));
                if let Ok(val) = std::fs::read_to_string(&ads) {
                    if val.trim() == "1" {
                        return true;
                    }
                }
            }
            #[cfg(target_os = "macos")]
            {
                if let Ok(out) = std::process::Command::new("xattr")
                    .args(["-p", "com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                if let Ok(out) = std::process::Command::new("getfattr")
                    .args(["--only-values", "-n", "user.com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    if let Some(rel_ignore_file) = ignore_file_rel_for_provider(provider) {
        if let Some(root) = cloud_root_path {
            let list_file = root.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, root, resolved_path)
            {
                return true;
            }
        }
        if let Some(parent) = resolved_path.parent() {
            let list_file = parent.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, parent, resolved_path)
            {
                return true;
            }
        }
    }

    false
}

pub(super) fn resolve_schema_saves_path(
    user_data_dir: Option<&str>,
    active_schema: &Option<crate::schema::GameSchema>,
) -> Option<String> {
    let docs_str = user_data_dir?.trim();
    if docs_str.is_empty() || docs_str.eq_ignore_ascii_case("web") {
        return None;
    }
    let schema = active_schema.as_ref()?;
    let tc = schema.time_capsule.as_ref()?;
    let mut rel_targets: Vec<String> = Vec::new();
    if let Some(ref airgap) = tc.save_airgap_targets {
        for rel in airgap {
            let trimmed = rel.trim();
            if !trimmed.is_empty() && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(trimmed)) {
                rel_targets.push(trimmed.to_string());
            }
        }
    }
    for wt in &tc.world_state_targets {
        let p_trimmed = wt.path.trim();
        let name_lower = wt.name.to_lowercase();
        if !p_trimmed.is_empty()
            && (p_trimmed.to_lowercase().contains("save") || name_lower.contains("save"))
            && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(p_trimmed))
        {
            rel_targets.push(p_trimmed.to_string());
        }
    }
    if rel_targets.is_empty() {
        return None;
    }

    let normalized_docs = if cfg!(target_os = "windows") {
        docs_str.replace('/', "\\")
    } else {
        docs_str.replace('\\', "/")
    };
    let raw_docs_path = std::path::Path::new(&normalized_docs);
    let clean_docs_buf = crate::utils::resolve_canonical_target(raw_docs_path)
        .unwrap_or_else(|_| crate::utils::strip_windows_verbatim_prefix(raw_docs_path));
    let mut first_candidate: Option<PathBuf> = None;
    for rel in rel_targets {
        let expanded_rel = crate::game_logic::expand_env_vars(&rel);
        let resolved = crate::utils::resolve_case_insensitive_path(&clean_docs_buf, &expanded_rel);
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&resolved);
        if cleaned.exists() {
            return Some(cleaned.to_string_lossy().to_string());
        }
        if first_candidate.is_none() {
            first_candidate = Some(cleaned);
        }
    }
    first_candidate.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn inspect_cloud_sync_status(
    paths_override: Option<CloudSyncInspectInput>,
    force_refresh: Option<bool>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<CloudSyncSystemReport, String> {
    let active_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<CloudSyncSystemReport, String> {
        if force_refresh.unwrap_or(false) {
            invalidate_known_cloud_roots_cache();
        }
        let global_cfg = crate::commands::state_ops::get_global_config();
        let coords = crate::commands::state_ops::get_saved_coordinates();

        let ov = paths_override.unwrap_or_default();
        let master_vault = ov
            .master_vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                global_cfg
                    .vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                coords
                    .master_vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            });

        let workspace_vault = ov
            .vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let v = coords.vault_path.trim();
                (!v.is_empty() && !v.eq_ignore_ascii_case("web")).then(|| v.to_string())
            });

        let mods_target = ov
            .mods_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let m = coords.mods_path.trim();
                (!m.is_empty() && !m.eq_ignore_ascii_case("web")).then(|| m.to_string())
            })
            .or_else(|| {
                crate::game_logic::get_default_mods_folder(&active_schema)
                    .map(|p| crate::utils::strip_windows_verbatim_prefix(&p).to_string_lossy().to_string())
            });

        let user_data = ov
            .docs_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                coords
                    .docs_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                let resolved = crate::game_logic::resolve_user_data_root(
                    mods_target.as_deref().unwrap_or(""),
                    &active_schema,
                );
                let s = crate::utils::strip_windows_verbatim_prefix(&resolved)
                    .to_string_lossy()
                    .trim()
                    .to_string();
                (!s.is_empty() && !s.eq_ignore_ascii_case("web")).then_some(s)
            });

        let game_root = ov
            .live_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let l = coords.live_path.trim();
                (!l.is_empty() && !l.eq_ignore_ascii_case("web")).then(|| l.to_string())
            });

        let mut candidates: Vec<(String, String)> = Vec::new();
        if let Some(ref p) = master_vault {
            candidates.push(("master_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = workspace_vault {
            candidates.push(("workspace_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = mods_target {
            candidates.push(("mods_target".to_string(), p.clone()));
        }
        if let Some(ref p) = user_data {
            candidates.push(("user_data".to_string(), p.clone()));
        }
        if let Some(ref p) = game_root {
            candidates.push(("game_root".to_string(), p.clone()));
        }

        // Resolve additional schema install_routes targets dynamically
        let routes = crate::game_logic::get_install_routes(&active_schema);
        for route in routes {
            let base_str = match route.target_root.trim().to_lowercase().as_str() {
                "live_path" | "engine" | "game" => game_root.as_deref().unwrap_or(""),
                "docs_path" | "documents" | "docs" | "user_data" => {
                    user_data.as_deref().unwrap_or("")
                }
                _ => mods_target.as_deref().unwrap_or(""),
            };
            if base_str.is_empty() {
                continue;
            }
            let base_p = PathBuf::from(base_str);
            let sub_trimmed = route.target_subdir.trim();
            let route_target = if sub_trimmed.is_empty() || sub_trimmed == "." {
                base_p
            } else {
                let expanded_sub = crate::game_logic::expand_schema_path_for_os(
                    sub_trimmed,
                    &active_schema,
                    game_root.as_deref(),
                );
                let sub_p = PathBuf::from(&expanded_sub);
                if sub_p.is_absolute() {
                    sub_p
                } else {
                    base_p.join(sub_p)
                }
            };
            candidates.push((
                "install_route".to_string(),
                route_target.to_string_lossy().to_string(),
            ));
        }

        let resolved_schema_saves =
            resolve_schema_saves_path(user_data.as_deref(), &active_schema);
        let safe_vault_root = recommended_safe_vault_root();
        let mut by_resolved: std::collections::HashMap<String, CloudSyncPathFinding> =
            std::collections::HashMap::new();

        for (role, raw_path) in candidates {
            let Some(detected) = detect_cloud_provider_for_path(std::path::Path::new(&raw_path)) else {
                continue;
            };
            let dedup_key = normalize_cloud_cmp_path(std::path::Path::new(&detected.resolved_path));
            let replace = by_resolved
                .get(&dedup_key)
                .map(|existing| role_priority(&role) > role_priority(&existing.role))
                .unwrap_or(true);
            if !replace {
                continue;
            }

            let is_excluded_from_sync = check_is_folder_excluded_from_sync(
                std::path::Path::new(&detected.resolved_path),
                &detected.provider,
                detected.cloud_root_path.as_deref().map(std::path::Path::new),
            );
            let symlink_risk = !is_excluded_from_sync && is_symlink_risk_role(&role);
            let symlink_count = if is_symlink_risk_role(&role) {
                count_shallow_symlinks(std::path::Path::new(&detected.resolved_path))
            } else {
                0
            };
            let is_critical = !is_excluded_from_sync
                && (symlink_risk || detected.has_dehydrated_files || detected.is_unpinned);
            let can_pin_hydration = (cfg!(target_os = "windows")
                && (detected.has_dehydrated_files
                    || detected.is_unpinned
                    || detected.provider.eq_ignore_ascii_case("OneDrive")
                    || detected.provider.eq_ignore_ascii_case("iCloud Drive")))
                || (cfg!(target_os = "macos")
                    && detected.provider.eq_ignore_ascii_case("iCloud Drive")
                    && (detected.has_dehydrated_files || detected.is_unpinned));
            let suggested_local_vault_path = if matches!(role.as_str(), "master_vault" | "workspace_vault") {
                Some(safe_vault_root.clone())
            } else {
                None
            };
            let is_parent_folder_synced = detected.cloud_root_path.as_deref().map_or(false, |root| {
                let rp = std::path::Path::new(root);
                let tp = std::path::Path::new(&detected.resolved_path);
                path_starts_with_root(tp, rp)
                    && normalize_cloud_cmp_path(tp) != normalize_cloud_cmp_path(rp)
            });
            let supports_folder_exclusion =
                supports_provider_folder_exclusion(&detected.provider);
            let schema_saves_path = if matches!(
                role.as_str(),
                "mods_target" | "install_route" | "user_data"
            ) {
                resolved_schema_saves.clone()
            } else {
                None
            };

            by_resolved.insert(
                dedup_key,
                CloudSyncPathFinding {
                    role,
                    configured_path: raw_path,
                    resolved_path: detected.resolved_path,
                    cloud_root_path: detected.cloud_root_path,
                    provider: detected.provider,
                    severity: if is_excluded_from_sync {
                        "info".to_string()
                    } else if is_critical {
                        "critical".to_string()
                    } else {
                        "warning".to_string()
                    },
                    symlink_risk,
                    has_dehydrated_files: detected.has_dehydrated_files,
                    is_pinned_locally: detected.is_pinned_locally,
                    is_unpinned: detected.is_unpinned,
                    active_symlink_count: symlink_count,
                    can_pin_hydration,
                    is_windows_kfm_redirect: detected.is_windows_kfm_redirect,
                    suggested_local_vault_path,
                    is_parent_folder_synced,
                    supports_folder_exclusion,
                    is_excluded_from_sync,
                    schema_saves_path,
                },
            );
        }

        let raw_findings: Vec<CloudSyncPathFinding> = by_resolved.into_values().collect();
        let mut findings: Vec<CloudSyncPathFinding> = raw_findings
            .iter()
            .filter(|f| {
                if matches!(f.role.as_str(), "user_data" | "game_root") && !f.has_dehydrated_files {
                    let covered_by_descendant = raw_findings.iter().any(|other| {
                        !std::ptr::eq(*f, other)
                            && matches!(other.role.as_str(), "mods_target" | "install_route")
                            && other.provider.eq_ignore_ascii_case(&f.provider)
                            && path_starts_with_root(
                                std::path::Path::new(&other.resolved_path),
                                std::path::Path::new(&f.resolved_path),
                            )
                    });
                    if covered_by_descendant {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();
        findings.sort_by(|a, b| role_priority(&b.role).cmp(&role_priority(&a.role)));
        let has_interference = findings.iter().any(|f| !f.is_excluded_from_sync);

        let scanned_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(CloudSyncSystemReport {
            has_interference,
            findings,
            recommended_safe_vault_root: safe_vault_root,
            scanned_at_ms,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

pub(super) fn ensure_path_is_allowed_user_dir(target: &std::path::Path) -> Result<PathBuf, String> {
    let resolved = crate::utils::resolve_canonical_target(target)?;
    if crate::utils::is_blocked_sensitive_or_system_path(&resolved) {
        return Err("Refusing to operate on a protected system directory.".into());
    }
    let coords = crate::commands::state_ops::get_saved_coordinates();
    let mut allowed_roots = crate::utils::get_allowed_workspace_roots(&coords);
    for user_dir in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
    ]
    .into_iter()
    .flatten()
    {
        allowed_roots.push(user_dir);
    }
    if allowed_roots.is_empty() {
        return Err("No allowed user or workspace roots resolved.".into());
    }
    crate::utils::ensure_path_within_roots(&resolved, &allowed_roots)?;
    Ok(resolved)
}

#[tauri::command]
pub async fn pin_cloud_folder_local_hydration(
    path: String,
    _state: tauri::State<'_, crate::AppState>,
) -> Result<CloudHydrationPinResult, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<CloudHydrationPinResult, String> {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid folder path.".into());
        }
        let target = PathBuf::from(trimmed);
        if !target.exists() {
            return Err("Target folder does not exist on disk.".into());
        }
        let resolved = ensure_path_is_allowed_user_dir(&target)?;

        let mut pinned_count = 0usize;
        let mut skipped_symlinks = 0usize;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use std::os::windows::process::CommandExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::{
                GetFileAttributesW, SetFileAttributesW, FILE_FLAGS_AND_ATTRIBUTES,
                INVALID_FILE_ATTRIBUTES,
            };
            const FILE_ATTRIBUTE_PINNED: u32 = 0x0008_0000;
            const FILE_ATTRIBUTE_UNPINNED: u32 = 0x0010_0000;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            let pin_entry = |entry_path: &std::path::Path| -> bool {
                let wide: Vec<u16> = entry_path
                    .as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    let current = GetFileAttributesW(PCWSTR(wide.as_ptr()));
                    if current == INVALID_FILE_ATTRIBUTES {
                        return false;
                    }
                    let next = (current | FILE_ATTRIBUTE_PINNED) & !FILE_ATTRIBUTE_UNPINNED;
                    SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(next))
                        .is_ok()
                }
            };

            if !crate::utils::is_symlink_or_reparse_point(&resolved) && pin_entry(&resolved) {
                pinned_count += 1;
            }

            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if p == resolved {
                    continue;
                }
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if pin_entry(p) {
                    pinned_count += 1;
                }
            }

            // Apply folder-level attrib +P -U on the root directory itself (never recursive /S so symlinks remain untouched)
            let _ = std::process::Command::new("attrib")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["+P", "-U"])
                .arg(&resolved)
                .status();
        }

        #[cfg(target_os = "macos")]
        {
            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                    if fname.to_lowercase().ends_with(".icloud") {
                        if std::process::Command::new("brctl")
                            .args(["download"])
                            .arg(p)
                            .status()
                            .map(|s| s.success())
                            .unwrap_or(false)
                        {
                            pinned_count += 1;
                        }
                    }
                }
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = &resolved;
        }

        Ok(CloudHydrationPinResult {
            pinned_count,
            skipped_symlinks,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

pub(super) fn copy_dir_non_destructive_skip_symlinks(
    src_root: &std::path::Path,
    dst_root: &std::path::Path,
) -> Result<(usize, u64), String> {
    let mut copied_files = 0usize;
    let mut copied_bytes = 0u64;
    let mut walker = walkdir::WalkDir::new(src_root).follow_links(false).into_iter();
    while let Some(Ok(entry)) = walker.next() {
        let path = entry.path();
        if path == src_root {
            continue;
        }
        if crate::utils::is_symlink_or_reparse_point(path) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }
        let Ok(rel) = path.strip_prefix(src_root) else {
            continue;
        };
        let target = dst_root.join(rel);
        if entry.file_type().is_dir() {
            let _ = std::fs::create_dir_all(&target);
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if !target.exists() {
                let bytes = std::fs::copy(path, &target).map_err(|e| {
                    format!(
                        "Failed copying {:?} -> {:?}: {}",
                        path.file_name().unwrap_or_default(),
                        target,
                        e
                    )
                })?;
                copied_files += 1;
                copied_bytes = copied_bytes.saturating_add(bytes);
            }
        }
    }
    Ok((copied_files, copied_bytes))
}

#[tauri::command]
pub async fn relocate_master_vault_with_consent(
    source_vault_path: String,
    destination_vault_path: String,
    copy_existing_files: bool,
    wipe_active_symlinks_first: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<VaultRelocationResult, String> {
    let dest_trimmed = destination_vault_path.trim().to_string();
    if dest_trimmed.is_empty() || dest_trimmed.eq_ignore_ascii_case("web") {
        return Err("Destination folder path cannot be empty.".into());
    }

    let active_schema_for_wipe = if wipe_active_symlinks_first {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    } else {
        None
    };

    tauri::async_runtime::spawn_blocking(move || -> Result<VaultRelocationResult, String> {
        if wipe_active_symlinks_first {
            let _ = crate::commands::deployment::wipe_symlinks_sync(&active_schema_for_wipe);
        }
        let dest_raw = PathBuf::from(&dest_trimmed);
        if !dest_raw.is_absolute() {
            return Err("Destination folder must be an absolute local path.".into());
        }
        if crate::utils::is_blocked_sensitive_or_system_path(&dest_raw) {
            return Err("Destination folder points to a protected system directory.".into());
        }
        if let Some(cloud_info) = detect_cloud_provider_for_path(&dest_raw) {
            return Err(format!(
                "Destination folder is also inside {} ({}). Choose a local non-synced folder.",
                cloud_info.provider, cloud_info.resolved_path
            ));
        }

        let src_trimmed = source_vault_path.trim();
        let src_resolved = if !src_trimmed.is_empty() && !src_trimmed.eq_ignore_ascii_case("web") {
            let sp = PathBuf::from(src_trimmed);
            let canon_src = crate::utils::resolve_canonical_target(&sp)?;
            if crate::utils::is_blocked_sensitive_or_system_path(&canon_src) {
                return Err("Source folder points to a protected system or sensitive directory.".into());
            }
            let current_global = crate::commands::state_ops::get_global_config();
            if let Some(configured_mv) = current_global
                .vault_path
                .as_deref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            {
                let canon_mv = crate::utils::resolve_canonical_target(std::path::Path::new(configured_mv))
                    .unwrap_or_else(|_| PathBuf::from(configured_mv));
                if !crate::utils::path_is_within_root(&canon_src, &canon_mv) {
                    return Err("Source vault path does not match the currently configured Sanctuary Vault.".into());
                }
            }
            canon_src
        } else {
            PathBuf::new()
        };

        let dest_clean = crate::utils::strip_windows_verbatim_prefix(&dest_raw);
        if !src_resolved.as_os_str().is_empty()
            && (path_starts_with_root(&dest_clean, &src_resolved)
                || path_starts_with_root(&src_resolved, &dest_clean))
        {
            return Err(
                "Destination folder cannot overlap or be nested inside the current storage root."
                    .into(),
            );
        }

        std::fs::create_dir_all(dest_clean.join("Data").join("Themes"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;
        std::fs::create_dir_all(dest_clean.join("Data").join("Lexicons"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;

        let (copied_files_count, copied_bytes) =
            if copy_existing_files && !src_resolved.as_os_str().is_empty() && src_resolved.is_dir()
            {
                copy_dir_non_destructive_skip_symlinks(&src_resolved, &dest_clean)?
            } else {
                (0usize, 0u64)
            };

        let new_master_str = dest_clean.to_string_lossy().to_string();
        let mut global_cfg = crate::commands::state_ops::get_global_config();
        global_cfg.vault_path = Some(new_master_str.clone());
        crate::commands::state_ops::save_coordinates(global_cfg)?;
        invalidate_known_cloud_roots_cache();
        let updated_coords = crate::commands::state_ops::get_saved_coordinates();

        Ok(VaultRelocationResult {
            new_master_vault_path: new_master_str,
            new_active_vault_path: updated_coords.vault_path,
            copied_files_count,
            copied_bytes,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn apply_cloud_sync_folder_exclusion(
    target_path: String,
    provider: String,
    cloud_root_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let trimmed = target_path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid target folder path.".into());
        }
        let target_raw = crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(trimmed));
        if crate::utils::is_blocked_sensitive_or_system_path(&target_raw) {
            return Err("Refusing to modify a protected system directory.".into());
        }
        if !target_raw.exists() {
            let parent = target_raw
                .parent()
                .ok_or_else(|| "Target parent folder does not exist.".to_string())?;
            if !parent.exists() {
                return Err("Target folder and its parent do not exist on disk yet.".into());
            }
            let _ = ensure_path_is_allowed_user_dir(parent)?;
            std::fs::create_dir_all(&target_raw)
                .map_err(|e| format!("Failed creating folder for sync exclusion: {}", e))?;
        }
        let canon_target = ensure_path_is_allowed_user_dir(&target_raw)?;
        let prov = provider.trim();

        if prov == "Dropbox" {
            #[cfg(target_os = "windows")]
            {
                let ads_path = format!(
                    "{}:com.dropbox.ignored",
                    canon_target.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                );
                std::fs::write(&ads_path, b"1")
                    .map_err(|e| format!("Failed writing Dropbox ignore stream: {}", e))?;
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(target_os = "macos")]
            {
                let status = std::process::Command::new("xattr")
                    .args(["-w", "com.dropbox.ignored", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking xattr: {}", e))?;
                if !status.success() {
                    return Err("xattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                let status = std::process::Command::new("setfattr")
                    .args(["-n", "user.com.dropbox.ignored", "-v", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking setfattr: {}", e))?;
                if !status.success() {
                    return Err("setfattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
        }

        let Some(rel_ignore_file) = ignore_file_rel_for_provider(prov) else {
            return Err(format!(
                "{} does not support native folder-ignore exclusion files.",
                prov
            ));
        };

        let base_root = if let Some(ref raw_root) = cloud_root_path {
            let root_trimmed = raw_root.trim();
            if !root_trimmed.is_empty() {
                let root_p =
                    crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(root_trimmed));
                if let Ok(canon_root) = ensure_path_is_allowed_user_dir(&root_p) {
                    if path_starts_with_root(&canon_target, &canon_root)
                        && normalize_cloud_cmp_path(&canon_target)
                            != normalize_cloud_cmp_path(&canon_root)
                    {
                        canon_root
                    } else {
                        canon_target
                            .parent()
                            .map(|p| p.to_path_buf())
                            .unwrap_or_else(|| canon_target.clone())
                    }
                } else {
                    canon_target
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| canon_target.clone())
                }
            } else {
                canon_target
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| canon_target.clone())
            }
        } else {
            canon_target
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| canon_target.clone())
        };

        let rel_pattern = canon_target
            .strip_prefix(&base_root)
            .ok()
            .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                canon_target
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| "Could not determine relative folder name to exclude.".to_string())?;

        let ignore_file = base_root.join(rel_ignore_file);
        if let Some(parent) = ignore_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let existing = std::fs::read_to_string(&ignore_file).unwrap_or_default();
        if !check_ignore_list_contains_target(&ignore_file, &base_root, &canon_target) {
            let mut next_content = existing;
            if !next_content.is_empty() && !next_content.ends_with('\n') {
                next_content.push('\n');
            }
            let entry = if prov == "Syncthing" || prov == "Nextcloud" || prov == "ownCloud" {
                format!("/{}\n", rel_pattern)
            } else {
                format!("{}\n", rel_pattern)
            };
            next_content.push_str(&entry);
            std::fs::write(&ignore_file, next_content.as_bytes())
                .map_err(|e| format!("Failed updating {}: {}", rel_ignore_file, e))?;
        }

        invalidate_known_cloud_roots_cache();
        Ok(prov.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_cloud_sync_provider_settings(
    provider: String,
    target_path: Option<String>,
    cloud_root_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let p_lower = provider.trim().to_lowercase();
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            if p_lower.contains("google") {
                for env_var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
                    let Ok(base) = std::env::var(env_var) else {
                        continue;
                    };
                    let dfs_dir = PathBuf::from(&base).join("Google").join("Drive File Stream");
                    let direct_exe = dfs_dir.join("GoogleDriveFS.exe");
                    // GoogleDriveFS.exe defines `--preferences` as a key:value config override flag
                    // (causing "ERROR: Missing the value for the flag 'preferences'"); the official
                    // Start Menu shortcut launches GoogleDriveFS.exe with zero arguments to open/focus UI.
                    if direct_exe.is_file() && std::process::Command::new(&direct_exe).spawn().is_ok()
                    {
                        return Ok(());
                    }
                    if let Ok(entries) = std::fs::read_dir(&dfs_dir) {
                        let mut ver_dirs: Vec<PathBuf> = entries
                            .flatten()
                            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                            .map(|e| e.path())
                            .collect();
                        ver_dirs.sort_by(|a, b| b.cmp(a));
                        for ver_dir in ver_dirs {
                            let ver_exe = ver_dir.join("GoogleDriveFS.exe");
                            if ver_exe.is_file()
                                && std::process::Command::new(&ver_exe).spawn().is_ok()
                            {
                                return Ok(());
                            }
                        }
                    }
                }
            }

            if p_lower.contains("onedrive") {
                for base in [
                    std::env::var("LOCALAPPDATA").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let od_exe = PathBuf::from(base)
                        .join("Microsoft")
                        .join("OneDrive")
                        .join("OneDrive.exe");
                    if od_exe.exists() {
                        if std::process::Command::new(&od_exe)
                            .arg("/settings")
                            .spawn()
                            .is_ok()
                        {
                            return Ok(());
                        }
                    }
                }
                if std::process::Command::new("cmd")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["/c", "start", "ms-settings:backup"])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }

            if p_lower.contains("dropbox") {
                for base in [
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let db_exe = PathBuf::from(base)
                        .join("Dropbox")
                        .join("Client")
                        .join("Dropbox.exe");
                    if db_exe.is_file() && std::process::Command::new(&db_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("nextcloud") {
                for base in [
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let nc_exe = PathBuf::from(base).join("Nextcloud").join("nextcloud.exe");
                    if nc_exe.is_file() && std::process::Command::new(&nc_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("mega") {
                if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
                    let mega_exe = PathBuf::from(local_app)
                        .join("MEGAsync")
                        .join("MEGAsync.exe");
                    if mega_exe.is_file() && std::process::Command::new(&mega_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let mac_app = if p_lower.contains("google") {
                Some("Google Drive")
            } else if p_lower.contains("onedrive") {
                Some("OneDrive")
            } else if p_lower.contains("dropbox") {
                Some("Dropbox")
            } else if p_lower.contains("nextcloud") {
                Some("Nextcloud")
            } else if p_lower.contains("mega") {
                Some("MEGAsync")
            } else {
                None
            };
            if let Some(app_name) = mac_app {
                if std::process::Command::new("open")
                    .args(["-a", app_name])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
            if p_lower.contains("icloud") {
                if std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preferences.AppleIDPrefPane")
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
        }

        let _ = p_lower;
        for raw_opt in [cloud_root_path, target_path] {
            if let Some(raw_target) = raw_opt {
                let trimmed = raw_target.trim();
                if !trimmed.is_empty() {
                    let mut candidate = PathBuf::from(trimmed);
                    while !candidate.exists() {
                        let Some(parent) = candidate.parent() else {
                            break;
                        };
                        candidate = parent.to_path_buf();
                    }
                    if candidate.exists() {
                        return open_folder(candidate.to_string_lossy().to_string());
                    }
                }
            }
        }

        Err("Could not open cloud provider settings automatically.".into())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}


