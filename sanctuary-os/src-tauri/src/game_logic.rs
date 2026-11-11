use crate::schema::GameSchema;
use std::path::{Path, PathBuf};

pub fn get_load_order_strategy(schema: &Option<GameSchema>) -> String {
    if let Some(s) = schema {
        if let Some(lo) = &s.load_order {
            if let Some(strat) = &lo.strategy {
                let trimmed = strat.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_lowercase();
                }
            }
        }
    }
    "none".to_string()
}

pub fn get_priority_folders(schema: &Option<GameSchema>) -> Vec<String> {
    let mut folders = vec!["".to_string()];
    if let Some(s) = schema {
        if let Some(lo) = &s.load_order {
            if let Some(tiers) = &lo.priority_tiers {
                for tier in tiers {
                    let f = tier.folder.trim();
                    if !f.is_empty() {
                        if !folders.iter().any(|existing| existing == f) {
                            folders.push(f.to_string());
                        }
                        let bang = format!("!{}", f.trim_start_matches('!'));
                        if !folders.iter().any(|existing| existing == &bang) {
                            folders.push(bang);
                        }
                    }
                }
            }
        }
    }
    folders
}

pub fn resolve_manifest_filename(schema: &Option<GameSchema>) -> Option<String> {
    let s = schema.as_ref()?;
    let candidate = s
        .load_order
        .as_ref()
        .and_then(|lo| lo.manifest_file.as_deref())
        .map(|f| f.trim())
        .filter(|f| !f.is_empty() && !f.eq_ignore_ascii_case("none"))
        .or_else(|| {
            let pf = s.paths.manifest_file.trim();
            if !pf.is_empty() && !pf.eq_ignore_ascii_case("none") {
                Some(pf)
            } else {
                None
            }
        })?;
    Some(candidate.to_string())
}

pub fn resolve_manifest_leaf_lower(schema: &Option<GameSchema>) -> String {
    resolve_manifest_filename(schema)
        .and_then(|m| {
            m.rsplit(&['/', '\\'][..])
                .next()
                .map(|s| s.trim().to_lowercase())
        })
        .unwrap_or_default()
}

pub fn generate_manifest_content(
    schema: &Option<GameSchema>,
    ordered_files: &[String],
) -> Option<(String, String)> {
    let s = schema.as_ref()?;
    let strategy = get_load_order_strategy(schema);
    if strategy == "none" {
        return None;
    }

    let manifest_file = resolve_manifest_filename(schema)?;
    let lo = s.load_order.as_ref();

    let doc_header = lo
        .and_then(|l| l.document_header.as_deref())
        .filter(|h| !h.trim().is_empty())
        .or_else(|| {
            s.manifest_content
                .as_deref()
                .filter(|c| !c.trim().is_empty())
        });
    let doc_footer = lo
        .and_then(|l| l.document_footer.as_deref())
        .filter(|f| !f.trim().is_empty());
    let line_tpl = lo
        .and_then(|l| l.line_template.as_deref())
        .map(|t| t.trim())
        .filter(|t| !t.is_empty());

    if strategy == "folder_priority" {
        let mut parts: Vec<String> = Vec::new();
        if let Some(hdr) = doc_header {
            parts.push(hdr.trim_end().to_string());
        }

        if let (Some(tpl), Some(tiers)) = (line_tpl, lo.and_then(|l| l.priority_tiers.as_ref())) {
            let archive_exts = get_archive_extensions(schema);
            let exts_to_pack: Vec<String> = s
                .extensions
                .supported
                .iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .filter(|e| !e.is_empty() && !archive_exts.contains(e))
                .collect();

            for tier in tiers {
                let folder = tier.folder.trim();
                if folder.is_empty() {
                    continue;
                }
                if tpl.contains("{ext}") && !exts_to_pack.is_empty() {
                    for ext in &exts_to_pack {
                        let rendered = tpl
                            .replace("{folder}", folder)
                            .replace("{priority}", &tier.priority.to_string())
                            .replace("{ext}", ext);
                        if !parts.iter().any(|p| p.contains(&rendered)) {
                            parts.push(rendered);
                        }
                    }
                } else if tpl.contains("{folder}") || tpl.contains("{priority}") {
                    let rendered = tpl
                        .replace("{folder}", folder)
                        .replace("{priority}", &tier.priority.to_string());
                    if !parts.iter().any(|p| p.contains(&rendered)) {
                        parts.push(rendered);
                    }
                }
            }
        }

        if let Some(ftr) = doc_footer {
            parts.push(ftr.trim_start_matches('\n').to_string());
        }

        if parts.is_empty() {
            return None;
        }
        let mut combined = parts.join("\n");
        if !combined.ends_with('\n') {
            combined.push('\n');
        }
        return Some((manifest_file, combined));
    }

    if strategy == "manifest_list" {
        let tpl = line_tpl.unwrap_or("{file}");
        let mut parts: Vec<String> = Vec::new();
        if let Some(hdr) = doc_header {
            parts.push(hdr.trim_end_matches('\n').to_string());
        }
        for (idx, file) in ordered_files.iter().enumerate() {
            let p = Path::new(file);
            let fname = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(file.as_str());
            let fstem = p.file_stem().and_then(|n| n.to_str()).unwrap_or(fname);
            let line = tpl
                .replace("{file}", file)
                .replace("{name}", fname)
                .replace("{stem}", fstem)
                .replace("{index}", &(idx + 1).to_string())
                .replace("{index0}", &idx.to_string());
            parts.push(line);
        }
        if let Some(ftr) = doc_footer {
            parts.push(ftr.trim_start_matches('\n').to_string());
        }
        let mut combined = parts.join("\n");
        if !combined.ends_with('\n') {
            combined.push('\n');
        }
        return Some((manifest_file, combined));
    }

    if let Some(content) = s.manifest_content.as_ref().filter(|c| !c.trim().is_empty()) {
        return Some((manifest_file, content.clone()));
    }

    None
}

pub fn generate_manifest_if_needed(schema: &Option<GameSchema>, mods_dir: &Path) {
    if get_load_order_strategy(schema) == "manifest_list" {
        return;
    }
    if let Some((manifest_file, content)) = generate_manifest_content(schema, &[]) {
        let target = mods_dir.join(manifest_file);
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = crate::utils::atomic_write_bytes(&target, content.as_bytes());
    }
}

pub fn write_load_order_manifest(
    schema: &Option<GameSchema>,
    mods_dir: &Path,
    ordered_files: &[String],
) {
    if get_load_order_strategy(schema) != "manifest_list" {
        return;
    }
    if let Some((manifest_file, content)) = generate_manifest_content(schema, ordered_files) {
        let target = mods_dir.join(manifest_file);
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = crate::utils::atomic_write_bytes(&target, content.as_bytes());
    }
}

pub fn is_script_extension(schema: &Option<GameSchema>, ext: &str) -> bool {
    let ext_clean = ext.trim_start_matches('.').to_lowercase();
    if ext_clean.is_empty() {
        return false;
    }
    if let Some(s) = schema {
        if let Some(scripts) = &s.extensions.script_extensions {
            if !scripts.is_empty() {
                return scripts
                    .iter()
                    .any(|se| se.trim_start_matches('.').eq_ignore_ascii_case(&ext_clean));
            }
        }
        if let Some(label) = s
            .extensions
            .labels
            .get(&ext_clean)
            .or_else(|| s.extensions.labels.get(&format!(".{}", ext_clean)))
        {
            let up = label.to_uppercase();
            if up.contains("SCRIPT") || up.contains("PLUGIN") {
                return true;
            }
        }
    }
    false
}

pub fn get_file_label(schema: &Option<GameSchema>, ext: &str) -> String {
    let ext_clean = ext.trim_start_matches('.').to_lowercase();
    if ext_clean.is_empty() {
        return "UNKNOWN".to_string();
    }
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
    if is_script_extension(schema, &ext_clean) {
        return "SCRIPT".to_string();
    }
    if get_supported_extensions(schema).contains(&ext_clean) {
        return "MOD".to_string();
    }
    "UNKNOWN".to_string()
}

pub fn get_install_routes(schema: &Option<GameSchema>) -> Vec<crate::schema::SchemaInstallRoute> {
    schema
        .as_ref()
        .and_then(|s| s.install_routes.clone())
        .unwrap_or_default()
}

pub fn is_dlc_folder(schema: &Option<GameSchema>, folder_name: &str) -> bool {
    let Some(s) = schema else {
        return false;
    };
    let name_up = folder_name.trim().to_uppercase();
    if name_up.is_empty() {
        return false;
    }
    if let Some(catalog) = &s.dlc_catalog {
        if catalog.keys().any(|k| k.eq_ignore_ascii_case(&name_up)) {
            return true;
        }
    }
    if let Some(prefixes) = &s.dlc_folder_prefixes {
        if !prefixes.is_empty() {
            return prefixes
                .iter()
                .map(|p| p.trim().to_uppercase())
                .filter(|p| !p.is_empty())
                .any(|p| name_up.starts_with(&p));
        }
    }
    false
}

pub fn get_archive_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    if let Some(s) = schema {
        if let Some(containers) = &s.extensions.archive_containers {
            let cleaned: Vec<String> = containers
                .iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .filter(|e| !e.is_empty())
                .collect();
            if !cleaned.is_empty() {
                return cleaned;
            }
        }
    }
    vec!["zip".to_string()]
}

pub fn get_config_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    let Some(s) = schema else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(cfg_exts) = &s.extensions.config_extensions {
        for ext in cfg_exts {
            let clean = ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !out.contains(&clean) {
                out.push(clean);
            }
        }
    }
    if let Some(edit_exts) = &s.extensions.editable_config_formats {
        for ext in edit_exts {
            let clean = ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !out.contains(&clean) {
                out.push(clean);
            }
        }
    }
    out
}

pub fn get_editable_config_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    let configured = get_config_extensions(schema);
    if !configured.is_empty() {
        return configured;
    }
    if schema.is_none() {
        return Vec::new();
    }
    vec![
        "json".to_string(),
        "ini".to_string(),
        "cfg".to_string(),
        "toml".to_string(),
        "yaml".to_string(),
        "yml".to_string(),
        "xml".to_string(),
        "txt".to_string(),
    ]
}

pub fn get_supported_extensions(schema: &Option<GameSchema>) -> Vec<String> {
    let Some(s) = schema else {
        return Vec::new();
    };
    let mut exts: Vec<String> = s
        .extensions
        .supported
        .iter()
        .map(|ext| ext.trim_start_matches('.').to_lowercase())
        .filter(|ext| !ext.is_empty())
        .collect();

    if let Some(scripts) = &s.extensions.script_extensions {
        for sc in scripts {
            let clean = sc.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !exts.contains(&clean) {
                exts.push(clean);
            }
        }
    }

    for cfg in get_config_extensions(schema) {
        if !exts.contains(&cfg) {
            exts.push(cfg);
        }
    }

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
    let Some(s) = schema else {
        return Vec::new();
    };
    let mut ext_list = Vec::new();
    if let Some(visible) = &s.extensions.vault_visible {
        for ext in visible {
            let clean = ext.trim_start_matches('.').to_lowercase();
            if !clean.is_empty() && !ext_list.contains(&clean) {
                ext_list.push(clean);
            }
        }
    }
    for ext in get_supported_extensions(schema) {
        if !ext_list.contains(&ext) {
            ext_list.push(ext);
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
    ext_list
}

pub fn should_preserve_auxiliary_assets(schema: &Option<GameSchema>) -> bool {
    schema
        .as_ref()
        .and_then(|s| s.extensions.preserve_auxiliary_assets)
        .unwrap_or(true)
}

pub fn strip_relative_root_anchors(rel_path: &Path, schema: &Option<GameSchema>) -> PathBuf {
    let mut components: Vec<String> = rel_path
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(s) => Some(s.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();
    if components.len() <= 1 {
        return rel_path.to_path_buf();
    }

    if let Some(s) = schema {
        if let Some(anchors) = &s.extensions.relative_root_anchors {
            let clean_anchors: Vec<String> = anchors
                .iter()
                .map(|a| a.trim().trim_matches(|c| c == '/' || c == '\\').to_lowercase())
                .filter(|a| !a.is_empty())
                .collect();
            if !clean_anchors.is_empty() {
                for idx in 0..components.len().saturating_sub(1) {
                    let seg_low = components[idx].to_lowercase();
                    if clean_anchors.iter().any(|a| a == &seg_low) {
                        // Strip redundant wrapper folders above the anchor (and if the anchor itself is the Mods root, strip the anchor segment too)
                        let mod_dir_tail = select_os_default_mod_dir(&s.paths)
                            .replace('\\', "/")
                            .trim_end_matches('/')
                            .rsplit('/')
                            .next()
                            .unwrap_or("")
                            .to_lowercase();
                        let start_idx = if !mod_dir_tail.is_empty() && seg_low == mod_dir_tail {
                            idx + 1
                        } else {
                            idx
                        };
                        if start_idx < components.len() {
                            components = components.split_off(start_idx);
                        }
                        break;
                    }
                }
            }
        }
    }

    let mut out = PathBuf::new();
    for part in components {
        out.push(part);
    }
    out
}

pub fn is_cache_file(schema: &Option<GameSchema>, file_or_rel_path: &str) -> bool {
    let Some(s) = schema else {
        return false;
    };
    let Some(cache_files) = &s.extensions.cache_files else {
        return false;
    };
    if cache_files.is_empty() {
        return false;
    }
    let norm_input = file_or_rel_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_lowercase();
    let base_name = norm_input.rsplit('/').next().unwrap_or(&norm_input);

    cache_files.iter().any(|pattern| {
        let pat = pattern
            .trim()
            .replace('\\', "/")
            .trim_start_matches('/')
            .to_lowercase();
        if pat.is_empty() {
            return false;
        }
        if let Some(prefix) = pat.strip_suffix("/*") {
            norm_input == prefix || norm_input.starts_with(&format!("{}/", prefix))
        } else if let Some(prefix) = pat.strip_suffix('*') {
            norm_input.starts_with(prefix) || base_name.starts_with(prefix)
        } else if pat.starts_with("*.") {
            let suffix = &pat[1..];
            base_name.ends_with(suffix)
        } else if pat.contains('/') {
            norm_input == pat || norm_input.ends_with(&format!("/{}", pat))
        } else {
            base_name == pat
        }
    })
}

pub fn is_exception_log(schema: &Option<GameSchema>, file_or_rel_path: &str) -> bool {
    let Some(s) = schema else {
        return false;
    };
    let Some(logs) = &s.exception_logs else {
        return false;
    };
    if logs.is_empty() {
        return false;
    }
    let norm_path = file_or_rel_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_lowercase();
    let base_name = norm_path.rsplit('/').next().unwrap_or(&norm_path);

    for log in logs {
        if let Some(exact) = &log.exact {
            let ex = exact
                .trim()
                .replace('\\', "/")
                .trim_start_matches('/')
                .to_lowercase();
            if !ex.is_empty()
                && (base_name == ex
                    || norm_path == ex
                    || norm_path.ends_with(&format!("/{}", ex)))
            {
                return true;
            }
        } else {
            let mut matches = true;
            let mut has_bound = false;
            if let Some(starts) = &log.starts_with {
                let st = starts
                    .trim()
                    .replace('\\', "/")
                    .trim_start_matches('/')
                    .to_lowercase();
                if !st.is_empty() {
                    has_bound = true;
                    let target = if st.contains('/') { &norm_path } else { base_name };
                    if !target.starts_with(&st) {
                        matches = false;
                    }
                }
            }
            if let Some(ends) = &log.ends_with {
                let en = ends.trim().replace('\\', "/").to_lowercase();
                if !en.is_empty() {
                    has_bound = true;
                    let target = if en.contains('/') { &norm_path } else { base_name };
                    if !target.ends_with(&en) {
                        matches = false;
                    }
                }
            }
            if matches && has_bound {
                return true;
            }
        }
    }
    false
}

pub fn is_ignored_lab_exception(
    schema: &Option<GameSchema>,
    file_name: &str,
    content: &str,
) -> bool {
    let Some(s) = schema else {
        return false;
    };
    let Some(rules) = &s.exception_rules else {
        return false;
    };
    if rules.is_empty() {
        return false;
    }

    let content_lower = content.to_lowercase();
    let file_lower = file_name.to_lowercase();

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
        let matched = pat
            .split('|')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .any(|p| content_lower.contains(p));
        if matched {
            return true;
        }
    }
    false
}

pub fn get_executable_names(schema: &Option<GameSchema>) -> Vec<String> {
    schema
        .as_ref()
        .map(|s| s.executable_names.clone())
        .unwrap_or_default()
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
    let explicit = s.steam_app_id.as_ref()?.trim();
    if explicit.is_empty() {
        None
    } else {
        Some(explicit.to_string())
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
        add_candidate(
            home.join("Library")
                .join("Application Support")
                .join("Steam"),
        );
    }

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

    if expected_app_id.is_none() && expected_folder_names.is_empty() && live_path_hint.is_none() {
        return None;
    }

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

    // 1. Direct lookup by schema Steam AppID
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

    // 2. Dynamic scan of appmanifest_*.acf files matching schema folder/display names
    if !expected_folder_names.is_empty() || live_path_hint.is_some() {
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
                                ef.eq_ignore_ascii_case(&installdir)
                                    || ef.eq_ignore_ascii_case(&name)
                            });
                            let common_dir = steamapps.join("common").join(&installdir);
                            let matches_hint = live_path_hint
                                .filter(|h| !h.trim().is_empty())
                                .map(|h| {
                                    let nh = h.replace('\\', "/").to_lowercase();
                                    let nc = common_dir
                                        .to_string_lossy()
                                        .replace('\\', "/")
                                        .to_lowercase();
                                    !nc.is_empty() && nh.starts_with(&nc)
                                })
                                .unwrap_or(false);

                            if matches_folder || matches_hint {
                                let pfx_user =
                                    find_compatdata_across_libs(&app_id, lib).or_else(|| {
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

    // 3. Schema-driven Proton / Heroic / Bottles prefix scan on Linux
    if cfg!(target_os = "linux") {
        if let Some(s) = schema {
            let win_user_rel = s
                .paths
                .user_data_dir_windows
                .as_deref()
                .filter(|d| !d.trim().is_empty())
                .or_else(|| {
                    let dm = s.paths.default_mod_dir_windows.trim();
                    if !dm.is_empty() {
                        Some(dm)
                    } else {
                        None
                    }
                })
                .map(|raw| {
                    raw.replace('\\', "/")
                        .trim_start_matches("%USERPROFILE%/")
                        .trim_start_matches("~/")
                        .trim_start_matches('/')
                        .to_string()
                });

            let win_drive_c_rels: Vec<String> = s
                .paths
                .auto_scan_paths_windows
                .iter()
                .filter_map(|p| {
                    let norm = p.replace('\\', "/");
                    if norm.len() > 3 && norm.as_bytes().get(1) == Some(&b':') {
                        Some(norm[3..].trim_start_matches('/').to_string())
                    } else {
                        None
                    }
                })
                .collect();

            if win_user_rel.is_some() || !win_drive_c_rels.is_empty() {
                for lib in &libraries {
                    let compat_root = lib.join("steamapps").join("compatdata");
                    if let Ok(entries) = std::fs::read_dir(&compat_root) {
                        for entry in entries.flatten() {
                            let compat_dir = entry.path();
                            if !compat_dir.is_dir() {
                                continue;
                            }
                            if let Some(pfx_user) = find_pfx_user_dir(&compat_dir) {
                                let user_matched = win_user_rel
                                    .as_ref()
                                    .map(|rel| pfx_user.join(rel).is_dir())
                                    .unwrap_or(false);
                                let drive_c = pfx_user
                                    .parent()
                                    .and_then(|u| u.parent())
                                    .map(|p| p.to_path_buf());
                                let mut found_in_prefix: Option<PathBuf> = None;
                                if let Some(ref dc) = drive_c {
                                    for rel in &win_drive_c_rels {
                                        let candidate = dc.join(rel);
                                        if candidate.is_dir() {
                                            found_in_prefix = Some(candidate);
                                            break;
                                        }
                                    }
                                }
                                if user_matched || found_in_prefix.is_some() {
                                    let detected_app_id =
                                        entry.file_name().to_string_lossy().to_string();
                                    return Some(SteamProtonResolution {
                                        app_id: detected_app_id,
                                        library_root: lib.clone(),
                                        install_dir: found_in_prefix,
                                        compatdata_pfx_user_dir: Some(pfx_user),
                                    });
                                }
                            }
                        }
                    }
                }
            }

            if !expected_folder_names.is_empty() {
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
                    let normalize_slug = |st: &str| -> String {
                        st.chars()
                            .filter(|c| c.is_ascii_alphanumeric())
                            .flat_map(|c| c.to_lowercase())
                            .collect()
                    };
                    let target_slugs: Vec<String> = expected_folder_names
                        .iter()
                        .map(|n| normalize_slug(n))
                        .filter(|st| !st.is_empty())
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
                                if !slug.is_empty()
                                    && target_slugs
                                        .iter()
                                        .any(|ts| ts == &slug || slug.contains(ts))
                                {
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

pub fn select_os_default_mod_dir(paths: &crate::schema::SchemaPaths) -> &str {
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

pub fn clean_semver_like_version(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'')
        .trim_start_matches(|c: char| c == 'v' || c == 'V');
    if trimmed.is_empty() {
        return None;
    }
    // Preserve semver core + pre-release / build tags (e.g. "1.2.0-beta.1+build42")
    // Stop at whitespace or trailing punctuation
    let mut result = String::new();
    let mut saw_digit = false;
    for ch in trimmed.chars() {
        if ch.is_ascii_digit() {
            saw_digit = true;
            result.push(ch);
        } else if (ch == '.' || ch == '-' || ch == '+' || ch == '_' || ch.is_ascii_alphabetic())
            && saw_digit
        {
            result.push(ch);
        } else if !saw_digit && ch.is_whitespace() {
            continue;
        } else if saw_digit {
            break;
        }
    }
    let cleaned = result
        .trim_end_matches(|c: char| c == '.' || c == '-' || c == '+' || c == '_')
        .to_string();
    if cleaned.chars().any(|c| c.is_ascii_digit()) {
        Some(cleaned)
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
                    if let Some(cleaned) = clean_semver_like_version(&v) {
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
        candidate_dirs.push(engine_root.join("Contents").join("MacOS"));

        for dir in candidate_dirs {
            let candidate = dir.join(exe_name);
            if candidate.exists() && (candidate.is_file() || is_app_bundle(&candidate)) {
                return Some(candidate);
            }
        }
    }

    if schema.is_none() {
        return None;
    }

    let mut scan_dirs = Vec::new();
    if let Some(ref sub) = exe_subdir {
        let sub_dir = engine_root.join(sub);
        if sub_dir.exists() && sub_dir.is_dir() {
            scan_dirs.push(sub_dir);
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
    let saved = crate::commands::state_ops::get_saved_coordinates();
    let trimmed_input = docs_or_mods_path.trim();

    // 1. If caller explicitly passed a distinct docs_path (not equal to mods_path or live_path), honor it directly
    if !trimmed_input.is_empty()
        && !trimmed_input.eq_ignore_ascii_case(saved.mods_path.trim())
        && !trimmed_input.eq_ignore_ascii_case(saved.live_path.trim())
    {
        let p = PathBuf::from(trimmed_input);
        if p.exists() {
            return p;
        }
    }

    // 2. Honor explicit docs_path stored in saved workspace coordinates
    if let Some(ref explicit_docs) = saved.docs_path {
        let ed = explicit_docs.trim();
        if !ed.is_empty() {
            let p = PathBuf::from(ed);
            if p.exists() || trimmed_input.is_empty() {
                return p;
            }
        }
    }

    // 3. Honor schema user_data_dir_*
    if let Some(s) = schema {
        if let Some(raw_dir) = select_os_user_data_dir(&s.paths) {
            let hint = if !trimmed_input.is_empty() {
                Some(trimmed_input)
            } else if !saved.live_path.trim().is_empty() {
                Some(saved.live_path.as_str())
            } else {
                None
            };
            let expanded = expand_schema_path_for_os(raw_dir, schema, hint);
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
            if !user_data_path.as_os_str().is_empty() {
                return user_data_path;
            }
        }
    }

    // 4. Neutral fallback when neither explicit docs_path nor schema user_data_dir_* is configured
    if !trimmed_input.is_empty() {
        return PathBuf::from(trimmed_input);
    }
    if !saved.mods_path.trim().is_empty() {
        return PathBuf::from(saved.mods_path.trim());
    }
    PathBuf::new()
}

pub fn expand_env_vars(path: &str) -> String {
    crate::utils::expand_env_vars(path)
}
