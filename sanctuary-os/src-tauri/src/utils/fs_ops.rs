#![allow(unused_imports)]
use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use super::archive_ops::*;
use super::db_cache::*;
use super::heuristics::*;
use super::path_security::*;

pub const SANCTUARY_EDGE_MANIFEST_FILE: &str = ".sanctuary.manifest.json";
pub const SANCTUARY_EDGE_OVERRIDE_FILE: &str = ".sanctuary.override.json";

pub const MAX_ARCHIVE_ENTRY_BYTES: u64 = 1024 * 1024 * 1024; // 1 GiB per file
pub const MAX_ARCHIVE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024; // 4 GiB total archive
pub const MAX_ARCHIVE_ENTRIES: usize = 25_000;

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
                let _ = fs::remove_file(path);
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
                    if create_symlink_file(&source, &target_path)
                        .or_else(|_| std::fs::hard_link(&source, &target_path))
                        .or_else(|_| std::fs::copy(&source, &target_path).map(|_| ()))
                        .is_ok()
                    {
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


pub fn deploy_junction(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
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

pub(super) fn dir_looks_like_shared_game_folder(
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

pub(super) fn rescue_untracked_mod_file(
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
                    let _ = std::fs::remove_file(file_path);
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
                    let _ = std::fs::remove_file(file_path);
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
        let _ = std::fs::remove_file(file_path);
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
            .or_else(|_| std::fs::remove_file(path))
            .is_ok()
    } else {
        std::fs::remove_file(path)
            .or_else(|_| std::fs::remove_dir(path))
            .is_ok()
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
                let _ = std::fs::remove_file(&path);
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
                    let _ = std::fs::remove_file(&path);
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
                    let _ = std::fs::remove_file(&path);
                    return;
                }
                let rel_path = path
                    .strip_prefix(root_mods_dir)
                    .unwrap_or_else(|_| std::path::Path::new(&file_name_lower));
                let rel_str = rel_path.to_string_lossy();
                if crate::game_logic::is_cache_file(game_schema, &rel_str) {
                    let _ = std::fs::remove_file(&path);
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
                            let _ = std::fs::remove_file(&path);
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

pub fn find_backup(vault_path: &str, file_name: &str) -> Option<PathBuf> {
    if !is_safe_single_filename(file_name) {
        return None;
    }
    let base = PathBuf::from(vault_path).join("Backups");
    let p = base.join(file_name);
    if p.exists() {
        return Some(p);
    }
    for sub in &["World", "Engine", "Mods"] {
        let p2 = base.join(sub).join(file_name);
        if p2.exists() {
            return Some(p2);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    if let Some(engine_dir) = get_engine_backups_dir(&config.live_path, vault_path) {
        let p3 = engine_dir.join(file_name);
        if p3.exists() {
            return Some(p3);
        }
    }
    let docs_base = resolve_effective_docs_path(&config, &None);
    if let Some(world_dir) = get_world_backups_dir(&docs_base, vault_path) {
        let p4 = world_dir.join(file_name);
        if p4.exists() {
            return Some(p4);
        }
    }

    None
}

pub fn extract_backup_timestamp(name: &str) -> u64 {
    let clean = name
        .trim_end_matches(".tar.zst")
        .trim_end_matches(".tar")
        .trim_end_matches(".zst");
    if let Some(last) = clean.split("--").last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    if let Some(last) = clean.split('_').last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    0
}

pub fn write_snapshot_meta_file(path: &Path, content: &str) {
    if path.exists() {
        if let Ok(meta) = std::fs::metadata(path) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(path, perms);
            }
        }
        let _ = std::fs::remove_file(path);
    }
    let _ = std::fs::write(path, content);
}

pub fn clean_stray_snapshot_meta_files(dir: &Path) {
    for meta_name in [".size_bytes.txt", ".diff_size_bytes.txt", ".delta_manifest.json"] {
        let stray = dir.join(meta_name);
        if stray.is_file() {
            if let Ok(meta) = std::fs::metadata(&stray) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&stray, perms);
                }
            }
            let _ = std::fs::remove_file(&stray);
        }
    }
}

pub fn get_all_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if dir.is_file() {
        if let Some(fname) = dir.file_name().and_then(|n| n.to_str()) {
            if !fname.starts_with('.') {
                files.push(dir.to_path_buf());
            }
        }
        return files;
    }
    for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            let p = entry.path();
            if let Ok(rel) = p.strip_prefix(dir) {
                let has_dot_component = rel
                    .components()
                    .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
                if has_dot_component {
                    continue;
                }
            } else if p
                .file_name()
                .map_or(false, |n| n.to_string_lossy().starts_with('.'))
            {
                continue;
            }
            files.push(entry.into_path());
        }
    }
    files
}

pub fn remove_backup_dir_cow_safe(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    use rayon::prelude::*;
    let readonly_paths: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if meta.permissions().readonly() {
                Some(entry.into_path())
            } else {
                None
            }
        })
        .collect();

    readonly_paths.par_iter().for_each(|p| {
        if let Ok(meta) = std::fs::metadata(p) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(p, perms);
            }
        }
    });

    std::fs::remove_dir_all(dir)
}

pub fn enforce_retention_policy(target_dir: &Path, keep_count: u32) {
    if keep_count >= 999 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let mut backups: Vec<PathBuf> = Vec::new();
        let mut stale_purging: Vec<PathBuf> = Vec::new();

        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with(".purging_") && p.is_dir() {
                stale_purging.push(p);
                continue;
            }
            let is_archive = p.is_file()
                && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                    || p.extension() == Some(std::ffi::OsStr::new("tar")));
            let is_snapshot_dir =
                p.is_dir() && (name.starts_with("World_State") || name.starts_with("Engine_Core"));
            if is_archive || is_snapshot_dir {
                backups.push(p);
            }
        }

        backups.sort_by(|a, b| {
            let name_a = a.file_name().unwrap_or_default().to_string_lossy();
            let name_b = b.file_name().unwrap_or_default().to_string_lossy();
            let ts_a = extract_backup_timestamp(&name_a);
            let ts_b = extract_backup_timestamp(&name_b);
            ts_b.cmp(&ts_a).then_with(|| {
                let m_a = a
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                let m_b = b
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                m_b.cmp(&m_a)
            })
        });

        let mut dirs_to_purge_async: Vec<PathBuf> = stale_purging;

        if backups.len() > keep_count as usize {
            let now_ms = current_epoch_ms();
            for (idx, old_backup) in backups.iter().skip(keep_count as usize).enumerate() {
                if old_backup.is_dir() {
                    let old_name = old_backup
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                    let purging_path =
                        old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                    if std::fs::rename(old_backup, &purging_path).is_ok() {
                        dirs_to_purge_async.push(purging_path);
                    } else {
                        dirs_to_purge_async.push(old_backup.clone());
                    }
                } else {
                    let _ = std::fs::remove_file(old_backup);
                }
            }
        }

        if !dirs_to_purge_async.is_empty() {
            std::thread::spawn(move || {
                for dir in dirs_to_purge_async {
                    let _ = remove_backup_dir_cow_safe(&dir);
                }
            });
        }
    }
}

pub(super) fn estimate_backup_snapshot_physical_bytes(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".diff_size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    0
}

pub fn enforce_backup_capacity_limit(backup_dirs: &[PathBuf], capacity_gb: u32) {
    if capacity_gb == 0 {
        return;
    }
    let max_bytes = (capacity_gb as u64).saturating_mul(1024 * 1024 * 1024);
    let mut unique_dirs: Vec<PathBuf> = Vec::new();
    for d in backup_dirs {
        if d.exists() && !unique_dirs.contains(d) {
            unique_dirs.push(d.clone());
        }
    }
    if unique_dirs.is_empty() {
        return;
    }

    let mut snapshots: Vec<(PathBuf, u64, bool)> = Vec::new();
    let mut dirs_to_purge_async: Vec<PathBuf> = Vec::new();

    for dir in &unique_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with(".purging_") && p.is_dir() {
                    dirs_to_purge_async.push(p);
                    continue;
                }
                let is_archive = p.is_file()
                    && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                        || p.extension() == Some(std::ffi::OsStr::new("tar")));
                let is_world = name.starts_with("World_State");
                let is_engine = name.starts_with("Engine_Core");
                let is_snapshot_dir = p.is_dir() && (is_world || is_engine);
                if is_archive || is_snapshot_dir {
                    let bytes = estimate_backup_snapshot_physical_bytes(&p);
                    snapshots.push((p, bytes, is_engine));
                }
            }
        }
    }

    snapshots.sort_by(|(a, _, _), (b, _, _)| {
        let name_a = a.file_name().unwrap_or_default().to_string_lossy();
        let name_b = b.file_name().unwrap_or_default().to_string_lossy();
        let ts_a = extract_backup_timestamp(&name_a);
        let ts_b = extract_backup_timestamp(&name_b);
        ts_b.cmp(&ts_a).then_with(|| {
            let m_a = a
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            let m_b = b
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            m_b.cmp(&m_a)
        })
    });

    // Always protect the single newest snapshot in each lane (World_State and Engine_Core)
    let mut newest_world_idx: Option<usize> = None;
    let mut newest_engine_idx: Option<usize> = None;
    let mut total_bytes: u64 = 0;

    for (idx, (_, bytes, is_engine)) in snapshots.iter().enumerate() {
        total_bytes = total_bytes.saturating_add(*bytes);
        if *is_engine {
            if newest_engine_idx.is_none() {
                newest_engine_idx = Some(idx);
            }
        } else if newest_world_idx.is_none() {
            newest_world_idx = Some(idx);
        }
    }

    if total_bytes > max_bytes && snapshots.len() > 1 {
        let now_ms = current_epoch_ms();
        for (idx, (old_backup, bytes, _)) in snapshots.iter().enumerate().rev() {
            if total_bytes <= max_bytes {
                break;
            }
            if Some(idx) == newest_world_idx || Some(idx) == newest_engine_idx {
                continue;
            }
            if old_backup.is_dir() {
                let old_name = old_backup
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                let purging_path =
                    old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                if std::fs::rename(old_backup, &purging_path).is_ok() {
                    dirs_to_purge_async.push(purging_path);
                } else {
                    dirs_to_purge_async.push(old_backup.clone());
                }
            } else {
                let _ = std::fs::remove_file(old_backup);
            }
            total_bytes = total_bytes.saturating_sub(*bytes);
        }
    }

    if !dirs_to_purge_async.is_empty() {
        std::thread::spawn(move || {
            for dir in dirs_to_purge_async {
                let _ = remove_backup_dir_cow_safe(&dir);
            }
        });
    }
}

pub fn enforce_workspace_backup_capacity(config: &crate::state::WorkspaceConfig) {
    let cap_gb = config.vault_capacity_gb.unwrap_or(0);
    if cap_gb == 0 || config.vault_path.trim().is_empty() {
        return;
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    let docs_base = config
        .docs_path
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&config.mods_path);
    if let Some(wd) = get_world_backups_dir(docs_base, &config.vault_path) {
        dirs.push(wd);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("World"));

    if let Some(ed) = get_engine_backups_dir(&config.live_path, &config.vault_path) {
        dirs.push(ed);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("Engine"));

    enforce_backup_capacity_limit(&dirs, cap_gb);
}

pub fn are_paths_on_same_filesystem(p1: &Path, p2: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let existing_ancestor = |p: &Path| -> Option<PathBuf> {
            for anc in p.ancestors() {
                if !anc.as_os_str().is_empty() && anc.exists() {
                    return Some(anc.to_path_buf());
                }
            }
            None
        };
        if let (Some(a1), Some(a2)) = (existing_ancestor(p1), existing_ancestor(p2)) {
            if let (Ok(m1), Ok(m2)) = (std::fs::metadata(a1), std::fs::metadata(a2)) {
                return m1.dev() == m2.dev();
            }
        }
        false
    }
    #[cfg(not(unix))]
    {
        p1.components().next() == p2.components().next()
    }
}

#[cfg(unix)]
pub(super) fn resolve_unix_backup_dir(source_path: &Path, vault_path: &str, lane: &str) -> Option<PathBuf> {
    let vault_p = PathBuf::from(vault_path);
    if !vault_path.trim().is_empty() && are_paths_on_same_filesystem(source_path, &vault_p) {
        return Some(vault_p.join("Backups").join(lane));
    }

    let vault_name = vault_p
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();

    let src_str = source_path.to_string_lossy();
    if let Some(rest) = src_str.strip_prefix("/Volumes/") {
        if let Some(vol_name) = rest.split('/').next().filter(|s| !s.is_empty()) {
            let vol_root = PathBuf::from("/Volumes").join(vol_name);
            return Some(
                vol_root
                    .join(".sanctuary_backups")
                    .join(&vault_name)
                    .join(lane),
            );
        }
    }
    for prefix in ["/run/media/", "/media/", "/mnt/"] {
        if let Some(rest) = src_str.strip_prefix(prefix) {
            let parts: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
            let mount_root = if (prefix == "/run/media/" || prefix == "/media/") && parts.len() >= 2 {
                // e.g. /run/media/deck/SDCard or /media/user/Drive
                let candidate_two = PathBuf::from(prefix).join(parts[0]).join(parts[1]);
                if candidate_two.is_dir() {
                    Some(candidate_two)
                } else {
                    Some(PathBuf::from(prefix).join(parts[0]))
                }
            } else if !parts.is_empty() {
                // e.g. /run/media/mmcblk0p1 or /mnt/gamedrive
                Some(PathBuf::from(prefix).join(parts[0]))
            } else {
                None
            };
            if let Some(root_dir) = mount_root {
                return Some(
                    root_dir
                        .join(".sanctuary_backups")
                        .join(&vault_name)
                        .join(lane),
                );
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        return Some(home.join(".sanctuary_backups").join(vault_name).join(lane));
    }

    None
}

pub fn get_engine_backups_dir(live_path: &str, vault_path: &str) -> Option<PathBuf> {
    if live_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(live_path);

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "Engine");
    }

    #[cfg(not(unix))]
    {
        let root = p.ancestors().last()?;
        if root.as_os_str().is_empty() {
            return None;
        }

        let vault_name = PathBuf::from(vault_path)
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("default"))
            .to_string_lossy()
            .into_owned();

        Some(
            root.join(".sanctuary_backups")
                .join(vault_name)
                .join("Engine"),
        )
    }
}

pub fn get_docs_base_from_mods_path(mods_path: &str) -> String {
    if mods_path.trim().is_empty() {
        return String::new();
    }
    let mut doc_dir = PathBuf::from(mods_path);
    if doc_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .eq_ignore_ascii_case("mods")
    {
        doc_dir.pop();
    }
    doc_dir.to_string_lossy().to_string()
}

pub fn resolve_effective_docs_path(
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> String {
    if let Some(ref explicit_docs) = config.docs_path {
        if !explicit_docs.trim().is_empty() {
            return explicit_docs.trim().to_string();
        }
    }
    let resolved = crate::game_logic::resolve_user_data_root(&config.mods_path, schema);
    if !resolved.as_os_str().is_empty() {
        return resolved.to_string_lossy().to_string();
    }
    get_docs_base_from_mods_path(&config.mods_path)
}

pub fn resolve_effective_docs_path_with_override(
    explicit_docs: &str,
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> PathBuf {
    let trimmed = explicit_docs.trim();
    if !trimmed.is_empty() {
        let candidate = PathBuf::from(trimmed);
        if is_mods_dir(&candidate) {
            let resolved = crate::game_logic::resolve_user_data_root(trimmed, schema);
            if !resolved.as_os_str().is_empty() {
                return resolved;
            }
        }
        return candidate;
    }
    let fallback = resolve_effective_docs_path(config, schema);
    if fallback.trim().is_empty() {
        PathBuf::new()
    } else {
        PathBuf::from(fallback.trim())
    }
}

pub fn get_world_backups_dir(docs_path: &str, vault_path: &str) -> Option<PathBuf> {
    if docs_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(docs_path);

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "World");
    }

    #[cfg(not(unix))]
    {
        let root = p.ancestors().last()?;
        if root.as_os_str().is_empty() {
            return None;
        }

        let vault_name = PathBuf::from(vault_path)
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("default"))
            .to_string_lossy()
            .into_owned();

        Some(
            root.join(".sanctuary_backups")
                .join(vault_name)
                .join("World"),
        )
    }
}


pub fn current_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn is_skipped_vault_subdir(name_lower: &str) -> bool {
    name_lower == "sandbox"
        || name_lower == "dev"
        || name_lower == "quarantine"
        || name_lower == "__macosx"
        || name_lower.starts_with('.')
}

pub(super) fn is_plain_text_config_extension(ext_lower: &str) -> bool {
    matches!(
        ext_lower.trim_start_matches('.'),
        "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml" | "txt" | "log" | "md"
    )
}

pub(super) fn dir_contains_non_config_mod_assets(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower.starts_with('.')
                    || fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if !is_plain_text_config_extension(&ext_lower) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub fn resolve_vault_config_destination(
    vault_mods_path: &Path,
    relative_path: &Path,
    file_name: &str,
) -> PathBuf {
    if relative_path.components().count() > 1 {
        return vault_mods_path.join(relative_path);
    }

    let fname_lower = file_name.to_lowercase();

    // 1. Search 1-2 levels deep in vault_mods_path for an existing subfolder containing `file_name`
    if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
        for entry in entries.flatten() {
            let sub_path = entry.path();
            if !sub_path.is_dir() {
                continue;
            }
            let sub_name = entry.file_name().to_string_lossy().to_lowercase();
            if is_skipped_vault_subdir(&sub_name) {
                continue;
            }
            if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                for sub_entry in sub_entries.flatten() {
                    let p = sub_entry.path();
                    if p.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        return p;
                    } else if p.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            if let Ok(sub2_entries) = std::fs::read_dir(&p) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let p2 = sub2_entry.path();
                                    if p2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        return p2;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. If not yet present in any subfolder, check if a subfolder owns non-config mod files with a matching `<prefix>_`
    if let Some(underscore_idx) = fname_lower.find('_') {
        let prefix = &fname_lower[..=underscore_idx];
        if prefix.len() >= 3 {
            if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
                for entry in entries.flatten() {
                    let sub_path = entry.path();
                    if !sub_path.is_dir() {
                        continue;
                    }
                    let sub_name = entry.file_name().to_string_lossy().to_lowercase();
                    if is_skipped_vault_subdir(&sub_name) {
                        continue;
                    }
                    if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                        for sub_entry in sub_entries.flatten() {
                            let p = sub_entry.path();
                            if p.is_file() {
                                let child_lower =
                                    sub_entry.file_name().to_string_lossy().to_lowercase();
                                let child_ext = p
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_lowercase())
                                    .unwrap_or_default();
                                if child_lower.starts_with(prefix)
                                    && !child_ext.is_empty()
                                    && !is_plain_text_config_extension(&child_ext)
                                {
                                    return sub_path.join(file_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    vault_mods_path.join(relative_path)
}

pub(super) fn find_surviving_vault_file(
    vault_mods_lane: &Path,
    fname_lower: &str,
    excluded_path: &Path,
) -> Option<PathBuf> {
    if !vault_mods_lane.exists() {
        return None;
    }

    let mut fallback_match: Option<PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p == excluded_path {
                continue;
            }
            if p.is_file() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(fname_lower)
                {
                    fallback_match = Some(p);
                }
            } else if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if is_skipped_vault_subdir(&dname) {
                    continue;
                }
                if let Ok(sub_entries) = std::fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sp = sub_entry.path();
                        if sp == excluded_path {
                            continue;
                        }
                        if sp.is_file()
                            && sub_entry
                                .file_name()
                                .to_string_lossy()
                                .eq_ignore_ascii_case(fname_lower)
                        {
                            if dir_contains_non_config_mod_assets(&p) {
                                return Some(sp);
                            }
                            if fallback_match.is_none() {
                                fallback_match = Some(sp);
                            }
                        } else if sp.is_dir() {
                            let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                            if !is_skipped_vault_subdir(&sub2_name) {
                                if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                    for sub2_entry in sub2_entries.flatten() {
                                        let sp2 = sub2_entry.path();
                                        if sp2 == excluded_path {
                                            continue;
                                        }
                                        if sp2.is_file()
                                            && sub2_entry
                                                .file_name()
                                                .to_string_lossy()
                                                .eq_ignore_ascii_case(fname_lower)
                                        {
                                            if dir_contains_non_config_mod_assets(&sp)
                                                || dir_contains_non_config_mod_assets(&p)
                                            {
                                                return Some(sp2);
                                            }
                                            if fallback_match.is_none() {
                                                fallback_match = Some(sp2);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fallback_match
}

pub fn deduplicate_vault_root_configs(
    vault_mods_lane: &Path,
    config_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !vault_mods_lane.exists() {
        return;
    }

    let manifest_leaf_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    let is_config_ext = |ext_lower: &str| -> bool {
        is_plain_text_config_extension(ext_lower)
            || config_exts.iter().any(|e| e.eq_ignore_ascii_case(ext_lower))
    };

    let mut root_configs: Vec<(String, PathBuf)> = Vec::new();
    let mut subdirs: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if !is_skipped_vault_subdir(&dname) {
                    subdirs.push(p);
                }
            } else if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                    || fname_lower.starts_with('.')
                    || (!manifest_leaf_lower.is_empty() && fname_lower == manifest_leaf_lower)
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if is_config_ext(&ext.to_lowercase()) {
                        root_configs.push((fname_lower, p));
                    }
                }
            }
        }
    }

    if root_configs.is_empty() || subdirs.is_empty() {
        return;
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let mut removed_root_paths: Vec<String> = Vec::new();

    for (fname_lower, root_file) in root_configs {
        let mut preferred_match: Option<PathBuf> = None;
        let mut fallback_match: Option<PathBuf> = None;

        'search: for subdir in &subdirs {
            if let Ok(sub_entries) = std::fs::read_dir(subdir) {
                for sub_entry in sub_entries.flatten() {
                    let sp = sub_entry.path();
                    if sp.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        if dir_contains_non_config_mod_assets(subdir) {
                            preferred_match = Some(sp);
                            break 'search;
                        } else if fallback_match.is_none() {
                            fallback_match = Some(sp);
                        }
                    } else if sp.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let sp2 = sub2_entry.path();
                                    if sp2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        if dir_contains_non_config_mod_assets(&sp)
                                            || dir_contains_non_config_mod_assets(subdir)
                                        {
                                            preferred_match = Some(sp2);
                                            break 'search;
                                        } else if fallback_match.is_none() {
                                            fallback_match = Some(sp2);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(sub_file) = preferred_match.or(fallback_match) {
            let root_is_symlink = std::fs::symlink_metadata(&root_file)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
                || std::fs::read_link(&root_file).is_ok();

            if !root_is_symlink {
                let root_meta = std::fs::metadata(&root_file).ok();
                let sub_meta = std::fs::metadata(&sub_file).ok();
                if let (Some(rm), Some(sm)) = (root_meta, sub_meta) {
                    if rm.len() > 0 {
                        let should_preserve_root_data = if sm.len() == 0 {
                            true
                        } else if let (Ok(rt), Ok(st)) = (rm.modified(), sm.modified()) {
                            rt > st && rm.len() >= sm.len() / 2
                        } else {
                            false
                        };
                        if should_preserve_root_data {
                            let _ = std::fs::copy(&root_file, &sub_file);
                        }
                    }
                }
            }

            if std::fs::remove_file(&root_file).is_ok() {
                removed_root_paths.push(root_file.to_string_lossy().to_string());

                if !config.mods_path.trim().is_empty() {
                    if let Some(actual_name) = sub_file.file_name() {
                        let live_cfg = Path::new(&config.mods_path).join(actual_name);
                        if let Ok(link_target) = std::fs::read_link(&live_cfg) {
                            if link_target == root_file {
                                let _ = std::fs::remove_file(&live_cfg);
                                let _ = create_symlink_file(&sub_file, &live_cfg)
                                    .or_else(|_| std::fs::copy(&sub_file, &live_cfg).map(|_| ()));
                            }
                        }
                    }
                }
            }
        }
    }

    if !removed_root_paths.is_empty() && !config.vault_path.trim().is_empty() {
        if let Ok(db) = open_db_conn(&config.vault_path) {
            if let Ok(conn) = db.lock() {
                for p_str in &removed_root_paths {
                    let norm_win = p_str.replace('/', "\\");
                    let norm_unix = p_str.replace('\\', "/");
                    let _ = conn.execute(
                        "DELETE FROM cache WHERE path = ?1 OR path = ?2 OR path = ?3",
                        params![p_str, norm_win, norm_unix],
                    );
                }
            }
        }
    }
}

pub fn cleanup_live_counterparts_on_delete(deleted_path: &Path, deleted_file_names: &[String]) {
    let is_protected = |name_lower: &str| -> bool {
        matches!(
            name_lower,
            "desktop.ini"
                | "thumbs.db"
                | ".ds_store"
                | ".sanctuary_deployed_links.json"
                | ".sanctuary_cache.db"
                | ".sanctuary_cache.json"
                | SANCTUARY_EDGE_MANIFEST_FILE
                | SANCTUARY_EDGE_OVERRIDE_FILE
        )
    };

    let mut target_names_lower: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    if let Some(fname) = deleted_path.file_name().and_then(|n| n.to_str()) {
        let lower = fname.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }
    for name in deleted_file_names {
        let lower = name.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let vault_mods_lane = if !config.vault_path.trim().is_empty() {
        Some(get_vault_mods_lane(&config.vault_path))
    } else {
        None
    };

    let mut surviving_vault_copies: std::collections::HashMap<String, PathBuf> =
        std::collections::HashMap::new();
    if let Some(ref lane) = vault_mods_lane {
        for name_lower in &target_names_lower {
            if let Some(survivor) = find_surviving_vault_file(lane, name_lower, deleted_path) {
                surviving_vault_copies.insert(name_lower.clone(), survivor);
            }
        }
    }

    if let Some(ref lane) = vault_mods_lane {
        if let Ok(rel) = deleted_path.strip_prefix(lane) {
            if !config.mods_path.trim().is_empty() {
                let live_rel = Path::new(&config.mods_path).join(rel);
                if live_rel != deleted_path {
                    let fname_lower = live_rel
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                        if live_rel
                            .parent()
                            .map(|p| p == Path::new(&config.mods_path))
                            .unwrap_or(false)
                        {
                            let _ = std::fs::remove_file(&live_rel);
                            let _ = create_symlink_file(survivor, &live_rel)
                                .or_else(|_| std::fs::copy(survivor, &live_rel).map(|_| ()));
                        }
                    } else if let Ok(meta) = std::fs::symlink_metadata(&live_rel) {
                        if meta.file_type().is_symlink() || std::fs::read_link(&live_rel).is_ok() {
                            if live_rel.is_dir() {
                                let _ = std::fs::remove_dir(&live_rel);
                            } else {
                                let _ = std::fs::remove_file(&live_rel);
                            }
                        } else if meta.is_file() {
                            let _ = std::fs::remove_file(&live_rel);
                        }
                    }
                }
            }
        }
    }

    if !config.mods_path.trim().is_empty() {
        let mods_dir = PathBuf::from(&config.mods_path);
        if mods_dir.exists() && mods_dir != deleted_path {
            let remove_or_relink_in_dir = |dir: &Path| {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p == deleted_path {
                            continue;
                        }
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        if is_protected(&fname_lower) {
                            continue;
                        }
                        let mut matches_target = target_names_lower.contains(&fname_lower);
                        let mut points_to_deleted = false;
                        if let Ok(link_target) = std::fs::read_link(&p) {
                            if link_target == deleted_path || link_target.starts_with(deleted_path)
                            {
                                matches_target = true;
                                points_to_deleted = true;
                            }
                        }
                        if matches_target {
                            if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                                if points_to_deleted || dir == mods_dir {
                                    let _ = std::fs::remove_file(&p);
                                    let _ = create_symlink_file(survivor, &p)
                                        .or_else(|_| std::fs::copy(survivor, &p).map(|_| ()));
                                }
                                continue;
                            }

                            let is_link = std::fs::read_link(&p).is_ok()
                                || std::fs::symlink_metadata(&p)
                                    .map(|m| m.file_type().is_symlink())
                                    .unwrap_or(false);
                            if is_link {
                                if p.is_dir() {
                                    let _ = std::fs::remove_dir(&p);
                                } else {
                                    let _ = std::fs::remove_file(&p);
                                }
                            } else if p.is_file() {
                                let _ = std::fs::remove_file(&p);
                            }
                        }
                    }
                }
            };

            remove_or_relink_in_dir(&mods_dir);
            if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let dname = entry.file_name().to_string_lossy().to_lowercase();
                        if !dname.starts_with('.') {
                            remove_or_relink_in_dir(&p);
                        }
                    }
                }
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ArchivedModVersion {
    pub rel_path: String,
    pub dna_hash: String,
    #[serde(default)]
    pub backup_rel_path: String,
    #[serde(default)]
    pub mod_version: String,
    #[serde(default)]
    pub compatible_versions: Vec<String>,
    #[serde(default)]
    pub recorded_at: u64,
}

pub fn get_vault_backups_mods_dir(vault_path: &str) -> PathBuf {
    let p = Path::new(vault_path);
    let vault_root = if is_mods_dir(p) {
        p.parent().unwrap_or(p).to_path_buf()
    } else {
        p.to_path_buf()
    };
    vault_root.join("Backups").join("Mods")
}

pub fn load_mod_versions_index(
    vault_path: &str,
) -> std::collections::HashMap<String, Vec<ArchivedModVersion>> {
    let index_path = get_vault_backups_mods_dir(vault_path).join(".mod_versions.json");
    if let Ok(raw) = std::fs::read_to_string(&index_path) {
        if let Ok(parsed) =
            serde_json::from_str::<std::collections::HashMap<String, Vec<ArchivedModVersion>>>(&raw)
        {
            return parsed;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_mod_versions_index(
    vault_path: &str,
    index: &std::collections::HashMap<String, Vec<ArchivedModVersion>>,
) {
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let _ = std::fs::create_dir_all(&backups_mods);
    let index_path = backups_mods.join(".mod_versions.json");
    if let Ok(json_str) = serde_json::to_string_pretty(index) {
        let _ = atomic_write_bytes(&index_path, json_str.as_bytes());
    }
}

pub(super) fn compare_version_strs(v1: &str, v2: &str) -> std::cmp::Ordering {
    fn clean_parts(raw: &str) -> Vec<u64> {
        raw.trim()
            .trim_start_matches(|c: char| c == '>' || c == '<' || c == '=' || c == '!')
            .trim()
            .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
            .trim_end_matches('+')
            .trim()
            .split('.')
            .map(|seg| seg.parse::<u64>().unwrap_or(0))
            .collect()
    }
    let p1 = clean_parts(v1);
    let p2 = clean_parts(v2);
    let max_len = p1.len().max(p2.len());
    for i in 0..max_len {
        let a = *p1.get(i).unwrap_or(&0);
        let b = *p2.get(i).unwrap_or(&0);
        match a.cmp(&b) {
            std::cmp::Ordering::Equal => continue,
            ord => return ord,
        }
    }
    std::cmp::Ordering::Equal
}

pub(super) fn clean_single_ver_token(raw: &str) -> String {
    raw.trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim()
        .to_lowercase()
}

pub(super) fn matches_single_version_rule(raw_rule: &str, clean_target: &str) -> bool {
    let rule = clean_single_ver_token(raw_rule);
    if rule.is_empty() {
        return false;
    }
    if matches!(
        rule.as_str(),
        "any" | "all" | "unknown" | "vlocal" | "local" | "global"
    ) {
        return true;
    }
    if rule.contains("..") || rule.contains('-') {
        let parts: Vec<String> = if rule.contains("..") {
            rule.split("..")
                .map(clean_single_ver_token)
                .filter(|s| !s.is_empty())
                .collect()
        } else {
            rule.split('-')
                .map(clean_single_ver_token)
                .filter(|s| !s.is_empty())
                .collect()
        };
        if parts.len() == 2
            && parts[0].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
            && parts[1].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
        {
            let (low, high) =
                if compare_version_strs(&parts[0], &parts[1]) != std::cmp::Ordering::Greater {
                    (&parts[0], &parts[1])
                } else {
                    (&parts[1], &parts[0])
                };
            let ge_low = compare_version_strs(clean_target, low) != std::cmp::Ordering::Less;
            let le_high = compare_version_strs(clean_target, high) != std::cmp::Ordering::Greater
                || clean_target.starts_with(&format!("{}.", high));
            return ge_low && le_high;
        }
    }
    if rule.ends_with('+') || rule.starts_with(">=") {
        let min_ver =
            clean_single_ver_token(rule.trim_start_matches(">=").trim_end_matches('+'));
        if min_ver.is_empty() {
            return false;
        }
        return compare_version_strs(clean_target, &min_ver) != std::cmp::Ordering::Less;
    }
    if rule.starts_with("<=") {
        let max_ver = clean_single_ver_token(rule.trim_start_matches("<="));
        if max_ver.is_empty() {
            return false;
        }
        return compare_version_strs(clean_target, &max_ver) != std::cmp::Ordering::Greater
            || clean_target.starts_with(&format!("{}.", max_ver));
    }
    clean_target == rule
        || clean_target.starts_with(&format!("{}.", rule))
        || rule.starts_with(&format!("{}.", clean_target))
}

pub fn is_game_version_compatible(compatible_versions: &[String], target_game_version: &str) -> bool {
    let clean_target = clean_single_ver_token(target_game_version);
    if clean_target.is_empty() || matches!(clean_target.as_str(), "unknown" | "all" | "any") {
        return true;
    }
    if compatible_versions.is_empty() {
        return false;
    }
    let mut exclusions: Vec<String> = Vec::new();
    let mut positives: Vec<String> = Vec::new();
    for entry in compatible_versions {
        for raw_token in entry.split(',') {
            let trimmed = raw_token.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix('!') {
                let ex = rest.trim();
                if !ex.is_empty() {
                    exclusions.push(ex.to_string());
                }
            } else {
                positives.push(trimmed.to_string());
            }
        }
    }
    if exclusions
        .iter()
        .any(|ex| matches_single_version_rule(ex, &clean_target))
    {
        return false;
    }
    if positives.is_empty() {
        return !exclusions.is_empty();
    }
    positives
        .iter()
        .any(|pos| matches_single_version_rule(pos, &clean_target))
}

pub fn is_mod_version_archiving_enabled(vault_path: &str) -> bool {
    if vault_path.trim().is_empty() {
        return true;
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "archive_mod_versions") {
        return !val.trim().eq_ignore_ascii_case("false") && val.trim() != "0";
    }
    true
}

pub fn load_pinned_mod_versions(vault_path: &str) -> std::collections::HashMap<String, String> {
    if vault_path.trim().is_empty() {
        return std::collections::HashMap::new();
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "pinned_mod_versions") {
        if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&val) {
            return map;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_pinned_mod_versions(
    vault_path: &str,
    pins: &std::collections::HashMap<String, String>,
) {
    if vault_path.trim().is_empty() {
        return;
    }
    if let Ok(raw) = serde_json::to_string(pins) {
        set_vault_kv(vault_path, "pinned_mod_versions", &raw);
    }
}

pub fn archive_mod_binary_version(
    vault_path: &str,
    active_file_path: &Path,
    known_hash: Option<&str>,
    mod_version: Option<&str>,
    compatible_versions: Option<Vec<String>>,
) -> Option<ArchivedModVersion> {
    let keep_history = is_mod_version_archiving_enabled(vault_path);
    if !active_file_path.exists() || !active_file_path.is_file() {
        return None;
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let rel = active_file_path
        .strip_prefix(&mods_lane)
        .unwrap_or(active_file_path);
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    if rel_str.is_empty() || rel_str.starts_with('.') {
        return None;
    }

    let hash = match known_hash.filter(|h| !h.trim().is_empty()) {
        Some(h) => h.trim().to_lowercase(),
        None => calculate_hash(active_file_path).ok()?.to_lowercase(),
    };
    if hash.is_empty() {
        return None;
    }

    let short_hash: String = hash.chars().take(12).collect();
    let orig_file_name = active_file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let backup_rel_path = if let Some(parent) = rel.parent() {
        let p_str = parent.to_string_lossy().replace('\\', "/");
        if p_str.is_empty() {
            format!("{}/{}", short_hash, orig_file_name)
        } else {
            format!("{}/{}/{}", p_str, short_hash, orig_file_name)
        }
    } else {
        format!("{}/{}", short_hash, orig_file_name)
    };

    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let backup_full_path = backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(b_parent) = backup_full_path.parent() {
        let _ = std::fs::create_dir_all(b_parent);
    }

    if !backup_full_path.exists() {
        let linked = std::fs::hard_link(active_file_path, &backup_full_path)
            .or_else(|_| std::fs::copy(active_file_path, &backup_full_path).map(|_| ()));
        if linked.is_err() {
            return None;
        }
    }

    let mut index = load_mod_versions_index(vault_path);
    let key = rel_str.to_lowercase();
    let entries = index.entry(key).or_default();
    let now_secs = current_epoch_ms() / 1000;

    let entry = if let Some(existing) = entries.iter_mut().find(|e| e.dna_hash.eq_ignore_ascii_case(&hash)) {
        if existing.backup_rel_path != backup_rel_path && existing.backup_rel_path.contains("__") {
            let old_b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if old_b_full.exists() {
                let _ = std::fs::remove_file(&old_b_full);
            }
        }
        existing.rel_path = rel_str.clone();
        existing.backup_rel_path = backup_rel_path.clone();
        if let Some(mv) = mod_version.filter(|s| !s.trim().is_empty()) {
            existing.mod_version = mv.trim().to_string();
        }
        if let Some(cv) = compatible_versions {
            for v in cv {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                }
            }
        }
        existing.clone()
    } else {
        let created = ArchivedModVersion {
            rel_path: rel_str,
            dna_hash: hash.clone(),
            backup_rel_path,
            mod_version: mod_version.unwrap_or_default().trim().to_string(),
            compatible_versions: compatible_versions
                .unwrap_or_default()
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            recorded_at: now_secs,
        };
        entries.push(created.clone());
        created
    };

    if !keep_history {
        // When Version History is disabled ("Keep One" mode), prune any previous versions of this file on update
        entries.retain(|e| {
            let is_current = e.dna_hash.eq_ignore_ascii_case(&hash);
            if !is_current && !e.backup_rel_path.is_empty() {
                let old_full = backups_mods
                    .join(e.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                if old_full.exists() {
                    let _ = std::fs::remove_file(&old_full);
                    if let Some(p) = old_full.parent() {
                        let _ = std::fs::remove_dir(p);
                    }
                }
            }
            is_current
        });
    }

    save_mod_versions_index(vault_path, &index);
    Some(entry)
}

pub fn sync_vault_mod_versions_for_game(
    vault_path: &str,
    target_game_version: &str,
    metadata_updates: &[ArchivedModVersion],
) -> Vec<ArchivedModVersion> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let archiving_enabled = is_mod_version_archiving_enabled(vault_path);
    let mut index = load_mod_versions_index(vault_path);
    let mut index_dirty = false;

    for meta in metadata_updates {
        let rel_norm = meta.rel_path.replace('\\', "/");
        if rel_norm.is_empty() || meta.dna_hash.trim().is_empty() {
            continue;
        }
        let key = rel_norm.to_lowercase();
        let hash_lower = meta.dna_hash.trim().to_lowercase();
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));

        let entries = index.entry(key).or_default();
        if let Some(existing) = entries
            .iter_mut()
            .find(|e| e.dna_hash.eq_ignore_ascii_case(&hash_lower))
        {
            if !meta.mod_version.trim().is_empty() && existing.mod_version != meta.mod_version.trim() {
                existing.mod_version = meta.mod_version.trim().to_string();
                index_dirty = true;
            }
            for v in &meta.compatible_versions {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                    index_dirty = true;
                }
            }
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = Path::new(&rel_norm)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let canonical_backup_rel = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            if existing.backup_rel_path.is_empty() {
                existing.backup_rel_path = canonical_backup_rel.clone();
                index_dirty = true;
            } else if existing.backup_rel_path != canonical_backup_rel
                && existing.backup_rel_path.contains("__")
            {
                let old_b_full = backups_mods.join(
                    existing
                        .backup_rel_path
                        .replace('/', std::path::MAIN_SEPARATOR_STR),
                );
                let new_b_full = backups_mods
                    .join(canonical_backup_rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                if let Some(np) = new_b_full.parent() {
                    let _ = std::fs::create_dir_all(np);
                }
                if old_b_full.exists() {
                    if !new_b_full.exists() {
                        let _ = std::fs::rename(&old_b_full, &new_b_full);
                    } else {
                        let _ = std::fs::remove_file(&old_b_full);
                    }
                }
                existing.backup_rel_path = canonical_backup_rel;
                index_dirty = true;
            }
            let b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() && active_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
        } else if archiving_enabled && active_full.exists() {
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = active_full
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let backup_rel_path = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            let b_full =
                backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
            if b_full.exists() {
                entries.push(ArchivedModVersion {
                    rel_path: rel_norm,
                    dna_hash: hash_lower,
                    backup_rel_path,
                    mod_version: meta.mod_version.trim().to_string(),
                    compatible_versions: meta
                        .compatible_versions
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    recorded_at: current_epoch_ms() / 1000,
                });
                index_dirty = true;
            }
        }
    }

    let mut cache = load_cache(vault_path);
    let mut cache_dirty = false;

    // Consolidate duplicate binary filenames across subfolders in <Vault>/Mods so two versions of the same file never coexist in <Vault>/Mods
    let mut keys_by_filename: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for k in index.keys() {
        let f_name = Path::new(k)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let ext = Path::new(&f_name)
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if !f_name.is_empty() && !ext.is_empty() && !is_plain_text_config_extension(&ext) {
            keys_by_filename.entry(f_name).or_default().push(k.clone());
        }
    }

    for (_f_name, mut key_list) in keys_by_filename {
        if key_list.len() <= 1 {
            continue;
        }
        // Prefer the path that currently exists on disk, has metadata (compatible_versions), or is the shorter/cleaner path
        key_list.sort_by(|a, b| {
            let a_full = mods_lane.join(a.replace('/', std::path::MAIN_SEPARATOR_STR));
            let b_full = mods_lane.join(b.replace('/', std::path::MAIN_SEPARATOR_STR));
            let a_exists = a_full.exists();
            let b_exists = b_full.exists();
            let a_has_meta = index
                .get(a)
                .map(|v| v.iter().any(|e| !e.compatible_versions.is_empty()))
                .unwrap_or(false);
            let b_has_meta = index
                .get(b)
                .map(|v| v.iter().any(|e| !e.compatible_versions.is_empty()))
                .unwrap_or(false);
            b_exists
                .cmp(&a_exists)
                .then_with(|| b_has_meta.cmp(&a_has_meta))
                .then_with(|| a.len().cmp(&b.len()))
        });

        let primary_key = key_list[0].clone();
        let primary_rel = index
            .get(&primary_key)
            .and_then(|v| v.first())
            .map(|e| e.rel_path.clone())
            .unwrap_or_else(|| primary_key.clone());

        for dup_key in key_list.into_iter().skip(1) {
            if let Some(dup_entries) = index.remove(&dup_key) {
                if let Some(first_dup) = dup_entries.first() {
                    let dup_full = mods_lane
                        .join(first_dup.rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if dup_full.exists() {
                        let _ = std::fs::remove_file(&dup_full);
                        let dup_full_str = dup_full.to_string_lossy().to_string();
                        if cache.remove(&dup_full_str).is_some() {
                            cache_dirty = true;
                        }
                        let mut cur_dir = dup_full.parent().map(|p| p.to_path_buf());
                        while let Some(d) = cur_dir {
                            if d == mods_lane || !d.starts_with(&mods_lane) {
                                break;
                            }
                            if std::fs::remove_dir(&d).is_err() {
                                break;
                            }
                            cur_dir = d.parent().map(|p| p.to_path_buf());
                        }
                    }
                }
                let primary_vec = index.entry(primary_key.clone()).or_default();
                for mut de in dup_entries {
                    de.rel_path = primary_rel.clone();
                    if let Some(existing) = primary_vec
                        .iter_mut()
                        .find(|pe| pe.dna_hash.eq_ignore_ascii_case(&de.dna_hash))
                    {
                        if existing.mod_version.is_empty() && !de.mod_version.is_empty() {
                            existing.mod_version = de.mod_version;
                        }
                        for cv in de.compatible_versions {
                            if !existing
                                .compatible_versions
                                .iter()
                                .any(|c| c.eq_ignore_ascii_case(&cv))
                            {
                                existing.compatible_versions.push(cv);
                            }
                        }
                        if de.recorded_at > existing.recorded_at {
                            existing.recorded_at = de.recorded_at;
                        }
                    } else {
                        primary_vec.push(de);
                    }
                }
                index_dirty = true;
            }
        }
    }

    let clean_target = target_game_version
        .trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim();
    if clean_target.is_empty() || clean_target.eq_ignore_ascii_case("unknown") {
        if index_dirty {
            save_mod_versions_index(vault_path, &index);
        }
        if cache_dirty {
            save_cache(vault_path, &cache);
        }
        return Vec::new();
    }

    let mut swapped = Vec::new();
    let pinned_map = load_pinned_mod_versions(vault_path);

    for entries in index.values() {
        if entries.is_empty() {
            continue;
        }
        let rel_norm = &entries[0].rel_path;
        let f_name_lower = Path::new(rel_norm)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if !f_name_lower.is_empty() && pinned_map.contains_key(&f_name_lower) {
            // Respect manual power-user version pin until reset to Auto-Swap
            continue;
        }
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));
        let active_full_str = active_full.to_string_lossy().to_string();

        let current_hash = if let Some(c) = cache.get(&active_full_str) {
            if !c.dna_hash.is_empty() && active_full.exists() {
                c.dna_hash.to_lowercase()
            } else if active_full.exists() {
                calculate_hash(&active_full).unwrap_or_default().to_lowercase()
            } else {
                String::new()
            }
        } else if active_full.exists() {
            calculate_hash(&active_full).unwrap_or_default().to_lowercase()
        } else {
            String::new()
        };

        let current_entry = entries
            .iter()
            .find(|e| !current_hash.is_empty() && e.dna_hash.eq_ignore_ascii_case(&current_hash));

        if let Some(cur) = current_entry {
            if cur.compatible_versions.is_empty()
                || is_game_version_compatible(&cur.compatible_versions, clean_target)
            {
                continue;
            }
        } else if active_full.exists() {
            // Current file is not in version index or has no known version constraint
            continue;
        }

        // Look for an archived version that matches clean_target and exists in Backups/Mods
        let mut best_match: Option<&ArchivedModVersion> = None;
        for candidate in entries {
            if candidate.backup_rel_path.is_empty() {
                continue;
            }
            if !is_game_version_compatible(&candidate.compatible_versions, clean_target) {
                continue;
            }
            let b_full = backups_mods
                .join(candidate.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                continue;
            }
            match best_match {
                None => best_match = Some(candidate),
                Some(prev) => {
                    if candidate.recorded_at >= prev.recorded_at {
                        best_match = Some(candidate);
                    }
                }
            }
        }

        if let Some(winner) = best_match {
            if !current_hash.is_empty() && winner.dna_hash.eq_ignore_ascii_case(&current_hash) {
                continue;
            }
            let b_full =
                backups_mods.join(winner.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(ap) = active_full.parent() {
                let _ = std::fs::create_dir_all(ap);
            }
            if active_full.exists() {
                let _ = std::fs::remove_file(&active_full);
            }
            let linked = std::fs::hard_link(&b_full, &active_full)
                .or_else(|_| create_symlink_file(&b_full, &active_full))
                .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()));
            if linked.is_ok() {
                let mtime = std::fs::metadata(&active_full)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if let Some(c) = cache.get_mut(&active_full_str) {
                    c.dna_hash = winner.dna_hash.clone();
                    c.mtime = mtime;
                    cache_dirty = true;
                } else {
                    cache.insert(
                        active_full_str,
                        crate::state::CacheEntry {
                            mtime,
                            dna_hash: winner.dna_hash.clone(),
                            explicitly_local: false,
                            quarantined: false,
                            heuristic_malware_sig: None,
                            heuristic_sigs_mtime: 0,
                        },
                    );
                    cache_dirty = true;
                }
                swapped.push(winner.clone());
            }
        }
    }

    if index_dirty {
        save_mod_versions_index(vault_path, &index);
    }
    if cache_dirty {
        save_cache(vault_path, &cache);
    }

    swapped
}




