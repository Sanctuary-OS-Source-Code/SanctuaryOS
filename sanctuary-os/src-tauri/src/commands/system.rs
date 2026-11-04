use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn delete_local_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !crate::utils::is_safe_user_file_path(p) {
        return Err("Refusing to delete protected or unsafe path.".into());
    }
    if p.exists() || std::fs::symlink_metadata(p).is_ok() {
        let mut deleted_file_names: Vec<String> = Vec::new();
        if p.is_dir() {
            for entry in walkdir::WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    if let Some(fname) = entry.file_name().to_str() {
                        deleted_file_names.push(fname.to_string());
                    }
                }
            }
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        } else {
            if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                deleted_file_names.push(fname.to_string());
            }
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
        }

        let saved_coords = crate::commands::state_ops::get_saved_coordinates();
        let mods_root = PathBuf::from(saved_coords.mods_path.trim());
        let vault_root = PathBuf::from(saved_coords.vault_path.trim());
        let live_root = PathBuf::from(saved_coords.live_path.trim());

        let mut current = p.parent().map(|d| d.to_path_buf());
        while let Some(dir) = current {
            if (!mods_root.as_os_str().is_empty() && dir == mods_root)
                || (!vault_root.as_os_str().is_empty() && dir == vault_root)
                || (!live_root.as_os_str().is_empty() && dir == live_root)
            {
                break;
            }
            if let Some(dir_name) = dir.file_name().and_then(|s| s.to_str()) {
                let lower = dir_name.to_lowercase();
                if matches!(
                    lower.as_str(),
                    "mods" | "_mods" | "data" | "paks" | "~mods" | "plugins" | "scripts" | "mod"
                ) {
                    break;
                }
            }
            if std::fs::remove_dir(&dir).is_err() {
                break;
            }
            current = dir.parent().map(|d| d.to_path_buf());
        }

        crate::utils::cleanup_live_counterparts_on_delete(p, &deleted_file_names);

        Ok("Deleted".into())
    } else {
        crate::utils::cleanup_live_counterparts_on_delete(p, &[]);
        Err("File not found".into())
    }
}

#[tauri::command]
pub fn get_hardware_id() -> Result<String, String> {
    use sha2::{Digest, Sha256};
    match machine_uid::get() {
        Ok(uid) => {
            let trimmed = uid.trim();
            if trimmed.is_empty() {
                return Err("Empty machine UID".into());
            }
            // Domain-salted one-way SHA-256 hash so raw hardware UUIDs never leave the Rust boundary
            let mut hasher = Sha256::new();
            hasher.update(b"sanctuary-os-zero-pii-hwid-v1:");
            hasher.update(trimmed.as_bytes());
            let digest = hasher.finalize();
            let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
            Ok(hex)
        }
        Err(e) => Err(format!("Failed to retrieve hardware ID: {}", e)),
    }
}

#[tauri::command]
pub fn check_symlink_permissions() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::symlink_file;
        let temp_dir = std::env::temp_dir();
        let target_path = temp_dir.join("sanctuary_symlink_test_target.txt");
        let link_path = temp_dir.join("sanctuary_symlink_test_link.txt");

        let _ = std::fs::write(&target_path, "test");
        let _ = std::fs::remove_file(&link_path);

        let result = symlink_file(&target_path, &link_path);

        let _ = std::fs::remove_file(&link_path);
        let _ = std::fs::remove_file(&target_path);

        Ok(result.is_ok())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub fn open_developer_settings() -> Result<(), String> {
    println!("Opening Developer Settings...");
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "ms-settings:developers"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn webview_eval(
    app_handle: tauri::AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    use tauri::Manager;
    if label == "main" || !label.starts_with("side-browser-tab-") {
        return Err("webview_eval is restricted to side-browser-tab-* webviews.".into());
    }
    if let Some(webview) = app_handle.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())
    } else {
        Err("Webview not found".into())
    }
}

#[tauri::command]
pub fn webview_url(app_handle: tauri::AppHandle, label: String) -> Result<String, String> {
    use tauri::Manager;
    if let Some(webview) = app_handle.get_webview(&label) {
        if let Ok(url) = webview.url() {
            Ok(url.to_string())
        } else {
            Err("URL not accessible".into())
        }
    } else {
        Err("Webview not found".into())
    }
}

#[tauri::command]
pub fn get_system_info(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let app_version = app_handle.package_info().version.to_string();

    let mut os_version = String::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "ver"])
            .output()
        {
            let ver_str = String::from_utf8_lossy(&output.stdout);
            let mut display_name = "Windows 10".to_string();
            if let Some(start) = ver_str.find("[Version ") {
                if let Some(end) = ver_str[start..].find(']') {
                    let version_part = &ver_str[start + 9..start + end];
                    let parts: Vec<&str> = version_part.split('.').collect();
                    if parts.len() >= 3 {
                        if let Ok(build) = parts[2].parse::<u32>() {
                            if build >= 22000 {
                                display_name = "Windows 11".to_string();
                            }
                        }
                    }
                    os_version = format!("{} (Build {})", display_name, version_part);
                } else {
                    os_version = ver_str.trim().to_string();
                }
            } else {
                os_version = ver_str.trim().to_string();
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let mut prod_name = String::new();
        let mut prod_ver = String::new();
        if let Ok(out) = std::process::Command::new("sw_vers")
            .arg("-productName")
            .output()
        {
            prod_name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
        if let Ok(out) = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
        {
            prod_ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
        os_version = match (prod_name.is_empty(), prod_ver.is_empty()) {
            (false, false) => format!("{} {}", prod_name, prod_ver),
            (false, true) => prod_name,
            (true, false) => format!("macOS {}", prod_ver),
            (true, true) => "macOS".to_string(),
        };
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let mut distro_name = String::new();
        if let Ok(os_rel) = std::fs::read_to_string("/etc/os-release") {
            for line in os_rel.lines() {
                if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
                    distro_name = val.trim().trim_matches('"').to_string();
                    break;
                }
            }
        }
        let is_steam_deck = std::env::var("SteamDeck")
            .or_else(|_| std::env::var("STEAM_DECK"))
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
            || distro_name.to_lowercase().contains("steamos")
            || std::fs::read_to_string("/sys/devices/virtual/dmi/id/product_name")
                .map(|s| {
                    let l = s.trim().to_lowercase();
                    l == "jupiter" || l == "galileo"
                })
                .unwrap_or(false);
        let mut kernel_ver = String::new();
        if let Ok(output) = std::process::Command::new("uname").arg("-r").output() {
            kernel_ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
        let base_os = match (distro_name.is_empty(), kernel_ver.is_empty()) {
            (false, false) => format!("{} (Kernel {})", distro_name, kernel_ver),
            (false, true) => distro_name,
            (true, false) => format!("{} {}", os, kernel_ver),
            (true, true) => os.to_string(),
        };
        os_version = if is_steam_deck && !base_os.to_lowercase().contains("steam deck") {
            format!("{} [Steam Deck]", base_os)
        } else {
            base_os
        };
    }

    let mut info = format!(
        "OS: {}\nArchitecture: {}\nSanctuary OS Version: {}\n",
        if os_version.is_empty() {
            os.to_string()
        } else {
            os_version.clone()
        },
        arch,
        app_version
    );

    if let Ok(log_dir) = app_handle.path().app_log_dir() {
        let log_file = log_dir.join("sanctuary-os.log");
        if log_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&log_file) {
                let chars: String = content.chars().rev().take(5000).collect();
                let last_logs: String = chars.chars().rev().collect();
                info.push_str("\n--- APP LOGS ---\n");
                info.push_str(&last_logs);
            }
        }

        let panic_file = log_dir.join("panic.log");
        if panic_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&panic_file) {
                info.push_str("\n--- PANIC LOGS ---\n");
                info.push_str(&content);
            }
        }
    }

    Ok(crate::utils::scrub_user_data_from_log(&info))
}

#[cfg(target_os = "windows")]
const SANCTUARY_NOTIFICATION_AUMID: &str = "sanctuary-os";

#[cfg(target_os = "windows")]
const SANCTUARY_NOTIFICATION_ICON: &[u8] = include_bytes!("../../icons/128x128.png");

#[cfg(target_os = "windows")]
static AUMID_ICON_PATH: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();

/// Ensures `HKCU\Software\Classes\AppUserModelId\sanctuary-os` is registered for the current user
/// with the "Sanctuary OS" display name and icon so Windows Toast notifications show
/// "Sanctuary OS" instead of "Windows PowerShell" in both dev and portable/release modes.
pub fn ensure_windows_aumid_registered() {
    #[cfg(target_os = "windows")]
    {
        let _ = AUMID_ICON_PATH.get_or_init(|| {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let app_dir = dirs::data_local_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("sanctuary-os");
            let _ = std::fs::create_dir_all(&app_dir);

            let icon_path = app_dir.join("sanctuary-notification-icon.png");
            let should_write = match std::fs::metadata(&icon_path) {
                Ok(meta) => meta.len() != SANCTUARY_NOTIFICATION_ICON.len() as u64,
                Err(_) => true,
            };
            if should_write {
                let _ = std::fs::write(&icon_path, SANCTUARY_NOTIFICATION_ICON);
            }

            let reg_key = format!(
                r"HKCU\Software\Classes\AppUserModelId\{}",
                SANCTUARY_NOTIFICATION_AUMID
            );

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    &reg_key,
                    "/v",
                    "DisplayName",
                    "/t",
                    "REG_SZ",
                    "/d",
                    "Sanctuary OS",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            if let Some(icon_str) = icon_path.to_str() {
                let _ = std::process::Command::new("reg")
                    .args([
                        "add",
                        &reg_key,
                        "/v",
                        "IconUri",
                        "/t",
                        "REG_SZ",
                        "/d",
                        icon_str,
                        "/f",
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    &reg_key,
                    "/v",
                    "IconBackgroundColor",
                    "/t",
                    "REG_SZ",
                    "/d",
                    "00000000",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            Some(icon_path)
        });
    }
}

#[tauri::command]
pub fn send_sanctuary_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = &app;
        ensure_windows_aumid_registered();
        let toast_result = tauri_winrt_notification::Toast::new(SANCTUARY_NOTIFICATION_AUMID)
            .title(&title)
            .text1(&body)
            .show();

        if let Err(err) = toast_result {
            // Fallback to PowerShell App ID only if custom AUMID toast fails
            tauri_winrt_notification::Toast::new(
                tauri_winrt_notification::Toast::POWERSHELL_APP_ID,
            )
            .title(&title)
            .text1(&body)
            .show()
            .map_err(|fallback_err| format!("{:?} (fallback: {:?})", err, fallback_err))?;
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(&title)
            .body(&body)
            .show()
            .map_err(|e| e.to_string())
    }
}


#[derive(Serialize, Deserialize, Clone)]
pub struct LocalDirectiveSnapshot {
    pub slug: String,
    pub file_path: String,
    pub content: String,
    pub modified_epoch_ms: u64,
}

fn resolve_directive_file_path(slug: &str) -> Result<PathBuf, String> {
    let filename = match slug {
        "citizen_guide" => "Citizen Guide.md",
        "phase_roadmap" => "Phase Roadmap.md",
        "forking_guide" => "Sanctuary OS Forking & Architecture Guide.md",
        "master_architecture" => "Master Architecture & Feature Document.md",
        "master_protocols" => "Master Protocol List.md",
        "compliance_protocol" => "Compliance Protocol.md",
        "partners_agreement" => "Partners Agreement.md",
        "eula" => "EULA.md",
        "privacy" => "Privacy Policy.md",
        "terms" => "Terms of Service.md",
        "release_notes_public" => "Release Notes (Community Blog).md",
        "release_notes_dev" => "Release Notes (Dev).md",
        "changelog_running" => "changelog (running).md",
        "changelog_dev" => "changelog.md",
        _ => return Err(format!("Unknown directive slug: {}", slug)),
    };

    for prefix in ["../../", "../", "./"] {
        let candidate = PathBuf::from(format!("{}{}", prefix, filename));
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Ok(PathBuf::from(format!("../../{}", filename)))
}

#[tauri::command]
pub fn read_local_directives() -> Result<Vec<LocalDirectiveSnapshot>, String> {
    let slugs = [
        "citizen_guide",
        "phase_roadmap",
        "forking_guide",
        "master_architecture",
        "master_protocols",
        "compliance_protocol",
        "partners_agreement",
        "eula",
        "privacy",
        "terms",
        "release_notes_public",
        "release_notes_dev",
        "changelog_running",
        "changelog_dev",
    ];
    let mut results = Vec::new();
    for slug in slugs {
        let path = resolve_directive_file_path(slug)?;
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let modified_epoch_ms = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            results.push(LocalDirectiveSnapshot {
                slug: slug.to_string(),
                file_path: path.to_string_lossy().to_string(),
                content,
                modified_epoch_ms,
            });
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn write_local_directive(slug: String, content: String) -> Result<u64, String> {
    let path = resolve_directive_file_path(&slug)?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    let modified_epoch_ms = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(modified_epoch_ms)
}


fn sanitize_screenshot_segment(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().replace(' ', "_");
    if trimmed.is_empty() {
        "Sanctuary".to_string()
    } else {
        trimmed
    }
}

pub fn resolve_screenshots_base_dir() -> PathBuf {
    let coords = crate::commands::state_ops::get_saved_coordinates();
    if !coords.vault_path.trim().is_empty() {
        return PathBuf::from(coords.vault_path.trim()).join("Screenshots");
    }
    dirs::desktop_dir()
        .or_else(dirs::picture_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join("Sanctuary_Screenshots")
}

#[tauri::command]
pub fn get_screenshots_root_dir() -> Result<String, String> {
    let base = resolve_screenshots_base_dir();
    let _ = std::fs::create_dir_all(&base);
    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_screenshots_dir() -> Result<String, String> {
    let base = resolve_screenshots_base_dir();
    let _ = std::fs::create_dir_all(&base);
    let path_str = base.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(path_str)
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.exists() {
        return Err("Path does not exist".into());
    }
    #[cfg(target_os = "windows")]
    {
        if p.is_file() {
            std::process::Command::new("explorer")
                .arg(format!("/select,{}", p.to_string_lossy()))
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("explorer")
                .arg(&p)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if p.is_file() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&p)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("open")
                .arg(&p)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir_to_open = if p.is_file() {
            p.parent().unwrap_or(&p).to_path_buf()
        } else {
            p
        };
        std::process::Command::new("xdg-open")
            .arg(&dir_to_open)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn crc32_ieee(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in bytes {
        crc ^= b as u32;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

fn write_png_chunk(out: &mut Vec<u8>, chunk_type: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(chunk_type);
    out.extend_from_slice(data);
    let mut crc_input = Vec::with_capacity(4 + data.len());
    crc_input.extend_from_slice(chunk_type);
    crc_input.extend_from_slice(data);
    let crc = crc32_ieee(&crc_input);
    out.extend_from_slice(&crc.to_be_bytes());
}

fn encode_bgra_to_png(width: u32, height: u32, bgra: &[u8]) -> Result<Vec<u8>, String> {
    use flate2::write::ZlibEncoder;
    use flate2::Compression;
    use std::io::Write;

    let row_bytes = (width as usize) * 4;
    let mut raw_scanlines = Vec::with_capacity((row_bytes + 1) * (height as usize));

    for y in 0..(height as usize) {
        raw_scanlines.push(0u8);
        let row_start = y * row_bytes;
        let row = &bgra[row_start..row_start + row_bytes];
        for px in row.chunks_exact(4) {
            raw_scanlines.push(px[2]);
            raw_scanlines.push(px[1]);
            raw_scanlines.push(px[0]);
            raw_scanlines.push(255u8);
        }
    }

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
    encoder
        .write_all(&raw_scanlines)
        .map_err(|e| format!("PNG compression failed: {}", e))?;
    let compressed = encoder
        .finish()
        .map_err(|e| format!("PNG stream finish failed: {}", e))?;

    let mut png = Vec::with_capacity(64 + compressed.len());
    png.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.push(8);
    ihdr.push(6);
    ihdr.push(0);
    ihdr.push(0);
    ihdr.push(0);
    write_png_chunk(&mut png, b"IHDR", &ihdr);
    write_png_chunk(&mut png, b"IDAT", &compressed);
    write_png_chunk(&mut png, b"IEND", &[]);

    Ok(png)
}

#[tauri::command]
pub fn capture_window_screenshot(
    app_handle: tauri::AppHandle,
    theme_folder: String,
    file_name: String,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        #[repr(C)]
        struct WinRect {
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
        }

        #[repr(C)]
        struct BitmapInfoHeader {
            bi_size: u32,
            bi_width: i32,
            bi_height: i32,
            bi_planes: u16,
            bi_bit_count: u16,
            bi_compression: u32,
            bi_size_image: u32,
            bi_x_pels_per_meter: i32,
            bi_y_pels_per_meter: i32,
            bi_clr_used: u32,
            bi_clr_important: u32,
        }

        #[link(name = "user32")]
        extern "system" {
            fn GetClientRect(hwnd: isize, lprect: *mut WinRect) -> i32;
            fn GetDC(hwnd: isize) -> isize;
            fn ReleaseDC(hwnd: isize, hdc: isize) -> i32;
            fn PrintWindow(hwnd: isize, hdc_blt: isize, n_flags: u32) -> i32;
        }

        #[link(name = "gdi32")]
        extern "system" {
            fn CreateCompatibleDC(hdc: isize) -> isize;
            fn DeleteDC(hdc: isize) -> i32;
            fn CreateDIBSection(
                hdc: isize,
                pbmi: *const BitmapInfoHeader,
                usage: u32,
                ppv_bits: *mut *mut u8,
                h_section: isize,
                offset: u32,
            ) -> isize;
            fn SelectObject(hdc: isize, h: isize) -> isize;
            fn DeleteObject(ho: isize) -> i32;
        }

        let window = app_handle
            .get_webview_window("main")
            .ok_or_else(|| "Main application window not found.".to_string())?;
        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = hwnd_raw.0 as isize;

        unsafe {
            let mut rect = WinRect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetClientRect(hwnd, &mut rect) == 0 {
                return Err("GetClientRect failed for main window.".into());
            }
            let width = (rect.right - rect.left).max(1);
            let height = (rect.bottom - rect.top).max(1);

            let hdc_win = GetDC(hwnd);
            if hdc_win == 0 {
                return Err("GetDC failed for main window.".into());
            }

            let hdc_mem = CreateCompatibleDC(hdc_win);
            if hdc_mem == 0 {
                ReleaseDC(hwnd, hdc_win);
                return Err("CreateCompatibleDC failed.".into());
            }

            let bmi = BitmapInfoHeader {
                bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                bi_width: width,
                bi_height: -height,
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: 0,
                bi_size_image: (width * height * 4) as u32,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            };

            let mut bits_ptr: *mut u8 = std::ptr::null_mut();
            let hbitmap = CreateDIBSection(hdc_mem, &bmi, 0, &mut bits_ptr, 0, 0);
            if hbitmap == 0 || bits_ptr.is_null() {
                DeleteDC(hdc_mem);
                ReleaseDC(hwnd, hdc_win);
                return Err("CreateDIBSection failed.".into());
            }

            let old_obj = SelectObject(hdc_mem, hbitmap);
            let rendered = PrintWindow(hwnd, hdc_mem, 2);
            if rendered == 0 {
                let _ = PrintWindow(hwnd, hdc_mem, 0);
            }

            let byte_len = (width as usize) * (height as usize) * 4;
            let pixel_slice = std::slice::from_raw_parts(bits_ptr, byte_len);
            let png_bytes = encode_bgra_to_png(width as u32, height as u32, pixel_slice);

            SelectObject(hdc_mem, old_obj);
            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(hwnd, hdc_win);

            let png_data = png_bytes?;
            let safe_theme = sanitize_screenshot_segment(&theme_folder);
            let safe_file = sanitize_screenshot_segment(&file_name);
            let out_dir = resolve_screenshots_base_dir().join(&safe_theme);
            std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
            let out_file = out_dir.join(format!("{}.png", safe_file));
            std::fs::write(&out_file, png_data).map_err(|e| e.to_string())?;

            Ok(out_file.to_string_lossy().to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, theme_folder, file_name);
        Err("Native window capture is only supported on Windows.".into())
    }
}

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
        use tauri::Emitter;

        std::thread::spawn(move || {
            struct EvdevHandle {
                path: String,
                file: std::fs::File,
                name: String,
                hat_x: i32,
                hat_y: i32,
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
                lpad_was_touched: bool,
                prev_lpad_x: i32,
                prev_lpad_y: i32,
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

            let norm_axis = |val: i32| -> f32 {
                let f = (val as f32 / 32767.0).clamp(-1.0, 1.0);
                if f.abs() < 0.18 {
                    0.0
                } else {
                    f
                }
            };

            loop {
                if (ev_handles.is_empty() && js_handles.is_empty())
                    || last_scan.elapsed() > std::time::Duration::from_secs(3)
                {
                    last_scan = std::time::Instant::now();
                    for idx in 0..32 {
                        let dev_path = format!("/dev/input/event{}", idx);
                        if opened_paths.contains(&dev_path)
                            || !std::path::Path::new(&dev_path).exists()
                        {
                            continue;
                        }
                        let sys_name_path =
                            format!("/sys/class/input/event{}/device/name", idx);
                        let dev_name = std::fs::read_to_string(&sys_name_path)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if is_excluded_input_name(&dev_name) {
                            continue;
                        }
                        let sys_cap_path =
                            format!("/sys/class/input/event{}/device/capabilities/key", idx);
                        if !has_key_capabilities(&sys_cap_path) {
                            continue;
                        }
                        let has_js_sibling = (0..8).any(|j| {
                            std::path::Path::new(&format!(
                                "/sys/class/input/event{}/device/js{}",
                                idx, j
                            ))
                            .exists()
                        });
                        if !has_js_sibling && !is_gamepad_name(&dev_name) {
                            continue;
                        }
                        if let Ok(file) = std::fs::OpenOptions::new()
                            .read(true)
                            .custom_flags(0o4000) // O_NONBLOCK
                            .open(&dev_path)
                        {
                            let label = if dev_name.is_empty() {
                                "Steam Deck Controller".to_string()
                            } else {
                                dev_name
                            };
                            opened_paths.insert(dev_path.clone());
                            ev_handles.push(EvdevHandle {
                                path: dev_path,
                                file,
                                name: label,
                                hat_x: 0,
                                hat_y: 0,
                            });
                        }
                    }

                    for idx in 0..8 {
                        let dev_path = format!("/dev/input/js{}", idx);
                        if opened_paths.contains(&dev_path)
                            || !std::path::Path::new(&dev_path).exists()
                        {
                            continue;
                        }
                        let sys_name_path = format!("/sys/class/input/js{}/device/name", idx);
                        let dev_name = std::fs::read_to_string(&sys_name_path)
                            .unwrap_or_else(|_| "Steam Deck Controller".to_string())
                            .trim()
                            .to_string();
                        if is_excluded_input_name(&dev_name) {
                            continue;
                        }
                        let sys_cap_path =
                            format!("/sys/class/input/js{}/device/capabilities/key", idx);
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

                    // Open Valve Steam Deck Controller (28DE:1205) /dev/hidraw* in read-only non-blocking mode
                    // so Left Trackpad vertical/circular swipes work even when Steam Client unregisters hid-steam evdev
                    for idx in 0..16 {
                        let dev_path = format!("/dev/hidraw{}", idx);
                        if opened_paths.contains(&dev_path)
                            || !std::path::Path::new(&dev_path).exists()
                        {
                            continue;
                        }
                        let uevent_path =
                            format!("/sys/class/hidraw/hidraw{}/device/uevent", idx);
                        let uevent = std::fs::read_to_string(&uevent_path)
                            .unwrap_or_default()
                            .to_uppercase();
                        if !uevent.contains("28DE") || !uevent.contains("1205") {
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
                                lpad_was_touched: false,
                                prev_lpad_x: 0,
                                prev_lpad_y: 0,
                            });
                        }
                    }
                }

                let prev_buttons = buttons.clone();
                let prev_axes = axes.clone();
                let prev_connected = !active_name.is_empty();
                let mut scroll_delta_y: f32 = 0.0;

                if !hidraw_handles.is_empty() {
                    let mut buf = [0u8; 64];
                    let mut dead_indices = Vec::new();
                    for (h_idx, handle) in hidraw_handles.iter_mut().enumerate() {
                        loop {
                            match handle.file.read(&mut buf) {
                                Ok(n) if n >= 20 => {
                                    // ID_CONTROLLER_DECK_STATE (0x09) 64-byte Steam Deck HID input report
                                    if buf[0] == 0x01 && buf[2] == 0x09 {
                                        if active_name.is_empty() {
                                            active_name = "Steam Deck Controller".to_string();
                                        }
                                        let lpad_touched = (buf[10] & 0x08) != 0;
                                        let lpad_x =
                                            i16::from_le_bytes([buf[16], buf[17]]) as i32;
                                        let lpad_y =
                                            i16::from_le_bytes([buf[18], buf[19]]) as i32;

                                        if lpad_touched && (lpad_x != 0 || lpad_y != 0) {
                                            if handle.lpad_was_touched {
                                                // On Steam Deck hardware, lpad_y is +32767 at top and -32767 at bottom.
                                                // Sliding thumb down decreases lpad_y -> positive dy scrolls down.
                                                let dy = handle.prev_lpad_y - lpad_y;
                                                let dx = lpad_x - handle.prev_lpad_x;
                                                let dominant = if dy.abs() >= dx.abs() {
                                                    dy
                                                } else {
                                                    dx
                                                };
                                                if dominant.abs() > 70 && dominant.abs() < 16000 {
                                                    scroll_delta_y += (dominant as f32) * 0.036;
                                                }
                                            }
                                            handle.lpad_was_touched = true;
                                            handle.prev_lpad_x = lpad_x;
                                            handle.prev_lpad_y = lpad_y;
                                        } else {
                                            handle.lpad_was_touched = false;
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
                        let removed = hidraw_handles.remove(idx);
                        opened_paths.remove(&removed.path);
                    }
                }

                if !ev_handles.is_empty() {
                    if active_name.is_empty() {
                        active_name = ev_handles[0].name.clone();
                    }
                    let mut buf = [0u8; 24];
                    let mut dead_indices = Vec::new();

                    for (h_idx, handle) in ev_handles.iter_mut().enumerate() {
                        loop {
                            match handle.file.read_exact(&mut buf) {
                                Ok(()) => {
                                    active_name = handle.name.clone();
                                    let ev_type = u16::from_ne_bytes([buf[16], buf[17]]);
                                    let ev_code = u16::from_ne_bytes([buf[18], buf[19]]);
                                    let ev_val =
                                        i32::from_ne_bytes([buf[20], buf[21], buf[22], buf[23]]);

                                    if ev_type == 0x01 {
                                        // EV_KEY
                                        let pressed = ev_val != 0;
                                        let mapped = match ev_code {
                                            0x130 => Some(0),         // BTN_SOUTH (A)
                                            0x131 | 0x132 => Some(1), // BTN_EAST (B)
                                            0x133 => Some(2),         // BTN_NORTH/WEST (X)
                                            0x134 => Some(3),         // BTN_WEST/NORTH (Y)
                                            0x136 => Some(4),         // BTN_TL (L1)
                                            0x137 => Some(5),         // BTN_TR (R1)
                                            0x138 => Some(6),         // BTN_TL2 (L2)
                                            0x139 => Some(7),         // BTN_TR2 (R2)
                                            0x13a => Some(8),         // BTN_SELECT (View)
                                            0x13b => Some(9),         // BTN_START (Menu)
                                            0x13d => Some(10),        // BTN_THUMBL (L3)
                                            0x13e => Some(11),        // BTN_THUMBR (R3)
                                            0x220 => Some(12),        // BTN_DPAD_UP
                                            0x221 => Some(13),        // BTN_DPAD_DOWN
                                            0x222 => Some(14),        // BTN_DPAD_LEFT
                                            0x223 => Some(15),        // BTN_DPAD_RIGHT
                                            0x13c | 0x126 => Some(16), // BTN_MODE (Steam) / BTN_BASE (Quick Access)
                                            _ => None,
                                        };
                                        if let Some(b_idx) = mapped {
                                            buttons[b_idx] = pressed;
                                        }
                                    } else if ev_type == 0x02 {
                                        // EV_REL (REL_WHEEL / REL_HWHEEL / HI_RES)
                                        match ev_code {
                                            0x08 => {
                                                // REL_WHEEL (>0 is scroll up, <0 is scroll down)
                                                scroll_delta_y -= (ev_val as f32) * 64.0;
                                            }
                                            0x06 => {
                                                // REL_HWHEEL
                                                scroll_delta_y += (ev_val as f32) * 64.0;
                                            }
                                            0x0b => {
                                                // REL_WHEEL_HI_RES
                                                scroll_delta_y -= ((ev_val as f32) / 120.0) * 64.0;
                                            }
                                            0x0c => {
                                                // REL_HWHEEL_HI_RES
                                                scroll_delta_y += ((ev_val as f32) / 120.0) * 64.0;
                                            }
                                            _ => {}
                                        }
                                    } else if ev_type == 0x03 {
                                        // EV_ABS
                                        match ev_code {
                                            0x00 => {
                                                axes[0] = norm_axis(ev_val);
                                            }
                                            0x01 => {
                                                axes[1] = norm_axis(ev_val);
                                            }
                                            0x03 => {
                                                axes[2] = norm_axis(ev_val);
                                            }
                                            0x04 => {
                                                axes[3] = norm_axis(ev_val);
                                            }
                                            0x0a | 0x14 => {
                                                buttons[6] = ev_val > 200;
                                            }
                                            0x09 | 0x15 => {
                                                buttons[7] = ev_val > 200;
                                            }
                                            0x10 => {
                                                // ABS_HAT0X: digital D-Pad hat (-1..1) vs hid-steam Left Trackpad X (-32767..32767)
                                                if ev_val.abs() <= 1 {
                                                    handle.hat_x = ev_val;
                                                    buttons[14] = handle.hat_x < 0;
                                                    buttons[15] = handle.hat_x > 0;
                                                } else {
                                                    handle.hat_x = ev_val;
                                                }
                                            }
                                            0x11 => {
                                                // ABS_HAT0Y: digital D-Pad hat (-1..1) vs hid-steam Left Trackpad Y (-32767..32767)
                                                if ev_val.abs() <= 1 {
                                                    handle.hat_y = ev_val;
                                                    buttons[12] = handle.hat_y < 0;
                                                    buttons[13] = handle.hat_y > 0;
                                                } else {
                                                    if handle.hat_y != 0 && ev_val != 0 && hidraw_handles.is_empty() {
                                                        let dy = ev_val - handle.hat_y;
                                                        if dy.abs() > 70 && dy.abs() < 16000 {
                                                            scroll_delta_y += (dy as f32) * 0.036;
                                                        }
                                                    }
                                                    handle.hat_y = ev_val;
                                                }
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
                                            6 => Some(8),  // Back/Select on xpad
                                            7 => Some(9),  // Start on xpad
                                            8 => Some(16), // Guide on xpad
                                            9 => Some(10), // L3
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
                                            0 => axes[0] = norm_axis(val as i32),
                                            1 => axes[1] = norm_axis(val as i32),
                                            2 => buttons[6] = val > 16000, // LT (-32767 resting -> +32767 pressed)
                                            3 => axes[2] = norm_axis(val as i32),
                                            4 => axes[3] = norm_axis(val as i32),
                                            5 => buttons[7] = val > 16000, // RT (-32767 resting -> +32767 pressed)
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
                                                    let dy = (val as i32) - (handle.hat_y as i32);
                                                    if dy.abs() > 70 && dy.abs() < 16000 {
                                                        scroll_delta_y += (dy as f32) * 0.036;
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

                if ev_handles.is_empty() && js_handles.is_empty() {
                    active_name.clear();
                    buttons.fill(false);
                    axes.fill(0.0);
                }

                let now_connected = !active_name.is_empty();
                let buttons_changed = buttons != prev_buttons;
                let axes_changed = axes
                    .iter()
                    .zip(prev_axes.iter())
                    .any(|(a, b)| (a - b).abs() > 0.08);

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

                if scroll_delta_y.abs() >= 1.5 {
                    let _ = app.emit(
                        "sanctuary-native-scroll",
                        serde_json::json!({ "deltaY": scroll_delta_y }),
                    );
                }

                std::thread::sleep(std::time::Duration::from_millis(24));
            }
        });
    }
}

