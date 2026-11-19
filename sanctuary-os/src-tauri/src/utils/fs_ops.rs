#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use rusqlite::{params, Connection};
#[allow(unused_imports)]
use sha2::{Digest, Sha256};
#[allow(unused_imports)]
use std::collections::HashMap;
#[allow(unused_imports)]
use std::fs;
#[allow(unused_imports)]
use std::io::Read;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use rayon::prelude::*;
#[allow(unused_imports)]
use super::archive_ops::*;
#[allow(unused_imports)]
use super::backup_retention::*;
#[allow(unused_imports)]
use super::db_cache::*;
#[allow(unused_imports)]
use super::heuristics::*;
#[allow(unused_imports)]
use super::mod_versions::*;
#[allow(unused_imports)]
use super::path_security::*;

pub const SANCTUARY_EDGE_MANIFEST_FILE: &str = ".sanctuary.manifest.json";
pub const SANCTUARY_EDGE_MANIFEST_SIG_FILE: &str = ".sanctuary.manifest.sig";
pub const SANCTUARY_EDGE_OVERRIDE_FILE: &str = ".sanctuary.override.json";

pub const MAX_ARCHIVE_ENTRY_BYTES: u64 = 32 * 1024 * 1024 * 1024; // 32 GiB per file
pub const MAX_ARCHIVE_TOTAL_BYTES: u64 = 64 * 1024 * 1024 * 1024; // 64 GiB total archive
pub const MAX_ARCHIVE_ENTRIES: usize = 250_000;

/// Atomically writes `bytes` to `path` via a sibling temporary file + `fsync` + `rename`.
pub fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create parent directory {:?}: {}", parent, e))?;

    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let base_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sanctuary_atomic");
    let tmp_path = parent.join(format!(".{}.tmp.{}.{}", base_name, pid, nanos));

    let write_res = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed writing temporary file {:?}: {}", tmp_path, e));
    }

    if path.exists() {
        if let Ok(meta) = fs::metadata(path) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
    }

    if let Err(rename_err) = fs::rename(&tmp_path, path) {
        #[cfg(target_os = "windows")]
        {
            if path.exists() {
                let _ = remove_file_clearing_readonly(path);
                if fs::rename(&tmp_path, path).is_ok() {
                    return Ok(());
                }
            }
        }
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "Failed to atomically replace {:?}: {}",
            path, rename_err
        ));
    }

    Ok(())
}

#[allow(dead_code)]
pub fn process_structure_nodes(
    schema: &Option<crate::schema::GameSchema>,
    nodes: &[StructureNode],
    current_target_dir: &std::path::Path,
    vault_mods_lane: &std::path::Path,
    folders_to_check: &[&str],
    deployed_links: Option<&std::sync::Mutex<Vec<String>>>,
) -> usize {
    let target_roots = [current_target_dir.to_path_buf()];
    let vault_roots = [vault_mods_lane.to_path_buf()];
    let mut linked_count = 0usize;
    for node in nodes {
        if node.node_type == "folder" {
            if !is_safe_single_node_component(&node.name) {
                continue;
            }
            let next_target_dir = current_target_dir.join(node.name.trim());
            if ensure_strict_descendant_of_roots(&next_target_dir, &target_roots).is_err() {
                continue;
            }
            let _ = std::fs::create_dir_all(&next_target_dir);
            if let Some(dl_mutex) = deployed_links {
                if let Ok(mut dl) = dl_mutex.lock() {
                    let dir_str = next_target_dir.to_string_lossy().to_string();
                    if !dl.contains(&dir_str) {
                        dl.push(dir_str);
                    }
                }
            }
            if let Some(children) = &node.children {
                linked_count += process_structure_nodes(
                    schema,
                    children,
                    &next_target_dir,
                    vault_mods_lane,
                    folders_to_check,
                    deployed_links,
                );
            }
        } else if node.node_type == "file" {
            let mod_name = node.assigned_mod_name.as_ref().unwrap_or(&node.name).trim();
            if !is_safe_relative_node_subpath(mod_name) {
                continue;
            }
            let mut source = vault_mods_lane.join(mod_name);
            let mut found = false;
            let exts = crate::game_logic::get_supported_extensions(schema);
            let mod_stem = std::path::Path::new(mod_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(mod_name);

            for f in folders_to_check {
                let dir_root = if f.is_empty() {
                    vault_mods_lane.to_path_buf()
                } else {
                    vault_mods_lane.join(f)
                };
                let candidates = [
                    dir_root.join(mod_name),
                    dir_root.join(mod_stem).join(mod_name),
                ];
                for base_test in candidates {
                    if base_test.is_file() {
                        source = base_test;
                        found = true;
                        break;
                    } else {
                        for ext in &exts {
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
                if found {
                    break;
                }
            }
            if found {
                if ensure_strict_descendant_of_roots(&source, &vault_roots).is_err() {
                    continue;
                }
                let mut final_name = node.name.trim().to_string();
                if final_name.starts_with("*.") {
                    final_name = source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                }
                if !is_safe_single_node_component(&final_name) {
                    continue;
                }
                let target_path = current_target_dir.join(&final_name);
                if ensure_strict_descendant_of_roots(&target_path, &target_roots).is_err() {
                    continue;
                }
                if source.is_dir() {
                    if deploy_junction(&source, &target_path).is_ok() {
                        if let Some(dl_mutex) = deployed_links {
                            if let Ok(mut dl) = dl_mutex.lock() {
                                let t_str = target_path.to_string_lossy().to_string();
                                if !dl.contains(&t_str) {
                                    dl.push(t_str);
                                }
                            }
                        }
                        linked_count += 1;
                    }
                } else {
                    if deploy_file_link_batched(&source, &target_path, true, false, false).is_ok() {
                        if let Some(dl_mutex) = deployed_links {
                            if let Ok(mut dl) = dl_mutex.lock() {
                                let t_str = target_path.to_string_lossy().to_string();
                                if !dl.contains(&t_str) {
                                    dl.push(t_str);
                                }
                            }
                        }
                        linked_count += 1;
                    }
                }
            }
        }
    }
    linked_count
}

pub fn is_mods_dir(path: &Path) -> bool {
    path.file_name()
        .map_or(false, |n| n.to_string_lossy().eq_ignore_ascii_case("mods"))
}

pub fn get_vault_mods_lane(vault_path: &str) -> PathBuf {
    let p = PathBuf::from(vault_path);
    if is_mods_dir(&p) {
        p
    } else {
        p.join("Mods")
    }
}

pub fn get_vault_root_dir(vault_path: &str) -> PathBuf {
    let p = PathBuf::from(vault_path);
    if is_mods_dir(&p) {
        p.parent().unwrap_or(&p).to_path_buf()
    } else {
        p
    }
}

pub fn mark_path_hidden(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::{
            GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN,
            FILE_FLAGS_AND_ATTRIBUTES, INVALID_FILE_ATTRIBUTES,
        };
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let current = GetFileAttributesW(PCWSTR(wide.as_ptr()));
            if current != INVALID_FILE_ATTRIBUTES && (current & FILE_ATTRIBUTE_HIDDEN.0) == 0 {
                let _ = SetFileAttributesW(
                    PCWSTR(wide.as_ptr()),
                    FILE_FLAGS_AND_ATTRIBUTES(current | FILE_ATTRIBUTE_HIDDEN.0),
                );
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
    }
}


pub fn check_available_disk_space(target_dir: &Path, required_bytes: u64) -> Result<(), String> {
    let buffer_bytes = required_bytes.saturating_add(64 * 1024 * 1024);
    let mut probe = strip_windows_verbatim_prefix(target_dir);
    while !probe.exists() {
        match probe.parent() {
            Some(p) if !p.as_os_str().is_empty() => probe = p.to_path_buf(),
            _ => break,
        }
    }
    let resolved_probe = if probe.exists() {
        strip_windows_verbatim_prefix(&std::fs::canonicalize(&probe).unwrap_or(probe))
    } else {
        probe
    };

    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut best_match: Option<(usize, u64)> = None;
    for disk in disks.list() {
        let mount = strip_windows_verbatim_prefix(disk.mount_point());
        if path_is_within_root(&resolved_probe, &mount) {
            let depth = mount.as_os_str().len();
            if best_match.map_or(true, |(best_depth, _)| depth > best_depth) {
                best_match = Some((depth, disk.available_space()));
            }
        }
    }
    if let Some((_, avail)) = best_match {
        if avail < buffer_bytes {
            return Err(format!(
                "Insufficient disk space at {:?}: {} MB required, {} MB available.",
                resolved_probe,
                buffer_bytes / (1024 * 1024),
                avail / (1024 * 1024)
            ));
        }
    }
    Ok(())
}

pub fn remove_file_clearing_readonly(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            if !is_symlink_or_reparse_point(path) {
                if let Ok(meta) = std::fs::symlink_metadata(path) {
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(path, perms);
                        return std::fs::remove_file(path);
                    }
                }
            }
            Err(err)
        }
        Err(err) => Err(err),
    }
}

pub fn remove_dir_all_clearing_readonly(dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            if !is_symlink_or_reparse_point(dir) {
                for entry in walkdir::WalkDir::new(dir)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let p = entry.path();
                    if !is_symlink_or_reparse_point(p) {
                        if let Ok(meta) = std::fs::symlink_metadata(p) {
                            let mut perms = meta.permissions();
                            if perms.readonly() {
                                perms.set_readonly(false);
                                let _ = std::fs::set_permissions(p, perms);
                            }
                        }
                    }
                }
                return std::fs::remove_dir_all(dir);
            }
            Err(err)
        }
        Err(err) => Err(err),
    }
}

pub fn strip_macos_quarantine_xattr(path: &Path) {
    #[cfg(target_os = "macos")]
    {
        if !path.exists() {
            return;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if path.is_dir() {
            if matches!(ext.as_str(), "app" | "bundle" | "framework" | "plugin") {
                let _ = std::process::Command::new("/usr/bin/xattr")
                    .args(["-rd", "com.apple.quarantine"])
                    .arg(path)
                    .output();
            }
        } else if matches!(
            ext.as_str(),
            "dylib" | "so" | "bundle" | "dll" | "asi" | ""
        ) {
            let _ = std::process::Command::new("/usr/bin/xattr")
                .args(["-d", "com.apple.quarantine"])
                .arg(path)
                .output();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}

pub fn strip_macos_quarantine_in_tree(root_dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        if root_dir.exists() {
            let _ = std::process::Command::new("/usr/bin/xattr")
                .args(["-rd", "com.apple.quarantine"])
                .arg(root_dir)
                .output();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = root_dir;
    }
}

pub fn deploy_file_link_batched(
    source: &Path,
    target: &Path,
    allow_write: bool,
    is_mutable_config: bool,
    check_space_on_copy: bool,
) -> std::io::Result<()> {
    let copy_fallback = |src: &Path, dst: &Path| -> std::io::Result<()> {
        if check_space_on_copy {
            let source_len = std::fs::metadata(src).map(|m| m.len()).unwrap_or(0);
            let check_dir = dst.parent().unwrap_or(dst);
            check_available_disk_space(check_dir, source_len)
                .map_err(|msg| std::io::Error::new(std::io::ErrorKind::Other, msg))?;
        }
        std::fs::copy(src, dst)?;
        // Ensure independent physical copies are not stuck read-only when copied from a hardlinked Vault file.
        if let Ok(meta) = std::fs::symlink_metadata(dst) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(dst, perms);
            }
        }
        Ok(())
    };

    if !allow_write && is_mutable_config {
        copy_fallback(source, target)?;
        strip_macos_quarantine_xattr(target);
        return Ok(());
    }

    let linked = if create_symlink_file(source, target).is_ok() {
        Ok(())
    } else if !is_mutable_config {
        match std::fs::hard_link(source, target) {
            Ok(()) => {
                // On non-admin Windows where NTFS hardlinks share the Vault inode, mark read-only assets
                // read-only unless `allow_write` is set so games cannot silently mutate Vault originals.
                #[cfg(target_os = "windows")]
                if !allow_write && !is_symlink_or_reparse_point(target) {
                    if let Ok(meta) = std::fs::symlink_metadata(target) {
                        let mut perms = meta.permissions();
                        if !perms.readonly() {
                            perms.set_readonly(true);
                            let _ = std::fs::set_permissions(target, perms);
                        }
                    }
                }
                Ok(())
            }
            Err(_) => copy_fallback(source, target),
        }
    } else if allow_write {
        std::fs::hard_link(source, target).or_else(|_| copy_fallback(source, target))
    } else {
        copy_fallback(source, target)
    };

    if linked.is_ok() {
        strip_macos_quarantine_xattr(target);
    }
    linked
}

#[allow(dead_code)]
pub fn deploy_file_link_safe(
    source: &Path,
    target: &Path,
    allow_write: bool,
    is_mutable_config: bool,
) -> std::io::Result<()> {
    deploy_file_link_batched(source, target, allow_write, is_mutable_config, true)
}

pub fn deploy_junction(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        if std::os::windows::fs::symlink_dir(source, target).is_ok() {
            return Ok(());
        }
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let target_str = target.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid target path")
        })?;
        let source_str = source.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid source path")
        })?;
        let has_unsafe_chars = |s: &str| {
            s.chars()
                .any(|c| matches!(c, '"' | '&' | '|' | '<' | '>' | '^' | '\r' | '\n' | '\0'))
        };
        if has_unsafe_chars(target_str) || has_unsafe_chars(source_str) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Path contains unsafe shell metacharacters",
            ));
        }
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J", target_str, source_str])
            .creation_flags(CREATE_NO_WINDOW)
            .status()?;

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Junction failed",
            ));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)?;
    }
    Ok(())
}

pub fn create_symlink_file(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::os::windows::fs::symlink_file(source, target)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)
    }
}



pub fn expand_env_vars(path: &str) -> String {
    let trimmed = path.trim();
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .or_else(|| dirs::home_dir().map(|d| d.to_string_lossy().into_owned()));

    let tilde_expanded = if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\")
    {
        if let Some(ref home) = home_dir {
            if trimmed == "~" {
                home.clone()
            } else {
                format!(
                    "{}{}",
                    home.trim_end_matches(|c| c == '/' || c == '\\'),
                    &trimmed[1..]
                )
            }
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    };

    let dollar_expanded = if let Some(ref home) = home_dir {
        tilde_expanded
            .replace("${HOME}", home)
            .replace("$HOME", home)
    } else {
        tilde_expanded
    };

    let mut result = String::new();
    let mut chars = dollar_expanded.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut found_end = false;
            while let Some(&next_c) = chars.peek() {
                if next_c == '%' {
                    chars.next();
                    found_end = true;
                    break;
                }
                var_name.push(chars.next().unwrap());
            }
            if found_end {
                let resolved = std::env::var(&var_name).ok().or_else(|| {
                    match var_name.to_uppercase().as_str() {
                        "USERPROFILE" | "HOME" => home_dir.clone(),
                        "LOCALAPPDATA" => home_dir.as_ref().map(|p| {
                            if cfg!(target_os = "windows") {
                                format!("{}\\AppData\\Local", p)
                            } else if cfg!(target_os = "macos") {
                                format!("{}/Library/Application Support", p)
                            } else {
                                std::env::var("XDG_DATA_HOME")
                                    .ok()
                                    .filter(|v| !v.trim().is_empty())
                                    .unwrap_or_else(|| format!("{}/.local/share", p))
                            }
                        }),
                        "APPDATA" => home_dir.as_ref().map(|p| {
                            if cfg!(target_os = "windows") {
                                format!("{}\\AppData\\Roaming", p)
                            } else if cfg!(target_os = "macos") {
                                format!("{}/Library/Application Support", p)
                            } else {
                                std::env::var("XDG_CONFIG_HOME")
                                    .ok()
                                    .filter(|v| !v.trim().is_empty())
                                    .unwrap_or_else(|| format!("{}/.config", p))
                            }
                        }),
                        "PROGRAMFILES" => Some("C:\\Program Files".to_string()),
                        "PROGRAMFILES(X86)" => Some("C:\\Program Files (x86)".to_string()),
                        _ => None,
                    }
                });
                if let Some(val) = resolved {
                    result.push_str(&val);
                } else {
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    if !cfg!(target_os = "windows") {
        let upper = dollar_expanded.to_uppercase();
        if (upper.contains("%USERPROFILE%")
            || upper.contains("%LOCALAPPDATA%")
            || upper.contains("%APPDATA%"))
            && result.contains('\\')
        {
            result = result.replace('\\', "/");
        }
    }
    result
}

pub(crate) fn normalize_path_key(p: &std::path::Path) -> String {
    p.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

pub(crate) fn dir_looks_like_shared_game_folder(
    dir: &std::path::Path,
    live_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    let schema_flag = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.mods_dir_is_shared_with_vanilla)
        .unwrap_or(false);
    if schema_flag {
        return true;
    }

    let norm_dir = normalize_path_key(dir);
    if !live_path.trim().is_empty() {
        let norm_live = normalize_path_key(std::path::Path::new(live_path.trim()));
        let engine_root =
            crate::game_logic::resolve_game_engine_root(live_path.trim(), game_schema);
        let norm_engine = normalize_path_key(&engine_root);
        if (!norm_live.is_empty() && norm_dir == norm_live)
            || (!norm_engine.is_empty() && norm_dir == norm_engine)
        {
            return true;
        }
    }

    // Also treat any directory that directly contains game executables (.exe or .app) as a shared root folder
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("exe") || ext.eq_ignore_ascii_case("app") {
                    return true;
                }
            }
        }
    }

    false
}

pub(crate) fn rescue_untracked_mod_file(
    file_path: &std::path::Path,
    root_mods_dir: &std::path::Path,
    vault_mods_lane: &std::path::Path,
    supported_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if supported_exts.is_empty() {
        return false;
    }
    if !vault_mods_lane.exists() {
        let _ = std::fs::create_dir_all(vault_mods_lane);
    }
    let fname = match file_path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let fname_lower = fname.to_lowercase();
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    let rel_or_name = file_path
        .strip_prefix(root_mods_dir)
        .unwrap_or(file_path)
        .to_string_lossy();
    if fname_lower.starts_with('.')
        || fname_lower.starts_with("._")
        || fname_lower == "desktop.ini"
        || fname_lower == "thumbs.db"
        || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
        || crate::game_logic::is_cache_file(game_schema, &rel_or_name)
    {
        return false;
    }

    let ext_lower = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.trim_start_matches('.').to_lowercase())
        .unwrap_or_default();
    if ext_lower.is_empty() {
        return false;
    }

    let is_mod_ext = supported_exts
        .iter()
        .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
    if !is_mod_ext {
        return false;
    }

    let src_len = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    if src_len == 0 {
        return false;
    }

    // Check if an identical file (by size + SHA-256) already exists in the Vault
    if let Some(existing_vault_path) =
        find_surviving_vault_file(vault_mods_lane, &fname_lower, file_path)
    {
        let existing_len = std::fs::metadata(&existing_vault_path)
            .map(|m| m.len())
            .unwrap_or(0);
        if existing_len == src_len {
            if let (Ok(h1), Ok(h2)) = (
                calculate_hash(file_path),
                calculate_hash(&existing_vault_path),
            ) {
                if h1 == h2 {
                    let _ = remove_file_clearing_readonly(file_path);
                    return true;
                }
            }
        }
    }

    let rel = file_path
        .strip_prefix(root_mods_dir)
        .unwrap_or_else(|_| std::path::Path::new(fname));
    let mut dest = vault_mods_lane.join(rel);

    if dest.exists() {
        let dest_len = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        if dest_len == src_len {
            if let (Ok(h1), Ok(h2)) = (calculate_hash(file_path), calculate_hash(&dest)) {
                if h1 == h2 {
                    let _ = remove_file_clearing_readonly(file_path);
                    return true;
                }
            }
        }
        let stem = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Artifact");
        let parent = dest.parent().unwrap_or(vault_mods_lane);
        let mut attempt = 1usize;
        loop {
            let candidate_name = if attempt == 1 {
                format!("{}_Rescued.{}", stem, ext_lower)
            } else {
                format!("{}_Rescued_{}.{}", stem, attempt, ext_lower)
            };
            let candidate = parent.join(candidate_name);
            if !candidate.exists() {
                dest = candidate;
                break;
            }
            attempt += 1;
        }
    }

    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if std::fs::rename(file_path, &dest).is_ok() {
        return true;
    }
    if std::fs::copy(file_path, &dest).is_ok() {
        let _ = remove_file_clearing_readonly(file_path);
        return true;
    }

    true
}

pub fn is_symlink_or_reparse_point(path: &std::path::Path) -> bool {
    if std::fs::read_link(path).is_ok() {
        return true;
    }
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        let attrs = meta.file_attributes();
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        const CLOUD_PLACEHOLDER_MASK: u32 = 0x0044_0000; // RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS
        if (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0 && (attrs & CLOUD_PLACEHOLDER_MASK) == 0 {
            return true;
        }
    }
    false
}

pub fn remove_symlink_or_junction(path: &std::path::Path) -> bool {
    let is_dir_link = match std::fs::symlink_metadata(path) {
        Ok(meta) => {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                (meta.file_attributes() & 0x0000_0010) != 0 || meta.is_dir()
            }
            #[cfg(not(target_os = "windows"))]
            {
                meta.is_dir() || path.is_dir()
            }
        }
        Err(_) => false,
    };

    if is_dir_link {
        std::fs::remove_dir(path)
            .or_else(|_| remove_file_clearing_readonly(path))
            .is_ok()
    } else {
        remove_file_clearing_readonly(path)
            .or_else(|_| std::fs::remove_dir(path))
            .is_ok()
    }
}

pub(crate) fn restore_vanilla_backup_if_present(target: &std::path::Path) {
    let bak = std::path::PathBuf::from(format!("{}.sanctuary_vanilla_bak", target.to_string_lossy()));
    if bak.exists()
        && !target.exists()
        && std::fs::symlink_metadata(target).is_err()
    {
        let _ = std::fs::rename(&bak, target);
    }
}

pub(super) fn safe_wipe_mods_dir_inner(
    dir: &std::path::Path,
    root_mods_dir: &std::path::Path,
    vault_mods_lane: &Option<PathBuf>,
    supported_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
    shared_with_vanilla: bool,
    tracked_set: &std::collections::HashSet<String>,
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let items: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(game_schema);
        items.into_par_iter().for_each(|path| {
            if is_symlink_or_reparse_point(&path) {
                let _ = remove_symlink_or_junction(&path);
                restore_vanilla_backup_if_present(&path);
                return;
            }

            let file_name_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Preserve the game schema's root manifest file at the top level of mods_dir
            if dir == root_mods_dir
                && !manifest_leaf.is_empty()
                && file_name_lower == manifest_leaf
            {
                return;
            }

            // Always remove internal Sanctuary deployment state files
            if file_name_lower.starts_with(".sanctuary_") {
                let _ = remove_file_clearing_readonly(&path);
                return;
            }

            let norm = normalize_path_key(&path);

            if shared_with_vanilla {
                if path.is_dir() {
                    safe_wipe_mods_dir_inner(
                        &path,
                        root_mods_dir,
                        vault_mods_lane,
                        supported_exts,
                        game_schema,
                        true,
                        tracked_set,
                    );
                    if tracked_set.contains(&norm) {
                        let _ = std::fs::remove_dir(&path);
                    }
                } else if tracked_set.contains(&norm) {
                    let _ = remove_file_clearing_readonly(&path);
                    restore_vanilla_backup_if_present(&path);
                }
                return;
            }

            if path.is_dir() {
                safe_wipe_mods_dir_inner(
                    &path,
                    root_mods_dir,
                    vault_mods_lane,
                    supported_exts,
                    game_schema,
                    false,
                    tracked_set,
                );
                if let Ok(meta) = std::fs::symlink_metadata(&path) {
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
                let _ = std::fs::remove_dir(&path);
            } else {
                if file_name_lower == "desktop.ini"
                    || file_name_lower == "thumbs.db"
                    || file_name_lower == ".ds_store"
                    || (!manifest_leaf.is_empty() && file_name_lower == manifest_leaf)
                    || tracked_set.contains(&norm)
                {
                    let _ = remove_file_clearing_readonly(&path);
                    restore_vanilla_backup_if_present(&path);
                    return;
                }
                let rel_path = path
                    .strip_prefix(root_mods_dir)
                    .unwrap_or_else(|_| std::path::Path::new(&file_name_lower));
                let rel_str = rel_path.to_string_lossy();
                if crate::game_logic::is_cache_file(game_schema, &rel_str) {
                    let _ = remove_file_clearing_readonly(&path);
                    return;
                }
                if let Some(ref lane) = vault_mods_lane {
                    if rescue_untracked_mod_file(
                        &path,
                        root_mods_dir,
                        lane,
                        supported_exts,
                        game_schema,
                    ) {
                        return;
                    }
                    // Also evacuate non-mod sidecar/config files (e.g. subfolder `.cfg` / `.json` / `.log`)
                    // inside a dedicated (!shared_with_vanilla) mods directory into Vault/Mods so
                    // nested module subdirectories are cleanly emptied and removed without losing user configs!
                    let dest = lane.join(rel_path);
                    if let Some(parent) = dest.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if std::fs::rename(&path, &dest).is_err() {
                        if std::fs::copy(&path, &dest).is_ok() {
                            let _ = remove_file_clearing_readonly(&path);
                        }
                    }
                }
            }
        });
    }
}

pub fn safe_wipe_mods_dir(dir: &std::path::Path, game_schema: &Option<crate::schema::GameSchema>) {
    safe_wipe_mods_dir_with_vault(dir, None, game_schema);
}

pub fn safe_wipe_mods_dir_with_vault(
    dir: &std::path::Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    let shared_with_vanilla =
        dir_looks_like_shared_game_folder(dir, &saved_coords.live_path, game_schema);

    let effective_vault_str = explicit_vault_path
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| saved_coords.vault_path.trim());

    let vault_mods_lane = if !effective_vault_str.is_empty() {
        Some(get_vault_mods_lane(effective_vault_str))
    } else {
        None
    };
    let supported_exts = crate::game_logic::get_supported_extensions(game_schema);

    let mut tracked_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let wipe_roots = [dir.to_path_buf()];
    let mut record_tracked_if_within_mods = |item: &str| {
        let p = std::path::PathBuf::from(item);
        if ensure_strict_descendant_of_roots(&p, &wipe_roots).is_ok() {
            let norm = normalize_path_key(&p);
            if !norm.is_empty() {
                tracked_set.insert(norm);
            }
        }
    };
    let mut manifest_locations = vec![dir.join(".sanctuary_deployed_links.json")];
    let mut journal_locations = vec![dir.join(".sanctuary_deploy_journal.jsonl")];
    if !effective_vault_str.is_empty() {
        if let Some((raw, _)) = get_vault_kv(effective_vault_str, "deployed_links") {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for item in list {
                    record_tracked_if_within_mods(&item);
                }
            }
            delete_vault_kv(effective_vault_str, "deployed_links");
        }
        manifest_locations.push(
            std::path::PathBuf::from(effective_vault_str)
                .join(".sanctuary_deployed_links.json"),
        );
        journal_locations.push(
            std::path::PathBuf::from(effective_vault_str)
                .join(".sanctuary_deploy_journal.jsonl"),
        );
    }

    for loc in &manifest_locations {
        if loc.exists() {
            if let Ok(raw) = std::fs::read_to_string(loc) {
                if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                    for item in list {
                        record_tracked_if_within_mods(&item);
                    }
                }
            }
            let _ = std::fs::remove_file(loc);
        }
    }

    for jloc in &journal_locations {
        if jloc.exists() {
            if let Ok(raw) = std::fs::read_to_string(jloc) {
                for line in raw.lines() {
                    let clean = line.trim();
                    if !clean.is_empty() {
                        record_tracked_if_within_mods(clean);
                    }
                }
            }
            let _ = std::fs::remove_file(jloc);
        }
    }

    safe_wipe_mods_dir_inner(
        dir,
        dir,
        &vault_mods_lane,
        &supported_exts,
        game_schema,
        shared_with_vanilla,
        &tracked_set,
    );
}


pub fn check_is_explicitly_local(
    path: &Path,
    is_script: bool,
    _game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if is_script {
        if let Ok(file) = std::fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(file) = archive.by_index(i) {
                        let name = file.name().to_lowercase();
                        if name.contains("__pycache__") {
                            return true;
                        }
                        if name.ends_with(".pyc") && name.contains('/') {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn junction_unlink_preserves_vault_source_and_case_insensitive_path_merges() {
        let base = std::env::temp_dir().join(format!("fs_ops_test_{}", uuid::Uuid::new_v4()));
        let vault = base.join("Vault");
        let vault_mods = vault.join("Mods");
        let source_mod_dir = vault_mods.join("MyModFolder");
        let mods_dir = base.join("GameMods");

        std::fs::create_dir_all(&source_mod_dir).unwrap();
        std::fs::create_dir_all(mods_dir.join("Textures")).unwrap();
        let vault_payload = source_mod_dir.join("mod_asset.bin");
        std::fs::write(&vault_payload, b"payload").unwrap();

        let resolved_textures = resolve_case_insensitive_path(&mods_dir, "textures/sub/item.dds");
        #[cfg(not(target_os = "windows"))]
        assert!(resolved_textures.to_string_lossy().contains("Textures"));
        #[cfg(target_os = "windows")]
        assert!(resolved_textures
            .parent()
            .and_then(|p| p.parent())
            .map_or(false, |p| p.exists()));

        let link_dest = mods_dir.join("MyModFolder");
        assert!(deploy_junction(&source_mod_dir, &link_dest).is_ok());
        assert!(link_dest.join("mod_asset.bin").exists());

        safe_wipe_mods_dir_with_vault(&mods_dir, Some(&vault.to_string_lossy()), &None);
        assert!(!link_dest.exists());
        assert!(
            vault_payload.exists(),
            "Safe wipe unlinking junction must NEVER delete source files inside Vault"
        );

        let _ = remove_dir_all_clearing_readonly(&base);
    }

    #[test]
    fn deploy_file_link_batched_and_remove_file_clearing_readonly_preserve_source() {
        let base = std::env::temp_dir().join(format!(
            "fs_ops_hardlink_ro_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_mods = base.join("Vault").join("Mods");
        let live_mods = base.join("Game").join("Mods");
        std::fs::create_dir_all(&vault_mods).unwrap();
        std::fs::create_dir_all(&live_mods).unwrap();

        let source = vault_mods.join("mod_asset.bin");
        let target = live_mods.join("mod_asset.bin");
        std::fs::write(&source, b"immutable-mod-bytes").unwrap();

        assert!(deploy_file_link_batched(&source, &target, false, false, false).is_ok());
        assert_eq!(std::fs::read(&target).unwrap(), b"immutable-mod-bytes");

        // Force read-only on target (simulating Windows non-admin hardlink protection)
        if !is_symlink_or_reparse_point(&target) {
            let mut perms = std::fs::symlink_metadata(&target).unwrap().permissions();
            perms.set_readonly(true);
            std::fs::set_permissions(&target, perms).unwrap();
        }

        assert!(remove_file_clearing_readonly(&target).is_ok());
        assert!(!target.exists());
        assert!(
            source.exists(),
            "Unlinking deployed file must preserve original Vault file"
        );

        let _ = remove_dir_all_clearing_readonly(&base);
    }
}
