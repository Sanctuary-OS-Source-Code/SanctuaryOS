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

        let mut current = p.parent().map(|d| d.to_path_buf());
        while let Some(dir) = current {
            if dir.file_name().and_then(|s| s.to_str()) == Some("Mods") {
                break;
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
    match machine_uid::get() {
        Ok(uid) => Ok(uid),
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
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = std::process::Command::new("uname").arg("-r").output() {
            let ver_str = String::from_utf8_lossy(&output.stdout);
            os_version = ver_str.trim().to_string();
        }
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
