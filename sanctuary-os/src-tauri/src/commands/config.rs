use std::fs;

#[tauri::command]
pub fn read_config_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config_file(path: String, content: String) -> Result<String, String> {
    fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}
