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
use super::lab_save_and_telemetry::*;
#[allow(unused_imports)]
use super::lab_staging::*;
#[allow(unused_imports)]
use super::lab_session::*;

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
    pub(super) mtime_ms: u128,
    pub(super) size_bytes: u64,
    pub(super) fingerprint: String,
}

#[derive(Clone, Debug)]
pub(super) struct PendingSaveCandidate {
    pub(super) path: PathBuf,
    pub(super) display_name: String,
    pub(super) prev_size_bytes: Option<u64>,
    pub(super) observed_size_bytes: u64,
    pub(super) observed_mtime_ms: u128,
    pub(super) detected_epoch: u64,
}

#[derive(Serialize, Clone, Debug)]
pub(super) struct LabMilestoneEvent {
    pub(super) kind: String,
    pub(super) title: String,
    pub(super) body: String,
    pub(super) dna_hash: String,
    pub(super) mod_name: String,
    pub(super) is_error: bool,
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
    pub(super) missing_process_ticks: u32,
    pub(super) last_focused_epoch: u64,
    pub(super) baseline_ram_bytes: u64,
    pub(super) baseline_disk_read_bytes: u64,
    pub(super) current_ram_bytes: u64,
    pub(super) cumulative_disk_read_bytes: u64,
    pub(super) cumulative_disk_write_bytes: u64,
    pub(super) prev_ram_bytes: u64,
    pub(super) prev_disk_read_bytes: u64,
    pub(super) prev_disk_write_bytes: u64,
    pub(super) current_cpu_usage: f32,
    pub(super) active_cpu_ema: f32,
    pub(super) sim_freeze_ticks: u32,
    pub(super) boot_plateau_ticks: u32,
    pub(super) peak_ram_bytes: u64,
    pub(super) peak_world_ram_delta_bytes: u64,
    pub(super) required_active_seconds: u32,
    pub(super) elapsed_active_seconds: u32,
    pub(super) pending_idle_seconds: u32,
    pub(super) recent_input_mask: u16,
    pub(super) stage3_ticks: u32,
    pub(super) consecutive_active_input_ticks: u32,
    pub(super) stage3_loading_cooldown_ticks: u32,
    pub(super) enable_hotkey_pause_detection: bool,
    pub(super) pause_key_vk_codes: Vec<u32>,
    pub(super) resume_key_vk_codes: Vec<u32>,
    pub(super) hotkey_menu_paused: bool,
    pub(super) hotkey_sim_paused: bool,
    pub(super) prev_vk_down: HashSet<u32>,
    pub(super) camera_drag_subticks: u8,
    pub(super) gamepad_packets: [u32; 4],
    pub(super) gamepad_connected_mask: u8,
    pub(super) last_xinput_probe_epoch: u64,
    pub(super) last_gamepad_input_epoch: u64,
    pub(super) max_idle_seconds: u32,
    pub(super) current_idle_seconds: u32,
    pub(super) require_focus: bool,
    pub(super) is_focused: bool,
    pub(super) require_save_checkpoint: bool,
    pub(super) stabilize_boot_seconds: u32,
    pub(super) min_disk_read_mb: u64,
    pub(super) min_ram_step_percent: u32,
    pub(super) warm_cache_ram_step_percent: u32,
    pub(super) seeded_save_present: bool,
    pub(super) seeded_baseline_save_size: Option<u64>,
    pub(super) initial_save_snapshots: HashMap<PathBuf, SaveSlotSnapshot>,
    pub(super) initial_scratch_files: HashMap<PathBuf, (u64, u128)>,
    pub(super) deployed_payload_fingerprints: Vec<(PathBuf, u64, String)>,
    pub(super) last_integrity_sweep_epoch: u64,
    pub(super) last_poll_epoch: u64,
    pub(super) linked_files: Vec<String>,
    pub(super) notification_labels: LabNotificationLabels,
    pub(super) notified_awaiting_save: bool,
    pub(super) notified_verified: bool,
    pub(super) notified_failed: bool,
    pub(super) error_log: Option<String>,
    pub(super) certificate: Option<LabVerificationCertificate>,
    pub(super) sys: sysinfo::System,
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
