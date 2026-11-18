#[allow(unused_imports)]
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
#[allow(unused_imports)]
use super::airgap::*;
use super::launcher::*;
use super::playset_deploy::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabVerificationCertificate {
    pub dna_hash: String,
    pub mod_name: String,
    pub verified_at: u64,
    pub active_seconds: u32,
    pub baseline_ram_mb: u64,
    pub peak_ram_mb: u64,
    pub disk_read_mb: u64,
    pub save_file_verified: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LabNotificationLabels {
    pub failed_title: Option<String>,
    pub timer_complete_title: Option<String>,
    pub timer_complete_body: Option<String>,
    pub verified_title: Option<String>,
    pub verified_body: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabVerificationStatus {
    pub active: bool,
    pub dna_hash: String,
    pub mod_name: String,
    pub stage: String,
    pub pause_reason: Option<String>,
    pub tracked_pid: Option<u32>,
    pub baseline_ram_mb: u64,
    pub current_ram_mb: u64,
    pub peak_ram_mb: u64,
    pub ram_step_percent: u32,
    pub disk_read_mb: u64,
    pub min_disk_read_mb: u64,
    pub min_ram_step_percent: u32,
    pub required_active_seconds: u32,
    pub elapsed_active_seconds: u32,
    pub remaining_active_seconds: u32,
    pub max_idle_seconds: u32,
    pub current_idle_seconds: u32,
    pub is_focused: bool,
    pub require_focus: bool,
    pub require_save_checkpoint: bool,
    pub seeded_save_present: bool,
    pub verified_save_name: Option<String>,
    pub linked_files: Vec<String>,
    pub error_log: Option<String>,
    pub certificate: Option<LabVerificationCertificate>,
}

#[derive(Clone, Debug)]
pub(super) struct SaveSlotSnapshot {
    mtime_ms: u128,
    size_bytes: u64,
    fingerprint: String,
}

#[derive(Clone, Debug)]
pub(super) struct PendingSaveCandidate {
    path: PathBuf,
    display_name: String,
    prev_size_bytes: Option<u64>,
    observed_size_bytes: u64,
    observed_mtime_ms: u128,
    detected_epoch: u64,
}

#[derive(Serialize, Clone, Debug)]
pub(super) struct LabMilestoneEvent {
    kind: String,
    title: String,
    body: String,
    dna_hash: String,
    mod_name: String,
    is_error: bool,
}

pub(super) struct ActiveLabSession {
    pub(super) dna_hash: String,
    pub(super) mod_name: String,
    pub(super) docs_dir: PathBuf,
    pub(super) vault_path: String,
    pub(super) executable_names: Vec<String>,
    pub(super) save_targets: Vec<String>,
    pub(super) save_extensions: Vec<String>,
    pub(super) scratch_subdirs: Vec<String>,
    pub(super) stage: String,
    pub(super) pause_reason: Option<String>,
    pub(super) started_at_epoch: u64,
    pub(super) boot_detected_epoch: Option<u64>,
    pub(super) menu_entered_epoch: Option<u64>,
    pub(super) menu_had_focused_input: bool,
    pub(super) menu_active_input_seconds: u32,
    pub(super) world_load_settle_ticks: u32,
    pub(super) world_post_settle_input_ticks: u32,
    pub(super) awaiting_save_since_epoch: Option<u64>,
    pub(super) awaiting_save_since_ms: u128,
    pub(super) last_save_reminder_epoch: u64,
    pub(super) save_reminder_count: u8,
    pub(super) stage4_disk_write_bytes: u64,
    pub(super) pending_save_candidate: Option<PendingSaveCandidate>,
    pub(super) verified_save_name: Option<String>,
    pub(super) tracked_pid: Option<u32>,
    missing_process_ticks: u32,
    last_focused_epoch: u64,
    baseline_ram_bytes: u64,
    baseline_disk_read_bytes: u64,
    current_ram_bytes: u64,
    cumulative_disk_read_bytes: u64,
    cumulative_disk_write_bytes: u64,
    prev_ram_bytes: u64,
    prev_disk_read_bytes: u64,
    prev_disk_write_bytes: u64,
    current_cpu_usage: f32,
    active_cpu_ema: f32,
    sim_freeze_ticks: u32,
    boot_plateau_ticks: u32,
    peak_ram_bytes: u64,
    peak_world_ram_delta_bytes: u64,
    required_active_seconds: u32,
    elapsed_active_seconds: u32,
    pending_idle_seconds: u32,
    recent_input_mask: u16,
    stage3_ticks: u32,
    consecutive_active_input_ticks: u32,
    stage3_loading_cooldown_ticks: u32,
    enable_hotkey_pause_detection: bool,
    pause_key_vk_codes: Vec<u32>,
    resume_key_vk_codes: Vec<u32>,
    hotkey_menu_paused: bool,
    hotkey_sim_paused: bool,
    prev_vk_down: HashSet<u32>,
    camera_drag_subticks: u8,
    gamepad_packets: [u32; 4],
    gamepad_connected_mask: u8,
    last_xinput_probe_epoch: u64,
    last_gamepad_input_epoch: u64,
    max_idle_seconds: u32,
    current_idle_seconds: u32,
    require_focus: bool,
    is_focused: bool,
    require_save_checkpoint: bool,
    stabilize_boot_seconds: u32,
    min_disk_read_mb: u64,
    min_ram_step_percent: u32,
    warm_cache_ram_step_percent: u32,
    seeded_save_present: bool,
    seeded_baseline_save_size: Option<u64>,
    initial_save_snapshots: HashMap<PathBuf, SaveSlotSnapshot>,
    initial_scratch_files: HashMap<PathBuf, (u64, u128)>,
    deployed_payload_fingerprints: Vec<(PathBuf, u64, String)>,
    last_integrity_sweep_epoch: u64,
    last_poll_epoch: u64,
    linked_files: Vec<String>,
    notification_labels: LabNotificationLabels,
    notified_awaiting_save: bool,
    notified_verified: bool,
    notified_failed: bool,
    error_log: Option<String>,
    certificate: Option<LabVerificationCertificate>,
    sys: sysinfo::System,
}

pub(super) static LAB_SESSION: std::sync::OnceLock<std::sync::Mutex<Option<ActiveLabSession>>> =
    std::sync::OnceLock::new();
pub(super) static LAB_SESSION_GENERATION: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

pub(super) fn close_lab_overlay(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        if let Some(win) = app_handle.get_webview_window("lab-hud-overlay") {
            let _ = win.close();
        }
    });
}

pub(super) fn synthesize_lab_chime_wav(kind: &str) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 44_100;
    let notes: &[(f32, u32, f32)] = match kind {
        "stage3_started" => &[(523.25, 110, 0.34), (783.99, 175, 0.38)],
        "timer_complete" => &[
            (587.33, 105, 0.44),
            (739.99, 105, 0.46),
            (880.00, 115, 0.48),
            (1174.66, 250, 0.52),
            (0.0, 55, 0.0),
            (1174.66, 220, 0.52),
        ],
        "verified" => &[
            (523.25, 110, 0.42),
            (659.25, 110, 0.44),
            (1046.50, 290, 0.50),
        ],
        "failed" => &[(440.00, 160, 0.45), (311.13, 270, 0.48)],
        _ => &[(659.25, 130, 0.38), (880.00, 190, 0.42)],
    };

    let mut samples: Vec<i16> = Vec::with_capacity(SAMPLE_RATE as usize);
    let mut phase_primary: f32 = 0.0;
    let mut phase_overtone: f32 = 0.0;

    for &(freq, dur_ms, amp) in notes {
        let count = ((SAMPLE_RATE as u64 * dur_ms as u64) / 1000) as usize;
        if count == 0 {
            continue;
        }
        if freq <= 1.0 || amp <= 0.0 {
            samples.extend(std::iter::repeat(0i16).take(count));
            phase_primary = 0.0;
            phase_overtone = 0.0;
            continue;
        }
        let attack_samples = ((SAMPLE_RATE as usize) * 8 / 1000).max(1);
        let step_primary = std::f32::consts::TAU * freq / (SAMPLE_RATE as f32);
        let step_overtone = std::f32::consts::TAU * (freq * 2.0) / (SAMPLE_RATE as f32);

        for i in 0..count {
            let progress = (i as f32) / (count as f32);
            let attack_env = if i < attack_samples {
                (i as f32) / (attack_samples as f32)
            } else {
                1.0
            };
            let decay_env = (1.0 - progress).powf(1.35);
            let env = attack_env * decay_env * amp;
            let wave = (phase_primary.sin() * 0.82) + (phase_overtone.sin() * 0.18);
            let pcm = (wave * env * 32_000.0).clamp(-32_760.0, 32_760.0) as i16;
            samples.push(pcm);

            phase_primary = (phase_primary + step_primary).rem_euclid(std::f32::consts::TAU);
            phase_overtone = (phase_overtone + step_overtone).rem_euclid(std::f32::consts::TAU);
        }
    }

    let data_bytes = (samples.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + data_bytes as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // Mono
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_bytes.to_le_bytes());
    for s in samples {
        wav.extend_from_slice(&s.to_le_bytes());
    }
    wav
}

pub(super) fn play_native_lab_chime(kind: &str) {
    let kind_owned = kind.to_string();
    std::thread::spawn(move || {
        let wav = synthesize_lab_chime_wav(&kind_owned);

        #[cfg(target_os = "windows")]
        unsafe {
            #[link(name = "winmm")]
            extern "system" {
                fn PlaySoundW(
                    psz_sound: *const u8,
                    hmod: *mut std::ffi::c_void,
                    fdw_sound: u32,
                ) -> i32;
            }
            #[link(name = "user32")]
            extern "system" {
                fn MessageBeep(u_type: u32) -> i32;
            }
            // SND_SYNC (0x0000) | SND_NODEFAULT (0x0002) | SND_MEMORY (0x0004)
            let ok = PlaySoundW(wav.as_ptr(), std::ptr::null_mut(), 0x0004 | 0x0002);
            if ok == 0 {
                let _ = MessageBeep(if kind_owned == "failed" {
                    0x00000010
                } else {
                    0x00000040
                });
            }
        }

        #[cfg(target_os = "macos")]
        {
            let tmp_wav = std::env::temp_dir().join(format!(
                "sanctuary_chime_{}_{}.wav",
                std::process::id(),
                current_epoch_millis_u128()
            ));
            if std::fs::write(&tmp_wav, &wav).is_ok() {
                let _ = std::process::Command::new("afplay")
                    .arg(&tmp_wav)
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
                let _ = std::fs::remove_file(&tmp_wav);
            }
        }

        #[cfg(target_os = "linux")]
        {
            let tmp_wav = std::env::temp_dir().join(format!(
                "sanctuary_chime_{}_{}.wav",
                std::process::id(),
                current_epoch_millis_u128()
            ));
            if std::fs::write(&tmp_wav, &wav).is_ok() {
                for player in ["pw-play", "paplay", "aplay"] {
                    if let Ok(st) = std::process::Command::new(player)
                        .arg(&tmp_wav)
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .status()
                    {
                        if st.success() {
                            break;
                        }
                    }
                }
                let _ = std::fs::remove_file(&tmp_wav);
            }
        }
    });
}

pub(super) fn notify_player_over_game(
    app: &tauri::AppHandle,
    milestone_kind: &str,
    title: &str,
    body: &str,
    is_error: bool,
    dna_hash: &str,
    mod_name: &str,
) {
    // Passive OS audio mixer chime + OS toast + taskbar flash ONLY —
    // never inject a transparent click-through window or overlay into the game!
    play_native_lab_chime(milestone_kind);

    let _ = app.emit(
        "sanctuary-lab-milestone",
        LabMilestoneEvent {
            kind: milestone_kind.to_string(),
            title: title.to_string(),
            body: body.to_string(),
            dna_hash: dna_hash.to_string(),
            mod_name: mod_name.to_string(),
            is_error,
        },
    );

    if let Some(win) = app.get_webview_window("main") {
        // Informational taskbar highlight never steals foreground focus from fullscreen games
        let _ = win.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }

    let _ = crate::commands::system::send_sanctuary_notification(
        app.clone(),
        title.to_string(),
        body.to_string(),
    );
}

#[cfg(target_os = "windows")]
pub(super) fn poll_focused_hotkey_pause_subtick() {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }

    let Ok(mut guard) = get_lab_session_mutex().lock() else {
        return;
    };
    let Some(session) = guard.as_mut() else {
        return;
    };

    // Strictly opt-in per Master Schema (`enable_hotkey_pause_detection: false` in default.json)
    // and ONLY while the game window is focused in settled world gameplay!
    let settled_menu_handoff =
        session.stage == "MENU_WAITING" && session.world_load_settle_ticks >= 3;
    if !session.enable_hotkey_pause_detection
        || (session.stage != "ACTIVE_TESTING" && !settled_menu_handoff)
        || !session.is_focused
    {
        session.prev_vk_down.clear();
        session.camera_drag_subticks = 0;
        return;
    }

    // Verify foreground HWND still belongs to our tracked game process before sampling VK edges
    if let Some(pid) = session.tracked_pid {
        let still_fg = unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() || IsIconic(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
                false
            } else {
                let mut fg_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                if fg_pid == pid {
                    true
                } else if fg_pid != 0 {
                    session
                        .sys
                        .process(sysinfo::Pid::from_u32(fg_pid))
                        .map(|fg_proc| {
                            process_matches_game_candidates(
                                fg_pid,
                                fg_proc,
                                &session.executable_names,
                            )
                        })
                        .unwrap_or(false)
                } else {
                    false
                }
            }
        };
        if !still_fg {
            session.prev_vk_down.clear();
            session.camera_drag_subticks = 0;
            return;
        }
    }

    let is_vk_down = |vk: u32| -> bool {
        if vk == 0 || vk > 255 {
            return false;
        }
        unsafe { ((GetAsyncKeyState(vk as i32) as u16) & 0x8000) != 0 }
    };

    let check_rising_edge = |vk: u32, prev_set: &mut HashSet<u32>| -> bool {
        let down = is_vk_down(vk);
        let was_down = prev_set.contains(&vk);
        if down {
            prev_set.insert(vk);
        } else {
            prev_set.remove(&vk);
        }
        down && !was_down
    };

    // 1. Universal Escape Menu Toggle (VK_ESCAPE = 27)
    if check_rising_edge(27, &mut session.prev_vk_down) {
        session.hotkey_menu_paused = !session.hotkey_menu_paused;
        session.camera_drag_subticks = 0;
    }

    // 2. Schema Resume Hotkeys (e.g. Speed 1/2/3: 49, 50, 51, 97, 98, 99)
    let resume_vks = session.resume_key_vk_codes.clone();
    for vk in resume_vks {
        if check_rising_edge(vk, &mut session.prev_vk_down) {
            session.hotkey_sim_paused = false;
            session.hotkey_menu_paused = false;
            session.camera_drag_subticks = 0;
        }
    }

    // 3. Schema Pause Hotkeys (e.g. 0 / Numpad 0 = explicit pause; 192 `~` = toggle pause)
    let pause_vks = session.pause_key_vk_codes.clone();
    for vk in pause_vks {
        if check_rising_edge(vk, &mut session.prev_vk_down) {
            if vk == 192 {
                // If save loaded in paused state and player taps `~` in the first 3 ticks to unpause, don't invert!
                if session.stage3_ticks > 3 || session.hotkey_sim_paused {
                    session.hotkey_sim_paused = !session.hotkey_sim_paused;
                }
            } else {
                session.hotkey_sim_paused = true;
            }
        }
    }

    // 4. Auto-clear `hotkey_menu_paused` if the player clicked "Resume Game" with Left-Mouse
    // and then panned/rotated/zoomed the 3D world camera (WASD / Arrow keys / QEZ / ,. / PgUp-PgDn / Right- or Middle-Mouse hold >= 200ms).
    // Moving the cursor or Left-Clicking inside the Esc Pause Menu NEVER triggers this!
    if session.hotkey_menu_paused {
        const CAMERA_OR_MOVE_VKS: [u32; 20] = [
            0x02, // VK_RBUTTON (3D camera rotate hold)
            0x04, // VK_MBUTTON (3D camera pitch/orbit hold)
            0x57, // W
            0x41, // A
            0x53, // S
            0x44, // D
            0x51, // Q
            0x45, // E
            0x5A, // Z
            0x58, // X
            0xBC, // , (< rotate)
            0xBE, // . (> rotate)
            0x21, // PageUp
            0x22, // PageDown
            0x23, // End
            0x24, // Home
            0x25, // Left
            0x26, // Up
            0x27, // Right
            0x28, // Down
        ];
        let any_camera_control_held = CAMERA_OR_MOVE_VKS.iter().copied().any(is_vk_down);
        if any_camera_control_held {
            session.camera_drag_subticks = session.camera_drag_subticks.saturating_add(1);
            if session.camera_drag_subticks >= 2 {
                session.hotkey_menu_paused = false;
                session.camera_drag_subticks = 0;
            }
        } else {
            session.camera_drag_subticks = 0;
        }
    } else {
        session.camera_drag_subticks = 0;
    }

    if session.stage == "ACTIVE_TESTING" && (session.hotkey_menu_paused || session.hotkey_sim_paused) {
        session.pending_idle_seconds = 0;
        session.consecutive_active_input_ticks = 0;
        session.pause_reason = Some("GAME_PAUSED".to_string());
    }
}

#[cfg(not(target_os = "windows"))]
pub(super) fn poll_focused_hotkey_pause_subtick() {}

pub(super) struct Stage3TickMetrics {
    pub(super) dt: u32,
    pub(super) matched_process_stopped: bool,
    pub(super) require_focus: bool,
    pub(super) is_focused: bool,
    pub(super) hotkey_paused: bool,
    pub(super) baseline_ram_bytes: u64,
    pub(super) current_ram_bytes: u64,
    pub(super) ram_diff_bytes: u64,
    pub(super) disk_io_bytes_this_tick: u64,
    pub(super) current_cpu_usage: f32,
    pub(super) current_idle_seconds: u32,
    pub(super) max_idle_seconds: u32,
    pub(super) required_active_seconds: u32,
}

pub(super) fn evaluate_stage3_pause_and_credit(
    m: &Stage3TickMetrics,
    peak_world_ram_delta_bytes: &mut u64,
    elapsed_active_seconds: &mut u32,
    pending_idle_seconds: &mut u32,
    recent_input_mask: &mut u16,
    stage3_ticks: &mut u32,
    active_cpu_ema: &mut f32,
    sim_freeze_ticks: &mut u32,
    consecutive_active_input_ticks: &mut u32,
    stage3_loading_cooldown_ticks: &mut u32,
) -> Option<String> {
    let current_world_delta = m.current_ram_bytes.saturating_sub(m.baseline_ram_bytes);
    if current_world_delta > *peak_world_ram_delta_bytes {
        *peak_world_ram_delta_bytes = current_world_delta;
    }

    // Proportional world-unload threshold so both lightweight 2D and heavy 3D engines catch returning to Main Menu
    let min_world_delta_floor =
        (m.baseline_ram_bytes / 6).clamp(16 * 1024 * 1024, 64 * 1024 * 1024);
    let unloaded_back_to_menu = *peak_world_ram_delta_bytes >= min_world_delta_floor
        && current_world_delta < (*peak_world_ram_delta_bytes / 5);

    if m.matched_process_stopped {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }
    if m.require_focus && !m.is_focused {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("UNFOCUSED".to_string());
    }
    if unloaded_back_to_menu {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("MAIN_MENU".to_string());
    }

    // Pause the timer ONLY on unmistakable heavy secondary zone/lot loading bursts (never on routine scratch file touches)
    let heavy_zone_loading_now = m.disk_io_bytes_this_tick >= 24 * 1024 * 1024
        || (m.disk_io_bytes_this_tick >= 10 * 1024 * 1024 && m.ram_diff_bytes >= 40 * 1024 * 1024);
    if heavy_zone_loading_now {
        *stage3_loading_cooldown_ticks = 2;
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("LOADING_WORLD".to_string());
    }
    if *stage3_loading_cooldown_ticks > 0 {
        let settle_tol = (m.current_ram_bytes / 180).clamp(2 * 1024 * 1024, 12 * 1024 * 1024);
        if m.disk_io_bytes_this_tick <= 2 * 1024 * 1024 && m.ram_diff_bytes <= settle_tol {
            *stage3_loading_cooldown_ticks = stage3_loading_cooldown_ticks.saturating_sub(1);
        }
        if *stage3_loading_cooldown_ticks > 0 {
            *pending_idle_seconds = 0;
            *consecutive_active_input_ticks = 0;
            return Some("LOADING_WORLD".to_string());
        }
    }

    // Schema opt-in Pause / Escape Menu hotkey state (100ms rising-edge tracker)
    if m.hotkey_paused {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    *stage3_ticks = stage3_ticks.saturating_add(1);
    let active_input_now = m.current_idle_seconds <= 1;
    *recent_input_mask = ((*recent_input_mask << 1) | u16::from(active_input_now)) & 0x03FF;

    // Natural gameplay cadence ceiling (8..=12s) so watching an animation/interaction for a few seconds
    // NEVER throws false IDLE pauses, while going hands-off on a clicked Pause Menu stops & discards buffered time!
    let effective_idle_limit = m.max_idle_seconds.clamp(8, 12);
    if m.current_idle_seconds > effective_idle_limit {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("IDLE".to_string());
    }

    let static_memory_and_disk =
        m.ram_diff_bytes < 512 * 1024 && m.disk_io_bytes_this_tick < 64 * 1024;

    // Only flag CPU-drop simulation freeze when the player is NOT actively giving live gameplay input (`idle >= 3`),
    // eliminating false `GAME_PAUSED` triggers during normal in-lot CPU fluctuations!
    if m.current_idle_seconds >= 3
        && *active_cpu_ema >= 12.0
        && m.current_cpu_usage < (*active_cpu_ema * 0.45)
        && static_memory_and_disk
    {
        *sim_freeze_ticks = sim_freeze_ticks.saturating_add(1);
    } else if active_input_now
        || m.current_cpu_usage >= (*active_cpu_ema * 0.65)
        || !static_memory_and_disk
    {
        *sim_freeze_ticks = 0;
    }

    if *sim_freeze_ticks >= 3 {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    // Detect sparse periodic anti-AFK key-tapping once every several seconds on a static pause menu
    let sparse_pause_tapping = *stage3_ticks >= 10
        && recent_input_mask.count_ones() <= 2
        && m.current_idle_seconds >= 3
        && static_memory_and_disk
        && (*active_cpu_ema < 5.0 || m.current_cpu_usage < (*active_cpu_ema * 0.50));
    if sparse_pause_tapping {
        *pending_idle_seconds = 0;
        *consecutive_active_input_ticks = 0;
        return Some("GAME_PAUSED".to_string());
    }

    if m.current_idle_seconds <= 3 {
        if active_input_now {
            *consecutive_active_input_ticks = consecutive_active_input_ticks.saturating_add(1);
            if m.current_cpu_usage > 1.0 && *consecutive_active_input_ticks >= 2 {
                *active_cpu_ema = if *active_cpu_ema <= 0.1 {
                    m.current_cpu_usage
                } else {
                    (*active_cpu_ema * 0.88) + (m.current_cpu_usage * 0.12)
                };
            }
        }

        let credit = if active_input_now && *pending_idle_seconds > 0 && *consecutive_active_input_ticks >= 2 {
            let flushed = pending_idle_seconds.saturating_add(m.dt);
            *pending_idle_seconds = 0;
            flushed
        } else {
            m.dt
        };
        *elapsed_active_seconds = elapsed_active_seconds
            .saturating_add(credit)
            .min(m.required_active_seconds);
    } else {
        // Silent grace window (`idle == 4..=effective_idle_limit`) while watching an in-game interaction;
        // wiped to 0 if the player opens Esc/Pause, Alt-Tabs, or stays hands-off past `effective_idle_limit`!
        *consecutive_active_input_ticks = 0;
        *pending_idle_seconds = pending_idle_seconds
            .saturating_add(m.dt)
            .min(effective_idle_limit);
    }

    None
}

pub(super) fn get_lab_session_mutex() -> &'static std::sync::Mutex<Option<ActiveLabSession>> {
    LAB_SESSION.get_or_init(|| std::sync::Mutex::new(None))
}

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

pub(super) fn scan_logs_sync(docs_dir: &Path, game_schema: &Option<crate::schema::GameSchema>) -> Option<String> {
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
            if rel_str.to_lowercase().contains("crash") {
                has_crash = true;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
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

pub(super) fn normalize_mod_lookup_key(
    s: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> String {
    let trimmed = s.trim();
    let without_ext = if let Some((stem, ext)) = trimmed.rsplit_once('.') {
        let ext_lower = ext.to_lowercase();
        let is_schema_ext = crate::game_logic::get_supported_extensions(game_schema)
            .iter()
            .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower))
            || crate::game_logic::get_config_extensions(game_schema)
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
        if is_schema_ext
            || matches!(
                ext_lower.as_str(),
                "zip" | "7z" | "rar" | "jar" | "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml"
            )
        {
            stem
        } else {
            trimmed
        }
    } else {
        trimmed
    };
    without_ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

pub(super) fn resolve_single_mod_target(
    query: &str,
    dna_hash: Option<&str>,
    is_sandbox: bool,
    dev_lane: &Path,
    vault_mods_lane: &Path,
    priority_folders: &[String],
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<PathBuf> {
    let clean_query = query.trim().replace("\\", "/");
    if clean_query.is_empty() {
        return None;
    }
    let query_first_seg = clean_query.split('/').next().unwrap_or("").trim();
    let query_file_name = Path::new(&clean_query)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_stem = Path::new(&clean_query)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or(&clean_query)
        .to_lowercase();
    let query_norm = normalize_mod_lookup_key(&query_file_name, game_schema);

    let mut source_target: Option<PathBuf> = None;

    // 1. Check Dev/Sandbox first if is_sandbox or if it exists in Dev/Sandbox
    let query_has_subpath = clean_query.contains('/');
    if dev_lane.exists() {
        let direct_dev = dev_lane.join(&clean_query);
        if direct_dev.exists() && direct_dev != dev_lane {
            source_target = Some(direct_dev);
        } else if !query_has_subpath && !query_first_seg.is_empty() {
            let folder_dev = dev_lane.join(query_first_seg);
            if folder_dev.exists() && folder_dev != dev_lane {
                source_target = Some(folder_dev);
            }
        }
        if source_target.is_none() && is_sandbox {
            if let Ok(entries) = std::fs::read_dir(dev_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_lowercase();
                    let enorm = normalize_mod_lookup_key(&ename, game_schema);
                    if ename == query_file_name
                        || ename == query_stem
                        || (!query_has_subpath && ename == query_first_seg.to_lowercase())
                        || (!query_norm.is_empty() && enorm == query_norm)
                    {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 2. Search Vault Mods lane (and priority folders) if not found yet — return the exact matched file, NEVER its collection folder!
    if source_target.is_none() && vault_mods_lane.exists() {
        for pf in priority_folders {
            let base = if pf.is_empty() {
                vault_mods_lane.to_path_buf()
            } else {
                vault_mods_lane.join(pf)
            };
            if !base.exists() {
                continue;
            }
            let candidate = base.join(&clean_query);
            if candidate.exists() && candidate != base {
                source_target = Some(candidate);
                break;
            }
            if !query_has_subpath && !query_first_seg.is_empty() {
                let folder_cand = base.join(query_first_seg);
                if folder_cand.exists() && folder_cand != base {
                    source_target = Some(folder_cand);
                    break;
                }
            }
        }
    }

    // 3. Search by dna_hash in .sanctuary_cache.db if still not found — return the exact file matching dna_hash!
    if source_target.is_none() {
        if let Some(hash_str) = dna_hash.filter(|h| !h.trim().is_empty()) {
            let cache = load_cache(vault_path);
            for (cached_path, entry) in cache.iter() {
                if entry.dna_hash == hash_str {
                    let p = PathBuf::from(cached_path);
                    if p.exists() {
                        source_target = Some(p);
                        break;
                    }
                }
            }
        }
    }

    // 4. Case-insensitive and normalized alphanumeric deep walk across Dev/Sandbox and Vault Mods lane
    if source_target.is_none() {
        for search_root in [dev_lane, vault_mods_lane] {
            if !search_root.exists() {
                continue;
            }
            for entry in walkdir::WalkDir::new(search_root)
                .max_depth(4)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let p = entry.path();
                if p == search_root {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                let fstem = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_lowercase();
                let fnorm = normalize_mod_lookup_key(&fname, game_schema);
                if (!query_file_name.is_empty() && fname == query_file_name)
                    || (!query_stem.is_empty() && fstem == query_stem && p.is_file())
                    || (!query_norm.is_empty() && fnorm == query_norm && p.is_file())
                {
                    source_target = Some(p.to_path_buf());
                    break;
                }
            }
            if source_target.is_some() {
                break;
            }
        }
    }

    source_target
}

pub fn deploy_single_mod_to_live_sync(
    mod_path_or_name: &str,
    dna_hash: Option<&str>,
    additional_mods: &[String],
    is_sandbox: bool,
    mods_path: &str,
    vault_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<Vec<String>, String> {
    let mods_dir = PathBuf::from(mods_path);
    if !mods_dir.exists() {
        let _ = std::fs::create_dir_all(&mods_dir);
    }

    let vault_dir = PathBuf::from(vault_path);
    let vault_mods_lane = crate::utils::get_vault_mods_lane(vault_path);
    let dev_lane = if crate::utils::is_mods_dir(&vault_dir) {
        vault_dir
            .parent()
            .unwrap_or(&vault_dir)
            .join("Dev")
            .join("Sandbox")
    } else {
        vault_dir.join("Dev").join("Sandbox")
    };

    cleanup_routed_links(vault_path);
    crate::utils::safe_wipe_mods_dir_with_vault(&mods_dir, Some(vault_path), game_schema);
    crate::game_logic::generate_manifest_if_needed(game_schema, &mods_dir);

    let priority_folders = crate::game_logic::get_priority_folders(game_schema);

    let mut resolved_targets: Vec<PathBuf> = Vec::new();
    if let Some(primary) = resolve_single_mod_target(
        mod_path_or_name,
        dna_hash,
        is_sandbox,
        &dev_lane,
        &vault_mods_lane,
        &priority_folders,
        vault_path,
        game_schema,
    ) {
        resolved_targets.push(primary);
    }

    for extra_query in additional_mods {
        if let Some(extra_path) = resolve_single_mod_target(
            extra_query,
            None,
            false,
            &dev_lane,
            &vault_mods_lane,
            &priority_folders,
            vault_path,
            game_schema,
        ) {
            if !resolved_targets.contains(&extra_path) {
                resolved_targets.push(extra_path);
            }
        }
    }

    // Automatically include atomic script/module twins in Vault/Mods root (never same-extension pack siblings)
    if vault_mods_lane.exists() {
        let mut companion_targets: Vec<PathBuf> = Vec::new();
        for target in &resolved_targets {
            let base_name = target
                .file_stem()
                .or_else(|| target.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let target_ext = target
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let norm = normalize_mod_lookup_key(base_name, game_schema);
            if norm.is_empty() {
                continue;
            }
            let stripped_norm = norm
                .strip_suffix("scripts")
                .or_else(|| norm.strip_suffix("script"))
                .unwrap_or(&norm)
                .to_string();
            let scripts_norm = format!("{}scripts", stripped_norm);
            let script_norm = format!("{}script", stripped_norm);

            if let Ok(entries) = std::fs::read_dir(&vault_mods_lane) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let ename = entry.file_name().to_string_lossy().to_string();
                    let e_stem = p
                        .file_stem()
                        .or_else(|| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or(&ename);
                    let enorm = normalize_mod_lookup_key(e_stem, game_schema);
                    let p_ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    let is_script_twin_dir =
                        p.is_dir() && (enorm == scripts_norm || enorm == script_norm);
                    let is_diff_ext_twin_file = p.is_file()
                        && !p_ext.is_empty()
                        && p_ext != target_ext
                        && (enorm == stripped_norm
                            || enorm == scripts_norm
                            || enorm == script_norm);
                    if !enorm.is_empty()
                        && (is_script_twin_dir || is_diff_ext_twin_file)
                        && !resolved_targets.contains(&p)
                        && !companion_targets.contains(&p)
                    {
                        companion_targets.push(p);
                    }
                }
            }
        }
        resolved_targets.extend(companion_targets);
    }

    if resolved_targets.is_empty() {
        return Err(format!(
            "Could not locate mod files for '{}' in Sandbox or Vault.",
            mod_path_or_name
        ));
    }

    // Collect (lane_root_or_mod_parent, src_file) pairs so relative subpaths are preserved
    let mut files_to_link: Vec<(PathBuf, PathBuf)> = Vec::new();

    let compute_anchor_root = |target_dir_or_file: &Path| -> PathBuf {
        if target_dir_or_file.starts_with(&dev_lane) {
            return dev_lane.clone();
        }
        for pf in &priority_folders {
            if !pf.is_empty() {
                let tier_root = vault_mods_lane.join(pf);
                if target_dir_or_file.starts_with(&tier_root) {
                    return tier_root;
                }
            }
        }
        if target_dir_or_file.starts_with(&vault_mods_lane) {
            return vault_mods_lane.clone();
        }
        target_dir_or_file
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| target_dir_or_file.to_path_buf())
    };

    for mut resolved in resolved_targets {
        // 5. If resolved is a .zip file or contains .zip files, extract them in place first
        let supported_exts_lower: Vec<String> =
            crate::game_logic::get_supported_extensions(game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();
        let zip_is_native_mod = supported_exts_lower.iter().any(|e| e == "zip");

        if !zip_is_native_mod
            && resolved.is_file()
            && resolved
                .extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
        {
            let extract_dir = resolved
                .parent()
                .map(|p| {
                    if p == dev_lane.as_path() || p == vault_mods_lane.as_path() {
                        p.join(resolved.file_stem().unwrap_or_default())
                    } else {
                        p.to_path_buf()
                    }
                })
                .unwrap_or_else(|| dev_lane.join("ExtractedMod"));
            if crate::commands::library::extract_sandbox_zip_in_place(
                &resolved,
                &extract_dir,
                game_schema,
            ) > 0
            {
                let _ = std::fs::remove_file(&resolved);
                resolved = extract_dir;
            }
        } else if !zip_is_native_mod && resolved.is_dir() {
            let mut zips = Vec::new();
            for entry in walkdir::WalkDir::new(&resolved)
                .max_depth(2)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file()
                    && entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |e| e.eq_ignore_ascii_case("zip"))
                {
                    zips.push(entry.path().to_path_buf());
                }
            }
            for z in zips {
                if crate::commands::library::extract_sandbox_zip_in_place(
                    &z,
                    &resolved,
                    game_schema,
                ) > 0
                {
                    let _ = std::fs::remove_file(&z);
                }
            }
        }

        // 6. Collect deployable files from resolved while retaining their lane anchor root.
        // CRITICAL: When `resolved` is a specific file inside a multi-item collection folder,
        // NEVER symlink every other mod in `parent` — only include `resolved` itself, any atomic
        // script/module twin sharing the same normalized stem with a different extension, and
        // (for single-mod folders on auxiliary-asset engines) non-mod sidecar assets.
        let anchor_root = compute_anchor_root(&resolved);
        if resolved.is_dir() {
            for entry in walkdir::WalkDir::new(&resolved)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let p = entry.path().to_path_buf();
                    if !files_to_link.iter().any(|(_, existing)| existing == &p) {
                        files_to_link.push((anchor_root.clone(), p));
                    }
                }
            }
        } else if resolved.is_file() {
            if !files_to_link.iter().any(|(_, existing)| existing == &resolved) {
                files_to_link.push((anchor_root.clone(), resolved.clone()));
            }
            if let Some(parent) = resolved.parent() {
                let is_shared_lane_root = parent == dev_lane.as_path()
                    || parent == vault_mods_lane.as_path()
                    || priority_folders
                        .iter()
                        .any(|pf| !pf.is_empty() && parent == vault_mods_lane.join(pf));
                if !is_shared_lane_root {
                    let resolved_stem = resolved
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default();
                    let resolved_norm = normalize_mod_lookup_key(resolved_stem, game_schema);
                    let stripped_norm = resolved_norm
                        .strip_suffix("scripts")
                        .or_else(|| resolved_norm.strip_suffix("script"))
                        .unwrap_or(&resolved_norm)
                        .to_string();
                    let scripts_norm = format!("{}scripts", stripped_norm);
                    let script_norm = format!("{}script", stripped_norm);
                    let resolved_ext = resolved
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or_default()
                        .to_lowercase();

                    let preserve_aux =
                        crate::game_logic::should_preserve_auxiliary_assets(game_schema);
                    let mut primary_mod_stems: std::collections::HashSet<String> =
                        std::collections::HashSet::new();
                    let mut parent_files: Vec<PathBuf> = Vec::new();

                    for entry in walkdir::WalkDir::new(parent)
                        .max_depth(2)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if !entry.file_type().is_file() {
                            continue;
                        }
                        let p = entry.path().to_path_buf();
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        if supported_exts_lower.is_empty()
                            || supported_exts_lower.iter().any(|se| se == &p_ext)
                        {
                            if let Some(st) = p.file_stem().and_then(|s| s.to_str()) {
                                let sn = normalize_mod_lookup_key(st, game_schema);
                                let sn_base = sn
                                    .strip_suffix("scripts")
                                    .or_else(|| sn.strip_suffix("script"))
                                    .unwrap_or(&sn)
                                    .to_string();
                                if !sn_base.is_empty() {
                                    primary_mod_stems.insert(sn_base);
                                }
                            }
                        }
                        parent_files.push(p);
                    }

                    let is_single_mod_folder = primary_mod_stems.len() <= 1;

                    for p in parent_files {
                        if p == resolved {
                            continue;
                        }
                        let p_ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or_default()
                            .to_lowercase();
                        let p_stem = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or_default();
                        let p_norm = normalize_mod_lookup_key(p_stem, game_schema);

                        let is_atomic_twin = !stripped_norm.is_empty()
                            && !p_ext.is_empty()
                            && p_ext != resolved_ext
                            && (p_norm == stripped_norm
                                || p_norm == scripts_norm
                                || p_norm == script_norm);

                        let is_single_mod_aux_sidecar = preserve_aux
                            && is_single_mod_folder
                            && !supported_exts_lower.is_empty()
                            && !supported_exts_lower.iter().any(|se| se == &p_ext);

                        if (is_atomic_twin || is_single_mod_aux_sidecar)
                            && !files_to_link.iter().any(|(_, existing)| existing == &p)
                        {
                            files_to_link.push((anchor_root.clone(), p));
                        }
                    }
                }
            }
        }
    }

    let install_routes = crate::game_logic::get_install_routes(game_schema);
    let saved_coords = get_saved_coordinates();
    let live_root =
        crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, game_schema);
    let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
        &saved_coords,
        game_schema,
    ));
    let supported_exts_lower: Vec<String> =
        crate::game_logic::get_supported_extensions(game_schema)
            .into_iter()
            .map(|e| e.trim_start_matches('.').to_lowercase())
            .collect();
    let manifest_lower = crate::game_logic::resolve_manifest_filename(game_schema)
        .unwrap_or_default()
        .to_lowercase();
    let max_folder_depth = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.max_folder_depth);

    let mut routed_records: Vec<RoutedFileRecord> = Vec::new();
    let mut linked_names: Vec<String> = Vec::new();
    let mut deployed_links: Vec<String> = Vec::new();
    let mods_allowed_roots = [mods_dir.clone()];

    for (anchor_root, src_file) in files_to_link {
        let fname = match src_file.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let fname_lower = fname.to_lowercase();
        let ext_lower = src_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        if fname_lower.starts_with('.')
            || is_internal_sanctuary_or_archive_skip(
                &fname_lower,
                &ext_lower,
                &manifest_lower,
                &supported_exts_lower,
            )
        {
            continue;
        }

        let rel_sub = src_file
            .strip_prefix(&anchor_root)
            .map(|r| r.to_path_buf())
            .unwrap_or_else(|_| PathBuf::from(&fname));
        let rel_hint_str = rel_sub.to_string_lossy().replace('\\', "/");

        if let Some(rec) = route_file_if_matched(
            &src_file,
            &rel_hint_str,
            &install_routes,
            &live_root,
            &docs_root,
            &mods_dir,
        ) {
            routed_records.push(rec);
            linked_names.push(format!("{} (Routed)", rel_hint_str));
            continue;
        }

        // Preserve relative subpath within mod folder while respecting schema max_folder_depth if set
        let effective_rel: PathBuf = if let Some(max_d) = max_folder_depth {
            let comps: Vec<_> = rel_sub
                .components()
                .filter_map(|c| match c {
                    std::path::Component::Normal(os) => Some(os.to_os_string()),
                    _ => None,
                })
                .collect();
            let folder_depth = comps.len().saturating_sub(1);
            if folder_depth > max_d as usize {
                if max_d == 0 {
                    PathBuf::from(&fname)
                } else {
                    let mut capped = PathBuf::new();
                    for seg in comps.iter().take(max_d as usize) {
                        capped.push(seg);
                    }
                    capped.push(&fname);
                    capped
                }
            } else {
                rel_sub
            }
        } else {
            rel_sub
        };

        let dest_file = mods_dir.join(&effective_rel);
        if crate::utils::ensure_strict_descendant_of_roots(&dest_file, &mods_allowed_roots).is_err()
        {
            continue;
        }
        if let Some(parent_dir) = dest_file.parent() {
            let _ = std::fs::create_dir_all(parent_dir);
            let mut cur = Some(parent_dir);
            while let Some(dir_anc) = cur {
                if dir_anc == mods_dir.as_path() || !dir_anc.starts_with(&mods_dir) {
                    break;
                }
                let dir_str = dir_anc.to_string_lossy().to_string();
                if !deployed_links.contains(&dir_str) {
                    deployed_links.push(dir_str);
                }
                cur = dir_anc.parent();
            }
        }

        if dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok() {
            let _ = std::fs::remove_file(&dest_file);
        }

        let link_res = create_symlink_file(&src_file, &dest_file)
            .or_else(|_| std::fs::hard_link(&src_file, &dest_file))
            .or_else(|_| std::fs::copy(&src_file, &dest_file).map(|_| ()));

        if link_res.is_ok() && (dest_file.exists() || std::fs::symlink_metadata(&dest_file).is_ok())
        {
            let dest_str = dest_file.to_string_lossy().to_string();
            if !deployed_links.contains(&dest_str) {
                deployed_links.push(dest_str);
            }
            let display_rel = effective_rel.to_string_lossy().replace('\\', "/");
            if !linked_names.contains(&display_rel) {
                linked_names.push(display_rel);
            }
        }
    }

    // Activate load-order manifests & timestamps for Homestead Lab sessions as well
    let mut lab_entries: Vec<crate::load_order_engine::OrderedDeployEntry> = Vec::new();
    for dp_str in &deployed_links {
        let dp = Path::new(dp_str);
        if !dp.is_file() {
            continue;
        }
        let ext_l = dp
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !supported_exts_lower.is_empty() && !supported_exts_lower.contains(&ext_l) {
            continue;
        }
        let rel = dp
            .strip_prefix(&mods_dir)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if rel.is_empty() {
            continue;
        }
        let fname = dp.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        let stem = dp.file_stem().and_then(|s| s.to_str()).unwrap_or(&fname).to_string();
        let metadata = crate::load_order_engine::extract_metadata_for_path(dp, game_schema);
        lab_entries.push(crate::load_order_engine::OrderedDeployEntry {
            rel_path: rel,
            file_name: fname,
            stem,
            metadata,
            tier_folder: None,
            tier_priority: 0,
            deployed_path: Some(dp.to_path_buf()),
        });
    }
    if !lab_entries.is_empty() {
        let written = crate::load_order_engine::apply_load_order_outputs(
            game_schema,
            &mods_dir,
            &docs_root,
            &live_root,
            &lab_entries,
        );
        for wp in written {
            if wp.starts_with(&mods_dir) {
                let s = wp.to_string_lossy().to_string();
                if !deployed_links.contains(&s) {
                    deployed_links.push(s);
                }
            }
        }
    }

    if !deployed_links.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&deployed_links) {
            let _ = crate::utils::atomic_write_bytes(
                &mods_dir.join(".sanctuary_deployed_links.json"),
                json.as_bytes(),
            );
            crate::utils::set_vault_kv(vault_path, "deployed_links", &json);
        }
    }

    if !routed_records.is_empty() {
        if let Ok(json) = serde_json::to_string_pretty(&routed_records) {
            crate::utils::set_vault_kv(vault_path, "routed_links", &json);
        }
    }

    if linked_names.is_empty() {
        return Err(format!(
            "No supported mod files found to symlink for '{}'.",
            mod_path_or_name
        ));
    }

    Ok(linked_names)
}

#[tauri::command]
pub async fn deploy_mod_for_lab_test(
    mod_path_or_name: String,
    dna_hash: Option<String>,
    additional_mods: Option<Vec<String>>,
    is_sandbox: bool,
    mods_path: String,
    vault_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let game_schema = state.active_schema.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_deploying = state.inner().is_deploying.clone();
    let last_deploy_epoch_ms = state.inner().last_deploy_epoch_ms.clone();
    if is_deploying
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err("Deployment or scan already in progress.".into());
    }
    let guard = DeployGuard {
        flag: is_deploying,
        last_deploy_epoch_ms,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let extra = additional_mods.unwrap_or_default();
        deploy_single_mod_to_live_sync(
            &mod_path_or_name,
            dna_hash.as_deref(),
            &extra,
            is_sandbox,
            &mods_path,
            &vault_path,
            &game_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

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

