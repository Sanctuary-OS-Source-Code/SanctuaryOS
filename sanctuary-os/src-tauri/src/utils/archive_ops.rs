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

enum PreparedStageTarget {
    Sidecar { is_manifest: bool },
    Skip,
    WriteFile { rel_clean: PathBuf, dest_path: PathBuf },
}

pub(crate) fn validate_archive_entry_path(raw_name: &str) -> Result<PathBuf, String> {
    if raw_name.contains('\0')
        || raw_name.starts_with('/')
        || raw_name.starts_with('\\')
        || raw_name.contains(':')
    {
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
        return Err(format!(
            "Archive rejected: path traversal detected in entry {:?}.",
            raw_name
        ));
    }

    let mut clean = PathBuf::new();
    for comp in rel_candidate.components() {
        if let std::path::Component::Normal(seg) = comp {
            clean.push(seg);
        }
    }
    Ok(clean)
}

fn detect_single_stem_wrapper(zip_stem_hint: Option<&str>, paths: &[PathBuf]) -> Option<String> {
    let stem = zip_stem_hint.map(|s| s.trim()).filter(|s| !s.is_empty())?;
    if paths.is_empty() {
        return None;
    }
    let mut common_first: Option<String> = None;
    for rel in paths {
        let mut comps = rel.components();
        let first = comps.next()?.as_os_str().to_string_lossy().to_string();
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
}

fn prepare_staged_entry_target(
    raw_rel: PathBuf,
    staging_dir: &Path,
    strip_wrapper: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    preserve_aux: bool,
    visible_exts: &[String],
) -> PreparedStageTarget {
    let unwrapped = if let Some(wrapper) = strip_wrapper {
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
        return PreparedStageTarget::Skip;
    }

    let fname_lower = rel_clean
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if fname_lower == SANCTUARY_EDGE_MANIFEST_FILE || fname_lower == SANCTUARY_EDGE_OVERRIDE_FILE {
        return PreparedStageTarget::Sidecar {
            is_manifest: fname_lower == SANCTUARY_EDGE_MANIFEST_FILE,
        };
    }

    if fname_lower.starts_with('.') || fname_lower == "desktop.ini" || fname_lower == "thumbs.db" {
        return PreparedStageTarget::Skip;
    }

    let rel_lower_fwd = rel_clean.to_string_lossy().replace('\\', "/").to_lowercase();
    let is_fomod_meta = rel_lower_fwd.starts_with("fomod/");
    if !preserve_aux && !is_fomod_meta && !visible_exts.is_empty() {
        let ext_lower = rel_clean
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !visible_exts.contains(&ext_lower) {
            return PreparedStageTarget::Skip;
        }
    }

    let dest_path = staging_dir.join(&rel_clean);
    PreparedStageTarget::WriteFile {
        rel_clean,
        dest_path,
    }
}

fn read_sidecar_limited(reader: &mut dyn Read) -> Result<Option<String>, String> {
    let mut sidecar_bytes = Vec::new();
    let mut limited = reader.take((2 * 1024 * 1024) + 1);
    limited
        .read_to_end(&mut sidecar_bytes)
        .map_err(|e| format!("Failed reading archive sidecar: {}", e))?;
    if sidecar_bytes.len() > 2 * 1024 * 1024 {
        return Err("Sanctuary sidecar JSON exceeds 2 MiB limit.".to_string());
    }
    Ok(String::from_utf8(sidecar_bytes).ok())
}

fn stream_entry_to_staged_file(
    reader: &mut dyn Read,
    dest_path: &Path,
    staging_dir: &Path,
    copy_buf: &mut [u8],
    max_entry_bytes: u64,
    max_total_bytes: u64,
    total_bytes: &mut u64,
) -> Result<u64, String> {
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating staged subdir {:?}: {}", parent, e))?;
    }
    let mut out_file = fs::File::create(dest_path)
        .map_err(|e| format!("Failed creating staged file {:?}: {}", dest_path, e))?;

    let mut entry_written: u64 = 0;
    let mut bounded_reader = reader.take(max_entry_bytes.saturating_add(1));
    loop {
        let n = bounded_reader
            .read(copy_buf)
            .map_err(|e| format!("Archive decompression read error: {}", e))?;
        if n == 0 {
            break;
        }
        entry_written = entry_written.saturating_add(n as u64);
        *total_bytes = total_bytes.saturating_add(n as u64);
        if entry_written > max_entry_bytes || *total_bytes > max_total_bytes {
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
    Ok(entry_written)
}

/// Pure-Rust bounded `.zip` / `.jar` extraction into `staging_dir` using `Read::take`,
/// preserving directory trees & FOMOD manifests while blocking traversal and symlinks.
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
        if let Err(err) = validate_archive_entry_path(raw_name) {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(err);
        }

        let norm_name = raw_name.replace('\\', "/");
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

    let only_paths: Vec<PathBuf> = validated_rel_paths.iter().map(|(_, p)| p.clone()).collect();
    let strip_single_wrapper = detect_single_stem_wrapper(zip_stem_hint, &only_paths);

    let mut result = BoundedZipExtraction::default();
    let mut copy_buf = vec![0u8; 64 * 1024];

    for (entry_idx, raw_rel) in validated_rel_paths {
        let mut zf = archive
            .by_index(entry_idx)
            .map_err(|e| format!("Failed reading archive entry {}: {}", entry_idx, e))?;

        match prepare_staged_entry_target(
            raw_rel,
            staging_dir,
            strip_single_wrapper.as_deref(),
            game_schema,
            preserve_aux,
            &visible_exts,
        ) {
            PreparedStageTarget::Skip => continue,
            PreparedStageTarget::Sidecar { is_manifest } => {
                match read_sidecar_limited(&mut zf) {
                    Ok(Some(text)) => {
                        if is_manifest {
                            result.sanctuary_manifest_json = Some(text);
                        } else {
                            result.sanctuary_override_json = Some(text);
                        }
                    }
                    Ok(None) => {}
                    Err(err) => {
                        let _ = fs::remove_dir_all(staging_dir);
                        return Err(err);
                    }
                }
            }
            PreparedStageTarget::WriteFile {
                rel_clean,
                dest_path,
            } => {
                let entry_written = stream_entry_to_staged_file(
                    &mut zf,
                    &dest_path,
                    staging_dir,
                    &mut copy_buf,
                    max_entry_bytes,
                    max_total_bytes,
                    &mut result.total_bytes,
                )?;
                result.files.push(ExtractedZipEntry {
                    staged_path: dest_path,
                    rel_path: rel_clean,
                    size_bytes: entry_written,
                });
            }
        }
    }

    crate::utils::strip_macos_quarantine_in_tree(staging_dir);
    Ok(result)
}

/// Pure-Rust bounded `.7z` extraction into `staging_dir` via `sevenz_rust2`.
pub fn extract_7z_bounded_to_dir(
    archive_path: &Path,
    staging_dir: &Path,
    stem_hint: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<BoundedZipExtraction, String> {
    let mut reader =
        sevenz_rust2::ArchiveReader::open(archive_path, sevenz_rust2::Password::empty())
            .map_err(|e| format!("Invalid or unsupported 7z container: {}", e))?;

    if reader.archive().files.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "Archive exceeds maximum safe entry count ({} > {}).",
            reader.archive().files.len(),
            MAX_ARCHIVE_ENTRIES
        ));
    }

    fs::create_dir_all(staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;

    let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(game_schema);
    let visible_exts = crate::game_logic::get_vault_visible_extensions(game_schema);

    let mut valid_paths: Vec<PathBuf> = Vec::new();
    let mut accepted_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in &reader.archive().files {
        if entry.has_windows_attributes && (entry.windows_attributes & 0x400) != 0 {
            let _ = fs::remove_dir_all(staging_dir);
            return Err("Archive rejected: contains unsafe symlink/reparse entry.".to_string());
        }
        let rel = match validate_archive_entry_path(&entry.name) {
            Ok(p) => p,
            Err(err) => {
                let _ = fs::remove_dir_all(staging_dir);
                return Err(err);
            }
        };
        if entry.is_directory
            || entry.is_anti_item
            || !entry.has_stream
            || entry.name.ends_with('/')
            || entry.name.ends_with('\\')
            || rel.as_os_str().is_empty()
            || is_macos_or_os_metadata_path(&rel)
        {
            continue;
        }
        accepted_names.insert(entry.name.clone());
        valid_paths.push(rel);
    }

    let strip_single_wrapper = detect_single_stem_wrapper(stem_hint, &valid_paths);
    let mut result = BoundedZipExtraction::default();
    let mut copy_buf = vec![0u8; 64 * 1024];
    let mut fatal_err: Option<String> = None;

    let dec_res = reader.for_each_entries_with_decision_allowing_surplus(|entry, r| {
        if !accepted_names.contains(&entry.name) || entry.is_directory || entry.is_anti_item {
            return Ok(sevenz_rust2::EntryDecision::Continue);
        }
        let Ok(rel) = validate_archive_entry_path(&entry.name) else {
            return Ok(sevenz_rust2::EntryDecision::Continue);
        };
        match prepare_staged_entry_target(
            rel,
            staging_dir,
            strip_single_wrapper.as_deref(),
            game_schema,
            preserve_aux,
            &visible_exts,
        ) {
            PreparedStageTarget::Skip => Ok(sevenz_rust2::EntryDecision::Continue),
            PreparedStageTarget::Sidecar { is_manifest } => match read_sidecar_limited(r) {
                Ok(Some(text)) => {
                    if is_manifest {
                        result.sanctuary_manifest_json = Some(text);
                    } else {
                        result.sanctuary_override_json = Some(text);
                    }
                    Ok(sevenz_rust2::EntryDecision::Continue)
                }
                Ok(None) => Ok(sevenz_rust2::EntryDecision::Continue),
                Err(e) => {
                    fatal_err = Some(e);
                    Ok(sevenz_rust2::EntryDecision::Stop)
                }
            },
            PreparedStageTarget::WriteFile {
                rel_clean,
                dest_path,
            } => {
                match stream_entry_to_staged_file(
                    r,
                    &dest_path,
                    staging_dir,
                    &mut copy_buf,
                    max_entry_bytes,
                    max_total_bytes,
                    &mut result.total_bytes,
                ) {
                    Ok(entry_written) => {
                        result.files.push(ExtractedZipEntry {
                            staged_path: dest_path,
                            rel_path: rel_clean,
                            size_bytes: entry_written,
                        });
                        Ok(sevenz_rust2::EntryDecision::Continue)
                    }
                    Err(e) => {
                        fatal_err = Some(e);
                        Ok(sevenz_rust2::EntryDecision::Stop)
                    }
                }
            }
        }
    });

    if let Some(err) = fatal_err {
        let _ = fs::remove_dir_all(staging_dir);
        return Err(err);
    }
    if let Err(err) = dec_res {
        let _ = fs::remove_dir_all(staging_dir);
        return Err(format!("7z decompression failed: {}", err));
    }

    crate::utils::strip_macos_quarantine_in_tree(staging_dir);
    Ok(result)
}

#[allow(dead_code)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum RarBackendKind {
    Bsdtar,
    SevenZip,
    Unar,
    Unrar,
}

enum RarAttemptError {
    PolicyViolation(String),
    BackendFailure(String),
}

fn find_binary_in_path(exe_names: &[&str], kind: RarBackendKind, out: &mut Vec<(PathBuf, RarBackendKind)>, seen: &mut std::collections::HashSet<String>) {
    let Some(path_os) = std::env::var_os("PATH") else {
        return;
    };
    for dir in std::env::split_paths(&path_os) {
        for exe in exe_names {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                let key = candidate.to_string_lossy().to_lowercase();
                if seen.insert(key) {
                    out.push((candidate, kind));
                }
            }
        }
    }
}

fn push_rar_candidate_if_file(
    p: PathBuf,
    kind: RarBackendKind,
    out: &mut Vec<(PathBuf, RarBackendKind)>,
    seen: &mut std::collections::HashSet<String>,
) {
    if p.is_file() {
        let key = p.to_string_lossy().to_lowercase();
        if seen.insert(key) {
            out.push((p, kind));
        }
    }
}

fn find_system_rar_extractors() -> Vec<(PathBuf, RarBackendKind)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    #[cfg(target_os = "windows")]
    {
        for (raw, kind) in [
            (r"C:\Program Files\7-Zip\7z.exe", RarBackendKind::SevenZip),
            (r"C:\Program Files (x86)\7-Zip\7z.exe", RarBackendKind::SevenZip),
            (r"C:\Program Files\WinRAR\UnRAR.exe", RarBackendKind::Unrar),
            (r"C:\Program Files (x86)\WinRAR\UnRAR.exe", RarBackendKind::Unrar),
        ] {
            push_rar_candidate_if_file(PathBuf::from(raw), kind, &mut out, &mut seen);
        }
        if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
            push_rar_candidate_if_file(
                PathBuf::from(local_app).join("Programs").join("7-Zip").join("7z.exe"),
                RarBackendKind::SevenZip,
                &mut out,
                &mut seen,
            );
        }
        find_binary_in_path(&["7z.exe", "7zz.exe"], RarBackendKind::SevenZip, &mut out, &mut seen);
        find_binary_in_path(&["unrar.exe", "UnRAR.exe"], RarBackendKind::Unrar, &mut out, &mut seen);
        find_binary_in_path(&["unar.exe"], RarBackendKind::Unar, &mut out, &mut seen);
        // Built-in Windows bsdtar fails on many RAR5/solid archives, so keep it as final fallback after 7z/UnRAR
        push_rar_candidate_if_file(
            PathBuf::from(r"C:\Windows\System32\tar.exe"),
            RarBackendKind::Bsdtar,
            &mut out,
            &mut seen,
        );
        find_binary_in_path(&["bsdtar.exe"], RarBackendKind::Bsdtar, &mut out, &mut seen);
    }
    #[cfg(target_os = "macos")]
    {
        for (raw, kind) in [
            ("/opt/homebrew/bin/7zz", RarBackendKind::SevenZip),
            ("/usr/local/bin/7zz", RarBackendKind::SevenZip),
            ("/opt/homebrew/bin/7z", RarBackendKind::SevenZip),
            ("/usr/local/bin/7z", RarBackendKind::SevenZip),
            ("/opt/homebrew/bin/unar", RarBackendKind::Unar),
            ("/usr/local/bin/unar", RarBackendKind::Unar),
            ("/opt/homebrew/bin/unrar", RarBackendKind::Unrar),
            ("/usr/local/bin/unrar", RarBackendKind::Unrar),
            ("/usr/bin/bsdtar", RarBackendKind::Bsdtar),
            ("/usr/bin/tar", RarBackendKind::Bsdtar),
        ] {
            push_rar_candidate_if_file(PathBuf::from(raw), kind, &mut out, &mut seen);
        }
        find_binary_in_path(&["7zz", "7z"], RarBackendKind::SevenZip, &mut out, &mut seen);
        find_binary_in_path(&["unar"], RarBackendKind::Unar, &mut out, &mut seen);
        find_binary_in_path(&["unrar"], RarBackendKind::Unrar, &mut out, &mut seen);
        find_binary_in_path(&["bsdtar"], RarBackendKind::Bsdtar, &mut out, &mut seen);
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        for (raw, kind) in [
            ("/usr/bin/7zz", RarBackendKind::SevenZip),
            ("/usr/local/bin/7zz", RarBackendKind::SevenZip),
            ("/usr/bin/7z", RarBackendKind::SevenZip),
            ("/usr/local/bin/7z", RarBackendKind::SevenZip),
            ("/usr/bin/unar", RarBackendKind::Unar),
            ("/usr/local/bin/unar", RarBackendKind::Unar),
            ("/usr/bin/unrar", RarBackendKind::Unrar),
            ("/usr/local/bin/unrar", RarBackendKind::Unrar),
            ("/usr/bin/bsdtar", RarBackendKind::Bsdtar),
            ("/usr/bin/tar", RarBackendKind::Bsdtar),
        ] {
            push_rar_candidate_if_file(PathBuf::from(raw), kind, &mut out, &mut seen);
        }
        find_binary_in_path(&["7zz", "7z"], RarBackendKind::SevenZip, &mut out, &mut seen);
        find_binary_in_path(&["unar"], RarBackendKind::Unar, &mut out, &mut seen);
        find_binary_in_path(&["unrar"], RarBackendKind::Unrar, &mut out, &mut seen);
        find_binary_in_path(&["bsdtar"], RarBackendKind::Bsdtar, &mut out, &mut seen);
    }

    out
}

fn configure_hidden_tool_command(cmd: &mut std::process::Command) {
    cmd.stdin(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
}

fn try_extract_rar_with_backend(
    tool_bin: &Path,
    backend_kind: RarBackendKind,
    archive_path: &Path,
    raw_dir: &Path,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<Vec<(PathBuf, PathBuf, u64)>, RarAttemptError> {
    // 1. Pre-extraction header audit
    let mut entry_count = 0usize;
    match backend_kind {
        RarBackendKind::Bsdtar => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.arg("-tvf").arg(archive_path);
            let list_out = c
                .output()
                .map_err(|e| RarAttemptError::BackendFailure(format!("bsdtar list spawn error: {}", e)))?;
            if !list_out.status.success() {
                return Err(RarAttemptError::BackendFailure(
                    "bsdtar failed to inspect RAR archive headers.".to_string(),
                ));
            }
            let listing_text = String::from_utf8_lossy(&list_out.stdout);
            for line in listing_text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                entry_count += 1;
                if trimmed.starts_with('l') || trimmed.starts_with('h') {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR rejected: contains unsafe symlink/hardlink entry.".to_string(),
                    ));
                }
                if trimmed.contains("..") {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR rejected: potential path traversal entry.".to_string(),
                    ));
                }
            }
        }
        RarBackendKind::SevenZip => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.args(["l", "-slt", "-p-"]).arg(archive_path);
            let list_out = c
                .output()
                .map_err(|e| RarAttemptError::BackendFailure(format!("7z list spawn error: {}", e)))?;
            if !list_out.status.success() {
                return Err(RarAttemptError::BackendFailure(
                    "7z failed to inspect RAR archive headers.".to_string(),
                ));
            }
            let listing_text = String::from_utf8_lossy(&list_out.stdout);
            let mut in_entries = false;
            for line in listing_text.lines() {
                let trimmed = line.trim();
                if trimmed == "----------" {
                    in_entries = true;
                    continue;
                }
                if !in_entries {
                    continue;
                }
                if let Some(rest) = trimmed.strip_prefix("Path = ") {
                    entry_count += 1;
                    if let Err(err) = validate_archive_entry_path(rest.trim()) {
                        return Err(RarAttemptError::PolicyViolation(err));
                    }
                } else if trimmed.starts_with("SymbolicLink = ")
                    || trimmed.contains("Attributes = L")
                {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR rejected: contains unsafe symlink entry.".to_string(),
                    ));
                }
            }
        }
        RarBackendKind::Unar => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.arg("-l").arg(archive_path);
            let list_out = c
                .output()
                .map_err(|e| RarAttemptError::BackendFailure(format!("unar list spawn error: {}", e)))?;
            if !list_out.status.success() {
                return Err(RarAttemptError::BackendFailure(
                    "unar failed to inspect RAR archive headers.".to_string(),
                ));
            }
            let listing_text = String::from_utf8_lossy(&list_out.stdout);
            for line in listing_text.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    entry_count += 1;
                }
                if trimmed.contains("..") {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR rejected: potential path traversal entry.".to_string(),
                    ));
                }
            }
        }
        RarBackendKind::Unrar => {
            let mut lt_cmd = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut lt_cmd);
            lt_cmd.args(["lt", "-p-"]).arg(archive_path);
            let lt_out = lt_cmd
                .output()
                .map_err(|e| RarAttemptError::BackendFailure(format!("unrar list spawn error: {}", e)))?;
            if !lt_out.status.success() {
                return Err(RarAttemptError::BackendFailure(
                    "unrar failed to inspect RAR archive headers.".to_string(),
                ));
            }
            let lt_text = String::from_utf8_lossy(&lt_out.stdout);
            for line in lt_text.lines() {
                let low = line.trim().to_ascii_lowercase();
                if low.contains("symbolic link")
                    || low.contains("hard link")
                    || low.contains("link target")
                    || low.contains(" --> ")
                {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR rejected: contains unsafe symlink/hardlink entry.".to_string(),
                    ));
                }
            }

            let mut vb_cmd = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut vb_cmd);
            vb_cmd.args(["vb", "-p-"]).arg(archive_path);
            let vb_out = vb_cmd
                .output()
                .map_err(|e| RarAttemptError::BackendFailure(format!("unrar vb spawn error: {}", e)))?;
            if !vb_out.status.success() {
                return Err(RarAttemptError::BackendFailure(
                    "unrar failed to list RAR entry paths.".to_string(),
                ));
            }
            let vb_text = String::from_utf8_lossy(&vb_out.stdout);
            for line in vb_text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                entry_count += 1;
                if let Err(err) = validate_archive_entry_path(trimmed) {
                    return Err(RarAttemptError::PolicyViolation(err));
                }
            }
        }
    }

    if entry_count > MAX_ARCHIVE_ENTRIES {
        return Err(RarAttemptError::PolicyViolation(format!(
            "RAR exceeds maximum safe entry count ({} > {}).",
            entry_count, MAX_ARCHIVE_ENTRIES
        )));
    }

    if raw_dir.exists() {
        let _ = fs::remove_dir_all(raw_dir);
    }
    fs::create_dir_all(raw_dir).map_err(|e| {
        RarAttemptError::BackendFailure(format!("Failed to create isolated RAR staging dir: {}", e))
    })?;

    let unpack_out = match backend_kind {
        RarBackendKind::Bsdtar => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.arg("-xf")
                .arg(archive_path)
                .arg("-C")
                .arg(raw_dir)
                .arg("--no-same-owner")
                .arg("--no-same-permissions");
            c.output()
        }
        RarBackendKind::SevenZip => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.args(["x", "-y", "-p-", "-snl-", &format!("-o{}", raw_dir.to_string_lossy())])
                .arg(archive_path);
            c.output()
        }
        RarBackendKind::Unar => {
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.args(["-f", "-d", "-o"])
                .arg(raw_dir)
                .arg(archive_path);
            c.output()
        }
        RarBackendKind::Unrar => {
            let mut dest_arg = raw_dir.to_string_lossy().to_string();
            if !dest_arg.ends_with(std::path::MAIN_SEPARATOR) {
                dest_arg.push(std::path::MAIN_SEPARATOR);
            }
            let mut c = std::process::Command::new(tool_bin);
            configure_hidden_tool_command(&mut c);
            c.args(["x", "-y", "-o+", "-p-"])
                .arg(archive_path)
                .arg(&dest_arg);
            c.output()
        }
    }
    .map_err(|e| RarAttemptError::BackendFailure(format!("RAR extraction failed to execute: {}", e)))?;

    if !unpack_out.status.success() {
        return Err(RarAttemptError::BackendFailure(
            "System RAR extractor returned a non-zero exit status.".to_string(),
        ));
    }

    // 2. Post-extraction symlink & size walk audit
    let mut unpacked_files: Vec<(PathBuf, PathBuf, u64)> = Vec::new();
    let mut total_unpacked: u64 = 0;
    for entry in walkdir::WalkDir::new(raw_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if let Ok(meta) = fs::symlink_metadata(p) {
            if meta.file_type().is_symlink() || is_symlink_or_reparse_point(p) {
                return Err(RarAttemptError::PolicyViolation(
                    "RAR rejected: extracted tree contained symlink/reparse point.".to_string(),
                ));
            }
            if meta.is_file() {
                let sz = meta.len();
                total_unpacked = total_unpacked.saturating_add(sz);
                if sz > max_entry_bytes || total_unpacked > max_total_bytes {
                    return Err(RarAttemptError::PolicyViolation(
                        "RAR archive exceeds maximum safe decompressed byte limit.".to_string(),
                    ));
                }
                if let Ok(rel) = p.strip_prefix(raw_dir) {
                    if !is_macos_or_os_metadata_path(rel) {
                        unpacked_files.push((p.to_path_buf(), rel.to_path_buf(), sz));
                    }
                }
            }
        }
    }

    Ok(unpacked_files)
}

/// Safe `.rar` extraction using verified system binaries (no shell), pre-extraction header auditing,
/// automatic extractor fallback (7-Zip / WinRAR UnRAR / unar / bsdtar for RAR5 support),
/// isolated temp unpacking, post-extraction symlink/size validation, and atomic wrapper normalization.
pub fn extract_rar_bounded_to_dir(
    archive_path: &Path,
    staging_dir: &Path,
    stem_hint: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<BoundedZipExtraction, String> {
    {
        let mut f = fs::File::open(archive_path)
            .map_err(|e| format!("Failed to open archive {:?}: {}", archive_path, e))?;
        let mut magic = [0u8; 6];
        f.read_exact(&mut magic)
            .map_err(|_| "Invalid RAR archive header.".to_string())?;
        if &magic != b"Rar!\x1A\x07" {
            return Err("Invalid RAR signature header.".to_string());
        }
    }

    let extractors = find_system_rar_extractors();
    if extractors.is_empty() {
        return Err(
            "No supported RAR extractor found (7z / UnRAR / unar / bsdtar). Install 7-Zip or WinRAR or repack as .zip/.7z."
                .to_string(),
        );
    }

    fs::create_dir_all(staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;
    let raw_dir = staging_dir.join(".raw_rar_unpack");

    let mut last_err: Option<String> = None;
    let mut unpacked_files_opt: Option<Vec<(PathBuf, PathBuf, u64)>> = None;

    for (tool_bin, backend_kind) in extractors {
        match try_extract_rar_with_backend(
            &tool_bin,
            backend_kind,
            archive_path,
            &raw_dir,
            max_entry_bytes,
            max_total_bytes,
        ) {
            Ok(files) => {
                unpacked_files_opt = Some(files);
                break;
            }
            Err(RarAttemptError::PolicyViolation(msg)) => {
                let _ = fs::remove_dir_all(staging_dir);
                return Err(msg);
            }
            Err(RarAttemptError::BackendFailure(msg)) => {
                let _ = fs::remove_dir_all(&raw_dir);
                last_err = Some(msg);
            }
        }
    }

    let Some(unpacked_files) = unpacked_files_opt else {
        let _ = fs::remove_dir_all(staging_dir);
        return Err(last_err.unwrap_or_else(|| {
            "All system RAR extractors failed to unpack RAR archive (install 7-Zip or WinRAR for RAR5 support)."
                .to_string()
        }));
    };

    let only_paths: Vec<PathBuf> = unpacked_files.iter().map(|(_, r, _)| r.clone()).collect();
    let strip_single_wrapper = detect_single_stem_wrapper(stem_hint, &only_paths);
    let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(game_schema);
    let visible_exts = crate::game_logic::get_vault_visible_extensions(game_schema);
    let mut result = BoundedZipExtraction::default();

    for (src_path, rel, sz) in unpacked_files {
        match prepare_staged_entry_target(
            rel,
            staging_dir,
            strip_single_wrapper.as_deref(),
            game_schema,
            preserve_aux,
            &visible_exts,
        ) {
            PreparedStageTarget::Skip => continue,
            PreparedStageTarget::Sidecar { is_manifest } => {
                if let Ok(bytes) = fs::read(&src_path) {
                    if bytes.len() > 2 * 1024 * 1024 {
                        let _ = fs::remove_dir_all(staging_dir);
                        return Err("Sanctuary sidecar JSON exceeds 2 MiB limit.".to_string());
                    }
                    if let Ok(text) = String::from_utf8(bytes) {
                        if is_manifest {
                            result.sanctuary_manifest_json = Some(text);
                        } else {
                            result.sanctuary_override_json = Some(text);
                        }
                    }
                }
            }
            PreparedStageTarget::WriteFile {
                rel_clean,
                dest_path,
            } => {
                if let Some(parent) = dest_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                fs::rename(&src_path, &dest_path)
                    .or_else(|_| fs::copy(&src_path, &dest_path).map(|_| ()))
                    .map_err(|e| format!("Failed staging RAR file {:?}: {}", dest_path, e))?;
                result.total_bytes = result.total_bytes.saturating_add(sz);
                result.files.push(ExtractedZipEntry {
                    staged_path: dest_path,
                    rel_path: rel_clean,
                    size_bytes: sz,
                });
            }
        }
    }

    let _ = fs::remove_dir_all(&raw_dir);
    crate::utils::strip_macos_quarantine_in_tree(staging_dir);
    Ok(result)
}

/// Magic-byte dispatcher across `.zip`/`.jar`, `.7z`, and `.rar` containers.
pub fn extract_archive_bounded_to_dir(
    archive_path: &Path,
    staging_dir: &Path,
    stem_hint: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<BoundedZipExtraction, String> {
    let mut magic = [0u8; 8];
    let magic_len = fs::File::open(archive_path)
        .ok()
        .and_then(|mut f| f.read(&mut magic).ok())
        .unwrap_or(0);

    if magic_len >= 6 && &magic[..6] == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        return extract_7z_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        );
    }
    if magic_len >= 6 && &magic[..6] == b"Rar!\x1A\x07" {
        return extract_rar_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        );
    }
    if magic_len >= 4
        && (&magic[..4] == [0x50, 0x4B, 0x03, 0x04]
            || &magic[..4] == [0x50, 0x4B, 0x05, 0x06]
            || &magic[..4] == [0x50, 0x4B, 0x07, 0x08])
    {
        return extract_zip_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        );
    }

    let ext = archive_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();
    match ext.as_str() {
        "7z" => extract_7z_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        ),
        "rar" => extract_rar_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        ),
        _ => extract_zip_bounded_to_dir(
            archive_path,
            staging_dir,
            stem_hint,
            game_schema,
            max_entry_bytes,
            max_total_bytes,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_7z_roundtrip_and_traversal_rejection() {
        let base = std::env::temp_dir().join(format!("sanctuary_7z_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();

        let src_dir = base.join("src");
        std::fs::create_dir_all(src_dir.join("fomod")).unwrap();
        std::fs::write(src_dir.join("plugin.esp"), b"TES4test").unwrap();
        std::fs::write(src_dir.join("fomod/ModuleConfig.xml"), b"<config/>").unwrap();

        let archive_7z = base.join("test_mod.7z");
        {
            let mut writer = sevenz_rust2::ArchiveWriter::create(&archive_7z).unwrap();
            let mut e1 = sevenz_rust2::ArchiveEntry::new_file("MyWrapper/plugin.esp");
            e1.has_stream = true;
            writer
                .push_archive_entry(e1, Some(std::fs::File::open(src_dir.join("plugin.esp")).unwrap()))
                .unwrap();
            let mut e2 = sevenz_rust2::ArchiveEntry::new_file("MyWrapper/fomod/ModuleConfig.xml");
            e2.has_stream = true;
            writer
                .push_archive_entry(
                    e2,
                    Some(std::fs::File::open(src_dir.join("fomod/ModuleConfig.xml")).unwrap()),
                )
                .unwrap();
            writer.finish().unwrap();
        }

        let stage = base.join("stage");
        let extracted = extract_archive_bounded_to_dir(
            &archive_7z,
            &stage,
            Some("MyWrapper"),
            &None,
            MAX_ARCHIVE_ENTRY_BYTES,
            MAX_ARCHIVE_TOTAL_BYTES,
        )
        .unwrap();
        assert_eq!(extracted.files.len(), 2);
        assert!(stage.join("plugin.esp").exists());
        assert!(stage.join("fomod/ModuleConfig.xml").exists());

        assert!(validate_archive_entry_path("../evil.dll").is_err());
        assert!(validate_archive_entry_path("C:/evil.dll").is_err());
        assert!(validate_archive_entry_path("/etc/passwd").is_err());

        let _ = std::fs::remove_dir_all(&base);
    }
}

