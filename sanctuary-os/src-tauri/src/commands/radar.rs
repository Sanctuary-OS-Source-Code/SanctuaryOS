use crate::state::*;
use crate::utils::*;
use std::path::Path;

#[tauri::command]
pub async fn run_conflict_radar(
    mods_path: String,
    target_files: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mods_dir = Path::new(&mods_path);
        let mut packages = Vec::new();
        walk_packages(&game_schema, mods_dir, &mut packages);

        let tier_folders: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.load_order.as_ref())
            .map(|lo| {
                lo.priority_tiers
                    .as_deref()
                    .unwrap_or(&[])
                    .iter()
                    .filter(|pt| !pt.folder.trim().is_empty())
                    .map(|pt| pt.folder.trim().to_string())
                    .collect()
            })
            .unwrap_or_else(|| {
                vec![
                    "Sanctuary".to_string(),
                    "Sanctuary1".to_string(),
                    "Sanctuary2".to_string(),
                    "Sanctuary3".to_string(),
                ]
            });

        if let Some(targets) = target_files {
            packages.retain(|p| {
                if let Ok(rel) = p.strip_prefix(mods_dir) {
                    let name = rel.to_string_lossy().replace("\\", "/");
                    if targets.contains(&name) {
                        return true;
                    }
                    for tf in &tier_folders {
                        if targets.contains(&format!("{}/{}", tf, name)) {
                            return true;
                        }
                    }
                    false
                } else {
                    false
                }
            });
        }

        let installed_files: Vec<String> = packages
            .iter()
            .map(|path| {
                path.strip_prefix(mods_dir)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .replace("\\", "/")
            })
            .collect();

        let conflicts: Vec<Conflict> = Vec::new();

        Ok(serde_json::json!({
            "total_packages": installed_files.len(),
            "installed_mods": installed_files,
            "conflicts": conflicts
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
