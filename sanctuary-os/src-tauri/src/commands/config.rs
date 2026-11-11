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
    let target = Path::new(&path);
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing to overwrite protected system file.".into());
    }
    let coords = crate::commands::state_ops::get_saved_coordinates();
    let allowed = crate::utils::get_allowed_workspace_roots(&coords);
    if !allowed.is_empty() {
        crate::utils::ensure_strict_descendant_of_roots(target, &allowed)?;
    }
    crate::utils::atomic_write_bytes(target, content.as_bytes()).map(|_| "Saved".into())
}
