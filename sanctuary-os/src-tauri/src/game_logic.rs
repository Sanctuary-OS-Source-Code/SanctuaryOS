use crate::schema::GameSchema;
use std::path::{Path, PathBuf};

pub fn is_sims4_schema(schema: &Option<GameSchema>) -> bool {
    let Some(s) = schema else {
        return true;
    };
    let gid = s.game_id.trim().to_lowercase();
    let id_str = s.id.as_deref().unwrap_or("").trim().to_lowercase();
    let effective = if !gid.is_empty() {
        gid.as_str()
    } else {
        id_str.as_str()
    };
    matches!(
        effective,
        "" | "sims4" | "the-sims-4" | "default_schema"
    )
}

pub fn get_load_order_strategy(schema: &Option<GameSchema>) -> String {
    if let Some(s) = schema {
        if let Some(lo) = &s.load_order {
            if let Some(strat) = &lo.strategy {
                if !strat.is_empty() {
                    return strat.to_lowercase();
                }
            }
        }
    }
    if is_sims4_schema(schema) {
        "folder_priority".to_string()
    } else {
        "none".to_string()
    }
}

pub fn get_priority_folders(schema: &Option<GameSchema>) -> Vec<String> {
    let mut folders = if is_sims4_schema(schema) {
        vec![
            "".to_string(),
            "!Sanctuary".to_string(),
            "!Sanctuary2".to_string(),
            "!Sanctuary3".to_string(),
            "Sanctuary".to_string(),
            "Sanctuary2".to_string(),
            "Sanctuary3".to_string(),
        ]
    } else {
        vec!["".to_string()]
    };
    if let Some(s) = schema {
        if let Some(lo) = &s.load_order {
            if let Some(tiers) = &lo.priority_tiers {
                for tier in tiers {
                    if !folders.contains(&tier.folder) {
                        folders.push(tier.folder.clone());
                    }
                    let bang = format!("!{}", tier.folder);
                    if !tier.folder.is_empty() && !folders.contains(&bang) {
                        folders.push(bang);
                    }
                }
            }
        }
    }
    folders
}

pub fn generate_manifest_if_needed(schema: &Option<GameSchema>, mods_dir: &Path) {
    let default_sims4_manifest = "Priority 500\nPackedFile *.package\nPackedFile */*.package\nPackedFile */*/*.package\nPackedFile */*/*/*.package\nPackedFile */*/*/*/*.package\nPackedFile */*/*/*/*/*.package\n";

    if let Some(s) = schema {
        let strategy = get_load_order_strategy(schema);
        if strategy == "none" {
            return;
        }

        let raw_manifest_file = s
            .load_order
            .as_ref()
            .and_then(|lo| lo.manifest_file.clone())
            .filter(|f| !f.trim().is_empty())
            .or_else(|| {
                if !s.paths.manifest_file.trim().is_empty() {
                    Some(s.paths.manifest_file.clone())
                } else {
                    None
                }
            });

        let has_manifest_content = s
            .manifest_content
            .as_ref()
            .map_or(false, |c| !c.trim().is_empty());

        if !is_sims4_schema(schema) && raw_manifest_file.is_none() && !has_manifest_content {
            return;
        }

        let manifest_file = match raw_manifest_file {
            Some(f) => f,
            None => {
                if is_sims4_schema(schema) {
                    "Resource.cfg".to_string()
                } else {
                    return;
                }
            }
        };

        if manifest_file.trim().is_empty() || manifest_file.eq_ignore_ascii_case("none") {
            return;
        }

        if strategy == "folder_priority" {
            let base_content = s
                .manifest_content
                .as_ref()
                .filter(|c| !c.trim().is_empty())
                .cloned()
                .or_else(|| {
                    if is_sims4_schema(schema) && manifest_file.eq_ignore_ascii_case("resource.cfg")
                    {
                        Some(default_sims4_manifest.to_string())
                    } else {
                        None
                    }
                });

            if let Some(content) = base_content {
                let mut full_content = content;
                let line_tpl = s
                    .load_order
                    .as_ref()
                    .and_then(|lo| lo.line_template.as_ref())
                    .map(|t| t.trim())
                    .filter(|t| !t.is_empty());

                let exts_to_pack: Vec<String> = if is_sims4_schema(schema) {
                    vec!["package".to_string()]
                } else {
                    let configured: Vec<String> = s
                        .extensions
                        .supported
                        .iter()
                        .map(|e| e.trim_start_matches('.').to_lowercase())
                        .filter(|e| {
                            !e.is_empty() && e != "zip" && e != "rar" && e != "7z"
                        })
                        .collect();
                    if configured.is_empty() {
                        vec!["package".to_string()]
                    } else {
                        configured
                    }
                };

                if let Some(lo) = &s.load_order {
                    if let Some(tiers) = &lo.priority_tiers {
                        for tier in tiers {
                            if !tier.folder.is_empty() {
                                if let Some(tpl) = line_tpl {
                                    if tpl.contains("{folder}") {
                                        let rendered = tpl
                                            .replace("{folder}", &tier.folder)
                                            .replace("{priority}", &tier.priority.to_string());
                                        if !full_content.contains(&rendered) {
                                            full_content.push_str(&format!("\n\n{}", rendered));
                                        }
                                        continue;
                                    }
                                }
                                let first_ext =
                                    exts_to_pack.first().map(|s| s.as_str()).unwrap_or("package");
                                if !full_content.contains(&format!(
                                    "PackedFile {}/*.{}",
                                    tier.folder, first_ext
                                )) {
                                    let packed_lines = exts_to_pack
                                        .iter()
                                        .map(|ext| {
                                            format!(
                                                "PackedFile {}/*.{}\nPackedFile {}/*/*.{}\nPackedFile {}/*/*/*.{}",
                                                tier.folder, ext, tier.folder, ext, tier.folder, ext
                                            )
                                        })
                                        .collect::<Vec<_>>()
                                        .join("\n");
                                    full_content.push_str(&format!(
                                        "\n\nPriority {}\n{}",
                                        tier.priority, packed_lines
                                    ));
                                }
                            }
                        }
                    }
                }
                let _ = std::fs::write(mods_dir.join(&manifest_file), full_content);
            }
        } else if let Some(content) = &s.manifest_content {
            if !content.is_empty() && strategy != "manifest_list" {
                let _ = std::fs::write(mods_dir.join(&manifest_file), content);
            }
        }
    } else {
        let _ = std::fs::write(mods_dir.join("Resource.cfg"), default_sims4_manifest);
    }
}

pub fn write_load_order_manifest(
    schema: &Option<GameSchema>,
    mods_dir: &Path,
    ordered_files: &[String],
) {
    if let Some(s) = schema {
        let strategy = get_load_order_strategy(schema);
        if strategy != "manifest_list" {
            return;
        }
        let manifest_file = s
            .load_order
            .as_ref()
            .and_then(|lo| lo.manifest_file.clone())
            .filter(|f| !f.is_empty())
            .unwrap_or_else(|| s.paths.manifest_file.clone());

        if manifest_file.is_empty() {
            return;
        }

        let template = s
            .load_order
            .as_ref()
            .and_then(|lo| lo.line_template.clone())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "{file}".to_string());

        let mut lines = Vec::new();
        if let Some(header) = &s.manifest_content {
            if !header.trim().is_empty() {
                lines.push(header.trim().to_string());
            }
        }
        for (idx, file) in ordered_files.iter().enumerate() {
            let line = template
                .replace("{file}", file)
                .replace("{index}", &(idx + 1).to_string());
            lines.push(line);
        }
        let _ = std::fs::write(mods_dir.join(&manifest_file), lines.join("\n"));
    }
}

pub fn get_file_label(schema: &Option<GameSchema>, ext: &str) -> String {
    let ext_clean = ext.trim_start_matches('.').to_lowercase();
    if let Some(s) = schema {
        if let Some(label) = s
            .extensions
            .labels
            .get(&ext_clean)
            .or_else(|| s.extensions.labels.get(&format!(".{}", ext_clean)))
        {
            return label.clone();
        }
    }
    if ext_clean == "package" {
        return "PACKAGE".to_string();
    }
    if ext_clean == "ts4script" {
        return "SCRIPT".to_string();
    }
    if ext_clean == "world" {
        return "WORLD".to_string();
    }
    "UNKNOWN".to_string()
}

pub fn get_install_routes(schema: &Option<GameSchema>) -> Vec<crate::schema::SchemaInstallRoute> {
    if let Some(s) = schema {
        if let Some(routes) = &s.install_routes {
            return routes.clone();
        }
    }
    if is_sims4_schema(schema) {
        vec![crate::schema::SchemaInstallRoute {
            id: "world_areas".to_string(),
            label: Some("World Area Files (.world)".to_string()),
            extensions: vec![".world".to_string()],
            folder_match: Some("Worlds".to_string()),
            target_root: "live_path".to_string(),
            target_subdir: "Data/Shared/Worlds/Areas".to_string(),
            preserve_vanilla: Some(true),
        }]
    } else {
        Vec::new()
    }
}

pub fn is_dlc_folder(schema: &Option<GameSchema>, folder_name: &str) -> bool {
    let name_up = folder_name.to_uppercase();
    if let Some(s) = schema {
        if let Some(prefixes) = &s.dlc_folder_prefixes {
            if !prefixes.is_empty() {
                return prefixes
                    .iter()
                    .any(|p| name_up.starts_with(&p.to_uppercase()));
            } else if !is_sims4_schema(schema) {
                return false;
            }
        }
    }

    if is_sims4_schema(schema) {
        name_up.starts_with("EP")
            || name_up.starts_with("GP")
            || name_up.starts_with("SP")
            || name_up.starts_with("FP")
    } else {
        false
    }
}

pub fn get_config_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        if let Some(cfg_exts) = &s.extensions.config_extensions {
            let cleaned: Vec<String> = cfg_exts
                .iter()
                .map(|ext| ext.trim_start_matches('.').to_lowercase())
                .filter(|ext| !ext.is_empty())
                .collect();
            if !cleaned.is_empty() {
                return cleaned;
            }
        }
    }
    vec![
        "cfg".to_string(),
        "ini".to_string(),
        "json".to_string(),
        "txt".to_string(),
        "xml".to_string(),
    ]
}

pub fn get_supported_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    let cfg_exts = get_config_extensions(schema);
    let mut exts = if let Some(s) = schema {
        let configured: Vec<String> = s
            .extensions
            .supported
            .iter()
            .map(|ext| ext.trim_start_matches('.').to_lowercase())
            .filter(|ext| !ext.is_empty())
            .collect();
        if !configured.is_empty() {
            configured
        } else if is_sims4_schema(schema) {
            let mut defaults = vec![
                "package".to_string(),
                "ts4script".to_string(),
                "world".to_string(),
                "zip".to_string(),
                "rar".to_string(),
                "7z".to_string(),
                "log".to_string(),
            ];
            for c in &cfg_exts {
                if !defaults.contains(c) {
                    defaults.push(c.clone());
                }
            }
            defaults
        } else {
            let mut defaults = vec!["zip".to_string(), "rar".to_string(), "7z".to_string()];
            for c in &cfg_exts {
                if !defaults.contains(c) {
                    defaults.push(c.clone());
                }
            }
            defaults
        }
    } else {
        let mut defaults = vec![
            "package".to_string(),
            "ts4script".to_string(),
            "world".to_string(),
            "zip".to_string(),
            "rar".to_string(),
            "7z".to_string(),
            "log".to_string(),
        ];
        for c in &cfg_exts {
            if !defaults.contains(c) {
                defaults.push(c.clone());
            }
        }
        defaults
    };
    for route in get_install_routes(schema) {
        for r_ext in route.extensions {
            let clean = r_ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !exts.contains(&clean) {
                exts.push(clean);
            }
        }
    }
    exts
}

pub fn get_vault_visible_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    let mut ext_list = Vec::new();
    if let Some(s) = schema {
        if let Some(visible) = &s.extensions.vault_visible {
            for ext in visible {
                let clean = ext.trim_start_matches('.').to_lowercase();
                if !clean.is_empty() && !ext_list.contains(&clean) {
                    ext_list.push(clean);
                }
            }
        }
        for ext in &s.extensions.supported {
            let clean = ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !ext_list.contains(&clean) {
                ext_list.push(clean);
            }
        }
        if let Some(ignore) = &s.extensions.ignore_unidentified {
            for ext in ignore {
                let clean = ext.trim_start_matches('.').to_lowercase();
                if !clean.is_empty() && !ext_list.contains(&clean) {
                    ext_list.push(clean);
                }
            }
        }
    }
    if ext_list.is_empty() && is_sims4_schema(schema) {
        ext_list.extend(vec![
            "package".to_string(),
            "ts4script".to_string(),
            "world".to_string(),
        ]);
    }
    for cfg_ext in get_config_extensions(schema) {
        if !ext_list.contains(&cfg_ext) {
            ext_list.push(cfg_ext);
        }
    }
    if !ext_list.contains(&"log".to_string()) {
        ext_list.push("log".to_string());
    }
    for route in get_install_routes(schema) {
        for r_ext in route.extensions {
            let clean = r_ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !ext_list.contains(&clean) {
                ext_list.push(clean);
            }
        }
    }
    ext_list
}

pub fn is_cache_file(schema: &Option<GameSchema>, file_name: &str) -> bool {
    if let Some(s) = schema {
        if let Some(cache_files) = &s.extensions.cache_files {
            if !cache_files.is_empty() {
                return cache_files
                    .iter()
                    .any(|c| c.eq_ignore_ascii_case(file_name));
            }
        }
    }

    if is_sims4_schema(schema) {
        file_name == "localthumbcache.package"
            || file_name == "avatarcache.package"
            || file_name == "localsimtexturecache.package"
    } else {
        false
    }
}

pub fn is_exception_log(schema: &Option<GameSchema>, file_name: &str) -> bool {
    if let Some(s) = schema {
        if let Some(logs) = &s.exception_logs {
            if !logs.is_empty() {
                for log in logs {
                    let name = file_name.to_lowercase();
                    if let Some(exact) = &log.exact {
                        if name == exact.to_lowercase() {
                            return true;
                        }
                    } else {
                        let mut matches = true;
                        if let Some(starts) = &log.starts_with {
                            if !name.starts_with(&starts.to_lowercase()) {
                                matches = false;
                            }
                        }
                        if let Some(ends) = &log.ends_with {
                            if !name.ends_with(&ends.to_lowercase()) {
                                matches = false;
                            }
                        }
                        // Only return true if at least starts or ends was specified
                        if matches && (log.starts_with.is_some() || log.ends_with.is_some()) {
                            return true;
                        }
                    }
                }
                return false;
            }
        }
    }

    if is_sims4_schema(schema) {
        let name = file_name.to_lowercase();
        (name.starts_with("lastexception") && name.ends_with(".txt"))
            || (name.starts_with("lastuiexception") && name.ends_with(".txt"))
            || (name.starts_with("lastcleanexception") && name.ends_with(".txt"))
            || (name.starts_with("be-exceptionreport") && name.ends_with(".html"))
            || name == "lastcrash.txt"
            || name == "mc_lastexception.html"
    } else {
        false
    }
}

pub fn is_ignored_lab_exception(
    schema: &Option<GameSchema>,
    file_name: &str,
    content: &str,
) -> bool {
    let content_lower = content.to_lowercase();
    let file_lower = file_name.to_lowercase();

    if let Some(s) = schema {
        if let Some(rules) = &s.exception_rules {
            if !rules.is_empty() {
                for rule in rules {
                    let is_explicitly_faulty = rule.severity.eq_ignore_ascii_case("corrupted")
                        || rule.severity.eq_ignore_ascii_case("critical")
                        || rule.severity.eq_ignore_ascii_case("unstable")
                        || rule.severity.eq_ignore_ascii_case("warning");
                    let is_unrelated_or_ignored = !is_explicitly_faulty
                        && (rule.ignore_in_lab
                            || rule.severity.eq_ignore_ascii_case("unrelated")
                            || rule.severity.eq_ignore_ascii_case("benign"));
                    if !rule.enabled || !is_unrelated_or_ignored {
                        continue;
                    }
                    let pat = rule.pattern.trim().to_lowercase();
                    if pat.is_empty() {
                        continue;
                    }
                    if let Some(hint) = &rule.file_hint {
                        let h = hint.trim().to_lowercase();
                        if !h.is_empty() && !file_lower.contains(&h) {
                            continue;
                        }
                    }
                    // Support OR patterns separated by | or ||
                    let matched = pat
                        .split('|')
                        .map(|p| p.trim())
                        .filter(|p| !p.is_empty())
                        .any(|p| content_lower.contains(p));
                    if matched {
                        return true;
                    }
                }
                return false;
            }
        }
    }

    // Built-in fallback for normal EA base-game bugs when exception_rules have not yet synced
    let default_unrelated_patterns = [
        "developmental_milestone_tracker.py",
    ];
    default_unrelated_patterns
        .iter()
        .any(|p| content_lower.contains(p))
}


pub fn get_executable_names(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        if !s.executable_names.is_empty() {
            #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
            let mut names = s.executable_names.clone();
            #[cfg(target_os = "macos")]
            if is_sims4_schema(schema) && !names.iter().any(|n| n.ends_with(".app")) {
                names.insert(0, "The Sims 4.app".to_string());
            }
            return names;
        }
    }
    if is_sims4_schema(schema) {
        vec![
            #[cfg(target_os = "macos")]
            "The Sims 4.app".to_string(),
            "TS4_x64.exe".to_string(),
            "TS4.exe".to_string(),
            "TS4_DX9_x64.exe".to_string(),
        ]
    } else {
        Vec::new()
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SteamProtonResolution {
    pub app_id: String,
    pub library_root: PathBuf,
    pub install_dir: Option<PathBuf>,
    pub compatdata_pfx_user_dir: Option<PathBuf>,
}

pub fn default_steam_app_id(schema: &Option<GameSchema>) -> Option<String> {
    let s = schema.as_ref()?;
    if let Some(ref explicit) = s.steam_app_id {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    let id_key = if !s.game_id.trim().is_empty() {
        s.game_id.trim().to_lowercase()
    } else if let Some(ref sid) = s.id {
        sid.trim().to_lowercase()
    } else {
        s.display_name.trim().to_lowercase()
    };

    match id_key.as_str() {
        "sims4" | "the_sims_4" | "the sims 4" => Some("1222670".to_string()),
        "gtav" | "gta_v" | "gta5" | "grand theft auto v" => Some("271590".to_string()),
        "wwe2k" | "wwe2k24" | "wwe 2k24" => Some("2315690".to_string()),
        "skyrim" | "skyrimse" | "skyrim_se" | "skyrim special edition" => {
            Some("489830".to_string())
        }
        "fallout4" | "fallout_4" | "fallout 4" => Some("377160".to_string()),
        "starfield" => Some("1716740".to_string()),
        "cyberpunk" | "cyberpunk2077" | "cyberpunk 2077" => Some("1091500".to_string()),
        "bg3" | "baldursgate3" | "baldur's gate 3" => Some("1086940".to_string()),
        "stardew" | "stardewvalley" | "stardew valley" => Some("413150".to_string()),
        _ => None,
    }
}

pub fn parse_vdf_key_values(vdf_text: &str, target_key: &str) -> Vec<String> {
    let mut results = Vec::new();
    for line in vdf_text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('"') {
            continue;
        }
        let mut tokens = Vec::new();
        let mut chars = trimmed.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '"' {
                let mut val = String::new();
                while let Some(nc) = chars.next() {
                    if nc == '\\' {
                        if let Some(esc) = chars.next() {
                            val.push(esc);
                        }
                    } else if nc == '"' {
                        break;
                    } else {
                        val.push(nc);
                    }
                }
                tokens.push(val);
                if tokens.len() >= 2 {
                    break;
                }
            }
        }
        if tokens.len() >= 2 && tokens[0].eq_ignore_ascii_case(target_key) {
            let val = tokens[1].trim().to_string();
            if !val.is_empty() && !results.contains(&val) {
                results.push(val);
            }
        }
    }
    results
}

pub fn discover_steam_libraries() -> Vec<PathBuf> {
    let mut candidate_roots: Vec<PathBuf> = Vec::new();
    let mut add_candidate = |p: PathBuf| {
        if !p.as_os_str().is_empty() && !candidate_roots.contains(&p) {
            candidate_roots.push(p);
        }
    };

    if let Some(home) = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
    {
        // Linux & SteamOS (Standard, Flatpak, Snap)
        add_candidate(home.join(".steam").join("steam"));
        add_candidate(home.join(".steam").join("root"));
        add_candidate(home.join(".local").join("share").join("Steam"));
        add_candidate(
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join(".local")
                .join("share")
                .join("Steam"),
        );
        add_candidate(
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join(".steam")
                .join("steam"),
        );
        add_candidate(
            home.join("snap")
                .join("steam")
                .join("common")
                .join(".local")
                .join("share")
                .join("Steam"),
        );
        // macOS
        add_candidate(
            home.join("Library")
                .join("Application Support")
                .join("Steam"),
        );
    }

    // Steam Deck SD Card & Linux External Mounts
    add_candidate(PathBuf::from("/run/media/mmcblk0p1"));
    add_candidate(PathBuf::from("/run/media/mmcblk0p1/SteamLibrary"));

    for mount_parent in ["/run/media/deck", "/run/media", "/media", "/mnt", "/Volumes"] {
        let mp = Path::new(mount_parent);
        if let Ok(entries) = std::fs::read_dir(mp) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    add_candidate(p.clone());
                    add_candidate(p.join("SteamLibrary"));
                    add_candidate(p.join("Steam"));
                    if let Ok(sub_entries) = std::fs::read_dir(&p) {
                        for sub in sub_entries.flatten() {
                            let sp = sub.path();
                            if sp.is_dir() {
                                add_candidate(sp.clone());
                                add_candidate(sp.join("SteamLibrary"));
                            }
                        }
                    }
                }
            }
        }
    }

    // Windows standard roots
    if cfg!(target_os = "windows") {
        add_candidate(PathBuf::from("C:\\Program Files (x86)\\Steam"));
        add_candidate(PathBuf::from("C:\\Program Files\\Steam"));
        for drive in ['D', 'E', 'F', 'G'] {
            add_candidate(PathBuf::from(format!("{}:\\SteamLibrary", drive)));
            add_candidate(PathBuf::from(format!("{}:\\Steam", drive)));
        }
    }

    let mut discovered_libraries: Vec<PathBuf> = Vec::new();
    let mut push_lib = |lib: PathBuf| {
        if (lib.join("steamapps").is_dir() || lib.is_dir()) && !discovered_libraries.contains(&lib) {
            discovered_libraries.push(lib);
        }
    };

    for root in &candidate_roots {
        if root.join("steamapps").is_dir() {
            push_lib(root.clone());
        }
        for vdf_rel in [
            Path::new("steamapps").join("libraryfolders.vdf"),
            Path::new("config").join("libraryfolders.vdf"),
        ] {
            let vdf_path = root.join(vdf_rel);
            if vdf_path.is_file() {
                if let Ok(vdf_text) = std::fs::read_to_string(&vdf_path) {
                    for lib_str in parse_vdf_key_values(&vdf_text, "path") {
                        let lib_path = PathBuf::from(&lib_str);
                        if lib_path.exists() {
                            push_lib(lib_path);
                        }
                    }
                }
            }
        }
    }

    discovered_libraries
}

pub fn extract_proton_user_dir_from_path(any_path: &str) -> Option<PathBuf> {
    let trimmed = any_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let norm = trimmed.replace('\\', "/");
    let lower = norm.to_lowercase();
    if let Some(idx) = lower.find("/drive_c/users/") {
        let prefix_and_users = &norm[..idx + "/drive_c/users/".len()];
        let rest = &norm[idx + "/drive_c/users/".len()..];
        let user_segment = rest.split('/').next().unwrap_or("steamuser");
        if !user_segment.is_empty() {
            let candidate = PathBuf::from(format!("{}{}", prefix_and_users, user_segment));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    if let Some(idx) = lower.find("/drive_c") {
        let drive_c_root = PathBuf::from(&norm[..idx + "/drive_c".len()]);
        let users_dir = drive_c_root.join("users");
        if users_dir.is_dir() {
            let steamuser = users_dir.join("steamuser");
            if steamuser.is_dir() {
                return Some(steamuser);
            }
            if let Ok(entries) = std::fs::read_dir(&users_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let fname = entry.file_name().to_string_lossy().to_lowercase();
                    if p.is_dir() && fname != "public" && !fname.starts_with('.') {
                        return Some(p);
                    }
                }
            }
        }
    }
    if let Some(idx) = lower.find("/pfx") {
        let pfx_root = PathBuf::from(&norm[..idx + 4]);
        let steamuser = pfx_root.join("drive_c").join("users").join("steamuser");
        if steamuser.exists() {
            return Some(steamuser);
        }
        let users_dir = pfx_root.join("drive_c").join("users");
        if users_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&users_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let fname = entry.file_name().to_string_lossy().to_lowercase();
                    if p.is_dir() && fname != "public" && !fname.starts_with('.') {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

fn find_pfx_user_dir(compatdata_app_dir: &Path) -> Option<PathBuf> {
    for users_dir in [
        compatdata_app_dir.join("pfx").join("drive_c").join("users"),
        compatdata_app_dir.join("drive_c").join("users"),
    ] {
        let steamuser = users_dir.join("steamuser");
        if steamuser.is_dir() {
            return Some(steamuser);
        }
        if users_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&users_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let fname = entry.file_name().to_string_lossy().to_lowercase();
                    if p.is_dir() && fname != "public" && !fname.starts_with('.') {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

pub fn resolve_steam_app_and_proton_prefix(
    schema: &Option<GameSchema>,
    live_path_hint: Option<&str>,
) -> Option<SteamProtonResolution> {
    let expected_app_id = default_steam_app_id(schema);
    let libraries = discover_steam_libraries();

    let mut expected_folder_names: Vec<String> = Vec::new();
    if let Some(s) = schema {
        if !s.display_name.trim().is_empty() {
            expected_folder_names.push(s.display_name.trim().to_string());
        }
        for raw_scan in s
            .paths
            .auto_scan_paths_linux
            .iter()
            .chain(s.paths.auto_scan_paths_windows.iter())
            .chain(s.paths.auto_scan_paths_mac.iter())
        {
            let norm = raw_scan.replace('\\', "/");
            if let Some(tail) = norm
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .map(|t| t.trim())
                .filter(|t| !t.is_empty() && !t.ends_with(".app"))
            {
                if !expected_folder_names
                    .iter()
                    .any(|existing| existing.eq_ignore_ascii_case(tail))
                {
                    expected_folder_names.push(tail.to_string());
                }
            }
        }
    }

    // Helper to locate compatdata/<app_id>/pfx/drive_c/users/steamuser across all Steam libraries
    let find_compatdata_across_libs = |app_id: &str, primary_lib: &Path| -> Option<PathBuf> {
        let primary_compat = primary_lib.join("steamapps").join("compatdata").join(app_id);
        if let Some(u) = find_pfx_user_dir(&primary_compat) {
            return Some(u);
        }
        for lib in &libraries {
            let compat = lib.join("steamapps").join("compatdata").join(app_id);
            if let Some(u) = find_pfx_user_dir(&compat) {
                return Some(u);
            }
        }
        None
    };

    // 1. Direct lookup by expected Steam AppID
    if let Some(ref app_id) = expected_app_id {
        let mut found_install: Option<(PathBuf, PathBuf)> = None;
        for lib in &libraries {
            let steamapps = lib.join("steamapps");
            let manifest = steamapps.join(format!("appmanifest_{}.acf", app_id));
            if manifest.is_file() {
                if let Ok(acf_text) = std::fs::read_to_string(&manifest) {
                    if let Some(install_folder) =
                        parse_vdf_key_values(&acf_text, "installdir").into_iter().next()
                    {
                        let common_dir = steamapps.join("common").join(&install_folder);
                        if common_dir.is_dir() {
                            found_install = Some((lib.clone(), common_dir));
                            break;
                        }
                    }
                }
            }
            for folder_name in &expected_folder_names {
                let common_dir = steamapps.join("common").join(folder_name);
                if common_dir.is_dir() {
                    found_install = Some((lib.clone(), common_dir));
                    break;
                }
            }
            if found_install.is_some() {
                break;
            }
        }

        let primary_lib = found_install
            .as_ref()
            .map(|(l, _)| l.clone())
            .or_else(|| libraries.first().cloned());

        if let Some(lib_root) = primary_lib {
            let pfx_user = find_compatdata_across_libs(app_id, &lib_root).or_else(|| {
                live_path_hint.and_then(extract_proton_user_dir_from_path)
            });
            let install_dir = found_install.map(|(_, dir)| dir);
            if install_dir.is_some() || pfx_user.is_some() {
                return Some(SteamProtonResolution {
                    app_id: app_id.clone(),
                    library_root: lib_root,
                    install_dir,
                    compatdata_pfx_user_dir: pfx_user,
                });
            }
        }
    }

    // 2. Dynamic scan of appmanifest_*.acf files for custom schemas or unlisted AppIDs
    for lib in &libraries {
        let steamapps = lib.join("steamapps");
        if let Ok(entries) = std::fs::read_dir(&steamapps) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.starts_with("appmanifest_") && fname.ends_with(".acf") {
                    if let Ok(acf_text) = std::fs::read_to_string(&path) {
                        let app_id = parse_vdf_key_values(&acf_text, "appid")
                            .into_iter()
                            .next()
                            .unwrap_or_default();
                        let name = parse_vdf_key_values(&acf_text, "name")
                            .into_iter()
                            .next()
                            .unwrap_or_default();
                        let installdir = parse_vdf_key_values(&acf_text, "installdir")
                            .into_iter()
                            .next()
                            .unwrap_or_default();

                        if app_id.is_empty() {
                            continue;
                        }

                        let matches_folder = expected_folder_names.iter().any(|ef| {
                            ef.eq_ignore_ascii_case(&installdir) || ef.eq_ignore_ascii_case(&name)
                        });
                        let common_dir = steamapps.join("common").join(&installdir);
                        let matches_hint = live_path_hint
                            .filter(|h| !h.trim().is_empty())
                            .map(|h| {
                                let nh = h.replace('\\', "/").to_lowercase();
                                let nc = common_dir.to_string_lossy().replace('\\', "/").to_lowercase();
                                !nc.is_empty() && nh.starts_with(&nc)
                            })
                            .unwrap_or(false);

                        if matches_folder || matches_hint {
                            let pfx_user = find_compatdata_across_libs(&app_id, lib).or_else(|| {
                                live_path_hint.and_then(extract_proton_user_dir_from_path)
                            });
                            return Some(SteamProtonResolution {
                                app_id,
                                library_root: lib.clone(),
                                install_dir: if common_dir.is_dir() {
                                    Some(common_dir)
                                } else {
                                    None
                                },
                                compatdata_pfx_user_dir: pfx_user,
                            });
                        }
                    }
                }
            }
        }
    }

    if let Some(hint) = live_path_hint {
        if let Some(pfx_user) = extract_proton_user_dir_from_path(hint) {
            return Some(SteamProtonResolution {
                app_id: expected_app_id.unwrap_or_default(),
                library_root: pfx_user.clone(),
                install_dir: None,
                compatdata_pfx_user_dir: Some(pfx_user),
            });
        }
    }

    // 3. Fallback scan of Heroic Games Launcher, Bottles, and Lutris prefixes on Linux/SteamOS
    if cfg!(target_os = "linux") && !expected_folder_names.is_empty() {
        if let Some(home) = std::env::var("HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(dirs::home_dir)
        {
            let non_steam_prefix_roots = [
                home.join("Games").join("Heroic").join("Prefixes").join("default"),
                home.join("Games").join("Heroic").join("Prefixes"),
                home.join(".var/app/com.heroicgameslauncher.hgl/Games/Heroic/Prefixes/default"),
                home.join(".local/share/bottles/bottles"),
                home.join(".var/app/com.usebottles.bottles/data/bottles/bottles"),
                home.join("Games"),
            ];
            let normalize_slug = |s: &str| -> String {
                s.chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .flat_map(|c| c.to_lowercase())
                    .collect()
            };
            let target_slugs: Vec<String> = expected_folder_names
                .iter()
                .map(|n| normalize_slug(n))
                .filter(|s| !s.is_empty())
                .collect();

            for root in &non_steam_prefix_roots {
                if !root.is_dir() {
                    continue;
                }
                if let Ok(entries) = std::fs::read_dir(root) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if !p.is_dir() {
                            continue;
                        }
                        let slug = normalize_slug(&entry.file_name().to_string_lossy());
                        if !slug.is_empty() && target_slugs.iter().any(|ts| ts == &slug || slug.contains(ts)) {
                            if let Some(pfx_user) = find_pfx_user_dir(&p) {
                                return Some(SteamProtonResolution {
                                    app_id: expected_app_id.unwrap_or_default(),
                                    library_root: root.clone(),
                                    install_dir: None,
                                    compatdata_pfx_user_dir: Some(pfx_user),
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

pub fn expand_schema_path_for_os(
    raw_path: &str,
    schema: &Option<GameSchema>,
    live_path_hint: Option<&str>,
) -> String {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if cfg!(target_os = "linux") {
        let norm = trimmed.replace('\\', "/");
        let upper = norm.to_uppercase();
        let needs_proton_user_mapping = upper.contains("%USERPROFILE%")
            || upper.contains("%LOCALAPPDATA%")
            || upper.contains("%APPDATA%")
            || norm.starts_with("~/Documents")
            || norm.starts_with("$HOME/Documents")
            || norm.starts_with("${HOME}/Documents")
            || norm.starts_with("Documents/");

        if needs_proton_user_mapping {
            let saved_hint = if live_path_hint.map_or(true, |h| h.trim().is_empty()) {
                let coords = crate::commands::state_ops::get_saved_coordinates();
                if !coords.mods_path.trim().is_empty() {
                    Some(coords.mods_path)
                } else if !coords.live_path.trim().is_empty() {
                    Some(coords.live_path)
                } else {
                    None
                }
            } else {
                live_path_hint.map(|s| s.to_string())
            };

            if let Some(pfx_user) = saved_hint
                .as_deref()
                .and_then(extract_proton_user_dir_from_path)
                .or_else(|| {
                    resolve_steam_app_and_proton_prefix(schema, saved_hint.as_deref())
                        .and_then(|res| res.compatdata_pfx_user_dir)
                })
            {
                let user_str = pfx_user
                    .to_string_lossy()
                    .replace('\\', "/")
                    .trim_end_matches('/')
                    .to_string();
                let appdata_local = format!("{}/AppData/Local", user_str);
                let appdata_roaming = format!("{}/AppData/Roaming", user_str);
                let docs_dir = format!("{}/Documents", user_str);

                let mut mapped = norm;
                for token in ["%LOCALAPPDATA%", "%localappdata%"] {
                    if mapped.contains(token) {
                        mapped = mapped.replace(token, &appdata_local);
                    }
                }
                for token in ["%APPDATA%", "%appdata%"] {
                    if mapped.contains(token) {
                        mapped = mapped.replace(token, &appdata_roaming);
                    }
                }
                for token in ["%USERPROFILE%", "%userprofile%"] {
                    if mapped.contains(token) {
                        mapped = mapped.replace(token, &user_str);
                    }
                }
                if let Some(rest) = mapped.strip_prefix("~/Documents") {
                    mapped = format!("{}{}", docs_dir, rest);
                } else if let Some(rest) = mapped.strip_prefix("$HOME/Documents") {
                    mapped = format!("{}{}", docs_dir, rest);
                } else if let Some(rest) = mapped.strip_prefix("${HOME}/Documents") {
                    mapped = format!("{}{}", docs_dir, rest);
                } else if let Some(rest) = mapped.strip_prefix("Documents/") {
                    mapped = format!("{}/{}", docs_dir, rest);
                }
                let normalized = crate::utils::normalize_existing_case_path(Path::new(&mapped));
                return normalized.to_string_lossy().to_string();
            }
        }
    }

    let expanded = crate::utils::expand_env_vars(trimmed);
    if cfg!(target_os = "linux") {
        let normalized = crate::utils::normalize_existing_case_path(Path::new(&expanded));
        return normalized.to_string_lossy().to_string();
    }
    expanded
}

pub fn select_os_default_mod_dir(paths: & crate::schema::SchemaPaths) -> &str {
    if cfg!(target_os = "linux") && !paths.default_mod_dir_linux.trim().is_empty() {
        paths.default_mod_dir_linux.trim()
    } else if cfg!(target_os = "macos") && !paths.default_mod_dir_mac.trim().is_empty() {
        paths.default_mod_dir_mac.trim()
    } else if !paths.default_mod_dir_windows.trim().is_empty() {
        paths.default_mod_dir_windows.trim()
    } else if !paths.default_mod_dir_linux.trim().is_empty() {
        paths.default_mod_dir_linux.trim()
    } else {
        paths.default_mod_dir_mac.trim()
    }
}

pub fn select_os_user_data_dir(paths: &crate::schema::SchemaPaths) -> Option<&str> {
    if cfg!(target_os = "linux") {
        paths
            .user_data_dir_linux
            .as_deref()
            .map(|d| d.trim())
            .filter(|d| !d.is_empty())
            .or_else(|| {
                paths
                    .user_data_dir_windows
                    .as_deref()
                    .map(|d| d.trim())
                    .filter(|d| !d.is_empty())
            })
            .or_else(|| {
                paths
                    .user_data_dir_mac
                    .as_deref()
                    .map(|d| d.trim())
                    .filter(|d| !d.is_empty())
            })
    } else if cfg!(target_os = "macos") {
        paths
            .user_data_dir_mac
            .as_deref()
            .map(|d| d.trim())
            .filter(|d| !d.is_empty())
            .or_else(|| {
                paths
                    .user_data_dir_windows
                    .as_deref()
                    .map(|d| d.trim())
                    .filter(|d| !d.is_empty())
            })
    } else {
        paths
            .user_data_dir_windows
            .as_deref()
            .map(|d| d.trim())
            .filter(|d| !d.is_empty())
    }
}

pub fn get_default_mods_folder(schema: &Option<GameSchema>) -> Option<PathBuf> {
    let raw_mod_dir = schema
        .as_ref()
        .map(|s| select_os_default_mod_dir(&s.paths))
        .filter(|d| !d.is_empty())?;

    let expanded = expand_schema_path_for_os(raw_mod_dir, schema, None);
    let mut path = PathBuf::from(&expanded);
    if path.is_relative() {
        if let Some(home) = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .ok()
            .map(PathBuf::from)
            .or_else(dirs::home_dir)
        {
            path = home.join(path);
        }
    }
    Some(path)
}

fn extract_plist_key_value(plist_xml: &str, key_name: &str) -> Option<String> {
    let key_tag = format!("<key>{}</key>", key_name);
    let idx = plist_xml.find(&key_tag)?;
    let rest = &plist_xml[idx + key_tag.len()..];
    let str_open = rest.find("<string>")?;
    let after_open = &rest[str_open + "<string>".len()..];
    let str_close = after_open.find("</string>")?;
    let val = after_open[..str_close].trim();
    if !val.is_empty() {
        Some(val.to_string())
    } else {
        None
    }
}

pub fn extract_pe_file_version(exe_path: &Path) -> Option<String> {
    if exe_path.is_file() {
        if let Ok(map) = pelite::FileMap::open(exe_path) {
            if let Ok(pe) = pelite::PeFile::from_bytes(map.as_ref()) {
                if let Ok(resources) = pe.resources() {
                    if let Ok(version_info) = resources.version_info() {
                        if let Some(fixed) = version_info.fixed() {
                            let v = fixed.dwFileVersion;
                            let version_str =
                                format!("{}.{}.{}.{}", v.Major, v.Minor, v.Patch, v.Build);
                            if version_str != "0.0.0.0" {
                                return Some(version_str);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut plist_candidates = Vec::new();
    for ancestor in exe_path.ancestors() {
        if ancestor
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("app"))
        {
            plist_candidates.push(ancestor.join("Contents").join("Info.plist"));
        }
    }
    plist_candidates.push(exe_path.join("Contents").join("Info.plist"));
    plist_candidates.push(exe_path.join("Info.plist"));

    for plist_path in plist_candidates {
        if plist_path.is_file() {
            if let Ok(xml) = std::fs::read_to_string(&plist_path) {
                if let Some(v) = extract_plist_key_value(&xml, "CFBundleShortVersionString")
                    .or_else(|| extract_plist_key_value(&xml, "CFBundleVersion"))
                {
                    let cleaned: String = v
                        .chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if !cleaned.is_empty() {
                        return Some(cleaned);
                    }
                    return Some(v);
                }
            }
        }
    }
    None
}

pub fn resolve_game_engine_root(live_path: &str, schema: &Option<GameSchema>) -> PathBuf {
    let mut base = PathBuf::from(live_path.trim());
    if base.is_file()
        || base
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("app"))
    {
        base.pop();
    }

    if let Some(s) = schema {
        if let Some(ref sub) = s.paths.executable_subdir {
            let sub_parts: Vec<&str> = sub
                .split(|c| c == '/' || c == '\\')
                .map(|p| p.trim())
                .filter(|p| !p.is_empty())
                .collect();
            if !sub_parts.is_empty() {
                let mut temp = base.clone();
                let mut matched_all = true;
                for part in sub_parts.iter().rev() {
                    let ends_with_part = temp
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map_or(false, |n| n.eq_ignore_ascii_case(part));
                    if ends_with_part {
                        temp.pop();
                    } else {
                        matched_all = false;
                        break;
                    }
                }
                if matched_all {
                    return temp;
                }
            }
        }
    }

    if is_sims4_schema(schema) {
        let ends_with_bin = base
            .file_name()
            .and_then(|n| n.to_str())
            .map_or(false, |n| {
                n.eq_ignore_ascii_case("bin") || n.eq_ignore_ascii_case("bin_le")
            });
        if ends_with_bin {
            base.pop();
            let ends_with_game = base
                .file_name()
                .and_then(|n| n.to_str())
                .map_or(false, |n| n.eq_ignore_ascii_case("game"));
            if ends_with_game {
                base.pop();
            }
        }
    }

    base
}

pub fn resolve_executable_path(
    live_path: &str,
    schema: &Option<GameSchema>,
) -> Option<PathBuf> {
    if live_path.trim().is_empty() {
        return None;
    }
    let direct = PathBuf::from(live_path.trim());
    let is_app_bundle = |p: &Path| -> bool {
        p.is_dir()
            && p.extension()
                .and_then(|e| e.to_str())
                .map_or(false, |e| e.eq_ignore_ascii_case("app"))
    };
    if direct.exists() && (direct.is_file() || is_app_bundle(&direct)) {
        return Some(direct);
    }

    let engine_root = resolve_game_engine_root(live_path, schema);
    let exe_subdir = schema
        .as_ref()
        .and_then(|s| s.paths.executable_subdir.as_ref())
        .map(|s| s.trim().trim_matches(|c| c == '/' || c == '\\').to_string())
        .filter(|s| !s.is_empty());

    let exe_names = get_executable_names(schema);
    for exe_name in &exe_names {
        let mut candidate_dirs = Vec::new();
        if let Some(ref sub) = exe_subdir {
            candidate_dirs.push(engine_root.join(sub));
        }
        candidate_dirs.push(engine_root.clone());
        if direct.is_dir() && !candidate_dirs.contains(&direct) {
            candidate_dirs.push(direct.clone());
        }
        candidate_dirs.push(engine_root.join("Game").join("Bin"));
        candidate_dirs.push(engine_root.join("bin").join("x64"));
        candidate_dirs.push(engine_root.join("bin"));
        candidate_dirs.push(engine_root.join("Contents").join("MacOS"));

        for dir in candidate_dirs {
            let candidate = dir.join(exe_name);
            if candidate.exists() && (candidate.is_file() || is_app_bundle(&candidate)) {
                return Some(candidate);
            }
        }
    }

    let mut scan_dirs = Vec::new();
    if let Some(ref sub) = exe_subdir {
        let sub_dir = engine_root.join(sub);
        if sub_dir.exists() && sub_dir.is_dir() {
            scan_dirs.push(sub_dir);
        }
    }
    if is_sims4_schema(schema) {
        let sims_bin = engine_root.join("Game").join("Bin");
        if sims_bin.exists() && sims_bin.is_dir() && !scan_dirs.contains(&sims_bin) {
            scan_dirs.push(sims_bin);
        }
    }
    if engine_root.exists() && engine_root.is_dir() && !scan_dirs.contains(&engine_root) {
        scan_dirs.push(engine_root);
    }

    let mut largest_exe: Option<PathBuf> = None;
    let mut max_size: u64 = 0;

    for dir in scan_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if is_app_bundle(&path) {
                    return Some(path);
                }
                if path.is_file()
                    && path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |s| s.eq_ignore_ascii_case("exe"))
                {
                    if let Some(file_name) = path.file_stem().and_then(|n| n.to_str()) {
                        let name_lower = file_name.to_lowercase();
                        if name_lower.contains("redist")
                            || name_lower.contains("crashhandler")
                            || name_lower.contains("crashreporter")
                            || name_lower.contains("anticheat")
                            || name_lower.contains("unins")
                            || name_lower.contains("setup")
                            || name_lower.contains("installer")
                            || name_lower.contains("dxsetup")
                            || name_lower.contains("vcredist")
                        {
                            continue;
                        }
                    }
                    if let Ok(metadata) = path.metadata() {
                        if metadata.len() > max_size {
                            max_size = metadata.len();
                            largest_exe = Some(path);
                        }
                    }
                }
            }
        }
        if largest_exe.is_some() {
            break;
        }
    }

    largest_exe
}

pub fn resolve_user_data_root(docs_or_mods_path: &str, schema: &Option<GameSchema>) -> PathBuf {
    if let Some(s) = schema {
        if let Some(raw_dir) = select_os_user_data_dir(&s.paths) {
            let expanded = expand_schema_path_for_os(raw_dir, schema, Some(docs_or_mods_path));
            let mut user_data_path = PathBuf::from(&expanded);
            if user_data_path.is_relative() {
                if let Some(profile) = std::env::var("USERPROFILE")
                    .or_else(|_| std::env::var("HOME"))
                    .ok()
                    .map(PathBuf::from)
                    .or_else(dirs::home_dir)
                {
                    user_data_path = profile.join(&user_data_path);
                }
            }

            let saved = crate::commands::state_ops::get_saved_coordinates();
            let engine_root = if !saved.live_path.trim().is_empty() {
                resolve_game_engine_root(&saved.live_path, schema)
            } else {
                PathBuf::new()
            };
            let norm_input = docs_or_mods_path.trim().replace('\\', "/").to_lowercase();
            let norm_engine = engine_root.to_string_lossy().replace('\\', "/").to_lowercase();
            let input_is_in_game_dir = (!norm_engine.is_empty()
                && !norm_input.is_empty()
                && norm_input.starts_with(&norm_engine))
                || norm_input.contains("steamapps/common")
                || norm_input.contains("program files")
                || norm_input.contains("/applications/")
                || norm_input.contains("epic games")
                || norm_input.contains("gog galaxy");

            if user_data_path.exists() || docs_or_mods_path.trim().is_empty() || input_is_in_game_dir
            {
                return user_data_path;
            }
        }
    }

    PathBuf::from(crate::utils::get_docs_base_from_mods_path(docs_or_mods_path))
}

pub fn expand_env_vars(path: &str) -> String {
    crate::utils::expand_env_vars(path)
}



