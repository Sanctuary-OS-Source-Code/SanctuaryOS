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
    if let Some(s) = schema {
        let strategy = get_load_order_strategy(schema);
        let manifest_file = s
            .load_order
            .as_ref()
            .and_then(|lo| lo.manifest_file.clone())
            .filter(|f| !f.is_empty())
            .unwrap_or_else(|| s.paths.manifest_file.clone());

        if manifest_file.is_empty() {
            return;
        }

        if strategy == "folder_priority" {
            if let Some(content) = &s.manifest_content {
                let mut full_content = content.clone();
                if let Some(lo) = &s.load_order {
                    if let Some(tiers) = &lo.priority_tiers {
                        for tier in tiers {
                            if !tier.folder.is_empty() && !full_content.contains(&format!("PackedFile {}/*.package", tier.folder)) {
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
    if let Some(s) = schema {
        if let Some(label) = s.extensions.labels.get(&ext.to_lowercase()) {
            return label.clone();
        }
    }
    "UNKNOWN".to_string()
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

pub fn get_magic_bytes(schema: &Option<GameSchema>, label: &str) -> Option<String> {
    if let Some(s) = schema {
        if let Some(magic_map) = &s.magic_bytes {
            if let Some(magic) = magic_map.get(label) {
                return Some(magic.clone());
            }
        }
    }

    if label == "PACKAGE" {
        return Some("DBPF".to_string());
    }
    None
}

pub fn get_supported_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        s.extensions
            .supported
            .iter()
            .map(|ext| ext.trim_start_matches('.').to_lowercase())
            .collect()
    } else {
        vec![
            "package".to_string(),
            "ts4script".to_string(),
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
    } else {
        ext_list.extend(vec![
            "package".to_string(),
            "ts4script".to_string(),
            "cfg".to_string(),
            "ini".to_string(),
            "json".to_string(),
            "txt".to_string(),
            "xml".to_string(),
            "log".to_string(),
        ]);
    }
    ext_list
}

pub fn is_cache_file(schema: &Option<GameSchema>, file_name: &str) -> bool {
    if let Some(s) = schema {
        if let Some(cache_files) = &s.extensions.cache_files {
            return cache_files
                .iter()
                .any(|c| c.eq_ignore_ascii_case(file_name));
        }
    }

    // Fallback for unmodified schemas
    let is_sims4 = schema.as_ref().map_or(true, |s| s.game_id == "the-sims-4");
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

    // Fallback for unmodified schemas
    let is_sims4 = schema.as_ref().map_or(true, |s| s.game_id == "the-sims-4");
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

pub fn get_executable_names(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        s.executable_names.clone()
    } else {
        vec![
            "TS4_x64.exe".to_string(),
            "TS4.exe".to_string(),
            "TS4_DX9_x64.exe".to_string(),
        ]
    }
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



