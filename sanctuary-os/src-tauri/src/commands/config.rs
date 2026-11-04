use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_config_file(path: String) -> Result<String, String> {
    if !crate::utils::is_safe_user_file_path(Path::new(&path)) {
        return Err("Blocked: Refusing to read protected system file.".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config_file(path: String, content: String) -> Result<String, String> {
    if !crate::utils::is_safe_user_file_path(Path::new(&path)) {
        return Err("Blocked: Refusing to overwrite protected system file.".into());
    }
    fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}
