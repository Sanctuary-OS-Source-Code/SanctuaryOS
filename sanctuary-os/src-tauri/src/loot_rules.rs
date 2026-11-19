use crate::load_order_engine::OrderedDeployEntry;
use crate::schema::GameSchema;
use crate::utils::{atomic_write_bytes, get_vault_root_dir, is_safe_user_file_path, resolve_case_insensitive_path};
use crc32fast::Hasher as Crc32Hasher;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

const MAX_EXTERNAL_RULES_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Default)]
pub struct ExternalDirtyEntry {
    pub crc_u32: u32,
    pub util: String,
    pub itm: u32,
    pub udr: u32,
    pub nav: u32,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedPluginRules {
    pub exact_name_lower: String,
    pub regex_pattern: Option<String>,
    pub after: Vec<String>,
    pub dirty: Vec<ExternalDirtyEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DirtyPluginDiagnostic {
    pub mod_name: String,
    pub crc_hex: String,
    pub itm_count: u32,
    pub udr_count: u32,
    pub nav_count: u32,
    pub cleaning_utility: String,
}

fn rules_cache_dir(vault_path: &str) -> PathBuf {
    get_vault_root_dir(vault_path).join(".sanctuary_rules_cache")
}

fn sanitize_source_id(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    if cleaned.is_empty() {
        "external_rules".to_string()
    } else {
        cleaned
    }
}

fn strip_quotes(raw: &str) -> String {
    let s = raw.trim();
    if s.len() >= 2
        && ((s.starts_with('\'') && s.ends_with('\''))
            || (s.starts_with('"') && s.ends_with('"')))
    {
        return s[1..s.len() - 1].trim().to_string();
    }
    s.to_string()
}

fn parse_crc_u32(raw: &str) -> Option<u32> {
    let clean = strip_quotes(raw);
    let trimmed = clean.trim();
    if let Some(hex_body) = trimmed.strip_prefix("0x").or_else(|| trimmed.strip_prefix("0X")) {
        u32::from_str_radix(hex_body.trim(), 16).ok()
    } else if trimmed.len() == 8 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        u32::from_str_radix(trimmed, 16).ok()
    } else {
        trimmed.parse::<u32>().ok()
    }
}

fn strip_yaml_comment(raw: &str) -> &str {
    let mut in_single = false;
    let mut in_double = false;
    let bytes = raw.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'\'' if !in_double => in_single = !in_single,
            b'"' if !in_single => in_double = !in_double,
            b'#' if !in_single && !in_double => {
                if i == 0 || bytes[i - 1].is_ascii_whitespace() {
                    return &raw[..i];
                }
            }
            _ => {}
        }
    }
    raw
}

/// Parses LOOT YAML masterlist/userlist or JSON rule blocks into `ParsedPluginRules`.
pub fn parse_external_loot_rules_text(raw: &str) -> Vec<ParsedPluginRules> {
    let trimmed_doc = raw.trim();
    if trimmed_doc.is_empty() {
        return Vec::new();
    }

    if trimmed_doc.starts_with('{') || trimmed_doc.starts_with('[') {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed_doc) {
            let items = val
                .as_array()
                .or_else(|| val.get("plugins").and_then(|p| p.as_array()));
            if let Some(arr) = items {
                let mut out = Vec::new();
                for item in arr {
                    let Some(name_raw) = item.get("name").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let mut p = ParsedPluginRules {
                        exact_name_lower: name_raw.trim().to_ascii_lowercase(),
                        regex_pattern: None,
                        after: Vec::new(),
                        dirty: Vec::new(),
                    };
                    for key in ["after", "req"] {
                        if let Some(deps) = item.get(key).and_then(|d| d.as_array()) {
                            for d in deps {
                                let dname = d
                                    .as_str()
                                    .or_else(|| d.get("name").and_then(|n| n.as_str()));
                                if let Some(s) = dname.map(str::trim).filter(|s| !s.is_empty()) {
                                    p.after.push(s.to_string());
                                }
                            }
                        }
                    }
                    if let Some(dirty_arr) = item.get("dirty").and_then(|d| d.as_array()) {
                        for dv in dirty_arr {
                            let crc_opt = dv
                                .get("crc")
                                .and_then(|c| {
                                    c.as_str()
                                        .and_then(parse_crc_u32)
                                        .or_else(|| c.as_u64().map(|n| n as u32))
                                });
                            if let Some(crc_u32) = crc_opt {
                                p.dirty.push(ExternalDirtyEntry {
                                    crc_u32,
                                    util: dv
                                        .get("util")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("xEdit")
                                        .trim()
                                        .to_string(),
                                    itm: dv.get("itm").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                    udr: dv.get("udr").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                    nav: dv.get("nav").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                });
                            }
                        }
                    }
                    out.push(p);
                }
                return out;
            }
        }
    }

    #[derive(PartialEq)]
    enum SubSection {
        None,
        After,
        Dirty,
    }

    let mut plugins: Vec<ParsedPluginRules> = Vec::new();
    let mut current: Option<ParsedPluginRules> = None;
    let mut cur_dirty: Option<ExternalDirtyEntry> = None;
    let mut sub_sec = SubSection::None;
    let mut seen_plugins_header = false;
    let mut in_plugins_section = false;
    let mut plugin_item_indent: Option<usize> = None;

    let flush_dirty = |cur: &mut Option<ParsedPluginRules>, cd: &mut Option<ExternalDirtyEntry>| {
        if let (Some(ref mut p), Some(d)) = (cur.as_mut(), cd.take()) {
            if d.crc_u32 != 0 {
                p.dirty.push(d);
            }
        }
    };
    let flush_plugin = |plugins: &mut Vec<ParsedPluginRules>,
                        cur: &mut Option<ParsedPluginRules>,
                        cd: &mut Option<ExternalDirtyEntry>| {
        flush_dirty(cur, cd);
        if let Some(p) = cur.take() {
            if !p.exact_name_lower.is_empty() && (!p.after.is_empty() || !p.dirty.is_empty()) {
                plugins.push(p);
            }
        }
    };

    for raw_line in trimmed_doc.lines() {
        let no_comment = strip_yaml_comment(raw_line);
        let trimmed = no_comment.trim();
        if trimmed.is_empty() || trimmed == "---" {
            continue;
        }
        let indent = raw_line.len() - raw_line.trim_start().len();

        if indent == 0 && !trimmed.starts_with('-') && trimmed.ends_with(':') {
            let section_key = trimmed.trim_end_matches(':').trim().to_ascii_lowercase();
            if section_key == "plugins" {
                seen_plugins_header = true;
                in_plugins_section = true;
                continue;
            } else if seen_plugins_header {
                flush_plugin(&mut plugins, &mut current, &mut cur_dirty);
                in_plugins_section = false;
                continue;
            }
        }

        if seen_plugins_header && !in_plugins_section {
            continue;
        }

        if let Some(after_dash) = trimmed.strip_prefix("- name:") {
            let is_top_plugin = plugin_item_indent.map_or(true, |pi| indent <= pi);
            if is_top_plugin || current.is_none() {
                flush_plugin(&mut plugins, &mut current, &mut cur_dirty);
                plugin_item_indent = Some(indent);
                let raw_name = strip_quotes(after_dash);
                let is_regex = raw_name.contains('*')
                    || raw_name.contains('(')
                    || raw_name.contains('[')
                    || raw_name.starts_with('^');
                current = Some(ParsedPluginRules {
                    exact_name_lower: raw_name.to_ascii_lowercase(),
                    regex_pattern: is_regex.then(|| format!("(?i)^{}$", raw_name)),
                    after: Vec::new(),
                    dirty: Vec::new(),
                });
                sub_sec = SubSection::None;
                continue;
            }
        }

        if let Some(after_dash_crc) = trimmed.strip_prefix("- crc:") {
            if sub_sec == SubSection::Dirty {
                flush_dirty(&mut current, &mut cur_dirty);
                if let Some(crc_u32) = parse_crc_u32(after_dash_crc) {
                    cur_dirty = Some(ExternalDirtyEntry {
                        crc_u32,
                        util: "xEdit".to_string(),
                        ..Default::default()
                    });
                }
                continue;
            }
        }

        let Some(ref mut p) = current else {
            continue;
        };

        if trimmed.starts_with("after:") || trimmed.starts_with("req:") {
            flush_dirty(&mut current, &mut cur_dirty);
            let rhs = trimmed.split_once(':').map(|(_, r)| r.trim()).unwrap_or("");
            if rhs.starts_with('[') && rhs.ends_with(']') {
                for item in rhs[1..rhs.len() - 1].split(',') {
                    let s = strip_quotes(item);
                    if !s.is_empty() {
                        current.as_mut().unwrap().after.push(s);
                    }
                }
                sub_sec = SubSection::None;
            } else if !rhs.is_empty() {
                let s = strip_quotes(rhs);
                if !s.is_empty() {
                    current.as_mut().unwrap().after.push(s);
                }
                sub_sec = SubSection::None;
            } else {
                sub_sec = SubSection::After;
            }
            continue;
        }

        if trimmed.starts_with("dirty:") {
            flush_dirty(&mut current, &mut cur_dirty);
            sub_sec = SubSection::Dirty;
            continue;
        }

        match sub_sec {
            SubSection::After => {
                if let Some(rest) = trimmed.strip_prefix('-') {
                    let body = rest.trim();
                    let dep_str = if let Some(n) = body.strip_prefix("name:") {
                        strip_quotes(n)
                    } else {
                        strip_quotes(body)
                    };
                    if !dep_str.is_empty() {
                        p.after.push(dep_str);
                    }
                } else if !trimmed.starts_with('-') && trimmed.contains(':') {
                    sub_sec = SubSection::None;
                }
            }
            SubSection::Dirty => {
                if let Some((k, v)) = trimmed.split_once(':') {
                    let kl = k.trim().trim_start_matches('-').trim().to_ascii_lowercase();
                    let val_clean = strip_quotes(v);
                    let cd = cur_dirty.get_or_insert_with(|| ExternalDirtyEntry {
                        util: "xEdit".to_string(),
                        ..Default::default()
                    });
                    match kl.as_str() {
                        "crc" => {
                            if let Some(c) = parse_crc_u32(&val_clean) {
                                cd.crc_u32 = c;
                            }
                        }
                        "util" => {
                            if !val_clean.is_empty() {
                                cd.util = val_clean;
                            }
                        }
                        "itm" => cd.itm = val_clean.parse::<u32>().unwrap_or(0),
                        "udr" => cd.udr = val_clean.parse::<u32>().unwrap_or(0),
                        "nav" => cd.nav = val_clean.parse::<u32>().unwrap_or(0),
                        _ => {}
                    }
                }
            }
            SubSection::None => {}
        }
    }

    flush_plugin(&mut plugins, &mut current, &mut cur_dirty);
    plugins
}

fn compute_file_crc32(path: &Path) -> Option<u32> {
    let f = File::open(path).ok()?;
    let mut reader = BufReader::with_capacity(64 * 1024, f);
    let mut hasher = Crc32Hasher::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = reader.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize())
}

fn collect_external_rule_files(
    schema: &Option<GameSchema>,
    vault_path: &str,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Some(sources) = schema
        .as_ref()
        .and_then(|s| s.load_order.as_ref())
        .and_then(|lo| lo.external_rules_sources.as_ref())
    else {
        return files;
    };

    let local_appdata = crate::load_order_engine::resolve_local_appdata_root(schema, live_root);
    let cache_dir = (!vault_path.trim().is_empty()).then(|| rules_cache_dir(vault_path));

    for src in sources {
        if let Some(ref cdir) = cache_dir {
            let sid = sanitize_source_id(&src.id);
            for ext in ["yaml", "yml", "json"] {
                let p = cdir.join(format!("{}.{}", sid, ext));
                if p.is_file() && !files.contains(&p) {
                    files.push(p);
                }
            }
        }
        if let Some(ref rels) = src.relative_paths {
            for rel in rels {
                let clean = rel.trim().trim_matches(&['/', '\\'][..]);
                if clean.is_empty() {
                    continue;
                }
                let search_bases = [
                    local_appdata.as_deref(),
                    (!docs_root.as_os_str().is_empty()).then_some(docs_root),
                    (!mods_dir.as_os_str().is_empty()).then_some(mods_dir),
                ];
                for base_opt in search_bases.into_iter().flatten() {
                    let cand = resolve_case_insensitive_path(base_opt, clean);
                    if cand.is_file() && is_safe_user_file_path(&cand) && !files.contains(&cand) {
                        files.push(cand);
                        break;
                    }
                }
            }
        }
    }
    files
}

/// Applies external LOOT rules (`after`/`req` DAG edges) and computes CRC32 dirty-plugin diagnostics.
pub fn apply_external_rules_and_dirty_checks(
    entries: &mut [OrderedDeployEntry],
    schema: &Option<GameSchema>,
    vault_path: &str,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
) -> Vec<DirtyPluginDiagnostic> {
    let rule_files = collect_external_rule_files(schema, vault_path, mods_dir, docs_root, live_root);
    if rule_files.is_empty() {
        return Vec::new();
    }

    let mut exact_rules: HashMap<String, ParsedPluginRules> = HashMap::new();
    let mut regex_rules: Vec<(regex::Regex, ParsedPluginRules)> = Vec::new();

    for rf in rule_files {
        let Ok(meta) = fs::metadata(&rf) else { continue; };
        if meta.len() == 0 || meta.len() > MAX_EXTERNAL_RULES_BYTES as u64 {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&rf) else { continue; };
        for parsed in parse_external_loot_rules_text(&raw) {
            if let Some(ref pat) = parsed.regex_pattern {
                if let Ok(rx) = regex::Regex::new(pat) {
                    regex_rules.push((rx, parsed));
                }
            } else {
                let key = parsed.exact_name_lower.clone();
                let entry = exact_rules.entry(key).or_insert_with(|| ParsedPluginRules {
                    exact_name_lower: parsed.exact_name_lower.clone(),
                    regex_pattern: None,
                    after: Vec::new(),
                    dirty: Vec::new(),
                });
                entry.after.extend(parsed.after);
                entry.dirty.extend(parsed.dirty);
            }
        }
    }

    let mut dirty_diags = Vec::new();
    let mut dirty_seen = HashSet::new();

    for entry in entries.iter_mut() {
        let fname_low = entry.file_name.trim().to_ascii_lowercase();
        let mut matched_rules: Vec<&ParsedPluginRules> = Vec::new();
        if let Some(er) = exact_rules.get(&fname_low) {
            matched_rules.push(er);
        }
        for (rx, rr) in &regex_rules {
            if rx.is_match(&entry.file_name) {
                matched_rules.push(rr);
            }
        }
        if matched_rules.is_empty() {
            continue;
        }

        let mut after_seen: HashSet<String> = entry
            .metadata
            .load_after
            .iter()
            .map(|s| s.to_ascii_lowercase())
            .collect();
        for mr in &matched_rules {
            for dep in &mr.after {
                let dlow = dep.to_ascii_lowercase();
                if after_seen.insert(dlow) {
                    entry.metadata.load_after.push(dep.clone());
                }
            }
        }

        let has_dirty_sigs = matched_rules.iter().any(|r| !r.dirty.is_empty());
        if !has_dirty_sigs {
            continue;
        }
        let Some(ref deployed) = entry.deployed_path else {
            continue;
        };
        if !deployed.is_file() {
            continue;
        }
        let Some(crc) = compute_file_crc32(deployed) else {
            continue;
        };

        'dirty_lookup: for mr in &matched_rules {
            for d in &mr.dirty {
                if d.crc_u32 == crc && dirty_seen.insert(fname_low.clone()) {
                    let itm_count = if d.itm > 0 {
                        d.itm
                    } else {
                        crate::commands::radar_containers::count_itm_records_against_masters(
                            deployed,
                        ) as u32
                    };
                    dirty_diags.push(DirtyPluginDiagnostic {
                        mod_name: entry.file_name.clone(),
                        crc_hex: format!("0x{:08X}", crc),
                        itm_count,
                        udr_count: d.udr,
                        nav_count: d.nav,
                        cleaning_utility: if d.util.is_empty() {
                            "xEdit".to_string()
                        } else {
                            d.util.clone()
                        },
                    });
                    break 'dirty_lookup;
                }
            }
        }
    }

    dirty_diags
}

/// Downloads configured HTTPS LOOT masterlists/userlists into `{Vault}/.sanctuary_rules_cache/` safely.
#[tauri::command]
pub async fn sync_external_loot_rules(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<usize, String> {
    let schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let coords = crate::commands::state_ops::get_saved_coordinates();
    if coords.vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let Some(sources) = schema
        .as_ref()
        .and_then(|s| s.load_order.as_ref())
        .and_then(|lo| lo.external_rules_sources.as_ref())
    else {
        return Ok(0);
    };

    let cdir = rules_cache_dir(&coords.vault_path);
    fs::create_dir_all(&cdir).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("SanctuaryOS/0.6")
        .build()
        .map_err(|e| e.to_string())?;

    let mut synced = 0usize;
    for src in sources {
        let Some(ref raw_url) = src.url.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let parsed = crate::commands::edge_network::validate_safe_https_url(raw_url).await?;
        let mut resp = client
            .get(parsed)
            .send()
            .await
            .map_err(|e| format!("Failed downloading external rules '{}': {}", src.id, e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "External rules source '{}' returned HTTP {}",
                src.id,
                resp.status()
            ));
        }

        let mut buf: Vec<u8> = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            if buf.len().saturating_add(chunk.len()) > MAX_EXTERNAL_RULES_BYTES {
                return Err(format!(
                    "External rules payload '{}' exceeded 16 MiB safety limit.",
                    src.id
                ));
            }
            buf.extend_from_slice(&chunk);
        }

        let sid = sanitize_source_id(&src.id);
        let ext = if src
            .source_type
            .as_deref()
            .map_or(false, |t| t.eq_ignore_ascii_case("json"))
        {
            "json"
        } else {
            "yaml"
        };
        atomic_write_bytes(&cdir.join(format!("{}.{}", sid, ext)), &buf)?;
        synced += 1;
    }

    Ok(synced)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load_order_engine::ExtractedModMetadata;
    use crate::schema::{LoadOrderConfig, SchemaExternalRulesSource};

    #[test]
    fn loot_yaml_rules_inject_dag_edges_and_detect_dirty_crc32() {
        let root = std::env::temp_dir().join(format!("sanctuary_loot_test_{}", uuid::Uuid::new_v4()));
        let vault_root = root.join("Vault");
        let mods_dir = root.join("Mods");
        let docs_root = root.join("Docs");
        let cache_dir = rules_cache_dir(&vault_root.to_string_lossy());
        fs::create_dir_all(&cache_dir).unwrap();
        fs::create_dir_all(&mods_dir).unwrap();
        fs::create_dir_all(&docs_root).unwrap();

        let dirty_bytes = b"MOD_PLUGIN_DIRTY_PAYLOAD_V1";
        let dirty_plugin = mods_dir.join("DirtyPatch.esp");
        let clean_dep = mods_dir.join("CoreOverhaul.esp");
        fs::write(&dirty_plugin, dirty_bytes).unwrap();
        fs::write(&clean_dep, b"clean").unwrap();

        let crc = compute_file_crc32(&dirty_plugin).unwrap();
        let masterlist_yaml = format!(
            "plugins:\n  - name: 'DirtyPatch.esp'\n    after:\n      - 'CoreOverhaul.esp'\n    dirty:\n      - crc: 0x{:08X}\n        util: 'SSEEdit'\n        itm: 4\n        udr: 1\n",
            crc
        );
        fs::write(cache_dir.join("loot_master.yaml"), masterlist_yaml).unwrap();

        let schema = Some(GameSchema {
            id: Some("test_loot".into()),
            game_id: "test_loot".into(),
            load_order: Some(LoadOrderConfig {
                external_rules_sources: Some(vec![SchemaExternalRulesSource {
                    id: "loot_master".into(),
                    label: Some("Masterlist".into()),
                    source_type: Some("loot_yaml".into()),
                    url: None,
                    relative_paths: None,
                }]),
                ..Default::default()
            }),
            ..Default::default()
        });

        let mut entries = vec![
            OrderedDeployEntry {
                rel_path: "DirtyPatch.esp".into(),
                file_name: "DirtyPatch.esp".into(),
                stem: "DirtyPatch".into(),
                metadata: ExtractedModMetadata::default(),
                tier_folder: None,
                tier_priority: 0,
                deployed_path: Some(dirty_plugin),
            },
            OrderedDeployEntry {
                rel_path: "CoreOverhaul.esp".into(),
                file_name: "CoreOverhaul.esp".into(),
                stem: "CoreOverhaul".into(),
                metadata: ExtractedModMetadata::default(),
                tier_folder: None,
                tier_priority: 0,
                deployed_path: Some(clean_dep),
            },
        ];

        let dirty_diags = apply_external_rules_and_dirty_checks(
            &mut entries,
            &schema,
            &vault_root.to_string_lossy(),
            &mods_dir,
            &docs_root,
            &root,
        );
        assert!(entries[0].metadata.load_after.contains(&"CoreOverhaul.esp".to_string()));
        assert_eq!(dirty_diags.len(), 1);
        assert_eq!(dirty_diags[0].mod_name, "DirtyPatch.esp");
        assert_eq!(dirty_diags[0].itm_count, 4);
        assert_eq!(dirty_diags[0].udr_count, 1);
        assert_eq!(dirty_diags[0].cleaning_utility, "SSEEdit");

        let _ = fs::remove_dir_all(&root);
    }
}
