use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::logs::*;
use crate::commands::cache::*;
use crate::commands::game_info::*;
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
use crate::state::*;
use crate::utils::*;


#[tauri::command]
pub fn delete_local_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        if p.is_dir() {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
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
pub fn webview_eval(app_handle: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
    use tauri::Manager;
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
        if let Ok(output) = std::process::Command::new("cmd").args(["/c", "ver"]).output() {
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
    
    let mut info = format!("OS: {}\nArchitecture: {}\nSanctuary OS Version: {}\n", if os_version.is_empty() { os.to_string() } else { os_version.clone() }, arch, app_version);
    
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
    
    Ok(info)
}

#[tauri::command]
pub fn overwrite_local_schema(schema_id: String, schema_data: String) -> Result<(), String> {
    // Development-only tool: write the schema out to src/data/schemas/
    let path = format!("../src/data/schemas/{}.json", schema_id);
    std::fs::write(&path, schema_data).map_err(|e| e.to_string())
}
