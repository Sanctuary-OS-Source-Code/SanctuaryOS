use crate::schema::GameSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct DiscoveredWorkshopMod {
    pub workshop_id: String,
    pub path: String,
    pub folder_name: String,
    pub metadata: crate::load_order_engine::ExtractedModMetadata,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ActiveProfileDirRecord {
    live_target: String,
    vanilla_backup: String,
    profile_dir: String,
    is_link: bool,
}

fn sanitize_profile_segment(raw: &str) -> String {
    let clean: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    if clean.trim_matches('_').is_empty() {
        "default_profile".to_string()
    } else {
        clean
    }
}

/// Discovers subscribed Steam Workshop item directories across caller-supplied Steam library roots
/// (`<root>/steamapps/workshop/content/<app_id>/*`) read-only without copying any bytes.
pub fn discover_steam_workshop_items_in_roots(
    steam_roots: &[PathBuf],
    app_id: &str,
    schema: &Option<GameSchema>,
) -> Vec<DiscoveredWorkshopMod> {
    let clean_app_id: String = app_id.trim().chars().filter(|c| c.is_ascii_digit()).collect();
    if clean_app_id.is_empty() || steam_roots.is_empty() {
        return Vec::new();
    }

    let mut out = Vec::new();
    let mut seen_ids = HashSet::<String>::new();

    for root in steam_roots {
        let cand_a = root
            .join("steamapps")
            .join("workshop")
            .join("content")
            .join(&clean_app_id);
        let cand_b = root.join("workshop").join("content").join(&clean_app_id);
        for ws_dir in [cand_a, cand_b] {
            if !ws_dir.is_dir() {
                continue;
            }
            let Ok(entries) = std::fs::read_dir(&ws_dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_dir() {
                    continue;
                }
                let fname = entry.file_name().to_string_lossy().to_string();
                if fname.starts_with('.') || !seen_ids.insert(fname.to_ascii_lowercase()) {
                    continue;
                }
                let metadata = crate::load_order_engine::extract_metadata_for_path(&p, schema);
                out.push(DiscoveredWorkshopMod {
                    workshop_id: fname.clone(),
                    path: p.to_string_lossy().to_string(),
                    folder_name: fname,
                    metadata,
                });
            }
        }
    }

    out.sort_by(|a, b| a.workshop_id.cmp(&b.workshop_id));
    out
}

pub fn discover_steam_workshop_items(schema: &Option<GameSchema>) -> Vec<DiscoveredWorkshopMod> {
    let enabled = schema
        .as_ref()
        .map_or(false, |s| s.paths.discover_steam_workshop == Some(true));
    if !enabled {
        return Vec::new();
    }
    let Some(app_id) = crate::game_logic::default_steam_app_id(schema) else {
        return Vec::new();
    };
    let roots = crate::storefront_discovery::expand_steam_roots_with_vdf();
    discover_steam_workshop_items_in_roots(&roots, &app_id, schema)
}

#[tauri::command]
pub async fn discover_workshop_mods(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<DiscoveredWorkshopMod>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || Ok(discover_steam_workshop_items(&game_schema)))
        .await
        .map_err(|e| e.to_string())?
}

fn resolve_schema_root(
    source: &str,
    schema: &Option<GameSchema>,
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Option<PathBuf> {
    match source.trim().to_ascii_lowercase().as_str() {
        "mods_path" | "mods" => (!mods_dir.as_os_str().is_empty()).then(|| mods_dir.to_path_buf()),
        "docs_path" | "user_data" | "documents" => {
            (!docs_root.as_os_str().is_empty()).then(|| docs_root.to_path_buf())
        }
        "local_appdata" | "appdata_local" => {
            crate::load_order_engine::resolve_local_appdata_root(schema, live_root)
        }
        _ => (!live_root.as_os_str().is_empty()).then(|| live_root.to_path_buf()),
    }
}

fn sanitize_relative_hook_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("Hook relative path is empty or invalid.".to_string());
    }
    let p = Path::new(trimmed);
    if p.is_absolute() {
        return Err(format!("Hook path must be workspace-relative: {:?}", raw));
    }
    let mut clean = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::Normal(s) => clean.push(s),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Path traversal rejected in hook path: {:?}", raw));
            }
        }
    }
    if clean.as_os_str().is_empty() {
        return Err("Hook path resolved empty.".to_string());
    }
    Ok(clean)
}

pub fn run_post_deploy_hooks(
    schema: &Option<GameSchema>,
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
    is_purge: bool,
) -> Result<usize, String> {
    let Some(hooks) = schema
        .as_ref()
        .and_then(|s| s.deployment.as_ref())
        .and_then(|d| d.post_deploy_hooks.as_ref())
    else {
        return Ok(0);
    };

    let mut allowed_roots = Vec::new();
    for r in [live_root, mods_dir] {
        if !r.as_os_str().is_empty() && r.exists() {
            allowed_roots.push(r.to_path_buf());
        }
    }

    let mut executed = 0usize;
    for hook in hooks {
        if is_purge && hook.run_on_purge != Some(true) {
            continue;
        }
        let Ok(rel_exe) = sanitize_relative_hook_path(&hook.executable) else {
            return Err(format!("Blocked invalid hook executable path: {:?}", hook.executable));
        };

        let work_root = resolve_schema_root(
            hook.working_dir_source.as_deref().unwrap_or("live_path"),
            schema,
            live_root,
            docs_root,
            mods_dir,
        )
        .unwrap_or_else(|| live_root.to_path_buf());

        let candidate = crate::utils::resolve_case_insensitive_path(&work_root, &rel_exe.to_string_lossy());
        let exe_path = if candidate.is_file() {
            candidate
        } else {
            let live_cand =
                crate::utils::resolve_case_insensitive_path(live_root, &rel_exe.to_string_lossy());
            if live_cand.is_file() {
                live_cand
            } else if hook.optional_if_missing.unwrap_or(true) {
                continue;
            } else {
                return Err(format!(
                    "Required post-deploy hook tool missing: {:?}",
                    hook.executable
                ));
            }
        };

        if super::launcher::is_blocked_shell_or_interpreter_binary(&exe_path) {
            return Err(format!(
                "Security policy blocked shell/interpreter post-deploy hook: {:?}",
                exe_path.file_name().unwrap_or_default()
            ));
        }
        if allowed_roots.is_empty() {
            return Err("No valid workspace root available for post-deploy hook execution.".to_string());
        }
        crate::utils::ensure_strict_descendant_of_roots(&exe_path, &allowed_roots)?;

        let mods_str = mods_dir.to_string_lossy().to_string();
        let live_str = live_root.to_string_lossy().to_string();
        let docs_str = docs_root.to_string_lossy().to_string();
        let substituted_args: Vec<String> = hook
            .args
            .as_ref()
            .map(|list| {
                list.iter()
                    .map(|a| {
                        a.replace("{mods_path}", &mods_str)
                            .replace("{live_path}", &live_str)
                            .replace("{docs_path}", &docs_str)
                    })
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let timeout_secs = hook.timeout_secs.unwrap_or(60).clamp(1, 300);
        let deadline =
            std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

        let mut cmd = std::process::Command::new(&exe_path);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        if work_root.is_dir() {
            cmd.current_dir(&work_root);
        } else if let Some(parent) = exe_path.parent() {
            cmd.current_dir(parent);
        }
        cmd.args(&substituted_args);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed spawning hook '{}': {}", hook.id, e))?;

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        return Err(format!(
                            "Post-deploy hook '{}' exited with status {}.",
                            hook.id,
                            status.code().unwrap_or(-1)
                        ));
                    }
                    break;
                }
                Ok(None) => {
                    if std::time::Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(format!(
                            "Post-deploy hook '{}' timed out after {}s.",
                            hook.id, timeout_secs
                        ));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(format!("Failed polling hook '{}': {}", hook.id, e));
                }
            }
        }
        executed += 1;
    }

    Ok(executed)
}

fn copy_dir_recursive_missing(src: &Path, dst: &Path) {
    if !src.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(dst);
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        let Ok(rel) = p.strip_prefix(src) else {
            continue;
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            let _ = std::fs::create_dir_all(&target);
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(p, &target);
        }
    }
}

pub fn deactivate_profile_isolated_dirs(vault_path: &str) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let Some((raw_json, _)) = crate::utils::get_vault_kv(vault_path, "profile_isolated_dirs") else {
        return Ok(0);
    };
    let records: Vec<ActiveProfileDirRecord> = serde_json::from_str(&raw_json).unwrap_or_default();
    let mut restored = 0usize;

    for rec in records {
        let live_target = PathBuf::from(&rec.live_target);
        let vanilla_bak = PathBuf::from(&rec.vanilla_backup);
        let profile_dir = PathBuf::from(&rec.profile_dir);

        if rec.is_link {
            if crate::utils::is_symlink_or_reparse_point(&live_target) {
                let _ = crate::utils::remove_symlink_or_junction(&live_target);
            }
        } else if live_target.is_dir() {
            copy_dir_recursive_missing(&live_target, &profile_dir);
            let _ = std::fs::remove_dir_all(&live_target);
        }

        if vanilla_bak.is_dir() && !live_target.exists() {
            let _ = std::fs::rename(&vanilla_bak, &live_target);
            restored += 1;
        }
    }

    crate::utils::delete_vault_kv(vault_path, "profile_isolated_dirs");
    Ok(restored)
}

pub fn activate_profile_isolated_dirs(
    schema: &Option<GameSchema>,
    vault_path: &str,
    profile_id: Option<&str>,
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
) -> Result<usize, String> {
    if vault_path.trim().is_empty() {
        return Ok(0);
    }
    let _ = deactivate_profile_isolated_dirs(vault_path);

    let Some(dirs) = schema
        .as_ref()
        .and_then(|s| s.deployment.as_ref())
        .and_then(|d| d.profile_isolated_dirs.as_ref())
    else {
        return Ok(0);
    };
    if dirs.is_empty() {
        return Ok(0);
    }

    let safe_profile = sanitize_profile_segment(profile_id.unwrap_or("default_profile"));
    let vault_root = crate::utils::get_vault_root_dir(vault_path);
    let profiles_base = vault_root.join(".sanctuary_profiles").join(&safe_profile);
    let mut records: Vec<ActiveProfileDirRecord> = Vec::new();
    let mut activated = 0usize;

    for rule in dirs {
        let Ok(rel) = sanitize_relative_hook_path(&rule.relative_path) else {
            continue;
        };
        let Some(base_root) =
            resolve_schema_root(&rule.root_source, schema, live_root, docs_root, mods_dir)
        else {
            continue;
        };
        if !base_root.is_dir() {
            continue;
        }

        let live_target = crate::utils::resolve_case_insensitive_path(&base_root, &rel.to_string_lossy());
        let Some(target_parent) = live_target.parent() else {
            continue;
        };
        let _ = std::fs::create_dir_all(target_parent);
        if crate::utils::ensure_path_within_roots(target_parent, std::slice::from_ref(&base_root)).is_err()
        {
            continue;
        }

        let safe_rule_id = sanitize_profile_segment(if rule.id.trim().is_empty() {
            "isolated"
        } else {
            &rule.id
        });
        let profile_dir = profiles_base.join(&safe_rule_id);
        let profile_is_new = !profile_dir.exists();
        if std::fs::create_dir_all(&profile_dir).is_err() {
            continue;
        }

        let leaf_name = live_target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("dir");
        let vanilla_bak = target_parent.join(format!(".sanctuary_vanilla_{}", leaf_name));

        if crate::utils::is_symlink_or_reparse_point(&live_target) {
            let _ = crate::utils::remove_symlink_or_junction(&live_target);
        } else if live_target.is_dir() && !vanilla_bak.exists() {
            if std::fs::rename(&live_target, &vanilla_bak).is_ok() && profile_is_new {
                copy_dir_recursive_missing(&vanilla_bak, &profile_dir);
            }
        } else if vanilla_bak.is_dir() && profile_is_new {
            copy_dir_recursive_missing(&vanilla_bak, &profile_dir);
        }

        if live_target.exists() {
            let _ = std::fs::remove_dir_all(&live_target);
        }

        let linked = crate::utils::deploy_junction(&profile_dir, &live_target).is_ok();
        if !linked {
            copy_dir_recursive_missing(&profile_dir, &live_target);
        }

        records.push(ActiveProfileDirRecord {
            live_target: live_target.to_string_lossy().to_string(),
            vanilla_backup: vanilla_bak.to_string_lossy().to_string(),
            profile_dir: profile_dir.to_string_lossy().to_string(),
            is_link: linked,
        });
        activated += 1;
    }

    if !records.is_empty() {
        if let Ok(json) = serde_json::to_string(&records) {
            crate::utils::set_vault_kv(vault_path, "profile_isolated_dirs", &json);
        }
    }

    Ok(activated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_steam_workshop_items_without_copying_bytes() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_ws_disc_{}",
            uuid::Uuid::new_v4()
        ));
        let ws_item = tmp
            .join("steamapps")
            .join("workshop")
            .join("content")
            .join("294100")
            .join("2009463077");
        std::fs::create_dir_all(ws_item.join("About")).unwrap();
        std::fs::write(
            ws_item.join("About").join("About.xml"),
            b"<ModMetaData><name>Harmony</name><packageId>brrainz.harmony</packageId></ModMetaData>",
        )
        .unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "rimworld_test",
                "steam_app_id": "294100",
                "paths": { "discover_steam_workshop": true },
                "mod_metadata_extractor": {
                    "manifest_files": ["About/About.xml"],
                    "id_key": "packageId",
                    "name_key": "name"
                }
            }))
            .unwrap(),
        );

        let items = discover_steam_workshop_items_in_roots(
            std::slice::from_ref(&tmp),
            "294100",
            &schema,
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].workshop_id, "2009463077");
        assert_eq!(items[0].metadata.mod_name.as_deref(), Some("Harmony"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn blocks_interpreter_binary_in_post_deploy_hooks() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_hook_block_{}",
            uuid::Uuid::new_v4()
        ));
        let live_root = tmp.join("live");
        let docs_root = tmp.join("docs");
        let mods_dir = live_root.join("mods");
        std::fs::create_dir_all(&mods_dir).unwrap();
        std::fs::create_dir_all(&docs_root).unwrap();
        #[cfg(target_os = "windows")]
        let bad_name = "cmd.exe";
        #[cfg(not(target_os = "windows"))]
        let bad_name = "sh";
        std::fs::write(live_root.join(bad_name), b"not executed").unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "hook_sec_test",
                "deployment": {
                    "post_deploy_hooks": [
                        {
                            "id": "blocked_shell",
                            "executable": bad_name,
                            "working_dir_source": "live_path",
                            "optional_if_missing": false
                        }
                    ]
                }
            }))
            .unwrap(),
        );

        let err = run_post_deploy_hooks(&schema, &live_root, &docs_root, &mods_dir, false)
            .expect_err("interpreter post-deploy hook must be rejected");
        assert!(err.contains("Security policy blocked"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn isolates_per_profile_config_dirs_and_restores_vanilla_baseline_on_deactivate() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_profile_iso_{}",
            uuid::Uuid::new_v4()
        ));
        let vault = tmp.join("Vault");
        let live = tmp.join("Game");
        let docs = tmp.join("Docs");
        let mods = live.join("Mods");
        let live_cfg = live.join("Loader").join("config");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&mods).unwrap();
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::create_dir_all(&live_cfg).unwrap();
        std::fs::write(live_cfg.join("base.cfg"), b"vanilla=1").unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "iso_test",
                "deployment": {
                    "profile_isolated_dirs": [
                        {
                            "id": "loader_cfg",
                            "root_source": "live_path",
                            "relative_path": "Loader/config"
                        }
                    ]
                }
            }))
            .unwrap(),
        );

        let vp = vault.to_string_lossy().to_string();
        let activated = activate_profile_isolated_dirs(
            &schema,
            &vp,
            Some("SurvivalHardcore"),
            &live,
            &docs,
            &mods,
        )
        .unwrap();
        assert_eq!(activated, 1);

        // Vanilla folder must be preserved safely and seeded into the profile dir
        assert!(live.join("Loader").join(".sanctuary_vanilla_config").is_dir());
        assert_eq!(
            std::fs::read_to_string(live_cfg.join("base.cfg")).unwrap(),
            "vanilla=1"
        );
        std::fs::write(live_cfg.join("profile_only.cfg"), b"hardcore=true").unwrap();

        let profile_stored = vault
            .join(".sanctuary_profiles")
            .join("SurvivalHardcore")
            .join("loader_cfg")
            .join("profile_only.cfg");
        // Deactivate and ensure profile edits remain saved while vanilla live_cfg has zero profile_only.cfg
        deactivate_profile_isolated_dirs(&vp).unwrap();
        assert!(profile_stored.is_file());
        assert!(!live_cfg.join("profile_only.cfg").exists());
        assert_eq!(
            std::fs::read_to_string(live_cfg.join("base.cfg")).unwrap(),
            "vanilla=1"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
