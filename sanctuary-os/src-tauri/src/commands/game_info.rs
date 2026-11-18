use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

const MAX_VERSION_DESCRIPTOR_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub async fn rip_game_version(
    live_path: String,
    docs_path: Option<String>,
    game_schema: Option<crate::schema::GameSchema>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let effective_schema = game_schema.or_else(|| {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    });
    let effective_docs = docs_path
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            get_saved_coordinates()
                .docs_path
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });
    tauri::async_runtime::spawn_blocking(move || {
        rip_game_version_with_schema_and_docs(
            &live_path,
            effective_docs.as_deref(),
            &effective_schema,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_safe_relative_version_path(rel: &str) -> bool {
    let trimmed = rel.trim();
    if trimmed.is_empty() {
        return false;
    }
    let normalized = trimmed.replace('\\', "/");
    let p = Path::new(&normalized);
    if p.is_absolute() {
        return false;
    }
    p.components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn read_version_bytes_bounded(path: &Path) -> Option<Vec<u8>> {
    let file = fs::File::open(path).ok()?;
    let mut buf = Vec::new();
    file.take(MAX_VERSION_DESCRIPTOR_BYTES)
        .read_to_end(&mut buf)
        .ok()?;
    Some(buf)
}

fn decode_version_texts(bytes: &[u8]) -> (String, String) {
    let lossy = String::from_utf8_lossy(bytes).into_owned();
    let printable: String = bytes
        .iter()
        .map(|&b| {
            if b >= 0x20 && b < 0x7f || b == b'\r' || b == b'\n' || b == b'\t' {
                b as char
            } else {
                ' '
            }
        })
        .collect();
    (lossy, printable)
}

fn extract_json_key_version(json_val: &serde_json::Value, key_path: &str) -> Option<String> {
    let mut current = json_val;
    for segment in key_path.split('.').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(segment)?;
            }
            serde_json::Value::Array(arr) => {
                let idx = segment.parse::<usize>().ok()?;
                current = arr.get(idx)?;
            }
            _ => return None,
        }
    }

    let raw = match current {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => return None,
    };
    crate::game_logic::clean_semver_like_version(&raw)
}

fn extract_xml_or_plist_tag_version(content: &str, tag_name: &str) -> Option<String> {
    let tag = tag_name.trim();
    if tag.is_empty() {
        return None;
    }
    let escaped = regex::escape(tag);

    // 1. Plist style: <key>CFBundleShortVersionString</key> <string>1.2.3</string>
    if let Ok(re_plist) = regex::RegexBuilder::new(&format!(
        r"(?is)<key>\s*{escaped}\s*</key>\s*<string>\s*([^<]+?)\s*</string>"
    ))
    .size_limit(1 << 16)
    .build()
    {
        if let Some(cap) = re_plist.captures(content).and_then(|c| c.get(1)) {
            if let Some(ver) = crate::game_logic::clean_semver_like_version(cap.as_str()) {
                return Some(ver);
            }
        }
    }

    // 2. Standard XML element: <GameVersion>1.2.3</GameVersion>
    if let Ok(re_elem) = regex::RegexBuilder::new(&format!(
        r"(?is)<(?:[A-Za-z0-9_]+:)?{escaped}\b[^>]*>\s*([^<]+?)\s*</(?:[A-Za-z0-9_]+:)?{escaped}\s*>"
    ))
    .size_limit(1 << 16)
    .build()
    {
        if let Some(cap) = re_elem.captures(content).and_then(|c| c.get(1)) {
            if let Some(ver) = crate::game_logic::clean_semver_like_version(cap.as_str()) {
                return Some(ver);
            }
        }
    }

    // 3. XML attribute: version="1.2.3"
    if let Ok(re_attr) = regex::RegexBuilder::new(&format!(
        r#"(?i)\b{escaped}\s*=\s*["']([^"']+)["']"#
    ))
    .size_limit(1 << 16)
    .build()
    {
        if let Some(cap) = re_attr.captures(content).and_then(|c| c.get(1)) {
            if let Some(ver) = crate::game_logic::clean_semver_like_version(cap.as_str()) {
                return Some(ver);
            }
        }
    }

    None
}

fn extract_regex_version(content: &str, pattern: &str) -> Option<String> {
    let trimmed = pattern.trim();
    if trimmed.is_empty() || trimmed.len() > 256 {
        return None;
    }
    let re = regex::RegexBuilder::new(trimmed)
        .size_limit(1 << 18)
        .build()
        .ok()?;
    let caps = re.captures(content)?;
    let raw = caps
        .get(1)
        .or_else(|| caps.get(0))
        .map(|m| m.as_str())?;
    crate::game_logic::clean_semver_like_version(raw)
}

fn extract_ini_prefix_version(content: &str, prefix: &str) -> Option<String> {
    let prefix_trimmed = prefix.trim();
    if prefix_trimmed.is_empty() {
        return None;
    }
    let prefix_lower = prefix_trimmed.to_lowercase();
    for line in content.lines() {
        let trimmed_line = line.trim();
        let line_lower = trimmed_line.to_lowercase();
        if line_lower.starts_with(&prefix_lower) {
            let after_prefix = &trimmed_line[prefix_trimmed.len()..];
            let remainder = after_prefix
                .trim_start()
                .strip_prefix('=')
                .or_else(|| after_prefix.trim_start().strip_prefix(':'))
                .unwrap_or(after_prefix);
            if let Some(cleaned) = crate::game_logic::clean_semver_like_version(remainder) {
                return Some(cleaned);
            }
        }
    }
    None
}

fn extract_plain_text_version(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') || trimmed.starts_with("//") {
            continue;
        }
        if let Some(cleaned) = crate::game_logic::clean_semver_like_version(trimmed) {
            return Some(cleaned);
        }
    }
    for token in content.split_whitespace() {
        if token.chars().any(|c| c == '.') {
            if let Some(cleaned) = crate::game_logic::clean_semver_like_version(token) {
                return Some(cleaned);
            }
        }
    }
    None
}

fn extract_version_from_text_blob(
    content: &str,
    printable_fallback: &str,
    version_ext: &crate::schema::VersionExtraction,
) -> Option<String> {
    if let Some(json_key) = version_ext
        .json_key
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(content) {
            if let Some(ver) = extract_json_key_version(&parsed, json_key) {
                return Some(ver);
            }
        }
    }

    if let Some(xml_tag) = version_ext
        .xml_tag
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(ver) = extract_xml_or_plist_tag_version(content, xml_tag)
            .or_else(|| extract_xml_or_plist_tag_version(printable_fallback, xml_tag))
        {
            return Some(ver);
        }
    }

    if let Some(pat) = version_ext
        .regex_pattern
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(ver) = extract_regex_version(content, pat)
            .or_else(|| extract_regex_version(printable_fallback, pat))
        {
            return Some(ver);
        }
    }

    let prefix = version_ext.line_prefix.trim();
    if !prefix.is_empty() {
        if let Some(ver) = extract_ini_prefix_version(content, prefix)
            .or_else(|| extract_ini_prefix_version(printable_fallback, prefix))
        {
            return Some(ver);
        }
    }

    let method_lower = version_ext
        .method
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_default();
    let no_specific_selector = version_ext
        .json_key
        .as_deref()
        .map_or(true, |s| s.trim().is_empty())
        && version_ext
            .xml_tag
            .as_deref()
            .map_or(true, |s| s.trim().is_empty())
        && version_ext
            .regex_pattern
            .as_deref()
            .map_or(true, |s| s.trim().is_empty())
        && prefix.is_empty();

    if matches!(method_lower.as_str(), "plain_text" | "raw_file" | "text")
        || (no_specific_selector && !version_ext.relative_path.trim().is_empty())
    {
        return extract_plain_text_version(printable_fallback)
            .or_else(|| extract_plain_text_version(content));
    }

    None
}

fn try_extract_version_from_schema_descriptor(
    live_path: &str,
    root_path: &Path,
    docs_path: Option<&str>,
    version_ext: &crate::schema::VersionExtraction,
) -> Option<String> {
    let mut rel_paths: Vec<String> = Vec::new();
    if is_safe_relative_version_path(&version_ext.relative_path) {
        rel_paths.push(version_ext.relative_path.trim().replace('\\', "/"));
    }
    if let Some(fallbacks) = &version_ext.fallback_paths {
        for fb in fallbacks {
            if is_safe_relative_version_path(fb) {
                let norm = fb.trim().replace('\\', "/");
                if !rel_paths.contains(&norm) {
                    rel_paths.push(norm);
                }
            }
        }
    }
    if rel_paths.is_empty() {
        return None;
    }

    let mut base_roots: Vec<PathBuf> = Vec::new();
    if !root_path.as_os_str().is_empty() {
        base_roots.push(root_path.to_path_buf());
    }
    let live_buf = PathBuf::from(live_path.trim());
    if !live_buf.as_os_str().is_empty() && !base_roots.contains(&live_buf) {
        base_roots.push(live_buf);
    }
    if let Some(docs) = docs_path.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let docs_buf = PathBuf::from(docs);
        if !base_roots.contains(&docs_buf) {
            base_roots.push(docs_buf);
        }
    }

    let method_is_pe = version_ext
        .method
        .as_deref()
        .map_or(false, |m| m.eq_ignore_ascii_case("pe_header"));

    for rel in rel_paths {
        for root in &base_roots {
            let candidate = root.join(&rel);
            if !candidate.exists() {
                continue;
            }

            let ext_lower = candidate
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();

            if method_is_pe || matches!(ext_lower.as_str(), "exe" | "dll" | "app") {
                if let Some((ver, is_stub)) =
                    crate::game_logic::extract_pe_file_version_detailed(&candidate)
                {
                    if !is_stub {
                        return Some(ver);
                    }
                }
            }

            if candidate.is_file() {
                if let Some(bytes) = read_version_bytes_bounded(&candidate) {
                    if let Some(ver) = try_structured_build_version_bytes(&bytes) {
                        return Some(ver);
                    }
                    let (lossy, printable) = decode_version_texts(&bytes);
                    if let Some(ver) =
                        extract_version_from_text_blob(&lossy, &printable, version_ext)
                    {
                        return Some(ver);
                    }
                }
            }
        }
    }

    None
}

fn try_structured_build_version_bytes(bytes: &[u8]) -> Option<String> {
    let val = serde_json::from_slice::<serde_json::Value>(bytes).ok()?;
    let major = val.get("MajorVersion").and_then(|v| v.as_u64())?;
    let minor = val.get("MinorVersion").and_then(|v| v.as_u64()).unwrap_or(0);
    let patch = val.get("PatchVersion").and_then(|v| v.as_u64()).unwrap_or(0);
    let changelist = val.get("Changelist").and_then(|v| v.as_u64()).unwrap_or(0);
    if major == 0 && minor == 0 && patch == 0 {
        return None;
    }
    if changelist > 0 {
        Some(format!("{}.{}.{}.{}", major, minor, patch, changelist))
    } else {
        Some(format!("{}.{}.{}", major, minor, patch))
    }
}

fn try_generic_engine_manifests_and_steam(
    root_path: &Path,
    docs_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Option<String> {
    // 3a. Structured build-version manifests declared in schema `version_extraction.fallback_paths`
    if let Some(fallbacks) = game_schema
        .as_ref()
        .and_then(|s| s.version_extraction.as_ref())
        .and_then(|v| v.fallback_paths.as_ref())
    {
        for rel in fallbacks {
            if !is_safe_relative_version_path(rel) {
                continue;
            }
            let cand = crate::utils::resolve_case_insensitive_path(
                root_path,
                &rel.trim().replace('\\', "/"),
            );
            if cand.is_file() {
                if let Some(bytes) = read_version_bytes_bounded(&cand) {
                    if let Some(ver) = try_structured_build_version_bytes(&bytes) {
                        return Some(ver);
                    }
                }
            }
        }
    }

    // 3b. Neutral engine-agnostic JSON/text version files in engine root or user data root
    let mut scan_roots = vec![root_path.to_path_buf()];
    if let Some(docs) = docs_path.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let dp = PathBuf::from(docs);
        if !scan_roots.contains(&dp) {
            scan_roots.push(dp);
        }
    }

    let generic_json_files = ["version.json", "build_info.json"];
    let generic_json_keys = ["version", "game_version", "build_version", "versionName"];
    for base in &scan_roots {
        for fname in generic_json_files {
            let cand = base.join(fname);
            if cand.is_file() {
                if let Some(bytes) = read_version_bytes_bounded(&cand) {
                    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                        for key in generic_json_keys {
                            if let Some(ver) = extract_json_key_version(&val, key) {
                                return Some(ver);
                            }
                        }
                    }
                }
            }
        }
    }

    let generic_text_files = ["version.txt", "GameVersion.txt", "build_version.txt"];
    for base in &scan_roots {
        for fname in generic_text_files {
            let cand = base.join(fname);
            if cand.is_file() {
                if let Some(bytes) = read_version_bytes_bounded(&cand) {
                    let (lossy, printable) = decode_version_texts(&bytes);
                    if let Some(ver) = extract_plain_text_version(&printable)
                        .or_else(|| extract_plain_text_version(&lossy))
                    {
                        return Some(ver);
                    }
                }
            }
        }
    }

    // 3c. Steamworks appmanifest_<steam_app_id>.acf buildid fallback (helpful for Linux/Proton native builds without PE version resources)
    if let Some(app_id) = game_schema
        .as_ref()
        .and_then(|s| s.steam_app_id.as_deref())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
    {
        let manifest_name = format!("appmanifest_{}.acf", app_id);
        let re_buildid = regex::Regex::new(r#"(?i)"buildid"\s+"(\d+)""#).ok()?;
        for ancestor in root_path.ancestors().take(5) {
            let direct = ancestor.join(&manifest_name);
            let under_steamapps = ancestor.join("steamapps").join(&manifest_name);
            for acf in [direct, under_steamapps] {
                if acf.is_file() {
                    if let Some(bytes) = read_version_bytes_bounded(&acf) {
                        let text = String::from_utf8_lossy(&bytes);
                        if let Some(cap) = re_buildid.captures(&text).and_then(|c| c.get(1)) {
                            let bid = cap.as_str().trim();
                            if !bid.is_empty() && bid != "0" {
                                return Some(format!("build.{}", bid));
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn rip_game_version_with_schema(
    live_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    rip_game_version_with_schema_and_docs(live_path, None, game_schema)
}

pub fn rip_game_version_with_schema_and_docs(
    live_path: &str,
    docs_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    let root_path = crate::game_logic::resolve_game_engine_root(live_path, game_schema);

    // Tier 1: Authoritative Schema Descriptor (runs BEFORE executable probing when configured,
    // so wrapper executables with generic 1.0.0.0 never shadow configured ini/json/xml/regex/text descriptors)
    if let Some(schema) = game_schema {
        if let Some(version_ext) = &schema.version_extraction {
            let method_none = version_ext
                .method
                .as_deref()
                .map_or(false, |m| m.eq_ignore_ascii_case("none"));
            let has_paths = is_safe_relative_version_path(&version_ext.relative_path)
                || version_ext
                    .fallback_paths
                    .as_ref()
                    .map_or(false, |fps| fps.iter().any(|p| is_safe_relative_version_path(p)));
            if !method_none && has_paths {
                if let Some(ver) = try_extract_version_from_schema_descriptor(
                    live_path,
                    &root_path,
                    docs_path,
                    version_ext,
                ) {
                    return Ok(ver);
                }
            }
        }
    }

    // Tier 2: Executable PE VersionInfo (Fixed + StringFileInfo) / macOS Info.plist
    let mut stub_fallback: Option<String> = None;
    let exe_path = crate::game_logic::resolve_executable_path(live_path, game_schema);
    let mut candidate_bins: Vec<PathBuf> = Vec::new();
    if let Some(exe) = exe_path {
        candidate_bins.push(exe);
    }
    let live_buf = PathBuf::from(live_path.trim());
    if !live_buf.as_os_str().is_empty() && !candidate_bins.contains(&live_buf) {
        candidate_bins.push(live_buf);
    }
    if !root_path.as_os_str().is_empty() && !candidate_bins.contains(&root_path) {
        candidate_bins.push(root_path.clone());
    }

    for bin_path in candidate_bins {
        if let Some((ver, is_stub)) =
            crate::game_logic::extract_pe_file_version_detailed(&bin_path)
        {
            if !is_stub {
                return Ok(ver);
            }
            if stub_fallback.is_none() {
                stub_fallback = Some(ver);
            }
        }
    }

    // Tier 3: Engine-Agnostic Structural Fallbacks (Unreal Build.version, generic manifests, Steamworks appmanifest)
    if let Some(ver) = try_generic_engine_manifests_and_steam(&root_path, docs_path, game_schema) {
        return Ok(ver);
    }

    // Tier 4: Generic stub version (e.g. 1.0.0.0) if no richer source succeeded
    if let Some(stub) = stub_fallback {
        return Ok(stub);
    }

    Err("backend_version_string_empty".into())
}

#[tauri::command]
pub async fn scan_installed_dlc(
    live_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut installed_packs = Vec::new();
        let root = crate::game_logic::resolve_game_engine_root(&live_path, &game_schema);
        let live_path_buf = PathBuf::from(&live_path);

        let mut dirs_to_scan = vec![root.clone()];
        if let Some(schema) = &game_schema {
            if let Some(subs) = &schema.dlc_subdirs {
                for sub in subs {
                    let trimmed = sub.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    for candidate in [root.join(trimmed), live_path_buf.join(trimmed)] {
                        if candidate.exists() && !dirs_to_scan.contains(&candidate) {
                            dirs_to_scan.push(candidate);
                        }
                    }
                }
            }
        }

        let dlc_exts: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.dlc_file_extensions.as_ref())
            .map(|list| {
                list.iter()
                    .map(|e| e.trim_start_matches('.').to_lowercase())
                    .collect()
            })
            .unwrap_or_default();

        for dir in dirs_to_scan {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        if let Ok(name) = entry.file_name().into_string() {
                            let name_up = name.to_uppercase();
                            if crate::game_logic::is_dlc_folder(&game_schema, &name_up)
                                && !installed_packs.contains(&name_up)
                            {
                                installed_packs.push(name_up);
                            }
                        }
                    } else if p.is_file() && !dlc_exts.is_empty() {
                        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                            if dlc_exts.contains(&ext.to_lowercase()) {
                                if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                                    let name_up = stem.to_uppercase();
                                    if crate::game_logic::is_dlc_folder(&game_schema, &name_up)
                                        && !installed_packs.contains(&name_up)
                                    {
                                        installed_packs.push(name_up);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        installed_packs.sort();
        Ok(installed_packs)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_heuristic_signatures(sigs: Vec<HeuristicSignature>) -> (Vec<HeuristicSignature>, bool) {
    let mut changed = false;
    let mut sanitized = Vec::with_capacity(sigs.len());

    for mut sig in sigs {
        let mt = sig.match_type.trim().to_lowercase();
        let id_lower = sig.id.trim().to_lowercase();
        let sig_lower = sig.signature.trim().to_lowercase();
        let is_content = mt == "file_content_contains" || mt.is_empty() || mt.starts_with("content");

        if is_content {
            if sig_lower == "iwr + iex" || id_lower == "powershell_iwr_iex_cradle" {
                changed = true;
                continue;
            }
            if sig_lower == "downloadstring( + iex" {
                sig.signature = "DownloadString( + Invoke-Expression".to_string();
                changed = true;
            }

            let updated_lower = sig.signature.trim().to_lowercase();
            let parts: Vec<&str> = updated_lower
                .split(" + ")
                .flat_map(|p| p.split(" && "))
                .map(|p| p.trim())
                .filter(|p| !p.is_empty())
                .collect();

            let has_tiny_clause = parts.iter().any(|p| p.len() < 4);
            let single_too_short = parts.len() == 1 && parts[0].len() < 6;
            let all_short_weak_compound = !parts.is_empty()
                && parts.iter().all(|p| p.len() < 6)
                && parts.iter().map(|p| p.len()).sum::<usize>() < 9;

            if parts.is_empty() || has_tiny_clause || single_too_short || all_short_weak_compound {
                changed = true;
                continue;
            }
        }

        sanitized.push(sig);
    }

    (sanitized, changed)
}

#[tauri::command]
pub fn get_heuristic_signatures(vault_path: String) -> Result<Vec<HeuristicSignature>, String> {
    if let Some((content, _)) = crate::utils::get_vault_kv(&vault_path, "malware_signatures") {
        if let Ok(sigs) = serde_json::from_str::<Vec<HeuristicSignature>>(&content) {
            let (sanitized, changed) = sanitize_heuristic_signatures(sigs);
            if !sanitized.is_empty() {
                if changed {
                    if let Ok(updated) = serde_json::to_string_pretty(&sanitized) {
                        crate::utils::set_vault_kv(&vault_path, "malware_signatures", &updated);
                    }
                }
                return Ok(sanitized);
            }
        }
    }

    let now_str = chrono::Local::now().to_rfc3339();
    let default_specs = [
        (
            "discord_com_api_webhooks",
            "discord.com/api/webhooks",
            "file_content_contains",
            "Unauthorized Discord webhook exfiltration.",
        ),
        (
            "discordapp_com_api_webhooks",
            "discordapp.com/api/webhooks",
            "file_content_contains",
            "Legacy Discord webhook exfiltration.",
        ),
        (
            "telegram_bot_exfil",
            "api.telegram.org/bot + /send",
            "file_content_contains",
            "Telegram Bot API credential exfiltration.",
        ),
        (
            "discord_token_leveldb",
            "Local Storage\\leveldb",
            "file_content_contains",
            "Discord/Browser Local Storage LevelDB token harvesting.",
        ),
        (
            "browser_login_data_stealer",
            "User Data\\Default\\Login Data",
            "file_content_contains",
            "Chromium browser SQLite password vault access.",
        ),
        (
            "powershell_encoded_dropper",
            "powershell -enc",
            "file_content_contains",
            "Encoded PowerShell dropper payload.",
        ),
        (
            "powershell_hidden_window",
            "powershell -w hidden",
            "file_content_contains",
            "Hidden PowerShell execution.",
        ),
        (
            "powershell_webclient_downloadstring",
            "Net.WebClient + DownloadString(",
            "file_content_contains",
            "Compound: .NET WebClient instantiated to download remote payload.",
        ),
        (
            "powershell_downloadstring_invoke",
            "DownloadString( + Invoke-Expression",
            "file_content_contains",
            "Compound: .NET WebClient DownloadString piped to Invoke-Expression.",
        ),
        (
            "mshta_remote_dropper",
            "mshta + http",
            "file_content_contains",
            "Compound: Remote HTA execution via mshta.",
        ),
        (
            "regsvr32_scrobj_squiblydoo",
            "regsvr32 + scrobj.dll",
            "file_content_contains",
            "Compound: Regsvr32 remote scriptlet proxy execution.",
        ),
        (
            "subprocess_popen_powershell",
            "subprocess.Popen( + powershell",
            "file_content_contains",
            "Compound: Spawns PowerShell via subprocess.Popen.",
        ),
        (
            "os_system_powershell",
            "os.system( + powershell",
            "file_content_contains",
            "Compound: Executes PowerShell via os.system.",
        ),
        (
            "os_system_cmd_dropper",
            "os.system( + cmd.exe /c",
            "file_content_contains",
            "Compound: Executes command-prompt chain via os.system.",
        ),
        (
            "b64decode_exec_chain",
            "base64.b64decode( + exec(",
            "file_content_contains",
            "Compound: Base64 payload decode and dynamic exec.",
        ),
        (
            "import_os_system_obfuscated",
            "__import__('os') + system(",
            "file_content_contains",
            "Compound: Obfuscated __import__('os') with system().",
        ),
        ("grabber_py", "grabber.py", "file_name_exact", ""),
        ("stealer_exe", "stealer.exe", "file_name_exact", ""),
        ("_vbs", ".vbs", "file_extension", "VBScript executable payload inside mod archive."),
        ("_vbe", ".vbe", "file_extension", "Encoded VBScript executable payload inside mod archive."),
        ("_hta", ".hta", "file_extension", "HTML Application executable payload inside mod archive."),
        ("_scr", ".scr", "file_extension", "Screensaver executable binary inside mod archive."),
        ("_pif", ".pif", "file_extension", "Program Information File executable dropper inside mod archive."),
        ("_cpl", ".cpl", "file_extension", "Windows Control Panel DLL executable dropper inside mod archive."),
        ("_jse", ".jse", "file_extension", "Encoded JScript executable payload inside mod archive."),
        ("_wsf", ".wsf", "file_extension", "Windows Script File executable payload inside mod archive."),
    ];

    let defaults: Vec<HeuristicSignature> = default_specs
        .into_iter()
        .map(|(id, signature, match_type, notes)| HeuristicSignature {
            id: id.into(),
            signature: signature.into(),
            match_type: match_type.into(),
            severity: "malware".into(),
            source: "system".into(),
            enabled: true,
            created_by: "system".into(),
            created_at: now_str.clone(),
            notes: notes.into(),
        })
        .collect();

    let _ = save_heuristic_signatures(vault_path, defaults.clone());

    Ok(defaults)
}

#[tauri::command]
pub fn save_heuristic_signatures(
    vault_path: String,
    signatures: Vec<HeuristicSignature>,
) -> Result<(), String> {
    let (clean_sigs, _) = sanitize_heuristic_signatures(signatures);
    if let Some((existing_str, _)) = crate::utils::get_vault_kv(&vault_path, "malware_signatures") {
        if let Ok(existing_sigs) = serde_json::from_str::<Vec<HeuristicSignature>>(&existing_str) {
            if existing_sigs.len() == clean_sigs.len()
                && compute_signatures_version(&existing_sigs)
                    == compute_signatures_version(&clean_sigs)
            {
                return Ok(());
            }
        }
    }
    if let Ok(content) = serde_json::to_string_pretty(&clean_sigs) {
        crate::utils::set_vault_kv(&vault_path, "malware_signatures", &content);
        return Ok(());
    }
    Err("Failed to save heuristic signatures".into())
}

static LAST_WORKBENCH_SAVE_MS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, u64>>,
> = std::sync::OnceLock::new();

fn normalize_history_path_key(path: &str) -> String {
    path.trim().replace('\\', "/").to_lowercase()
}

pub fn mark_workbench_save(path: &str) {
    let now_ms = crate::utils::current_epoch_ms();
    let map_mutex =
        LAST_WORKBENCH_SAVE_MS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(mut map) = map_mutex.lock() {
        map.insert(normalize_history_path_key(path), now_ms);
        if let Some(fname) = std::path::Path::new(path).file_name().and_then(|n| n.to_str()) {
            map.insert(fname.to_lowercase(), now_ms);
        }
    }
}

pub fn was_recently_saved_by_workbench(path: &str, window_ms: u64) -> bool {
    let now_ms = crate::utils::current_epoch_ms();
    let map_mutex =
        LAST_WORKBENCH_SAVE_MS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(map) = map_mutex.lock() {
        let key = normalize_history_path_key(path);
        if let Some(&saved_ms) = map.get(&key) {
            if now_ms.saturating_sub(saved_ms) < window_ms {
                return true;
            }
        }
        if let Some(fname) = std::path::Path::new(path).file_name().and_then(|n| n.to_str()) {
            if let Some(&saved_ms) = map.get(&fname.to_lowercase()) {
                if now_ms.saturating_sub(saved_ms) < window_ms {
                    return true;
                }
            }
        }
    }
    false
}

fn get_file_history_dir(app: &tauri::AppHandle, path: &str) -> Option<PathBuf> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().ok()?;
    let path_hash = format!("{:x}", md5::compute(path));
    Some(app_dir.join("file_history").join(path_hash))
}

fn get_candidate_history_dirs(app: &tauri::AppHandle, path: &str) -> Vec<PathBuf> {
    use tauri::Manager;
    let Ok(app_dir) = app.path().app_data_dir() else {
        return Vec::new();
    };
    let base = app_dir.join("file_history");
    let mut dirs = Vec::new();
    let mut push_unique = |hash_input: &str| {
        let h = format!("{:x}", md5::compute(hash_input));
        let p = base.join(h);
        if !dirs.contains(&p) {
            dirs.push(p);
        }
    };
    push_unique(path);
    push_unique(&path.replace('/', "\\"));
    push_unique(&path.replace('\\', "/"));
    push_unique(&normalize_history_path_key(path));
    dirs
}

fn enforce_file_history_retention(
    file_history_dir: &std::path::Path,
    max_copies: usize,
    max_size_bytes: u64,
) {
    use std::time::SystemTime;
    if let Ok(entries) = std::fs::read_dir(file_history_dir) {
        let mut all_files = Vec::new();
        for p in entries
            .flatten()
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        {
            let path = p.path();
            let is_pinned = std::fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<HistoryEntry>(&content).ok())
                .map(|h| h.pinned.unwrap_or(false))
                .unwrap_or(false);

            let size = path.metadata().map(|m| m.len()).unwrap_or(0);
            let modified = path
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            all_files.push((path, is_pinned, size, modified));
        }

        all_files.sort_by_key(|f| f.3);

        let mut unpinned_count = all_files.iter().filter(|f| !f.1).count();
        let mut unpinned_size: u64 = all_files.iter().filter(|f| !f.1).map(|f| f.2).sum();

        for (path, is_pinned, size, _) in all_files {
            if unpinned_count <= max_copies && unpinned_size <= max_size_bytes {
                break;
            }
            if !is_pinned && std::fs::remove_file(&path).is_ok() {
                unpinned_count = unpinned_count.saturating_sub(1);
                unpinned_size = unpinned_size.saturating_sub(size);
            }
        }
    }
}

pub fn record_in_game_config_snapshot(
    app: &tauri::AppHandle,
    path: &str,
    prior_content: Option<&str>,
    new_content: &str,
) -> Option<u64> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Emitter;

    if new_content.trim().is_empty() {
        return None;
    }

    let config = get_saved_coordinates();
    let max_copies = config.timeline_retention_copies.unwrap_or(50) as usize;
    let max_size_bytes = config.timeline_retention_size_mb.unwrap_or(100) as u64 * 1024 * 1024;
    if max_copies == 0 {
        return None;
    }

    let existing_history = get_file_history(app.clone(), path.to_string()).unwrap_or_default();
    if let Some(latest) = existing_history.iter().max_by_key(|h| h.timestamp) {
        if latest.content == new_content {
            return None;
        }
    }

    let file_history_dir = get_file_history_dir(app, path)?;
    std::fs::create_dir_all(&file_history_dir).unwrap_or_default();

    let mut timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Some(max_existing_ts) = existing_history.iter().map(|h| h.timestamp).max() {
        if timestamp <= max_existing_ts {
            timestamp = max_existing_ts + 1;
        }
    }

    // If no snapshots exist yet and we have the pre-game baseline content, record it first so the user can diff against it
    if existing_history.is_empty() {
        if let Some(prior) = prior_content {
            if !prior.trim().is_empty() && prior != new_content {
                let baseline_ts = timestamp.saturating_sub(1);
                let baseline_file = file_history_dir.join(format!("{}.json", baseline_ts));
                let baseline_entry = HistoryEntry {
                    timestamp: baseline_ts,
                    content: prior.to_string(),
                    pinned: Some(false),
                    name: Some("[Pre-Game Baseline]".to_string()),
                };
                if let Ok(json) = serde_json::to_string(&baseline_entry) {
                    let _ = std::fs::write(&baseline_file, json);
                }
            }
        }
    }

    let history_file = file_history_dir.join(format!("{}.json", timestamp));
    let entry = HistoryEntry {
        timestamp,
        content: new_content.to_string(),
        pinned: Some(false),
        name: Some("[In-Game Engine Edit]".to_string()),
    };

    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = std::fs::write(&history_file, json);
    }

    enforce_file_history_retention(&file_history_dir, max_copies, max_size_bytes);

    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let _ = app.emit(
        "workbench_config_intercepted",
        serde_json::json!({
            "path": path,
            "file_name": file_name,
            "timestamp": timestamp,
            "source": "in_game",
        }),
    );

    Some(timestamp)
}

fn update_history_entry<F>(
    app: &tauri::AppHandle,
    path: &str,
    timestamp: u64,
    mut mutate: F,
    err_msg: &str,
) -> Result<(), String>
where
    F: FnMut(&mut HistoryEntry),
{
    for file_history_dir in get_candidate_history_dirs(app, path) {
        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        if let Ok(content) = std::fs::read_to_string(&history_file) {
            if let Ok(mut h) = serde_json::from_str::<HistoryEntry>(&content) {
                mutate(&mut h);
                if let Ok(json) = serde_json::to_string(&h) {
                    if std::fs::write(&history_file, json).is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }
    Err(err_msg.into())
}

#[tauri::command]
pub fn save_file_with_history(
    app: tauri::AppHandle,
    path: String,
    content: String,
) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let target = std::path::Path::new(&path);
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing to write to protected system path.".into());
    }
    let config = get_saved_coordinates();
    let allowed = crate::utils::get_allowed_config_roots(&config);
    if allowed.is_empty() {
        return Err("Blocked: No configured workspace roots to validate file write.".into());
    }
    crate::utils::ensure_strict_descendant_of_roots(target, &allowed)?;

    let prior_disk_content = std::fs::read_to_string(target).ok();
    mark_workbench_save(&path);
    crate::utils::atomic_write_bytes(target, content.as_bytes())
        .map_err(|e| format!("Failed to save file: {}", e))?;

    if let Some(file_history_dir) = get_file_history_dir(&app, &path) {
        let config = get_saved_coordinates();
        let max_copies = config.timeline_retention_copies.unwrap_or(50) as usize;
        let max_size_bytes = config.timeline_retention_size_mb.unwrap_or(100) as u64 * 1024 * 1024;

        if max_copies == 0 {
            return Ok("Saved without history".into());
        }

        let existing_history = get_file_history(app.clone(), path.clone()).unwrap_or_default();
        std::fs::create_dir_all(&file_history_dir).unwrap_or_default();

        let mut timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if let Some(max_existing_ts) = existing_history.iter().map(|h| h.timestamp).max() {
            if timestamp <= max_existing_ts {
                timestamp = max_existing_ts + 1;
            }
        }

        if existing_history.is_empty() {
            if let Some(prior) = prior_disk_content.as_deref() {
                if !prior.trim().is_empty() && prior != content {
                    let baseline_ts = timestamp.saturating_sub(1);
                    let baseline_file = file_history_dir.join(format!("{}.json", baseline_ts));
                    let baseline_entry = HistoryEntry {
                        timestamp: baseline_ts,
                        content: prior.to_string(),
                        pinned: Some(false),
                        name: Some("[Pre-Game Baseline]".to_string()),
                    };
                    if let Ok(json) = serde_json::to_string(&baseline_entry) {
                        let _ = std::fs::write(&baseline_file, json);
                    }
                }
            }
        }

        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        let entry = HistoryEntry {
            timestamp,
            content,
            pinned: Some(false),
            name: None,
        };

        if let Ok(json) = serde_json::to_string(&entry) {
            let _ = std::fs::write(&history_file, json);
        }

        enforce_file_history_retention(&file_history_dir, max_copies, max_size_bytes);
    }

    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn save_file_silently(path: String, content: String) -> Result<String, String> {
    let target = std::path::Path::new(&path);
    if !crate::utils::is_safe_user_file_path(target) {
        return Err("Blocked: Refusing to write to protected system path.".into());
    }
    let config = get_saved_coordinates();
    let allowed = crate::utils::get_allowed_config_roots(&config);
    if allowed.is_empty() {
        return Err("Blocked: No configured workspace roots to validate file write.".into());
    }
    crate::utils::ensure_strict_descendant_of_roots(target, &allowed)?;
    mark_workbench_save(&path);
    crate::utils::atomic_write_bytes(target, content.as_bytes())
        .map_err(|e| format!("Failed to save file: {}", e))?;
    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn get_file_history(app: tauri::AppHandle, path: String) -> Result<Vec<HistoryEntry>, String> {
    let mut history = Vec::new();
    let mut seen_timestamps = std::collections::HashSet::new();

    for file_history_dir in get_candidate_history_dirs(&app, &path) {
        if file_history_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(file_history_dir) {
                for entry in entries.flatten() {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        if let Ok(h) = serde_json::from_str::<HistoryEntry>(&content) {
                            if seen_timestamps.insert(h.timestamp) {
                                history.push(h);
                            }
                        }
                    }
                }
            }
        }
    }

    history.sort_by(|a, b| {
        let a_pinned = a.pinned.unwrap_or(false);
        let b_pinned = b.pinned.unwrap_or(false);
        if a_pinned != b_pinned {
            b_pinned.cmp(&a_pinned)
        } else {
            b.timestamp.cmp(&a.timestamp)
        }
    });
    Ok(history)
}

#[tauri::command]
pub fn toggle_pin_version(
    app: tauri::AppHandle,
    path: String,
    timestamp: u64,
    pinned: bool,
) -> Result<(), String> {
    update_history_entry(
        &app,
        &path,
        timestamp,
        |h| h.pinned = Some(pinned),
        "Failed to update pin status",
    )
}

#[tauri::command]
pub fn delete_version(app: tauri::AppHandle, path: String, timestamp: u64) -> Result<(), String> {
    let mut deleted = false;
    for file_history_dir in get_candidate_history_dirs(&app, &path) {
        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        if history_file.exists() {
            if std::fs::remove_file(history_file).is_ok() {
                deleted = true;
            }
        }
    }
    if deleted {
        Ok(())
    } else {
        Err("Failed to delete version".into())
    }
}

#[tauri::command]
pub fn rename_version(
    app: tauri::AppHandle,
    path: String,
    timestamp: u64,
    name: String,
) -> Result<(), String> {
    update_history_entry(
        &app,
        &path,
        timestamp,
        |h| h.name = Some(name.clone()),
        "Failed to rename version",
    )
}

#[tauri::command]
pub async fn rename_file_with_history(
    app: tauri::AppHandle,
    old_path: String,
    new_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let old_target = std::path::Path::new(&old_path);
        let new_target = std::path::Path::new(&new_path);
        if !crate::utils::is_safe_user_file_path(old_target)
            || !crate::utils::is_safe_user_file_path(new_target)
        {
            return Err("Blocked: Refusing to rename protected system path.".into());
        }
        let config = get_saved_coordinates();
        let allowed = crate::utils::get_allowed_config_roots(&config);
        if allowed.is_empty() {
            return Err("Blocked: No configured workspace roots to validate rename.".into());
        }
        let resolved_old = crate::utils::ensure_strict_descendant_of_roots(old_target, &allowed)?;
        crate::utils::ensure_strict_descendant_of_roots(new_target, &allowed)?;

        let new_leaf = new_target
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid destination filename.".to_string())?;
        if !crate::utils::is_safe_single_node_component(new_leaf) {
            return Err("Invalid destination filename.".into());
        }
        if new_target.exists()
            && resolved_old
                != crate::utils::resolve_canonical_target(new_target)
                    .unwrap_or_else(|_| new_target.to_path_buf())
        {
            return Err("Destination file already exists.".into());
        }
        if let Some(parent) = new_target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        fs::rename(&resolved_old, new_target)
            .map_err(|e| format!("Failed to rename file: {}", e))?;

        if let (Some(old_hist), Some(new_hist)) = (
            get_file_history_dir(&app, &old_path),
            get_file_history_dir(&app, &new_path),
        ) {
            if old_hist.exists() && old_hist != new_hist && !new_hist.exists() {
                if let Some(parent) = new_hist.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::rename(&old_hist, &new_hist);
            }
        }

        Ok(new_target.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod version_ripper_tests {
    use super::*;

    struct TempTestDir(PathBuf);
    impl TempTestDir {
        fn new(suffix: &str) -> Self {
            let p = std::env::temp_dir().join(format!(
                "sanctuary_ver_test_{}_{}",
                suffix,
                uuid::Uuid::new_v4()
            ));
            let _ = fs::create_dir_all(&p);
            Self(p)
        }
    }
    impl Drop for TempTestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn base_schema_with_ver(ve: crate::schema::VersionExtraction) -> crate::schema::GameSchema {
        let mut schema = crate::schema::GameSchema::default();
        schema.version_extraction = Some(ve);
        schema
    }

    #[test]
    fn test_ini_and_json_key_priority() {
        let tmp = TempTestDir::new("ini_json");
        let cfg_path = tmp.0.join("engine.ini");
        fs::write(&cfg_path, "[Build]\nEngineVersion = 2.14.9\n").unwrap();

        let schema_ini = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            method: Some("ini_key".into()),
            relative_path: "engine.ini".into(),
            line_prefix: "EngineVersion".into(),
            ..Default::default()
        }));
        let res_ini = rip_game_version_with_schema_and_docs(
            &tmp.0.to_string_lossy(),
            None,
            &schema_ini,
        )
        .unwrap();
        assert_eq!(res_ini, "2.14.9");

        let json_path = tmp.0.join("manifest.json");
        fs::write(&json_path, r#"{"meta":{"gameVersion":"v4.7.210-rc1"}}"#).unwrap();
        let schema_json = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            method: Some("json_key".into()),
            relative_path: "manifest.json".into(),
            json_key: Some("meta.gameVersion".into()),
            ..Default::default()
        }));
        let res_json = rip_game_version_with_schema_and_docs(
            &tmp.0.to_string_lossy(),
            None,
            &schema_json,
        )
        .unwrap();
        assert_eq!(res_json, "4.7.210-rc1");
    }

    #[test]
    fn test_binary_prefixed_docs_version_and_fallbacks() {
        let game_dir = TempTestDir::new("bin_game");
        let docs_dir = TempTestDir::new("bin_docs");
        let ver_bin = docs_dir.0.join("EngineVersion.dat");
        // Length-prefixed UTF-8 string preceded by arbitrary non-UTF8 header bytes
        let mut payload = vec![0xFFu8, 0x00, 0x11, 0x80];
        payload.extend_from_slice(b"1.108.329.1020");
        fs::write(&ver_bin, payload).unwrap();

        let schema = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            method: Some("plain_text".into()),
            relative_path: "missing_primary.txt".into(),
            fallback_paths: Some(vec!["EngineVersion.dat".into()]),
            ..Default::default()
        }));

        let res = rip_game_version_with_schema_and_docs(
            &game_dir.0.to_string_lossy(),
            Some(&docs_dir.0.to_string_lossy()),
            &schema,
        )
        .unwrap();
        assert_eq!(res, "1.108.329.1020");
    }

    #[test]
    fn test_xml_tag_and_regex_extraction() {
        let tmp = TempTestDir::new("xml_regex");
        fs::write(
            tmp.0.join("BuildInfo.xml"),
            "<Root><AppVersion>3.6.18</AppVersion></Root>",
        )
        .unwrap();
        fs::write(
            tmp.0.join("revision.log"),
            "Initializing Runtime Rev: build 9.12.4-hotfix (win64)",
        )
        .unwrap();

        let schema_xml = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            method: Some("xml_tag".into()),
            relative_path: "BuildInfo.xml".into(),
            xml_tag: Some("AppVersion".into()),
            ..Default::default()
        }));
        assert_eq!(
            rip_game_version_with_schema_and_docs(&tmp.0.to_string_lossy(), None, &schema_xml)
                .unwrap(),
            "3.6.18"
        );

        let schema_re = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            method: Some("regex".into()),
            relative_path: "revision.log".into(),
            regex_pattern: Some(r"build\s+([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9]+)?)".into()),
            ..Default::default()
        }));
        assert_eq!(
            rip_game_version_with_schema_and_docs(&tmp.0.to_string_lossy(), None, &schema_re)
                .unwrap(),
            "9.12.4-hotfix"
        );
    }

    #[test]
    fn test_unreal_and_steam_appmanifest_fallbacks() {
        let unreal_dir = TempTestDir::new("unreal");
        fs::create_dir_all(unreal_dir.0.join("Engine").join("Build")).unwrap();
        fs::write(
            unreal_dir.0.join("Engine").join("Build").join("Build.version"),
            r#"{"MajorVersion":5,"MinorVersion":4,"PatchVersion":2,"Changelist":33043543}"#,
        )
        .unwrap();
        // Zero hardcoded engine paths when no schema declares fallback_paths
        assert!(rip_game_version_with_schema_and_docs(
            &unreal_dir.0.to_string_lossy(),
            None,
            &None,
        )
        .is_err());

        let unreal_schema = Some(base_schema_with_ver(crate::schema::VersionExtraction {
            fallback_paths: Some(vec!["Engine/Build/Build.version".into()]),
            ..Default::default()
        }));
        let res_unreal = rip_game_version_with_schema_and_docs(
            &unreal_dir.0.to_string_lossy(),
            None,
            &unreal_schema,
        )
        .unwrap();
        assert_eq!(res_unreal, "5.4.2.33043543");

        let steam_root = TempTestDir::new("steamapps");
        let steamapps = steam_root.0.join("steamapps");
        let game_dir = steamapps.join("common").join("SampleGame");
        fs::create_dir_all(&game_dir).unwrap();
        fs::write(
            steamapps.join("appmanifest_1091500.acf"),
            "\"AppState\"\n{\n\t\"appid\"\t\t\"1091500\"\n\t\"buildid\"\t\t\"16842109\"\n}\n",
        )
        .unwrap();
        let mut steam_schema = crate::schema::GameSchema::default();
        steam_schema.steam_app_id = Some("1091500".into());
        let res_steam = rip_game_version_with_schema_and_docs(
            &game_dir.to_string_lossy(),
            None,
            &Some(steam_schema),
        )
        .unwrap();
        assert_eq!(res_steam, "build.16842109");
    }
}
