use crate::schema::GameSchema;
use std::path::Path;

pub fn generate_manifest_if_needed(schema: &Option<GameSchema>, mods_dir: &Path) {
    if let Some(s) = schema {
        if let Some(content) = &s.manifest_content {
            let _ = std::fs::write(mods_dir.join(&s.paths.manifest_file), content);
        }
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

pub fn is_explicitly_local_heuristic(schema: &Option<GameSchema>, file_name: &str) -> bool {
    let name_lower = file_name.to_lowercase();
    if let Some(s) = schema {
        if let Some(heuristics) = &s.local_mod_heuristics {
            return heuristics.iter().any(|h| name_lower.contains(&h.to_lowercase()));
        }
    }
    
    // Fallback for Sims 4
    name_lower.contains("customchallenge") || name_lower.contains("simmattic") || name_lower.contains("simmatic")
}

pub fn is_dlc_folder(schema: &Option<GameSchema>, folder_name: &str) -> bool {
    let name_up = folder_name.to_uppercase();
    if let Some(s) = schema {
        if let Some(prefixes) = &s.dlc_folder_prefixes {
            return prefixes.iter().any(|p| name_up.starts_with(&p.to_uppercase()));
        }
    }
    
    // Fallback
    name_up.starts_with("EP") || name_up.starts_with("GP") || name_up.starts_with("SP") || name_up.starts_with("FP")
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
        s.extensions.supported.iter().map(|ext| ext.trim_start_matches('.').to_lowercase()).collect()
    } else {
        vec!["package".to_string(), "ts4script".to_string(), "zip".to_string(), "rar".to_string(), "cfg".to_string(), "ini".to_string(), "json".to_string(), "txt".to_string(), "xml".to_string(), "log".to_string()]
    }
}

pub fn is_cache_file(schema: &Option<GameSchema>, file_name: &str) -> bool {
    if let Some(s) = schema {
        if let Some(cache_files) = &s.extensions.cache_files {
            return cache_files.iter().any(|c| c.eq_ignore_ascii_case(file_name));
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
        vec!["TS4_x64.exe".to_string(), "TS4.exe".to_string(), "TS4_DX9_x64.exe".to_string()]
    }
}

pub fn get_fatal_conflict_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        if let Some(radar) = &s.conflict_radar {
            if let Some(fatal) = &radar.tier_4_fatal {
                return fatal.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect();
            }
        }
    }
    vec!["pyc".to_string(), "pyo".to_string()]
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
use crate::dbpf::DbpfResource;

pub fn is_explicitly_local_dbpf(schema: &Option<GameSchema>, resources: &[DbpfResource]) -> bool {
    if let Some(s) = schema {
        if let Some(tax) = &s.taxonomy {
            let mut casp_count = 0;
            let mut objd_count = 0;

            let cas_part_type = tax.cas_part_type.as_deref().and_then(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).unwrap_or(0);
            let obj_def_type = tax.obj_def_type.as_deref().and_then(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).unwrap_or(0);
            
            let explicit_types: Vec<u32> = tax.explicit_local_types.as_ref().map(|v| v.iter().filter_map(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).collect()).unwrap_or_default();

            for res in resources {
                if explicit_types.contains(&res.t) {
                    return true;
                }
                if res.t == cas_part_type && cas_part_type != 0 { casp_count += 1; }
                if res.t == obj_def_type && obj_def_type != 0 { objd_count += 1; }
            }

            if casp_count > 50 || objd_count > 50 {
                return true;
            }
        }
    }
    false
}

pub fn get_severity_rank(schema: &Option<GameSchema>, t: u32) -> (bool, u8) {
    if let Some(s) = schema {
        if let Some(tax) = &s.taxonomy {
            let harmless_types: Vec<u32> = tax.harmless_types.as_ref().map(|v| v.iter().filter_map(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).collect()).unwrap_or_default();
            let critical_types: Vec<u32> = tax.critical_types.as_ref().map(|v| v.iter().filter_map(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).collect()).unwrap_or_default();
            let warning_types: Vec<u32> = tax.warning_types.as_ref().map(|v| v.iter().filter_map(|h| u32::from_str_radix(h.trim_start_matches("0x"), 16).ok()).collect()).unwrap_or_default();

            if harmless_types.contains(&t) {
                return (true, 1);
            }
            if critical_types.contains(&t) {
                return (false, 4);
            }
            if warning_types.contains(&t) {
                return (false, 3);
            }
        }
    }
    (false, 1)
}
