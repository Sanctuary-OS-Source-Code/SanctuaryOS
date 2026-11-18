use crate::schema::GameSchema;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct StorefrontHit {
    pub source: String,
    pub install_dir: PathBuf,
    pub proton_user_dir: Option<PathBuf>,
    pub app_id: Option<String>,
}

pub fn parse_appmanifest_acf(acf_text: &str) -> (Option<String>, Option<String>, Option<String>) {
    let app_id = crate::game_logic::parse_vdf_key_values(acf_text, "appid")
        .into_iter()
        .next();
    let name = crate::game_logic::parse_vdf_key_values(acf_text, "name")
        .into_iter()
        .next();
    let install_dir = crate::game_logic::parse_vdf_key_values(acf_text, "installdir")
        .into_iter()
        .next();
    (app_id, name, install_dir)
}

pub fn parse_vdf_library_paths(vdf_text: &str) -> Vec<PathBuf> {
    crate::game_logic::parse_vdf_key_values(vdf_text, "path")
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn collect_schema_folder_terms(schema: &GameSchema) -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();
    let mut push_term = |val: &str| {
        let trimmed = val.trim();
        if !trimmed.is_empty() && !terms.iter().any(|t| t.eq_ignore_ascii_case(trimmed)) {
            terms.push(trimmed.to_string());
        }
    };

    if let Some(folders) = &schema.install_folder_names {
        for f in folders {
            push_term(f);
        }
    }
    if !schema.display_name.trim().is_empty()
        && !schema.display_name.eq_ignore_ascii_case("Default Master Schema")
    {
        push_term(&schema.display_name);
    }
    terms
}

fn candidate_matches_exe(dir: &Path, schema: &Option<GameSchema>) -> bool {
    if !dir.exists() {
        return false;
    }
    let Some(s) = schema.as_ref() else {
        return true;
    };
    if s.executable_names.is_empty() {
        return true;
    }
    let dir_str = dir.to_string_lossy().to_string();
    crate::game_logic::resolve_executable_path(&dir_str, schema).is_some()
}

#[cfg(target_os = "windows")]
fn reg_query_value(key: &str, value_name: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let out = std::process::Command::new("reg")
        .args(["query", key, "/v", value_name])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(pos) = trimmed.find("REG_SZ") {
            let val = trimmed[pos + "REG_SZ".len()..].trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
        if let Some(pos) = trimmed.find("REG_EXPAND_SZ") {
            let val = trimmed[pos + "REG_EXPAND_SZ".len()..].trim();
            if !val.is_empty() {
                return Some(crate::game_logic::expand_env_vars(val));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn discover_windows_steam_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for (key, val) in [
        ("HKCU\\Software\\Valve\\Steam", "SteamPath"),
        ("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"),
        ("HKLM\\SOFTWARE\\Valve\\Steam", "InstallPath"),
    ] {
        if let Some(raw) = reg_query_value(key, val) {
            let root = PathBuf::from(raw.replace('/', "\\"));
            if root.is_dir() && !roots.contains(&root) {
                roots.push(root);
            }
        }
    }
    roots
}

#[cfg(not(target_os = "windows"))]
fn discover_windows_steam_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn expand_steam_roots_with_vdf() -> Vec<PathBuf> {
    let mut libs = crate::game_logic::discover_steam_libraries();
    let mut add_lib = |p: PathBuf| {
        if p.exists() && !libs.contains(&p) {
            libs.push(p);
        }
    };

    for root in discover_windows_steam_roots() {
        add_lib(root.clone());
        for rel in [
            Path::new("steamapps").join("libraryfolders.vdf"),
            Path::new("config").join("libraryfolders.vdf"),
        ] {
            let vdf = root.join(rel);
            if vdf.is_file() {
                if let Ok(text) = std::fs::read_to_string(&vdf) {
                    for extra in parse_vdf_library_paths(&text) {
                        add_lib(extra);
                    }
                }
            }
        }
    }
    libs
}

fn discover_via_steam(schema: &Option<GameSchema>, s: &GameSchema) -> Option<StorefrontHit> {
    if let Some(res) = crate::game_logic::resolve_steam_app_and_proton_prefix(schema, None) {
        if let Some(install_dir) = res.install_dir {
            if candidate_matches_exe(&install_dir, schema) {
                return Some(StorefrontHit {
                    source: "steam".to_string(),
                    install_dir,
                    proton_user_dir: res.compatdata_pfx_user_dir,
                    app_id: Some(res.app_id),
                });
            }
        }
    }

    let libs = expand_steam_roots_with_vdf();
    let app_id_opt = crate::game_logic::default_steam_app_id(schema);
    let terms = collect_schema_folder_terms(s);

    for lib in &libs {
        let steamapps = lib.join("steamapps");
        if let Some(ref app_id) = app_id_opt {
            let manifest = steamapps.join(format!("appmanifest_{}.acf", app_id));
            if manifest.is_file() {
                if let Ok(text) = std::fs::read_to_string(&manifest) {
                    let (_, _, installdir) = parse_appmanifest_acf(&text);
                    if let Some(folder) = installdir {
                        let candidate = steamapps.join("common").join(folder);
                        if candidate_matches_exe(&candidate, schema) {
                            let proton_user_dir = if cfg!(target_os = "linux") {
                                let pfx_user = steamapps
                                    .join("compatdata")
                                    .join(app_id)
                                    .join("pfx")
                                    .join("drive_c")
                                    .join("users")
                                    .join("steamuser");
                                pfx_user.is_dir().then_some(pfx_user)
                            } else {
                                None
                            };
                            return Some(StorefrontHit {
                                source: "steam".to_string(),
                                install_dir: candidate,
                                proton_user_dir,
                                app_id: Some(app_id.clone()),
                            });
                        }
                    }
                }
            }
        }

        if !terms.is_empty() {
            let common_dir = steamapps.join("common");
            if let Ok(entries) = std::fs::read_dir(&common_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if !p.is_dir() {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if terms.iter().any(|t| t.eq_ignore_ascii_case(&name))
                        && candidate_matches_exe(&p, schema)
                    {
                        return Some(StorefrontHit {
                            source: "steam".to_string(),
                            install_dir: p,
                            proton_user_dir: None,
                            app_id: app_id_opt.clone(),
                        });
                    }
                }
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn discover_via_windows_gog_and_uninstall(
    schema: &Option<GameSchema>,
    s: &GameSchema,
) -> Option<StorefrontHit> {
    if let Some(gog_ids) = &s.gog_app_ids {
        for gid in gog_ids {
            let clean_id = gid.trim();
            if clean_id.is_empty() {
                continue;
            }
            for base in [
                "HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games",
                "HKLM\\SOFTWARE\\GOG.com\\Games",
            ] {
                let key = format!("{}\\{}", base, clean_id);
                if let Some(raw_path) = reg_query_value(&key, "path") {
                    let candidate = PathBuf::from(raw_path.trim().trim_matches('"'));
                    if candidate_matches_exe(&candidate, schema) {
                        return Some(StorefrontHit {
                            source: "gog".to_string(),
                            install_dir: candidate,
                            proton_user_dir: None,
                            app_id: Some(clean_id.to_string()),
                        });
                    }
                }
            }
        }
    }

    let mut uninstall_terms = collect_schema_folder_terms(s);
    if let Some(ea_ids) = &s.ea_content_ids {
        for id in ea_ids {
            let trimmed = id.trim();
            if !trimmed.is_empty()
                && !uninstall_terms.iter().any(|t| t.eq_ignore_ascii_case(trimmed))
            {
                uninstall_terms.push(trimmed.to_string());
            }
        }
    }
    if uninstall_terms.is_empty() {
        return None;
    }

    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    for root_key in [
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ] {
        let Ok(out) = std::process::Command::new("reg")
            .args(["query", root_key])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        else {
            continue;
        };
        if !out.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        for subkey in stdout.lines().map(str::trim).filter(|l| l.starts_with("HKEY_")) {
            let lower_sub = subkey.to_ascii_lowercase();
            let subkey_match = uninstall_terms
                .iter()
                .any(|t| lower_sub.contains(&t.to_ascii_lowercase()));
            if !subkey_match {
                let disp = reg_query_value(subkey, "DisplayName").unwrap_or_default();
                if !uninstall_terms
                    .iter()
                    .any(|t| !disp.is_empty() && disp.eq_ignore_ascii_case(t))
                {
                    continue;
                }
            }
            if let Some(raw_loc) = reg_query_value(subkey, "InstallLocation") {
                let candidate = PathBuf::from(raw_loc.trim().trim_matches('"'));
                if candidate_matches_exe(&candidate, schema) {
                    let source = if s
                        .ea_content_ids
                        .as_ref()
                        .map_or(false, |ids| !ids.is_empty())
                        && subkey.to_ascii_lowercase().contains("ea")
                    {
                        "ea_app"
                    } else {
                        "windows_registry"
                    };
                    return Some(StorefrontHit {
                        source: source.to_string(),
                        install_dir: candidate,
                        proton_user_dir: None,
                        app_id: None,
                    });
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn discover_via_windows_gog_and_uninstall(
    _schema: &Option<GameSchema>,
    _s: &GameSchema,
) -> Option<StorefrontHit> {
    None
}

fn discover_via_epic_and_heroic(schema: &Option<GameSchema>, s: &GameSchema) -> Option<StorefrontHit> {
    let epic_ids: Vec<String> = s
        .epic_app_names
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();
    let folder_terms = collect_schema_folder_terms(s);

    // 1. Epic Games Launcher Windows `.item` manifests
    if let Ok(program_data) = std::env::var("PROGRAMDATA") {
        let manifests_dir = Path::new(&program_data)
            .join("Epic")
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests");
        if let Ok(entries) = std::fs::read_dir(&manifests_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p
                    .extension()
                    .and_then(|e| e.to_str())
                    .map_or(false, |e| e.eq_ignore_ascii_case("item"))
                {
                    continue;
                }
                if let Ok(raw) = std::fs::read_to_string(&p) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                        let app_name = val.get("AppName").and_then(|v| v.as_str()).unwrap_or("");
                        let catalog_id = val
                            .get("CatalogItemId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let display_name =
                            val.get("DisplayName").and_then(|v| v.as_str()).unwrap_or("");
                        let install_loc = val
                            .get("InstallLocation")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        let id_match = epic_ids.iter().any(|eid| {
                            eid.eq_ignore_ascii_case(app_name)
                                || eid.eq_ignore_ascii_case(catalog_id)
                        });
                        let name_match = folder_terms
                            .iter()
                            .any(|t| t.eq_ignore_ascii_case(display_name));

                        if (id_match || name_match) && !install_loc.trim().is_empty() {
                            let candidate = PathBuf::from(install_loc.trim());
                            if candidate_matches_exe(&candidate, schema) {
                                return Some(StorefrontHit {
                                    source: "epic".to_string(),
                                    install_dir: candidate,
                                    proton_user_dir: None,
                                    app_id: (!app_name.is_empty()).then(|| app_name.to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Heroic Games Launcher `installed.json` (Linux / macOS)
    if let Some(home) = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
    {
        for heroic_json in [
            home.join(".config/heroic/legendaryConfig/legendary/installed.json"),
            home.join("Library/Application Support/heroic/legendaryConfig/legendary/installed.json"),
        ] {
            if !heroic_json.is_file() {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(&heroic_json) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let mut items: Vec<&serde_json::Value> = Vec::new();
                    if let Some(obj) = val.as_object() {
                        items.extend(obj.values());
                    } else if let Some(arr) = val.as_array() {
                        items.extend(arr.iter());
                    }
                    for item in items {
                        let app_name = item
                            .get("app_name")
                            .or_else(|| item.get("AppName"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let title = item
                            .get("title")
                            .or_else(|| item.get("Title"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let install_path = item
                            .get("install_path")
                            .or_else(|| item.get("InstallPath"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        let id_match = epic_ids
                            .iter()
                            .any(|eid| eid.eq_ignore_ascii_case(app_name));
                        let title_match =
                            folder_terms.iter().any(|t| t.eq_ignore_ascii_case(title));
                        if (id_match || title_match) && !install_path.trim().is_empty() {
                            let candidate = PathBuf::from(install_path.trim());
                            if candidate_matches_exe(&candidate, schema) {
                                return Some(StorefrontHit {
                                    source: "heroic".to_string(),
                                    install_dir: candidate,
                                    proton_user_dir: None,
                                    app_id: (!app_name.is_empty()).then(|| app_name.to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn discover_via_lutris(schema: &Option<GameSchema>, s: &GameSchema) -> Option<StorefrontHit> {
    let home = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(dirs::home_dir)?;
    let db_path = home.join(".local/share/lutris/pga.db");
    if !db_path.is_file() {
        return None;
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .ok()?;
    let mut stmt = conn
        .prepare("SELECT directory, slug, name, installer_slug FROM games WHERE directory IS NOT NULL AND directory != ''")
        .ok()?;
    let mut terms = collect_schema_folder_terms(s);
    if !s.game_id.trim().is_empty() {
        terms.push(s.game_id.trim().to_string());
    }
    if let Some(gog_ids) = &s.gog_app_ids {
        terms.extend(gog_ids.iter().map(|g| g.trim().to_string()));
    }

    let rows = stmt
        .query_map([], |row| {
            let dir: String = row.get(0)?;
            let slug: Option<String> = row.get(1).ok();
            let name: Option<String> = row.get(2).ok();
            let installer_slug: Option<String> = row.get(3).ok();
            Ok((dir, slug, name, installer_slug))
        })
        .ok()?;

    for row in rows.flatten() {
        let (dir, slug, name, installer_slug) = row;
        let matches = terms.iter().any(|t| {
            !t.is_empty()
                && (name.as_deref().map_or(false, |n| n.eq_ignore_ascii_case(t))
                    || slug.as_deref().map_or(false, |sl| sl.eq_ignore_ascii_case(t))
                    || installer_slug
                        .as_deref()
                        .map_or(false, |is| is.eq_ignore_ascii_case(t)))
        });
        if matches {
            let candidate = PathBuf::from(dir.trim());
            if candidate_matches_exe(&candidate, schema) {
                return Some(StorefrontHit {
                    source: "lutris".to_string(),
                    install_dir: candidate,
                    proton_user_dir: None,
                    app_id: slug,
                });
            }
        }
    }

    None
}

fn discover_via_macos_applications(schema: &Option<GameSchema>, s: &GameSchema) -> Option<StorefrontHit> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let mut app_dirs = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
    {
        app_dirs.push(home.join("Applications"));
    }

    let mut candidates: Vec<String> = Vec::new();
    for exe in &s.executable_names {
        if exe.ends_with(".app") {
            candidates.push(exe.clone());
        }
    }
    for term in collect_schema_folder_terms(s) {
        if term.ends_with(".app") {
            candidates.push(term);
        } else {
            candidates.push(format!("{}.app", term));
        }
    }

    for base in app_dirs {
        for app_name in &candidates {
            let p = base.join(app_name);
            if candidate_matches_exe(&p, schema) {
                return Some(StorefrontHit {
                    source: "macos_app".to_string(),
                    install_dir: p,
                    proton_user_dir: None,
                    app_id: None,
                });
            }
        }
    }
    None
}

pub(crate) fn parse_microsoft_game_config_matches(
    xml: &str,
    store_ids: &[String],
    folder_names: &[String],
) -> bool {
    let clean = xml.strip_prefix('\u{FEFF}').unwrap_or(xml);
    let Ok(doc) = roxmltree::Document::parse(clean) else {
        return false;
    };
    let needles: Vec<String> = store_ids
        .iter()
        .chain(folder_names.iter())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if needles.is_empty() {
        return false;
    }
    for node in doc.descendants() {
        let tag = node.tag_name().name();
        if tag.eq_ignore_ascii_case("Identity") {
            if let Some(name) = node.attribute("Name").map(str::trim) {
                let nl = name.to_ascii_lowercase();
                if needles.iter().any(|n| nl == *n || nl.contains(n)) {
                    return true;
                }
            }
        }
        if matches!(
            tag.to_ascii_lowercase().as_str(),
            "storeid" | "productid" | "msaappid" | "displayname"
        ) {
            if let Some(txt) = node.text().map(str::trim) {
                let tl = txt.to_ascii_lowercase();
                if needles.iter().any(|n| tl == *n || tl.contains(n)) {
                    return true;
                }
            }
        }
        if tag.eq_ignore_ascii_case("ShellVisuals") {
            if let Some(disp) = node.attribute("DefaultDisplayName").map(str::trim) {
                let dl = disp.to_ascii_lowercase();
                if needles.iter().any(|n| dl == *n || dl.contains(n)) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn discover_via_xbox_windows_store(
    schema: &Option<GameSchema>,
    s: &GameSchema,
) -> Option<StorefrontHit> {
    let store_ids: Vec<String> = s
        .xbox_store_ids
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();
    if store_ids.is_empty() {
        return None;
    }
    let folder_terms = collect_schema_folder_terms(s);

    let mut xbox_roots: Vec<PathBuf> = Vec::new();
    for drive in b'C'..=b'Z' {
        let drive_root = PathBuf::from(format!("{}:\\", drive as char));
        if !drive_root.exists() {
            continue;
        }
        let gaming_root_file = drive_root.join(".GamingRoot");
        if let Ok(bytes) = std::fs::read(&gaming_root_file) {
            if bytes.len() > 8 {
                let u16s: Vec<u16> = bytes[8..]
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                let rel_root = String::from_utf16_lossy(&u16s)
                    .trim_end_matches('\0')
                    .trim()
                    .to_string();
                if !rel_root.is_empty() {
                    let cand = drive_root.join(rel_root);
                    if cand.is_dir() && !xbox_roots.contains(&cand) {
                        xbox_roots.push(cand);
                    }
                }
            }
        }
        let default_xbox = drive_root.join("XboxGames");
        if default_xbox.is_dir() && !xbox_roots.contains(&default_xbox) {
            xbox_roots.push(default_xbox);
        }
    }

    for root in xbox_roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let game_dir = entry.path();
            if !game_dir.is_dir() {
                continue;
            }
            for cfg_cand in [
                game_dir.join("Content").join("MicrosoftGame.config"),
                game_dir.join("MicrosoftGame.config"),
            ] {
                if !cfg_cand.is_file() {
                    continue;
                }
                if let Ok(xml) = std::fs::read_to_string(&cfg_cand) {
                    if parse_microsoft_game_config_matches(&xml, &store_ids, &folder_terms) {
                        let content_root = cfg_cand.parent().unwrap_or(&game_dir).to_path_buf();
                        let resolved_dir = if candidate_matches_exe(&content_root, schema) {
                            content_root
                        } else if candidate_matches_exe(&game_dir, schema) {
                            game_dir
                        } else {
                            continue;
                        };
                        return Some(StorefrontHit {
                            source: "xbox".to_string(),
                            install_dir: resolved_dir,
                            proton_user_dir: None,
                            app_id: store_ids.first().cloned(),
                        });
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn discover_via_xbox_windows_store(
    _schema: &Option<GameSchema>,
    _s: &GameSchema,
) -> Option<StorefrontHit> {
    None
}

pub fn discover_game_install(schema: &Option<GameSchema>) -> Option<StorefrontHit> {
    let s = schema.as_ref()?;
    discover_via_steam(schema, s)
        .or_else(|| discover_via_windows_gog_and_uninstall(schema, s))
        .or_else(|| discover_via_epic_and_heroic(schema, s))
        .or_else(|| discover_via_xbox_windows_store(schema, s))
        .or_else(|| discover_via_lutris(schema, s))
        .or_else(|| discover_via_macos_applications(schema, s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_appmanifest_acf_and_library_vdf() {
        let acf = r#"
"AppState"
{
    "appid"     "1086940"
    "name"      "Baldur's Gate 3"
    "installdir"    "Baldurs Gate 3"
}
"#;
        let (appid, name, installdir) = parse_appmanifest_acf(acf);
        assert_eq!(appid.as_deref(), Some("1086940"));
        assert_eq!(name.as_deref(), Some("Baldur's Gate 3"));
        assert_eq!(installdir.as_deref(), Some("Baldurs Gate 3"));

        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\\Program Files (x86)\\Steam"
    }
    "1"
    {
        "path"      "D:\\SteamLibrary"
    }
}
"#;
        let libs = parse_vdf_library_paths(vdf);
        assert_eq!(libs.len(), 2);
        assert_eq!(libs[1], PathBuf::from("D:\\SteamLibrary"));
    }

    #[test]
    fn microsoft_game_config_matches_xbox_store_ids_and_identity() {
        let cfg_xml = r#"<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="BethesdaSoftworks.ProjectGold" Publisher="CN=Test" Version="1.0.0.0"/>
  <StoreId>9NCX12345XYZ</StoreId>
  <ShellVisuals DefaultDisplayName="Starfield"/>
</Game>"#;

        assert!(parse_microsoft_game_config_matches(
            cfg_xml,
            &["9ncx12345xyz".to_string()],
            &[],
        ));
        assert!(parse_microsoft_game_config_matches(
            cfg_xml,
            &["BethesdaSoftworks.ProjectGold".to_string()],
            &[],
        ));
        assert!(!parse_microsoft_game_config_matches(
            cfg_xml,
            &["9NONEXISTENT".to_string()],
            &["OtherGame".to_string()],
        ));
    }
}

