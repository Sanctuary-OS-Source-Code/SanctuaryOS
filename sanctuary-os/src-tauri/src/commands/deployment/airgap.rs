#[allow(unused_imports)]
use crate::commands::state_ops::*;
#[allow(unused_imports)]
use crate::state::*;
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use std::collections::HashSet;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use super::airgap_journal::*;
#[allow(unused_imports)]
use super::lab_types_and_audio::*;
#[allow(unused_imports)]
use super::lab_save_and_telemetry::*;
#[allow(unused_imports)]
use super::lab_staging::*;
#[allow(unused_imports)]
use super::lab_session::*;
#[allow(unused_imports)]
use super::launcher::*;

pub(crate) fn passive_process_refresh_kind() -> sysinfo::ProcessRefreshKind {
    // Query ONLY passive OS process counters (PROCESS_QUERY_LIMITED_INFORMATION on Windows).
    // Never request cmdline/env/cwd, which would invoke ReadProcessMemory on the game's PEB and trip anti-cheats.
    sysinfo::ProcessRefreshKind::nothing()
        .with_memory()
        .with_disk_usage()
        .with_cpu()
        .with_exe(sysinfo::UpdateKind::OnlyIfNotSet)
}

pub(super) fn collect_candidate_game_exe_names(game_schema: &Option<crate::schema::GameSchema>) -> Vec<String> {
    let mut names = crate::game_logic::get_executable_names(game_schema);
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if !info.exe_name.is_empty()
                    && !names.iter().any(|n| n.eq_ignore_ascii_case(&info.exe_name))
                {
                    names.push(info.exe_name.clone());
                }
            }
        }
    }
    names
}

pub(super) fn collect_active_game_live_roots_norm(
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<String> {
    let mut roots = Vec::new();
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if !info.live_root_norm.is_empty() {
                    roots.push(info.live_root_norm.clone());
                }
            }
        }
    }
    #[cfg(not(test))]
    {
        let saved_live = get_saved_coordinates().live_path;
        if !saved_live.trim().is_empty() {
            let engine_root =
                crate::game_logic::resolve_game_engine_root(&saved_live, game_schema);
            let norm = crate::utils::normalize_path_key(&engine_root);
            if !norm.is_empty() && !roots.contains(&norm) {
                roots.push(norm);
            }
        }
    }
    #[cfg(test)]
    let _ = game_schema;
    roots
}

pub(super) fn process_matches_game_candidates(
    pid_u32: u32,
    proc_info: &sysinfo::Process,
    exe_candidates: &[String],
) -> bool {
    let pname = proc_info.name().to_string_lossy().to_lowercase();
    let is_wrapper = matches!(
        pname.as_str(),
        "reaper"
            | "steam-launch-wrapper"
            | "srt-bwrap"
            | "pressure-vessel-adverb"
            | "proton"
            | "python3"
            | "sh"
            | "bash"
            | "wineserver"
    );
    if is_wrapper {
        return false;
    }

    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(guard) = mutex.lock() {
            if let Some(info) = guard.as_ref() {
                if info.pid == Some(pid_u32) {
                    return true;
                }
            }
        }
    }

    let exe_path_lower = proc_info
        .exe()
        .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase())
        .unwrap_or_default();

    exe_candidates.iter().any(|exe| {
        let clean_exe = exe.trim().replace('\\', "/").to_lowercase();
        let exe_filename = clean_exe.rsplit('/').next().unwrap_or(&clean_exe);
        let stem = exe_filename
            .trim_end_matches(".exe")
            .trim_end_matches(".app");
        if stem.is_empty() {
            return false;
        }
        let stem_15: String = stem.chars().take(15).collect();
        let direct_name_match = pname == exe_filename
            || pname == stem
            || pname.starts_with(stem)
            || (stem_15.len() == 15 && pname == stem_15);
        let exe_path_match = !exe_path_lower.is_empty()
            && (exe_path_lower.ends_with(&format!("/{}", exe_filename))
                || exe_path_lower.ends_with(&format!("/{}", stem)));
        direct_name_match || exe_path_match
    })
}

pub(super) fn process_matches_game_or_live_root(
    pid_u32: u32,
    proc_info: &sysinfo::Process,
    exe_candidates: &[String],
    live_roots_norm: &[String],
    tracked_lab_pid: Option<u32>,
) -> bool {
    if tracked_lab_pid == Some(pid_u32) {
        return true;
    }
    if process_matches_game_candidates(pid_u32, proc_info, exe_candidates) {
        return true;
    }
    if let Some(exe_path) = proc_info.exe() {
        let proc_norm = crate::utils::normalize_path_key(exe_path);
        if live_roots_norm.iter().any(|r| {
            let clean_r = r.trim_end_matches('/');
            !clean_r.is_empty()
                && (proc_norm == clean_r || proc_norm.starts_with(&format!("{}/", clean_r)))
        }) {
            let pname = proc_info.name().to_string_lossy().to_lowercase();
            let is_helper = pname.contains("crash")
                || pname.contains("uninstall")
                || pname.contains("redist")
                || pname.contains("setup")
                || pname.contains("updater")
                || pname.contains("activation");
            if !is_helper {
                return true;
            }
        }
    }
    false
}

pub fn is_any_game_process_running(game_schema: &Option<crate::schema::GameSchema>) -> bool {
    let candidates = collect_candidate_game_exe_names(game_schema);
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let tracked_lab_pid = LAB_SESSION
        .get()
        .and_then(|m| m.try_lock().ok())
        .and_then(|g| g.as_ref().and_then(|s| s.tracked_pid));
    let has_launch_pid = LAST_LAUNCHED_GAME_INFO
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|g| g.as_ref().and_then(|i| i.pid))
        .is_some();

    if candidates.is_empty() && live_roots.is_empty() && tracked_lab_pid.is_none() && !has_launch_pid {
        return false;
    }

    let mut sys = sysinfo::System::new();
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        passive_process_refresh_kind(),
    );
    sys.processes().iter().any(|(pid, proc_info)| {
        process_matches_game_or_live_root(
            pid.as_u32(),
            proc_info,
            &candidates,
            &live_roots,
            tracked_lab_pid,
        )
    })
}

pub(super) fn wait_for_game_exit_before_airgap_swap(
    game_schema: &Option<crate::schema::GameSchema>,
    max_wait_ms: u64,
) -> Result<(), String> {
    let candidates = collect_candidate_game_exe_names(game_schema);
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let tracked_lab_pid = LAB_SESSION
        .get()
        .and_then(|m| m.try_lock().ok())
        .and_then(|g| g.as_ref().and_then(|s| s.tracked_pid));
    let has_tracked_pid = LAST_LAUNCHED_GAME_INFO
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|g| g.as_ref().and_then(|i| i.pid))
        .is_some();

    if candidates.is_empty() && live_roots.is_empty() && tracked_lab_pid.is_none() && !has_tracked_pid {
        return Ok(());
    }

    let mut sys = sysinfo::System::new();
    let started = std::time::Instant::now();
    loop {
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            passive_process_refresh_kind(),
        );
        let still_running = sys.processes().iter().any(|(pid, p)| {
            process_matches_game_or_live_root(
                pid.as_u32(),
                p,
                &candidates,
                &live_roots,
                tracked_lab_pid,
            )
        });
        if !still_running {
            return Ok(());
        }
        if started.elapsed().as_millis() as u64 >= max_wait_ms {
            return Err("lab_err_game_running_saves_locked".to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
}

pub fn is_airgap_active_for_docs(
    docs_dir: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    is_airgap_active_for_docs_with_vault(docs_dir, None, game_schema)
}

pub(super) fn is_airgap_active_for_docs_with_vault(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if !docs_dir.exists() {
        return false;
    }
    let storage = resolve_airgap_storage_paths(docs_dir, explicit_vault_path);
    migrate_legacy_inline_airgap_if_present(docs_dir, &storage, game_schema);

    if storage.primary_airgap_root.join(".airgap_active.json").exists()
        || storage.primary_airgap_root.join(".airgap_journal.json").exists()
        || storage.secondary_vault_mirror.join(".airgap_journal.json").exists()
    {
        return true;
    }
    resolve_deduplicated_save_targets(docs_dir, game_schema)
        .iter()
        .any(|t| {
            crate::utils::resolve_case_insensitive_path(&storage.primary_airgap_root, t).exists()
        })
}

pub fn heal_active_airgap_if_tampered(
    docs_dir: &Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if !docs_dir.exists()
        || !is_airgap_active_for_docs_with_vault(docs_dir, explicit_vault_path, game_schema)
    {
        return false;
    }
    let storage = resolve_airgap_storage_paths(docs_dir, explicit_vault_path);
    let journal_opt = load_airgap_journal(
        &storage.primary_airgap_root,
        Some(storage.secondary_vault_mirror.as_path()),
    );
    let targets = resolve_deduplicated_save_targets(docs_dir, game_schema);
    let mut healed = false;

    let _ = std::fs::create_dir_all(&storage.primary_airgap_root);
    set_hidden_dir_attribute(&storage.primary_airgap_root, true);

    for target_name in &targets {
        let live_target = crate::utils::resolve_case_insensitive_path(docs_dir, target_name);
        let airgap_target =
            crate::utils::resolve_case_insensitive_path(&storage.primary_airgap_root, target_name);

        // Ensure native save directory in docs_dir exists if someone deleted it mid-test (zero foreign marker files!)
        if !live_target.exists() {
            let _ = std::fs::create_dir_all(&live_target);
            healed = true;
        }

        // Verify primary airgap against journal & self-heal from secondary immortal Vault mirror if tampered
        if let Some(ref journal) = journal_opt {
            if let Some(tj) = journal
                .targets
                .iter()
                .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            {
                if !tj.manifest.is_empty()
                    && verify_save_tree_manifest(&airgap_target, &tj.manifest).is_err()
                {
                    let ext_target = crate::utils::resolve_case_insensitive_path(
                        &storage.secondary_vault_mirror,
                        target_name,
                    );
                    if ext_target.exists()
                        && verify_save_tree_manifest(&ext_target, &tj.manifest).is_ok()
                    {
                        set_tree_readonly(&airgap_target, false);
                        if copy_manifest_entries_verified(&ext_target, &airgap_target, &tj.manifest)
                            .is_ok()
                        {
                            set_tree_readonly(&airgap_target, true);
                            healed = true;
                        }
                    }
                } else if airgap_target.exists() {
                    set_tree_readonly(&airgap_target, true);
                }
            }
        }
    }

    healed
}

pub(super) fn copy_manifest_entries_verified(
    src_root: &Path,
    dst_root: &Path,
    manifest: &[SaveFileManifestEntry],
) -> Result<(), String> {
    if manifest.is_empty() {
        return std::fs::create_dir_all(dst_root).map_err(|e| e.to_string());
    }
    std::fs::create_dir_all(dst_root).map_err(|e| e.to_string())?;
    let dst_allowed = [dst_root.to_path_buf()];
    for item in manifest {
        let rel_os = item.rel_path.replace('/', std::path::MAIN_SEPARATOR_STR);
        let src_file = src_root.join(&rel_os);
        let dst_file = dst_root.join(&rel_os);
        crate::utils::ensure_strict_descendant_of_roots(&dst_file, &dst_allowed)?;
        if let Some(parent) = dst_file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if dst_file.exists() {
            if let Ok(meta) = std::fs::metadata(&dst_file) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&dst_file, perms);
                }
            }
        }
        {
            use std::io::Write;
            let mut reader = std::fs::File::open(&src_file).map_err(|e| e.to_string())?;
            let mut writer = std::fs::File::create(&dst_file).map_err(|e| e.to_string())?;
            let copied = std::io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
            if copied != item.size_bytes {
                return Err(format!(
                    "Incomplete manifest heal copy for '{}' ({} != {}).",
                    item.rel_path, copied, item.size_bytes
                ));
            }
            writer.flush().map_err(|e| e.to_string())?;
            writer.sync_all().map_err(|e| e.to_string())?;
        }
    }
    verify_save_tree_manifest(dst_root, manifest)
}

pub fn recover_stranded_airgap_if_needed(
    docs_dir: &Path,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<AirgapRecoveryReport, String> {
    let resolved_docs = resolve_docs_root(&docs_dir.to_string_lossy(), game_schema);
    let vault_opt = if vault_path.trim().is_empty() {
        None
    } else {
        Some(vault_path)
    };
    if !is_airgap_active_for_docs_with_vault(&resolved_docs, vault_opt, game_schema) {
        return Ok(AirgapRecoveryReport {
            recovered: false,
            healed_from_vault_mirror: false,
            restored_targets: 0,
            message: String::new(),
        });
    }

    let storage = resolve_airgap_storage_paths(&resolved_docs, vault_opt);
    let marker_file = storage.primary_airgap_root.join(".airgap_active.json");
    let current_instance = get_runtime_instance_id();

    let marker_instance = std::fs::read_to_string(&marker_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            v.get("instance_id")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        });
    let journal = load_airgap_journal(
        &storage.primary_airgap_root,
        Some(storage.secondary_vault_mirror.as_path()),
    );
    let journal_instance = journal.as_ref().map(|j| j.instance_id.clone());

    let is_owned_by_current_instance = marker_instance
        .as_deref()
        .or(journal_instance.as_deref())
        .map(|id| id == current_instance)
        .unwrap_or(false);

    let lab_session_active = LAB_SESSION
        .get()
        .and_then(|m| m.lock().ok())
        .map(|g| g.is_some())
        .unwrap_or(false);

    // Only auto-recover when the airgap belongs to a previous crashed/closed OS/app session
    // OR an interrupted mid-evacuation/mid-restore journal with no active Lab session.
    let interrupted_journal_phase = journal
        .as_ref()
        .map(|j| j.phase == "EVACUATING" || j.phase == "RESTORING")
        .unwrap_or(false);

    if is_owned_by_current_instance && (lab_session_active || !interrupted_journal_phase) {
        return Ok(AirgapRecoveryReport {
            recovered: false,
            healed_from_vault_mirror: false,
            restored_targets: 0,
            message: String::new(),
        });
    }

    // Never collide with a running game process during recovery
    if is_any_game_process_running(game_schema) {
        return Err("lab_err_game_running_saves_locked".to_string());
    }

    let healed_from_vault_mirror =
        heal_active_airgap_if_tampered(&resolved_docs, vault_opt, game_schema);
    let targets_count = resolve_deduplicated_save_targets(&resolved_docs, game_schema).len();
    let msg = apply_save_airgap_with_vault(
        &resolved_docs.to_string_lossy(),
        vault_opt,
        false,
        game_schema,
    )?;

    Ok(AirgapRecoveryReport {
        recovered: true,
        healed_from_vault_mirror,
        restored_targets: targets_count,
        message: msg,
    })
}

pub fn apply_save_airgap(
    docs_path: &str,
    enable: bool,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    apply_save_airgap_with_vault(docs_path, None, enable, game_schema)
}

pub fn apply_save_airgap_with_vault(
    docs_path: &str,
    explicit_vault_path: Option<&str>,
    enable: bool,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    let docs_dir = resolve_docs_root(docs_path, game_schema);
    if !docs_dir.exists() {
        return Ok("Documents directory not found".to_string());
    }
    if !crate::utils::is_safe_user_file_path(&docs_dir.join("__sanctuary_probe__")) {
        return Err("Refused to airgap unsafe system root path.".to_string());
    }

    let targets = resolve_deduplicated_save_targets(&docs_dir, game_schema);
    if targets.is_empty() {
        return Ok("No save airgap targets configured in schema".to_string());
    }

    // Refuse to swap save directories while the game executable is running and holding save locks
    wait_for_game_exit_before_airgap_swap(game_schema, if enable { 1500 } else { 4500 })?;

    let storage = resolve_airgap_storage_paths(&docs_dir, explicit_vault_path);
    migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, game_schema);

    let airgap_root = &storage.primary_airgap_root;
    let sandbox_root = &storage.sandbox_root;
    let ext_vault_dir = &storage.secondary_vault_mirror;
    let marker_file = airgap_root.join(".airgap_active.json");
    let existing_journal = load_airgap_journal(airgap_root, Some(ext_vault_dir.as_path()));
    let docs_allowed = [docs_dir.clone()];

    if enable {
        std::fs::create_dir_all(airgap_root)
            .map_err(|e| format!("Failed creating airgap root {:?}: {}", airgap_root, e))?;
        std::fs::create_dir_all(sandbox_root)
            .map_err(|e| format!("Failed creating sandbox root {:?}: {}", sandbox_root, e))?;
        std::fs::create_dir_all(ext_vault_dir)
            .map_err(|e| format!("Failed creating vault save mirror {:?}: {}", ext_vault_dir, e))?;
        if let Some(p) = airgap_root.parent() {
            set_hidden_dir_attribute(p, true);
        }
        if let Some(p) = sandbox_root.parent() {
            set_hidden_dir_attribute(p, true);
        }
        if let Some(p) = ext_vault_dir.parent() {
            set_hidden_dir_attribute(p, true);
        }

        let already_airgapped = marker_file.exists()
            || existing_journal
                .as_ref()
                .map(|j| j.phase == "ACTIVE" || j.phase == "EVACUATING")
                .unwrap_or(false);

        let mut target_journals: Vec<AirgapTargetJournal> = Vec::new();

        // Phase 1: Build manifests & write immortal additive Secondary Vault Mirror + EVACUATING journal BEFORE moving live saves
        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            if let Some(prev_tj) = existing_journal.as_ref().and_then(|j| {
                j.targets
                    .iter()
                    .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            }) {
                if already_airgapped || airgap_target.exists() {
                    target_journals.push(prev_tj.clone());
                    continue;
                }
            }

            if airgap_target.exists() {
                let manifest = build_save_tree_manifest(&airgap_target)?;
                if !manifest.is_empty() {
                    set_tree_readonly(&ext_target, false);
                    copy_save_tree_verified(&airgap_target, &ext_target)?;
                    verify_save_tree_manifest(&ext_target, &manifest)?;
                    set_tree_readonly(&ext_target, true);
                }
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: true,
                    manifest,
                });
            } else if live_target.exists() {
                let manifest = build_save_tree_manifest(&live_target)?;
                // IMMORTAL ADDITIVE VAULT RULE:
                // Never wipe or overwrite existing files in `secondary_vault_mirror` when live_target is empty;
                // when non-empty, merge/update verified live saves into `secondary_vault_mirror`!
                if !manifest.is_empty() {
                    set_tree_readonly(&ext_target, false);
                    copy_save_tree_verified(&live_target, &ext_target)?;
                    verify_save_tree_manifest(&ext_target, &manifest)?;
                    set_tree_readonly(&ext_target, true);
                }
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: true,
                    manifest,
                });
            } else {
                target_journals.push(AirgapTargetJournal {
                    target_name: target_name.clone(),
                    had_live_target: false,
                    manifest: Vec::new(),
                });
            }
        }

        let mut journal = AirgapJournal {
            version: 3,
            phase: "EVACUATING".to_string(),
            instance_id: get_runtime_instance_id().to_string(),
            created_at_epoch: current_epoch_secs(),
            docs_dir: docs_dir.to_string_lossy().to_string(),
            vault_mirror_dir: ext_vault_dir.to_string_lossy().to_string(),
            targets: target_journals,
        };
        persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()))?;

        // Phase 2: Evacuate live save folders into external primary_airgap_root and swap in isolated sandbox folders
        for tj in &journal.targets {
            let target_name = &tj.target_name;
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let sandbox_target =
                crate::utils::resolve_case_insensitive_path(sandbox_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            let was_active_phase = existing_journal
                .as_ref()
                .map(|j| j.phase == "ACTIVE")
                .unwrap_or(false)
                || marker_file.exists();

            if !airgap_target.exists() {
                let mut healed_from_ext = false;
                if was_active_phase
                    && ext_target.exists()
                    && (tj.manifest.is_empty()
                        || verify_save_tree_manifest(&ext_target, &tj.manifest).is_ok())
                {
                    set_tree_readonly(&airgap_target, false);
                    copy_manifest_entries_verified(&ext_target, &airgap_target, &tj.manifest)?;
                    set_tree_readonly(&airgap_target, true);
                    healed_from_ext = true;
                }

                if !healed_from_ext && live_target.exists() && !was_active_phase {
                    if let Some(parent) = airgap_target.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    if std::fs::rename(&live_target, &airgap_target).is_err() {
                        copy_save_tree_verified(&live_target, &airgap_target)?;
                        verify_save_tree_manifest(&airgap_target, &tj.manifest)?;
                        remove_save_tree_strict(&live_target, &docs_allowed)?;
                    } else {
                        verify_save_tree_manifest(&airgap_target, &tj.manifest)?;
                    }
                    set_tree_readonly(&airgap_target, true);
                }
            } else {
                set_tree_readonly(&airgap_target, true);
            }

            let save_exts = resolve_save_extensions(game_schema);
            let allow_dir_slots = is_directory_save_mode(&save_exts);
            let mut state_meta = load_sandbox_state_meta(sandbox_root);

            // If Golden Homestead Baseline (`sandbox_target`) is empty/missing and was originally cloned
            // from a known live save slot, self-heal `sandbox_target` from the verified airgapped save!
            let mut golden_saves = list_saves_in_dir(&sandbox_target, &save_exts);
            if golden_saves.is_empty() && !state_meta.fresh_sandbox_armed {
                if let Some(ref src_name) = state_meta.source_live_save_name {
                    let healed_src = find_named_save_in_dir(&airgap_target, src_name, allow_dir_slots)
                        .or_else(|| find_named_save_in_dir(&ext_target, src_name, allow_dir_slots));
                    if let Some(src_path) = healed_src {
                        set_tree_readonly(&sandbox_target, false);
                        if copy_save_item_into_dir(&src_path, &sandbox_target, false).is_ok() {
                            set_tree_readonly(&sandbox_target, true);
                            golden_saves = list_saves_in_dir(&sandbox_target, &save_exts);
                        }
                    }
                }
            }

            let live_saves_safely_airgapped = tj.manifest.is_empty()
                || (airgap_target.exists()
                    && verify_save_tree_manifest(&airgap_target, &tj.manifest).is_ok());

            if (!golden_saves.is_empty() || state_meta.fresh_sandbox_armed) && live_saves_safely_airgapped {
                // Keep `sandbox_target` untouched & read-only, and mount a fresh disposable working copy in `live_target`!
                sync_golden_sandbox_to_working_dir(
                    &sandbox_target,
                    &live_target,
                    &docs_allowed,
                    state_meta.selected_save_name.as_deref(),
                    state_meta.fresh_sandbox_armed,
                    &save_exts,
                )?;
            } else {
                std::fs::create_dir_all(&live_target).map_err(|e| e.to_string())?;
                set_tree_readonly(&live_target, false);
                if !golden_saves.is_empty() {
                    set_tree_readonly(&sandbox_target, true);
                }
            }

            let effective_saves = if !golden_saves.is_empty() {
                golden_saves
            } else {
                list_saves_in_dir(&live_target, &save_exts)
            };
            if let Some(first_save) = effective_saves.first() {
                let existing_valid = state_meta
                    .selected_save_name
                    .as_deref()
                    .map(|m| {
                        effective_saves
                            .iter()
                            .any(|s| s.file_name.eq_ignore_ascii_case(m))
                    })
                    .unwrap_or(false);
                if !existing_valid {
                    state_meta.selected_save_name = Some(first_save.file_name.clone());
                }
                state_meta.fresh_sandbox_armed = false;
                let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
            } else if state_meta.selected_save_name.is_some() {
                state_meta.selected_save_name = None;
                let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
            }
        }

        journal.phase = "ACTIVE".to_string();
        persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()))?;

        let marker_payload = serde_json::json!({
            "active": true,
            "instance_id": get_runtime_instance_id(),
            "targets": targets,
            "vault_mirror_dir": journal.vault_mirror_dir,
        })
        .to_string();
        crate::utils::atomic_write_bytes(&marker_file, marker_payload.as_bytes())?;

        Ok("Saves physically airgapped and mirrored".to_string())
    } else {
        // Restore path (enable = false)
        if let Some(mut journal) = existing_journal.clone() {
            journal.phase = "RESTORING".to_string();
            let _ = persist_airgap_journal(&journal, airgap_root, Some(ext_vault_dir.as_path()));
        }

        let airgap_allowed = [airgap_root.clone()];
        let save_exts = resolve_save_extensions(game_schema);
        let allow_dir_slots = is_directory_save_mode(&save_exts);

        for target_name in &targets {
            let live_target = crate::utils::resolve_case_insensitive_path(&docs_dir, target_name);
            let airgap_target =
                crate::utils::resolve_case_insensitive_path(airgap_root, target_name);
            let sandbox_target =
                crate::utils::resolve_case_insensitive_path(sandbox_root, target_name);
            let ext_target =
                crate::utils::resolve_case_insensitive_path(ext_vault_dir, target_name);

            let target_journal = existing_journal.as_ref().and_then(|j| {
                j.targets
                    .iter()
                    .find(|t| t.target_name.eq_ignore_ascii_case(target_name))
            });
            let expected_manifest: &[SaveFileManifestEntry] = target_journal
                .map(|tj| tj.manifest.as_slice())
                .unwrap_or(&[]);
            let expected_non_empty = !expected_manifest.is_empty();

            // 1. Self-heal primary airgap_target from immortal secondary .lab_save_vault if missing or tampered
            let local_airgap_ok = airgap_target.exists()
                && (!expected_non_empty
                    || verify_save_tree_manifest(&airgap_target, expected_manifest).is_ok());

            if !local_airgap_ok
                && ext_target.exists()
                && (!expected_non_empty
                    || verify_save_tree_manifest(&ext_target, expected_manifest).is_ok())
            {
                set_tree_readonly(&airgap_target, false);
                if expected_non_empty {
                    copy_manifest_entries_verified(&ext_target, &airgap_target, expected_manifest)?;
                } else {
                    std::fs::create_dir_all(&airgap_target).map_err(|e| e.to_string())?;
                }
            }

            // 2. Safety check: if journal recorded live saves, refuse to move/clear live_target unless
            // we have a verified airgap_target OR live_target already holds the exact live saves (crash mid-restore).
            if expected_non_empty && !airgap_target.exists() {
                if verify_save_tree_manifest(&live_target, expected_manifest).is_ok() {
                    set_tree_readonly(&live_target, false);
                    continue;
                }
                return Err(format!(
                    "Refused to overwrite '{}' because neither primary airgap nor Vault save mirror passed verification.",
                    target_name
                ));
            }

            // Helper closure: rewind/discard mutated working save if a Golden Homestead Baseline already
            // exists in `sandbox_target`; otherwise promote only corruption-audited initial saves once!
            let reconcile_disposable_sandbox = |live_working_dir: &Path| -> Result<(), String> {
                let mut state_meta = load_sandbox_state_meta(sandbox_root);
                let has_golden_baseline = !list_saves_in_dir(&sandbox_target, &save_exts).is_empty();
                if has_golden_baseline {
                    // Discard mutated/saved disposable working copy so the Homestead test save NEVER corrupts!
                    remove_save_tree_strict(live_working_dir, &docs_allowed)?;
                    if let Some(ref src_name) = state_meta.source_live_save_name {
                        let baseline_slot =
                            find_named_save_in_dir(&sandbox_target, src_name, allow_dir_slots);
                        let needs_refresh = match baseline_slot {
                            Some(ref p) if p.is_file() => audit_save_file_corruption(p, None).is_err(),
                            Some(ref p) if p.is_dir() => compute_dir_save_slot_stats(p).is_none(),
                            _ => true,
                        };
                        if needs_refresh {
                            if let Some(clean_src) =
                                find_named_save_in_dir(&airgap_target, src_name, allow_dir_slots)
                                    .or_else(|| {
                                        find_named_save_in_dir(&ext_target, src_name, allow_dir_slots)
                                    })
                            {
                                set_tree_readonly(&sandbox_target, false);
                                let _ = copy_save_item_into_dir(&clean_src, &sandbox_target, false);
                            }
                        }
                    }
                    set_tree_readonly(&sandbox_target, true);
                } else {
                    // Initial unseeded Homestead world creation: promote only non-corrupted saves into Golden Baseline!
                    promote_valid_saves_into_golden_sandbox(
                        live_working_dir,
                        &sandbox_target,
                        &save_exts,
                    )?;
                    remove_save_tree_strict(live_working_dir, &docs_allowed)?;
                    if let Some(first_promoted) = list_saves_in_dir(&sandbox_target, &save_exts).first() {
                        state_meta.selected_save_name = Some(first_promoted.file_name.clone());
                        state_meta.fresh_sandbox_armed = false;
                        let _ = save_sandbox_state_meta(sandbox_root, &state_meta);
                    }
                }
                Ok(())
            };

            if airgap_target.exists() {
                if expected_non_empty {
                    verify_save_tree_manifest(&airgap_target, expected_manifest)?;
                }
                set_tree_readonly(&airgap_target, false);

                if live_target.exists() {
                    let is_sandbox = existing_journal.is_some() || marker_file.exists();
                    if is_sandbox {
                        reconcile_disposable_sandbox(&live_target)?;
                    } else {
                        // Unexpected un-marked live files appeared alongside airgap: merge non-destructively into live_target
                        copy_save_tree_verified(&airgap_target, &live_target)?;
                        if expected_non_empty {
                            verify_save_tree_manifest(&live_target, expected_manifest)?;
                        }
                        remove_save_tree_strict(&airgap_target, &airgap_allowed)?;
                    }
                }

                if airgap_target.exists() {
                    if let Some(parent) = live_target.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    if std::fs::rename(&airgap_target, &live_target).is_err() {
                        copy_save_tree_verified(&airgap_target, &live_target)?;
                        if expected_non_empty {
                            verify_save_tree_manifest(&live_target, expected_manifest)?;
                        }
                        remove_save_tree_strict(&airgap_target, &airgap_allowed)?;
                    } else if expected_non_empty {
                        verify_save_tree_manifest(&live_target, expected_manifest)?;
                    }
                }
            } else if target_journal.is_some() && live_target.exists() {
                // Player originally had no live save files before entering the Lab:
                // reconcile disposable sandbox & recreate an empty writable live_target directory!
                reconcile_disposable_sandbox(&live_target)?;
            }

            // Always guarantee live_target directory exists and is writable on exit
            let _ = std::fs::create_dir_all(&live_target);
            set_tree_readonly(&live_target, false);
            if expected_non_empty {
                verify_save_tree_manifest(&live_target, expected_manifest)?;
            }
        }

        // Remove active airgap journal markers ONLY — NEVER delete `secondary_vault_mirror` save backups!
        let _ = std::fs::remove_file(&marker_file);
        let _ = std::fs::remove_file(airgap_root.join(".airgap_journal.json"));
        let _ = std::fs::remove_file(ext_vault_dir.join(".airgap_journal.json"));
        set_tree_readonly(ext_vault_dir, true);

        Ok("Live saves verified and restored from airgap".to_string())
    }
}

#[tauri::command]
pub async fn recover_interrupted_lab_airgap(
    docs_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<AirgapRecoveryReport, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        recover_stranded_airgap_if_needed(&docs_dir, &vault_path, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_lab_test_save_status(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        Ok(compute_lab_test_save_status(&docs_dir, &game_schema))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn copy_save_item_into_dir(
    src_path: &Path,
    dst_dir: &Path,
    touch_now: bool,
) -> Result<String, String> {
    if !src_path.exists() {
        return Err(format!("Source save {:?} does not exist.", src_path));
    }
    std::fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;
    let dst_allowed = [dst_dir.to_path_buf()];
    let clean_fname = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Invalid save filename.".to_string())?;
    let dst_path = dst_dir.join(&clean_fname);
    crate::utils::ensure_strict_descendant_of_roots(&dst_path, &dst_allowed)?;

    if src_path.is_dir() {
        set_tree_readonly(&dst_path, false);
        copy_save_tree_verified(src_path, &dst_path)?;
        set_tree_readonly(&dst_path, false);
    } else {
        if dst_path.exists() {
            if let Ok(meta) = std::fs::metadata(&dst_path) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&dst_path, perms);
                }
            }
        }
        {
            use std::io::Write;
            let mut reader = std::fs::File::open(src_path).map_err(|e| e.to_string())?;
            let mut writer = std::fs::File::create(&dst_path).map_err(|e| e.to_string())?;
            let copied = std::io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
            let expected_len = std::fs::metadata(src_path).map_err(|e| e.to_string())?.len();
            if copied != expected_len {
                return Err(format!(
                    "Incomplete save copy for '{}' ({} of {} bytes).",
                    clean_fname, copied, expected_len
                ));
            }
            writer.flush().map_err(|e| e.to_string())?;
            writer.sync_all().map_err(|e| e.to_string())?;
        }
        if touch_now {
            let now_ft = filetime::FileTime::from_system_time(std::time::SystemTime::now());
            let _ = filetime::set_file_mtime(&dst_path, now_ft);
        } else if let Ok(src_meta) = std::fs::metadata(src_path) {
            if let Ok(mtime) = src_meta.modified() {
                let _ = filetime::set_file_mtime(&dst_path, filetime::FileTime::from_system_time(mtime));
            }
        }
        // Also copy any rolling companion backup revisions (e.g. "<clean_fname>.*") in the same source folder
        if let Some(src_parent) = src_path.parent() {
            let prefix_lower = format!("{}.", clean_fname.to_lowercase());
            if let Ok(entries) = std::fs::read_dir(src_parent) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if !ep.is_file() {
                        continue;
                    }
                    let ename = entry.file_name().to_string_lossy().to_string();
                    if ename.to_lowercase().starts_with(&prefix_lower)
                        && !is_temporary_or_internal_save_artifact(&ename.to_lowercase())
                    {
                        let comp_dst = dst_dir.join(&ename);
                        if crate::utils::ensure_strict_descendant_of_roots(&comp_dst, &dst_allowed)
                            .is_ok()
                        {
                            if comp_dst.exists() {
                                if let Ok(m) = std::fs::metadata(&comp_dst) {
                                    let mut p = m.permissions();
                                    p.set_readonly(false);
                                    let _ = std::fs::set_permissions(&comp_dst, p);
                                }
                            }
                            let _ = std::fs::copy(&ep, &comp_dst);
                        }
                    }
                }
            }
        }
    }
    Ok(clean_fname)
}

#[tauri::command]
pub async fn configure_lab_test_save(
    docs_path: String,
    mode: String,
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<LabTestSaveStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        configure_lab_test_save_internal(
            &docs_path,
            &mode,
            source_save_name,
            external_file_paths,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn collect_external_save_input_paths(
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    if let Some(list) = external_file_paths {
        for raw in list {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                let key = crate::utils::normalize_path_key(&p);
                if seen.insert(key) {
                    paths.push(p);
                }
            }
        }
    }
    if let Some(raw_lines) = source_save_name {
        for line in raw_lines.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                let key = crate::utils::normalize_path_key(&p);
                if seen.insert(key) {
                    paths.push(p);
                }
            }
        }
    }
    paths
}

pub(super) fn configure_lab_test_save_internal(
    docs_path: &str,
    mode: &str,
    source_save_name: Option<String>,
    external_file_paths: Option<Vec<String>>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<LabTestSaveStatus, String> {
    let docs_dir = resolve_docs_root(docs_path, game_schema);
    let targets = resolve_deduplicated_save_targets(&docs_dir, game_schema);
    let primary_save_rel = targets
        .first()
        .cloned()
        .ok_or_else(|| "No save airgap target configured in active GameSchema.".to_string())?;
    let save_exts = resolve_save_extensions(game_schema);
    let allow_dir_slots = is_directory_save_mode(&save_exts);

    let storage = resolve_airgap_storage_paths(&docs_dir, None);
    migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, game_schema);
    let airgap_active = is_airgap_active_for_docs(&docs_dir, game_schema);

    let game_running = is_any_game_process_running(game_schema);
    if mode != "select_sandbox_save" && game_running {
        return Err("lab_err_game_running_saves_locked".to_string());
    }

    let sandbox_saves_dir =
        crate::utils::resolve_case_insensitive_path(&storage.sandbox_root, &primary_save_rel);
    let working_saves_dir =
        crate::utils::resolve_case_insensitive_path(&docs_dir, &primary_save_rel);
    let live_saves_dir = if airgap_active {
        crate::utils::resolve_case_insensitive_path(
            &storage.primary_airgap_root,
            &primary_save_rel,
        )
    } else {
        working_saves_dir.clone()
    };
    let vault_mirror_dir = crate::utils::resolve_case_insensitive_path(
        &storage.secondary_vault_mirror,
        &primary_save_rel,
    );

    if airgap_active
        && list_saves_in_dir(&sandbox_saves_dir, &save_exts).is_empty()
        && !load_sandbox_state_meta(&storage.sandbox_root).fresh_sandbox_armed
        && working_saves_dir.exists()
    {
        let _ = promote_valid_saves_into_golden_sandbox(
            &working_saves_dir,
            &sandbox_saves_dir,
            &save_exts,
        );
    }

    let _ = std::fs::create_dir_all(&sandbox_saves_dir);
    set_tree_readonly(&sandbox_saves_dir, false);
    let sandbox_allowed = [sandbox_saves_dir.clone()];

    let refresh_airgap_journal_if_active = || -> Result<(), String> {
        if !airgap_active {
            return Ok(());
        }
        if let Some(mut journal) = load_airgap_journal(
            &storage.primary_airgap_root,
            Some(storage.secondary_vault_mirror.as_path()),
        ) {
            let updated_manifest = build_save_tree_manifest(&live_saves_dir)?;
            if let Some(tj) = journal
                .targets
                .iter_mut()
                .find(|t| t.target_name.eq_ignore_ascii_case(&primary_save_rel))
            {
                tj.had_live_target = true;
                tj.manifest = updated_manifest;
            }
            set_tree_readonly(&live_saves_dir, true);
            persist_airgap_journal(
                &journal,
                &storage.primary_airgap_root,
                Some(storage.secondary_vault_mirror.as_path()),
            )?;
        }
        Ok(())
    };

    match mode {
        "reset_for_fresh_save" => {
            if airgap_active
                && load_airgap_journal(
                    &storage.primary_airgap_root,
                    Some(storage.secondary_vault_mirror.as_path()),
                )
                .is_none()
            {
                return Err(
                    "Refused to reset active sandbox without a verified Save Airgap journal."
                        .to_string(),
                );
            }

            for entry in walkdir::WalkDir::new(&sandbox_saves_dir)
                .max_depth(2)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if matches_save_filename(&fname, &save_exts)
                        && crate::utils::ensure_strict_descendant_of_roots(
                            entry.path(),
                            &sandbox_allowed,
                        )
                        .is_ok()
                    {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
            if allow_dir_slots {
                if let Ok(entries) = std::fs::read_dir(&sandbox_saves_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if p.is_dir()
                            && !name.starts_with('.')
                            && crate::utils::ensure_strict_descendant_of_roots(
                                &p,
                                &sandbox_allowed,
                            )
                            .is_ok()
                        {
                            set_tree_readonly(&p, false);
                            let _ = std::fs::remove_dir_all(&p);
                        }
                    }
                }
            }
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: None,
                    fresh_sandbox_armed: true,
                    source_live_save_name: None,
                },
            )?;
        }
        "select_sandbox_save" => {
            let target_name = source_save_name
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "No sandbox save selected.".to_string())?;
            let prev_meta = load_sandbox_state_meta(&storage.sandbox_root);
            if let Some(slot_path) =
                find_named_save_in_dir(&sandbox_saves_dir, &target_name, allow_dir_slots)
            {
                touch_save_slot_mtime_now(&slot_path);
            }
            let preserved_live_source = prev_meta
                .source_live_save_name
                .filter(|src| src.eq_ignore_ascii_case(&target_name));
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: Some(target_name),
                    fresh_sandbox_armed: false,
                    source_live_save_name: preserved_live_source,
                },
            )?;
        }
        "copy_live_save" => {
            let target_name = source_save_name
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    list_saves_in_dir(&live_saves_dir, &save_exts)
                        .first()
                        .map(|s| s.file_name.clone())
                })
                .ok_or_else(|| "No save slot selected or available in live saves.".to_string())?;

            let src_path =
                find_named_save_in_dir(&live_saves_dir, &target_name, allow_dir_slots)
                    .ok_or_else(|| {
                        format!("Could not locate save '{}' in live saves.", target_name)
                    })?;

            let clean_fname = copy_save_item_into_dir(&src_path, &sandbox_saves_dir, true)?;
            save_sandbox_state_meta(
                &storage.sandbox_root,
                &SandboxStateMeta {
                    selected_save_name: Some(clean_fname.clone()),
                    fresh_sandbox_armed: false,
                    source_live_save_name: Some(clean_fname),
                },
            )?;
        }
        "import_external_save" => {
            let paths = collect_external_save_input_paths(source_save_name, external_file_paths);
            if paths.is_empty() {
                return Err("No external save file selected.".to_string());
            }
            let mut last_copied_name: Option<String> = None;
            for p in paths {
                if !crate::utils::is_safe_user_file_path(&p) {
                    return Err("Selected path is outside safe user file boundaries.".to_string());
                }
                if p.is_dir() && !allow_dir_slots {
                    copy_save_tree_verified(&p, &sandbox_saves_dir)?;
                    if let Some(newest) = list_saves_in_dir(&p, &save_exts).first() {
                        last_copied_name = Some(newest.file_name.clone());
                    }
                } else {
                    let fname = copy_save_item_into_dir(&p, &sandbox_saves_dir, true)?;
                    last_copied_name = Some(fname);
                }
            }
            if let Some(sel) = last_copied_name {
                save_sandbox_state_meta(
                    &storage.sandbox_root,
                    &SandboxStateMeta {
                        selected_save_name: Some(sel),
                        fresh_sandbox_armed: false,
                        source_live_save_name: None,
                    },
                )?;
            }
        }
        "import_to_live_saves" => {
            let paths = collect_external_save_input_paths(source_save_name, external_file_paths);
            if paths.is_empty() {
                return Err("No external save file selected.".to_string());
            }
            std::fs::create_dir_all(&live_saves_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&live_saves_dir, false);
            std::fs::create_dir_all(&vault_mirror_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&vault_mirror_dir, false);

            let mut first_sandbox_candidate: Option<PathBuf> = None;
            for p in &paths {
                if !crate::utils::is_safe_user_file_path(p) {
                    return Err("Selected path is outside safe user file boundaries.".to_string());
                }
                if p.is_dir() && !allow_dir_slots {
                    copy_save_tree_verified(p, &live_saves_dir)?;
                    let _ = copy_save_tree_verified(p, &vault_mirror_dir);
                    if first_sandbox_candidate.is_none() {
                        if let Some(newest) = list_saves_in_dir(&live_saves_dir, &save_exts).first() {
                            let cand = live_saves_dir.join(&newest.file_name);
                            if cand.exists() {
                                first_sandbox_candidate = Some(cand);
                            }
                        }
                    }
                } else {
                    let _ = copy_save_item_into_dir(p, &live_saves_dir, false)?;
                    let _ = copy_save_item_into_dir(p, &vault_mirror_dir, false);
                    if first_sandbox_candidate.is_none() {
                        first_sandbox_candidate = Some(p.clone());
                    }
                }
            }
            set_tree_readonly(&vault_mirror_dir, true);
            refresh_airgap_journal_if_active()?;

            if let Some(first_src) = first_sandbox_candidate {
                let sel = copy_save_item_into_dir(&first_src, &sandbox_saves_dir, true)?;
                save_sandbox_state_meta(
                    &storage.sandbox_root,
                    &SandboxStateMeta {
                        selected_save_name: Some(sel.clone()),
                        fresh_sandbox_armed: false,
                        source_live_save_name: Some(sel),
                    },
                )?;
            }
        }
        "restore_from_vault_mirror" => {
            let source_dir = if vault_mirror_dir.exists()
                && !list_saves_in_dir(&vault_mirror_dir, &save_exts).is_empty()
            {
                vault_mirror_dir.clone()
            } else if let Some(clean_ws_dir) =
                find_clean_world_state_save_dir(&docs_dir, None, &primary_save_rel, game_schema)
            {
                clean_ws_dir
            } else {
                return Err(
                    "No saves found in Vault Save Mirror or Time Capsule snapshots.".to_string(),
                );
            };

            std::fs::create_dir_all(&live_saves_dir).map_err(|e| e.to_string())?;
            set_tree_readonly(&live_saves_dir, false);
            copy_save_tree_verified(&source_dir, &live_saves_dir)?;

            // Ensure the Secondary Vault Mirror also holds an immortal read-only copy
            if source_dir != vault_mirror_dir {
                let _ = std::fs::create_dir_all(&vault_mirror_dir);
                set_tree_readonly(&vault_mirror_dir, false);
                let _ = copy_save_tree_verified(&source_dir, &vault_mirror_dir);
                set_tree_readonly(&vault_mirror_dir, true);
            }
            refresh_airgap_journal_if_active()?;

            let restored_saves = list_saves_in_dir(&live_saves_dir, &save_exts);
            if sandbox_saves_dir.exists()
                && list_saves_in_dir(&sandbox_saves_dir, &save_exts).is_empty()
            {
                if let Some(newest) = restored_saves.first() {
                    let cand = live_saves_dir.join(&newest.file_name);
                    if cand.exists() {
                        if let Ok(sel) = copy_save_item_into_dir(&cand, &sandbox_saves_dir, true)
                        {
                            let _ = save_sandbox_state_meta(
                                &storage.sandbox_root,
                                &SandboxStateMeta {
                                    selected_save_name: Some(sel.clone()),
                                    fresh_sandbox_armed: false,
                                    source_live_save_name: Some(sel),
                                },
                            );
                        }
                    }
                }
            }
        }
        _ => return Err(format!("Unsupported Lab Test Save mode: {}", mode)),
    }

    // Seal Golden Homestead Baseline read-only, and if airgap is currently mounted while game is closed,
    // refresh the disposable working folder (`docs_dir/<target>`) from the Golden Baseline!
    set_tree_readonly(&sandbox_saves_dir, true);
    if airgap_active
        && !game_running
        && load_airgap_journal(
            &storage.primary_airgap_root,
            Some(storage.secondary_vault_mirror.as_path()),
        )
        .is_some()
    {
        let updated_meta = load_sandbox_state_meta(&storage.sandbox_root);
        let docs_allowed = [docs_dir.clone()];
        let _ = sync_golden_sandbox_to_working_dir(
            &sandbox_saves_dir,
            &working_saves_dir,
            &docs_allowed,
            updated_meta.selected_save_name.as_deref(),
            updated_meta.fresh_sandbox_armed,
            &save_exts,
        );
    }

    Ok(compute_lab_test_save_status(&docs_dir, game_schema))
}

#[tauri::command]
pub async fn airgap_saves(
    docs_path: String,
    enable: bool,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let vault_path = get_saved_coordinates().vault_path;
        apply_save_airgap_with_vault(
            &docs_path,
            if vault_path.trim().is_empty() {
                None
            } else {
                Some(vault_path.as_str())
            },
            enable,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_airgap_status(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<AirgapStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);
        let storage = resolve_airgap_storage_paths(&docs_dir, None);
        migrate_legacy_inline_airgap_if_present(&docs_dir, &storage, &game_schema);
        let airgap_root = &storage.primary_airgap_root;

        let mut protected_files_count = 0usize;
        for t in &targets {
            let dir = crate::utils::resolve_case_insensitive_path(airgap_root, t);
            if dir.exists() {
                for entry in walkdir::WalkDir::new(&dir)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        if !is_airgap_internal_marker_name(&fname_lower) {
                            protected_files_count += 1;
                        }
                    }
                }
            }
        }

        Ok(AirgapStatus {
            active: is_airgap_active_for_docs(&docs_dir, &game_schema),
            targets,
            airgap_path: airgap_root.to_string_lossy().to_string(),
            protected_files_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

