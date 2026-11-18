#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use crate::utils::*;
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use std::sync::Arc;
#[allow(unused_imports)]
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::{inspect_and_restore::*, snapshot_ops::*};

pub(super) fn copy_file_with_progress<F>(
    src: &Path,
    dest: &Path,
    src_len: u64,
    src_mtime: Option<std::time::SystemTime>,
    set_readonly: bool,
    mut on_chunk: F,
) -> std::io::Result<()>
where
    F: FnMut(u64),
{
    use std::io::{Read, Write};

    // Strict Copy-on-Write (Break-Before-Write): always unlink dest first so we never
    // overwrite a shared hardlink in-place.
    if dest.exists() {
        if let Ok(dm) = std::fs::metadata(dest) {
            if dm.permissions().readonly() {
                let mut p = dm.permissions();
                p.set_readonly(false);
                let _ = std::fs::set_permissions(dest, p);
            }
        }
        let _ = std::fs::remove_file(dest);
    }

    const STREAM_THRESHOLD: u64 = 4 * 1024 * 1024; // 4 MB
    if src_len < STREAM_THRESHOLD {
        std::fs::copy(src, dest)?;
        if let Some(mtime) = src_mtime {
            let _ = filetime::set_file_mtime(dest, filetime::FileTime::from_system_time(mtime));
        }
        if let Ok(dm) = std::fs::metadata(dest) {
            if dm.permissions().readonly() != set_readonly {
                let mut p = dm.permissions();
                p.set_readonly(set_readonly);
                let _ = std::fs::set_permissions(dest, p);
            }
        }
        on_chunk(src_len);
        return Ok(());
    }

    let mut src_file = std::fs::File::open(src)?;
    let mut dest_file = std::fs::File::create(dest)?;
    let mut buf = vec![0u8; 4 * 1024 * 1024]; // 4 MB streaming buffer
    let mut copied: u64 = 0;

    loop {
        let n = src_file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dest_file.write_all(&buf[..n])?;
        copied += n as u64;
        on_chunk(n as u64);
    }

    if copied < src_len {
        on_chunk(src_len - copied);
    }

    let _ = dest_file.flush();
    if let Some(mtime) = src_mtime {
        let _ = dest_file.set_modified(mtime);
    }
    drop(dest_file);

    if let Some(mtime) = src_mtime {
        let _ = filetime::set_file_mtime(dest, filetime::FileTime::from_system_time(mtime));
    }

    if let Ok(dm) = std::fs::metadata(dest) {
        if dm.permissions().readonly() != set_readonly {
            let mut p = dm.permissions();
            p.set_readonly(set_readonly);
            let _ = std::fs::set_permissions(dest, p);
        }
    }

    Ok(())
}

pub(super) fn seal_snapshot_parallel_cow(
    app: &tauri::AppHandle,
    files_to_backup: &[PathBuf],
    source_root: &Path,
    backup_path: &Path,
    previous_backup: &Option<PathBuf>,
    action_label: &str,
) -> (
    u64,
    u64,
    std::collections::HashSet<String>,
    Vec<String>,
    Vec<String>,
) {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    let total = files_to_backup.len();
    let prefix_lower = source_root.to_string_lossy().to_lowercase();

    struct FileJob {
        src_path: PathBuf,
        stripped: PathBuf,
        rel_norm: String,
        dest_path: PathBuf,
    }

    struct ClassifiedJob {
        src_path: PathBuf,
        rel_norm: String,
        dest_path: PathBuf,
        prev_file: Option<PathBuf>,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
        existed_in_prev: bool,
        can_hardlink: bool,
    }

    let mut current_rel_set = std::collections::HashSet::with_capacity(total);
    let mut unique_dirs = std::collections::HashSet::new();
    let mut jobs = Vec::with_capacity(total);

    for file_path in files_to_backup {
        let stripped = if let Ok(rel) = file_path.strip_prefix(source_root) {
            rel.to_path_buf()
        } else {
            let full_str = file_path.to_string_lossy();
            let path_lower = full_str.to_lowercase();
            if path_lower.starts_with(&prefix_lower) {
                let stripped_str = &full_str[prefix_lower.len()..];
                let stripped_str = stripped_str.trim_start_matches(|c| c == '/' || c == '\\');
                PathBuf::from(stripped_str)
            } else {
                PathBuf::from(file_path.file_name().unwrap_or_default())
            }
        };

        let rel_norm = stripped.to_string_lossy().replace('\\', "/");
        if rel_norm.is_empty() || rel_norm.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        current_rel_set.insert(rel_norm.clone());

        let dest_path = backup_path.join(&stripped);
        if let Some(parent) = dest_path.parent() {
            unique_dirs.insert(parent.to_path_buf());
        }

        jobs.push(FileJob {
            src_path: file_path.clone(),
            stripped,
            rel_norm,
            dest_path,
        });
    }

    // Pre-create all unique destination directories once up front
    for dir in unique_dirs {
        let _ = std::fs::create_dir_all(&dir);
    }

    // Fast parallel metadata pre-pass (~15-30ms) to classify hardlink vs physical copy
    // and compute exact byte weights so large multi-GB files never freeze the progress bar at 99%.
    let total_size_atomic = AtomicU64::new(0);
    let planned_copy_bytes_atomic = AtomicU64::new(0);

    let classified_jobs: Vec<ClassifiedJob> = jobs
        .into_par_iter()
        .map(|job| {
            let src_meta = job.src_path.metadata().ok();
            let src_len = src_meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let src_mtime = src_meta.as_ref().and_then(|m| m.modified().ok());
            total_size_atomic.fetch_add(src_len, Ordering::Relaxed);

            let mut existed_in_prev = false;
            let mut can_hardlink = false;
            let mut prev_file_opt = None;

            if let Some(prev) = previous_backup {
                let prev_file = prev.join(&job.stripped);
                if let Ok(prev_meta) = prev_file.metadata() {
                    if prev_meta.is_file() {
                        existed_in_prev = true;
                        if src_len == prev_meta.len() && src_mtime == prev_meta.modified().ok() {
                            can_hardlink = true;
                        }
                    }
                }
                prev_file_opt = Some(prev_file);
            }

            if !can_hardlink {
                planned_copy_bytes_atomic.fetch_add(src_len, Ordering::Relaxed);
            }

            ClassifiedJob {
                src_path: job.src_path,
                rel_norm: job.rel_norm,
                dest_path: job.dest_path,
                prev_file: prev_file_opt,
                src_len,
                src_mtime,
                existed_in_prev,
                can_hardlink,
            }
        })
        .collect();

    const FILE_OP_WEIGHT: u64 = 128 * 1024; // 128 KB baseline weight per file operation
    let planned_copy_bytes = planned_copy_bytes_atomic.load(Ordering::Relaxed);
    let total_work = ((total as u64).saturating_mul(FILE_OP_WEIGHT))
        .saturating_add(planned_copy_bytes)
        .max(1);

    // Separate heavy physical copy jobs (>= 4 MB) from fast hardlink / small copy jobs.
    // Scheduling heavy copy jobs with `.with_max_len(1)` sorted largest-first ensures
    // multi-GB engine archives immediately get dedicated Rayon worker threads at t=0ms
    // instead of sitting in the same chunk.
    let (mut heavy_copy_jobs, regular_jobs): (Vec<ClassifiedJob>, Vec<ClassifiedJob>) =
        classified_jobs
            .into_iter()
            .partition(|j| !j.can_hardlink && j.src_len >= 4 * 1024 * 1024);

    heavy_copy_jobs.sort_by(|a, b| b.src_len.cmp(&a.src_len));

    let diff_size_atomic = AtomicU64::new(0);
    let done_atomic = AtomicUsize::new(0);
    let work_done_atomic = AtomicU64::new(0);
    let last_emit = std::sync::Mutex::new(std::time::Instant::now());
    let added_mutex = std::sync::Mutex::new(Vec::new());
    let updated_mutex = std::sync::Mutex::new(Vec::new());

    let emit_progress = |current_file: &str, force: bool| {
        let should_emit = if force {
            true
        } else if let Ok(mut guard) = last_emit.try_lock() {
            if guard.elapsed() > std::time::Duration::from_millis(40) {
                *guard = std::time::Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        };

        if should_emit {
            let done = done_atomic.load(Ordering::Relaxed);
            let work_done = work_done_atomic.load(Ordering::Relaxed).min(total_work);
            let work_ratio = (work_done as f64 / total_work as f64).clamp(0.0, 1.0);
            let current_pct = if total > 0 {
                ((work_ratio * 99.0).round() as usize).clamp(1, 99)
            } else {
                0
            };
            // Blend displayed file counter with byte-weighted work progress while large files are streaming
            // so the counter never appears stuck near 99% while copying multi-GB engine archives.
            let display_files_done = if planned_copy_bytes > 0 && done < total {
                ((work_ratio * total as f64).floor() as usize).clamp(done.min(1), total.saturating_sub(1))
            } else {
                done
            };
            let _ = app.emit(
                "backup-progress",
                serde_json::json!({
                    "current": current_pct,
                    "total": 100,
                    "files_done": display_files_done,
                    "files_total": total,
                    "current_file": current_file,
                    "action": action_label
                }),
            );
        }
    };

    let process_job = |job: &ClassifiedJob| {
        let mut linked = false;

        if job.can_hardlink {
            if let Some(ref prev_file) = job.prev_file {
                if std::fs::hard_link(prev_file, &job.dest_path).is_ok() {
                    linked = true;
                }
            }
        }

        if !linked {
            let copy_res = copy_file_with_progress(
                &job.src_path,
                &job.dest_path,
                job.src_len,
                job.src_mtime,
                true,
                |chunk_bytes| {
                    if job.can_hardlink {
                        // Fallback if hard_link unexpectedly failed: don't exceed total_work
                    } else {
                        work_done_atomic.fetch_add(chunk_bytes, Ordering::Relaxed);
                    }
                    emit_progress(&job.rel_norm, false);
                },
            );
            if copy_res.is_err() && !job.can_hardlink {
                // Ensure work_done accounts for planned bytes even on error
                work_done_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            }

            diff_size_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            if previous_backup.is_some() {
                if job.existed_in_prev {
                    if let Ok(mut u) = updated_mutex.lock() {
                        u.push(job.rel_norm.clone());
                    }
                } else if let Ok(mut a) = added_mutex.lock() {
                    a.push(job.rel_norm.clone());
                }
            }
        }

        work_done_atomic.fetch_add(FILE_OP_WEIGHT, Ordering::Relaxed);
        let done = done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        emit_progress(&job.rel_norm, done == 1 || done == total);
    };

    rayon::join(
        || {
            heavy_copy_jobs
                .par_iter()
                .with_max_len(1)
                .for_each(process_job);
        },
        || {
            regular_jobs.par_iter().for_each(process_job);
        },
    );

    let added_paths = added_mutex.into_inner().unwrap_or_default();
    let updated_paths = updated_mutex.into_inner().unwrap_or_default();

    (
        total_size_atomic.load(Ordering::Relaxed),
        diff_size_atomic.load(Ordering::Relaxed),
        current_rel_set,
        added_paths,
        updated_paths,
    )
}

pub(super) fn prune_extraneous_target_entries(arc_dir: &Path, target_dir: &Path) {
    if !target_dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            let arc_path = arc_dir.join(&file_name);
            let target_path = e.path();
            if !arc_path.exists() {
                if target_path.is_dir() {
                    let _ = crate::utils::remove_backup_dir_cow_safe(&target_path);
                } else {
                    if let Ok(meta) = std::fs::metadata(&target_path) {
                        if meta.permissions().readonly() {
                            let mut perms = meta.permissions();
                            perms.set_readonly(false);
                            let _ = std::fs::set_permissions(&target_path, perms);
                        }
                    }
                    let _ = std::fs::remove_file(&target_path);
                }
            } else if target_path.is_dir() && arc_path.is_dir() {
                prune_extraneous_target_entries(&arc_path, &target_path);
            }
        }
    }
}

pub(super) fn is_rel_under_protected_dir(rel_norm: &str, protected_dirs: &[String]) -> bool {
    let clean_rel = rel_norm.trim_matches('/');
    protected_dirs.iter().any(|pd| {
        let clean_pd = pd.replace('\\', "/").trim_matches('/').to_string();
        !clean_pd.is_empty()
            && (clean_rel.eq_ignore_ascii_case(&clean_pd)
                || (clean_rel.len() > clean_pd.len()
                    && clean_rel[..clean_pd.len()].eq_ignore_ascii_case(&clean_pd)
                    && clean_rel.as_bytes().get(clean_pd.len()) == Some(&b'/')))
    })
}

pub(super) fn restore_snapshot_parallel_cow(
    app: Option<&tauri::AppHandle>,
    arc: &Path,
    target: &Path,
    action_label: &str,
    protected_additive_dirs: &[String],
    substituted_dirs: &[(String, PathBuf)],
) -> Result<usize, String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    if !target.exists() {
        std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
    }

    // Remove any stray internal snapshot metadata files that an older restore may have copied into target
    for internal_meta in [".size_bytes.txt", ".diff_size_bytes.txt", ".delta_manifest.json"] {
        let stray = target.join(internal_meta);
        if stray.is_file() {
            if let Ok(m) = std::fs::metadata(&stray) {
                if m.permissions().readonly() {
                    let mut p = m.permissions();
                    p.set_readonly(false);
                    let _ = std::fs::set_permissions(&stray, p);
                }
            }
            let _ = std::fs::remove_file(&stray);
        }
    }

    // Prune extraneous files/folders inside each top-level directory present in the snapshot,
    // EXCEPT protected save directories (`save_airgap_targets`), which are ALWAYS restored additively
    // so restoring a partial or older World State snapshot can NEVER delete non-overlapping save slots!
    if let Ok(entries) = std::fs::read_dir(arc) {
        for e in entries.flatten() {
            let file_name = e.file_name();
            let fname_str = file_name.to_string_lossy().to_string();
            if fname_str.starts_with('.') {
                continue;
            }
            if is_rel_under_protected_dir(&fname_str, protected_additive_dirs) {
                continue;
            }
            let arc_sub = e.path();
            let target_sub = target.join(&file_name);
            if arc_sub.is_dir() {
                prune_extraneous_target_entries(&arc_sub, &target_sub);
            }
        }
    }

    struct RawRestoreItem {
        arc_path: PathBuf,
        target_path: PathBuf,
        rel_norm: String,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
    }

    struct ClassifiedRestoreJob {
        arc_path: PathBuf,
        target_path: PathBuf,
        rel_norm: String,
        src_len: u64,
        src_mtime: Option<std::time::SystemTime>,
        needs_copy: bool,
        needs_writable_fix: bool,
    }

    let mut raw_items = Vec::new();
    let mut unique_dirs = std::collections::HashSet::new();
    let substituted_rel_names: Vec<String> =
        substituted_dirs.iter().map(|(rel, _)| rel.clone()).collect();

    for entry in walkdir::WalkDir::new(arc).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let arc_path = entry.path().to_path_buf();
        let Ok(rel) = arc_path.strip_prefix(arc) else {
            continue;
        };
        let rel_norm = rel.to_string_lossy().replace('\\', "/");
        if rel_norm.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        if is_rel_under_protected_dir(&rel_norm, &substituted_rel_names) {
            continue;
        }

        let target_path = target.join(rel);
        if let Some(parent) = target_path.parent() {
            unique_dirs.insert(parent.to_path_buf());
        }

        let meta = entry.metadata().ok();
        let src_len = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let src_mtime = meta.as_ref().and_then(|m| m.modified().ok());

        raw_items.push(RawRestoreItem {
            arc_path,
            target_path,
            rel_norm,
            src_len,
            src_mtime,
        });
    }

    for (sub_rel, sub_src_dir) in substituted_dirs {
        let dest_sub_root = crate::utils::resolve_case_insensitive_path(target, sub_rel);
        for entry in walkdir::WalkDir::new(sub_src_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let arc_path = entry.path().to_path_buf();
            let Ok(inner_rel) = arc_path.strip_prefix(sub_src_dir) else {
                continue;
            };
            let inner_norm = inner_rel.to_string_lossy().replace('\\', "/");
            if inner_norm.split('/').any(|part| part.starts_with('.')) {
                continue;
            }
            let rel_norm = format!("{}/{}", sub_rel.trim_matches('/'), inner_norm);
            let target_path = dest_sub_root.join(inner_rel);
            if let Some(parent) = target_path.parent() {
                unique_dirs.insert(parent.to_path_buf());
            }
            let meta = entry.metadata().ok();
            let src_len = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let src_mtime = meta.as_ref().and_then(|m| m.modified().ok());

            raw_items.push(RawRestoreItem {
                arc_path,
                target_path,
                rel_norm,
                src_len,
                src_mtime,
            });
        }
    }

    for dir in unique_dirs {
        let _ = std::fs::create_dir_all(&dir);
    }

    let total = raw_items.len();
    let planned_copy_bytes_atomic = AtomicU64::new(0);

    let classified_jobs: Vec<ClassifiedRestoreJob> = raw_items
        .into_par_iter()
        .map(|item| {
            let mut needs_copy = true;
            let mut needs_writable_fix = false;

            if let Ok(target_meta) = item.target_path.metadata() {
                if target_meta.is_file() {
                    if item.src_len == target_meta.len()
                        && item.src_mtime == target_meta.modified().ok()
                    {
                        needs_copy = false;
                        if target_meta.permissions().readonly() {
                            needs_writable_fix = true;
                        }
                    }
                }
            }

            if needs_copy {
                planned_copy_bytes_atomic.fetch_add(item.src_len, Ordering::Relaxed);
            }

            ClassifiedRestoreJob {
                arc_path: item.arc_path,
                target_path: item.target_path,
                rel_norm: item.rel_norm,
                src_len: item.src_len,
                src_mtime: item.src_mtime,
                needs_copy,
                needs_writable_fix,
            }
        })
        .collect();

    const FILE_OP_WEIGHT: u64 = 128 * 1024;
    let planned_copy_bytes = planned_copy_bytes_atomic.load(Ordering::Relaxed);
    let total_work = ((total as u64).saturating_mul(FILE_OP_WEIGHT))
        .saturating_add(planned_copy_bytes)
        .max(1);

    let (mut heavy_copy_jobs, regular_jobs): (
        Vec<ClassifiedRestoreJob>,
        Vec<ClassifiedRestoreJob>,
    ) = classified_jobs
        .into_iter()
        .partition(|j| j.needs_copy && j.src_len >= 4 * 1024 * 1024);

    heavy_copy_jobs.sort_by(|a, b| b.src_len.cmp(&a.src_len));

    let done_atomic = AtomicUsize::new(0);
    let work_done_atomic = AtomicU64::new(0);
    let last_emit = std::sync::Mutex::new(std::time::Instant::now());

    let emit_progress = |current_file: &str, force: bool| {
        let should_emit = if force {
            true
        } else if let Ok(mut guard) = last_emit.try_lock() {
            if guard.elapsed() > std::time::Duration::from_millis(40) {
                *guard = std::time::Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        };

        if should_emit {
            let done = done_atomic.load(Ordering::Relaxed);
            let work_done = work_done_atomic.load(Ordering::Relaxed).min(total_work);
            let work_ratio = (work_done as f64 / total_work as f64).clamp(0.0, 1.0);
            let current_pct = if total > 0 {
                ((work_ratio * 99.0).round() as usize).clamp(1, 99)
            } else {
                0
            };
            let display_files_done = if planned_copy_bytes > 0 && done < total {
                ((work_ratio * total as f64).floor() as usize).clamp(done.min(1), total.saturating_sub(1))
            } else {
                done
            };
            if let Some(app_handle) = app {
                let _ = app_handle.emit(
                    "backup-progress",
                    serde_json::json!({
                        "current": current_pct,
                        "total": 100,
                        "files_done": display_files_done,
                        "files_total": total,
                        "current_file": current_file,
                        "action": action_label
                    }),
                );
            }
        }
    };

    let process_job = |job: &ClassifiedRestoreJob| {
        if job.needs_copy {
            let res = copy_file_with_progress(
                &job.arc_path,
                &job.target_path,
                job.src_len,
                job.src_mtime,
                false,
                |chunk_bytes| {
                    work_done_atomic.fetch_add(chunk_bytes, Ordering::Relaxed);
                    emit_progress(&job.rel_norm, false);
                },
            );
            if res.is_err() {
                work_done_atomic.fetch_add(job.src_len, Ordering::Relaxed);
            }
        } else if job.needs_writable_fix {
            if let Ok(meta) = std::fs::metadata(&job.target_path) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&job.target_path, perms);
                }
            }
        }

        work_done_atomic.fetch_add(FILE_OP_WEIGHT, Ordering::Relaxed);
        let done = done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        emit_progress(&job.rel_norm, done == 1 || done == total);
    };

    rayon::join(
        || {
            heavy_copy_jobs
                .par_iter()
                .with_max_len(1)
                .for_each(process_job);
        },
        || {
            regular_jobs.par_iter().for_each(process_job);
        },
    );

    Ok(total)
}
