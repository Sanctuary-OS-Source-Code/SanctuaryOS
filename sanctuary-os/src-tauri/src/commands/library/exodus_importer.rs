use crate::commands::game_info::get_heuristic_signatures;
use crate::state::{AppState, SecurityState};
use crate::utils::{
    check_heuristic_malware_detailed, get_vault_mods_lane, get_vault_root_dir,
    is_macos_or_os_metadata_path, is_safe_user_file_path, is_safe_workspace_target_dir,
    path_is_within_root, resolve_canonical_target, CompiledSignatures,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
pub struct ImportedModMetadata {
    pub mod_folder: String,
    pub version: Option<String>,
    pub url: Option<String>,
    pub imported_paths: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImportedExternalBlueprint {
    pub name: String,
    pub mods: Vec<String>,
    pub load_order: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExodusImportReport {
    pub detected_manager: String,
    pub hardlinked_count: usize,
    pub copied_count: usize,
    pub skipped_existing: usize,
    pub quarantined_skipped: usize,
    pub quarantined_files: Vec<String>,
    pub imported_mods: Vec<ImportedModMetadata>,
    pub blueprints: Vec<ImportedExternalBlueprint>,
}

fn is_separator_folder(folder_name: &str) -> bool {
    let lower = folder_name.trim().to_ascii_lowercase();
    lower.is_empty()
        || lower.ends_with("_separator")
        || lower.starts_with("separator_")
        || lower == ".git"
        || lower == "__macosx"
}

fn sanitize_rel_segment(seg: &str) -> String {
    let cleaned: String = seg
        .chars()
        .map(|c| {
            if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').trim();
    if trimmed.is_empty() {
        "imported_mod".to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_mo2_meta_ini(mod_dir: &Path) -> (Option<String>, Option<String>) {
    let meta_path = mod_dir.join("meta.ini");
    let Ok(raw) = fs::read_to_string(&meta_path) else {
        return (None, None);
    };
    let mut version: Option<String> = None;
    let mut url: Option<String> = None;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') || trimmed.starts_with('[') {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once('=') {
            let key_low = k.trim().to_ascii_lowercase();
            let val = v.trim();
            if val.is_empty() {
                continue;
            }
            if key_low == "version" && version.is_none() {
                version = Some(val.to_string());
            } else if (key_low == "url" || key_low == "customurl" || key_low == "homepage")
                && (val.starts_with("https://") || val.starts_with("http://"))
                && url.is_none()
            {
                url = Some(val.to_string());
            }
        }
    }
    (version, url)
}

fn find_first_file_named_ci(root: &Path, target_name: &str, max_depth: usize) -> Option<PathBuf> {
    for entry in walkdir::WalkDir::new(root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(target_name)
        {
            return Some(entry.into_path());
        }
    }
    None
}

fn parse_bg3mm_modsettings_modules(lsx_path: &Path) -> Vec<String> {
    let Ok(raw) = fs::read_to_string(lsx_path) else {
        return Vec::new();
    };
    let Ok(doc) = roxmltree::Document::parse(&raw) else {
        return Vec::new();
    };
    let mut modules = Vec::new();
    let mut seen = HashSet::new();
    for node in doc.descendants() {
        if node.is_element()
            && node.tag_name().name().eq_ignore_ascii_case("node")
            && node
                .attribute("id")
                .map(|id| id.eq_ignore_ascii_case("ModuleShortDesc"))
                .unwrap_or(false)
        {
            let mut candidate: Option<String> = None;
            let mut mod_name: Option<String> = None;
            for child in node.children().filter(|c| c.is_element()) {
                if !child.tag_name().name().eq_ignore_ascii_case("attribute") {
                    continue;
                }
                let attr_id = child.attribute("id").unwrap_or("");
                let attr_val = child.attribute("value").unwrap_or("").trim();
                if attr_val.is_empty() {
                    continue;
                }
                if attr_id.eq_ignore_ascii_case("Folder") {
                    candidate = Some(attr_val.to_string());
                } else if attr_id.eq_ignore_ascii_case("Name") {
                    mod_name = Some(attr_val.to_string());
                }
            }
            for token in [candidate, mod_name].into_iter().flatten() {
                if seen.insert(token.to_ascii_lowercase()) {
                    modules.push(token);
                }
            }
        }
    }
    modules
}

#[derive(Debug, Clone)]
struct R2ModEntry {
    name: String,
    enabled: bool,
    version: Option<String>,
}

fn strip_yaml_scalar(raw: &str) -> String {
    let t = raw.trim();
    if t.len() >= 2
        && ((t.starts_with('\'') && t.ends_with('\''))
            || (t.starts_with('"') && t.ends_with('"')))
    {
        t[1..t.len() - 1].trim().to_string()
    } else {
        t.to_string()
    }
}

fn parse_r2modman_mods_yml(yml_path: &Path) -> Vec<R2ModEntry> {
    let Ok(raw) = fs::read_to_string(yml_path) else {
        return Vec::new();
    };
    let mut entries: Vec<R2ModEntry> = Vec::new();
    let mut cur: Option<R2ModEntry> = None;
    let mut in_version = false;
    let mut ver_parts: [Option<String>; 3] = [None, None, None];

    let flush_cur = |entries: &mut Vec<R2ModEntry>,
                     cur: &mut Option<R2ModEntry>,
                     ver_parts: &mut [Option<String>; 3]| {
        if let Some(mut item) = cur.take() {
            if item.version.is_none() {
                if let (Some(mj), Some(mn), Some(pt)) = (&ver_parts[0], &ver_parts[1], &ver_parts[2])
                {
                    item.version = Some(format!("{}.{}.{}", mj, mn, pt));
                }
            }
            if !item.name.is_empty() {
                entries.push(item);
            }
        }
        *ver_parts = [None, None, None];
    };

    for raw_line in raw.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- name:") {
            flush_cur(&mut entries, &mut cur, &mut ver_parts);
            in_version = false;
            cur = Some(R2ModEntry {
                name: strip_yaml_scalar(rest),
                enabled: true,
                version: None,
            });
            continue;
        }
        if let Some(ref mut item) = cur {
            if trimmed.starts_with('-') {
                in_version = false;
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("name:") {
                in_version = false;
                if item.name.is_empty() {
                    item.name = strip_yaml_scalar(rest);
                }
            } else if let Some(rest) = trimmed.strip_prefix("enabled:") {
                in_version = false;
                item.enabled = !strip_yaml_scalar(rest).eq_ignore_ascii_case("false");
            } else if trimmed.starts_with("versionNumber:") {
                in_version = true;
            } else if in_version {
                if let Some(v) = trimmed.strip_prefix("major:") {
                    ver_parts[0] = Some(strip_yaml_scalar(v));
                } else if let Some(v) = trimmed.strip_prefix("minor:") {
                    ver_parts[1] = Some(strip_yaml_scalar(v));
                } else if let Some(v) = trimmed.strip_prefix("patch:") {
                    ver_parts[2] = Some(strip_yaml_scalar(v));
                } else {
                    in_version = false;
                }
            }
        }
    }
    flush_cur(&mut entries, &mut cur, &mut ver_parts);
    entries
}

fn detect_external_manager_layout(source: &Path) -> (&'static str, PathBuf, Option<PathBuf>) {
    let mods_child = source.join("mods");
    let profiles_child = source.join("profiles");
    let mo2_ini = source.join("ModOrganizer.ini");
    if mods_child.is_dir() && (profiles_child.is_dir() || mo2_ini.is_file()) {
        let p_dir = profiles_child.is_dir().then_some(profiles_child);
        return ("mo2", mods_child, p_dir);
    }

    if source
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("mods"))
        .unwrap_or(false)
    {
        if let Some(parent) = source.parent() {
            let sibling_profiles = parent.join("profiles");
            if sibling_profiles.is_dir() || parent.join("ModOrganizer.ini").is_file() {
                let p_dir = sibling_profiles.is_dir().then_some(sibling_profiles);
                return ("mo2", source.to_path_buf(), p_dir);
            }
            if let Some(lsx) = find_first_file_named_ci(parent, "modsettings.lsx", 4) {
                return ("bg3mm", source.to_path_buf(), Some(lsx));
            }
        }
    }

    // BG3MM detection: Mods/ + modsettings.lsx anywhere under profile/AppData tree
    if let Some(lsx) = find_first_file_named_ci(source, "modsettings.lsx", 4) {
        let mods_dir = if source.join("Mods").is_dir() {
            source.join("Mods")
        } else if lsx
            .parent()
            .and_then(|p| p.parent())
            .and_then(|gp| gp.parent())
            .map(|r| r.join("Mods").is_dir())
            .unwrap_or(false)
        {
            lsx.parent().unwrap().parent().unwrap().parent().unwrap().join("Mods")
        } else {
            source.to_path_buf()
        };
        return ("bg3mm", mods_dir, Some(lsx));
    }

    // r2modman / Thunderstore Mod Manager / Gale detection: mods.yml and/or BepInEx/plugins
    let mods_yml = source.join("mods.yml");
    let bepinex_plugins = source.join("BepInEx").join("plugins");
    if mods_yml.is_file() || bepinex_plugins.is_dir() {
        let root = if bepinex_plugins.is_dir() {
            bepinex_plugins
        } else {
            source.to_path_buf()
        };
        let meta = mods_yml.is_file().then_some(mods_yml);
        return ("r2modman", root, meta);
    }

    let is_vortex_root = source.join("vortex.deployment.json").is_file()
        || source.join(".vortex_deployment.json").is_file()
        || source.join("__vortex_staging_folder").exists()
        || fs::read_dir(source)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .any(|e| {
                let p = e.path();
                p.is_dir()
                    && (p.join("vortex.deployment.json").is_file()
                        || p.join(".vortex_deployment.json").is_file())
            });
    if is_vortex_root {
        return ("vortex", source.to_path_buf(), None);
    }

    ("directory", source.to_path_buf(), None)
}

pub fn run_exodus_import(
    source_dir: &Path,
    vault_path: &str,
    zero_copy_hardlink: bool,
    malware_override: bool,
    compiled_sigs: &CompiledSignatures,
) -> Result<ExodusImportReport, String> {
    if !source_dir.is_dir() || !is_safe_user_file_path(source_dir) {
        return Err("External staging folder does not exist or failed path safety validation.".into());
    }
    if vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let vault_root = get_vault_root_dir(vault_path);
    if !is_safe_workspace_target_dir(&vault_root) {
        return Err("Target Vault path failed workspace safety validation.".into());
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    fs::create_dir_all(&mods_lane)
        .map_err(|e| format!("Failed creating Vault mods folder: {}", e))?;

    let src_canon = resolve_canonical_target(source_dir)?;
    let vault_canon = resolve_canonical_target(&vault_root)?;
    if path_is_within_root(&src_canon, &vault_canon) || path_is_within_root(&vault_canon, &src_canon) {
        return Err("Source staging folder cannot be inside or wrap your active Sanctuary Vault.".into());
    }

    let (detected_manager, staging_root, profiles_root) = detect_external_manager_layout(source_dir);
    let mut hardlinked_count = 0usize;
    let mut copied_count = 0usize;
    let mut skipped_existing = 0usize;
    let mut quarantined_skipped = 0usize;
    let mut quarantined_files: Vec<String> = Vec::new();
    let mut imported_mods: Vec<ImportedModMetadata> = Vec::new();
    let mut folder_to_rel_paths: HashMap<String, Vec<String>> = HashMap::new();

    let mut folder_entries: Vec<PathBuf> = Vec::new();
    let mut loose_root_files: Vec<PathBuf> = Vec::new();

    let entries = fs::read_dir(&staging_root)
        .map_err(|e| format!("Failed reading external staging folder: {}", e))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if is_macos_or_os_metadata_path(&p) || !is_safe_user_file_path(&p) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            if !is_separator_folder(&name) {
                folder_entries.push(p);
            }
        } else if p.is_file() {
            let lower = name.to_ascii_lowercase();
            if lower != "vortex.deployment.json"
                && lower != ".vortex_deployment.json"
                && lower != "mods.yml"
                && lower != "modsettings.lsx"
            {
                loose_root_files.push(p);
            }
        }
    }
    folder_entries.sort();
    loose_root_files.sort();

    let mut transfer_file = |src_file: &Path, dest_rel: &Path| -> Result<bool, String> {
        let dest_file = mods_lane.join(dest_rel);
        if dest_file.exists() {
            skipped_existing += 1;
            return Ok(true);
        }
        if !malware_override {
            if check_heuristic_malware_detailed(src_file, compiled_sigs).is_some() {
                quarantined_skipped += 1;
                if let Some(leaf) = src_file.file_name().and_then(|n| n.to_str()) {
                    quarantined_files.push(leaf.to_string());
                }
                return Ok(false);
            }
        }
        if let Some(parent) = dest_file.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if zero_copy_hardlink && fs::hard_link(src_file, &dest_file).is_ok() {
            hardlinked_count += 1;
        } else {
            fs::copy(src_file, &dest_file)
                .map_err(|e| format!("Failed copying '{}': {}", src_file.display(), e))?;
            copied_count += 1;
        }
        Ok(true)
    };

    for mod_dir in folder_entries {
        let raw_folder_name = mod_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("imported_mod")
            .to_string();
        let safe_folder = sanitize_rel_segment(&raw_folder_name);
        let (version, url) = parse_mo2_meta_ini(&mod_dir);
        let mut imported_paths: Vec<String> = Vec::new();

        for entry in walkdir::WalkDir::new(&mod_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let file_path = entry.path();
            if is_macos_or_os_metadata_path(file_path) || !is_safe_user_file_path(file_path) {
                continue;
            }
            let Ok(rel) = file_path.strip_prefix(&mod_dir) else {
                continue;
            };
            let rel_lower = rel.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
            if rel_lower == "meta.ini"
                || rel_lower == "vortex.deployment.json"
                || rel_lower == ".vortex_deployment.json"
            {
                continue;
            }

            let vault_rel = PathBuf::from(&safe_folder).join(rel);
            if transfer_file(file_path, &vault_rel)? {
                let rel_slash = vault_rel.to_string_lossy().replace('\\', "/");
                imported_paths.push(rel_slash);
            }
        }

        if !imported_paths.is_empty() {
            imported_paths.sort();
            folder_to_rel_paths.insert(raw_folder_name.to_ascii_lowercase(), imported_paths.clone());
            imported_mods.push(ImportedModMetadata {
                mod_folder: raw_folder_name,
                version,
                url,
                imported_paths,
            });
        }
    }

    if !loose_root_files.is_empty() {
        let mut loose_imported = Vec::new();
        for f in loose_root_files {
            let Some(fname) = f.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let safe_name = sanitize_rel_segment(fname);
            let rel = PathBuf::from(&safe_name);
            if transfer_file(&f, &rel)? {
                loose_imported.push(safe_name);
            }
        }
        if !loose_imported.is_empty() {
            imported_mods.push(ImportedModMetadata {
                mod_folder: "Loose Files".to_string(),
                version: None,
                url: None,
                imported_paths: loose_imported,
            });
        }
    }

    let mut blueprints: Vec<ImportedExternalBlueprint> = Vec::new();

    if detected_manager == "mo2" {
        if let Some(p_root) = profiles_root {
            if let Ok(prof_entries) = fs::read_dir(&p_root) {
                let mut prof_dirs: Vec<PathBuf> = prof_entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect();
                prof_dirs.sort();
                for p_dir in prof_dirs {
                    let modlist_file = p_dir.join("modlist.txt");
                    let Ok(raw_list) = fs::read_to_string(&modlist_file) else {
                        continue;
                    };
                    // MO2 `modlist.txt` places highest priority mods at the top; reverse into lowest-to-highest order.
                    let enabled_folders: Vec<String> = raw_list
                        .lines()
                        .map(str::trim)
                        .filter(|line| line.starts_with('+'))
                        .map(|line| line[1..].trim().to_string())
                        .filter(|name| !is_separator_folder(name))
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect();

                    let mut bp_mods: Vec<String> = Vec::new();
                    let mut seen_mods: HashSet<String> = HashSet::new();
                    for folder in &enabled_folders {
                        if let Some(paths) = folder_to_rel_paths.get(&folder.to_ascii_lowercase()) {
                            for p in paths {
                                if seen_mods.insert(p.to_ascii_lowercase()) {
                                    bp_mods.push(p.clone());
                                }
                            }
                        }
                    }

                    if !bp_mods.is_empty() {
                        let profile_name = p_dir
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("MO2 Profile");
                        blueprints.push(ImportedExternalBlueprint {
                            name: format!("MO2: {}", profile_name),
                            load_order: bp_mods.clone(),
                            mods: bp_mods,
                        });
                    }
                }
            }
        }
    } else if detected_manager == "bg3mm" {
        if let Some(lsx_path) = profiles_root.as_ref() {
            let ordered_tokens = parse_bg3mm_modsettings_modules(lsx_path);
            let mut bp_mods = Vec::new();
            let mut seen = HashSet::new();
            for token in ordered_tokens {
                let tok_low = token.to_ascii_lowercase();
                if let Some(paths) = folder_to_rel_paths.get(&tok_low) {
                    for p in paths {
                        if seen.insert(p.to_ascii_lowercase()) {
                            bp_mods.push(p.clone());
                        }
                    }
                    continue;
                }
                for m in &imported_mods {
                    for p in &m.imported_paths {
                        let stem = std::path::Path::new(p)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or(p)
                            .to_ascii_lowercase();
                        if stem == tok_low || p.to_ascii_lowercase().contains(&tok_low) {
                            if seen.insert(p.to_ascii_lowercase()) {
                                bp_mods.push(p.clone());
                            }
                        }
                    }
                }
            }
            if !bp_mods.is_empty() {
                blueprints.push(ImportedExternalBlueprint {
                    name: "BG3MM: Imported Loadout".to_string(),
                    load_order: bp_mods.clone(),
                    mods: bp_mods,
                });
            }
        }
    } else if detected_manager == "r2modman" {
        if let Some(yml_path) = profiles_root.as_ref().filter(|p| p.is_file()) {
            let yml_entries = parse_r2modman_mods_yml(yml_path);
            let mut bp_mods = Vec::new();
            let mut seen = HashSet::new();
            for r2 in yml_entries {
                let r2_low = r2.name.to_ascii_lowercase();
                for m in &mut imported_mods {
                    if m.mod_folder.eq_ignore_ascii_case(&r2.name)
                        || m.mod_folder.to_ascii_lowercase().contains(&r2_low)
                    {
                        if m.version.is_none() && r2.version.is_some() {
                            m.version = r2.version.clone();
                        }
                        if r2.enabled {
                            for p in &m.imported_paths {
                                if seen.insert(p.to_ascii_lowercase()) {
                                    bp_mods.push(p.clone());
                                }
                            }
                        }
                    }
                }
            }
            if !bp_mods.is_empty() {
                blueprints.push(ImportedExternalBlueprint {
                    name: "r2modman: Profile Loadout".to_string(),
                    load_order: bp_mods.clone(),
                    mods: bp_mods,
                });
            }
        }
    }

    if blueprints.is_empty() && !imported_mods.is_empty() {
        let mut all_mods: Vec<String> = Vec::new();
        for m in &imported_mods {
            all_mods.extend(m.imported_paths.iter().cloned());
        }
        let default_name = match detected_manager {
            "vortex" => "Vortex Imported Loadout",
            "mo2" => "MO2 Imported Loadout",
            "bg3mm" => "BG3MM Imported Loadout",
            "r2modman" => "r2modman Imported Loadout",
            _ => "Imported Staging Loadout",
        };
        blueprints.push(ImportedExternalBlueprint {
            name: default_name.to_string(),
            load_order: all_mods.clone(),
            mods: all_mods,
        });
    }

    Ok(ExodusImportReport {
        detected_manager: detected_manager.to_string(),
        hardlinked_count,
        copied_count,
        skipped_existing,
        quarantined_skipped,
        quarantined_files,
        imported_mods,
        blueprints,
    })
}

#[tauri::command]
pub async fn import_external_mod_manager(
    source_dir: String,
    vault_path: String,
    zero_copy_hardlink: Option<bool>,
    _state: tauri::State<'_, AppState>,
    sec_state: tauri::State<'_, SecurityState>,
) -> Result<ExodusImportReport, String> {
    let malware_override = sec_state
        .malware_protocol_overridden
        .load(std::sync::atomic::Ordering::SeqCst);
    let src_path = PathBuf::from(source_dir.trim());
    let vp = vault_path.trim().to_string();
    let hardlink_enabled = zero_copy_hardlink.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        let sigs = get_heuristic_signatures(vp.clone()).unwrap_or_default();
        let compiled = CompiledSignatures::new(&sigs);
        run_exodus_import(&src_path, &vp, hardlink_enabled, malware_override, &compiled)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_mo2_mods_with_hardlink_and_profile_order() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_exodus_mo2_test_{}",
            uuid::Uuid::new_v4()
        ));
        let mo2_dir = root.join("MO2");
        let vault_dir = root.join("SanctuaryVault");
        fs::create_dir_all(mo2_dir.join("mods").join("CoreFramework")).unwrap();
        fs::create_dir_all(mo2_dir.join("mods").join("HiResTextures").join("textures")).unwrap();
        fs::create_dir_all(mo2_dir.join("mods").join("Audio_separator")).unwrap();
        fs::create_dir_all(mo2_dir.join("profiles").join("Default")).unwrap();
        fs::create_dir_all(&vault_dir).unwrap();

        fs::write(
            mo2_dir.join("mods").join("CoreFramework").join("meta.ini"),
            "[General]\nversion=2.4.0\nurl=https://example.org/core\n",
        )
        .unwrap();
        fs::write(
            mo2_dir.join("mods").join("CoreFramework").join("core.esp"),
            b"TES4_CORE",
        )
        .unwrap();
        fs::write(
            mo2_dir
                .join("mods")
                .join("HiResTextures")
                .join("textures")
                .join("wood.dds"),
            b"DDS ",
        )
        .unwrap();
        // Top of modlist.txt is highest priority -> HiResTextures loads after CoreFramework.
        fs::write(
            mo2_dir.join("profiles").join("Default").join("modlist.txt"),
            "# This file was automatically generated by Mod Organizer.\n*Audio_separator\n+HiResTextures\n+CoreFramework\n-DisabledMod\n",
        )
        .unwrap();

        let compiled = CompiledSignatures::new(&[]);
        let report = run_exodus_import(
            &mo2_dir,
            vault_dir.to_string_lossy().as_ref(),
            true,
            true,
            &compiled,
        )
        .unwrap();

        assert_eq!(report.detected_manager, "mo2");
        assert_eq!(report.hardlinked_count + report.copied_count, 2);
        assert_eq!(report.imported_mods.len(), 2);
        assert!(vault_dir
            .join("Mods")
            .join("CoreFramework")
            .join("core.esp")
            .is_file());
        assert!(vault_dir
            .join("Mods")
            .join("HiResTextures")
            .join("textures")
            .join("wood.dds")
            .is_file());

        let core_meta = report
            .imported_mods
            .iter()
            .find(|m| m.mod_folder == "CoreFramework")
            .unwrap();
        assert_eq!(core_meta.version.as_deref(), Some("2.4.0"));
        assert_eq!(core_meta.url.as_deref(), Some("https://example.org/core"));

        assert_eq!(report.blueprints.len(), 1);
        assert_eq!(report.blueprints[0].name, "MO2: Default");
        assert_eq!(
            report.blueprints[0].mods,
            vec![
                "CoreFramework/core.esp".to_string(),
                "HiResTextures/textures/wood.dds".to_string()
            ]
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn imports_bg3mm_modsettings_lsx_and_paks() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_exodus_bg3mm_test_{}",
            uuid::Uuid::new_v4()
        ));
        let bg3_dir = root.join("LarianProfile");
        let vault_dir = root.join("SanctuaryVault");
        fs::create_dir_all(bg3_dir.join("Mods")).unwrap();
        fs::create_dir_all(bg3_dir.join("PlayerProfiles").join("Public")).unwrap();
        fs::create_dir_all(&vault_dir).unwrap();

        fs::write(bg3_dir.join("Mods").join("ModA.pak"), b"LSPK_A").unwrap();
        fs::write(bg3_dir.join("Mods").join("ModB.pak"), b"LSPK_B").unwrap();
        fs::write(
            bg3_dir.join("PlayerProfiles").join("Public").join("modsettings.lsx"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<save><region id="ModuleSettings"><node id="root"><children>
<node id="Mods"><children>
  <node id="ModuleShortDesc"><attribute id="Folder" type="LSString" value="GustavDev"/><attribute id="Name" type="LSString" value="GustavDev"/></node>
  <node id="ModuleShortDesc"><attribute id="Folder" type="LSString" value="ModB"/><attribute id="Name" type="LSString" value="ModB"/></node>
  <node id="ModuleShortDesc"><attribute id="Folder" type="LSString" value="ModA"/><attribute id="Name" type="LSString" value="ModA"/></node>
</children></node>
</children></node></region></save>"#,
        )
        .unwrap();

        let compiled = CompiledSignatures::new(&[]);
        let report = run_exodus_import(
            &bg3_dir,
            vault_dir.to_string_lossy().as_ref(),
            false,
            true,
            &compiled,
        )
        .unwrap();

        assert_eq!(report.detected_manager, "bg3mm");
        assert_eq!(report.blueprints.len(), 1);
        assert_eq!(report.blueprints[0].name, "BG3MM: Imported Loadout");
        assert_eq!(
            report.blueprints[0].load_order,
            vec!["ModB.pak".to_string(), "ModA.pak".to_string()]
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn imports_r2modman_mods_yml_and_bepinex_plugins() {
        let root = std::env::temp_dir().join(format!(
            "sanctuary_exodus_r2_test_{}",
            uuid::Uuid::new_v4()
        ));
        let r2_dir = root.join("r2Profile");
        let vault_dir = root.join("SanctuaryVault");
        fs::create_dir_all(r2_dir.join("BepInEx").join("plugins").join("TeamA-FastBoot")).unwrap();
        fs::create_dir_all(r2_dir.join("BepInEx").join("plugins").join("TeamB-DisabledMod")).unwrap();
        fs::create_dir_all(&vault_dir).unwrap();

        fs::write(
            r2_dir.join("BepInEx").join("plugins").join("TeamA-FastBoot").join("fastboot.cfg"),
            b"enabled=true",
        )
        .unwrap();
        fs::write(
            r2_dir.join("BepInEx").join("plugins").join("TeamB-DisabledMod").join("disabled.cfg"),
            b"enabled=false",
        )
        .unwrap();
        fs::write(
            r2_dir.join("mods.yml"),
            r#"- name: TeamA-FastBoot
  enabled: true
  versionNumber:
    major: 1
    minor: 4
    patch: 2
- name: TeamB-DisabledMod
  enabled: false
  versionNumber:
    major: 0
    minor: 9
    patch: 0
"#,
        )
        .unwrap();

        let compiled = CompiledSignatures::new(&[]);
        let report = run_exodus_import(
            &r2_dir,
            vault_dir.to_string_lossy().as_ref(),
            false,
            true,
            &compiled,
        )
        .unwrap();

        assert_eq!(report.detected_manager, "r2modman");
        assert_eq!(report.blueprints.len(), 1);
        assert_eq!(report.blueprints[0].name, "r2modman: Profile Loadout");
        assert_eq!(
            report.blueprints[0].load_order,
            vec!["TeamA-FastBoot/fastboot.cfg".to_string()]
        );
        let fast_meta = report
            .imported_mods
            .iter()
            .find(|m| m.mod_folder == "TeamA-FastBoot")
            .unwrap();
        assert_eq!(fast_meta.version.as_deref(), Some("1.4.2"));

        let _ = fs::remove_dir_all(&root);
    }
}
