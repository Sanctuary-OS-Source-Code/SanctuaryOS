use crate::schema::{
    GameSchema, LoadOrderConfig, ManifestTargetDescriptor, SchemaModMetadataExtractor,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExtractedModMetadata {
    pub mod_path: String,
    pub mod_id: Option<String>,
    pub mod_name: Option<String>,
    pub mod_version: Option<String>,
    pub uuid: Option<String>,
    pub author: Option<String>,
    pub dependencies: Vec<String>,
    pub load_before: Vec<String>,
    pub load_after: Vec<String>,
    pub masters: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct OrderedDeployEntry {
    pub rel_path: String,
    pub file_name: String,
    pub stem: String,
    pub metadata: ExtractedModMetadata,
    pub tier_folder: Option<String>,
    pub tier_priority: i32,
    pub deployed_path: Option<PathBuf>,
}

fn xml_escape(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn json_get_dotted<'a>(val: &'a serde_json::Value, key_path: &str) -> Option<&'a serde_json::Value> {
    let mut cur = val;
    for seg in key_path.split('.').map(str::trim).filter(|s| !s.is_empty()) {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

fn json_val_to_string(val: &serde_json::Value) -> Option<String> {
    match val {
        serde_json::Value::String(s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn json_val_to_string_vec(val: &serde_json::Value) -> Vec<String> {
    match val {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| {
                if let Some(s) = item.as_str() {
                    let t = s.trim();
                    (!t.is_empty()).then(|| t.to_string())
                } else if let Some(obj) = item.as_object() {
                    obj.get("UniqueID")
                        .or_else(|| obj.get("id"))
                        .or_else(|| obj.get("uuid"))
                        .or_else(|| obj.get("packageId"))
                        .or_else(|| obj.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                } else {
                    None
                }
            })
            .collect(),
        serde_json::Value::String(s) => s
            .split(',')
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(String::from)
            .collect(),
        _ => Vec::new(),
    }
}

fn extract_xml_tag_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let lower_xml = xml.to_ascii_lowercase();
    let start_pos = lower_xml.find(&open.to_ascii_lowercase())?;
    let after_open = &xml[start_pos..];
    let gt_rel = after_open.find('>')?;
    let content_start = start_pos + gt_rel + 1;
    let close_rel = lower_xml[content_start..].find(&close.to_ascii_lowercase())?;
    let val = xml[content_start..content_start + close_rel].trim();
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

fn extract_lsx_attribute_value(xml: &str, attr_id: &str) -> Option<String> {
    let needle = format!("id=\"{}\"", attr_id);
    for line in xml.lines() {
        if line.contains(&needle) {
            if let Some(val_pos) = line.find("value=\"") {
                let rest = &line[val_pos + 7..];
                if let Some(end_q) = rest.find('"') {
                    let v = rest[..end_q].trim();
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_tes_masters_and_author(bytes: &[u8]) -> (Vec<String>, Option<String>) {
    let mut masters = Vec::new();
    let mut author: Option<String> = None;
    if bytes.len() < 24 {
        return (masters, author);
    }
    let header_magic = &bytes[0..4];
    let (hdr_len, data_size) = if header_magic == b"TES4" {
        let size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
        (24usize, size)
    } else if header_magic == b"TES3" {
        let size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
        (16usize, size)
    } else {
        return (masters, author);
    };

    let end = hdr_len.saturating_add(data_size).min(bytes.len());
    let mut pos = hdr_len;
    while pos + 6 <= end {
        let sub_tag = &bytes[pos..pos + 4];
        let sub_len = if header_magic == b"TES4" {
            u16::from_le_bytes([bytes[pos + 4], bytes[pos + 5]]) as usize
        } else {
            if pos + 8 > end {
                break;
            }
            u32::from_le_bytes([bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]]) as usize
        };
        let payload_start = if header_magic == b"TES4" { pos + 6 } else { pos + 8 };
        let payload_end = payload_start.saturating_add(sub_len).min(end);
        let slice = &bytes[payload_start..payload_end];
        let s = String::from_utf8_lossy(slice)
            .trim_end_matches('\0')
            .trim()
            .to_string();
        if sub_tag == b"MAST" && !s.is_empty() {
            if !masters.iter().any(|m: &String| m.eq_ignore_ascii_case(&s)) {
                masters.push(s);
            }
        } else if sub_tag == b"CNAM" && author.is_none() && !s.is_empty() {
            author = Some(s);
        }
        pos = payload_end;
        if payload_end <= payload_start && sub_len == 0 {
            continue;
        }
    }
    (masters, author)
}

fn parse_manifest_text_into_meta(
    text: &str,
    ext_lower: &str,
    extractor: &SchemaModMetadataExtractor,
    meta: &mut ExtractedModMetadata,
) {
    let clean = text.strip_prefix('\u{FEFF}').unwrap_or(text);
    if ext_lower == "json" {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean) {
            if let Some(k) = extractor.id_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k).and_then(json_val_to_string) {
                    meta.mod_id = Some(v);
                }
            }
            if let Some(k) = extractor.name_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k).and_then(json_val_to_string) {
                    meta.mod_name = Some(v);
                }
            }
            if let Some(k) = extractor.version_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k).and_then(json_val_to_string) {
                    meta.mod_version = Some(v);
                }
            }
            if let Some(k) = extractor.uuid_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k).and_then(json_val_to_string) {
                    meta.uuid = Some(v);
                }
            }
            if let Some(k) = extractor.author_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k).and_then(json_val_to_string) {
                    meta.author = Some(v);
                }
            }
            if let Some(k) = extractor.dependencies_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k) {
                    meta.dependencies.extend(json_val_to_string_vec(v));
                }
            }
            if let Some(k) = extractor.load_before_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k) {
                    meta.load_before.extend(json_val_to_string_vec(v));
                }
            }
            if let Some(k) = extractor.load_after_key.as_deref() {
                if let Some(v) = json_get_dotted(&val, k) {
                    meta.load_after.extend(json_val_to_string_vec(v));
                }
            }
            if let Some(mods_arr) = val.get("Mods").and_then(|v| v.as_array()) {
                if let Some(first) = mods_arr.first() {
                    if meta.uuid.is_none() {
                        meta.uuid = first.get("UUID").and_then(|v| v.as_str()).map(String::from);
                    }
                    if meta.mod_name.is_none() {
                        meta.mod_name = first.get("Name").and_then(|v| v.as_str()).map(String::from);
                    }
                    if meta.mod_id.is_none() {
                        meta.mod_id = first.get("Folder").and_then(|v| v.as_str()).map(String::from);
                    }
                    if meta.mod_version.is_none() {
                        meta.mod_version = json_val_to_string(
                            first.get("Version64").or_else(|| first.get("Version")).unwrap_or(&serde_json::Value::Null),
                        );
                    }
                }
            }
        }
        return;
    }

    if matches!(ext_lower, "xml" | "lsx" | "modinfo") {
        if let Some(k) = extractor.id_key.as_deref() {
            meta.mod_id = meta
                .mod_id
                .clone()
                .or_else(|| extract_lsx_attribute_value(clean, k))
                .or_else(|| extract_xml_tag_value(clean, k));
        }
        if let Some(k) = extractor.name_key.as_deref() {
            meta.mod_name = meta
                .mod_name
                .clone()
                .or_else(|| extract_lsx_attribute_value(clean, k))
                .or_else(|| extract_xml_tag_value(clean, k));
        }
        if let Some(k) = extractor.version_key.as_deref() {
            meta.mod_version = meta
                .mod_version
                .clone()
                .or_else(|| extract_lsx_attribute_value(clean, k))
                .or_else(|| extract_xml_tag_value(clean, k));
        }
        if let Some(k) = extractor.uuid_key.as_deref() {
            meta.uuid = meta
                .uuid
                .clone()
                .or_else(|| extract_lsx_attribute_value(clean, k))
                .or_else(|| extract_xml_tag_value(clean, k));
        }
        if let Some(k) = extractor.author_key.as_deref() {
            meta.author = meta
                .author
                .clone()
                .or_else(|| extract_lsx_attribute_value(clean, k))
                .or_else(|| extract_xml_tag_value(clean, k));
        }
        return;
    }

    // Simple INI / TOML key = value fallback
    for raw_line in clean.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') || trimmed.starts_with('[') {
            continue;
        }
        let Some((lhs, rhs)) = trimmed.split_once('=') else {
            continue;
        };
        let key = lhs.trim();
        let val = rhs.trim().trim_matches('"').trim_matches('\'').to_string();
        if val.is_empty() {
            continue;
        }
        if extractor.id_key.as_deref().map_or(false, |k| k.eq_ignore_ascii_case(key)) {
            meta.mod_id = Some(val);
        } else if extractor.name_key.as_deref().map_or(false, |k| k.eq_ignore_ascii_case(key)) {
            meta.mod_name = Some(val);
        } else if extractor.version_key.as_deref().map_or(false, |k| k.eq_ignore_ascii_case(key)) {
            meta.mod_version = Some(val);
        } else if extractor.author_key.as_deref().map_or(false, |k| k.eq_ignore_ascii_case(key)) {
            meta.author = Some(val);
        }
    }
}

pub fn extract_metadata_for_path(
    path: &Path,
    schema: &Option<GameSchema>,
) -> ExtractedModMetadata {
    let mut meta = ExtractedModMetadata {
        mod_path: path.to_string_lossy().to_string(),
        ..Default::default()
    };

    let Some(s) = schema.as_ref() else {
        return meta;
    };

    if let Some(extractor) = &s.mod_metadata_extractor {
        if let Some(bin_mode) = &extractor.binary_master_header {
            if matches!(bin_mode.to_ascii_lowercase().as_str(), "tes4" | "tes3") && path.is_file() {
                if let Ok(mut f) = fs::File::open(path) {
                    let mut buf = vec![0u8; 64 * 1024];
                    if let Ok(n) = f.read(&mut buf) {
                        buf.truncate(n);
                        let (masters, author) = extract_tes_masters_and_author(&buf);
                        if !masters.is_empty() {
                            meta.dependencies.extend(masters.clone());
                            meta.masters = masters;
                        }
                        if author.is_some() {
                            meta.author = author;
                        }
                    }
                }
            }
        }

        if !extractor.manifest_files.is_empty() {
            let search_dir = if path.is_dir() {
                Some(path.to_path_buf())
            } else {
                path.parent().map(|p| p.to_path_buf())
            };
            if let Some(dir) = search_dir {
                for mfile in &extractor.manifest_files {
                    let cand = dir.join(mfile);
                    if cand.is_file() {
                        if let Ok(text) = fs::read_to_string(&cand) {
                            let ext_l = cand
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("json")
                                .to_ascii_lowercase();
                            parse_manifest_text_into_meta(&text, &ext_l, extractor, &mut meta);
                        }
                    }
                }
            }
            if path.is_file() {
                let ext_l = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if matches!(ext_l.as_str(), "zip" | "jar" | "pak") {
                    if let Ok(f) = fs::File::open(path) {
                        if let Ok(mut archive) = zip::ZipArchive::new(f) {
                            for mfile in &extractor.manifest_files {
                                let m_lower = mfile.to_ascii_lowercase();
                                for idx in 0..archive.len() {
                                    if let Ok(mut entry) = archive.by_index(idx) {
                                        let e_name = entry.name().to_ascii_lowercase();
                                        let leaf = e_name.rsplit('/').next().unwrap_or(&e_name);
                                        if (e_name == m_lower || leaf == m_lower)
                                            && entry.size() <= 2 * 1024 * 1024
                                        {
                                            let mut text = String::new();
                                            if entry.read_to_string(&mut text).is_ok() {
                                                let e_ext = Path::new(leaf)
                                                    .extension()
                                                    .and_then(|e| e.to_str())
                                                    .unwrap_or("json")
                                                    .to_ascii_lowercase();
                                                parse_manifest_text_into_meta(
                                                    &text,
                                                    &e_ext,
                                                    extractor,
                                                    &mut meta,
                                                );
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if meta.mod_id.is_none() {
        meta.mod_id = path
            .file_stem()
            .and_then(|st| st.to_str())
            .map(String::from);
    }
    meta
}

#[tauri::command]
pub async fn extract_blueprint_mod_metadata(
    paths: Vec<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ExtractedModMetadata>, String> {
    let schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::with_capacity(paths.len());
        for raw in paths {
            let p = Path::new(&raw);
            if crate::utils::is_safe_user_file_path(p) && p.exists() {
                out.push(extract_metadata_for_path(p, &schema));
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn resolve_tier_priority(schema: &Option<GameSchema>, tier_folder: Option<&str>) -> i32 {
    let Some(tf) = tier_folder.map(str::trim).filter(|s| !s.is_empty()) else {
        return 0;
    };
    let clean_tf = tf.trim_start_matches('!');
    if let Some(tiers) = schema
        .as_ref()
        .and_then(|s| s.load_order.as_ref())
        .and_then(|lo| lo.priority_tiers.as_ref())
    {
        for tier in tiers {
            if tier.folder.trim().trim_start_matches('!').eq_ignore_ascii_case(clean_tf) {
                return tier.priority;
            }
        }
    }
    0
}

pub fn compute_load_order_prefix(
    order_pos: usize,
    lo: Option<&LoadOrderConfig>,
    tier_priority: i32,
) -> String {
    let sep = lo
        .and_then(|l| l.prefix_separator.as_deref())
        .unwrap_or("_");
    let fmt = lo
        .and_then(|l| l.prefix_format.as_deref())
        .filter(|s| !s.trim().is_empty());
    let base = lo.and_then(|l| l.index_base).unwrap_or(1) as usize;
    let use_tier = lo
        .and_then(|l| l.use_tier_priority_as_base)
        .unwrap_or(false);
    let idx_num = if use_tier && tier_priority > 0 {
        (tier_priority as usize).saturating_add(order_pos)
    } else {
        base.saturating_add(order_pos)
    };

    if let Some(fmt_str) = fmt {
        if fmt_str.contains("{index:03}") {
            fmt_str.replace("{index:03}", &format!("{:03}", idx_num))
        } else if fmt_str.contains("{index:02}") {
            fmt_str.replace("{index:02}", &format!("{:02}", idx_num))
        } else if fmt_str.contains("{index}") {
            fmt_str.replace("{index}", &idx_num.to_string())
        } else {
            format!("{:03}{}", idx_num, sep)
        }
    } else {
        format!("{:03}{}", idx_num, sep)
    }
}

pub fn apply_direction_to_entries(
    entries: &mut Vec<OrderedDeployEntry>,
    lo: Option<&LoadOrderConfig>,
) {
    let dir = lo
        .and_then(|l| l.direction.as_deref())
        .map(str::trim)
        .unwrap_or("higher_wins");
    if dir.eq_ignore_ascii_case("lower_wins") {
        entries.reverse();
    }
}

pub fn apply_timestamp_ordering(
    paths: &[PathBuf],
    step_secs: u64,
    reverse_order: bool,
) {
    if paths.is_empty() {
        return;
    }
    let step = step_secs.max(1) as i64;
    let base_epoch: i64 = 1_700_000_000;
    let ordered_iter: Box<dyn Iterator<Item = &PathBuf>> = if reverse_order {
        Box::new(paths.iter().rev())
    } else {
        Box::new(paths.iter())
    };
    for (i, p) in ordered_iter.enumerate() {
        if p.exists() {
            let ts = base_epoch + (i as i64) * step;
            let _ = filetime::set_file_mtime(p, filetime::FileTime::from_unix_time(ts, 0));
        }
    }
}

fn render_entry_template(tpl: &str, entry: &OrderedDeployEntry, index0: usize, index_base: usize) -> String {
    let mod_id = entry
        .metadata
        .mod_id
        .as_deref()
        .unwrap_or(entry.stem.as_str());
    let mod_name = entry
        .metadata
        .mod_name
        .as_deref()
        .unwrap_or(mod_id);
    let uuid = entry.metadata.uuid.as_deref().unwrap_or("");
    let ver = entry.metadata.mod_version.as_deref().unwrap_or("1.0.0");
    tpl.replace("{file}", &entry.rel_path)
        .replace("{name}", &entry.file_name)
        .replace("{stem}", &entry.stem)
        .replace("{id}", mod_id)
        .replace("{title}", mod_name)
        .replace("{uuid}", uuid)
        .replace("{version}", ver)
        .replace("{tier_folder}", entry.tier_folder.as_deref().unwrap_or(""))
        .replace("{priority}", &entry.tier_priority.to_string())
        .replace("{index0}", &index0.to_string())
        .replace("{index}", &(index0 + index_base).to_string())
}

fn write_ini_section_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
    index_base: usize,
) -> Result<(), String> {
    let section_name = desc
        .section
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Mods");
    let target_header = format!("[{}]", section_name);
    let tpl = desc
        .template
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or("{name}=1");

    let existing = fs::read_to_string(target_path).unwrap_or_default();
    let mut kept_lines: Vec<String> = Vec::new();
    let mut in_target_section = false;

    for raw_line in existing.lines() {
        let trimmed = raw_line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_target_section = trimmed.eq_ignore_ascii_case(&target_header);
            if in_target_section {
                continue;
            }
        }
        if !in_target_section {
            kept_lines.push(raw_line.to_string());
        }
    }

    if !kept_lines.is_empty() && !kept_lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        kept_lines.push(String::new());
    }
    kept_lines.push(target_header);
    for (idx, entry) in entries.iter().enumerate() {
        kept_lines.push(render_entry_template(tpl, entry, idx, index_base));
    }
    let out = format!("{}\n", kept_lines.join("\n"));
    crate::utils::atomic_write_bytes(target_path, out.as_bytes())
}

fn write_json_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
    is_object_array: bool,
) -> Result<(), String> {
    let mut items: Vec<serde_json::Value> = Vec::with_capacity(entries.len());
    for (idx, e) in entries.iter().enumerate() {
        let id = e
            .metadata
            .mod_id
            .clone()
            .unwrap_or_else(|| e.stem.clone());
        if is_object_array {
            items.push(serde_json::json!({
                "id": id,
                "name": e.metadata.mod_name.clone().unwrap_or_else(|| id.clone()),
                "file": e.rel_path,
                "enabled": true,
                "loadOrder": idx,
            }));
        } else {
            items.push(serde_json::Value::String(id));
        }
    }

    let root_val: serde_json::Value = if let Some(entry_key) = desc
        .entry_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
    {
        let mut obj = fs::read_to_string(target_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        obj.insert(entry_key.to_string(), serde_json::Value::Array(items));
        serde_json::Value::Object(obj)
    } else {
        serde_json::Value::Array(items)
    };

    let serialized = serde_json::to_string_pretty(&root_val).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_bytes(target_path, format!("{}\n", serialized).as_bytes())
}

fn write_xml_list_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
) -> Result<(), String> {
    let container_tag = desc
        .entry_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("activeMods");
    let item_tag = desc
        .section
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("li");

    let mut list_xml = String::new();
    list_xml.push_str(&format!("<{}>\n", container_tag));
    for e in entries {
        let val = e.metadata.mod_id.as_deref().unwrap_or(e.stem.as_str());
        list_xml.push_str(&format!("  <{0}>{1}</{0}>\n", item_tag, xml_escape(val)));
    }
    list_xml.push_str(&format!("</{}>", container_tag));

    let existing = fs::read_to_string(target_path).ok();
    let final_xml = if let Some(raw) = existing {
        let open_tok = format!("<{}", container_tag);
        let close_tok = format!("</{}>", container_tag);
        if let (Some(start), Some(end_rel)) = (raw.find(&open_tok), raw.find(&close_tok)) {
            let end_pos = end_rel + close_tok.len();
            if end_pos > start {
                format!("{}{}{}", &raw[..start], list_xml, &raw[end_pos..])
            } else {
                raw
            }
        } else if let Some(pos) = raw.rfind("</") {
            format!("{}\n{}\n{}", &raw[..pos], list_xml, &raw[pos..])
        } else {
            format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n{}\n", list_xml)
        }
    } else {
        let root_tag = desc
            .header
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("ModsConfigData");
        format!(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<{0}>\n{1}\n</{0}>\n",
            root_tag, list_xml
        )
    };
    crate::utils::atomic_write_bytes(target_path, final_xml.as_bytes())
}

fn write_bg3_modsettings_lsx(
    target_path: &Path,
    entries: &[OrderedDeployEntry],
) -> Result<(), String> {
    let mut mod_order_nodes = String::new();
    let mut mods_nodes = String::new();

    for e in entries {
        let uuid = e
            .metadata
            .uuid
            .as_deref()
            .filter(|u| !u.trim().is_empty())
            .unwrap_or(e.stem.as_str());
        let folder = e.metadata.mod_id.as_deref().unwrap_or(e.stem.as_str());
        let name = e.metadata.mod_name.as_deref().unwrap_or(folder);
        let ver64 = e.metadata.mod_version.as_deref().unwrap_or("36028797018963968");

        mod_order_nodes.push_str(&format!(
            "            <node id=\"Module\">\n              <attribute id=\"UUID\" type=\"guid\" value=\"{}\"/>\n            </node>\n",
            xml_escape(uuid)
        ));
        mods_nodes.push_str(&format!(
            "            <node id=\"ModuleShortDesc\">\n              <attribute id=\"Folder\" type=\"LSString\" value=\"{}\"/>\n              <attribute id=\"MD5\" type=\"LSString\" value=\"\"/>\n              <attribute id=\"Name\" type=\"LSString\" value=\"{}\"/>\n              <attribute id=\"UUID\" type=\"guid\" value=\"{}\"/>\n              <attribute id=\"Version64\" type=\"int64\" value=\"{}\"/>\n            </node>\n",
            xml_escape(folder),
            xml_escape(name),
            xml_escape(uuid),
            xml_escape(ver64)
        ));
    }

    let lsx = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<save>\n  <version major=\"4\" minor=\"0\" revision=\"9\" build=\"331\"/>\n  <region id=\"ModuleSettings\">\n    <node id=\"root\">\n      <children>\n        <node id=\"ModOrder\">\n          <children>\n{}          </children>\n        </node>\n        <node id=\"Mods\">\n          <children>\n{}          </children>\n        </node>\n      </children>\n    </node>\n  </region>\n</save>\n",
        mod_order_nodes, mods_nodes
    );
    crate::utils::atomic_write_bytes(target_path, lsx.as_bytes())
}

pub fn apply_load_order_outputs(
    schema: &Option<GameSchema>,
    mods_dir: &Path,
    docs_root: &Path,
    live_root: &Path,
    entries: &[OrderedDeployEntry],
) -> Vec<PathBuf> {
    let mut written_paths: Vec<PathBuf> = Vec::new();
    let lo_cfg = schema.as_ref().and_then(|s| s.load_order.as_ref());
    let index_base = lo_cfg.and_then(|l| l.index_base).unwrap_or(1) as usize;
    let strategy = crate::game_logic::get_load_order_strategy(schema);

    let mut effective_entries = entries.to_vec();
    apply_direction_to_entries(&mut effective_entries, lo_cfg);

    if strategy == "timestamp" {
        let step = lo_cfg.and_then(|l| l.timestamp_step_secs).unwrap_or(60);
        let deployed_list: Vec<PathBuf> = effective_entries
            .iter()
            .filter_map(|e| e.deployed_path.clone())
            .collect();
        apply_timestamp_ordering(&deployed_list, step, false);
    }

    if let Some(targets) = lo_cfg.and_then(|l| l.manifest_targets.as_ref()) {
        for desc in targets {
            let rel = desc.relative_path.trim().trim_start_matches(&['/', '\\'][..]);
            if rel.is_empty() {
                continue;
            }
            let base_root = match desc.root_source.to_ascii_lowercase().as_str() {
                "docs_path" | "user_data" | "documents" => docs_root,
                "live_path" | "game" | "engine" => live_root,
                _ => mods_dir,
            };
            if base_root.as_os_str().is_empty() {
                continue;
            }
            let target_path = crate::utils::resolve_case_insensitive_path(base_root, rel);
            if crate::utils::ensure_strict_descendant_of_roots(
                &target_path,
                std::slice::from_ref(&base_root.to_path_buf()),
            )
            .is_err()
                || !crate::utils::is_safe_user_file_path(&target_path)
            {
                continue;
            }
            if let Some(parent) = target_path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            let fmt_lower = desc.format.trim().to_ascii_lowercase();
            let res = match fmt_lower.as_str() {
                "plugins_asterisk" => {
                    let mut lines = vec!["# Automatically generated by Sanctuary OS".to_string()];
                    for e in &effective_entries {
                        lines.push(format!("*{}", e.file_name));
                    }
                    crate::utils::atomic_write_bytes(
                        &target_path,
                        format!("{}\n", lines.join("\n")).as_bytes(),
                    )
                }
                "ini_section" => write_ini_section_manifest(&target_path, desc, &effective_entries, index_base),
                "json_array" => write_json_manifest(&target_path, desc, &effective_entries, false),
                "json_object_array" => write_json_manifest(&target_path, desc, &effective_entries, true),
                "xml_list" => write_xml_list_manifest(&target_path, desc, &effective_entries),
                "bg3_modsettings_lsx" => write_bg3_modsettings_lsx(&target_path, &effective_entries),
                _ => {
                    let tpl = desc.template.as_deref().filter(|t| !t.trim().is_empty()).unwrap_or("{file}");
                    let mut parts = Vec::new();
                    if let Some(h) = desc.header.as_deref().filter(|s| !s.trim().is_empty()) {
                        parts.push(h.trim_end().to_string());
                    }
                    for (idx, e) in effective_entries.iter().enumerate() {
                        parts.push(render_entry_template(tpl, e, idx, index_base));
                    }
                    if let Some(f) = desc.footer.as_deref().filter(|s| !s.trim().is_empty()) {
                        parts.push(f.trim_start().to_string());
                    }
                    crate::utils::atomic_write_bytes(
                        &target_path,
                        format!("{}\n", parts.join("\n")).as_bytes(),
                    )
                }
            };

            if res.is_ok() {
                written_paths.push(target_path);
            }
        }
    }

    // Legacy single-manifest fallback (`manifest_list` or `folder_priority`)
    let ordered_files: Vec<String> = effective_entries
        .iter()
        .map(|e| e.rel_path.clone())
        .collect();
    if let Some((manifest_rel, content)) =
        crate::game_logic::generate_manifest_content(schema, &ordered_files)
    {
        let target = crate::utils::resolve_case_insensitive_path(mods_dir, &manifest_rel);
        if crate::utils::ensure_strict_descendant_of_roots(
            &target,
            std::slice::from_ref(&mods_dir.to_path_buf()),
        )
        .is_ok()
            && !written_paths.contains(&target)
        {
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if crate::utils::atomic_write_bytes(&target, content.as_bytes()).is_ok() {
                written_paths.push(target);
            }
        }
    }

    written_paths
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_entry(stem: &str, mod_id: &str, uuid: &str) -> OrderedDeployEntry {
        OrderedDeployEntry {
            rel_path: format!("{}.pak", stem),
            file_name: format!("{}.pak", stem),
            stem: stem.to_string(),
            metadata: ExtractedModMetadata {
                mod_path: String::new(),
                mod_id: Some(mod_id.to_string()),
                mod_name: Some(mod_id.to_string()),
                mod_version: Some("1.2.3".to_string()),
                uuid: Some(uuid.to_string()),
                author: Some("Tester".to_string()),
                dependencies: vec![],
                load_before: vec![],
                load_after: vec![],
                masters: vec![],
            },
            tier_folder: None,
            tier_priority: 500,
            deployed_path: None,
        }
    }

    #[test]
    fn test_direction_and_manifest_formats() {
        let mut entries = vec![
            mk_entry("AlphaMod", "alpha", "11111111-1111-1111-1111-111111111111"),
            mk_entry("BetaMod", "beta", "22222222-2222-2222-2222-222222222222"),
        ];
        let mut lo_cfg = LoadOrderConfig::default();
        lo_cfg.direction = Some("lower_wins".to_string());
        apply_direction_to_entries(&mut entries, Some(&lo_cfg));
        assert_eq!(entries[0].stem, "BetaMod");
        assert_eq!(entries[1].stem, "AlphaMod");

        let root = std::env::temp_dir().join("sanctuary_lo_engine_unit_test");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::create_dir_all(&root);

        // INI manifest preservation test
        let ini_path = root.join("game.ini");
        fs::write(&ini_path, "[Audio]\nVolume=80\n\n[Mods]\nOldMod=1\n").unwrap();
        let ini_desc = ManifestTargetDescriptor {
            root_source: "mods_path".into(),
            relative_path: "game.ini".into(),
            format: "ini_section".into(),
            section: Some("Mods".into()),
            entry_key: None,
            template: Some("{id}=1".into()),
            header: None,
            footer: None,
            encoding: None,
        };
        write_ini_section_manifest(&ini_path, &ini_desc, &entries, 1).unwrap();
        let ini_out = fs::read_to_string(&ini_path).unwrap();
        assert!(ini_out.contains("Volume=80"));
        assert!(!ini_out.contains("OldMod=1"));
        assert!(ini_out.contains("beta=1"));
        assert!(ini_out.contains("alpha=1"));

        // XML list manifest test
        let xml_path = root.join("ModsConfig.xml");
        let xml_desc = ManifestTargetDescriptor {
            root_source: "docs_path".into(),
            relative_path: "ModsConfig.xml".into(),
            format: "xml_list".into(),
            section: Some("li".into()),
            entry_key: Some("activeMods".into()),
            template: None,
            header: Some("ModsConfigData".into()),
            footer: None,
            encoding: None,
        };
        write_xml_list_manifest(&xml_path, &xml_desc, &entries).unwrap();
        let xml_out = fs::read_to_string(&xml_path).unwrap();
        assert!(xml_out.contains("<activeMods>"));
        assert!(xml_out.contains("<li>beta</li>"));

        // BG3 modsettings.lsx test
        let lsx_path = root.join("modsettings.lsx");
        write_bg3_modsettings_lsx(&lsx_path, &entries).unwrap();
        let lsx_out = fs::read_to_string(&lsx_path).unwrap();
        assert!(lsx_out.contains("<node id=\"ModOrder\">"));
        assert!(lsx_out.contains("22222222-2222-2222-2222-222222222222"));

        // TES4 MAST binary header extraction test
        let mut tes4 = Vec::new();
        tes4.extend_from_slice(b"TES4");
        let mut sub_data = Vec::new();
        sub_data.extend_from_slice(b"MAST");
        sub_data.extend_from_slice(&(11u16.to_le_bytes()));
        sub_data.extend_from_slice(b"Skyrim.esm\0");
        tes4.extend_from_slice(&(sub_data.len() as u32).to_le_bytes());
        tes4.extend_from_slice(&[0u8; 16]);
        tes4.extend_from_slice(&sub_data);
        let (masters, _) = extract_tes_masters_and_author(&tes4);
        assert_eq!(masters, vec!["Skyrim.esm".to_string()]);

        let _ = fs::remove_dir_all(&root);
    }
}
