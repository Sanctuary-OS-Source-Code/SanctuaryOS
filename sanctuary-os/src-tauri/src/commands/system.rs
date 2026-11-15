use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn delete_local_file(
    path: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !crate::utils::is_safe_user_file_path(p) {
        return Err("Refusing to delete protected or unsafe path.".into());
    }

    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    let active_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    if crate::utils::is_protected_save_or_airgap_path(p, &saved_coords, &active_schema) {
        return Err("Refusing to delete protected user save or Lab Airgap vault file.".into());
    }
    let mut allowed_roots = crate::utils::get_allowed_workspace_roots(&saved_coords);
    for user_dir in [
        dirs::download_dir(),
        dirs::desktop_dir(),
        dirs::document_dir(),
    ]
    .into_iter()
    .flatten()
    {
        allowed_roots.push(user_dir);
    }
    if allowed_roots.is_empty() {
        return Err("Refusing to delete file before workspace roots are configured.".into());
    }
    let sym_meta = std::fs::symlink_metadata(p);
    let is_link = sym_meta
        .as_ref()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
        || std::fs::read_link(p).is_ok();
    if is_link {
        if let Some(parent) = p.parent() {
            crate::utils::ensure_path_within_roots(parent, &allowed_roots)?;
        } else {
            return Err("Invalid symlink path.".into());
        }
    } else {
        crate::utils::ensure_strict_descendant_of_roots(p, &allowed_roots)?;
    }

    if p.exists() || sym_meta.is_ok() {
        let mut deleted_file_names: Vec<String> = Vec::new();
        if is_link {
            if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                deleted_file_names.push(fname.to_string());
            }
            if std::fs::remove_file(p).is_err() {
                std::fs::remove_dir(p).map_err(|e| e.to_string())?;
            }
        } else if p.is_dir() {
            for entry in walkdir::WalkDir::new(p)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
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
pub async fn open_developer_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let ps_cmd = "Start-Process reg -ArgumentList 'add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f' -Verb RunAs -WindowStyle Hidden -Wait";
            let _ = std::process::Command::new("powershell")
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    ps_cmd,
                ])
                .status();

            if check_symlink_permissions().unwrap_or(false) {
                return Ok(());
            }

            std::process::Command::new("cmd")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["/c", "start", "ms-settings:developers"])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn validate_child_webview_label(label: &str) -> Result<&str, String> {
    let trimmed = label.trim();
    if trimmed.is_empty()
        || trimmed.len() > 64
        || trimmed.eq_ignore_ascii_case("main")
        || !trimmed.starts_with("side-browser-tab-")
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid or unauthorized target webview label.".into());
    }
    Ok(trimmed)
}

#[tauri::command]
pub fn webview_eval(
    window: tauri::WebviewWindow,
    app_handle: tauri::AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    use tauri::Manager;
    if window.label() != "main" {
        return Err("Unauthorized caller: only the main window may invoke webview_eval.".into());
    }
    let target_label = validate_child_webview_label(&label)?;
    let trimmed_script = script.trim();
    if trimmed_script.is_empty() {
        return Err("Refusing to evaluate empty script.".into());
    }
    if trimmed_script
        .to_ascii_lowercase()
        .starts_with("javascript:")
    {
        return Err("Blocked javascript: URI scheme in webview_eval.".into());
    }
    if let Some(webview) = app_handle.get_webview(target_label) {
        webview.eval(trimmed_script).map_err(|e| e.to_string())
    } else {
        Err("Webview not found".into())
    }
}

#[tauri::command]
pub fn webview_url(
    window: tauri::WebviewWindow,
    app_handle: tauri::AppHandle,
    label: String,
) -> Result<String, String> {
    use tauri::Manager;
    if window.label() != "main" {
        return Err("Unauthorized caller: only the main window may query child webview URLs.".into());
    }
    let target_label = validate_child_webview_label(&label)?;
    if let Some(webview) = app_handle.get_webview(target_label) {
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
pub async fn get_system_info(app_handle: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        let app_version = app_handle.package_info().version.to_string();

        let os_version: String;
        #[cfg(target_os = "windows")]
        {
            let mut win_ver = String::new();
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
                        win_ver = format!("{} (Build {})", display_name, version_part);
                    } else {
                        win_ver = ver_str.trim().to_string();
                    }
                } else {
                    win_ver = ver_str.trim().to_string();
                }
            }
            os_version = win_ver;
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
pub async fn capture_window_screenshot(
    app_handle: tauri::AppHandle,
    theme_folder: String,
    file_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
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
                crate::utils::atomic_write_bytes(&out_file, &png_data)?;

                Ok(out_file.to_string_lossy().to_string())
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (app_handle, theme_folder, file_name);
            Err("Native window capture is only supported on Windows.".into())
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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

// ============================================================================
// Cloud-Sync Folder Interference Detection & Consent-Gated Remediation
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CloudSyncInspectInput {
    #[serde(default)]
    pub master_vault_path: Option<String>,
    #[serde(default)]
    pub vault_path: Option<String>,
    #[serde(default)]
    pub mods_path: Option<String>,
    #[serde(default, alias = "user_data_path")]
    pub docs_path: Option<String>,
    #[serde(default)]
    pub live_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudSyncPathFinding {
    pub role: String,
    pub configured_path: String,
    pub resolved_path: String,
    pub cloud_root_path: Option<String>,
    pub provider: String,
    pub severity: String,
    pub symlink_risk: bool,
    pub has_dehydrated_files: bool,
    pub is_pinned_locally: bool,
    pub is_unpinned: bool,
    pub active_symlink_count: usize,
    pub can_pin_hydration: bool,
    pub is_windows_kfm_redirect: bool,
    pub suggested_local_vault_path: Option<String>,
    pub is_parent_folder_synced: bool,
    pub supports_folder_exclusion: bool,
    pub is_excluded_from_sync: bool,
    pub schema_saves_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudSyncSystemReport {
    pub has_interference: bool,
    pub findings: Vec<CloudSyncPathFinding>,
    pub recommended_safe_vault_root: String,
    pub scanned_at_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudHydrationPinResult {
    pub pinned_count: usize,
    pub skipped_symlinks: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultRelocationResult {
    pub new_master_vault_path: String,
    pub new_active_vault_path: String,
    pub copied_files_count: usize,
    pub copied_bytes: u64,
}

#[derive(Clone, Debug, Default)]
pub struct DetectedCloudInfo {
    pub provider: String,
    pub resolved_path: String,
    pub cloud_root_path: Option<String>,
    pub has_dehydrated_files: bool,
    pub is_pinned_locally: bool,
    pub is_unpinned: bool,
    pub is_windows_kfm_redirect: bool,
}

fn normalize_cloud_cmp_path(path: &std::path::Path) -> String {
    let cleaned = crate::utils::strip_windows_verbatim_prefix(path);
    let s = cleaned.to_string_lossy().replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if cfg!(target_os = "windows") || cfg!(target_os = "macos") {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

fn path_starts_with_root(candidate: &std::path::Path, root: &std::path::Path) -> bool {
    let c = normalize_cloud_cmp_path(candidate);
    let r = normalize_cloud_cmp_path(root);
    if c.is_empty() || r.is_empty() {
        return false;
    }
    c == r || c.starts_with(&format!("{}/", r))
}

static KNOWN_CLOUD_ROOTS_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(std::time::Instant, Vec<(PathBuf, String)>)>>,
> = std::sync::OnceLock::new();

pub fn invalidate_known_cloud_roots_cache() {
    if let Some(mtx) = KNOWN_CLOUD_ROOTS_CACHE.get() {
        if let Ok(mut guard) = mtx.lock() {
            *guard = None;
        }
    }
}

struct TempProbeDirGuard(PathBuf);
impl Drop for TempProbeDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn collect_drivefs_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    let mut base_dirs: Vec<PathBuf> = Vec::new();
    if let Some(local_data) = dirs::data_local_dir() {
        base_dirs.push(local_data.join("Google").join("DriveFS"));
    }
    if cfg!(target_os = "macos") {
        if let Some(app_sup) = dirs::data_dir() {
            let p = app_sup.join("Google").join("DriveFS");
            if !base_dirs.contains(&p) {
                base_dirs.push(p);
            }
        }
    }

    let mut push_valid_drive_dir = |cand: PathBuf| {
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&cand);
        let c_lower = cleaned.to_string_lossy().to_lowercase();
        let has_normal = cleaned
            .components()
            .any(|c| matches!(c, std::path::Component::Normal(_)));
        if !cleaned.is_absolute()
            || !has_normal
            || c_lower.contains("drivefs")
            || c_lower.contains("content_cache")
            || !cleaned.is_dir()
        {
            return;
        }
        push_root(cleaned.clone(), "Google Drive");
        if let Ok(canon) = crate::utils::resolve_canonical_target(&cleaned) {
            let canon_clean = crate::utils::strip_windows_verbatim_prefix(&canon);
            let canon_lower = canon_clean.to_string_lossy().to_lowercase();
            let canon_has_normal = canon_clean
                .components()
                .any(|c| matches!(c, std::path::Component::Normal(_)));
            if canon_clean.is_absolute()
                && canon_has_normal
                && !canon_lower.contains("drivefs")
                && !canon_lower.contains("content_cache")
                && canon_clean.is_dir()
            {
                push_root(canon_clean, "Google Drive");
            }
        }
    };

    let read_row_text = |row: &rusqlite::Row<'_>, idx_opt: Option<usize>| -> Option<String> {
        let idx = idx_opt?;
        match row.get_ref(idx).ok()? {
            rusqlite::types::ValueRef::Text(bytes) => {
                let s = std::str::from_utf8(bytes).ok()?.trim();
                (!s.is_empty()).then(|| s.to_string())
            }
            _ => None,
        }
    };

    let read_row_i64 = |row: &rusqlite::Row<'_>, idx_opt: Option<usize>| -> Option<i64> {
        let idx = idx_opt?;
        match row.get_ref(idx).ok()? {
            rusqlite::types::ValueRef::Integer(v) => Some(v),
            _ => None,
        }
    };

    for base_dir in base_dirs {
        if !base_dir.is_dir() {
            continue;
        }
        let mut active_accounts: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut probe_dirs: Vec<PathBuf> = vec![base_dir.clone()];

        if let Ok(acct_entries) = std::fs::read_dir(&base_dir) {
            for entry in acct_entries.flatten() {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let exact_name = entry.file_name().to_string_lossy().to_string();
                let dir_lower = exact_name.to_lowercase();
                if matches!(
                    dir_lower.as_str(),
                    "logs"
                        | "cef_cache"
                        | "crashpad"
                        | "resources"
                        | "content_cache"
                        | "webview2_user_data"
                        | "thumbnails_cache"
                ) {
                    continue;
                }
                active_accounts.insert(exact_name);
                probe_dirs.push(entry.path());
            }
        }

        for dir_to_probe in probe_dirs {
            for db_name in ["root_preference_sqlite.db", "mirror_sqlite.db"] {
                let db_path = dir_to_probe.join(db_name);
                let Ok(meta) = std::fs::metadata(&db_path) else {
                    continue;
                };
                if !meta.is_file() || meta.len() == 0 || meta.len() > 32 * 1024 * 1024 {
                    continue;
                }

                let tmp_dir = std::env::temp_dir().join(format!(
                    "sanctuary_drivefs_probe_{}",
                    uuid::Uuid::new_v4()
                ));
                if std::fs::create_dir_all(&tmp_dir).is_err() {
                    continue;
                }
                let _guard = TempProbeDirGuard(tmp_dir.clone());
                let tmp_db = tmp_dir.join(db_name);
                if std::fs::copy(&db_path, &tmp_db).is_err() {
                    continue;
                }
                // Copy only -wal (never live memory-mapped -shm) so SQLite cleanly reconstructs state on tmp_db
                let wal_src = dir_to_probe.join(format!("{}-wal", db_name));
                if let Ok(sm) = std::fs::metadata(&wal_src) {
                    if sm.is_file() && sm.len() <= 16 * 1024 * 1024 {
                        let _ = std::fs::copy(&wal_src, tmp_dir.join(format!("{}-wal", db_name)));
                    }
                }

                let Ok(conn) = rusqlite::Connection::open(&tmp_db).or_else(|_| {
                    let ro_flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                        | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX;
                    rusqlite::Connection::open_with_flags(&tmp_db, ro_flags)
                }) else {
                    continue;
                };

                // Structured extraction from root_preference_sqlite's `media` & `roots` tables
                let mut media_mounts: std::collections::HashMap<String, String> =
                    std::collections::HashMap::new();
                if let Ok(mut media_stmt) = conn.prepare("SELECT * FROM \"media\"") {
                    let id_col = media_stmt.column_index("media_id").ok();
                    let mount_col = media_stmt.column_index("last_mount_point").ok();
                    let name_col = media_stmt.column_index("name").ok();
                    let ignored_col = media_stmt.column_index("ignored").ok();
                    if let Ok(mut rows) = media_stmt.query([]) {
                        while let Ok(Some(row)) = rows.next() {
                            let Some(mount) = read_row_text(row, mount_col) else {
                                continue;
                            };
                            if let Some(media_id) = read_row_text(row, id_col) {
                                media_mounts.insert(media_id, mount.clone());
                            }
                            let media_name = read_row_text(row, name_col).unwrap_or_default();
                            let ignored = read_row_i64(row, ignored_col).unwrap_or(0);
                            if media_name.eq_ignore_ascii_case("google drive") && ignored == 0 {
                                let mount_path = std::path::Path::new(&mount);
                                push_valid_drive_dir(mount_path.join("My Drive"));
                                push_valid_drive_dir(mount_path.join("Other computers"));
                            }
                        }
                    }
                }

                if let Ok(mut roots_stmt) = conn.prepare("SELECT * FROM \"roots\"") {
                    let acct_col = roots_stmt.column_index("account_token").ok();
                    let abs_col = roots_stmt.column_index("last_seen_absolute_path").ok();
                    let media_id_col = roots_stmt.column_index("media_id").ok();
                    let rel_col = roots_stmt.column_index("root_path").ok();
                    if let Ok(mut rows) = roots_stmt.query([]) {
                        while let Ok(Some(row)) = rows.next() {
                            if let Some(acct_tok) = read_row_text(row, acct_col) {
                                if !active_accounts.is_empty()
                                    && !active_accounts.contains(&acct_tok)
                                {
                                    continue;
                                }
                            }
                            if let Some(last_seen) = read_row_text(row, abs_col) {
                                push_valid_drive_dir(PathBuf::from(&last_seen));
                            }
                            if let Some(root_path) = read_row_text(row, rel_col) {
                                let rp = std::path::Path::new(&root_path);
                                if rp.is_absolute() {
                                    push_valid_drive_dir(rp.to_path_buf());
                                } else if let Some(mid) = read_row_text(row, media_id_col) {
                                    if let Some(mount) = media_mounts.get(&mid) {
                                        let rel_trimmed =
                                            root_path.trim_start_matches(&['\\', '/'][..]);
                                        if !rel_trimmed.is_empty() {
                                            push_valid_drive_dir(
                                                std::path::Path::new(mount).join(rel_trimmed),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback scan for any other sync-preference tables
                let mut table_names: Vec<String> = Vec::new();
                if let Ok(mut stmt) =
                    conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
                {
                    if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                        for t in rows.flatten() {
                            let tl = t.to_lowercase();
                            if !matches!(tl.as_str(), "media" | "roots" | "mirror_item")
                                && (tl.contains("root")
                                    || tl.contains("sync")
                                    || tl.contains("folder")
                                    || tl.contains("pref"))
                                && !t.is_empty()
                                && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                            {
                                table_names.push(t);
                            }
                        }
                    }
                }

                for table in table_names {
                    let sql = format!("SELECT * FROM \"{}\" LIMIT 200", table);
                    let Ok(mut stmt) = conn.prepare(&sql) else {
                        continue;
                    };
                    let col_count = stmt.column_count();
                    let Ok(mut rows) = stmt.query([]) else {
                        continue;
                    };
                    while let Ok(Some(row)) = rows.next() {
                        for idx in 0..col_count {
                            if let Ok(rusqlite::types::ValueRef::Text(bytes)) = row.get_ref(idx) {
                                let raw = std::str::from_utf8(bytes).unwrap_or("").trim();
                                if raw.len() < 4 || raw.len() > 1024 {
                                    continue;
                                }
                                let mut cand = PathBuf::from(raw);
                                if cfg!(target_os = "windows")
                                    && !cand.is_absolute()
                                    && (raw.contains('\\') || raw.contains('/'))
                                {
                                    if let Some(home) = dirs::home_dir() {
                                        let mut drive_root = PathBuf::new();
                                        for comp in home.components() {
                                            match comp {
                                                std::path::Component::Prefix(_)
                                                | std::path::Component::RootDir => {
                                                    drive_root.push(comp.as_os_str());
                                                }
                                                _ => break,
                                            }
                                        }
                                        let rel_trimmed = raw.trim_start_matches(&['\\', '/'][..]);
                                        if !rel_trimmed.is_empty()
                                            && !drive_root.as_os_str().is_empty()
                                        {
                                            let joined = drive_root.join(rel_trimmed);
                                            if joined.is_dir() {
                                                cand = joined;
                                            }
                                        }
                                    }
                                }
                                push_valid_drive_dir(cand);
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_registry_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let provider_from_key_line = |line_lower: &str| -> &'static str {
        if line_lower.contains("googledrive") || line_lower.contains("drivefs") {
            "Google Drive"
        } else if line_lower.contains("onedrive") {
            "OneDrive"
        } else if line_lower.contains("dropbox") {
            "Dropbox"
        } else if line_lower.contains("icloud") {
            "iCloud Drive"
        } else if line_lower.contains("nextcloud") {
            "Nextcloud"
        } else if line_lower.contains("owncloud") {
            "ownCloud"
        } else if line_lower.contains("proton") {
            "Proton Drive"
        } else if line_lower.contains("pcloud") {
            "pCloud"
        } else if line_lower.contains("mega") {
            "MEGA"
        } else if line_lower.contains("box") {
            "Box"
        } else {
            "Cloud Sync"
        }
    };

    if let Ok(output) = std::process::Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SyncRootManager",
            "/s",
            "/v",
            "UserSyncRoots",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut cur_provider = "Cloud Sync";
            for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("HKEY_") {
                    cur_provider = provider_from_key_line(&trimmed.to_lowercase());
                    continue;
                }
                if let Some(pos) = trimmed.find("REG_SZ") {
                    let val = trimmed[pos + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(val),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, cur_provider);
                        }
                    }
                }
            }
        }
    }

    if let Ok(output) = std::process::Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "query",
            "HKCU\\Software\\Microsoft\\OneDrive\\Accounts",
            "/s",
            "/v",
            "UserFolder",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Some(pos) = trimmed.find("REG_SZ") {
                    let val = trimmed[pos + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(val),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, "OneDrive");
                        }
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn collect_windows_registry_sync_roots(_push_root: &mut dyn FnMut(PathBuf, &str)) {}

fn collect_client_config_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    let mut cfg_targets: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(cfg_dir) = dirs::config_dir() {
        cfg_targets.push((cfg_dir.join("Nextcloud").join("nextcloud.cfg"), "Nextcloud"));
        cfg_targets.push((cfg_dir.join("ownCloud").join("owncloud.cfg"), "ownCloud"));
    }
    if let Some(home) = dirs::home_dir() {
        cfg_targets.push((
            home.join("Library").join("Preferences").join("Nextcloud").join("nextcloud.cfg"),
            "Nextcloud",
        ));
        cfg_targets.push((
            home.join(".config").join("Nextcloud").join("nextcloud.cfg"),
            "Nextcloud",
        ));
        cfg_targets.push((
            home.join(".config").join("ownCloud").join("owncloud.cfg"),
            "ownCloud",
        ));
    }
    for (cfg_path, provider) in cfg_targets {
        let Ok(meta) = std::fs::metadata(&cfg_path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&cfg_path) {
            for line in raw.lines() {
                let trimmed = line.trim();
                if let Some((k, v)) = trimmed.split_once('=') {
                    let k_lower = k.trim().to_lowercase();
                    if k_lower.ends_with("localpath") && !k_lower.contains("ignore") {
                        let clean_val = v.trim().trim_matches('"');
                        if !clean_val.is_empty() {
                            let p = crate::utils::strip_windows_verbatim_prefix(
                                std::path::Path::new(clean_val),
                            );
                            if p.is_absolute() && p.is_dir() {
                                push_root(p, provider);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut syncthing_cfgs: Vec<PathBuf> = Vec::new();
    if let Some(local_data) = dirs::data_local_dir() {
        syncthing_cfgs.push(local_data.join("Syncthing").join("config.xml"));
    }
    if let Some(cfg_dir) = dirs::config_dir() {
        syncthing_cfgs.push(cfg_dir.join("syncthing").join("config.xml"));
    }
    if let Some(home) = dirs::home_dir() {
        syncthing_cfgs.push(home.join(".config").join("syncthing").join("config.xml"));
        syncthing_cfgs.push(
            home.join("Library")
                .join("Application Support")
                .join("Syncthing")
                .join("config.xml"),
        );
    }
    for st_cfg in syncthing_cfgs {
        let Ok(meta) = std::fs::metadata(&st_cfg) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&st_cfg) {
            for chunk in raw.split("<folder ") {
                let tag_end = chunk.find('>').unwrap_or(chunk.len());
                let tag_head = &chunk[..tag_end];
                if let Some(pos) = tag_head.find("path=\"") {
                    let after = &tag_head[pos + 6..];
                    if let Some(end_q) = after.find('"') {
                        let raw_p = after[..end_q].replace("&amp;", "&");
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(raw_p.trim()),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, "Syncthing");
                        }
                    }
                }
            }
        }
    }
}

fn collect_known_cloud_sync_roots() -> Vec<(PathBuf, String)> {
    let mtx = KNOWN_CLOUD_ROOTS_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(guard) = mtx.lock() {
        if let Some((captured_at, ref cached)) = *guard {
            if captured_at.elapsed() < std::time::Duration::from_secs(5) {
                return cached.clone();
            }
        }
    }

    let mut roots: Vec<(PathBuf, String)> = Vec::new();
    let mut push_root = |path: PathBuf, provider: &str| {
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&path);
        if !cleaned.as_os_str().is_empty()
            && !roots.iter().any(|(existing, _)| {
                normalize_cloud_cmp_path(existing) == normalize_cloud_cmp_path(&cleaned)
            })
        {
            roots.push((cleaned, provider.to_string()));
        }
    };

    for env_key in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                push_root(PathBuf::from(trimmed), "OneDrive");
            }
        }
    }

    // Read Dropbox client config if present (info.json lists exact personal/business folder paths)
    let mut dropbox_info_candidates: Vec<PathBuf> = Vec::new();
    if let Some(app_data) = std::env::var_os("APPDATA") {
        dropbox_info_candidates.push(PathBuf::from(app_data).join("Dropbox").join("info.json"));
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        dropbox_info_candidates.push(PathBuf::from(local_app_data).join("Dropbox").join("info.json"));
    }
    if let Some(home) = dirs::home_dir() {
        dropbox_info_candidates.push(home.join(".dropbox").join("info.json"));
    }
    for cfg_path in dropbox_info_candidates {
        if let Ok(raw) = std::fs::read_to_string(&cfg_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                for key in ["personal", "business"] {
                    if let Some(p) = val
                        .get(key)
                        .and_then(|v| v.get("path"))
                        .and_then(|v| v.as_str())
                    {
                        let trimmed = p.trim();
                        if !trimmed.is_empty() {
                            push_root(PathBuf::from(trimmed), "Dropbox");
                        }
                    }
                }
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let mobile_docs = home.join("Library").join("Mobile Documents");
        if mobile_docs.exists() {
            push_root(mobile_docs, "iCloud Drive");
        }
        let cloud_storage = home.join("Library").join("CloudStorage");
        if let Ok(entries) = std::fs::read_dir(&cloud_storage) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let provider = if name.starts_with("onedrive") {
                    "OneDrive"
                } else if name.starts_with("dropbox") {
                    "Dropbox"
                } else if name.starts_with("googledrive") || name.starts_with("google drive") {
                    "Google Drive"
                } else if name.starts_with("protondrive") || name.starts_with("proton drive") {
                    "Proton Drive"
                } else if name.starts_with("nextcloud") {
                    "Nextcloud"
                } else if name.starts_with("owncloud") {
                    "ownCloud"
                } else if name.starts_with("pcloud") {
                    "pCloud"
                } else if name.starts_with("box") {
                    "Box"
                } else if name.starts_with("mega") {
                    "MEGA"
                } else if name.starts_with("icloud") {
                    "iCloud Drive"
                } else {
                    "Cloud Sync"
                };
                push_root(entry.path(), provider);
            }
        }
    }

    collect_drivefs_sync_roots(&mut push_root);
    collect_windows_registry_sync_roots(&mut push_root);
    collect_client_config_sync_roots(&mut push_root);

    if let Ok(mut guard) = mtx.lock() {
        *guard = Some((std::time::Instant::now(), roots.clone()));
    }

    roots
}

fn match_cloud_provider_segment(segment: &str, prev_segment_lower: &str) -> Option<&'static str> {
    let lower = segment.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }
    if lower == "onedrive" || lower.starts_with("onedrive - ") || lower.starts_with("onedrive_") {
        return Some("OneDrive");
    }
    if matches!(
        lower.as_str(),
        "icloud drive" | "iclouddrive" | "mobile documents" | "clouddocs" | "com~apple~clouddocs"
    ) {
        return Some("iCloud Drive");
    }
    if lower == "dropbox" || lower.starts_with("dropbox (") {
        return Some("Dropbox");
    }
    if lower == "google drive" || lower == "googledrive" || lower.starts_with("google drive (") {
        return Some("Google Drive");
    }
    if lower == "nextcloud" || lower.starts_with("nextcloud (") {
        return Some("Nextcloud");
    }
    if lower == "owncloud" || lower.starts_with("owncloud (") {
        return Some("ownCloud");
    }
    if lower == "proton drive" || lower == "protondrive" || lower.starts_with("proton drive") {
        return Some("Proton Drive");
    }
    if lower == "pcloud" || lower == "pcloud drive" || lower == "pclouddrive" {
        return Some("pCloud");
    }
    if lower == "resilio sync" || lower == "resilio" {
        return Some("Resilio Sync");
    }
    if lower == "box sync"
        || lower == "box drive"
        || (lower == "box"
            && (prev_segment_lower == "users"
                || prev_segment_lower == "home"
                || prev_segment_lower == "cloudstorage"
                || prev_segment_lower.is_empty()))
    {
        return Some("Box");
    }
    if lower == "megasync"
        || (lower == "mega"
            && (prev_segment_lower == "users"
                || prev_segment_lower == "home"
                || prev_segment_lower == "cloudstorage"))
    {
        return Some("MEGA");
    }
    None
}

#[cfg(target_os = "windows")]
fn check_windows_cloud_filter_flags(path: &std::path::Path) -> (bool, bool, bool, bool) {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::fs::MetadataExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{FindClose, FindFirstFileW, WIN32_FIND_DATAW};

    const FILE_ATTRIBUTE_OFFLINE: u32 = 0x0000_1000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    const FILE_ATTRIBUTE_PINNED: u32 = 0x0008_0000;
    const FILE_ATTRIBUTE_UNPINNED: u32 = 0x0010_0000;
    const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x0004_0000;
    const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;

    let mut has_cloud_reparse = false;
    let mut has_dehydrated = false;
    let mut is_pinned = false;
    let mut is_unpinned = false;

    let inspect_one = |target: &std::path::Path,
                       cloud_rep: &mut bool,
                       dehyd: &mut bool,
                       pinned: &mut bool,
                       unpinned: &mut bool| {
        let Ok(meta) = std::fs::symlink_metadata(target) else {
            return;
        };
        let attrs = meta.file_attributes();
        if (attrs & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_OFFLINE)) != 0 {
            *dehyd = true;
        }
        if (attrs & FILE_ATTRIBUTE_PINNED) != 0 {
            *pinned = true;
        }
        if (attrs & FILE_ATTRIBUTE_UNPINNED) != 0 {
            *unpinned = true;
        }
        if (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            let trimmed = crate::utils::strip_windows_verbatim_prefix(target);
            let s = trimmed.to_string_lossy();
            let clean_s = s.trim_end_matches(&['\\', '/'][..]);
            if !clean_s.is_empty() {
                let wide: Vec<u16> = std::ffi::OsStr::new(clean_s)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let mut find_data = WIN32_FIND_DATAW::default();
                unsafe {
                    if let Ok(handle) = FindFirstFileW(PCWSTR(wide.as_ptr()), &mut find_data) {
                        let tag = find_data.dwReserved0;
                        // IO_REPARSE_TAG_CLOUD* (0x9000_001A .. 0x9000_F01A)
                        if (tag & !0x0000_F000) == 0x9000_001A {
                            *cloud_rep = true;
                        }
                        let _ = FindClose(handle);
                    }
                }
            }
        }
    };

    inspect_one(
        path,
        &mut has_cloud_reparse,
        &mut has_dehydrated,
        &mut is_pinned,
        &mut is_unpinned,
    );

    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten().take(64) {
                inspect_one(
                    &entry.path(),
                    &mut has_cloud_reparse,
                    &mut has_dehydrated,
                    &mut is_pinned,
                    &mut is_unpinned,
                );
            }
        }
    }

    (has_cloud_reparse, has_dehydrated, is_pinned, is_unpinned)
}

#[cfg(not(target_os = "windows"))]
fn check_windows_cloud_filter_flags(_path: &std::path::Path) -> (bool, bool, bool, bool) {
    (false, false, false, false)
}

fn decode_desktop_ini_lower(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) && bytes.len() >= 4 {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s).to_lowercase();
    }
    if bytes.len() >= 4 && bytes[0] != 0 && bytes[1] == 0 && bytes[3] == 0 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s).to_lowercase();
    }
    String::from_utf8_lossy(bytes).to_lowercase()
}

fn match_provider_from_desktop_ini(ini_path: &std::path::Path) -> Option<&'static str> {
    let meta = std::fs::metadata(ini_path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > 65536 {
        return None;
    }
    let bytes = std::fs::read(ini_path).ok()?;
    let lower = decode_desktop_ini_lower(&bytes);
    if lower.contains("googledrivefs")
        || lower.contains("drive file stream")
        || lower.contains("google\\drive")
        || lower.contains("google/drive")
        || lower.contains("google drive")
    {
        return Some("Google Drive");
    }
    if lower.contains("onedrive") {
        return Some("OneDrive");
    }
    if lower.contains("dropbox") {
        return Some("Dropbox");
    }
    if lower.contains("icloud") {
        return Some("iCloud Drive");
    }
    if lower.contains("megasync") {
        return Some("MEGA");
    }
    if lower.contains("nextcloud") {
        return Some("Nextcloud");
    }
    if lower.contains("owncloud") {
        return Some("ownCloud");
    }
    if lower.contains("pcloud") {
        return Some("pCloud");
    }
    if lower.contains("proton drive") || lower.contains("protondrive") {
        return Some("Proton Drive");
    }
    None
}

pub fn detect_cloud_provider_for_path(raw_path: &std::path::Path) -> Option<DetectedCloudInfo> {
    let raw_str = raw_path.to_string_lossy().trim().to_string();
    if raw_str.is_empty() || raw_str.eq_ignore_ascii_case("web") {
        return None;
    }

    let cleaned = crate::utils::strip_windows_verbatim_prefix(raw_path);
    let canonical = crate::utils::resolve_canonical_target(&cleaned).unwrap_or_else(|_| cleaned.clone());
    let resolved_path_str = canonical.to_string_lossy().to_string();

    let known_roots = collect_known_cloud_sync_roots();
    let mut matched_provider: Option<String> = None;
    let mut matched_root: Option<String> = None;

    // 1. Check exact/ancestor match against known OS cloud-sync client roots
    for candidate in [&canonical, &cleaned] {
        for (root, provider) in &known_roots {
            if path_starts_with_root(candidate, root) {
                matched_provider = Some(provider.clone());
                matched_root = Some(root.to_string_lossy().to_string());
                break;
            }
        }
        if matched_provider.is_some() {
            break;
        }
    }

    // 2. Component-aware path segment matching (avoids false positives on substrings)
    if matched_provider.is_none() {
        for candidate in [&canonical, &cleaned] {
            let mut accum = PathBuf::new();
            let mut prev_lower = String::new();
            let comps: Vec<_> = candidate.components().collect();
            for (idx, comp) in comps.iter().enumerate() {
                accum.push(comp.as_os_str());
                if let std::path::Component::Normal(os_s) = comp {
                    let seg = os_s.to_string_lossy();
                    let next_prev = seg.to_lowercase();
                    // Avoid matching the immediate parent of the user folder wrong; pass previous component
                    if let Some(provider) = match_cloud_provider_segment(&seg, &prev_lower) {
                        matched_provider = Some(provider.to_string());
                        matched_root = Some(accum.to_string_lossy().to_string());
                        break;
                    }
                    // On macOS/Linux/Windows `<Home>\Box` has idx >= 3 (`C:\Users\<User>\Box`)
                    let _ = idx;
                    prev_lower = next_prev;
                }
            }
            if matched_provider.is_some() {
                break;
            }
        }
    }

    // 3. Ancestor marker files (.stfolder, .dropbox, .sync/ID, .owncloudsync.log, .megaignore, desktop.ini)
    if matched_provider.is_none() {
        for candidate in [&canonical, &cleaned] {
            let mut cur_opt = Some(candidate.as_path());
            let mut depth = 0usize;
            while let Some(cur) = cur_opt {
                if depth > 12 {
                    break;
                }
                if cur.join(".stfolder").exists() || cur.join(".stignore").exists() {
                    matched_provider = Some("Syncthing".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".sync").join("ID").exists() || cur.join(".sync").join("IgnoreList").exists() {
                    matched_provider = Some("Resilio Sync".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".dropbox").exists() {
                    matched_provider = Some("Dropbox".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".owncloudsync.log").exists() {
                    matched_provider = Some("Nextcloud".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".megaignore").exists() {
                    matched_provider = Some("MEGA".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if let Some(ini_provider) = match_provider_from_desktop_ini(&cur.join("desktop.ini")) {
                    matched_provider = Some(ini_provider.to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                cur_opt = cur.parent();
                depth += 1;
            }
            if matched_provider.is_some() {
                break;
            }
        }
    }

    // 4. Shallow directory inspection for iCloud placeholders (.icloud) & Windows Cloud Filter tags
    let inspect_target = if canonical.exists() {
        canonical.as_path()
    } else {
        cleaned.as_path()
    };

    let mut has_icloud_placeholders = false;
    if inspect_target.is_dir() {
        if let Ok(entries) = std::fs::read_dir(inspect_target) {
            for entry in entries.flatten().take(64) {
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.ends_with(".icloud") {
                    has_icloud_placeholders = true;
                    if matched_provider.is_none() {
                        matched_provider = Some("iCloud Drive".to_string());
                    }
                    break;
                }
            }
        }
    }

    let (has_cloud_reparse, win_dehydrated, is_pinned, is_unpinned) =
        check_windows_cloud_filter_flags(inspect_target);

    if matched_provider.is_none() && (has_cloud_reparse || win_dehydrated || is_unpinned) {
        matched_provider = Some("Cloud Sync".to_string());
    }

    let provider = matched_provider?;

    let is_windows_kfm_redirect = if cfg!(target_os = "windows") && provider == "OneDrive" {
        let lower_norm = normalize_cloud_cmp_path(&canonical);
        lower_norm.contains("/onedrive/documents")
            || lower_norm.ends_with("/onedrive/documents")
            || lower_norm.contains("/onedrive/desktop")
            || lower_norm.ends_with("/onedrive/desktop")
            || matched_root.as_ref().map_or(false, |r| {
                let r_norm = normalize_cloud_cmp_path(std::path::Path::new(r));
                lower_norm.starts_with(&format!("{}/documents", r_norm))
                    || lower_norm.starts_with(&format!("{}/desktop", r_norm))
            })
    } else {
        false
    };

    Some(DetectedCloudInfo {
        provider,
        resolved_path: resolved_path_str,
        cloud_root_path: matched_root,
        has_dehydrated_files: win_dehydrated || has_icloud_placeholders,
        is_pinned_locally: is_pinned && !is_unpinned && !win_dehydrated,
        is_unpinned,
        is_windows_kfm_redirect,
    })
}

pub fn recommended_safe_vault_root() -> String {
    if let Some(home) = std::env::var("HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
    {
        let home_vault = home.join("SanctuaryVault");
        if detect_cloud_provider_for_path(&home_vault).is_none() {
            return crate::utils::strip_windows_verbatim_prefix(&home_vault)
                .to_string_lossy()
                .to_string();
        }
    }
    if let Some(local_data) = dirs::data_local_dir() {
        let local_vault = local_data.join("SanctuaryVault");
        if detect_cloud_provider_for_path(&local_vault).is_none() {
            return crate::utils::strip_windows_verbatim_prefix(&local_vault)
                .to_string_lossy()
                .to_string();
        }
    }
    if let Ok(sys_drive) = std::env::var("SystemDrive") {
        let trimmed = sys_drive.trim();
        if !trimmed.is_empty() {
            return format!("{}\\SanctuaryVault", trimmed.trim_end_matches('\\'));
        }
    }
    if cfg!(target_os = "windows") {
        dirs::home_dir()
            .and_then(|h| {
                let s = h.to_string_lossy().to_string();
                s.get(0..2).map(|drv| format!("{}\\SanctuaryVault", drv))
            })
            .unwrap_or_else(|| "SanctuaryVault".to_string())
    } else {
        "/var/tmp/SanctuaryVault".to_string()
    }
}

fn count_shallow_symlinks(dir: &std::path::Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    let mut count = 0usize;
    let mut inspected = 0usize;
    let mut queue = std::collections::VecDeque::new();
    queue.push_back((dir.to_path_buf(), 0usize));

    while let Some((cur_dir, depth)) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&cur_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if inspected >= 1000 {
                return count;
            }
            inspected += 1;
            let p = entry.path();
            if crate::utils::is_symlink_or_reparse_point(&p) {
                count += 1;
                continue;
            }
            if depth + 1 < 5 && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                queue.push_back((p, depth + 1));
            }
        }
    }
    count
}

fn role_priority(role: &str) -> u8 {
    match role {
        "master_vault" => 6,
        "workspace_vault" => 5,
        "mods_target" => 4,
        "install_route" => 3,
        "user_data" => 2,
        "game_root" => 1,
        _ => 0,
    }
}

fn is_symlink_risk_role(role: &str) -> bool {
    matches!(
        role,
        "master_vault" | "workspace_vault" | "mods_target" | "install_route"
    )
}

fn supports_provider_folder_exclusion(provider: &str) -> bool {
    matches!(
        provider,
        "Dropbox" | "Nextcloud" | "ownCloud" | "Syncthing" | "Resilio Sync" | "MEGA"
    )
}

fn ignore_file_rel_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "Syncthing" => Some(".stignore"),
        "Resilio Sync" => Some(".sync/IgnoreList"),
        "Nextcloud" | "ownCloud" => Some(".sync-exclude.lst"),
        "MEGA" => Some(".megaignore"),
        _ => None,
    }
}

fn check_ignore_list_contains_target(
    list_file: &std::path::Path,
    base_root: &std::path::Path,
    target: &std::path::Path,
) -> bool {
    let Ok(raw) = std::fs::read_to_string(list_file) else {
        return false;
    };
    let rel_forward = target
        .strip_prefix(base_root)
        .ok()
        .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_lowercase())
        .filter(|s| !s.is_empty());
    let leaf_lower = target
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }
        let cleaned = trimmed
            .trim_start_matches('/')
            .trim_end_matches('/')
            .trim_end_matches("/*")
            .replace('\\', "/")
            .to_lowercase();
        if let Some(ref rel) = rel_forward {
            if cleaned == *rel {
                return true;
            }
        }
        if let Some(ref leaf) = leaf_lower {
            if cleaned == *leaf {
                return true;
            }
        }
    }
    false
}

fn check_is_folder_excluded_from_sync(
    resolved_path: &std::path::Path,
    provider: &str,
    cloud_root_path: Option<&std::path::Path>,
) -> bool {
    if provider == "Dropbox" {
        let mut candidates: Vec<PathBuf> = vec![resolved_path.to_path_buf()];
        if let Some(root) = cloud_root_path {
            let mut cur = resolved_path.parent();
            let mut steps = 0usize;
            while let Some(p) = cur {
                if steps > 8 || normalize_cloud_cmp_path(p) == normalize_cloud_cmp_path(root) {
                    break;
                }
                candidates.push(p.to_path_buf());
                cur = p.parent();
                steps += 1;
            }
        }
        for cand in candidates {
            #[cfg(target_os = "windows")]
            {
                let ads = PathBuf::from(format!(
                    "{}:com.dropbox.ignored",
                    cand.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                ));
                if let Ok(val) = std::fs::read_to_string(&ads) {
                    if val.trim() == "1" {
                        return true;
                    }
                }
            }
            #[cfg(target_os = "macos")]
            {
                if let Ok(out) = std::process::Command::new("xattr")
                    .args(["-p", "com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                if let Ok(out) = std::process::Command::new("getfattr")
                    .args(["--only-values", "-n", "user.com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    if let Some(rel_ignore_file) = ignore_file_rel_for_provider(provider) {
        if let Some(root) = cloud_root_path {
            let list_file = root.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, root, resolved_path)
            {
                return true;
            }
        }
        if let Some(parent) = resolved_path.parent() {
            let list_file = parent.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, parent, resolved_path)
            {
                return true;
            }
        }
    }

    false
}

fn resolve_schema_saves_path(
    user_data_dir: Option<&str>,
    active_schema: &Option<crate::schema::GameSchema>,
) -> Option<String> {
    let docs_str = user_data_dir?.trim();
    if docs_str.is_empty() || docs_str.eq_ignore_ascii_case("web") {
        return None;
    }
    let schema = active_schema.as_ref()?;
    let tc = schema.time_capsule.as_ref()?;
    let mut rel_targets: Vec<String> = Vec::new();
    if let Some(ref airgap) = tc.save_airgap_targets {
        for rel in airgap {
            let trimmed = rel.trim();
            if !trimmed.is_empty() && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(trimmed)) {
                rel_targets.push(trimmed.to_string());
            }
        }
    }
    for wt in &tc.world_state_targets {
        let p_trimmed = wt.path.trim();
        let name_lower = wt.name.to_lowercase();
        if !p_trimmed.is_empty()
            && (p_trimmed.to_lowercase().contains("save") || name_lower.contains("save"))
            && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(p_trimmed))
        {
            rel_targets.push(p_trimmed.to_string());
        }
    }
    if rel_targets.is_empty() {
        return None;
    }

    let normalized_docs = if cfg!(target_os = "windows") {
        docs_str.replace('/', "\\")
    } else {
        docs_str.replace('\\', "/")
    };
    let raw_docs_path = std::path::Path::new(&normalized_docs);
    let clean_docs_buf = crate::utils::resolve_canonical_target(raw_docs_path)
        .unwrap_or_else(|_| crate::utils::strip_windows_verbatim_prefix(raw_docs_path));
    let mut first_candidate: Option<PathBuf> = None;
    for rel in rel_targets {
        let expanded_rel = crate::game_logic::expand_env_vars(&rel);
        let resolved = crate::utils::resolve_case_insensitive_path(&clean_docs_buf, &expanded_rel);
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&resolved);
        if cleaned.exists() {
            return Some(cleaned.to_string_lossy().to_string());
        }
        if first_candidate.is_none() {
            first_candidate = Some(cleaned);
        }
    }
    first_candidate.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn inspect_cloud_sync_status(
    paths_override: Option<CloudSyncInspectInput>,
    force_refresh: Option<bool>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<CloudSyncSystemReport, String> {
    let active_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<CloudSyncSystemReport, String> {
        if force_refresh.unwrap_or(false) {
            invalidate_known_cloud_roots_cache();
        }
        let global_cfg = crate::commands::state_ops::get_global_config();
        let coords = crate::commands::state_ops::get_saved_coordinates();

        let ov = paths_override.unwrap_or_default();
        let master_vault = ov
            .master_vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                global_cfg
                    .vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                coords
                    .master_vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            });

        let workspace_vault = ov
            .vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let v = coords.vault_path.trim();
                (!v.is_empty() && !v.eq_ignore_ascii_case("web")).then(|| v.to_string())
            });

        let mods_target = ov
            .mods_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let m = coords.mods_path.trim();
                (!m.is_empty() && !m.eq_ignore_ascii_case("web")).then(|| m.to_string())
            })
            .or_else(|| {
                crate::game_logic::get_default_mods_folder(&active_schema)
                    .map(|p| crate::utils::strip_windows_verbatim_prefix(&p).to_string_lossy().to_string())
            });

        let user_data = ov
            .docs_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                coords
                    .docs_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                let resolved = crate::game_logic::resolve_user_data_root(
                    mods_target.as_deref().unwrap_or(""),
                    &active_schema,
                );
                let s = crate::utils::strip_windows_verbatim_prefix(&resolved)
                    .to_string_lossy()
                    .trim()
                    .to_string();
                (!s.is_empty() && !s.eq_ignore_ascii_case("web")).then_some(s)
            });

        let game_root = ov
            .live_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let l = coords.live_path.trim();
                (!l.is_empty() && !l.eq_ignore_ascii_case("web")).then(|| l.to_string())
            });

        let mut candidates: Vec<(String, String)> = Vec::new();
        if let Some(ref p) = master_vault {
            candidates.push(("master_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = workspace_vault {
            candidates.push(("workspace_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = mods_target {
            candidates.push(("mods_target".to_string(), p.clone()));
        }
        if let Some(ref p) = user_data {
            candidates.push(("user_data".to_string(), p.clone()));
        }
        if let Some(ref p) = game_root {
            candidates.push(("game_root".to_string(), p.clone()));
        }

        // Resolve additional schema install_routes targets dynamically
        let routes = crate::game_logic::get_install_routes(&active_schema);
        for route in routes {
            let base_str = match route.target_root.trim().to_lowercase().as_str() {
                "live_path" | "engine" | "game" => game_root.as_deref().unwrap_or(""),
                "docs_path" | "documents" | "docs" | "user_data" => {
                    user_data.as_deref().unwrap_or("")
                }
                _ => mods_target.as_deref().unwrap_or(""),
            };
            if base_str.is_empty() {
                continue;
            }
            let base_p = PathBuf::from(base_str);
            let sub_trimmed = route.target_subdir.trim();
            let route_target = if sub_trimmed.is_empty() || sub_trimmed == "." {
                base_p
            } else {
                let expanded_sub = crate::game_logic::expand_schema_path_for_os(
                    sub_trimmed,
                    &active_schema,
                    game_root.as_deref(),
                );
                let sub_p = PathBuf::from(&expanded_sub);
                if sub_p.is_absolute() {
                    sub_p
                } else {
                    base_p.join(sub_p)
                }
            };
            candidates.push((
                "install_route".to_string(),
                route_target.to_string_lossy().to_string(),
            ));
        }

        let resolved_schema_saves =
            resolve_schema_saves_path(user_data.as_deref(), &active_schema);
        let safe_vault_root = recommended_safe_vault_root();
        let mut by_resolved: std::collections::HashMap<String, CloudSyncPathFinding> =
            std::collections::HashMap::new();

        for (role, raw_path) in candidates {
            let Some(detected) = detect_cloud_provider_for_path(std::path::Path::new(&raw_path)) else {
                continue;
            };
            let dedup_key = normalize_cloud_cmp_path(std::path::Path::new(&detected.resolved_path));
            let replace = by_resolved
                .get(&dedup_key)
                .map(|existing| role_priority(&role) > role_priority(&existing.role))
                .unwrap_or(true);
            if !replace {
                continue;
            }

            let is_excluded_from_sync = check_is_folder_excluded_from_sync(
                std::path::Path::new(&detected.resolved_path),
                &detected.provider,
                detected.cloud_root_path.as_deref().map(std::path::Path::new),
            );
            let symlink_risk = !is_excluded_from_sync && is_symlink_risk_role(&role);
            let symlink_count = if is_symlink_risk_role(&role) {
                count_shallow_symlinks(std::path::Path::new(&detected.resolved_path))
            } else {
                0
            };
            let is_critical = !is_excluded_from_sync
                && (symlink_risk || detected.has_dehydrated_files || detected.is_unpinned);
            let can_pin_hydration = (cfg!(target_os = "windows")
                && (detected.has_dehydrated_files
                    || detected.is_unpinned
                    || detected.provider.eq_ignore_ascii_case("OneDrive")
                    || detected.provider.eq_ignore_ascii_case("iCloud Drive")))
                || (cfg!(target_os = "macos")
                    && detected.provider.eq_ignore_ascii_case("iCloud Drive")
                    && (detected.has_dehydrated_files || detected.is_unpinned));
            let suggested_local_vault_path = if matches!(role.as_str(), "master_vault" | "workspace_vault") {
                Some(safe_vault_root.clone())
            } else {
                None
            };
            let is_parent_folder_synced = detected.cloud_root_path.as_deref().map_or(false, |root| {
                let rp = std::path::Path::new(root);
                let tp = std::path::Path::new(&detected.resolved_path);
                path_starts_with_root(tp, rp)
                    && normalize_cloud_cmp_path(tp) != normalize_cloud_cmp_path(rp)
            });
            let supports_folder_exclusion =
                supports_provider_folder_exclusion(&detected.provider);
            let schema_saves_path = if matches!(
                role.as_str(),
                "mods_target" | "install_route" | "user_data"
            ) {
                resolved_schema_saves.clone()
            } else {
                None
            };

            by_resolved.insert(
                dedup_key,
                CloudSyncPathFinding {
                    role,
                    configured_path: raw_path,
                    resolved_path: detected.resolved_path,
                    cloud_root_path: detected.cloud_root_path,
                    provider: detected.provider,
                    severity: if is_excluded_from_sync {
                        "info".to_string()
                    } else if is_critical {
                        "critical".to_string()
                    } else {
                        "warning".to_string()
                    },
                    symlink_risk,
                    has_dehydrated_files: detected.has_dehydrated_files,
                    is_pinned_locally: detected.is_pinned_locally,
                    is_unpinned: detected.is_unpinned,
                    active_symlink_count: symlink_count,
                    can_pin_hydration,
                    is_windows_kfm_redirect: detected.is_windows_kfm_redirect,
                    suggested_local_vault_path,
                    is_parent_folder_synced,
                    supports_folder_exclusion,
                    is_excluded_from_sync,
                    schema_saves_path,
                },
            );
        }

        let raw_findings: Vec<CloudSyncPathFinding> = by_resolved.into_values().collect();
        let mut findings: Vec<CloudSyncPathFinding> = raw_findings
            .iter()
            .filter(|f| {
                if matches!(f.role.as_str(), "user_data" | "game_root") && !f.has_dehydrated_files {
                    let covered_by_descendant = raw_findings.iter().any(|other| {
                        !std::ptr::eq(*f, other)
                            && matches!(other.role.as_str(), "mods_target" | "install_route")
                            && other.provider.eq_ignore_ascii_case(&f.provider)
                            && path_starts_with_root(
                                std::path::Path::new(&other.resolved_path),
                                std::path::Path::new(&f.resolved_path),
                            )
                    });
                    if covered_by_descendant {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();
        findings.sort_by(|a, b| role_priority(&b.role).cmp(&role_priority(&a.role)));
        let has_interference = findings.iter().any(|f| !f.is_excluded_from_sync);

        let scanned_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(CloudSyncSystemReport {
            has_interference,
            findings,
            recommended_safe_vault_root: safe_vault_root,
            scanned_at_ms,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn ensure_path_is_allowed_user_dir(target: &std::path::Path) -> Result<PathBuf, String> {
    let resolved = crate::utils::resolve_canonical_target(target)?;
    if crate::utils::is_blocked_sensitive_or_system_path(&resolved) {
        return Err("Refusing to operate on a protected system directory.".into());
    }
    let coords = crate::commands::state_ops::get_saved_coordinates();
    let mut allowed_roots = crate::utils::get_allowed_workspace_roots(&coords);
    for user_dir in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
    ]
    .into_iter()
    .flatten()
    {
        allowed_roots.push(user_dir);
    }
    if allowed_roots.is_empty() {
        return Err("No allowed user or workspace roots resolved.".into());
    }
    crate::utils::ensure_path_within_roots(&resolved, &allowed_roots)?;
    Ok(resolved)
}

#[tauri::command]
pub async fn pin_cloud_folder_local_hydration(
    path: String,
    _state: tauri::State<'_, crate::AppState>,
) -> Result<CloudHydrationPinResult, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<CloudHydrationPinResult, String> {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid folder path.".into());
        }
        let target = PathBuf::from(trimmed);
        if !target.exists() {
            return Err("Target folder does not exist on disk.".into());
        }
        let resolved = ensure_path_is_allowed_user_dir(&target)?;

        let mut pinned_count = 0usize;
        let mut skipped_symlinks = 0usize;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use std::os::windows::process::CommandExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::{
                GetFileAttributesW, SetFileAttributesW, FILE_FLAGS_AND_ATTRIBUTES,
                INVALID_FILE_ATTRIBUTES,
            };
            const FILE_ATTRIBUTE_PINNED: u32 = 0x0008_0000;
            const FILE_ATTRIBUTE_UNPINNED: u32 = 0x0010_0000;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            let pin_entry = |entry_path: &std::path::Path| -> bool {
                let wide: Vec<u16> = entry_path
                    .as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    let current = GetFileAttributesW(PCWSTR(wide.as_ptr()));
                    if current == INVALID_FILE_ATTRIBUTES {
                        return false;
                    }
                    let next = (current | FILE_ATTRIBUTE_PINNED) & !FILE_ATTRIBUTE_UNPINNED;
                    SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(next))
                        .is_ok()
                }
            };

            if !crate::utils::is_symlink_or_reparse_point(&resolved) && pin_entry(&resolved) {
                pinned_count += 1;
            }

            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if p == resolved {
                    continue;
                }
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if pin_entry(p) {
                    pinned_count += 1;
                }
            }

            // Apply folder-level attrib +P -U on the root directory itself (never recursive /S so symlinks remain untouched)
            let _ = std::process::Command::new("attrib")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["+P", "-U"])
                .arg(&resolved)
                .status();
        }

        #[cfg(target_os = "macos")]
        {
            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                    if fname.to_lowercase().ends_with(".icloud") {
                        if std::process::Command::new("brctl")
                            .args(["download"])
                            .arg(p)
                            .status()
                            .map(|s| s.success())
                            .unwrap_or(false)
                        {
                            pinned_count += 1;
                        }
                    }
                }
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = &resolved;
        }

        Ok(CloudHydrationPinResult {
            pinned_count,
            skipped_symlinks,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn copy_dir_non_destructive_skip_symlinks(
    src_root: &std::path::Path,
    dst_root: &std::path::Path,
) -> Result<(usize, u64), String> {
    let mut copied_files = 0usize;
    let mut copied_bytes = 0u64;
    let mut walker = walkdir::WalkDir::new(src_root).follow_links(false).into_iter();
    while let Some(Ok(entry)) = walker.next() {
        let path = entry.path();
        if path == src_root {
            continue;
        }
        if crate::utils::is_symlink_or_reparse_point(path) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }
        let Ok(rel) = path.strip_prefix(src_root) else {
            continue;
        };
        let target = dst_root.join(rel);
        if entry.file_type().is_dir() {
            let _ = std::fs::create_dir_all(&target);
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if !target.exists() {
                let bytes = std::fs::copy(path, &target).map_err(|e| {
                    format!(
                        "Failed copying {:?} -> {:?}: {}",
                        path.file_name().unwrap_or_default(),
                        target,
                        e
                    )
                })?;
                copied_files += 1;
                copied_bytes = copied_bytes.saturating_add(bytes);
            }
        }
    }
    Ok((copied_files, copied_bytes))
}

#[tauri::command]
pub async fn relocate_master_vault_with_consent(
    source_vault_path: String,
    destination_vault_path: String,
    copy_existing_files: bool,
    wipe_active_symlinks_first: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<VaultRelocationResult, String> {
    let dest_trimmed = destination_vault_path.trim().to_string();
    if dest_trimmed.is_empty() || dest_trimmed.eq_ignore_ascii_case("web") {
        return Err("Destination folder path cannot be empty.".into());
    }

    if wipe_active_symlinks_first {
        let _ = crate::commands::deployment::wipe_symlinks(state);
    }

    tauri::async_runtime::spawn_blocking(move || -> Result<VaultRelocationResult, String> {
        let dest_raw = PathBuf::from(&dest_trimmed);
        if !dest_raw.is_absolute() {
            return Err("Destination folder must be an absolute local path.".into());
        }
        if crate::utils::is_blocked_sensitive_or_system_path(&dest_raw) {
            return Err("Destination folder points to a protected system directory.".into());
        }
        if let Some(cloud_info) = detect_cloud_provider_for_path(&dest_raw) {
            return Err(format!(
                "Destination folder is also inside {} ({}). Choose a local non-synced folder.",
                cloud_info.provider, cloud_info.resolved_path
            ));
        }

        let src_trimmed = source_vault_path.trim();
        let src_resolved = if !src_trimmed.is_empty() && !src_trimmed.eq_ignore_ascii_case("web") {
            let sp = PathBuf::from(src_trimmed);
            crate::utils::resolve_canonical_target(&sp).unwrap_or(sp)
        } else {
            PathBuf::new()
        };

        let dest_clean = crate::utils::strip_windows_verbatim_prefix(&dest_raw);
        if !src_resolved.as_os_str().is_empty()
            && (path_starts_with_root(&dest_clean, &src_resolved)
                || path_starts_with_root(&src_resolved, &dest_clean))
        {
            return Err(
                "Destination folder cannot overlap or be nested inside the current storage root."
                    .into(),
            );
        }

        std::fs::create_dir_all(dest_clean.join("Data").join("Themes"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;
        std::fs::create_dir_all(dest_clean.join("Data").join("Lexicons"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;

        let (copied_files_count, copied_bytes) =
            if copy_existing_files && !src_resolved.as_os_str().is_empty() && src_resolved.is_dir()
            {
                copy_dir_non_destructive_skip_symlinks(&src_resolved, &dest_clean)?
            } else {
                (0usize, 0u64)
            };

        let new_master_str = dest_clean.to_string_lossy().to_string();
        let mut global_cfg = crate::commands::state_ops::get_global_config();
        global_cfg.vault_path = Some(new_master_str.clone());
        crate::commands::state_ops::save_coordinates(global_cfg)?;
        invalidate_known_cloud_roots_cache();
        let updated_coords = crate::commands::state_ops::get_saved_coordinates();

        Ok(VaultRelocationResult {
            new_master_vault_path: new_master_str,
            new_active_vault_path: updated_coords.vault_path,
            copied_files_count,
            copied_bytes,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn apply_cloud_sync_folder_exclusion(
    target_path: String,
    provider: String,
    cloud_root_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let trimmed = target_path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid target folder path.".into());
        }
        let target_raw = crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(trimmed));
        if crate::utils::is_blocked_sensitive_or_system_path(&target_raw) {
            return Err("Refusing to modify a protected system directory.".into());
        }
        if !target_raw.exists() {
            let parent = target_raw
                .parent()
                .ok_or_else(|| "Target parent folder does not exist.".to_string())?;
            if !parent.exists() {
                return Err("Target folder and its parent do not exist on disk yet.".into());
            }
            let _ = ensure_path_is_allowed_user_dir(parent)?;
            std::fs::create_dir_all(&target_raw)
                .map_err(|e| format!("Failed creating folder for sync exclusion: {}", e))?;
        }
        let canon_target = ensure_path_is_allowed_user_dir(&target_raw)?;
        let prov = provider.trim();

        if prov == "Dropbox" {
            #[cfg(target_os = "windows")]
            {
                let ads_path = format!(
                    "{}:com.dropbox.ignored",
                    canon_target.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                );
                std::fs::write(&ads_path, b"1")
                    .map_err(|e| format!("Failed writing Dropbox ignore stream: {}", e))?;
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(target_os = "macos")]
            {
                let status = std::process::Command::new("xattr")
                    .args(["-w", "com.dropbox.ignored", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking xattr: {}", e))?;
                if !status.success() {
                    return Err("xattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                let status = std::process::Command::new("setfattr")
                    .args(["-n", "user.com.dropbox.ignored", "-v", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking setfattr: {}", e))?;
                if !status.success() {
                    return Err("setfattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
        }

        let Some(rel_ignore_file) = ignore_file_rel_for_provider(prov) else {
            return Err(format!(
                "{} does not support native folder-ignore exclusion files.",
                prov
            ));
        };

        let base_root = if let Some(ref raw_root) = cloud_root_path {
            let root_trimmed = raw_root.trim();
            if !root_trimmed.is_empty() {
                let root_p =
                    crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(root_trimmed));
                if let Ok(canon_root) = ensure_path_is_allowed_user_dir(&root_p) {
                    if path_starts_with_root(&canon_target, &canon_root)
                        && normalize_cloud_cmp_path(&canon_target)
                            != normalize_cloud_cmp_path(&canon_root)
                    {
                        canon_root
                    } else {
                        canon_target
                            .parent()
                            .map(|p| p.to_path_buf())
                            .unwrap_or_else(|| canon_target.clone())
                    }
                } else {
                    canon_target
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| canon_target.clone())
                }
            } else {
                canon_target
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| canon_target.clone())
            }
        } else {
            canon_target
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| canon_target.clone())
        };

        let rel_pattern = canon_target
            .strip_prefix(&base_root)
            .ok()
            .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                canon_target
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| "Could not determine relative folder name to exclude.".to_string())?;

        let ignore_file = base_root.join(rel_ignore_file);
        if let Some(parent) = ignore_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let existing = std::fs::read_to_string(&ignore_file).unwrap_or_default();
        if !check_ignore_list_contains_target(&ignore_file, &base_root, &canon_target) {
            let mut next_content = existing;
            if !next_content.is_empty() && !next_content.ends_with('\n') {
                next_content.push('\n');
            }
            let entry = if prov == "Syncthing" || prov == "Nextcloud" || prov == "ownCloud" {
                format!("/{}\n", rel_pattern)
            } else {
                format!("{}\n", rel_pattern)
            };
            next_content.push_str(&entry);
            std::fs::write(&ignore_file, next_content.as_bytes())
                .map_err(|e| format!("Failed updating {}: {}", rel_ignore_file, e))?;
        }

        invalidate_known_cloud_roots_cache();
        Ok(prov.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_cloud_sync_provider_settings(
    provider: String,
    target_path: Option<String>,
    cloud_root_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let p_lower = provider.trim().to_lowercase();
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            if p_lower.contains("google") {
                for env_var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
                    let Ok(base) = std::env::var(env_var) else {
                        continue;
                    };
                    let dfs_dir = PathBuf::from(&base).join("Google").join("Drive File Stream");
                    let direct_exe = dfs_dir.join("GoogleDriveFS.exe");
                    // GoogleDriveFS.exe defines `--preferences` as a key:value config override flag
                    // (causing "ERROR: Missing the value for the flag 'preferences'"); the official
                    // Start Menu shortcut launches GoogleDriveFS.exe with zero arguments to open/focus UI.
                    if direct_exe.is_file() && std::process::Command::new(&direct_exe).spawn().is_ok()
                    {
                        return Ok(());
                    }
                    if let Ok(entries) = std::fs::read_dir(&dfs_dir) {
                        let mut ver_dirs: Vec<PathBuf> = entries
                            .flatten()
                            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                            .map(|e| e.path())
                            .collect();
                        ver_dirs.sort_by(|a, b| b.cmp(a));
                        for ver_dir in ver_dirs {
                            let ver_exe = ver_dir.join("GoogleDriveFS.exe");
                            if ver_exe.is_file()
                                && std::process::Command::new(&ver_exe).spawn().is_ok()
                            {
                                return Ok(());
                            }
                        }
                    }
                }
            }

            if p_lower.contains("onedrive") {
                for base in [
                    std::env::var("LOCALAPPDATA").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let od_exe = PathBuf::from(base)
                        .join("Microsoft")
                        .join("OneDrive")
                        .join("OneDrive.exe");
                    if od_exe.exists() {
                        if std::process::Command::new(&od_exe)
                            .arg("/settings")
                            .spawn()
                            .is_ok()
                        {
                            return Ok(());
                        }
                    }
                }
                if std::process::Command::new("cmd")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["/c", "start", "ms-settings:backup"])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }

            if p_lower.contains("dropbox") {
                for base in [
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let db_exe = PathBuf::from(base)
                        .join("Dropbox")
                        .join("Client")
                        .join("Dropbox.exe");
                    if db_exe.is_file() && std::process::Command::new(&db_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("nextcloud") {
                for base in [
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let nc_exe = PathBuf::from(base).join("Nextcloud").join("nextcloud.exe");
                    if nc_exe.is_file() && std::process::Command::new(&nc_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("mega") {
                if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
                    let mega_exe = PathBuf::from(local_app)
                        .join("MEGAsync")
                        .join("MEGAsync.exe");
                    if mega_exe.is_file() && std::process::Command::new(&mega_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let mac_app = if p_lower.contains("google") {
                Some("Google Drive")
            } else if p_lower.contains("onedrive") {
                Some("OneDrive")
            } else if p_lower.contains("dropbox") {
                Some("Dropbox")
            } else if p_lower.contains("nextcloud") {
                Some("Nextcloud")
            } else if p_lower.contains("mega") {
                Some("MEGAsync")
            } else {
                None
            };
            if let Some(app_name) = mac_app {
                if std::process::Command::new("open")
                    .args(["-a", app_name])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
            if p_lower.contains("icloud") {
                if std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preferences.AppleIDPrefPane")
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
        }

        let _ = p_lower;
        for raw_opt in [cloud_root_path, target_path] {
            if let Some(raw_target) = raw_opt {
                let trimmed = raw_target.trim();
                if !trimmed.is_empty() {
                    let mut candidate = PathBuf::from(trimmed);
                    while !candidate.exists() {
                        let Some(parent) = candidate.parent() else {
                            break;
                        };
                        candidate = parent.to_path_buf();
                    }
                    if candidate.exists() {
                        return open_folder(candidate.to_string_lossy().to_string());
                    }
                }
            }
        }

        Err("Could not open cloud provider settings automatically.".into())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

