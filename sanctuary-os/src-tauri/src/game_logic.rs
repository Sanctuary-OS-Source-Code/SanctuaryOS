use crate::schema::GameSchema;
use std::path::Path;

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
    "folder_priority".to_string()
}

pub fn get_priority_folders(schema: &Option<GameSchema>) -> Vec<String> {
    let mut folders = vec![
        "".to_string(),
        "!Sanctuary".to_string(),
        "!Sanctuary2".to_string(),
        "!Sanctuary3".to_string(),
        "Sanctuary".to_string(),
        "Sanctuary2".to_string(),
        "Sanctuary3".to_string(),
    ];
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
        let manifest_file = s
            .load_order
            .as_ref()
            .and_then(|lo| lo.manifest_file.clone())
            .filter(|f| !f.is_empty())
            .or_else(|| {
                if !s.paths.manifest_file.is_empty() {
                    Some(s.paths.manifest_file.clone())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "Resource.cfg".to_string());

        if manifest_file.is_empty() {
            return;
        }

        if strategy == "folder_priority" {
            let base_content = s
                .manifest_content
                .as_ref()
                .filter(|c| !c.trim().is_empty())
                .map(|c| c.clone())
                .or_else(|| {
                    if manifest_file.eq_ignore_ascii_case("resource.cfg") {
                        Some(default_sims4_manifest.to_string())
                    } else {
                        None
                    }
                });

            if let Some(content) = base_content {
                let mut full_content = content;
                if let Some(lo) = &s.load_order {
                    if let Some(tiers) = &lo.priority_tiers {
                        for tier in tiers {
                            if !tier.folder.is_empty()
                                && !full_content
                                    .contains(&format!("PackedFile {}/*.package", tier.folder))
                            {
                                full_content.push_str(&format!(
                                    "\n\nPriority {}\nPackedFile {}/*.package\nPackedFile {}/*/*.package\nPackedFile {}/*/*/*.package",
                                    tier.priority, tier.folder, tier.folder, tier.folder
                                ));
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
            if !routes.is_empty() {
                return routes.clone();
            }
        }
    }
    vec![crate::schema::SchemaInstallRoute {
        id: "world_areas".to_string(),
        label: Some("World Area Files (.world)".to_string()),
        extensions: vec![".world".to_string()],
        folder_match: Some("Worlds".to_string()),
        target_root: "live_path".to_string(),
        target_subdir: "Data/Shared/Worlds/Areas".to_string(),
        preserve_vanilla: Some(true),
    }]
}

pub fn is_dlc_folder(schema: &Option<GameSchema>, folder_name: &str) -> bool {
    let name_up = folder_name.to_uppercase();
    if let Some(s) = schema {
        if let Some(prefixes) = &s.dlc_folder_prefixes {
            return prefixes
                .iter()
                .any(|p| name_up.starts_with(&p.to_uppercase()));
        }
    }

    // Fallback
    name_up.starts_with("EP")
        || name_up.starts_with("GP")
        || name_up.starts_with("SP")
        || name_up.starts_with("FP")
}

pub fn get_supported_extensions(schema: &Option<GameSchema>) -> Vec<String> {
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
        } else {
            vec![
                "package".to_string(),
                "ts4script".to_string(),
                "world".to_string(),
                "zip".to_string(),
                "rar".to_string(),
                "cfg".to_string(),
                "ini".to_string(),
                "json".to_string(),
                "txt".to_string(),
                "xml".to_string(),
                "log".to_string(),
            ]
        }
    } else {
        vec![
            "package".to_string(),
            "ts4script".to_string(),
            "world".to_string(),
            "zip".to_string(),
            "rar".to_string(),
            "cfg".to_string(),
            "ini".to_string(),
            "json".to_string(),
            "txt".to_string(),
            "xml".to_string(),
            "log".to_string(),
        ]
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
            ext_list.extend(
                visible
                    .iter()
                    .map(|ext| ext.trim_start_matches('.').to_lowercase()),
            );
        }
        if let Some(ignore) = &s.extensions.ignore_unidentified {
            ext_list.extend(
                ignore
                    .iter()
                    .map(|ext| ext.trim_start_matches('.').to_lowercase()),
            );
        }
    }
    if ext_list.is_empty() {
        ext_list.extend(vec![
            "package".to_string(),
            "ts4script".to_string(),
            "world".to_string(),
            "cfg".to_string(),
            "ini".to_string(),
            "json".to_string(),
            "txt".to_string(),
            "xml".to_string(),
            "log".to_string(),
        ]);
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

    // Fallback for unmodified schemas
    let is_sims4 = schema.as_ref().map_or(true, |s| {
        s.game_id == "the-sims-4"
            || s.game_id == "sims4"
            || s.game_id == "default_schema"
            || s.game_id.is_empty()
    });
    if is_sims4 {
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

    // Fallback for unmodified schemas
    let is_sims4 = schema.as_ref().map_or(true, |s| {
        s.game_id == "the-sims-4"
            || s.game_id == "sims4"
            || s.game_id == "default_schema"
            || s.game_id.is_empty()
    });
    if is_sims4 {
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
            return s.executable_names.clone();
        }
    }
    vec![
        "TS4_x64.exe".to_string(),
        "TS4.exe".to_string(),
        "TS4_DX9_x64.exe".to_string(),
    ]
}



pub fn expand_env_vars(path: &str) -> String {
    let mut result = String::new();
    let mut chars = path.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut found_end = false;
            while let Some(&next_c) = chars.peek() {
                if next_c == '%' {
                    chars.next(); // consume the closing '%'
                    found_end = true;
                    break;
                }
                var_name.push(chars.next().unwrap());
            }
            if found_end {
                if let Ok(val) = std::env::var(&var_name) {
                    result.push_str(&val);
                } else {
                    // if env var not found, keep it as is
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    result
}



