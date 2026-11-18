#![allow(unused_imports)]
use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use super::archive_ops::*;
use super::backup_retention::*;
use super::db_cache::*;
use super::fs_ops::*;
use super::heuristics::*;

pub fn get_config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let unified_dir = base.join("sanctuary-os");
    let unified_path = unified_dir.join("sanctuary_config.json");
    let legacy_dir = base.join("SanctuaryOS");
    let legacy_path = legacy_dir.join("sanctuary_config.json");

    if !unified_path.exists() && legacy_path.exists() {
        let _ = fs::create_dir_all(&unified_dir);
        if fs::copy(&legacy_path, &unified_path).is_ok() {
            let _ = fs::remove_file(&legacy_path);
        }
    }
    unified_path
}

pub fn is_macos_or_os_metadata_path(path: &Path) -> bool {
    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
        let lower = fname.to_lowercase();
        if lower == ".ds_store"
            || lower == "desktop.ini"
            || lower == "thumbs.db"
            || lower.starts_with("._")
        {
            return true;
        }
    }
    for comp in path.components() {
        if let std::path::Component::Normal(os_str) = comp {
            let s = os_str.to_string_lossy();
            if s.eq_ignore_ascii_case("__MACOSX") || s.eq_ignore_ascii_case(".DS_Store") {
                return true;
            }
        }
    }
    false
}

pub fn collect_companion_sibling_paths(
    primary_path: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Some(s) = game_schema else {
        return out;
    };
    let Some(twin_groups) = &s.extensions.twin_extensions else {
        return out;
    };
    let Some(parent) = primary_path.parent() else {
        return out;
    };
    let Some(stem) = primary_path.file_stem().and_then(|st| st.to_str()) else {
        return out;
    };
    let primary_ext = primary_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();
    for group in twin_groups {
        let cleaned_group: Vec<String> = group
            .iter()
            .map(|e| e.trim_start_matches('.').to_lowercase())
            .filter(|e| !e.is_empty())
            .collect();
        if !cleaned_group.is_empty() && !cleaned_group.iter().any(|e| e == &primary_ext) {
            continue;
        }
        for ext in cleaned_group {
            if ext == primary_ext {
                continue;
            }
            let candidate = parent.join(format!("{}.{}", stem, ext));
            if candidate.is_file() && !out.contains(&candidate) {
                out.push(candidate);
            }
        }
    }
    out
}

pub fn walk_packages(
    game_schema: &Option<crate::schema::GameSchema>,
    dir: &Path,
    files: &mut Vec<PathBuf>,
) {
    let exts = crate::game_logic::get_supported_extensions(game_schema);
    if exts.is_empty() {
        return;
    }
    let twin_exts: Vec<String> = game_schema
        .as_ref()
        .and_then(|s| s.extensions.twin_extensions.as_ref())
        .map(|groups| {
            groups
                .iter()
                .flat_map(|g| g.iter())
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .filter(|e| !e.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    if let Ok(entries) = fs::read_dir(dir) {
        let dir_entries: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        for p in dir_entries {
            if is_macos_or_os_metadata_path(&p) {
                continue;
            }
            if p.is_dir() {
                if let Some(name) = p.file_name() {
                    let name_str = name.to_string_lossy().to_lowercase();
                    if name_str == "sandbox"
                        || name_str == "dev"
                        || name_str == "quarantine"
                        || name_str == "__macosx"
                        || name_str.starts_with('.')
                    {
                        continue;
                    }
                }
                walk_packages(game_schema, &p, files);
            } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                let fname_lower = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_lowercase();
                if fname_lower.starts_with('.')
                    || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
                {
                    continue;
                }
                // Collapse secondary twin companion files (.utoc/.ucas) under their primary sibling (.pak)
                if twin_exts.contains(&ext_lower) {
                    if let (Some(parent), Some(stem)) =
                        (p.parent(), p.file_stem().and_then(|st| st.to_str()))
                    {
                        let has_primary_sibling = exts.iter().any(|primary_ext| {
                            !twin_exts.contains(primary_ext)
                                && parent.join(format!("{}.{}", stem, primary_ext)).is_file()
                        });
                        if has_primary_sibling {
                            continue;
                        }
                    }
                }
                if !exts.contains(&ext_lower) {
                    continue;
                }
                files.push(p);
            }
        }
    }
}

/// Returns true if `path` is inside `.sanctuary_lab_airgap`, `.lab_save_vault`, or any schema-configured
/// live save directory, preventing accidental deletion via general file removal or shred commands.
pub fn is_protected_save_or_airgap_path(
    path: &Path,
    saved_coords: &crate::state::WorkspaceConfig,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    let cleaned = strip_windows_verbatim_prefix(path);
    for comp in cleaned.components() {
        let seg = comp.as_os_str().to_string_lossy().to_lowercase();
        if seg == ".sanctuary_lab_airgap"
            || seg == ".sanctuary_lab_sandbox"
            || seg == ".lab_save_airgap"
            || seg == ".lab_save_sandbox"
            || seg == ".lab_save_vault"
            || seg == ".airgap_journal.json"
            || seg == ".airgap_active.json"
            || seg == ".sandbox_state.json"
        {
            return true;
        }
    }

    let docs_str = resolve_effective_docs_path(saved_coords, game_schema);
    if !docs_str.trim().is_empty() {
        let docs_dir = PathBuf::from(&docs_str);
        let mut save_rels: Vec<String> = Vec::new();
        if let Some(s) = game_schema {
            if let Some(tc) = &s.time_capsule {
                if let Some(targets) = &tc.save_airgap_targets {
                    for t in targets {
                        let trimmed = t.trim();
                        if trimmed.is_empty() || trimmed == "." {
                            save_rels.push(".".to_string());
                        } else {
                            save_rels.push(trimmed.to_string());
                        }
                    }
                }
                for wt in &tc.world_state_targets {
                    let wt_trimmed = wt.path.trim();
                    if !wt_trimmed.is_empty()
                        && (wt_trimmed.to_lowercase().contains("save")
                            || wt.name.to_lowercase().contains("save"))
                    {
                        save_rels.push(wt_trimmed.to_string());
                    }
                }
            }
        }
        let cand_norm = normalize_path_key(&cleaned);
        for rel in save_rels {
            let resolved_save_dir = resolve_case_insensitive_path(&docs_dir, &rel);
            let save_norm = normalize_path_key(&resolved_save_dir);
            if !save_norm.is_empty()
                && !cand_norm.is_empty()
                && (cand_norm == save_norm || cand_norm.starts_with(&format!("{}/", save_norm)))
            {
                return true;
            }
        }
    }
    false
}

pub fn is_safe_single_filename(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.contains("..")
        && !trimmed.contains('/')
        && !trimmed.contains('\\')
        && !trimmed.contains('\0')
}

/// Strips Windows extended-length verbatim prefixes (`\\?\UNC\...`, `\\?\...`, `\\.\...`)
/// consistently so path comparisons and system-folder checks can never be bypassed via `\\?\C:\Windows`.
pub fn strip_windows_verbatim_prefix(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    let trimmed = raw.trim();
    let upper = trimmed.to_ascii_uppercase();
    if upper.starts_with("\\\\?\\UNC\\") || upper.starts_with("//?/UNC/") {
        return PathBuf::from(format!("\\\\{}", &trimmed[8..]));
    }
    if upper.starts_with("\\\\?\\")
        || upper.starts_with("\\\\.\\")
        || upper.starts_with("//?/")
        || upper.starts_with("//./")
    {
        return PathBuf::from(&trimmed[4..]);
    }
    PathBuf::from(trimmed)
}

/// Resolves `target` (or its nearest existing ancestor when `target` does not yet exist)
/// via `std::fs::canonicalize`, rejecting `..`, NUL bytes, and stripping Windows verbatim prefixes.
pub fn resolve_canonical_target(target: &Path) -> Result<PathBuf, String> {
    let raw = target.to_string_lossy();
    if raw.trim().is_empty() || raw.contains('\0') {
        return Err("Path is empty or contains NUL bytes.".to_string());
    }
    let cleaned = strip_windows_verbatim_prefix(target);
    if cleaned
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Path traversal ('..') is forbidden.".to_string());
    }

    if cleaned.exists() {
        let canon = fs::canonicalize(&cleaned)
            .map_err(|e| format!("Failed to canonicalize path {:?}: {}", cleaned, e))?;
        return Ok(strip_windows_verbatim_prefix(&canon));
    }

    // Walk up to the nearest existing ancestor so new files inside symlinks/junctions still resolve canonically.
    let mut suffix_segments: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor: &Path = &cleaned;
    loop {
        if cursor.exists() {
            let canon_anc = fs::canonicalize(cursor)
                .map_err(|e| format!("Failed to canonicalize ancestor {:?}: {}", cursor, e))?;
            let mut resolved = strip_windows_verbatim_prefix(&canon_anc);
            for seg in suffix_segments.into_iter().rev() {
                resolved.push(seg);
            }
            return Ok(resolved);
        }
        let Some(name) = cursor.file_name() else {
            // Reached filesystem root without finding an existing ancestor
            return Err(format!("No existing ancestor directory for {:?}.", cleaned));
        };
        let name_str = name.to_string_lossy();
        if name_str == "." || name_str == ".." || name_str.is_empty() {
            return Err("Invalid path segment.".to_string());
        }
        suffix_segments.push(name.to_os_string());
        match cursor.parent() {
            Some(p) if !p.as_os_str().is_empty() => cursor = p,
            _ => return Err(format!("Relative or unrooted path {:?} is forbidden.", cleaned)),
        }
    }
}

pub fn path_is_within_root(child: &Path, root: &Path) -> bool {
    let mut child_comps = child.components();
    let mut root_count = 0usize;
    for r_comp in root.components() {
        root_count += 1;
        let Some(c_comp) = child_comps.next() else {
            return false;
        };
        if cfg!(target_os = "windows") {
            let r_s = r_comp.as_os_str().to_string_lossy();
            let c_s = c_comp.as_os_str().to_string_lossy();
            if !r_s.eq_ignore_ascii_case(&c_s) {
                return false;
            }
        } else if r_comp != c_comp {
            return false;
        }
    }
    root_count > 0
}

pub(super) fn paths_equal_platform(a: &Path, b: &Path) -> bool {
    path_is_within_root(a, b) && path_is_within_root(b, a)
}

pub fn is_blocked_sensitive_or_system_path(resolved: &Path) -> bool {
    let stripped = strip_windows_verbatim_prefix(resolved);
    let win_norm = stripped
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    if win_norm.is_empty() || win_norm.ends_with(':') {
        return true;
    }

    // Block sensitive credential/key/autostart directories anywhere in the path
    let unix_norm = stripped
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase();
    if let Some(file_name) = stripped.file_name().and_then(|n| n.to_str()) {
        let lower_name = file_name.to_ascii_lowercase();
        if matches!(
            lower_name.as_str(),
            ".bashrc"
                | ".bash_profile"
                | ".zshrc"
                | ".zprofile"
                | ".profile"
                | ".env"
                | ".env.local"
                | ".env.production"
                | ".npmrc"
                | ".pypirc"
                | ".netrc"
                | ".git-credentials"
                | ".passkey_master_key.bin"
                | "local_passkey_vault_v2.json"
        ) {
            return true;
        }
    }

    for seg in [
        "/.ssh",
        "/.gnupg",
        "/.aws",
        "/.kube",
        "/.azure",
        "/.config/gcloud",
        "/.config/autostart",
        "/.config/systemd",
        "/documents/powershell",
        "/documents/windowspowershell",
        "/library/launchagents",
        "/library/launchdaemons",
        "/library/keychains",
        "/microsoft/windows/start menu/programs/startup",
    ] {
        if unix_norm.ends_with(seg) || unix_norm.contains(&format!("{}/", seg)) {
            return true;
        }
    }

    // Block Sanctuary's own executable install directory and internal app config/key directories
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if let Ok(canon_exe_dir) = resolve_canonical_target(exe_dir) {
                if path_is_within_root(&stripped, &canon_exe_dir) {
                    return true;
                }
            }
        }
    }
    for app_dir in [
        dirs::config_dir().map(|d| d.join("sanctuary-os")),
        dirs::config_dir().map(|d| d.join("SanctuaryOS")),
        dirs::data_local_dir().map(|d| d.join("sanctuary-os")),
        dirs::data_local_dir().map(|d| d.join("SanctuaryOS")),
        dirs::data_local_dir().map(|d| d.join("Programs").join("sanctuary-os")),
        dirs::data_local_dir().map(|d| d.join("Programs").join("SanctuaryOS")),
    ]
    .into_iter()
    .flatten()
    {
        let app_clean = strip_windows_verbatim_prefix(&app_dir);
        if path_is_within_root(&stripped, &app_clean) {
            return true;
        }
    }

    // Block OS & system prefixes across Windows, macOS, and Linux
    let mut blocked_win_prefixes: Vec<String> = vec![
        "c:\\windows".to_string(),
        "c:\\program files\\windows".to_string(),
        "c:\\program files\\windowsapps".to_string(),
        "c:\\program files\\common files".to_string(),
        "c:\\program files (x86)\\common files".to_string(),
        "c:\\programdata\\microsoft".to_string(),
        "c:\\system volume information".to_string(),
    ];
    if let Ok(sys_root) = std::env::var("SystemRoot") {
        let sr = sys_root.replace('/', "\\").trim_end_matches('\\').to_lowercase();
        if !sr.is_empty() {
            blocked_win_prefixes.push(sr);
        }
    }
    for prefix in &blocked_win_prefixes {
        if &win_norm == prefix || win_norm.starts_with(&format!("{}\\", prefix)) {
            return true;
        }
    }
    if win_norm == "c:\\program files" || win_norm == "c:\\program files (x86)" {
        return true;
    }

    let blocked_unix_prefixes = [
        "/bin", "/sbin", "/usr", "/etc", "/system", "/lib", "/lib64", "/proc", "/sys", "/dev",
        "/boot", "/root",
    ];
    for prefix in &blocked_unix_prefixes {
        if unix_norm == *prefix || unix_norm.starts_with(&format!("{}/", prefix)) {
            return true;
        }
    }

    false
}

/// Strictly verifies that `target` resolves canonically inside at least one of `allowed_roots`,
/// strips Windows `\\?\` prefixes consistently, rejects symlinks/junctions escaping `allowed_roots`,
/// and blocks OS system dirs, `~/.ssh`, `~/.gnupg`, `~/.aws`, Startup folders, and Sanctuary executable dirs.
pub fn ensure_path_within_roots(
    target: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    if allowed_roots.is_empty() {
        return Err("No allowed roots configured for path containment check.".to_string());
    }
    let cleaned_target = strip_windows_verbatim_prefix(target);
    let resolved = resolve_canonical_target(&cleaned_target)?;
    if is_blocked_sensitive_or_system_path(&resolved) {
        return Err("Refusing operation on protected system or sensitive directory.".to_string());
    }

    let mut canonical_roots: Vec<PathBuf> = Vec::new();
    for root in allowed_roots {
        if root.as_os_str().is_empty() {
            continue;
        }
        if let Ok(canon_r) = resolve_canonical_target(root) {
            if !is_blocked_sensitive_or_system_path(&canon_r) {
                canonical_roots.push(canon_r);
            }
        }
    }
    if canonical_roots.is_empty() {
        return Err("Allowed root directories could not be resolved safely.".to_string());
    }

    // Also verify the lexical parent and any symlink target so dangling symlinks cannot point outside allowed_roots
    if let Ok(meta) = fs::symlink_metadata(&cleaned_target) {
        if meta.file_type().is_symlink() {
            if let Ok(raw_link) = fs::read_link(&cleaned_target) {
                let joined_link = if raw_link.is_absolute() {
                    raw_link
                } else {
                    cleaned_target
                        .parent()
                        .unwrap_or_else(|| Path::new("."))
                        .join(raw_link)
                };
                if let Ok(canon_link) = resolve_canonical_target(&joined_link) {
                    if is_blocked_sensitive_or_system_path(&canon_link)
                        || !canonical_roots
                            .iter()
                            .any(|r| path_is_within_root(&canon_link, r))
                    {
                        return Err(
                            "Blocked symlink/junction escaping allowed root boundaries."
                                .to_string(),
                        );
                    }
                } else {
                    return Err("Blocked unresolvable symlink target.".to_string());
                }
            }
        }
    }

    if canonical_roots
        .iter()
        .any(|r| path_is_within_root(&resolved, r))
    {
        Ok(resolved)
    } else {
        Err(format!(
            "Path {:?} escapes allowed workspace boundaries.",
            cleaned_target
        ))
    }
}

/// Like `ensure_path_within_roots`, and additionally forbids operating on the root directory itself.
pub fn ensure_strict_descendant_of_roots(
    target: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    let resolved = ensure_path_within_roots(target, allowed_roots)?;
    for root in allowed_roots {
        if root.as_os_str().is_empty() {
            continue;
        }
        if let Ok(canon_r) = resolve_canonical_target(root) {
            if paths_equal_platform(&resolved, &canon_r) {
                return Err("Refusing destructive operation on workspace root directory itself.".to_string());
            }
        }
    }
    Ok(resolved)
}

pub fn get_allowed_workspace_roots(config: &WorkspaceConfig) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for s in [
        Some(config.vault_path.as_str()),
        Some(config.mods_path.as_str()),
        Some(config.live_path.as_str()),
        config.docs_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        let trimmed = s.trim();
        if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case("web") {
            let p = PathBuf::from(trimmed);
            roots.push(p.clone());
            if is_mods_dir(&p) {
                if let Some(parent) = p.parent() {
                    if !parent.as_os_str().is_empty() {
                        roots.push(parent.to_path_buf());
                    }
                }
            }
        }
    }
    roots
}

/// Extends `get_allowed_workspace_roots` with shared Master Vault data/quarantine/templates
/// lanes (`<MasterVault>/Data`, `<MasterVault>/Quarantine`, `<MasterVault>/Templates`, `<MasterVault>/Backups`,
/// and `<MasterVault>/Screenshots`) so Workbench/Themes/Lexicons/Quarantine stay readable without
/// opening the rest of the filesystem.
pub fn get_allowed_config_roots(config: &WorkspaceConfig) -> Vec<PathBuf> {
    let mut roots = get_allowed_workspace_roots(config);
    let global = crate::commands::state_ops::get_global_config();
    let master_candidates = [
        config.master_vault_path.as_deref(),
        global.vault_path.as_deref(),
    ];
    for mv_opt in master_candidates.into_iter().flatten() {
        let trimmed = mv_opt.trim();
        if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case("web") {
            let mv = PathBuf::from(trimmed);
            for sub in ["Data", "Quarantine", "Templates", "Backups", "Screenshots"] {
                roots.push(mv.join(sub));
            }
        }
    }
    roots
}

/// Returns true only when `raw` is a clean single path segment with no separators or traversal.
pub fn is_safe_single_node_component(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return false;
    }
    let norm = trimmed.replace('\\', "/");
    if norm.contains('/') {
        return false;
    }
    let mut comps = Path::new(&norm).components();
    matches!(comps.next(), Some(std::path::Component::Normal(_))) && comps.next().is_none()
}

/// Returns true only when `raw` is a clean relative file/folder reference inside the workspace (`Normal` segments only).
pub(super) fn is_safe_relative_node_subpath(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return false;
    }
    let norm = trimmed.replace('\\', "/");
    let p = Path::new(&norm);
    if p.is_absolute() {
        return false;
    }
    let mut saw_normal = false;
    for comp in p.components() {
        match comp {
            std::path::Component::Normal(_) => saw_normal = true,
            _ => return false,
        }
    }
    saw_normal
}

pub fn is_safe_user_file_path(path: &std::path::Path) -> bool {
    let Ok(resolved) = resolve_canonical_target(path) else {
        return false;
    };
    if is_blocked_sensitive_or_system_path(&resolved) {
        return false;
    }

    // Never allow deleting or overwriting top-level user directories or active workspace root directories themselves
    let mut protected_exact_dirs: Vec<PathBuf> = vec![
        PathBuf::from("C:\\Users"),
        PathBuf::from("/Users"),
        PathBuf::from("/home"),
        PathBuf::from("/var/home"),
        PathBuf::from("/Volumes"),
        PathBuf::from("/run/media"),
        PathBuf::from("/media"),
        PathBuf::from("/mnt"),
        PathBuf::from("/Applications"),
    ];
    for dir_opt in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::config_dir(),
        dirs::data_dir(),
        dirs::data_local_dir(),
    ]
    .into_iter()
    .flatten()
    {
        if let Ok(canon) = resolve_canonical_target(&dir_opt) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&dir_opt));
        }
    }

    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    for root_opt in [
        Some(saved_coords.vault_path.as_str()),
        Some(saved_coords.mods_path.as_str()),
        Some(saved_coords.live_path.as_str()),
        saved_coords.docs_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        let trimmed = root_opt.trim();
        if !trimmed.is_empty() {
            let rp = PathBuf::from(trimmed);
            if let Ok(canon) = resolve_canonical_target(&rp) {
                protected_exact_dirs.push(canon);
            } else {
                protected_exact_dirs.push(strip_windows_verbatim_prefix(&rp));
            }
        }
    }

    if protected_exact_dirs
        .iter()
        .any(|p| paths_equal_platform(&resolved, p))
    {
        return false;
    }

    true
}

/// Validates that `path` is a safe game/user-data workspace target directory (such as a configured
/// `docs_path` or `live_path` root) rather than an OS system path, drive root, top-level profile directory,
/// or the Sanctuary Vault root itself.
pub fn is_safe_workspace_target_dir(path: &std::path::Path) -> bool {
    if path.as_os_str().is_empty() || !path.is_absolute() {
        return false;
    }
    let Ok(resolved) = resolve_canonical_target(path) else {
        return false;
    };
    if is_blocked_sensitive_or_system_path(&resolved) {
        return false;
    }

    let mut protected_exact_dirs: Vec<PathBuf> = vec![
        PathBuf::from("C:\\Users"),
        PathBuf::from("/Users"),
        PathBuf::from("/home"),
        PathBuf::from("/var/home"),
        PathBuf::from("/Volumes"),
        PathBuf::from("/run/media"),
        PathBuf::from("/media"),
        PathBuf::from("/mnt"),
        PathBuf::from("/Applications"),
    ];
    for dir_opt in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::config_dir(),
        dirs::data_dir(),
        dirs::data_local_dir(),
    ]
    .into_iter()
    .flatten()
    {
        if let Ok(canon) = resolve_canonical_target(&dir_opt) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&dir_opt));
        }
    }

    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    let vault_trimmed = saved_coords.vault_path.trim();
    if !vault_trimmed.is_empty() {
        let vp = PathBuf::from(vault_trimmed);
        if let Ok(canon) = resolve_canonical_target(&vp) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&vp));
        }
    }

    if protected_exact_dirs
        .iter()
        .any(|p| paths_equal_platform(&resolved, p))
    {
        return false;
    }

    true
}

pub fn obscure_username(path: &str) -> String {
    let lower = path.to_lowercase();
    for (marker, slash_char) in [
        ("\\users\\", '\\'),
        ("/users/", '/'),
        ("/var/home/", '/'),
        ("/home/", '/'),
        ("\\documents and settings\\", '\\'),
        ("/documents and settings/", '/'),
    ] {
        if let Some(idx) = lower.find(marker) {
            let after_marker = idx + marker.len();
            if let Some(next_slash) = path[after_marker..].find(slash_char) {
                let mut obscured = String::new();
                obscured.push_str(&path[..after_marker]);
                obscured.push_str("...");
                obscured.push_str(&path[after_marker + next_slash..]);
                return obscured;
            }
        }
    }
    for marker in ["/run/media/", "/media/"] {
        if let Some(idx) = lower.find(marker) {
            let after_marker = idx + marker.len();
            if let Some(next_slash) = path[after_marker..].find('/') {
                let seg = &lower[after_marker..after_marker + next_slash];
                if !seg.starts_with("mmcblk") && !seg.starts_with("nvme") && !seg.starts_with("sd") {
                    let mut obscured = String::new();
                    obscured.push_str(&path[..after_marker]);
                    obscured.push_str("...");
                    obscured.push_str(&path[after_marker + next_slash..]);
                    return obscured;
                }
            }
        }
    }
    scrub_user_data_from_log(path)
}


pub const SANCTUARY_REDACTED_TOKEN: &str = "[REDACTED BY SANCTUARY]";
pub const SANCTUARY_REDACTED_HEX_SESSION: &str = "000000000000000000000000";

pub(super) struct LogScrubberRegexes {
    guid_re: regex::Regex,
    hex_xml_re: regex::Regex,
    pii_xml_re: regex::Regex,
    user_path_re: regex::Regex,
    media_mount_re: regex::Regex,
    sid_re: regex::Regex,
    mac_re: regex::Regex,
    email_re: regex::Regex,
    ipv4_re: regex::Regex,
}

pub(super) static LOG_SCRUBBER_REGEXES: std::sync::OnceLock<LogScrubberRegexes> =
    std::sync::OnceLock::new();

pub(super) fn get_log_scrubber_regexes() -> &'static LogScrubberRegexes {
    LOG_SCRUBBER_REGEXES.get_or_init(|| LogScrubberRegexes {
        guid_re: regex::Regex::new(
            r"(?i)\b(guid[ \t]*[:=][ \t]*)(\{?[0-9a-f-]{8,}\}?)",
        )
        .unwrap(),
        hex_xml_re: regex::Regex::new(
            r"(?i)<(sessionid|desyncid)>[^<\r\n]+</(sessionid|desyncid)>",
        )
        .unwrap(),
        pii_xml_re: regex::Regex::new(
            r"(?i)<(guid|userid|machineid|computername|accountid|username|hostname|ip|ipaddress|macaddress)>[^<\r\n]+</(guid|userid|machineid|computername|accountid|username|hostname|ip|ipaddress|macaddress)>",
        )
        .unwrap(),
        user_path_re: regex::Regex::new(
            r#"(?i)(\\\\users\\\\|\\users\\|/users/|/var/home/|/home/|drive_c/users/|\\documents and settings\\|/documents and settings/|onedrive - )([^\\/"'<>\r\n&|]+)"#,
        )
        .unwrap(),
        media_mount_re: regex::Regex::new(
            r#"(?i)(/run/media/|/media/)([^\\/"'<>\r\n&|]+)"#,
        )
        .unwrap(),
        sid_re: regex::Regex::new(r"\bS-1-5-21-[0-9-]{4,}\b").unwrap(),
        mac_re: regex::Regex::new(
            r"\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b|\b(?:[0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}\b",
        )
        .unwrap(),
        email_re: regex::Regex::new(
            r"([A-Za-z0-9][A-Za-z0-9._%+-]*)@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.([A-Za-z]{2,24}))\b",
        )
        .unwrap(),
        ipv4_re: regex::Regex::new(
            r"\b([1-9][0-9]{0,2})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?::([0-9]{1,5}))?\b",
        )
        .unwrap(),
    })
}

pub fn scrub_user_data_from_log(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }

    let rx = get_log_scrubber_regexes();

    // 1. Redact GUID: <UUID/Hex>
    let s1 = rx.guid_re.replace_all(input, |caps: &regex::Captures| {
        format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
    });

    // 2a. Redact sessionid / desyncid with 24 hex zeroes
    let s2 = rx.hex_xml_re.replace_all(&s1, |caps: &regex::Captures| {
        if caps[1].eq_ignore_ascii_case(&caps[2]) {
            format!(
                "<{}>{}</{}>",
                &caps[1], SANCTUARY_REDACTED_HEX_SESSION, &caps[2]
            )
        } else {
            caps[0].to_string()
        }
    });

    // 2b. Redact machine/user/network XML tags
    let s3 = rx.pii_xml_re.replace_all(&s2, |caps: &regex::Captures| {
        if caps[1].eq_ignore_ascii_case(&caps[2]) {
            format!("<{}>{}</{}>", &caps[1], SANCTUARY_REDACTED_TOKEN, &caps[2])
        } else {
            caps[0].to_string()
        }
    });

    // 3. Redact OS user home path segments
    let s4 = rx.user_path_re.replace_all(&s3, |caps: &regex::Captures| {
        let seg = &caps[2];
        if seg.eq_ignore_ascii_case(SANCTUARY_REDACTED_TOKEN) {
            caps[0].to_string()
        } else {
            format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
        }
    });

    let s5 = rx
        .media_mount_re
        .replace_all(&s4, |caps: &regex::Captures| {
            let seg = &caps[2];
            let seg_lower = seg.to_ascii_lowercase();
            if seg.eq_ignore_ascii_case(SANCTUARY_REDACTED_TOKEN)
                || seg_lower.starts_with("mmcblk")
                || seg_lower.starts_with("nvme")
                || seg_lower.starts_with("sd")
            {
                caps[0].to_string()
            } else {
                format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
            }
        });

    let mut text = s5.into_owned();

    // 4. Redact literal OS USERNAME / USER / LOGNAME & COMPUTERNAME / HOSTNAME
    for env_key in ["USERNAME", "USER", "LOGNAME"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 2 {
                for (pat, repl) in [
                    (
                        format!("\\\\{}\\\\", trimmed),
                        format!("\\\\{}\\\\", SANCTUARY_REDACTED_TOKEN),
                    ),
                    (
                        format!("\\{}\\", trimmed),
                        format!("\\{}\\", SANCTUARY_REDACTED_TOKEN),
                    ),
                    (
                        format!("/{}/", trimmed),
                        format!("/{}/", SANCTUARY_REDACTED_TOKEN),
                    ),
                ] {
                    if text.contains(&pat) {
                        text = text.replace(&pat, &repl);
                    }
                }
            }
        }
    }

    for host_key in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(val) = std::env::var(host_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 3 && text.contains(trimmed) {
                text = text.replace(trimmed, SANCTUARY_REDACTED_TOKEN);
            }
        }
    }

    // 5. Redact Windows SIDs and MAC addresses
    let s6 = rx.sid_re.replace_all(&text, SANCTUARY_REDACTED_TOKEN);
    let s7 = rx.mac_re.replace_all(&s6, SANCTUARY_REDACTED_TOKEN);

    // 6. Redact email addresses (filtering out @filename.ext code/asset tokens)
    let s8 = if s7.contains('@') {
        let s7_ref = s7.as_ref();
        rx.email_re
            .replace_all(s7_ref, |caps: &regex::Captures| {
                let m = caps.get(0).unwrap();
                if m.start() > 0 {
                    let prev_b = s7_ref.as_bytes()[m.start() - 1];
                    if matches!(prev_b, b'/' | b'\\' | b'@') {
                        return caps[0].to_string();
                    }
                }
                let tld_lower = caps[3].to_ascii_lowercase();
                let is_code_or_asset_ext = matches!(
                    tld_lower.as_str(),
                    "py" | "pyc"
                        | "dll"
                        | "exe"
                        | "so"
                        | "dylib"
                        | "json"
                        | "xml"
                        | "cfg"
                        | "ini"
                        | "toml"
                        | "yaml"
                        | "yml"
                        | "txt"
                        | "log"
                        | "png"
                        | "jpg"
                        | "jpeg"
                        | "webp"
                        | "dds"
                        | "js"
                        | "ts"
                        | "tsx"
                        | "css"
                        | "html"
                        | "wasm"
                );
                if is_code_or_asset_ext {
                    caps[0].to_string()
                } else {
                    SANCTUARY_REDACTED_TOKEN.to_string()
                }
            })
            .into_owned()
    } else {
        s7.into_owned()
    };

    // 7. Redact bare IPv4 addresses while preserving 4-part version strings
    let s9 = rx.ipv4_re.replace_all(&s8, |caps: &regex::Captures| {
        let m = caps.get(0).unwrap();
        let bytes = s8.as_bytes();
        if m.start() > 0 && matches!(bytes[m.start() - 1], b'.' | b'-' | b'_') {
            return caps[0].to_string();
        }
        if m.end() < bytes.len() && bytes[m.end()] == b'.' {
            return caps[0].to_string();
        }
        for idx in 1..=4 {
            let oct_s = &caps[idx];
            if oct_s.len() > 1 && oct_s.starts_with('0') {
                return caps[0].to_string();
            }
            if oct_s.parse::<u16>().unwrap_or(999) > 255 {
                return caps[0].to_string();
            }
        }
        if let Some(port_m) = caps.get(5) {
            let p_val = port_m.as_str().parse::<u32>().unwrap_or(0);
            if !(1..=65535).contains(&p_val) {
                return caps[0].to_string();
            }
        }
        let line_prefix_start = s8[..m.start()]
            .rfind('\n')
            .map(|p| p + 1)
            .unwrap_or(0)
            .max(m.start().saturating_sub(40));
        let prefix_lower = s8[line_prefix_start..m.start()].to_ascii_lowercase();
        let trimmed_prefix = prefix_lower.trim_end_matches(|c: char| {
            c.is_ascii_whitespace() || matches!(c, ':' | '=' | '"' | '\'')
        });
        let is_version_context = prefix_lower.contains("<version>")
            || trimmed_prefix.ends_with("version")
            || trimmed_prefix.ends_with("ver")
            || trimmed_prefix.ends_with("build")
            || trimmed_prefix.ends_with("patch")
            || trimmed_prefix.ends_with("release")
            || trimmed_prefix.ends_with("client")
            || trimmed_prefix.ends_with("game")
            || trimmed_prefix.ends_with("mod")
            || trimmed_prefix.ends_with('v');
        if is_version_context {
            caps[0].to_string()
        } else {
            SANCTUARY_REDACTED_TOKEN.to_string()
        }
    });

    s9.into_owned()
}


pub fn resolve_case_insensitive_path(base: &Path, rel: &str) -> PathBuf {
    let mut current = base.to_path_buf();
    let norm = rel.replace('\\', "/");
    for seg in norm.split('/').map(|s| s.trim()).filter(|s| !s.is_empty() && *s != ".") {
        let exact = current.join(seg);
        if exact.exists() || !current.is_dir() {
            current = exact;
            continue;
        }
        let mut matched: Option<PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().eq_ignore_ascii_case(seg) {
                    matched = Some(entry.path());
                    break;
                }
            }
        }
        current = matched.unwrap_or(exact);
    }
    current
}

/// Normalizes an absolute or relative path by matching existing parent segments case-insensitively on Linux/Unix.
pub fn normalize_existing_case_path(full_path: &Path) -> PathBuf {
    if full_path.exists() || cfg!(target_os = "windows") {
        return full_path.to_path_buf();
    }
    let mut components = full_path.components();
    let mut current = match components.next() {
        Some(first) => PathBuf::from(first.as_os_str()),
        None => return full_path.to_path_buf(),
    };
    for comp in components {
        let seg = comp.as_os_str().to_string_lossy();
        let exact = current.join(comp.as_os_str());
        if exact.exists() || !current.is_dir() {
            current = exact;
            continue;
        }
        let mut matched: Option<PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().eq_ignore_ascii_case(&seg) {
                    matched = Some(entry.path());
                    break;
                }
            }
        }
        current = matched.unwrap_or(exact);
    }
    current
}
