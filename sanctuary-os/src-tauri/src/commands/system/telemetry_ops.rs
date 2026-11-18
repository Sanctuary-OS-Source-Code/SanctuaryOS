#![allow(unused_imports)]
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct NativeGamepadState {
    pub connected: bool,
    pub id: String,
    pub buttons: Vec<bool>,
    pub axes: Vec<f32>,
    pub seq: u64,
}

impl Default for NativeGamepadState {
    fn default() -> Self {
        Self {
            connected: false,
            id: String::new(),
            buttons: vec![false; 17],
            axes: vec![0.0; 4],
            seq: 0,
        }
    }
}

static NATIVE_GAMEPAD_STATE: std::sync::OnceLock<std::sync::Mutex<NativeGamepadState>> =
    std::sync::OnceLock::new();

fn gamepad_state_mutex() -> &'static std::sync::Mutex<NativeGamepadState> {
    NATIVE_GAMEPAD_STATE.get_or_init(|| std::sync::Mutex::new(NativeGamepadState::default()))
}

#[tauri::command]
pub fn get_native_gamepad_state() -> NativeGamepadState {
    gamepad_state_mutex()
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn open_steam_osk() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::thread::spawn(|| {
            let launched = std::process::Command::new("steam")
                .arg("steam://open/keyboard")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .is_ok();
            if !launched {
                let _ = std::process::Command::new("xdg-open")
                    .arg("steam://open/keyboard")
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn();
            }
        });
        return true;
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

pub fn start_linux_gamepad_poller(app: tauri::AppHandle) {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
    }
    #[cfg(target_os = "linux")]
    {
        use std::io::Read;
        use std::os::unix::fs::OpenOptionsExt;
        use std::os::unix::io::AsRawFd;
        use tauri::Emitter;

        #[repr(C)]
        #[derive(Clone, Copy, Default)]
        struct InputAbsInfo {
            value: i32,
            minimum: i32,
            maximum: i32,
            fuzz: i32,
            flat: i32,
            resolution: i32,
        }

        extern "C" {
            fn ioctl(
                fd: std::os::raw::c_int,
                request: std::os::raw::c_ulong,
                ...
            ) -> std::os::raw::c_int;
        }

        fn query_abs_bounds(file: &std::fs::File, code: u16) -> (i32, i32) {
            if code > 0x3f {
                return (0, 0);
            }
            let mut info = InputAbsInfo::default();
            // EVIOCGABS(code) = _IOR('E', 0x40 + code, struct input_absinfo) = 0x8018_4540 + code
            let req = (0x8018_4540u32 + (code as u32)) as std::os::raw::c_ulong;
            let rc = unsafe { ioctl(file.as_raw_fd(), req, &mut info as *mut InputAbsInfo) };
            if rc == 0 && info.maximum > info.minimum {
                (info.minimum, info.maximum)
            } else {
                (0, 0)
            }
        }

        fn norm_stick(val: i32, min: i32, max: i32) -> f32 {
            let f = if max > min {
                let mid = (min as f32 + max as f32) * 0.5;
                let half = (max as f32 - min as f32) * 0.5;
                ((val as f32 - mid) / half).clamp(-1.0, 1.0)
            } else {
                (val as f32 / 32767.0).clamp(-1.0, 1.0)
            };
            if f.abs() < 0.15 {
                0.0
            } else {
                f
            }
        }

        fn norm_trigger(val: i32, min: i32, max: i32) -> f32 {
            if max > min {
                ((val as f32 - min as f32) / (max as f32 - min as f32)).clamp(0.0, 1.0)
            } else {
                let denom = if val > 255 { 32767.0 } else { 255.0 };
                (val as f32 / denom).clamp(0.0, 1.0)
            }
        }

        fn parse_suffix_index(name: &str, prefix: &str) -> Option<u32> {
            name.strip_prefix(prefix)?.parse::<u32>().ok()
        }

        std::thread::spawn(move || {
            struct EvdevHandle {
                path: String,
                phys_dev: Option<std::path::PathBuf>,
                file: std::fs::File,
                name: String,
                abs_bounds: [(i32, i32); 32],
                hat_x: i32,
                hat_y: i32,
                l2_digital: bool,
                r2_digital: bool,
                l2_analog: bool,
                r2_analog: bool,
            }
            struct JsHandle {
                path: String,
                file: std::fs::File,
                name: String,
                hat_x: i16,
                hat_y: i16,
            }
            struct HidrawDeckHandle {
                path: String,
                file: std::fs::File,
                lpad_touch_frames: u32,
                prev_lpad_x: i32,
                prev_lpad_y: i32,
                rpad_touch_frames: u32,
                prev_rpad_x: i32,
                prev_rpad_y: i32,
                prev_rpad_click: bool,
            }

            let mut ev_handles: Vec<EvdevHandle> = Vec::new();
            let mut js_handles: Vec<JsHandle> = Vec::new();
            let mut hidraw_handles: Vec<HidrawDeckHandle> = Vec::new();
            let mut opened_paths: std::collections::HashSet<String> =
                std::collections::HashSet::new();
            let mut last_scan = std::time::Instant::now()
                .checked_sub(std::time::Duration::from_secs(10))
                .unwrap_or_else(std::time::Instant::now);

            let mut buttons = vec![false; 17];
            let mut axes = vec![0.0f32; 4];
            let mut active_name = String::new();
            let mut seq: u64 = 0;

            let is_excluded_input_name = |name: &str| -> bool {
                let lower = name.to_lowercase();
                lower.contains("motion")
                    || lower.contains("sensor")
                    || lower.contains("imu")
                    || lower.contains("gyro")
                    || lower.contains("accel")
                    || lower.contains("als")
                    || lower.contains("keyboard")
                    || lower.contains("mouse")
                    || lower.contains("touchpad")
                    || lower.contains("trackpad")
                    || lower.contains("touchscreen")
                    || lower.contains("power button")
                    || lower.contains("sleep button")
                    || lower.contains("video bus")
                    || lower.contains("lid switch")
                    || lower.contains("hd-audio")
                    || lower.contains("speaker")
                    || lower.contains("headphone")
                    || lower.contains("microphone")
                    || lower.contains("hdmi")
                    || lower.contains("acpi")
                    || lower.contains("pcspkr")
                    || lower.contains("wmi")
            };

            let is_gamepad_name = |name: &str| -> bool {
                if is_excluded_input_name(name) {
                    return false;
                }
                let lower = name.to_lowercase();
                lower.contains("pad")
                    || lower.contains("gamepad")
                    || lower.contains("controller")
                    || lower.contains("x-box")
                    || lower.contains("xbox")
                    || lower.contains("steam")
                    || lower.contains("deck")
                    || lower.contains("joystick")
                    || lower.contains("dualshock")
                    || lower.contains("dualsense")
                    || lower.contains("wireless controller")
                    || lower.contains("nintendo")
                    || lower.contains("8bitdo")
                    || lower.contains("hori")
                    || lower.contains("gulikit")
                    || lower.contains("gamesir")
            };

            let has_key_capabilities = |sys_cap_path: &str| -> bool {
                match std::fs::read_to_string(sys_cap_path) {
                    Ok(raw) => {
                        let trimmed = raw.trim();
                        !trimmed.is_empty()
                            && !trimmed.chars().all(|c| c == '0' || c.is_whitespace())
                    }
                    Err(_) => true,
                }
            };

            const TV_BYTES: usize = std::mem::size_of::<usize>() * 2;
            const EV_SIZE: usize = TV_BYTES + 8;

            loop {
                if (ev_handles.is_empty() && js_handles.is_empty() && hidraw_handles.is_empty())
                    || last_scan.elapsed() > std::time::Duration::from_secs(3)
                {
                    last_scan = std::time::Instant::now();

                    let mut event_nodes: Vec<(u32, String)> = Vec::new();
                    let mut js_nodes: Vec<(u32, String)> = Vec::new();
                    if let Ok(entries) = std::fs::read_dir("/dev/input") {
                        for entry in entries.flatten() {
                            let fname = entry.file_name().to_string_lossy().to_string();
                            if let Some(idx) = parse_suffix_index(&fname, "event") {
                                event_nodes.push((idx, fname));
                            } else if let Some(idx) = parse_suffix_index(&fname, "js") {
                                js_nodes.push((idx, fname));
                            }
                        }
                    }
                    event_nodes.sort_by_key(|(idx, _)| *idx);
                    js_nodes.sort_by_key(|(idx, _)| *idx);

                    for (_idx, ev_name) in event_nodes {
                        let dev_path = format!("/dev/input/{}", ev_name);
                        if opened_paths.contains(&dev_path) {
                            continue;
                        }
                        let sys_dev_dir = format!("/sys/class/input/{}/device", ev_name);
                        let sys_name_path = format!("{}/name", sys_dev_dir);
                        let dev_name = std::fs::read_to_string(&sys_name_path)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if is_excluded_input_name(&dev_name) {
                            continue;
                        }
                        let sys_cap_path = format!("{}/capabilities/key", sys_dev_dir);
                        if !has_key_capabilities(&sys_cap_path) {
                            continue;
                        }
                        let has_js_sibling = std::fs::read_dir(&sys_dev_dir)
                            .map(|iter| {
                                iter.flatten().any(|e| {
                                    let n = e.file_name();
                                    let s = n.to_string_lossy();
                                    parse_suffix_index(&s, "js").is_some()
                                })
                            })
                            .unwrap_or(false);
                        let uevent_is_joystick = std::fs::read_to_string(format!("{}/uevent", sys_dev_dir))
                            .map(|u| u.contains("ID_INPUT_JOYSTICK=1"))
                            .unwrap_or(false);
                        if !has_js_sibling && !uevent_is_joystick && !is_gamepad_name(&dev_name) {
                            continue;
                        }
                        if let Ok(file) = std::fs::OpenOptions::new()
                            .read(true)
                            .custom_flags(0o4000) // O_NONBLOCK
                            .open(&dev_path)
                        {
                            let mut abs_bounds = [(0i32, 0i32); 32];
                            for (code, slot) in abs_bounds.iter_mut().enumerate() {
                                *slot = query_abs_bounds(&file, code as u16);
                            }
                            let phys_dev = std::fs::canonicalize(&sys_dev_dir).ok();
                            let label = if dev_name.is_empty() {
                                "Steam Deck Controller".to_string()
                            } else {
                                dev_name
                            };
                            opened_paths.insert(dev_path.clone());
                            ev_handles.push(EvdevHandle {
                                path: dev_path,
                                phys_dev,
                                file,
                                name: label,
                                abs_bounds,
                                hat_x: 0,
                                hat_y: 0,
                                l2_digital: false,
                                r2_digital: false,
                                l2_analog: false,
                                r2_analog: false,
                            });
                        }
                    }

                    // Only open /dev/input/js* as a fallback for controllers whose /dev/input/event*
                    // could not be opened (prevents simultaneous evdev + joydev axis/button collisions
                    // on Steam Input's "Microsoft X-Box 360 pad 0").
                    for (_idx, js_name) in js_nodes {
                        let dev_path = format!("/dev/input/{}", js_name);
                        if opened_paths.contains(&dev_path) {
                            continue;
                        }
                        let sys_dev_dir = format!("/sys/class/input/{}/device", js_name);
                        let js_phys = std::fs::canonicalize(&sys_dev_dir).ok();
                        if js_phys.is_some()
                            && ev_handles.iter().any(|ev| ev.phys_dev == js_phys)
                        {
                            continue;
                        }
                        let sys_name_path = format!("{}/name", sys_dev_dir);
                        let dev_name = std::fs::read_to_string(&sys_name_path)
                            .unwrap_or_else(|_| "Steam Deck Controller".to_string())
                            .trim()
                            .to_string();
                        if is_excluded_input_name(&dev_name) {
                            continue;
                        }
                        let sys_cap_path = format!("{}/capabilities/key", sys_dev_dir);
                        if !has_key_capabilities(&sys_cap_path) {
                            continue;
                        }
                        if let Ok(file) = std::fs::OpenOptions::new()
                            .read(true)
                            .custom_flags(0o4000) // O_NONBLOCK
                            .open(&dev_path)
                        {
                            opened_paths.insert(dev_path.clone());
                            js_handles.push(JsHandle {
                                path: dev_path,
                                file,
                                name: if dev_name.is_empty() {
                                    "Steam Deck Controller".to_string()
                                } else {
                                    dev_name
                                },
                                hat_x: 0,
                                hat_y: 0,
                            });
                        }
                    }

                    // Open Valve Steam Deck Controller (28DE:1205 / 28DE:1206) /dev/hidraw* in read-only
                    // non-blocking mode for direct Trackpad scroll/pointer and standalone Deck input.
                    let mut hidraw_nodes: Vec<(u32, String)> = Vec::new();
                    if let Ok(entries) = std::fs::read_dir("/sys/class/hidraw") {
                        for entry in entries.flatten() {
                            let fname = entry.file_name().to_string_lossy().to_string();
                            if let Some(idx) = parse_suffix_index(&fname, "hidraw") {
                                hidraw_nodes.push((idx, fname));
                            }
                        }
                    }
                    hidraw_nodes.sort_by_key(|(idx, _)| *idx);

                    for (_idx, hid_name) in hidraw_nodes {
                        let dev_path = format!("/dev/{}", hid_name);
                        if opened_paths.contains(&dev_path)
                            || !std::path::Path::new(&dev_path).exists()
                        {
                            continue;
                        }
                        let uevent_path =
                            format!("/sys/class/hidraw/{}/device/uevent", hid_name);
                        let uevent = std::fs::read_to_string(&uevent_path)
                            .unwrap_or_default()
                            .to_uppercase();
                        if !uevent.contains("28DE")
                            || (!uevent.contains("1205") && !uevent.contains("1206"))
                        {
                            continue;
                        }
                        if let Ok(file) = std::fs::OpenOptions::new()
                            .read(true)
                            .custom_flags(0o4000) // O_NONBLOCK
                            .open(&dev_path)
                        {
                            opened_paths.insert(dev_path.clone());
                            hidraw_handles.push(HidrawDeckHandle {
                                path: dev_path,
                                file,
                                lpad_touch_frames: 0,
                                prev_lpad_x: 0,
                                prev_lpad_y: 0,
                                rpad_touch_frames: 0,
                                prev_rpad_x: 0,
                                prev_rpad_y: 0,
                                prev_rpad_click: false,
                            });
                        }
                    }
                }

                let prev_buttons = buttons.clone();
                let prev_axes = axes.clone();
                let prev_connected = !active_name.is_empty();
                let mut scroll_delta_y: f32 = 0.0;
                let mut scroll_delta_x: f32 = 0.0;
                let mut pointer_dx: f32 = 0.0;
                let mut pointer_dy: f32 = 0.0;
                let mut pointer_clicked = false;

                if !ev_handles.is_empty() {
                    if active_name.is_empty() {
                        active_name = ev_handles[0].name.clone();
                    }
                    let mut raw_buf = [0u8; EV_SIZE * 16];
                    let mut dead_indices = Vec::new();

                    for (h_idx, handle) in ev_handles.iter_mut().enumerate() {
                        loop {
                            match handle.file.read(&mut raw_buf) {
                                Ok(0) => break,
                                Ok(n) if n >= EV_SIZE => {
                                    active_name = handle.name.clone();
                                    let usable = n - (n % EV_SIZE);
                                    for buf in raw_buf[..usable].chunks_exact(EV_SIZE) {
                                        let ev_type =
                                            u16::from_ne_bytes([buf[TV_BYTES], buf[TV_BYTES + 1]]);
                                        let ev_code = u16::from_ne_bytes([
                                            buf[TV_BYTES + 2],
                                            buf[TV_BYTES + 3],
                                        ]);
                                        let ev_val = i32::from_ne_bytes([
                                            buf[TV_BYTES + 4],
                                            buf[TV_BYTES + 5],
                                            buf[TV_BYTES + 6],
                                            buf[TV_BYTES + 7],
                                        ]);

                                        if ev_type == 0x01 {
                                            // EV_KEY
                                            let pressed = ev_val != 0;
                                            match ev_code {
                                                0x138 => {
                                                    handle.l2_digital = pressed;
                                                    buttons[6] =
                                                        handle.l2_digital || handle.l2_analog;
                                                }
                                                0x139 => {
                                                    handle.r2_digital = pressed;
                                                    buttons[7] =
                                                        handle.r2_digital || handle.r2_analog;
                                                }
                                                _ => {
                                                    let mapped = match ev_code {
                                                        0x130 => Some(0),          // BTN_SOUTH (A)
                                                        0x131 | 0x132 => Some(1),  // BTN_EAST (B)
                                                        0x133 => Some(2),          // BTN_NORTH/WEST (X)
                                                        0x134 => Some(3),          // BTN_WEST/NORTH (Y)
                                                        0x136 => Some(4),          // BTN_TL (L1)
                                                        0x137 => Some(5),          // BTN_TR (R1)
                                                        0x13a => Some(8),          // BTN_SELECT (View)
                                                        0x13b => Some(9),          // BTN_START (Menu)
                                                        0x13d => Some(10),         // BTN_THUMBL (L3)
                                                        0x13e => Some(11),         // BTN_THUMBR (R3)
                                                        0x220 => Some(12),         // BTN_DPAD_UP
                                                        0x221 => Some(13),         // BTN_DPAD_DOWN
                                                        0x222 => Some(14),         // BTN_DPAD_LEFT
                                                        0x223 => Some(15),         // BTN_DPAD_RIGHT
                                                        0x13c | 0x126 => Some(16), // BTN_MODE (Steam) / BTN_BASE (QAM)
                                                        _ => None,
                                                    };
                                                    if let Some(b_idx) = mapped {
                                                        buttons[b_idx] = pressed;
                                                    }
                                                }
                                            }
                                        } else if ev_type == 0x02 {
                                            // EV_REL (REL_WHEEL / REL_HWHEEL / HI_RES)
                                            match ev_code {
                                                0x08 => {
                                                    scroll_delta_y -= (ev_val as f32) * 64.0;
                                                }
                                                0x06 => {
                                                    scroll_delta_x += (ev_val as f32) * 64.0;
                                                }
                                                0x0b => {
                                                    scroll_delta_y -=
                                                        ((ev_val as f32) / 120.0) * 64.0;
                                                }
                                                0x0c => {
                                                    scroll_delta_x +=
                                                        ((ev_val as f32) / 120.0) * 64.0;
                                                }
                                                _ => {}
                                            }
                                        } else if ev_type == 0x03 {
                                            // EV_ABS
                                            let (min_b, max_b) = if (ev_code as usize) < 32 {
                                                handle.abs_bounds[ev_code as usize]
                                            } else {
                                                (0, 0)
                                            };
                                            match ev_code {
                                                0x00 => {
                                                    axes[0] = norm_stick(ev_val, min_b, max_b);
                                                }
                                                0x01 => {
                                                    axes[1] = norm_stick(ev_val, min_b, max_b);
                                                }
                                                0x03 => {
                                                    axes[2] = norm_stick(ev_val, min_b, max_b);
                                                }
                                                0x04 => {
                                                    axes[3] = norm_stick(ev_val, min_b, max_b);
                                                }
                                                // Left Trigger: ABS_Z (0x02, xpad/Steam Input/DualSense), ABS_BRAKE (0x0a), ABS_HAT2Y (0x15, hid-steam)
                                                0x02 | 0x0a | 0x15 => {
                                                    handle.l2_analog =
                                                        norm_trigger(ev_val, min_b, max_b) > 0.28;
                                                    buttons[6] =
                                                        handle.l2_digital || handle.l2_analog;
                                                }
                                                // Right Trigger: ABS_RZ (0x05, xpad/Steam Input/DualSense), ABS_GAS (0x09), ABS_HAT2X (0x14, hid-steam)
                                                0x05 | 0x09 | 0x14 => {
                                                    handle.r2_analog =
                                                        norm_trigger(ev_val, min_b, max_b) > 0.28;
                                                    buttons[7] =
                                                        handle.r2_digital || handle.r2_analog;
                                                }
                                                0x10 => {
                                                    // ABS_HAT0X: digital D-Pad hat (-1..1) vs hid-steam Left Trackpad X (-32767..32767)
                                                    let is_digital_hat = if max_b > min_b {
                                                        max_b <= 2 && min_b >= -2
                                                    } else {
                                                        ev_val.abs() <= 1
                                                    };
                                                    if is_digital_hat {
                                                        handle.hat_x = ev_val;
                                                        buttons[14] = handle.hat_x < 0;
                                                        buttons[15] = handle.hat_x > 0;
                                                    } else {
                                                        if handle.hat_x != 0
                                                            && ev_val != 0
                                                            && hidraw_handles.is_empty()
                                                        {
                                                            let dx = ev_val - handle.hat_x;
                                                            if dx.abs() > 90 && dx.abs() < 16000 {
                                                                scroll_delta_x +=
                                                                    (dx as f32) * 0.025;
                                                            }
                                                        }
                                                        handle.hat_x = ev_val;
                                                    }
                                                }
                                                0x11 => {
                                                    // ABS_HAT0Y: digital D-Pad hat (-1..1) vs hid-steam Left Trackpad Y (-32767..32767)
                                                    let is_digital_hat = if max_b > min_b {
                                                        max_b <= 2 && min_b >= -2
                                                    } else {
                                                        ev_val.abs() <= 1
                                                    };
                                                    if is_digital_hat {
                                                        handle.hat_y = ev_val;
                                                        buttons[12] = handle.hat_y < 0;
                                                        buttons[13] = handle.hat_y > 0;
                                                    } else {
                                                        if handle.hat_y != 0
                                                            && ev_val != 0
                                                            && hidraw_handles.is_empty()
                                                        {
                                                            let dy = handle.hat_y - ev_val;
                                                            if dy.abs() > 70 && dy.abs() < 16000 {
                                                                scroll_delta_y +=
                                                                    (dy as f32) * 0.028;
                                                            }
                                                        }
                                                        handle.hat_y = ev_val;
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                                Ok(_) => break,
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                                Err(_) => {
                                    dead_indices.push(h_idx);
                                    break;
                                }
                            }
                        }
                    }
                    for idx in dead_indices.into_iter().rev() {
                        let removed = ev_handles.remove(idx);
                        opened_paths.remove(&removed.path);
                    }
                }

                if !js_handles.is_empty() {
                    if active_name.is_empty() {
                        active_name = js_handles[0].name.clone();
                    }
                    let mut buf = [0u8; 8];
                    let mut dead_indices = Vec::new();

                    for (h_idx, handle) in js_handles.iter_mut().enumerate() {
                        loop {
                            match handle.file.read_exact(&mut buf) {
                                Ok(()) => {
                                    active_name = handle.name.clone();
                                    let is_init = (buf[6] & 0x80) != 0;
                                    if is_init {
                                        continue;
                                    }
                                    let val = i16::from_ne_bytes([buf[4], buf[5]]);
                                    let ev_type = buf[6] & !0x80;
                                    let num = buf[7];
                                    if ev_type == 0x01 {
                                        // JS_EVENT_BUTTON
                                        let pressed = val != 0;
                                        let mapped = match num {
                                            0 => Some(0),
                                            1 => Some(1),
                                            2 => Some(2),
                                            3 => Some(3),
                                            4 => Some(4),
                                            5 => Some(5),
                                            6 => Some(8),   // Back/Select on xpad
                                            7 => Some(9),   // Start on xpad
                                            8 => Some(16),  // Guide on xpad
                                            9 => Some(10),  // L3
                                            10 => Some(11), // R3
                                            11 => Some(14), // D-Pad Left (digital xpad)
                                            12 => Some(15), // D-Pad Right (digital xpad)
                                            13 => Some(12), // D-Pad Up (digital xpad)
                                            14 => Some(13), // D-Pad Down (digital xpad)
                                            _ => None,
                                        };
                                        if let Some(b_idx) = mapped {
                                            buttons[b_idx] = pressed;
                                        }
                                    } else if ev_type == 0x02 {
                                        // JS_EVENT_AXIS
                                        match num {
                                            0 => axes[0] = norm_stick(val as i32, -32767, 32767),
                                            1 => axes[1] = norm_stick(val as i32, -32767, 32767),
                                            2 => buttons[6] = val > -12000, // LT (-32767 resting -> +32767 full pull)
                                            3 => axes[2] = norm_stick(val as i32, -32767, 32767),
                                            4 => axes[3] = norm_stick(val as i32, -32767, 32767),
                                            5 => buttons[7] = val > -12000, // RT (-32767 resting -> +32767 full pull)
                                            6 => {
                                                if val == 0 || val.abs() >= 32760 {
                                                    buttons[14] = val < -12000;
                                                    buttons[15] = val > 12000;
                                                }
                                                handle.hat_x = val;
                                            }
                                            7 => {
                                                if val == 0 || val.abs() >= 32760 {
                                                    buttons[12] = val < -12000;
                                                    buttons[13] = val > 12000;
                                                } else if handle.hat_y != 0
                                                    && handle.hat_y.abs() < 32760
                                                    && hidraw_handles.is_empty()
                                                {
                                                    let dy = (handle.hat_y as i32) - (val as i32);
                                                    if dy.abs() > 70 && dy.abs() < 16000 {
                                                        scroll_delta_y += (dy as f32) * 0.028;
                                                    }
                                                }
                                                handle.hat_y = val;
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                                Err(_) => {
                                    dead_indices.push(h_idx);
                                    break;
                                }
                            }
                        }
                    }
                    for idx in dead_indices.into_iter().rev() {
                        let removed = js_handles.remove(idx);
                        opened_paths.remove(&removed.path);
                    }
                }

                let has_ev_or_js = !ev_handles.is_empty() || !js_handles.is_empty();

                if !hidraw_handles.is_empty() {
                    let mut buf = [0u8; 65];
                    let mut dead_indices = Vec::new();
                    for (h_idx, handle) in hidraw_handles.iter_mut().enumerate() {
                        loop {
                            match handle.file.read(&mut buf) {
                                Ok(n) if n >= 56 => {
                                    // ID_CONTROLLER_DECK_STATE (0x09) 64-byte ValveInReport_t (with optional 1-byte report ID prefix)
                                    let base = if buf[0] == 0x01 && buf[1] == 0x00 && buf[2] == 0x09
                                    {
                                        0usize
                                    } else if n >= 57
                                        && buf[0] == 0x00
                                        && buf[1] == 0x01
                                        && buf[2] == 0x00
                                        && buf[3] == 0x09
                                    {
                                        1usize
                                    } else {
                                        continue;
                                    };

                                    if active_name.is_empty() {
                                        active_name = "Steam Deck Controller".to_string();
                                    }

                                    let buttons_l = u32::from_le_bytes([
                                        buf[base + 8],
                                        buf[base + 9],
                                        buf[base + 10],
                                        buf[base + 11],
                                    ]);
                                    let buttons_h = u32::from_le_bytes([
                                        buf[base + 12],
                                        buf[base + 13],
                                        buf[base + 14],
                                        buf[base + 15],
                                    ]);

                                    // 1. Left Trackpad Vertical & Horizontal Swipe -> Smooth Native Scroll
                                    let lpad_touched = (buttons_l & 0x0008_0000) != 0;
                                    let lpad_x = i16::from_le_bytes([
                                        buf[base + 16],
                                        buf[base + 17],
                                    ]) as i32;
                                    let lpad_y = i16::from_le_bytes([
                                        buf[base + 18],
                                        buf[base + 19],
                                    ]) as i32;

                                    if lpad_touched && (lpad_x != 0 || lpad_y != 0) {
                                        handle.lpad_touch_frames =
                                            handle.lpad_touch_frames.saturating_add(1);
                                        if handle.lpad_touch_frames > 2 {
                                            // On Steam Deck hardware, pad Y is +32767 at top and -32767 at bottom.
                                            let dy = handle.prev_lpad_y - lpad_y;
                                            let dx = lpad_x - handle.prev_lpad_x;
                                            if dy.abs() > 75 && dy.abs() < 5500 {
                                                scroll_delta_y +=
                                                    (dy.clamp(-2600, 2600) as f32) * 0.024;
                                            }
                                            if dx.abs() > 95 && dx.abs() < 5500 {
                                                scroll_delta_x +=
                                                    (dx.clamp(-2600, 2600) as f32) * 0.020;
                                            }
                                        }
                                        handle.prev_lpad_x = lpad_x;
                                        handle.prev_lpad_y = lpad_y;
                                    } else {
                                        handle.lpad_touch_frames = 0;
                                    }

                                    // 2. Right Trackpad Relative Pointer + Click (when not mapped to Right Stick)
                                    let rpad_mapped_to_rstick = has_ev_or_js
                                        && (axes[2].abs() > 0.08 || axes[3].abs() > 0.08);
                                    let rpad_touched = (buttons_l & 0x0010_0000) != 0;
                                    let rpad_click = (buttons_l & 0x0004_0000) != 0;
                                    let rpad_x = i16::from_le_bytes([
                                        buf[base + 20],
                                        buf[base + 21],
                                    ]) as i32;
                                    let rpad_y = i16::from_le_bytes([
                                        buf[base + 22],
                                        buf[base + 23],
                                    ]) as i32;

                                    if !rpad_mapped_to_rstick
                                        && rpad_touched
                                        && (rpad_x != 0 || rpad_y != 0)
                                    {
                                        handle.rpad_touch_frames =
                                            handle.rpad_touch_frames.saturating_add(1);
                                        if handle.rpad_touch_frames > 2 {
                                            let pdx = rpad_x - handle.prev_rpad_x;
                                            let pdy = handle.prev_rpad_y - rpad_y;
                                            if pdx.abs() > 45 && pdx.abs() < 6000 {
                                                pointer_dx +=
                                                    (pdx.clamp(-3000, 3000) as f32) * 0.028;
                                            }
                                            if pdy.abs() > 45 && pdy.abs() < 6000 {
                                                pointer_dy +=
                                                    (pdy.clamp(-3000, 3000) as f32) * 0.028;
                                            }
                                        }
                                        handle.prev_rpad_x = rpad_x;
                                        handle.prev_rpad_y = rpad_y;
                                    } else {
                                        handle.rpad_touch_frames = 0;
                                    }
                                    if !rpad_mapped_to_rstick
                                        && rpad_click
                                        && !handle.prev_rpad_click
                                    {
                                        pointer_clicked = true;
                                    }
                                    handle.prev_rpad_click = rpad_click;

                                    // 3. Complete Standalone Steam Deck Gamepad State when Steam Virtual Pad is absent
                                    if !has_ev_or_js {
                                        let trig_l = u16::from_le_bytes([
                                            buf[base + 44],
                                            buf[base + 45],
                                        ]);
                                        let trig_r = u16::from_le_bytes([
                                            buf[base + 46],
                                            buf[base + 47],
                                        ]);
                                        let lx = i16::from_le_bytes([
                                            buf[base + 48],
                                            buf[base + 49],
                                        ]) as i32;
                                        let ly = -(i16::from_le_bytes([
                                            buf[base + 50],
                                            buf[base + 51],
                                        ]) as i32);
                                        let rx = i16::from_le_bytes([
                                            buf[base + 52],
                                            buf[base + 53],
                                        ]) as i32;
                                        let ry = -(i16::from_le_bytes([
                                            buf[base + 54],
                                            buf[base + 55],
                                        ]) as i32);

                                        buttons[0] = (buttons_l & 0x0000_0080) != 0; // A
                                        buttons[1] = (buttons_l & 0x0000_0020) != 0; // B
                                        buttons[2] = (buttons_l & 0x0000_0040) != 0; // X
                                        buttons[3] = (buttons_l & 0x0000_0010) != 0; // Y
                                        buttons[4] = (buttons_l & 0x0000_0008) != 0; // L1
                                        buttons[5] = (buttons_l & 0x0000_0004) != 0; // R1
                                        buttons[6] =
                                            (buttons_l & 0x0000_0002) != 0 || trig_l > 8500; // L2
                                        buttons[7] =
                                            (buttons_l & 0x0000_0001) != 0 || trig_r > 8500; // R2
                                        buttons[8] = (buttons_l & 0x0000_1000) != 0; // View
                                        buttons[9] = (buttons_l & 0x0000_4000) != 0; // Menu
                                        buttons[10] = (buttons_l & 0x0040_0000) != 0; // L3
                                        buttons[11] = (buttons_l & 0x0400_0000) != 0; // R3
                                        buttons[12] = (buttons_l & 0x0000_0100) != 0; // D-Pad Up
                                        buttons[13] = (buttons_l & 0x0000_0800) != 0; // D-Pad Down
                                        buttons[14] = (buttons_l & 0x0000_0400) != 0; // D-Pad Left
                                        buttons[15] = (buttons_l & 0x0000_0200) != 0; // D-Pad Right
                                        buttons[16] = (buttons_l & 0x0000_2000) != 0
                                            || (buttons_h & 0x0004_0000) != 0; // Steam / QAM

                                        axes[0] = norm_stick(lx, -32767, 32767);
                                        axes[1] = norm_stick(ly, -32767, 32767);
                                        axes[2] = norm_stick(rx, -32767, 32767);
                                        axes[3] = norm_stick(ry, -32767, 32767);
                                    }
                                }
                                Ok(_) => break,
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                                Err(_) => {
                                    dead_indices.push(h_idx);
                                    break;
                                }
                            }
                        }
                    }
                    for idx in dead_indices.into_iter().rev() {
                        let removed = hidraw_handles.remove(idx);
                        opened_paths.remove(&removed.path);
                    }
                }

                if ev_handles.is_empty() && js_handles.is_empty() && hidraw_handles.is_empty() {
                    active_name.clear();
                    buttons.fill(false);
                    axes.fill(0.0);
                }

                let now_connected = !active_name.is_empty();
                let buttons_changed = buttons != prev_buttons;
                let axes_changed = axes
                    .iter()
                    .zip(prev_axes.iter())
                    .any(|(a, b)| (a - b).abs() > 0.025);

                if now_connected != prev_connected || buttons_changed || axes_changed {
                    seq = seq.wrapping_add(1);
                    let snapshot = NativeGamepadState {
                        connected: now_connected,
                        id: active_name.clone(),
                        buttons: buttons.clone(),
                        axes: axes.clone(),
                        seq,
                    };
                    if let Ok(mut guard) = gamepad_state_mutex().lock() {
                        *guard = snapshot.clone();
                    }
                    let _ = app.emit("sanctuary-native-gamepad", snapshot);
                }

                if scroll_delta_y.abs() >= 1.2 || scroll_delta_x.abs() >= 1.2 {
                    let _ = app.emit(
                        "sanctuary-native-scroll",
                        serde_json::json!({
                            "deltaY": scroll_delta_y,
                            "deltaX": scroll_delta_x,
                        }),
                    );
                }

                if pointer_dx.abs() >= 0.4 || pointer_dy.abs() >= 0.4 || pointer_clicked {
                    let _ = app.emit(
                        "sanctuary-native-pointer",
                        serde_json::json!({
                            "dx": pointer_dx,
                            "dy": pointer_dy,
                            "click": pointer_clicked,
                        }),
                    );
                }

                std::thread::sleep(std::time::Duration::from_millis(16));
            }
        });
    }
}
