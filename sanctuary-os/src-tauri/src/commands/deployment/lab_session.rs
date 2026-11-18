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
use super::lab_staging::*;

#[tauri::command]
pub async fn start_lab_verification_session(
    app: tauri::AppHandle,
    dna_hash: String,
    mod_name: String,
    docs_path: String,
    vault_path: String,
    linked_files: Option<Vec<String>>,
    notification_labels: Option<LabNotificationLabels>,
    state: tauri::State<'_, AppState>,
) -> Result<LabVerificationStatus, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let exe_names = collect_candidate_game_exe_names(&game_schema);
        let save_targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);

        let lv = game_schema.as_ref().and_then(|s| s.lab_verification.clone());
        let wls = lv.as_ref().and_then(|l| l.world_load_signature.clone());

        let required_active_seconds = lv
            .as_ref()
            .and_then(|l| l.required_active_seconds)
            .unwrap_or(120)
            .max(15);
        let max_idle_seconds = lv
            .as_ref()
            .and_then(|l| l.max_idle_seconds)
            .unwrap_or(10)
            .clamp(8, 12);
        let require_focus = lv.as_ref().and_then(|l| l.require_focus).unwrap_or(true);
        let require_save_checkpoint = lv
            .as_ref()
            .and_then(|l| l.require_save_checkpoint)
            .unwrap_or(true);
        let save_extensions = lv
            .as_ref()
            .and_then(|l| l.save_extensions.clone())
            .unwrap_or_default();
        let enable_hotkey_pause_detection = lv
            .as_ref()
            .and_then(|l| l.enable_hotkey_pause_detection)
            .unwrap_or(false);
        let pause_key_vk_codes = lv
            .as_ref()
            .and_then(|l| l.pause_key_vk_codes.clone())
            .unwrap_or_default();
        let resume_key_vk_codes = lv
            .as_ref()
            .and_then(|l| l.resume_key_vk_codes.clone())
            .unwrap_or_default();

        let stabilize_boot_seconds = wls
            .as_ref()
            .and_then(|w| w.stabilize_boot_seconds)
            .unwrap_or(10)
            .max(8);
        let min_disk_read_mb = wls.as_ref().and_then(|w| w.min_disk_read_mb).unwrap_or(75);
        let min_ram_step_percent = wls
            .as_ref()
            .and_then(|w| w.min_ram_step_percent)
            .unwrap_or(20);
        let warm_cache_ram_step_percent = wls
            .as_ref()
            .and_then(|w| w.warm_cache_ram_step_percent)
            .unwrap_or(35);
        let scratch_subdirs = wls
            .as_ref()
            .and_then(|w| w.scratch_activity_subdirs.clone())
            .unwrap_or_default();

        let linked_list = linked_files.unwrap_or_default();
        let deployed_payload_fingerprints =
            collect_deployed_payload_fingerprints(&vault_path, &linked_list)?;
        if !linked_list.is_empty() && deployed_payload_fingerprints.is_empty() {
            return Err("lab_err_payload_tampered".to_string());
        }

        let vault_opt = if vault_path.trim().is_empty() {
            None
        } else {
            Some(vault_path.as_str())
        };
        let now = current_epoch_secs();
        let (initial_save_snapshots, seeded_baseline_save_size) =
            snapshot_save_slots(&docs_dir, vault_opt, &save_targets, &save_extensions);
        let seeded_save_present = !initial_save_snapshots.is_empty();
        let initial_scratch_files = snapshot_scratch_files(&docs_dir, &scratch_subdirs);

        let session = ActiveLabSession {
            dna_hash,
            mod_name,
            docs_dir,
            vault_path,
            executable_names: exe_names,
            save_targets,
            save_extensions,
            scratch_subdirs,
            stage: "BOOTING".to_string(),
            pause_reason: None,
            started_at_epoch: now,
            boot_detected_epoch: None,
            menu_entered_epoch: None,
            menu_had_focused_input: false,
            menu_active_input_seconds: 0,
            world_load_settle_ticks: 0,
            world_post_settle_input_ticks: 0,
            awaiting_save_since_epoch: None,
            awaiting_save_since_ms: 0,
            last_save_reminder_epoch: 0,
            save_reminder_count: 0,
            stage4_disk_write_bytes: 0,
            pending_save_candidate: None,
            verified_save_name: None,
            tracked_pid: None,
            missing_process_ticks: 0,
            last_focused_epoch: 0,
            baseline_ram_bytes: 0,
            baseline_disk_read_bytes: 0,
            current_ram_bytes: 0,
            cumulative_disk_read_bytes: 0,
            cumulative_disk_write_bytes: 0,
            prev_ram_bytes: 0,
            prev_disk_read_bytes: 0,
            prev_disk_write_bytes: 0,
            current_cpu_usage: 0.0,
            active_cpu_ema: 0.0,
            sim_freeze_ticks: 0,
            boot_plateau_ticks: 0,
            peak_ram_bytes: 0,
            peak_world_ram_delta_bytes: 0,
            required_active_seconds,
            elapsed_active_seconds: 0,
            pending_idle_seconds: 0,
            recent_input_mask: 0,
            stage3_ticks: 0,
            consecutive_active_input_ticks: 0,
            stage3_loading_cooldown_ticks: 0,
            enable_hotkey_pause_detection,
            pause_key_vk_codes,
            resume_key_vk_codes,
            hotkey_menu_paused: false,
            hotkey_sim_paused: false,
            prev_vk_down: HashSet::new(),
            camera_drag_subticks: 0,
            gamepad_packets: [0u32; 4],
            gamepad_connected_mask: 0,
            last_xinput_probe_epoch: 0,
            last_gamepad_input_epoch: 0,
            max_idle_seconds,
            current_idle_seconds: 0,
            require_focus,
            is_focused: false,
            require_save_checkpoint,
            stabilize_boot_seconds,
            min_disk_read_mb,
            min_ram_step_percent,
            warm_cache_ram_step_percent,
            seeded_save_present,
            seeded_baseline_save_size,
            initial_save_snapshots,
            initial_scratch_files,
            deployed_payload_fingerprints,
            last_integrity_sweep_epoch: now,
            last_poll_epoch: now,
            linked_files: linked_list,
            notification_labels: notification_labels.unwrap_or_default(),
            notified_awaiting_save: false,
            notified_verified: false,
            notified_failed: false,
            error_log: None,
            certificate: None,
            sys: sysinfo::System::new(),
        };

        let status = build_session_status(&session);
        if let Ok(mut guard) = get_lab_session_mutex().lock() {
            *guard = Some(session);
        }

        // Autonomous background ticker (100ms opt-in focused hotkey edge subticks + 1s telemetry ticks)
        // so pause enforcement and timer-complete / save-verified alerts stay instant even if UI drawers unmount!
        let gen = LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let app_bg = app.clone();
        let schema_bg = game_schema.clone();
        std::thread::spawn(move || {
            let mut subtick: u8 = 0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if LAB_SESSION_GENERATION.load(std::sync::atomic::Ordering::SeqCst) != gen {
                    break;
                }
                poll_focused_hotkey_pause_subtick();
                subtick = subtick.wrapping_add(1);
                if subtick < 10 {
                    continue;
                }
                subtick = 0;
                match tick_lab_verification_session_sync(&app_bg, &schema_bg) {
                    Ok(Some(st)) => {
                        if st.stage == "VERIFIED" || st.stage == "FAILED" {
                            break;
                        }
                    }
                    _ => break,
                }
            }
        });

        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) struct Stage2TickInput {
    pub(super) dt: u32,
    pub(super) require_focus: bool,
    pub(super) is_focused: bool,
    pub(super) matched_process_stopped: bool,
    pub(super) current_idle_seconds: u32,
    pub(super) current_ram_bytes: u64,
    pub(super) ram_diff_bytes: u64,
    pub(super) cumulative_disk_read_bytes: u64,
    pub(super) disk_io_bytes_this_tick: u64,
    pub(super) disk_rate_mb: u64,
    pub(super) min_disk_read_mb: u64,
    pub(super) min_ram_step_percent: u32,
    pub(super) warm_cache_ram_step_percent: u32,
    pub(super) scratch_file_created: bool,
    pub(super) scratch_modified_recently: bool,
}

pub(super) fn evaluate_stage2_world_loaded(
    inp: &Stage2TickInput,
    baseline_ram_bytes: &mut u64,
    baseline_disk_read_bytes: &mut u64,
    menu_had_focused_input: &mut bool,
    menu_active_input_seconds: &mut u32,
    world_load_settle_ticks: &mut u32,
    world_post_settle_input_ticks: &mut u32,
) -> bool {
    let focused_active_input = (!inp.require_focus || inp.is_focused)
        && !inp.matched_process_stopped
        && inp.current_idle_seconds <= 1;

    if focused_active_input {
        *menu_had_focused_input = true;
        *menu_active_input_seconds = menu_active_input_seconds.saturating_add(inp.dt);
    }

    let disk_delta_bytes = inp
        .cumulative_disk_read_bytes
        .saturating_sub(*baseline_disk_read_bytes);
    let ram_step_bytes = inp.current_ram_bytes.saturating_sub(*baseline_ram_bytes);
    let ram_step_pct = if *baseline_ram_bytes > 0 && inp.current_ram_bytes > *baseline_ram_bytes {
        (((inp.current_ram_bytes - *baseline_ram_bytes) * 100) / *baseline_ram_bytes) as u32
    } else {
        0
    };

    let configured_disk_bytes = inp.min_disk_read_mb * 1024 * 1024;
    let scaled_disk_target_bytes =
        configured_disk_bytes.min((*baseline_ram_bytes / 3).max(2 * 1024 * 1024));
    let scaled_ram_abs_target_bytes =
        (*baseline_ram_bytes / 5).clamp(8 * 1024 * 1024, 180 * 1024 * 1024);

    let primary_world_loaded = disk_delta_bytes >= scaled_disk_target_bytes
        && (ram_step_pct >= inp.min_ram_step_percent
            || ram_step_bytes >= scaled_ram_abs_target_bytes);

    // Never allow background Main Menu 3D scene/banner streaming (before the player has ever
    // interacted with the focused game window on the menu) to masquerade as a world load —
    // while preserving an unmistakable full world-load burst if the player clicked "Load" right
    // before Stage 1 finished stabilizing!
    let unmistakable_world_burst = primary_world_loaded
        && disk_delta_bytes >= configured_disk_bytes.max(48 * 1024 * 1024)
        && ram_step_pct >= inp.min_ram_step_percent;

    if !*menu_had_focused_input {
        if !unmistakable_world_burst {
            if inp.current_ram_bytes > *baseline_ram_bytes && inp.disk_rate_mb <= 8 {
                *baseline_ram_bytes = inp.current_ram_bytes;
            }
            if inp.cumulative_disk_read_bytes > *baseline_disk_read_bytes && inp.disk_rate_mb <= 8
            {
                *baseline_disk_read_bytes = inp.cumulative_disk_read_bytes;
            }
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        }
        if inp.require_focus && !inp.is_focused {
            return false;
        }
        *menu_had_focused_input = true;
    }

    let scratch_world_loaded = inp.scratch_file_created
        && disk_delta_bytes >= (scaled_disk_target_bytes * 2 / 3).max(24 * 1024 * 1024)
        && (ram_step_pct >= (inp.min_ram_step_percent * 3 / 4).max(15)
            || ram_step_bytes >= (scaled_ram_abs_target_bytes * 3 / 4));

    let warm_cache_world_loaded = ram_step_pct >= inp.warm_cache_ram_step_percent.max(35)
        && ram_step_bytes >= scaled_ram_abs_target_bytes
        && (disk_delta_bytes >= (scaled_disk_target_bytes / 2).max(16 * 1024 * 1024)
            || inp.scratch_file_created);

    let preloaded_engine_world_active = if *baseline_ram_bytes < 256 * 1024 * 1024
        || inp.min_disk_read_mb <= 15
    {
        *menu_active_input_seconds >= 25
            && (ram_step_pct >= 8
                || disk_delta_bytes >= 2 * 1024 * 1024
                || inp.scratch_file_created)
    } else {
        *menu_active_input_seconds >= 35
            && disk_delta_bytes >= (scaled_disk_target_bytes / 2).max(16 * 1024 * 1024)
            && (ram_step_pct >= 12 || ram_step_bytes >= (scaled_ram_abs_target_bytes / 2))
    };

    if primary_world_loaded
        || scratch_world_loaded
        || warm_cache_world_loaded
        || preloaded_engine_world_active
    {
        // Wait until BOTH disk reads+writes AND RAM growth AND scratch-file writes finish settling
        // so mid-loading-screen decompression/instantiation never starts Stage 3 prematurely!
        let settle_ram_tol =
            (inp.current_ram_bytes / 180).clamp(2 * 1024 * 1024, 12 * 1024 * 1024);
        let new_loading_burst = inp.disk_io_bytes_this_tick > 6 * 1024 * 1024
            || inp.ram_diff_bytes > settle_ram_tol.saturating_mul(3)
            || inp.scratch_modified_recently;
        let settled_this_tick = inp.disk_io_bytes_this_tick <= 2 * 1024 * 1024
            && inp.ram_diff_bytes <= settle_ram_tol
            && !inp.scratch_modified_recently;

        if new_loading_burst {
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        } else if settled_this_tick {
            *world_load_settle_ticks = world_load_settle_ticks.saturating_add(1);
        } else {
            *world_load_settle_ticks = 0;
            *world_post_settle_input_ticks = 0;
            return false;
        }

        let required_settle_ticks = if inp.min_disk_read_mb <= 25 { 3 } else { 4 };
        if *world_load_settle_ticks < required_settle_ticks {
            return false;
        }

        // Require live focused player input AFTER the loading screen has fully settled, plus 1 follow-up
        // settled tick (so clicking a Household on a World Select Map resets on the subsequent lot load!)
        if *world_post_settle_input_ticks == 0 {
            if focused_active_input {
                *world_post_settle_input_ticks = 1;
            }
            false
        } else {
            *world_post_settle_input_ticks = world_post_settle_input_ticks.saturating_add(1);
            *world_post_settle_input_ticks >= 2
        }
    } else {
        *world_load_settle_ticks = 0;
        *world_post_settle_input_ticks = 0;
        false
    }
}

pub(super) fn tick_lab_verification_session_sync(
    app: &tauri::AppHandle,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<Option<LabVerificationStatus>, String> {
    let mut guard = get_lab_session_mutex().lock().map_err(|e| e.to_string())?;
    let session = match guard.as_mut() {
        Some(s) => s,
        None => return Ok(None),
    };

    if session.stage == "VERIFIED" || session.stage == "FAILED" {
        return Ok(Some(build_session_status(session)));
    }

    let now = current_epoch_secs();
    if now <= session.last_poll_epoch {
        return Ok(Some(build_session_status(session)));
    }
    let dt = now.saturating_sub(session.last_poll_epoch).clamp(1, 3) as u32;
    session.last_poll_epoch = now;

    // Dynamically adopt any game executable launched right after start_lab_verification_session (supports custom games with executables: [])
    let mut live_root_norm_opt: Option<String> = None;
    let mut direct_launched_pid: Option<u32> = None;
    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(info_guard) = mutex.lock() {
            if let Some(info) = info_guard.as_ref() {
                if info.launched_at_epoch >= session.started_at_epoch.saturating_sub(15) {
                    direct_launched_pid = info.pid;
                    if !info.live_root_norm.is_empty() {
                        live_root_norm_opt = Some(info.live_root_norm.clone());
                    }
                    if !info.exe_name.is_empty()
                        && !session
                            .executable_names
                            .iter()
                            .any(|n| n.eq_ignore_ascii_case(&info.exe_name))
                    {
                        session.executable_names.push(info.exe_name.clone());
                    }
                }
            }
        }
    }

    // 1. Check for crash/exception logs first
    if let Some(err_msg) = scan_logs_sync(&session.docs_dir, game_schema) {
        session.stage = "FAILED".to_string();
        session.error_log = Some(err_msg.clone());
        if !session.notified_failed {
            session.notified_failed = true;
            let failed_title = session
                .notification_labels
                .failed_title
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("Lab Simulation Failed");
            notify_player_over_game(
                app,
                "failed",
                failed_title,
                &err_msg,
                true,
                &session.dna_hash,
                &session.mod_name,
            );
        }
        return Ok(Some(build_session_status(session)));
    }

    // Periodic passive airgap self-healing + deployed mod payload tamper check
    if now.saturating_sub(session.last_integrity_sweep_epoch) >= 8 {
        session.last_integrity_sweep_epoch = now;
        let _ = heal_active_airgap_if_tampered(
            &session.docs_dir,
            if session.vault_path.trim().is_empty() {
                None
            } else {
                Some(session.vault_path.as_str())
            },
            game_schema,
        );
        if !session.deployed_payload_fingerprints.is_empty() {
            if let Err(tamper_err) =
                verify_deployed_payload_intact(&session.deployed_payload_fingerprints)
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(tamper_err.clone());
                if !session.notified_failed {
                    session.notified_failed = true;
                    let failed_title = session
                        .notification_labels
                        .failed_title
                        .as_deref()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or("Lab Simulation Failed");
                    notify_player_over_game(
                        app,
                        "failed",
                        failed_title,
                        &tamper_err,
                        true,
                        &session.dna_hash,
                        &session.mod_name,
                    );
                }
                return Ok(Some(build_session_status(session)));
            }
        }
    }

    // 2. Refresh processes via passive OS counters ONLY (zero ReadProcessMemory / PEB scraping)
    let refresh_kind = passive_process_refresh_kind();
    let needs_full_refresh = if let Some(pid) = session.tracked_pid {
        let sys_pid = sysinfo::Pid::from_u32(pid);
        session.sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&[sys_pid]),
            true,
            refresh_kind,
        );
        !session.sys.processes().contains_key(&sys_pid)
    } else {
        true
    };
    if needs_full_refresh {
        session.sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            refresh_kind,
        );
    }

    let mut matched_pid: Option<u32> = None;
    let mut matched_process_stopped = false;
    let mut best_ram: u64 = 0;
    let mut best_disk_read: u64 = 0;
    let mut best_disk_write: u64 = 0;
    let mut best_cpu: f32 = 0.0;

    for (pid, proc_info) in session.sys.processes() {
        let pid_u32 = pid.as_u32();
        let mut is_match =
            process_matches_game_candidates(pid_u32, proc_info, &session.executable_names);

        if !is_match && direct_launched_pid == Some(pid_u32) {
            is_match = true;
        }
        // Fallback for launcher-to-child handoff inside the same game installation directory
        if !is_match {
            if let (Some(ref live_root_norm), Some(exe_path)) =
                (&live_root_norm_opt, proc_info.exe())
            {
                let proc_norm = crate::utils::normalize_path_key(exe_path);
                if !live_root_norm.is_empty() && proc_norm.starts_with(live_root_norm) {
                    let pname = proc_info.name().to_string_lossy().to_lowercase();
                    let is_helper = pname.contains("crash")
                        || pname.contains("uninstall")
                        || pname.contains("redist")
                        || pname.contains("setup")
                        || pname.contains("updater");
                    if !is_helper {
                        is_match = true;
                    }
                }
            }
        }

        if is_match {
            let mem = proc_info.memory();
            if mem >= best_ram {
                best_ram = mem;
                let du = proc_info.disk_usage();
                best_disk_read = du.total_read_bytes;
                best_disk_write = du.total_written_bytes;
                best_cpu = proc_info.cpu_usage();
                matched_pid = Some(pid_u32);
                matched_process_stopped =
                    matches!(proc_info.status(), sysinfo::ProcessStatus::Stop);
            }
        }
    }

    if matched_pid.is_some() {
        session.missing_process_ticks = 0;
    } else {
        session.missing_process_ticks = session.missing_process_ticks.saturating_add(1);
    }
    session.tracked_pid = matched_pid;
    session.current_cpu_usage = best_cpu;

    if best_ram > 0 {
        session.current_ram_bytes = best_ram;
        session.cumulative_disk_read_bytes = best_disk_read;
        session.cumulative_disk_write_bytes = best_disk_write;
        if best_ram > session.peak_ram_bytes {
            session.peak_ram_bytes = best_ram;
        }
    }

    let (focused, idle_secs) = get_os_focus_and_idle(
        matched_pid,
        &session.sys,
        &session.executable_names,
        live_root_norm_opt.as_deref(),
        &mut session.gamepad_packets,
        &mut session.gamepad_connected_mask,
        &mut session.last_xinput_probe_epoch,
        &mut session.last_gamepad_input_epoch,
        now,
    );
    session.is_focused = focused;
    session.current_idle_seconds = idle_secs;
    if focused {
        session.last_focused_epoch = now;
    }

    let disk_read_delta_tick = session
        .cumulative_disk_read_bytes
        .saturating_sub(session.prev_disk_read_bytes);
    let disk_write_delta_tick = session
        .cumulative_disk_write_bytes
        .saturating_sub(session.prev_disk_write_bytes);
    let disk_io_bytes_this_tick = disk_read_delta_tick.saturating_add(disk_write_delta_tick);
    let disk_rate_mb = disk_read_delta_tick / (1024 * 1024);
    let ram_diff_bytes = session.current_ram_bytes.abs_diff(session.prev_ram_bytes);
    session.prev_ram_bytes = session.current_ram_bytes;
    session.prev_disk_read_bytes = session.cumulative_disk_read_bytes;
    session.prev_disk_write_bytes = session.cumulative_disk_write_bytes;

    let session_vault_opt: Option<String> = if session.vault_path.trim().is_empty() {
        None
    } else {
        Some(session.vault_path.clone())
    };

    // 3. Evaluate universal, engine-agnostic 4-stage pipeline
    match session.stage.as_str() {
        "BOOTING" => {
            let min_boot_ram_bytes = if session.min_disk_read_mb <= 10 {
                8 * 1024 * 1024
            } else {
                32 * 1024 * 1024
            };
            let has_visible_window = process_has_visible_window(
                matched_pid,
                &session.sys,
                &session.executable_names,
                live_root_norm_opt.as_deref(),
            );

            // Only begin the boot stabilization clock once a real visible game window (>= 320x200) is open!
            if matched_pid.is_some()
                && session.current_ram_bytes >= min_boot_ram_bytes
                && has_visible_window
            {
                let boot_epoch = *session.boot_detected_epoch.get_or_insert(now);
                let boot_elapsed = now.saturating_sub(boot_epoch);

                if boot_elapsed >= session.stabilize_boot_seconds.max(8) as u64 {
                    let plateau_ram_tol = (session.current_ram_bytes / 100)
                        .clamp(2 * 1024 * 1024, 14 * 1024 * 1024);
                    let quiet_disk = disk_io_bytes_this_tick <= 2 * 1024 * 1024;
                    if quiet_disk && ram_diff_bytes <= plateau_ram_tol {
                        session.boot_plateau_ticks += 1;
                    } else {
                        session.boot_plateau_ticks = 0;
                    }

                    // Require 4 consecutive quiet plateau ticks (zero blind timeout — slow boots wait cleanly!)
                    if session.boot_plateau_ticks >= 4 {
                        session.baseline_ram_bytes = session.current_ram_bytes;
                        session.baseline_disk_read_bytes = session.cumulative_disk_read_bytes;
                        let (snaps, seeded_sz) = snapshot_save_slots(
                            &session.docs_dir,
                            session_vault_opt.as_deref(),
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.initial_save_snapshots = snaps;
                        if seeded_sz.is_some() {
                            session.seeded_baseline_save_size = seeded_sz;
                        }
                        session.initial_scratch_files =
                            snapshot_scratch_files(&session.docs_dir, &session.scratch_subdirs);
                        session.menu_entered_epoch = Some(now);
                        session.menu_had_focused_input = false;
                        session.menu_active_input_seconds = 0;
                        session.world_load_settle_ticks = 0;
                        session.world_post_settle_input_ticks = 0;
                        session.stage = "MENU_WAITING".to_string();
                    }
                }
            } else if matched_pid.is_none()
                && session.boot_detected_epoch.is_some()
                && session.missing_process_ticks >= 6
                && now.saturating_sub(session.started_at_epoch) > 45
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process exited during startup before reaching the Main Menu."
                        .to_string(),
                );
            }
        }
        "MENU_WAITING" => {
            if matched_pid.is_none()
                && session.missing_process_ticks >= 4
                && now.saturating_sub(session.started_at_epoch) > 35
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process terminated on Main Menu before entering a loaded world."
                        .to_string(),
                );
            } else if matched_pid.is_some() {
                let now_ms = current_epoch_millis_u128();
                let (scratch_file_created, scratch_modified_recently) =
                    inspect_post_menu_scratch_activity(
                        &session.docs_dir,
                        &session.scratch_subdirs,
                        &session.initial_scratch_files,
                        session.menu_entered_epoch.unwrap_or(session.started_at_epoch),
                        now_ms,
                    );
                let stage2_inp = Stage2TickInput {
                    dt,
                    require_focus: session.require_focus,
                    is_focused: session.is_focused,
                    matched_process_stopped,
                    current_idle_seconds: session.current_idle_seconds,
                    current_ram_bytes: session.current_ram_bytes,
                    ram_diff_bytes,
                    cumulative_disk_read_bytes: session.cumulative_disk_read_bytes,
                    disk_io_bytes_this_tick,
                    disk_rate_mb,
                    min_disk_read_mb: session.min_disk_read_mb,
                    min_ram_step_percent: session.min_ram_step_percent,
                    warm_cache_ram_step_percent: session.warm_cache_ram_step_percent,
                    scratch_file_created,
                    scratch_modified_recently,
                };

                if evaluate_stage2_world_loaded(
                    &stage2_inp,
                    &mut session.baseline_ram_bytes,
                    &mut session.baseline_disk_read_bytes,
                    &mut session.menu_had_focused_input,
                    &mut session.menu_active_input_seconds,
                    &mut session.world_load_settle_ticks,
                    &mut session.world_post_settle_input_ticks,
                ) {
                    if !session.deployed_payload_fingerprints.is_empty() {
                        if let Err(tamper_err) = verify_deployed_payload_intact(
                            &session.deployed_payload_fingerprints,
                        ) {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(tamper_err);
                            return Ok(Some(build_session_status(session)));
                        }
                    }
                    let (snaps, seeded_sz) = snapshot_save_slots(
                        &session.docs_dir,
                        session_vault_opt.as_deref(),
                        &session.save_targets,
                        &session.save_extensions,
                    );
                    session.initial_save_snapshots = snaps;
                    if seeded_sz.is_some() {
                        session.seeded_baseline_save_size = seeded_sz;
                    }
                    // Refresh scratch snapshot at Stage 3 entry so only *new* zone/lot loads trigger LOADING_WORLD
                    session.initial_scratch_files =
                        snapshot_scratch_files(&session.docs_dir, &session.scratch_subdirs);
                    session.peak_world_ram_delta_bytes = session
                        .current_ram_bytes
                        .saturating_sub(session.baseline_ram_bytes);
                    let entered_paused = session.enable_hotkey_pause_detection
                        && (session.hotkey_menu_paused || session.hotkey_sim_paused);
                    session.elapsed_active_seconds = if entered_paused {
                        0
                    } else {
                        2.min(session.required_active_seconds)
                    };
                    session.pending_idle_seconds = 0;
                    session.recent_input_mask = if entered_paused { 0 } else { 0b11 };
                    session.stage3_ticks = 0;
                    session.consecutive_active_input_ticks = if entered_paused { 0 } else { 1 };
                    session.stage3_loading_cooldown_ticks = 0;
                    session.sim_freeze_ticks = 0;
                    session.camera_drag_subticks = 0;
                    session.stage = "ACTIVE_TESTING".to_string();
                    session.pause_reason = if entered_paused {
                        Some("GAME_PAUSED".to_string())
                    } else {
                        None
                    };
                    play_native_lab_chime("stage3_started");
                } else if session.world_load_settle_ticks < 3 {
                    session.hotkey_menu_paused = false;
                    session.hotkey_sim_paused = false;
                }
            }
        }
        "ACTIVE_TESTING" => {
            if matched_pid.is_none() && session.missing_process_ticks >= 2 {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game process exited prematurely before completing active gameplay verification."
                        .to_string(),
                );
            } else if matched_pid.is_some() {
                // If user paused simulation with `0`/`~` and then clicked the on-screen UI Play (`>`) button with the mouse,
                // auto-clear `hotkey_sim_paused` once live simulation CPU + memory churn clearly resumes!
                if session.hotkey_sim_paused
                    && !session.hotkey_menu_paused
                    && session.current_idle_seconds == 0
                    && session.active_cpu_ema >= 10.0
                    && session.current_cpu_usage >= (session.active_cpu_ema * 0.88)
                    && ram_diff_bytes >= 1024 * 1024
                {
                    session.hotkey_sim_paused = false;
                }
                let hotkey_paused = session.enable_hotkey_pause_detection
                    && (session.hotkey_menu_paused || session.hotkey_sim_paused);
                let metrics = Stage3TickMetrics {
                    dt,
                    matched_process_stopped,
                    require_focus: session.require_focus,
                    is_focused: session.is_focused,
                    hotkey_paused,
                    baseline_ram_bytes: session.baseline_ram_bytes,
                    current_ram_bytes: session.current_ram_bytes,
                    ram_diff_bytes,
                    disk_io_bytes_this_tick,
                    current_cpu_usage: session.current_cpu_usage,
                    current_idle_seconds: session.current_idle_seconds,
                    max_idle_seconds: session.max_idle_seconds,
                    required_active_seconds: session.required_active_seconds,
                };
                session.pause_reason = evaluate_stage3_pause_and_credit(
                    &metrics,
                    &mut session.peak_world_ram_delta_bytes,
                    &mut session.elapsed_active_seconds,
                    &mut session.pending_idle_seconds,
                    &mut session.recent_input_mask,
                    &mut session.stage3_ticks,
                    &mut session.active_cpu_ema,
                    &mut session.sim_freeze_ticks,
                    &mut session.consecutive_active_input_ticks,
                    &mut session.stage3_loading_cooldown_ticks,
                );

                if session.elapsed_active_seconds >= session.required_active_seconds {
                    if !session.deployed_payload_fingerprints.is_empty() {
                        if let Err(tamper_err) = verify_deployed_payload_intact(
                            &session.deployed_payload_fingerprints,
                        ) {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(tamper_err);
                            return Ok(Some(build_session_status(session)));
                        }
                    }

                    let must_verify_save =
                        session.require_save_checkpoint && !session.save_targets.is_empty();
                    if must_verify_save {
                        session.stage = "AWAITING_SAVE".to_string();
                        session.pause_reason = None;
                        session.awaiting_save_since_epoch = Some(now);
                        session.awaiting_save_since_ms = current_epoch_millis_u128();
                        session.last_save_reminder_epoch = now;
                        session.save_reminder_count = 0;
                        session.stage4_disk_write_bytes = session.cumulative_disk_write_bytes;
                        let (snaps, seeded_sz) = snapshot_save_slots(
                            &session.docs_dir,
                            session_vault_opt.as_deref(),
                            &session.save_targets,
                            &session.save_extensions,
                        );
                        session.initial_save_snapshots = snaps;
                        if seeded_sz.is_some() {
                            session.seeded_baseline_save_size = seeded_sz;
                        }
                        session.pending_save_candidate = None;
                        session.verified_save_name = None;

                        if !session.notified_awaiting_save {
                            session.notified_awaiting_save = true;
                            let title = session
                                .notification_labels
                                .timer_complete_title
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Lab Timer Complete — Save & End Test!");
                            let body = session
                                .notification_labels
                                .timer_complete_body
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Active gameplay timer is up! Save your game in-world now to verify save integrity and finish the test.");
                            notify_player_over_game(
                                app,
                                "timer_complete",
                                title,
                                body,
                                false,
                                &session.dna_hash,
                                &session.mod_name,
                            );
                        }
                    } else {
                        let cert = LabVerificationCertificate {
                            dna_hash: session.dna_hash.clone(),
                            mod_name: session.mod_name.clone(),
                            verified_at: now,
                            active_seconds: session.elapsed_active_seconds,
                            baseline_ram_mb: session.baseline_ram_bytes / (1024 * 1024),
                            peak_ram_mb: session.peak_ram_bytes / (1024 * 1024),
                            disk_read_mb: session
                                .cumulative_disk_read_bytes
                                .saturating_sub(session.baseline_disk_read_bytes)
                                / (1024 * 1024),
                            save_file_verified: "no_save_targets_in_schema".to_string(),
                        };
                        persist_certificate_to_vault(&session.vault_path, &cert);
                        session.certificate = Some(cert);
                        session.stage = "VERIFIED".to_string();
                        if !session.notified_verified {
                            session.notified_verified = true;
                            let title = session
                                .notification_labels
                                .verified_title
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("Lab Verification Passed & Signed!");
                            let body = session
                                .notification_labels
                                .verified_body
                                .as_deref()
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or("SHA-256 verification certificate recorded! You may now safely close the game and end the test.");
                            notify_player_over_game(
                                app,
                                "verified",
                                title,
                                body,
                                false,
                                &session.dna_hash,
                                &session.mod_name,
                            );
                        }
                    }
                }
            }
        }
        "AWAITING_SAVE" => {
            // Try detecting a fresh post-Stage-4 save write if none is currently staged
            if session.pending_save_candidate.is_none() {
                if let Some(cand) = detect_fresh_save_candidate(
                    &session.docs_dir,
                    &session.save_targets,
                    &session.save_extensions,
                    &session.initial_save_snapshots,
                    session.seeded_baseline_save_size,
                    session.awaiting_save_since_ms,
                ) {
                    // Correlate with real engine activity so external file-copying while unfocused cannot spoof Stage 4
                    let engine_wrote_bytes =
                        session.cumulative_disk_write_bytes > session.stage4_disk_write_bytes;
                    let recently_focused = !session.require_focus
                        || session.is_focused
                        || now.saturating_sub(session.last_focused_epoch) <= 15;

                    if engine_wrote_bytes || recently_focused {
                        session.verified_save_name = Some(cand.display_name.clone());
                        session.pending_save_candidate = Some(cand);
                    }
                } else if matched_pid.is_some()
                    && session.save_reminder_count < 3
                    && session.last_save_reminder_epoch > 0
                    && now.saturating_sub(session.last_save_reminder_epoch) >= 45
                {
                    // Gentle periodic audio reminder over WASAPI if player missed the initial fullscreen chime
                    session.save_reminder_count += 1;
                    session.last_save_reminder_epoch = now;
                    play_native_lab_chime("timer_complete");
                }
            }

            if matched_pid.is_none()
                && session.pending_save_candidate.is_none()
                && session.missing_process_ticks >= 2
            {
                session.stage = "FAILED".to_string();
                session.error_log = Some(
                    "Game closed before writing an in-game Save Checkpoint.".to_string(),
                );
            } else if let Some(mut cand) = session.pending_save_candidate.clone() {
                // Wait for temporary serialization files (.tmp/.part/.savetmp/-journal) to settle
                let temp_inflight =
                    has_inflight_temporary_save_files(&session.docs_dir, &session.save_targets);

                // Check if the candidate save is still growing/updating across polls
                let current_stat: Option<(u64, u128)> = if cand.path.is_dir() {
                    compute_dir_save_slot_snapshot(&cand.path)
                        .map(|s| (s.size_bytes, s.mtime_ms))
                } else {
                    std::fs::metadata(&cand.path)
                        .ok()
                        .map(|m| (m.len(), file_mtime_millis(&m)))
                };

                match current_stat {
                    None => {
                        // Candidate vanished (e.g. engine rolled back a failed temporary save)
                        session.pending_save_candidate = None;
                        session.verified_save_name = None;
                        if matched_pid.is_none() && session.missing_process_ticks >= 2 {
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(
                                "Game exited and save checkpoint rolled back before completion."
                                    .to_string(),
                            );
                        }
                    }
                    Some((cur_sz, cur_ms)) => {
                        if cur_sz != cand.observed_size_bytes
                            || cur_ms != cand.observed_mtime_ms
                        {
                            // Save serialization is still flushing blocks to disk; reset stabilization clock
                            cand.observed_size_bytes = cur_sz;
                            cand.observed_mtime_ms = cur_ms;
                            cand.detected_epoch = now;
                            session.pending_save_candidate = Some(cand);
                        } else if !temp_inflight && now.saturating_sub(cand.detected_epoch) >= 3
                        {
                            // Final crash/exception sweep + deployed payload check + save corruption audit
                            if let Some(err_msg) =
                                scan_logs_sync(&session.docs_dir, game_schema)
                            {
                                session.stage = "FAILED".to_string();
                                session.error_log = Some(err_msg.clone());
                                if !session.notified_failed {
                                    session.notified_failed = true;
                                    let failed_title = session
                                        .notification_labels
                                        .failed_title
                                        .as_deref()
                                        .filter(|s| !s.trim().is_empty())
                                        .unwrap_or("Lab Simulation Failed");
                                    notify_player_over_game(
                                        app,
                                        "failed",
                                        failed_title,
                                        &err_msg,
                                        true,
                                        &session.dna_hash,
                                        &session.mod_name,
                                    );
                                }
                                return Ok(Some(build_session_status(session)));
                            }

                            if !session.deployed_payload_fingerprints.is_empty() {
                                if let Err(tamper_err) = verify_deployed_payload_intact(
                                    &session.deployed_payload_fingerprints,
                                ) {
                                    session.stage = "FAILED".to_string();
                                    session.error_log = Some(tamper_err);
                                    return Ok(Some(build_session_status(session)));
                                }
                            }

                            match audit_save_file_corruption(&cand.path, cand.prev_size_bytes) {
                                Ok(_verified_bytes) => {
                                    let storage = resolve_airgap_storage_paths(
                                        &session.docs_dir,
                                        session_vault_opt.as_deref(),
                                    );
                                    let mut sb_meta = load_sandbox_state_meta(&storage.sandbox_root);
                                    let primary_target = session.save_targets.first().cloned();
                                    let has_existing_baseline = primary_target
                                        .as_deref()
                                        .map(|rel| {
                                            let sb_dir = crate::utils::resolve_case_insensitive_path(
                                                &storage.sandbox_root,
                                                rel,
                                            );
                                            !list_saves_in_dir(&sb_dir, &session.save_extensions)
                                                .is_empty()
                                        })
                                        .unwrap_or(false);

                                    if !has_existing_baseline {
                                        // Initial unseeded test save creation: seal this verified clean save as the Golden Baseline!
                                        if let Some(ref rel) = primary_target {
                                            let sb_dir = crate::utils::resolve_case_insensitive_path(
                                                &storage.sandbox_root,
                                                rel,
                                            );
                                            set_tree_readonly(&sb_dir, false);
                                            if copy_save_item_into_dir(&cand.path, &sb_dir, false)
                                                .is_ok()
                                            {
                                                set_tree_readonly(&sb_dir, true);
                                            }
                                        }
                                        sb_meta.selected_save_name = Some(cand.display_name.clone());
                                        sb_meta.fresh_sandbox_armed = false;
                                        let _ =
                                            save_sandbox_state_meta(&storage.sandbox_root, &sb_meta);
                                    } else if sb_meta.fresh_sandbox_armed {
                                        sb_meta.fresh_sandbox_armed = false;
                                        let _ =
                                            save_sandbox_state_meta(&storage.sandbox_root, &sb_meta);
                                    }

                                    let cert = LabVerificationCertificate {
                                        dna_hash: session.dna_hash.clone(),
                                        mod_name: session.mod_name.clone(),
                                        verified_at: now,
                                        active_seconds: session.elapsed_active_seconds,
                                        baseline_ram_mb: session.baseline_ram_bytes
                                            / (1024 * 1024),
                                        peak_ram_mb: session.peak_ram_bytes / (1024 * 1024),
                                        disk_read_mb: session
                                            .cumulative_disk_read_bytes
                                            .saturating_sub(session.baseline_disk_read_bytes)
                                            / (1024 * 1024),
                                        save_file_verified: cand.display_name.clone(),
                                    };
                                    persist_certificate_to_vault(&session.vault_path, &cert);
                                    session.verified_save_name = Some(cand.display_name);
                                    session.certificate = Some(cert);
                                    session.stage = "VERIFIED".to_string();
                                    if !session.notified_verified {
                                        session.notified_verified = true;
                                        let title = session
                                            .notification_labels
                                            .verified_title
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Lab Verification Passed & Signed!");
                                        let body = session
                                            .notification_labels
                                            .verified_body
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Save checkpoint verified without corruption! You may now safely close the game and end the test.");
                                        notify_player_over_game(
                                            app,
                                            "verified",
                                            title,
                                            body,
                                            false,
                                            &session.dna_hash,
                                            &session.mod_name,
                                        );
                                    }
                                }
                                Err(corrupt_reason) => {
                                    session.stage = "FAILED".to_string();
                                    session.error_log = Some(corrupt_reason.clone());
                                    if !session.notified_failed {
                                        session.notified_failed = true;
                                        let failed_title = session
                                            .notification_labels
                                            .failed_title
                                            .as_deref()
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Lab Save Integrity Failed");
                                        notify_player_over_game(
                                            app,
                                            "failed",
                                            failed_title,
                                            &corrupt_reason,
                                            true,
                                            &session.dna_hash,
                                            &session.mod_name,
                                        );
                                    }
                                }
                            }
                        } else if temp_inflight
                            && matched_pid.is_none()
                            && session.missing_process_ticks >= 3
                        {
                            // Engine terminated while temporary serialization files were still open!
                            session.stage = "FAILED".to_string();
                            session.error_log = Some(
                                "Game crashed or exited mid-serialization while temporary save files were still open."
                                    .to_string(),
                            );
                        }
                    }
                }
            }
        }
        _ => {}
    }

    Ok(Some(build_session_status(session)))
}

#[tauri::command]
pub async fn poll_lab_verification_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LabVerificationStatus>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    tauri::async_runtime::spawn_blocking(move || {
        tick_lab_verification_session_sync(&app, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
pub(super) fn post_wm_close_to_pids(pids: &[u32]) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    if pids.is_empty() {
        return;
    }

    struct CloseWinCtx<'a> {
        pids: &'a [u32],
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            lp_enum_func: unsafe extern "system" fn(isize, isize) -> i32,
            l_param: isize,
        ) -> i32;
        fn PostMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> i32;
    }

    unsafe extern "system" fn enum_close_proc(hwnd_raw: isize, lparam: isize) -> i32 {
        let ctx = &*(lparam as *const CloseWinCtx<'_>);
        if hwnd_raw == 0 {
            return 1;
        }
        let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
        let mut win_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid != 0 && ctx.pids.contains(&win_pid) {
            // WM_CLOSE = 0x0010 (standard graceful OS window close message — zero hooks/injection)
            let _ = PostMessageW(hwnd_raw, 0x0010, 0, 0);
        }
        1
    }

    let ctx = CloseWinCtx { pids };
    unsafe {
        let _ = EnumWindows(enum_close_proc, (&ctx as *const CloseWinCtx<'_>) as isize);
    }
}

pub(super) fn terminate_running_sandbox_game_processes(
    docs_dir: &Path,
    save_targets: &[String],
    extra_exe_names: &[String],
    tracked_pid: Option<u32>,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    let mut candidates = collect_candidate_game_exe_names(game_schema);
    for ex in extra_exe_names {
        let lower = ex.trim().to_lowercase();
        if !lower.is_empty() && !candidates.iter().any(|c| c == &lower) {
            candidates.push(lower);
        }
    }
    let live_roots = collect_active_game_live_roots_norm(game_schema);
    let self_pid = std::process::id();

    let collect_matching_pids = |sys: &mut sysinfo::System| -> Vec<u32> {
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            passive_process_refresh_kind(),
        );
        sys.processes()
            .iter()
            .filter_map(|(pid, proc_info)| {
                let p_u32 = pid.as_u32();
                if p_u32 == self_pid {
                    return None;
                }
                if process_matches_game_or_live_root(
                    p_u32,
                    proc_info,
                    &candidates,
                    &live_roots,
                    tracked_pid,
                ) {
                    Some(p_u32)
                } else {
                    None
                }
            })
            .collect()
    };

    let mut sys = sysinfo::System::new();
    let initial_pids = collect_matching_pids(&mut sys);
    if !initial_pids.is_empty() {
        // 1. Wait briefly if temporary save serialization files are actively being flushed
        for _ in 0..12 {
            if !has_inflight_temporary_save_files(docs_dir, save_targets) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        // 2. Request graceful OS window/process close first
        #[cfg(target_os = "windows")]
        post_wm_close_to_pids(&initial_pids);

        #[cfg(not(target_os = "windows"))]
        {
            for &pid_u32 in &initial_pids {
                if let Some(p) = sys.process(sysinfo::Pid::from_u32(pid_u32)) {
                    let _ = p.kill_with(sysinfo::Signal::Term);
                }
            }
        }

        let mut exited_gracefully = false;
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if collect_matching_pids(&mut sys).is_empty() {
                exited_gracefully = true;
                break;
            }
        }

        // 3. Fallback: if game stayed stuck on an exit confirmation prompt, terminate remaining PIDs
        if !exited_gracefully {
            let remaining = collect_matching_pids(&mut sys);
            for pid_u32 in remaining {
                if let Some(p) = sys.process(sysinfo::Pid::from_u32(pid_u32)) {
                    let _ = p.kill();
                }
            }
            for _ in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(250));
                if collect_matching_pids(&mut sys).is_empty() {
                    break;
                }
            }
        }
    }

    if let Some(mutex) = LAST_LAUNCHED_GAME_INFO.get() {
        if let Ok(mut g) = mutex.lock() {
            *g = None;
        }
    }
}

#[tauri::command]
pub async fn stop_lab_verification_session(app: tauri::AppHandle) -> Result<(), String> {
    LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    close_lab_overlay(&app);
    if let Ok(mut guard) = get_lab_session_mutex().lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn teardown_lab_sandbox_session(
    app: tauri::AppHandle,
    docs_path: String,
    close_game: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    LAB_SESSION_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    close_lab_overlay(&app);

    let (tracked_pid, extra_exe_names, session_vault_path) = {
        let mut guard = get_lab_session_mutex().lock().map_err(|e| e.to_string())?;
        let info = guard
            .as_ref()
            .map(|s| {
                (
                    s.tracked_pid,
                    s.executable_names.clone(),
                    s.vault_path.clone(),
                )
            })
            .unwrap_or((None, Vec::new(), String::new()));
        *guard = None;
        info
    };

    tauri::async_runtime::spawn_blocking(move || {
        let docs_dir = resolve_docs_root(&docs_path, &game_schema);
        let save_targets = resolve_deduplicated_save_targets(&docs_dir, &game_schema);
        if close_game.unwrap_or(true) {
            terminate_running_sandbox_game_processes(
                &docs_dir,
                &save_targets,
                &extra_exe_names,
                tracked_pid,
                &game_schema,
            );
        }
        let coords = get_saved_coordinates();
        let effective_vault = if !session_vault_path.trim().is_empty() {
            Some(session_vault_path.as_str())
        } else if !coords.vault_path.trim().is_empty() {
            Some(coords.vault_path.as_str())
        } else {
            None
        };
        apply_save_airgap_with_vault(&docs_path, effective_vault, false, &game_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_lab_certificates(vault_path: String) -> Result<Vec<LabVerificationCertificate>, String> {
    if vault_path.trim().is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let conn_arc = crate::utils::open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault SQLite connection.".to_string())?;
        let mut certs = Vec::new();
        if let Ok(mut stmt) =
            conn.prepare("SELECT cert_json FROM lab_certificates ORDER BY verified_at DESC")
        {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for r in rows.flatten() {
                    if let Ok(cert) = serde_json::from_str::<LabVerificationCertificate>(&r) {
                        certs.push(cert);
                    }
                }
            }
        }
        Ok(certs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn verify_lab_certificate_exists(vault_path: String, dna_hash: String) -> Result<bool, String> {
    let clean_hash = dna_hash.trim().to_string();
    if vault_path.trim().is_empty() || clean_hash.is_empty() {
        return Ok(false);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let conn_arc = crate::utils::open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault SQLite connection.".to_string())?;
        let cert_json: Option<String> = conn
            .query_row(
                "SELECT cert_json FROM lab_certificates WHERE dna_hash = ?1",
                rusqlite::params![clean_hash],
                |row| row.get(0),
            )
            .ok();
        if let Some(raw) = cert_json {
            if let Ok(cert) = serde_json::from_str::<LabVerificationCertificate>(&raw) {
                return Ok(cert.active_seconds >= 15 && !cert.save_file_verified.trim().is_empty());
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn record_lab_certificate(
    vault_path: String,
    certificate: LabVerificationCertificate,
) -> Result<(), String> {
    // Only allow persisting certificates that were genuinely issued by the Rust Lab Verification Engine
    let authorized = get_lab_session_mutex()
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref().and_then(|s| {
                if s.stage == "VERIFIED" && s.dna_hash == certificate.dna_hash {
                    s.certificate.clone()
                } else {
                    None
                }
            })
        });
    let Some(signed_cert) = authorized else {
        return Err("Refused to record unsigned Lab certificate.".to_string());
    };
    persist_certificate_to_vault(&vault_path, &signed_cert);
    Ok(())
}

