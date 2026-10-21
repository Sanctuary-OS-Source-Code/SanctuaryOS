use crate::commands::backups::*;
use crate::commands::cache::*;
use crate::commands::config::*;
use crate::commands::deployment::*;
use crate::commands::game_info::*;
use crate::commands::library::*;
use crate::commands::logs::*;
use crate::commands::overrides::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use notify::Watcher;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};

#[tauri::command]
pub fn delete_local_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !crate::utils::is_safe_user_file_path(p) {
        return Err("Refusing to delete protected or unsafe path.".into());
    }
    if p.exists() {
        if p.is_dir() {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        } else {
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

        Ok("Deleted".into())
    } else {
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

#[tauri::command]
pub fn overwrite_local_schema(schema_id: String, schema_data: String) -> Result<(), String> {
    if schema_id.is_empty()
        || !schema_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid schema_id.".into());
    }
    // Development-only tool: write the schema out to src/data/schemas/
    let path = format!("../src/data/schemas/{}.json", schema_id);
    std::fs::write(&path, schema_data).map_err(|e| e.to_string())
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

