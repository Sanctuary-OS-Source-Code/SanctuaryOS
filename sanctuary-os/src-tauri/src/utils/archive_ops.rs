#![allow(unused_imports)]
use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use super::db_cache::*;
use super::fs_ops::*;
use super::heuristics::*;
use super::path_security::*;

pub fn calculate_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}


#[derive(Clone, Debug)]
pub struct ExtractedZipEntry {
    pub staged_path: PathBuf,
    pub rel_path: PathBuf,
    #[allow(dead_code)]
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Default)]
pub struct BoundedZipExtraction {
    pub files: Vec<ExtractedZipEntry>,
    pub sanctuary_manifest_json: Option<String>,
    pub sanctuary_override_json: Option<String>,
    pub total_bytes: u64,
}

/// Pure-Rust bounded `.zip` extraction into `staging_dir` using `Read::take` (defeating Zip-Bombs
/// regardless of spoofed header size), rejecting `..`, absolute roots, drive prefixes, and Unix symlink modes,
/// preserving full directory trees & auxiliary assets (`preserve_auxiliary_assets` defaults to `true`),
/// stripping redundant wrapper/anchor folders, and reading `.sanctuary.manifest.json` / `.sanctuary.override.json`
/// without touching native game `manifest.json` files.
pub fn extract_zip_bounded_to_dir(
    zip_path: &Path,
    staging_dir: &Path,
    zip_stem_hint: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<BoundedZipExtraction, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open archive {:?}: {}", zip_path, e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid or unsupported ZIP container: {}", e))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "Archive exceeds maximum safe entry count ({} > {}).",
            archive.len(),
            MAX_ARCHIVE_ENTRIES
        ));
    }

    fs::create_dir_all(staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;

    let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(game_schema);
    let visible_exts = crate::game_logic::get_vault_visible_extensions(game_schema);

    // First pass: validate all entry headers/modes/paths and detect if all files share a single wrapper folder matching zip_stem_hint
    let mut validated_rel_paths: Vec<(usize, PathBuf)> = Vec::new();
    for i in 0..archive.len() {
        let zf = archive
            .by_index_raw(i)
            .map_err(|e| format!("Corrupt archive header at index {}: {}", i, e))?;

        if let Some(mode) = zf.unix_mode() {
            if (mode & 0o170000) == 0o120000 {
                let _ = fs::remove_dir_all(staging_dir);
                return Err("Archive rejected: contains unsafe symlink entry.".to_string());
            }
        }

        let raw_name = zf.name();
        if raw_name.contains('\0')
            || raw_name.starts_with('/')
            || raw_name.starts_with('\\')
            || raw_name.contains(':')
        {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!(
                "Archive rejected: unsafe absolute or rooted entry {:?}.",
                raw_name
            ));
        }

        let norm_name = raw_name.replace('\\', "/");
        let rel_candidate = Path::new(&norm_name);
        if rel_candidate.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!(
                "Archive rejected: path traversal detected in entry {:?}.",
                raw_name
            ));
        }

        if zf.is_dir() || norm_name.ends_with('/') {
            continue;
        }

        let Some(enclosed) = zf.enclosed_name() else {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!("Archive rejected: invalid enclosed path {:?}.", raw_name));
        };
        if is_macos_or_os_metadata_path(&enclosed) {
            continue;
        }

        validated_rel_paths.push((i, enclosed));
    }

    let strip_single_wrapper: Option<String> = zip_stem_hint
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|stem| {
            if validated_rel_paths.is_empty() {
                return None;
            }
            let mut common_first: Option<String> = None;
            for (_, rel) in &validated_rel_paths {
                let mut comps = rel.components();
                let first = comps.next()?.as_os_str().to_string_lossy().to_string();
                // Must have at least one child component beneath the wrapper
                comps.next()?;
                if !first.eq_ignore_ascii_case(stem) {
                    return None;
                }
                match &common_first {
                    None => common_first = Some(first),
                    Some(prev) if !prev.eq_ignore_ascii_case(&first) => return None,
                    _ => {}
                }
            }
            common_first
        });

    let mut result = BoundedZipExtraction::default();
    let mut copy_buf = vec![0u8; 64 * 1024];

    for (entry_idx, raw_rel) in validated_rel_paths {
        let mut zf = archive
            .by_index(entry_idx)
            .map_err(|e| format!("Failed reading archive entry {}: {}", entry_idx, e))?;

        let unwrapped = if let Some(ref wrapper) = strip_single_wrapper {
            let mut comps = raw_rel.components();
            if let Some(first) = comps.next() {
                if first.as_os_str().to_string_lossy().eq_ignore_ascii_case(wrapper) {
                    comps.as_path().to_path_buf()
                } else {
                    raw_rel
                }
            } else {
                raw_rel
            }
        } else {
            raw_rel
        };

        let rel_clean = crate::game_logic::strip_relative_root_anchors(&unwrapped, game_schema);
        if rel_clean.as_os_str().is_empty()
            || rel_clean
                .components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
        {
            continue;
        }

        let fname_lower = rel_clean
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();

        // Intercept namespaced Sanctuary Static Edge sidecars without writing them over mod assets
        if fname_lower == SANCTUARY_EDGE_MANIFEST_FILE || fname_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        {
            let mut sidecar_bytes = Vec::new();
            let mut limited = (&mut zf).take((2 * 1024 * 1024) + 1);
            limited
                .read_to_end(&mut sidecar_bytes)
                .map_err(|e| format!("Failed reading sidecar {}: {}", fname_lower, e))?;
            if sidecar_bytes.len() > 2 * 1024 * 1024 {
                let _ = fs::remove_dir_all(staging_dir);
                return Err("Sanctuary sidecar JSON exceeds 2 MiB limit.".to_string());
            }
            if let Ok(text) = String::from_utf8(sidecar_bytes) {
                if fname_lower == SANCTUARY_EDGE_MANIFEST_FILE {
                    result.sanctuary_manifest_json = Some(text);
                } else {
                    result.sanctuary_override_json = Some(text);
                }
            }
            continue;
        }

        if fname_lower.starts_with('.') || fname_lower == "desktop.ini" || fname_lower == "thumbs.db"
        {
            continue;
        }

        if !preserve_aux && !visible_exts.is_empty() {
            let ext_lower = rel_clean
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            if !visible_exts.contains(&ext_lower) {
                continue;
            }
        }

        let dest_path = staging_dir.join(&rel_clean);
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed creating staged subdir {:?}: {}", parent, e))?;
        }

        let mut out_file = fs::File::create(&dest_path)
            .map_err(|e| format!("Failed creating staged file {:?}: {}", dest_path, e))?;

        let mut entry_written: u64 = 0;
        let mut bounded_reader = (&mut zf).take(max_entry_bytes.saturating_add(1));
        loop {
            let n = bounded_reader
                .read(&mut copy_buf)
                .map_err(|e| format!("Archive decompression read error: {}", e))?;
            if n == 0 {
                break;
            }
            entry_written = entry_written.saturating_add(n as u64);
            result.total_bytes = result.total_bytes.saturating_add(n as u64);
            if entry_written > max_entry_bytes || result.total_bytes > max_total_bytes {
                drop(out_file);
                let _ = fs::remove_dir_all(staging_dir);
                return Err(
                    "Archive exceeds maximum safe decompressed byte limit (Zip-Bomb protection)."
                        .to_string(),
                );
            }
            use std::io::Write;
            out_file
                .write_all(&copy_buf[..n])
                .map_err(|e| format!("Failed writing staged file {:?}: {}", dest_path, e))?;
        }

        result.files.push(ExtractedZipEntry {
            staged_path: dest_path,
            rel_path: rel_clean,
            size_bytes: entry_written,
        });
    }

    Ok(result)
}

