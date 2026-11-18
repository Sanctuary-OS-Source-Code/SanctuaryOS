#[allow(unused_imports)]
use crate::commands::state_ops::*;
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
use super::lab_staging::*;
#[allow(unused_imports)]
use super::lab_session::*;

pub(super) fn current_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub(super) fn current_epoch_millis_u128() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub(super) fn file_mtime_millis(meta: &std::fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub(super) fn compute_dir_save_slot_snapshot(dir: &Path) -> Option<SaveSlotSnapshot> {
    use sha2::{Digest, Sha256};

    let mut latest_ms = 0u128;
    let mut total_bytes = 0u64;
    let mut file_count = 0usize;
    let mut hasher = Sha256::new();

    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();
    files.sort();

    for fpath in files {
        let fname_lower = fpath
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if is_temporary_or_internal_save_artifact(&fname_lower) {
            continue;
        }
        if let Ok(meta) = std::fs::metadata(&fpath) {
            file_count += 1;
            total_bytes = total_bytes.saturating_add(meta.len());
            let ms = file_mtime_millis(&meta);
            if ms > latest_ms {
                latest_ms = ms;
            }
            if let Ok((_, _, fp)) = sample_file_fingerprint(&fpath) {
                hasher.update(fp.as_bytes());
            }
        }
    }

    if file_count == 0 || total_bytes == 0 {
        None
    } else {
        Some(SaveSlotSnapshot {
            mtime_ms: latest_ms,
            size_bytes: total_bytes,
            fingerprint: hex::encode(hasher.finalize()),
        })
    }
}

pub(super) fn snapshot_save_slots(
    docs_dir: &Path,
    vault_path_opt: Option<&str>,
    save_targets: &[String],
    save_extensions: &[String],
) -> (HashMap<PathBuf, SaveSlotSnapshot>, Option<u64>) {
    let mut map = HashMap::new();
    let mut seeded_size: Option<u64> = None;
    if save_targets.is_empty() {
        return (map, None);
    }
    let allow_dir_slots = is_directory_save_mode(save_extensions);
    let storage = resolve_airgap_storage_paths(docs_dir, vault_path_opt);
    let seeded_name = load_sandbox_state_meta(&storage.sandbox_root)
        .selected_save_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if allow_dir_slots && entry.depth() > 1 {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            if !matches_save_filename(&fname, save_extensions) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok((size_bytes, _, fingerprint)) = sample_file_fingerprint(entry.path()) {
                    let snap = SaveSlotSnapshot {
                        mtime_ms: file_mtime_millis(&meta),
                        size_bytes,
                        fingerprint,
                    };
                    if seeded_name
                        .as_ref()
                        .map_or(false, |sn| sn.eq_ignore_ascii_case(&fname))
                    {
                        seeded_size = Some(size_bytes);
                    }
                    map.insert(entry.path().to_path_buf(), snap);
                }
            }
        }

        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !name.starts_with('.') {
                        if let Some(snap) = compute_dir_save_slot_snapshot(&slot_path) {
                            if seeded_name
                                .as_ref()
                                .map_or(false, |sn| sn.eq_ignore_ascii_case(&name))
                            {
                                seeded_size = Some(snap.size_bytes);
                            }
                            map.insert(slot_path, snap);
                        }
                    }
                }
            }
        }
    }
    if seeded_size.is_none() && map.len() == 1 {
        seeded_size = map.values().next().map(|s| s.size_bytes);
    }
    (map, seeded_size)
}

pub(super) fn has_inflight_temporary_save_files(docs_dir: &Path, save_targets: &[String]) -> bool {
    let now_ms = current_epoch_millis_u128();
    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(4)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let lower = entry.file_name().to_string_lossy().to_lowercase();
            let is_active_temp = lower.ends_with(".tmp")
                || lower.ends_with(".temp")
                || lower.ends_with(".part")
                || lower.ends_with(".partial")
                || lower.ends_with(".writing")
                || lower.ends_with(".savetmp")
                || lower.ends_with(".bak_tmp")
                || lower.ends_with(".lock")
                || lower.ends_with("-journal");
            if is_active_temp {
                if let Ok(meta) = entry.metadata() {
                    // Consider temp files touched within the last 15 seconds as actively serializing
                    if now_ms.saturating_sub(file_mtime_millis(&meta)) <= 15_000 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub(super) fn snapshot_scratch_files(
    docs_dir: &Path,
    scratch_subdirs: &[String],
) -> HashMap<PathBuf, (u64, u128)> {
    let mut files = HashMap::new();
    for sub in scratch_subdirs {
        let dir = crate::utils::resolve_case_insensitive_path(docs_dir, sub);
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            // Strictly inspect real non-empty files ONLY — never match the empty scratch directory itself!
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy();
            if fname.starts_with('.') {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len > 0 {
                    files.insert(entry.path().to_path_buf(), (len, file_mtime_millis(&meta)));
                }
            }
        }
    }
    files
}

pub(super) fn inspect_post_menu_scratch_activity(
    docs_dir: &Path,
    scratch_subdirs: &[String],
    baseline_files: &HashMap<PathBuf, (u64, u128)>,
    min_epoch_secs: u64,
    now_ms: u128,
) -> (bool, bool) {
    let min_ms = (min_epoch_secs as u128).saturating_mul(1000);
    let mut created_or_changed = false;
    let mut modified_recently = false;
    for sub in scratch_subdirs {
        let dir = crate::utils::resolve_case_insensitive_path(docs_dir, sub);
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let fname = entry.file_name().to_string_lossy();
            if fname.starts_with('.') {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len == 0 {
                    continue;
                }
                let mtime_ms = file_mtime_millis(&meta);
                if mtime_ms < min_ms {
                    continue;
                }
                let changed = match baseline_files.get(entry.path()) {
                    None => true,
                    Some(&(prev_len, prev_ms)) => len != prev_len || mtime_ms > prev_ms,
                };
                if changed {
                    created_or_changed = true;
                    if now_ms > 0 && now_ms.saturating_sub(mtime_ms) <= 4_000 {
                        modified_recently = true;
                    }
                }
            }
        }
    }
    (created_or_changed, modified_recently)
}

#[cfg(test)]
pub(super) fn has_post_menu_scratch_file_activity(
    docs_dir: &Path,
    scratch_subdirs: &[String],
    baseline_files: &HashMap<PathBuf, (u64, u128)>,
    min_epoch_secs: u64,
) -> bool {
    inspect_post_menu_scratch_activity(docs_dir, scratch_subdirs, baseline_files, min_epoch_secs, 0)
        .0
}

pub(super) fn detect_fresh_save_candidate(
    docs_dir: &Path,
    save_targets: &[String],
    save_extensions: &[String],
    initial_snapshots: &HashMap<PathBuf, SaveSlotSnapshot>,
    seeded_baseline_size: Option<u64>,
    min_epoch_ms: u128,
) -> Option<PendingSaveCandidate> {
    if save_targets.is_empty() {
        return None;
    }
    let allow_dir_slots = is_directory_save_mode(save_extensions);
    let now_epoch = current_epoch_secs();

    for rel in save_targets {
        let saves_dir = crate::utils::resolve_case_insensitive_path(docs_dir, rel);
        if !saves_dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&saves_dir)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if allow_dir_slots && entry.depth() > 1 {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            if !matches_save_filename(&fname, save_extensions) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let len = meta.len();
                if len == 0 {
                    continue;
                }
                let mtime_ms = file_mtime_millis(&meta);
                let prev_snap = initial_snapshots.get(entry.path());
                let prev_ms = prev_snap.map(|s| s.mtime_ms).unwrap_or(0);
                // Allow a 1500ms filesystem timestamp granularity tolerance relative to Stage 4 start,
                // while strictly requiring mtime_ms > prev_ms for pre-existing files!
                let after_stage_start = mtime_ms >= min_epoch_ms.saturating_sub(1500);
                if mtime_ms > prev_ms && after_stage_start {
                    // Reject byte-for-byte duplicate copy of another pre-existing save slot dropped into a new filename
                    if prev_snap.is_none() {
                        if let Ok((sz, _, fp)) = sample_file_fingerprint(entry.path()) {
                            let is_copied_old_slot = initial_snapshots
                                .values()
                                .any(|old| old.size_bytes == sz && old.fingerprint == fp);
                            if is_copied_old_slot {
                                continue;
                            }
                        }
                    }
                    return Some(PendingSaveCandidate {
                        path: entry.path().to_path_buf(),
                        display_name: fname,
                        prev_size_bytes: prev_snap
                            .map(|s| s.size_bytes)
                            .or(seeded_baseline_size),
                        observed_size_bytes: len,
                        observed_mtime_ms: mtime_ms,
                        detected_epoch: now_epoch,
                    });
                }
            }
        }

        if allow_dir_slots {
            if let Ok(entries) = std::fs::read_dir(&saves_dir) {
                for entry in entries.flatten() {
                    let slot_path = entry.path();
                    let dname = entry.file_name().to_string_lossy().to_string();
                    if slot_path.is_dir() && !dname.starts_with('.') {
                        if let Some(snap) = compute_dir_save_slot_snapshot(&slot_path) {
                            let prev_snap = initial_snapshots.get(&slot_path);
                            let prev_ms = prev_snap.map(|s| s.mtime_ms).unwrap_or(0);
                            let after_stage_start =
                                snap.mtime_ms >= min_epoch_ms.saturating_sub(1500);
                            if snap.mtime_ms > prev_ms && after_stage_start {
                                if prev_snap.is_none() {
                                    let is_copied_old_slot = initial_snapshots.values().any(|old| {
                                        old.size_bytes == snap.size_bytes
                                            && old.fingerprint == snap.fingerprint
                                    });
                                    if is_copied_old_slot {
                                        continue;
                                    }
                                }
                                return Some(PendingSaveCandidate {
                                    path: slot_path,
                                    display_name: dname,
                                    prev_size_bytes: prev_snap
                                        .map(|s| s.size_bytes)
                                        .or(seeded_baseline_size),
                                    observed_size_bytes: snap.size_bytes,
                                    observed_mtime_ms: snap.mtime_ms,
                                    detected_epoch: now_epoch,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

pub(super) fn audit_single_save_file_integrity(path: &Path, min_bytes: u64) -> Result<u64, String> {
    use std::io::{Read, Seek, SeekFrom};

    let meta = std::fs::metadata(path)
        .map_err(|e| format!("Save file {:?} could not be read: {}", path, e))?;
    let size = meta.len();
    if size < min_bytes {
        return Err(format!(
            "Save file '{}' is incomplete or truncated ({} bytes).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }

    let mut f = std::fs::File::open(path)
        .map_err(|e| format!("Save file {:?} is locked or unreadable: {}", path, e))?;

    let head_len = (size.min(65_536)) as usize;
    let mut head = vec![0u8; head_len];
    f.read_exact(&mut head)
        .map_err(|e| format!("Failed reading save header {:?}: {}", path, e))?;

    // Reject crash-zeroed or uninitialized 0x00 / 0xFF preallocated buffers
    let head_check_slice = &head[..head.len().min(4096)];
    if head_check_slice.iter().all(|&b| b == 0x00) {
        return Err(format!(
            "Save file '{}' contains a null-zeroed header (serialization aborted mid-write).",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
    }

    let tail = if size > 65_536 {
        let tail_offset = size - 65_536;
        f.seek(SeekFrom::Start(tail_offset))
            .map_err(|e| format!("Failed seeking save trailer {:?}: {}", path, e))?;
        let mut t = vec![0u8; 65_536];
        f.read_exact(&mut t)
            .map_err(|e| format!("Failed reading save trailer {:?}: {}", path, e))?;
        t
    } else {
        head.clone()
    };

    // Universal container & structured-format framing checks (100% magic-byte driven, zero hardcoded extensions)
    // 1. ZIP container (PK\x03\x04): must contain End of Central Directory (PK\x05\x06) in the trailer
    if head.starts_with(b"PK\x03\x04") {
        let has_eocd = tail.windows(4).any(|w| w == b"PK\x05\x06");
        if !has_eocd {
            return Err(format!(
                "Archive-backed save '{}' is missing its End-of-Central-Directory record (corrupted/truncated write).",
                path.file_name().unwrap_or_default().to_string_lossy()
            ));
        }
    }
    // 2. GZIP stream (\x1F\x8B): must have 10-byte header + 8-byte CRC32/ISIZE trailer
    else if head.starts_with(&[0x1F, 0x8B]) && size < 18 {
        return Err(format!(
            "Compressed save '{}' is truncated ({} bytes < 18-byte GZIP frame).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }
    // 3. Zstandard frame (\x28\xB5\x2F\xFD)
    else if head.starts_with(&[0x28, 0xB5, 0x2F, 0xFD]) && size < 12 {
        return Err(format!(
            "Compressed save '{}' is truncated ({} bytes < Zstd frame minimum).",
            path.file_name().unwrap_or_default().to_string_lossy(),
            size
        ));
    }
    // 4. SQLite 3 database ("SQLite format 3\0"): verify header size >= 100 and page-aligned file length
    else if head.starts_with(b"SQLite format 3\0") {
        if size < 100 || head.len() < 18 {
            return Err("Database-backed save header is truncated (< 100 bytes).".to_string());
        }
        let raw_page = u16::from_be_bytes([head[16], head[17]]) as u64;
        let page_size = if raw_page == 1 { 65_536 } else { raw_page };
        if page_size >= 512 && page_size.is_power_of_two() && (size < page_size || size % page_size != 0) {
            return Err(format!(
                "Database-backed save '{}' has an incomplete page write ({} bytes not aligned to {}B page).",
                path.file_name().unwrap_or_default().to_string_lossy(),
                size,
                page_size
            ));
        }
    } else {
        // 5. Structured UTF-8 JSON / XML text saves: verify closing delimiter was flushed completely
        let bom_stripped = if head.starts_with(&[0xEF, 0xBB, 0xBF]) {
            &head[3..]
        } else {
            &head[..]
        };
        let probe_len = bom_stripped.len().min(512);
        if let Ok(head_text) = std::str::from_utf8(&bom_stripped[..probe_len]) {
            let trimmed_start = head_text.trim_start();
            let trimmed_tail_bytes = {
                let mut end = tail.len();
                while end > 0
                    && matches!(tail[end - 1], b' ' | b'\t' | b'\r' | b'\n' | 0x00)
                {
                    if tail[end - 1] == 0x00 {
                        // Null padding at the end of a UTF-8 JSON/XML text file indicates mid-flush crash truncation!
                        return Err(format!(
                            "Structured save '{}' ends with null bytes instead of a closing delimiter.",
                            path.file_name().unwrap_or_default().to_string_lossy()
                        ));
                    }
                    end -= 1;
                }
                &tail[..end]
            };

            if trimmed_start.starts_with('{') {
                if trimmed_tail_bytes.last().copied() != Some(b'}') {
                    return Err(format!(
                        "JSON save '{}' is truncated (missing closing '}}').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            } else if trimmed_start.starts_with('[') {
                if trimmed_tail_bytes.last().copied() != Some(b']') {
                    return Err(format!(
                        "JSON array save '{}' is truncated (missing closing ']').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            } else if trimmed_start.starts_with("<?xml")
                || (trimmed_start.starts_with('<')
                    && trimmed_start
                        .as_bytes()
                        .get(1)
                        .map_or(false, |c| c.is_ascii_alphabetic()))
            {
                if trimmed_tail_bytes.last().copied() != Some(b'>') {
                    return Err(format!(
                        "XML save '{}' is truncated (missing closing '>').",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }
            }
        }
    }

    Ok(size)
}

pub fn audit_save_file_corruption(
    save_path: &Path,
    prev_size_bytes: Option<u64>,
) -> Result<u64, String> {
    if !save_path.exists() {
        return Err("Save checkpoint disappeared before integrity verification completed.".to_string());
    }

    let total_size = if save_path.is_dir() {
        let mut sum = 0u64;
        let mut valid_files = 0usize;
        for entry in walkdir::WalkDir::new(save_path)
            .max_depth(4)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let lower = entry.file_name().to_string_lossy().to_lowercase();
            if lower.ends_with(".tmp")
                || lower.ends_with(".part")
                || lower.ends_with(".savetmp")
                || lower.ends_with(".corrupt")
            {
                return Err(format!(
                    "Save folder contains incomplete temporary artifact '{}'.",
                    lower
                ));
            }
            if is_temporary_or_internal_save_artifact(&lower) {
                continue;
            }
            let fsize = audit_single_save_file_integrity(entry.path(), 1)?;
            sum = sum.saturating_add(fsize);
            valid_files += 1;
        }
        if valid_files == 0 || sum < 32 {
            return Err("Save directory slot contains no complete save data.".to_string());
        }
        sum
    } else {
        audit_single_save_file_integrity(save_path, 32)?
    };

    // Guard against catastrophic truncation compared to the seeded/previous save slot size
    if let Some(prev_sz) = prev_size_bytes {
        if prev_sz >= 4096 && total_size < prev_sz / 4 {
            return Err(format!(
                "Save size collapsed unexpectedly from {} bytes to {} bytes (< 25% of baseline — probable save truncation).",
                prev_sz, total_size
            ));
        }
    }

    Ok(total_size)
}

pub(super) fn collect_deployed_payload_fingerprints(
    vault_path: &str,
    linked_files: &[String],
) -> Result<Vec<(PathBuf, u64, String)>, String> {
    let coords = get_saved_coordinates();
    let mods_root_str = if !coords.mods_path.trim().is_empty() {
        coords.mods_path.trim()
    } else {
        coords.live_path.trim()
    };
    let mods_dir = PathBuf::from(mods_root_str);

    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    if !mods_root_str.is_empty() && mods_dir.exists() {
        if let Ok(raw) = std::fs::read_to_string(mods_dir.join(".sanctuary_deployed_links.json")) {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for p_str in list {
                    let p = PathBuf::from(p_str);
                    if p.is_file() && !candidate_paths.contains(&p) {
                        candidate_paths.push(p);
                    }
                }
            }
        }
        for rel in linked_files {
            let cleaned = rel.trim().replace('/', std::path::MAIN_SEPARATOR_STR);
            if cleaned.is_empty() {
                continue;
            }
            let p = mods_dir.join(&cleaned);
            if p.is_file() && !candidate_paths.contains(&p) {
                candidate_paths.push(p);
            }
        }
    }

    if !vault_path.trim().is_empty() {
        if let Some((raw_routed, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
            if let Ok(records) = serde_json::from_str::<Vec<serde_json::Value>>(&raw_routed) {
                for rec in records {
                    let dest_opt = rec
                        .get("dest")
                        .or_else(|| rec.get("path"))
                        .and_then(|v| v.as_str())
                        .or_else(|| rec.as_str());
                    if let Some(d_str) = dest_opt {
                        let p = PathBuf::from(d_str);
                        if p.is_file() && !candidate_paths.contains(&p) {
                            candidate_paths.push(p);
                        }
                    }
                }
            }
        }
    }

    let mut verified = Vec::new();
    for p in candidate_paths {
        let fname_lower = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if fname_lower.starts_with(".sanctuary") {
            continue;
        }
        let (sz, _, fp) = sample_file_fingerprint(&p)?;
        verified.push((p, sz, fp));
    }

    Ok(verified)
}

pub(super) fn verify_deployed_payload_intact(expected: &[(PathBuf, u64, String)]) -> Result<(), String> {
    for (path, expected_sz, expected_fp) in expected {
        if !path.exists() || !path.is_file() {
            return Err("lab_err_payload_tampered".to_string());
        }
        let (actual_sz, _, actual_fp) =
            sample_file_fingerprint(path).map_err(|_| "lab_err_payload_tampered".to_string())?;
        if actual_sz != *expected_sz || actual_fp != *expected_fp {
            return Err("lab_err_payload_tampered".to_string());
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(super) fn process_has_visible_window(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
) -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    let Some(pid) = target_pid else {
        return false;
    };

    struct EnumWinCtx<'a> {
        target_pid: u32,
        sys: &'a sysinfo::System,
        exe_candidates: &'a [String],
        live_root_norm_opt: Option<&'a str>,
        found: bool,
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            lp_enum_func: unsafe extern "system" fn(isize, isize) -> i32,
            l_param: isize,
        ) -> i32;
    }

    unsafe extern "system" fn enum_proc(hwnd_raw: isize, lparam: isize) -> i32 {
        let ctx = &mut *(lparam as *mut EnumWinCtx<'_>);
        if hwnd_raw == 0 {
            return 1;
        }
        let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return 1;
        }
        let mut rect = RECT::default();
        if GetClientRect(hwnd, &mut rect).is_err() {
            return 1;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 320 || height < 200 {
            return 1;
        }

        let mut win_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid == 0 {
            return 1;
        }
        let mut matches = win_pid == ctx.target_pid;
        if !matches {
            if let Some(proc_info) = ctx.sys.process(sysinfo::Pid::from_u32(win_pid)) {
                if process_matches_game_candidates(win_pid, proc_info, ctx.exe_candidates) {
                    matches = true;
                } else if let (Some(root_norm), Some(exe_path)) =
                    (ctx.live_root_norm_opt, proc_info.exe())
                {
                    let proc_norm = crate::utils::normalize_path_key(exe_path);
                    if !root_norm.is_empty() && proc_norm.starts_with(root_norm) {
                        matches = true;
                    }
                }
            }
        }
        if matches {
            ctx.found = true;
            return 0;
        }
        1
    }

    let mut ctx = EnumWinCtx {
        target_pid: pid,
        sys,
        exe_candidates,
        live_root_norm_opt,
        found: false,
    };
    unsafe {
        let _ = EnumWindows(enum_proc, (&mut ctx as *mut EnumWinCtx<'_>) as isize);
    }
    ctx.found
}

#[cfg(not(target_os = "windows"))]
pub(super) fn process_has_visible_window(
    target_pid: Option<u32>,
    _sys: &sysinfo::System,
    _exe_candidates: &[String],
    _live_root_norm_opt: Option<&str>,
) -> bool {
    target_pid.map_or(false, |pid| pid > 0)
}

#[cfg(target_os = "windows")]
pub(super) fn poll_optional_xinput_activity(
    gamepad_packets: &mut [u32; 4],
    gamepad_connected_mask: &mut u8,
    last_xinput_probe_epoch: &mut u64,
    last_gamepad_input_epoch: &mut u64,
    kb_mouse_idle_secs: u32,
    now_epoch: u64,
) {
    // When keyboard/mouse is actively receiving input, skip XInput completely so we never
    // trigger Windows HID PnP stalls on disconnected controller slots during DX11 rendering!
    if kb_mouse_idle_secs <= 2 {
        return;
    }

    #[repr(C)]
    struct RawXInputState {
        dw_packet_number: u32,
        gamepad: [u8; 12],
    }
    type XInputGetStateFn = unsafe extern "system" fn(u32, *mut RawXInputState) -> u32;

    static XINPUT_GET_STATE: std::sync::OnceLock<Option<XInputGetStateFn>> =
        std::sync::OnceLock::new();

    let func_opt = XINPUT_GET_STATE.get_or_init(|| unsafe {
        #[link(name = "kernel32")]
        extern "system" {
            fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut std::ffi::c_void;
            fn GetProcAddress(
                h_module: *mut std::ffi::c_void,
                lp_proc_name: *const u8,
            ) -> *const std::ffi::c_void;
        }
        let mut hmod = LoadLibraryA(b"xinput1_4.dll\0".as_ptr());
        if hmod.is_null() {
            hmod = LoadLibraryA(b"xinput9_1_0.dll\0".as_ptr());
        }
        if hmod.is_null() {
            return None;
        }
        let proc_ptr = GetProcAddress(hmod, b"XInputGetState\0".as_ptr());
        if proc_ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute::<*const std::ffi::c_void, XInputGetStateFn>(proc_ptr))
        }
    });

    if let Some(xinput_get_state) = func_opt {
        let allow_disconnected_probe =
            *last_xinput_probe_epoch == 0 || now_epoch.saturating_sub(*last_xinput_probe_epoch) >= 30;
        if allow_disconnected_probe {
            *last_xinput_probe_epoch = now_epoch;
        }

        for (slot, prev_pkt) in gamepad_packets.iter_mut().enumerate() {
            let bit = 1u8 << slot;
            let was_connected = (*gamepad_connected_mask & bit) != 0;
            if !was_connected && !allow_disconnected_probe {
                continue;
            }
            let mut state = RawXInputState {
                dw_packet_number: 0,
                gamepad: [0u8; 12],
            };
            let res = unsafe { xinput_get_state(slot as u32, &mut state) };
            if res == 0 {
                *gamepad_connected_mask |= bit;
                if *prev_pkt != 0 && *prev_pkt != state.dw_packet_number {
                    *last_gamepad_input_epoch = now_epoch;
                }
                *prev_pkt = state.dw_packet_number;
            } else {
                *gamepad_connected_mask &= !bit;
                *prev_pkt = 0;
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub(super) fn get_os_focus_and_idle(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
    gamepad_packets: &mut [u32; 4],
    gamepad_connected_mask: &mut u8,
    last_xinput_probe_epoch: &mut u64,
    last_gamepad_input_epoch: &mut u64,
    now_epoch: u64,
) -> (bool, u32) {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    let mut is_focused = false;
    if let Some(pid) = target_pid {
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.0.is_null() && !IsIconic(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() {
                let mut fg_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                if fg_pid == pid {
                    is_focused = true;
                } else if fg_pid != 0 {
                    // Multi-process engines or custom schemas with separate render/window child process
                    if let Some(fg_proc) = sys.process(sysinfo::Pid::from_u32(fg_pid)) {
                        if process_matches_game_candidates(fg_pid, fg_proc, exe_candidates) {
                            is_focused = true;
                        } else if let (Some(root_norm), Some(exe_path)) =
                            (live_root_norm_opt, fg_proc.exe())
                        {
                            let proc_norm = crate::utils::normalize_path_key(exe_path);
                            if !root_norm.is_empty() && proc_norm.starts_with(root_norm) {
                                is_focused = true;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut idle_secs = 0u32;
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii).as_bool() {
            let now_ticks = GetTickCount();
            let elapsed_ms = now_ticks.wrapping_sub(lii.dwTime);
            idle_secs = elapsed_ms / 1000;
        }
    }

    poll_optional_xinput_activity(
        gamepad_packets,
        gamepad_connected_mask,
        last_xinput_probe_epoch,
        last_gamepad_input_epoch,
        idle_secs,
        now_epoch,
    );
    if *last_gamepad_input_epoch > 0 {
        let gp_idle = now_epoch.saturating_sub(*last_gamepad_input_epoch) as u32;
        idle_secs = idle_secs.min(gp_idle);
    }

    (is_focused, idle_secs)
}

#[cfg(not(target_os = "windows"))]
pub(super) fn get_os_focus_and_idle(
    target_pid: Option<u32>,
    sys: &sysinfo::System,
    exe_candidates: &[String],
    live_root_norm_opt: Option<&str>,
    _gamepad_packets: &mut [u32; 4],
    _gamepad_connected_mask: &mut u8,
    _last_xinput_probe_epoch: &mut u64,
    _last_gamepad_input_epoch: &mut u64,
    _now_epoch: u64,
) -> (bool, u32) {
    let Some(pid) = target_pid else {
        return (false, 0);
    };
    #[cfg(target_os = "linux")]
    {
        let stat_path = format!("/proc/{}/stat", pid);
        let mut alive_and_running = std::path::Path::new(&format!("/proc/{}", pid)).exists();
        if let Ok(stat) = std::fs::read_to_string(&stat_path) {
            if let Some(rparen) = stat.rfind(')') {
                let after = stat[rparen + 1..].trim();
                let state_char = after.chars().next().unwrap_or('S');
                alive_and_running = !matches!(state_char, 'T' | 't' | 'Z' | 'X');
            }
        }
        if !alive_and_running {
            return (false, 0);
        }

        // Passive X11/XWayland active window PID check when available; Gamescope/Wayland sessions without _NET_WM_PID stay permissive
        let mut is_focused = true;
        if std::env::var_os("DISPLAY").is_some()
            && std::env::var_os("GAMESCOPE_WAYLAND_DISPLAY").is_none()
        {
            if let Ok(root_out) = std::process::Command::new("xprop")
                .args(["-root", "_NET_ACTIVE_WINDOW"])
                .output()
            {
                if root_out.status.success() {
                    let root_txt = String::from_utf8_lossy(&root_out.stdout);
                    if let Some(win_id) = root_txt
                        .rsplit(|c: char| c.is_whitespace() || c == ',')
                        .find(|tok| tok.starts_with("0x"))
                    {
                        if win_id == "0x0" {
                            is_focused = false;
                        } else if let Ok(pid_out) = std::process::Command::new("xprop")
                            .args(["-id", win_id, "_NET_WM_PID"])
                            .output()
                        {
                            let pid_txt = String::from_utf8_lossy(&pid_out.stdout);
                            if let Some(eq) = pid_txt.find('=') {
                                if let Ok(active_pid) = pid_txt[eq + 1..].trim().parse::<u32>() {
                                    if active_pid > 0 {
                                        is_focused = active_pid == pid
                                            || sys
                                                .process(sysinfo::Pid::from_u32(active_pid))
                                                .map(|fg_proc| {
                                                    process_matches_game_candidates(
                                                        active_pid,
                                                        fg_proc,
                                                        exe_candidates,
                                                    ) || live_root_norm_opt
                                                        .zip(fg_proc.exe())
                                                        .map(|(r, p)| {
                                                            !r.is_empty()
                                                                && crate::utils::normalize_path_key(p)
                                                                    .starts_with(r)
                                                        })
                                                        .unwrap_or(false)
                                                })
                                                .unwrap_or(false);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Passive Linux session idle query (xprintidle or freedesktop ScreenSaver DBus)
        let mut idle_secs = 0u32;
        if let Ok(out) = std::process::Command::new("xprintidle").output() {
            if out.status.success() {
                if let Ok(ms) = String::from_utf8_lossy(&out.stdout).trim().parse::<u64>() {
                    idle_secs = (ms / 1000) as u32;
                }
            }
        } else if let Ok(out) = std::process::Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.ScreenSaver",
                "--object-path",
                "/org/freedesktop/ScreenSaver",
                "--method",
                "org.freedesktop.ScreenSaver.GetSessionIdleTime",
            ])
            .output()
        {
            if out.status.success() {
                let txt = String::from_utf8_lossy(&out.stdout);
                let digits: String = txt.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(val) = digits.parse::<u64>() {
                    // freedesktop ScreenSaver returns seconds or milliseconds depending on DE
                    idle_secs = if val > 86_400 {
                        (val / 1000) as u32
                    } else {
                        val as u32
                    };
                }
            }
        }

        return (is_focused, idle_secs);
    }
    #[cfg(target_os = "macos")]
    {
        let mut is_focused = false;
        // Passive lsappinfo frontmost PID check (zero Accessibility/AppleEvents TCC prompts)
        if let Ok(front_out) = std::process::Command::new("lsappinfo").arg("front").output() {
            let asn = String::from_utf8_lossy(&front_out.stdout).trim().to_string();
            if !asn.is_empty() {
                if let Ok(info_out) = std::process::Command::new("lsappinfo")
                    .args(["info", "-only", "pid", &asn])
                    .output()
                {
                    let info_txt = String::from_utf8_lossy(&info_out.stdout);
                    if let Some(eq) = info_txt.find('=') {
                        if let Ok(front_pid) = info_txt[eq + 1..].trim().parse::<u32>() {
                            if front_pid > 0 {
                                is_focused = front_pid == pid
                                    || sys
                                        .process(sysinfo::Pid::from_u32(front_pid))
                                        .map(|fg_proc| {
                                            process_matches_game_candidates(
                                                front_pid,
                                                fg_proc,
                                                exe_candidates,
                                            ) || live_root_norm_opt
                                                .zip(fg_proc.exe())
                                                .map(|(r, p)| {
                                                    !r.is_empty()
                                                        && crate::utils::normalize_path_key(p)
                                                            .starts_with(r)
                                                })
                                                .unwrap_or(false)
                                        })
                                        .unwrap_or(false);
                            }
                        }
                    }
                }
            }
        } else {
            is_focused = pid > 0;
        }

        let mut idle_secs = 0u32;
        if let Ok(out) = std::process::Command::new("ioreg")
            .args(["-c", "IOHIDSystem", "-d", "4"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("\"HIDIdleTime\"") {
                    if let Some(eq) = line.find('=') {
                        if let Ok(ns) = line[eq + 1..].trim().parse::<u64>() {
                            idle_secs = (ns / 1_000_000_000) as u32;
                            break;
                        }
                    }
                }
            }
        }
        return (is_focused, idle_secs);
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (sys, exe_candidates, live_root_norm_opt);
        (pid > 0, 0)
    }
}

pub(super) fn persist_certificate_to_vault(vault_path: &str, cert: &LabVerificationCertificate) {
    if vault_path.trim().is_empty() {
        return;
    }
    let Ok(conn_arc) = crate::utils::open_db_conn(vault_path) else {
        return;
    };
    let Ok(conn) = conn_arc.lock() else {
        return;
    };
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if let Ok(json_str) = serde_json::to_string(cert) {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO lab_certificates (dna_hash, cert_json, verified_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![cert.dna_hash, json_str, now_secs],
        );
    }
}

pub(super) fn scan_logs_sync(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
    min_mtime_epoch_secs: Option<u64>,
) -> Option<String> {
    if !docs_dir.exists() {
        return None;
    }
    let mut exceptions = Vec::new();
    let mut has_crash = false;

    let walker = walkdir::WalkDir::new(docs_dir)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let lower = e.file_name().to_string_lossy().to_lowercase();
            if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
                return false;
            }
            true
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let full_path = entry.path().to_path_buf();
        let rel_str = full_path
            .strip_prefix(docs_dir)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");
        if crate::game_logic::is_exception_log(game_schema, &rel_str) {
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
                    let mtime_secs = mtime
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    if min_mtime_epoch_secs.map_or(false, |min_s| mtime_secs < min_s) {
                        continue;
                    }
                    if rel_str.to_lowercase().contains("crash") {
                        has_crash = true;
                    }
                    exceptions.push((mtime, rel_str, full_path));
                }
            }
        }
    }

    if has_crash {
        for (_mtime, _rel, log_path) in &exceptions {
            let _ = crate::commands::logs::read_and_scrub_exception_file(log_path);
        }
        return Some("crash_detected".to_string());
    }
    if exceptions.is_empty() {
        return None;
    }
    exceptions.sort_by(|a, b| b.0.cmp(&a.0));
    for (_mtime, rel_str, log_path) in &exceptions {
        if let Some(scrubbed) = crate::commands::logs::read_and_scrub_exception_file(log_path) {
            if crate::game_logic::is_ignored_lab_exception(game_schema, rel_str, &scrubbed) {
                continue;
            }
            return Some(format!("EXCEPTION DETECTED: {}", scrubbed));
        }
    }
    None
}

pub(super) fn build_session_status(s: &ActiveLabSession) -> LabVerificationStatus {
    let baseline_mb = s.baseline_ram_bytes / (1024 * 1024);
    let current_mb = s.current_ram_bytes / (1024 * 1024);
    let peak_mb = s.peak_ram_bytes / (1024 * 1024);
    let ram_step_percent = if s.baseline_ram_bytes > 0 && s.current_ram_bytes > s.baseline_ram_bytes
    {
        (((s.current_ram_bytes - s.baseline_ram_bytes) * 100) / s.baseline_ram_bytes) as u32
    } else {
        0
    };
    let disk_read_mb = s
        .cumulative_disk_read_bytes
        .saturating_sub(s.baseline_disk_read_bytes)
        / (1024 * 1024);

    LabVerificationStatus {
        active: true,
        dna_hash: s.dna_hash.clone(),
        mod_name: s.mod_name.clone(),
        stage: s.stage.clone(),
        pause_reason: s.pause_reason.clone(),
        tracked_pid: s.tracked_pid,
        baseline_ram_mb: baseline_mb,
        current_ram_mb: current_mb,
        peak_ram_mb: peak_mb,
        ram_step_percent,
        disk_read_mb,
        min_disk_read_mb: s.min_disk_read_mb,
        min_ram_step_percent: s.min_ram_step_percent,
        required_active_seconds: s.required_active_seconds,
        elapsed_active_seconds: s.elapsed_active_seconds,
        remaining_active_seconds: s
            .required_active_seconds
            .saturating_sub(s.elapsed_active_seconds),
        max_idle_seconds: s.max_idle_seconds,
        current_idle_seconds: s.current_idle_seconds,
        is_focused: s.is_focused,
        require_focus: s.require_focus,
        require_save_checkpoint: s.require_save_checkpoint,
        seeded_save_present: s.seeded_save_present,
        verified_save_name: s.verified_save_name.clone(),
        linked_files: s.linked_files.clone(),
        error_log: s.error_log.clone(),
        certificate: s.certificate.clone(),
    }
}
