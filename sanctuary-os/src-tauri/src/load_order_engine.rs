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
    #[serde(default)]
    pub publish_handle: Option<String>,
    pub author: Option<String>,
    #[serde(default)]
    pub header_flags: u32,
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

pub const TES4_FLAG_ESM: u32 = 0x0001;
pub const TES4_FLAG_LIGHT: u32 = 0x0200;
pub const TES4_FLAG_MEDIUM: u32 = 0x0800;

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

fn extract_tes_masters_and_author(bytes: &[u8]) -> (Vec<String>, Option<String>, u32) {
    extract_tes_masters_and_author_with_hint(bytes, false)
}

fn extract_tes_masters_and_author_with_hint(
    bytes: &[u8],
    force_tes4_20: bool,
) -> (Vec<String>, Option<String>, u32) {
    let mut masters = Vec::new();
    let mut author: Option<String> = None;
    if bytes.len() < 16 {
        return (masters, author, 0);
    }
    let header_magic = &bytes[0..4];
    let (hdr_len, data_size, header_flags) = if header_magic == b"TES4" {
        if bytes.len() < 20 {
            return (masters, author, 0);
        }
        let size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
        let flags = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let is_legacy_20b_header = force_tes4_20 || (bytes.len() >= 24 && &bytes[20..24] == b"HEDR");
        let len = if is_legacy_20b_header { 20usize } else { 24usize };
        if bytes.len() < len {
            return (masters, author, 0);
        }
        (len, size, flags)
    } else if header_magic == b"TES3" {
        let size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
        (16usize, size, 0u32)
    } else {
        return (masters, author, 0);
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
    (masters, author, header_flags)
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
                    if meta.publish_handle.is_none() {
                        meta.publish_handle = json_val_to_string(
                            first.get("PublishHandle").unwrap_or(&serde_json::Value::Null),
                        );
                    }
                }
            }
        }
        return;
    }

    if matches!(ext_lower, "xml" | "lsx" | "modinfo") {
        if meta.publish_handle.is_none() {
            meta.publish_handle = extract_lsx_attribute_value(clean, "PublishHandle");
        }
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
        if let Ok(doc) = roxmltree::Document::parse(clean) {
            for dep_region in doc.descendants().filter(|n| {
                n.has_tag_name("node")
                    && n.attribute("id")
                        .map_or(false, |id| id.eq_ignore_ascii_case("Dependencies"))
            }) {
                for desc_node in dep_region.descendants().filter(|n| {
                    n.has_tag_name("node")
                        && n.attribute("id")
                            .map_or(false, |id| id.eq_ignore_ascii_case("ModuleShortDesc"))
                }) {
                    for attr_node in desc_node.children().filter(|n| n.has_tag_name("attribute")) {
                        let attr_id = attr_node.attribute("id").unwrap_or("");
                        if matches!(attr_id, "UUID" | "Folder" | "Name") {
                            if let Some(val) = attr_node
                                .attribute("value")
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                            {
                                if !meta
                                    .dependencies
                                    .iter()
                                    .any(|d| d.eq_ignore_ascii_case(val))
                                {
                                    meta.dependencies.push(val.to_string());
                                }
                            }
                        }
                    }
                }
            }

            let extract_xml_tag_list = |tag_key_opt: Option<&str>, target: &mut Vec<String>| {
                let Some(tag_key) = tag_key_opt.map(str::trim).filter(|s| !s.is_empty()) else {
                    return;
                };
                for node in doc
                    .descendants()
                    .filter(|n| n.tag_name().name().eq_ignore_ascii_case(tag_key))
                {
                    for child in node.descendants() {
                        if matches!(
                            child.tag_name().name().to_ascii_lowercase().as_str(),
                            "li" | "packageid"
                        ) {
                            if let Some(txt) = child.text().map(str::trim).filter(|s| !s.is_empty())
                            {
                                if !target.iter().any(|x| x.eq_ignore_ascii_case(txt)) {
                                    target.push(txt.to_string());
                                }
                            }
                        }
                    }
                }
            };
            extract_xml_tag_list(extractor.dependencies_key.as_deref(), &mut meta.dependencies);
            extract_xml_tag_list(extractor.load_before_key.as_deref(), &mut meta.load_before);
            extract_xml_tag_list(extractor.load_after_key.as_deref(), &mut meta.load_after);
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
            let mode_lower = bin_mode.to_ascii_lowercase();
            if matches!(mode_lower.as_str(), "tes4" | "tes4_20" | "tes3") && path.is_file() {
                if let Ok(mut f) = fs::File::open(path) {
                    let mut buf = vec![0u8; 64 * 1024];
                    if let Ok(n) = f.read(&mut buf) {
                        buf.truncate(n);
                        let (masters, author, flags) = extract_tes_masters_and_author_with_hint(
                            &buf,
                            mode_lower == "tes4_20",
                        );
                        meta.header_flags = flags;
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
                        let file_len = f.metadata().map(|m| m.len()).unwrap_or(0);
                        let mut magic = [0u8; 4];
                        let mut reader = std::io::BufReader::new(f);
                        let is_lspk = reader.read_exact(&mut magic).is_ok() && &magic == b"LSPK";
                        if is_lspk {
                            let lspk_entries =
                                crate::commands::radar_containers::parse_lspk_index(&mut reader, file_len);
                            for mfile in &extractor.manifest_files {
                                let m_lower = mfile.to_ascii_lowercase();
                                if let Some(found_entry) = lspk_entries.iter().find(|e| {
                                    let en = e.name.to_ascii_lowercase();
                                    let leaf = en.rsplit('/').next().unwrap_or(&en);
                                    en == m_lower || leaf == m_lower
                                }) {
                                    if let Some(bytes) = crate::commands::radar_containers::read_lspk_entry_bytes(
                                        &mut reader,
                                        file_len,
                                        found_entry,
                                    ) {
                                        if let Ok(text) = String::from_utf8(bytes) {
                                            let leaf = found_entry
                                                .name
                                                .rsplit('/')
                                                .next()
                                                .unwrap_or(&found_entry.name);
                                            let e_ext = Path::new(leaf)
                                                .extension()
                                                .and_then(|e| e.to_str())
                                                .unwrap_or("lsx")
                                                .to_ascii_lowercase();
                                            parse_manifest_text_into_meta(
                                                &text,
                                                &e_ext,
                                                extractor,
                                                &mut meta,
                                            );
                                        }
                                    }
                                    break;
                                }
                            }
                        } else if let Ok(f_zip) = fs::File::open(path) {
                            if let Ok(mut archive) = zip::ZipArchive::new(f_zip) {
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

fn render_entry_template(
    tpl: &str,
    entry: &OrderedDeployEntry,
    index0: usize,
    index_base: usize,
) -> String {
    let mod_id = entry
        .metadata
        .mod_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(entry.stem.as_str());
    let mod_name = entry
        .metadata
        .mod_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(mod_id);
    let uuid = entry.metadata.uuid.as_deref().unwrap_or("");
    let ver = entry
        .metadata
        .mod_version
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("1.0.0");
    let version64 = entry
        .metadata
        .mod_version
        .as_deref()
        .filter(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or("36028797018963968");
    let publish_handle = entry.metadata.publish_handle.as_deref().unwrap_or("0");
    let idx_val = index0.saturating_add(index_base);
    let idx1_val = index0.saturating_add(1);
    let folder = mod_id;

    tpl.replace("{xml_file}", &xml_escape(&entry.rel_path))
        .replace("{xml_name}", &xml_escape(&entry.file_name))
        .replace("{xml_stem}", &xml_escape(&entry.stem))
        .replace("{xml_id}", &xml_escape(mod_id))
        .replace("{xml_folder}", &xml_escape(folder))
        .replace("{xml_title}", &xml_escape(mod_name))
        .replace("{xml_uuid}", &xml_escape(uuid))
        .replace("{xml_publish_handle}", &xml_escape(publish_handle))
        .replace("{xml_version64}", &xml_escape(version64))
        .replace("{file}", &entry.rel_path)
        .replace("{name}", &entry.file_name)
        .replace("{stem}", &entry.stem)
        .replace("{id}", mod_id)
        .replace("{folder}", folder)
        .replace("{title}", mod_name)
        .replace("{uuid}", uuid)
        .replace("{version}", ver)
        .replace("{version64}", version64)
        .replace("{publish_handle}", publish_handle)
        .replace("{tier_folder}", entry.tier_folder.as_deref().unwrap_or(""))
        .replace("{priority}", &entry.tier_priority.to_string())
        .replace("{index0}", &index0.to_string())
        .replace("{index1}", &idx1_val.to_string())
        .replace("{index}", &idx_val.to_string())
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

fn is_valid_uuid_like(raw: &str) -> bool {
    let s = raw.trim();
    if s.len() != 36 {
        return false;
    }
    let b = s.as_bytes();
    for (idx, ch) in b.iter().enumerate() {
        if matches!(idx, 8 | 13 | 18 | 23) {
            if *ch != b'-' {
                return false;
            }
        } else if !ch.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

fn escape_toml_basic_string(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('"', "\\\"")
}

fn write_toml_array_table_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
) -> Result<(), String> {
    let entry_key = desc
        .entry_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .unwrap_or("mods");
    let existing = fs::read_to_string(target_path).unwrap_or_default();
    let mut kept_lines: Vec<String> = Vec::new();
    let mut skipping_bracket_array = false;
    let mut skipping_array_tables = false;
    let array_assign_prefix = format!("{} =", entry_key);
    let array_assign_compact = format!("{}=", entry_key);
    let array_table_hdr = format!("[[{}]]", entry_key);

    for raw_line in existing.lines() {
        let trimmed = raw_line.trim();
        if skipping_bracket_array {
            if trimmed == "]" || trimmed.ends_with(']') {
                skipping_bracket_array = false;
            }
            continue;
        }
        if skipping_array_tables {
            if trimmed.starts_with('[') && !trimmed.eq_ignore_ascii_case(&array_table_hdr) {
                skipping_array_tables = false;
            } else {
                continue;
            }
        }
        if (trimmed.starts_with(&array_assign_prefix) || trimmed.starts_with(&array_assign_compact))
            && trimmed.contains('[')
        {
            if !trimmed.contains(']') {
                skipping_bracket_array = true;
            }
            continue;
        }
        if trimmed.eq_ignore_ascii_case(&array_table_hdr) {
            skipping_array_tables = true;
            continue;
        }
        kept_lines.push(raw_line.to_string());
    }

    while kept_lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        kept_lines.pop();
    }

    let mut out = if kept_lines.is_empty() {
        String::new()
    } else {
        format!("{}\n\n", kept_lines.join("\n"))
    };
    out.push_str(&format!("{} = [\n", entry_key));
    for base in &desc.base_entries {
        let bname = if !base.name.trim().is_empty() {
            base.name.trim()
        } else {
            base.folder.trim()
        };
        if !bname.is_empty() {
            let bpath = if base.folder.trim().is_empty() {
                bname
            } else {
                base.folder.trim()
            };
            out.push_str(&format!(
                "    {{ enabled = true, name = \"{}\", path = \"{}\" }},\n",
                escape_toml_basic_string(bname),
                escape_toml_basic_string(bpath),
            ));
        }
    }
    for e in entries {
        let mod_name = e
            .metadata
            .mod_name
            .as_deref()
            .or(e.metadata.mod_id.as_deref())
            .unwrap_or(e.stem.as_str());
        let rel = e.rel_path.replace('\\', "/");
        out.push_str(&format!(
            "    {{ enabled = true, name = \"{}\", path = \"{}\" }},\n",
            escape_toml_basic_string(mod_name),
            escape_toml_basic_string(&rel),
        ));
    }
    out.push_str("]\n");
    crate::utils::atomic_write_bytes(target_path, out.as_bytes())
}

fn write_enabled_object_list_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
) -> Result<(), String> {
    let entry_key = desc
        .entry_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .unwrap_or("mods");

    let mut items: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();

    for base in &desc.base_entries {
        let base_id = base
            .id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| (!base.name.trim().is_empty()).then_some(base.name.trim()))
            .or_else(|| (!base.folder.trim().is_empty()).then_some(base.folder.trim()))
            .unwrap_or("");
        if !base_id.is_empty() && seen.insert(base_id.to_ascii_lowercase()) {
            items.push(serde_json::json!({
                "name": base_id,
                "enabled": true,
            }));
        }
    }

    for e in entries {
        let mod_id = e
            .metadata
            .mod_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(e.stem.as_str());
        if seen.insert(mod_id.to_ascii_lowercase()) {
            items.push(serde_json::json!({
                "name": mod_id,
                "enabled": true,
            }));
        }
    }

    let mut obj = serde_json::Map::new();
    obj.insert(entry_key.to_string(), serde_json::Value::Array(items));
    let serialized = serde_json::to_string_pretty(&serde_json::Value::Object(obj))
        .map_err(|e| e.to_string())?;
    crate::utils::atomic_write_bytes(target_path, format!("{}\n", serialized).as_bytes())
}

fn write_declarative_template_manifest(
    target_path: &Path,
    desc: &ManifestTargetDescriptor,
    entries: &[OrderedDeployEntry],
    index_base: usize,
) -> Result<(), String> {
    let doc_header = desc
        .document_header
        .as_deref()
        .or(desc.header.as_deref())
        .unwrap_or("");
    let item_tpl = desc
        .entry_template
        .as_deref()
        .or(desc.template.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or("{file}\n");
    let sec_tpl = desc.secondary_list_template.as_deref();
    let doc_footer = desc
        .document_footer
        .as_deref()
        .or(desc.footer.as_deref())
        .unwrap_or("");

    let needs_uuid = desc.require_uuid.unwrap_or(false)
        || item_tpl.contains("{uuid}")
        || item_tpl.contains("{xml_uuid}")
        || sec_tpl.map_or(false, |t| t.contains("{uuid}") || t.contains("{xml_uuid}"));

    let mut effective: Vec<OrderedDeployEntry> = Vec::new();
    let mut seen_uuids = std::collections::HashSet::<String>::new();

    for base in &desc.base_entries {
        let base_uuid = base.uuid.trim();
        if needs_uuid {
            if !is_valid_uuid_like(base_uuid) || !seen_uuids.insert(base_uuid.to_ascii_lowercase())
            {
                continue;
            }
        }
        let folder = if !base.folder.trim().is_empty() {
            base.folder.trim().to_string()
        } else if let Some(ref bid) = base.id {
            bid.trim().to_string()
        } else {
            base.name.trim().to_string()
        };
        let title = if !base.name.trim().is_empty() {
            base.name.trim().to_string()
        } else {
            folder.clone()
        };
        effective.push(OrderedDeployEntry {
            rel_path: folder.clone(),
            file_name: folder.clone(),
            stem: folder.clone(),
            metadata: ExtractedModMetadata {
                mod_id: Some(folder),
                mod_name: Some(title),
                mod_version: base.version64.clone(),
                uuid: (!base_uuid.is_empty()).then(|| base_uuid.to_string()),
                publish_handle: base.publish_handle.clone(),
                ..Default::default()
            },
            ..Default::default()
        });
    }

    for e in entries {
        if needs_uuid {
            let Some(uuid_raw) = e.metadata.uuid.as_deref().map(str::trim) else {
                continue;
            };
            if !is_valid_uuid_like(uuid_raw) || !seen_uuids.insert(uuid_raw.to_ascii_lowercase())
            {
                continue;
            }
        }
        effective.push(e.clone());
    }

    let mut primary_block = String::new();
    for (idx, e) in effective.iter().enumerate() {
        primary_block.push_str(&render_entry_template(item_tpl, e, idx, index_base));
    }

    let mut secondary_block = String::new();
    if let Some(stpl) = sec_tpl.filter(|s| !s.is_empty()) {
        for (idx, e) in effective.iter().enumerate() {
            secondary_block.push_str(&render_entry_template(stpl, e, idx, index_base));
        }
    }

    let rendered = if doc_header.contains("{entries}") || doc_header.contains("{secondary_entries}") {
        let mut out = doc_header
            .replace("{entries}", &primary_block)
            .replace("{secondary_entries}", &secondary_block);
        if !doc_footer.is_empty() {
            out.push_str(doc_footer);
        }
        out
    } else {
        let mut out = String::new();
        if !doc_header.is_empty() {
            out.push_str(doc_header);
        }
        out.push_str(&primary_block);
        out.push_str(&secondary_block);
        if !doc_footer.is_empty() {
            out.push_str(doc_footer);
        }
        out
    };

    crate::utils::atomic_write_bytes(target_path, rendered.as_bytes())
}

fn build_lsx_compat_descriptor(desc: &ManifestTargetDescriptor) -> ManifestTargetDescriptor {
    let mut compat = desc.clone();
    if compat.document_header.is_none() && compat.header.is_none() {
        compat.document_header = Some(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<save>\n  <version major=\"4\" minor=\"7\" revision=\"1\" build=\"3\"/>\n  <region id=\"ModuleSettings\">\n    <node id=\"root\">\n      <children>\n        <node id=\"ModOrder\"/>\n        <node id=\"Mods\">\n          <children>\n{entries}          </children>\n        </node>\n      </children>\n    </node>\n  </region>\n</save>\n".to_string(),
        );
    }
    if compat.entry_template.is_none() && compat.template.is_none() {
        compat.entry_template = Some(
            "            <node id=\"ModuleShortDesc\">\n              <attribute id=\"Folder\" type=\"LSString\" value=\"{xml_folder}\"/>\n              <attribute id=\"MD5\" type=\"LSString\" value=\"\"/>\n              <attribute id=\"Name\" type=\"LSString\" value=\"{xml_title}\"/>\n              <attribute id=\"PublishHandle\" type=\"uint64\" value=\"{xml_publish_handle}\"/>\n              <attribute id=\"UUID\" type=\"FixedString\" value=\"{xml_uuid}\"/>\n              <attribute id=\"Version64\" type=\"int64\" value=\"{xml_version64}\"/>\n            </node>\n".to_string(),
        );
    }
    if compat.require_uuid.is_none() {
        compat.require_uuid = Some(true);
    }
    compat
}

pub(crate) fn resolve_local_appdata_root(schema: &Option<GameSchema>, live_root: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        if let Some(app_id) = schema
            .as_ref()
            .and_then(|s| s.steam_app_id.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let rel_pfx = format!("compatdata/{}/pfx/drive_c/users/steamuser/AppData/Local", app_id);
            let mut candidates: Vec<PathBuf> = Vec::new();
            for anc in live_root.ancestors() {
                if anc.file_name().and_then(|n| n.to_str()).map_or(false, |n| n.eq_ignore_ascii_case("steamapps")) {
                    candidates.push(anc.join(&rel_pfx));
                    break;
                }
            }
            if let Some(home) = dirs::home_dir() {
                candidates.push(home.join(".steam/steam/steamapps").join(&rel_pfx));
                candidates.push(home.join(".local/share/Steam/steamapps").join(&rel_pfx));
                candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps").join(&rel_pfx));
            }
            for cand in candidates {
                if cand.exists() {
                    return Some(cand);
                }
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (schema, live_root);
    dirs::data_local_dir()
}

fn entry_matches_include_extensions(entry: &OrderedDeployEntry, include_exts: &[String]) -> bool {
    if include_exts.is_empty() {
        return true;
    }
    let fname_lower = entry.file_name.to_ascii_lowercase();
    include_exts.iter().any(|ext| {
        let norm = if ext.trim().starts_with('.') {
            ext.trim().to_ascii_lowercase()
        } else {
            format!(".{}", ext.trim().to_ascii_lowercase())
        };
        !norm.is_empty() && norm != "." && fname_lower.ends_with(&norm)
    })
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SlotBucketUsage {
    pub id: String,
    pub label: String,
    pub used: u32,
    pub max_slots: u32,
    pub over_limit: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MissingMasterDiagnostic {
    pub mod_name: String,
    pub missing_master: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CompiledLoadOrderDiagnostics {
    pub sorted_files: Vec<String>,
    pub slot_usage: Vec<SlotBucketUsage>,
    pub missing_masters: Vec<MissingMasterDiagnostic>,
    pub cycle_chains: Vec<Vec<String>>,
    #[serde(default)]
    pub dirty_plugins: Vec<crate::loot_rules::DirtyPluginDiagnostic>,
}

fn entry_matches_extension_list(file_name: &str, exts: &[String]) -> bool {
    if exts.is_empty() {
        return true;
    }
    let lower = file_name.to_ascii_lowercase();
    exts.iter().any(|raw| {
        let norm = if raw.trim().starts_with('.') {
            raw.trim().to_ascii_lowercase()
        } else {
            format!(".{}", raw.trim().to_ascii_lowercase())
        };
        !norm.is_empty() && norm != "." && lower.ends_with(&norm)
    })
}

fn collect_baseline_filenames_for_load_order(
    mods_dir: &Path,
    live_root: &Path,
    schema: &Option<GameSchema>,
) -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    let mut dirs_to_check = vec![mods_dir.to_path_buf(), live_root.to_path_buf()];
    if let Some(subdirs) = schema.as_ref().and_then(|s| s.dlc_subdirs.as_ref()) {
        for sub in subdirs {
            let trimmed = sub.trim().trim_matches(&['/', '\\'][..]);
            if trimmed.is_empty() {
                continue;
            }
            let resolved = crate::utils::resolve_case_insensitive_path(live_root, trimmed);
            if resolved != mods_dir && !dirs_to_check.contains(&resolved) {
                dirs_to_check.push(resolved);
            }
        }
    }
    for d in dirs_to_check {
        if !d.is_dir() {
            continue;
        }
        if let Ok(rd) = fs::read_dir(&d) {
            for entry in rd.flatten() {
                if entry.path().is_file() {
                    let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                    if !name.is_empty() {
                        set.insert(name);
                    }
                }
            }
        }
    }
    set
}

pub fn solve_entries_dag_and_slots(
    entries: &mut Vec<OrderedDeployEntry>,
    lo_cfg: Option<&LoadOrderConfig>,
    baseline_present_lower: &std::collections::HashSet<String>,
) -> CompiledLoadOrderDiagnostics {
    use std::cmp::Reverse;
    use std::collections::{BinaryHeap, HashMap, HashSet};

    let n = entries.len();
    if n == 0 {
        return CompiledLoadOrderDiagnostics::default();
    }

    let mut id_lookup: HashMap<String, usize> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        for cand in [
            Some(e.file_name.as_str()),
            Some(e.stem.as_str()),
            e.metadata.mod_id.as_deref(),
            e.metadata.uuid.as_deref(),
            e.metadata.mod_name.as_deref(),
        ]
        .into_iter()
        .flatten()
        {
            let norm = cand.trim().to_ascii_lowercase();
            if !norm.is_empty() {
                id_lookup.entry(norm).or_insert(idx);
            }
        }
    }

    let resolve_ref = |raw_ref: &str| -> Option<usize> {
        let norm = raw_ref
            .trim()
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if norm.is_empty() {
            None
        } else {
            id_lookup.get(&norm).copied()
        }
    };

    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut edge_seen: HashSet<(usize, usize)> = HashSet::new();
    let mut missing_masters: Vec<MissingMasterDiagnostic> = Vec::new();
    let mut missing_seen: HashSet<(String, String)> = HashSet::new();

    for v in 0..n {
        let entry_v = &entries[v];
        for master in &entry_v.metadata.masters {
            let m_replaced = master.trim().replace('\\', "/");
            let m_clean = m_replaced
                .rsplit('/')
                .next()
                .unwrap_or("")
                .trim();
            let m_low = m_clean.to_ascii_lowercase();
            if m_low.is_empty() {
                continue;
            }
            if let Some(u) = id_lookup.get(&m_low).copied() {
                if u != v && edge_seen.insert((u, v)) {
                    adj[u].push(v);
                }
            } else if !baseline_present_lower.contains(&m_low)
                && missing_seen.insert((entry_v.file_name.to_ascii_lowercase(), m_low))
            {
                missing_masters.push(MissingMasterDiagnostic {
                    mod_name: entry_v.file_name.clone(),
                    missing_master: m_clean.to_string(),
                });
            }
        }
        for dep in entry_v
            .metadata
            .dependencies
            .iter()
            .chain(entry_v.metadata.load_after.iter())
        {
            if let Some(u) = resolve_ref(dep) {
                if u != v && edge_seen.insert((u, v)) {
                    adj[u].push(v);
                }
            }
        }
        for target_after in &entry_v.metadata.load_before {
            if let Some(w) = resolve_ref(target_after) {
                if w != v && edge_seen.insert((v, w)) {
                    adj[v].push(w);
                }
            }
        }
    }

    // 3-color DFS cycle detection so circular manifests never deadlock Kahn's sort
    let mut color: Vec<u8> = vec![0; n];
    let mut stack: Vec<usize> = Vec::new();
    let mut skipped_edges: HashSet<(usize, usize)> = HashSet::new();
    let mut cycle_chains: Vec<Vec<String>> = Vec::new();

    fn dfs_cycles(
        u: usize,
        adj: &[Vec<usize>],
        entries: &[OrderedDeployEntry],
        color: &mut [u8],
        stack: &mut Vec<usize>,
        skipped_edges: &mut HashSet<(usize, usize)>,
        cycle_chains: &mut Vec<Vec<String>>,
    ) {
        color[u] = 1;
        stack.push(u);
        for &v in &adj[u] {
            if color[v] == 0 {
                dfs_cycles(v, adj, entries, color, stack, skipped_edges, cycle_chains);
            } else if color[v] == 1 {
                skipped_edges.insert((u, v));
                if let Some(pos) = stack.iter().position(|&node| node == v) {
                    let mut chain: Vec<String> = stack[pos..]
                        .iter()
                        .map(|&idx| entries[idx].file_name.clone())
                        .collect();
                    chain.push(entries[v].file_name.clone());
                    cycle_chains.push(chain);
                }
            }
        }
        stack.pop();
        color[u] = 2;
    }

    for i in 0..n {
        if color[i] == 0 && !adj[i].is_empty() {
            dfs_cycles(
                i,
                &adj,
                entries,
                &mut color,
                &mut stack,
                &mut skipped_edges,
                &mut cycle_chains,
            );
        }
    }

    let early_flag_mask = lo_cfg.and_then(|c| c.early_master_flag_mask).unwrap_or(0);
    let early_exts = lo_cfg
        .and_then(|c| c.early_master_extensions.as_deref())
        .unwrap_or(&[]);
    let early_pin_ranks: Vec<u8> = entries
        .iter()
        .map(|e| {
            let by_flag = early_flag_mask != 0 && (e.metadata.header_flags & early_flag_mask) != 0;
            let by_ext = !early_exts.is_empty() && entry_matches_extension_list(&e.file_name, early_exts);
            if by_flag || by_ext { 0 } else { 1 }
        })
        .collect();

    let mut in_degree = vec![0usize; n];
    let mut dag_adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for u in 0..n {
        for &v in &adj[u] {
            if !skipped_edges.contains(&(u, v)) {
                dag_adj[u].push(v);
                in_degree[v] += 1;
            }
        }
    }

    let mut heap: BinaryHeap<Reverse<(u8, usize)>> = BinaryHeap::new();
    for i in 0..n {
        if in_degree[i] == 0 {
            heap.push(Reverse((early_pin_ranks[i], i)));
        }
    }

    let mut order: Vec<usize> = Vec::with_capacity(n);
    let mut emitted = vec![false; n];
    while let Some(Reverse((_, u))) = heap.pop() {
        if emitted[u] {
            continue;
        }
        emitted[u] = true;
        order.push(u);
        for &v in &dag_adj[u] {
            if in_degree[v] > 0 {
                in_degree[v] -= 1;
                if in_degree[v] == 0 {
                    heap.push(Reverse((early_pin_ranks[v], v)));
                }
            }
        }
    }
    for i in 0..n {
        if !emitted[i] {
            order.push(i);
        }
    }

    let reordered: Vec<OrderedDeployEntry> = order.into_iter().map(|i| entries[i].clone()).collect();
    *entries = reordered;

    let mut slot_usage = Vec::new();
    if let Some(buckets) = lo_cfg.and_then(|c| c.slot_buckets.as_ref()) {
        for b in buckets {
            let mut used: u32 = 0;
            for e in entries.iter() {
                if !entry_matches_extension_list(&e.file_name, &b.include_extensions) {
                    continue;
                }
                if let Some(req) = b.required_flag_mask {
                    if (e.metadata.header_flags & req) != req {
                        continue;
                    }
                }
                if let Some(excl) = b.excluded_flag_mask {
                    if (e.metadata.header_flags & excl) != 0 {
                        continue;
                    }
                }
                used = used.saturating_add(1);
            }
            slot_usage.push(SlotBucketUsage {
                id: b.id.clone(),
                label: if b.label.trim().is_empty() {
                    b.id.clone()
                } else {
                    b.label.clone()
                },
                used,
                max_slots: b.max_slots,
                over_limit: b.max_slots > 0 && used > b.max_slots,
            });
        }
    }

    let sorted_files = entries.iter().map(|e| e.file_name.clone()).collect();
    CompiledLoadOrderDiagnostics {
        sorted_files,
        slot_usage,
        missing_masters,
        cycle_chains,
        dirty_plugins: Vec::new(),
    }
}

#[tauri::command]
pub async fn evaluate_blueprint_load_order_diagnostics(
    paths: Vec<String>,
    mods_path: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<CompiledLoadOrderDiagnostics, String> {
    let schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let coords = crate::commands::state_ops::get_saved_coordinates();
        let vault_mods_lane = if !coords.vault_path.trim().is_empty() {
            crate::utils::get_vault_mods_lane(&coords.vault_path)
        } else {
            PathBuf::new()
        };
        let eff_mods_dir = if !mods_path.trim().is_empty() {
            PathBuf::from(mods_path.trim())
        } else {
            PathBuf::from(coords.mods_path.trim())
        };
        let live_root = crate::game_logic::resolve_game_engine_root(&coords.live_path, &schema);
        let allowed_roots = crate::utils::get_allowed_workspace_roots(&coords);

        let mut entries: Vec<OrderedDeployEntry> = Vec::new();
        for raw in paths {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            let p_raw = PathBuf::from(trimmed);
            let resolved_opt = if p_raw.is_absolute() {
                if !allowed_roots.is_empty()
                    && crate::utils::ensure_path_within_roots(&p_raw, &allowed_roots).is_ok()
                    && p_raw.exists()
                {
                    Some(p_raw)
                } else {
                    None
                }
            } else {
                let rel_norm = trimmed.replace('\\', "/");
                let clean_rel = rel_norm.trim_start_matches('/');
                let cand_vault = vault_mods_lane.join(clean_rel);
                let cand_mods = eff_mods_dir.join(clean_rel);
                if !vault_mods_lane.as_os_str().is_empty() && cand_vault.exists() {
                    Some(cand_vault)
                } else if !eff_mods_dir.as_os_str().is_empty() && cand_mods.exists() {
                    Some(cand_mods)
                } else if let Some(leaf) = Path::new(clean_rel).file_name() {
                    let v_leaf = vault_mods_lane.join(leaf);
                    let m_leaf = eff_mods_dir.join(leaf);
                    if !vault_mods_lane.as_os_str().is_empty() && v_leaf.exists() {
                        Some(v_leaf)
                    } else if !eff_mods_dir.as_os_str().is_empty() && m_leaf.exists() {
                        Some(m_leaf)
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            let fname = Path::new(trimmed)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(trimmed)
                .to_string();
            let stem = Path::new(&fname)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&fname)
                .to_string();
            let metadata = match resolved_opt.as_deref() {
                Some(rp) if crate::utils::is_safe_user_file_path(rp) => {
                    extract_metadata_for_path(rp, &schema)
                }
                _ => ExtractedModMetadata::default(),
            };
            entries.push(OrderedDeployEntry {
                rel_path: trimmed.replace('\\', "/"),
                file_name: fname,
                stem,
                metadata,
                tier_folder: None,
                tier_priority: 0,
                deployed_path: resolved_opt,
            });
        }

        let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(&coords, &schema));
        append_steam_workshop_entries_if_missing(&schema, &mut entries);
        let dirty_plugins = crate::loot_rules::apply_external_rules_and_dirty_checks(
            &mut entries,
            &schema,
            &coords.vault_path,
            &eff_mods_dir,
            &docs_root,
            &live_root,
        );
        let lo_cfg = schema.as_ref().and_then(|s| s.load_order.as_ref());
        let baseline = collect_baseline_filenames_for_load_order(&eff_mods_dir, &live_root, &schema);
        let mut diagnostics = solve_entries_dag_and_slots(&mut entries, lo_cfg, &baseline);
        diagnostics.dirty_plugins = dirty_plugins;
        Ok(diagnostics)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn append_steam_workshop_entries_if_missing(
    schema: &Option<GameSchema>,
    entries: &mut Vec<OrderedDeployEntry>,
) {
    if !schema
        .as_ref()
        .map_or(false, |s| s.paths.discover_steam_workshop == Some(true))
    {
        return;
    }
    let mut existing_ids = std::collections::HashSet::<String>::new();
    for e in entries.iter() {
        if let Some(ref mid) = e.metadata.mod_id {
            let c = mid.trim().to_ascii_lowercase();
            if !c.is_empty() {
                existing_ids.insert(c);
            }
        }
        existing_ids.insert(e.stem.trim().to_ascii_lowercase());
        existing_ids.insert(e.file_name.trim().to_ascii_lowercase());
    }
    for ws in crate::commands::deployment::discover_steam_workshop_items(schema) {
        let cand_id = ws
            .metadata
            .mod_id
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&ws.folder_name)
            .to_ascii_lowercase();
        if existing_ids.contains(&cand_id)
            || existing_ids.contains(&ws.workshop_id.to_ascii_lowercase())
        {
            continue;
        }
        existing_ids.insert(cand_id);
        entries.push(OrderedDeployEntry {
            rel_path: format!("workshop/{}", ws.workshop_id),
            file_name: ws.folder_name.clone(),
            stem: ws.folder_name,
            metadata: ws.metadata,
            tier_folder: None,
            tier_priority: 0,
            deployed_path: Some(PathBuf::from(ws.path)),
        });
    }
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

    let coords = crate::commands::state_ops::get_saved_coordinates();
    let mut effective_entries = entries.to_vec();
    append_steam_workshop_entries_if_missing(schema, &mut effective_entries);
    let _ = crate::loot_rules::apply_external_rules_and_dirty_checks(
        &mut effective_entries,
        schema,
        &coords.vault_path,
        mods_dir,
        docs_root,
        live_root,
    );
    apply_direction_to_entries(&mut effective_entries, lo_cfg);
    let baseline = collect_baseline_filenames_for_load_order(mods_dir, live_root, schema);
    let _ = solve_entries_dag_and_slots(&mut effective_entries, lo_cfg, &baseline);

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
            let local_appdata_root = resolve_local_appdata_root(schema, live_root);
            let base_root: &Path = match desc.root_source.to_ascii_lowercase().as_str() {
                "docs_path" | "user_data" | "documents" => docs_root,
                "live_path" | "game" | "engine" => live_root,
                "local_appdata" | "appdata_local" => {
                    local_appdata_root.as_deref().unwrap_or(Path::new(""))
                }
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

            let filtered_entries: Vec<OrderedDeployEntry> = effective_entries
                .iter()
                .filter(|e| entry_matches_include_extensions(e, &desc.include_extensions))
                .cloned()
                .collect();

            let fmt_lower = desc.format.trim().to_ascii_lowercase();
            let res = match fmt_lower.as_str() {
                "plugins_asterisk" => {
                    let mut lines = vec!["# Automatically generated by Sanctuary OS".to_string()];
                    for e in &filtered_entries {
                        lines.push(format!("*{}", e.file_name));
                    }
                    crate::utils::atomic_write_bytes(
                        &target_path,
                        format!("{}\n", lines.join("\n")).as_bytes(),
                    )
                }
                "ini_section" => write_ini_section_manifest(&target_path, desc, &filtered_entries, index_base),
                "json_array" => write_json_manifest(&target_path, desc, &filtered_entries, false),
                "json_object_array" => write_json_manifest(&target_path, desc, &filtered_entries, true),
                "enabled_object_list" | "factorio_mod_list" => {
                    write_enabled_object_list_manifest(&target_path, desc, &filtered_entries)
                }
                "toml_array_table" => write_toml_array_table_manifest(&target_path, desc, &filtered_entries),
                "xml_list" => write_xml_list_manifest(&target_path, desc, &filtered_entries),
                "declarative_template" => {
                    write_declarative_template_manifest(&target_path, desc, &filtered_entries, index_base)
                }
                "bg3_modsettings_lsx" => {
                    let compat = build_lsx_compat_descriptor(desc);
                    write_declarative_template_manifest(&target_path, &compat, &filtered_entries, index_base)
                }
                _ => {
                    let tpl = desc
                        .entry_template
                        .as_deref()
                        .or(desc.template.as_deref())
                        .filter(|t| !t.trim().is_empty())
                        .unwrap_or("{file}");
                    let mut parts = Vec::new();
                    if let Some(h) = desc
                        .document_header
                        .as_deref()
                        .or(desc.header.as_deref())
                        .filter(|s| !s.trim().is_empty())
                    {
                        parts.push(h.trim_end().to_string());
                    }
                    for (idx, e) in filtered_entries.iter().enumerate() {
                        parts.push(render_entry_template(tpl, e, idx, index_base));
                    }
                    if let Some(f) = desc
                        .document_footer
                        .as_deref()
                        .or(desc.footer.as_deref())
                        .filter(|s| !s.trim().is_empty())
                    {
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
                publish_handle: Some("0".to_string()),
                author: Some("Tester".to_string()),
                header_flags: 0,
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
            ..Default::default()
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
            ..Default::default()
        };
        write_xml_list_manifest(&xml_path, &xml_desc, &entries).unwrap();
        let xml_out = fs::read_to_string(&xml_path).unwrap();
        assert!(xml_out.contains("<activeMods>"));
        assert!(xml_out.contains("<li>beta</li>"));

        // BG3 Patch 7+ modsettings.lsx test with schema base_entries + PublishHandle
        let lsx_path = root.join("modsettings.lsx");
        let lsx_desc = ManifestTargetDescriptor {
            root_source: "docs_path".into(),
            relative_path: "modsettings.lsx".into(),
            format: "bg3_modsettings_lsx".into(),
            base_entries: vec![crate::schema::ManifestBaseEntryDescriptor {
                uuid: "28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8".into(),
                name: "BaseModule".into(),
                folder: "BaseModule".into(),
                version64: Some("36028797018963968".into()),
                publish_handle: Some("0".into()),
                ..Default::default()
            }],
            ..Default::default()
        };
        let mut entries_with_non_uuid = entries.clone();
        entries_with_non_uuid.push(mk_entry("HelperDll", "helper", ""));
        write_declarative_template_manifest(
            &lsx_path,
            &build_lsx_compat_descriptor(&lsx_desc),
            &entries_with_non_uuid,
            1,
        )
        .unwrap();
        let lsx_out = fs::read_to_string(&lsx_path).unwrap();
        assert!(lsx_out.contains("<version major=\"4\" minor=\"7\" revision=\"1\" build=\"3\"/>"));
        assert!(lsx_out.contains("<node id=\"ModOrder\"/>"));
        assert!(lsx_out.contains("28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8"));
        assert!(lsx_out.contains("22222222-2222-2222-2222-222222222222"));
        assert!(lsx_out.contains("<attribute id=\"PublishHandle\" type=\"uint64\" value=\"0\"/>"));
        assert!(!lsx_out.contains("HelperDll"));

        // Plugin extension allowlist filter test (non-plugin assets excluded)
        let mut loose_entry = mk_entry("TextureMesh", "tex", "");
        loose_entry.file_name = "armor.dds".to_string();
        let mut plugin_entry = mk_entry("ArmorPlugin", "armor", "");
        plugin_entry.file_name = "ArmorMod.esp".to_string();
        assert!(entry_matches_include_extensions(
            &plugin_entry,
            &[".esm".into(), ".esp".into(), ".esl".into()]
        ));
        assert!(!entry_matches_include_extensions(
            &loose_entry,
            &[".esm".into(), ".esp".into(), ".esl".into()]
        ));

        // Synthetic LSPK v18 LZ4 meta.lsx extraction test
        let lspk_path = root.join("SampleBg3Mod.pak");
        let meta_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<save>
  <region id="Config">
    <node id="root">
      <children>
        <node id="ModuleInfo">
          <attribute id="Author" type="LSString" value="LarianTester"/>
          <attribute id="Folder" type="LSString" value="SampleModFolder"/>
          <attribute id="Name" type="LSString" value="Sample Mod"/>
          <attribute id="PublishHandle" type="uint64" value="424242"/>
          <attribute id="UUID" type="FixedString" value="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"/>
          <attribute id="Version64" type="int64" value="72057594037927936"/>
        </node>
      </children>
    </node>
  </region>
</save>"#;
        let meta_bytes = meta_xml.as_bytes();
        let mut pak_bytes = vec![0u8; 32];
        let payload_offset = 32u64;
        pak_bytes.extend_from_slice(meta_bytes);
        let list_offset = pak_bytes.len() as u64;
        let mut raw_entry = vec![0u8; 272];
        let entry_path = b"Mods/SampleModFolder/meta.lsx";
        raw_entry[..entry_path.len()].copy_from_slice(entry_path);
        raw_entry[256..260].copy_from_slice(&(payload_offset as u32).to_le_bytes());
        raw_entry[260..262].copy_from_slice(&0u16.to_le_bytes());
        raw_entry[262] = 0;
        raw_entry[263] = 0;
        raw_entry[264..268].copy_from_slice(&(meta_bytes.len() as u32).to_le_bytes());
        raw_entry[268..272].copy_from_slice(&(meta_bytes.len() as u32).to_le_bytes());
        let comp_table = lz4_flex::block::compress(&raw_entry);
        pak_bytes.extend_from_slice(&1u32.to_le_bytes());
        pak_bytes.extend_from_slice(&(comp_table.len() as u32).to_le_bytes());
        pak_bytes.extend_from_slice(&comp_table);
        let list_size = (8 + comp_table.len()) as u32;
        pak_bytes[0..4].copy_from_slice(b"LSPK");
        pak_bytes[4..8].copy_from_slice(&18u32.to_le_bytes());
        pak_bytes[8..16].copy_from_slice(&list_offset.to_le_bytes());
        pak_bytes[16..20].copy_from_slice(&list_size.to_le_bytes());
        fs::write(&lspk_path, &pak_bytes).unwrap();

        let mut lspk_schema = GameSchema::default();
        lspk_schema.mod_metadata_extractor = Some(SchemaModMetadataExtractor {
            manifest_files: vec!["meta.lsx".into()],
            id_key: Some("Folder".into()),
            name_key: Some("Name".into()),
            uuid_key: Some("UUID".into()),
            version_key: Some("Version64".into()),
            author_key: Some("Author".into()),
            ..Default::default()
        });
        let extracted = extract_metadata_for_path(&lspk_path, &Some(lspk_schema));
        assert_eq!(extracted.uuid.as_deref(), Some("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        assert_eq!(extracted.mod_id.as_deref(), Some("SampleModFolder"));
        assert_eq!(extracted.publish_handle.as_deref(), Some("424242"));

        let toc_keys = crate::commands::radar_containers::extract_container_toc_keys(
            &lspk_path,
            &crate::schema::SchemaConflictAnalyzer::default(),
        );
        assert!(toc_keys.contains(&"lspk:mods/samplemodfolder/meta.lsx".to_string()));

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
        let (masters, _, _) = extract_tes_masters_and_author(&tes4);
        assert_eq!(masters, vec!["Skyrim.esm".to_string()]);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_topological_dag_masters_and_slot_buckets() {
        let mut child = mk_entry("ChildPatch.esp", "ChildPatch.esp", "");
        child.file_name = "ChildPatch.esp".into();
        child.metadata.masters = vec!["CoreMaster.esm".into(), "MissingDep.esm".into()];
        child.metadata.header_flags = 0x0200; // ESL light flag

        let mut mid = mk_entry("MidPlugin.esp", "MidPlugin.esp", "");
        mid.file_name = "MidPlugin.esp".into();
        mid.metadata.masters = vec!["CoreMaster.esm".into()];

        let mut master = mk_entry("CoreMaster.esm", "CoreMaster.esm", "");
        master.file_name = "CoreMaster.esm".into();
        master.metadata.header_flags = 0x0001; // ESM flag

        let mut entries = vec![child, mid, master];
        let lo_cfg = LoadOrderConfig {
            early_master_flag_mask: Some(0x0001),
            early_master_extensions: Some(vec![".esm".into()]),
            slot_buckets: Some(vec![
                crate::schema::LoadOrderSlotBucket {
                    id: "full_plugins".into(),
                    label: "Full Plugins".into(),
                    max_slots: 254,
                    include_extensions: vec![".esm".into(), ".esp".into()],
                    required_flag_mask: None,
                    excluded_flag_mask: Some(0x0200),
                },
                crate::schema::LoadOrderSlotBucket {
                    id: "light_plugins".into(),
                    label: "Light Plugins".into(),
                    max_slots: 4096,
                    include_extensions: vec![".esl".into(), ".esp".into(), ".esm".into()],
                    required_flag_mask: Some(0x0200),
                    excluded_flag_mask: None,
                },
            ]),
            ..Default::default()
        };

        let mut baseline = std::collections::HashSet::new();
        baseline.insert("vanilla.esm".to_string());

        let diag = solve_entries_dag_and_slots(&mut entries, Some(&lo_cfg), &baseline);
        assert_eq!(
            diag.sorted_files,
            vec![
                "CoreMaster.esm".to_string(),
                "ChildPatch.esp".to_string(),
                "MidPlugin.esp".to_string()
            ]
        );
        assert_eq!(diag.missing_masters.len(), 1);
        assert_eq!(diag.missing_masters[0].missing_master, "MissingDep.esm");

        let full_bucket = diag.slot_usage.iter().find(|b| b.id == "full_plugins").unwrap();
        let light_bucket = diag.slot_usage.iter().find(|b| b.id == "light_plugins").unwrap();
        assert_eq!(full_bucket.used, 2); // CoreMaster.esm + MidPlugin.esp
        assert_eq!(light_bucket.used, 1); // ChildPatch.esp (0x0200)
        assert!(!full_bucket.over_limit);
    }

    #[test]
    fn test_starfield_medium_and_light_flag_buckets() {
        // Build raw TES4 binary header with Starfield 0x0800 Medium Master flag
        let mut med_tes4 = Vec::new();
        med_tes4.extend_from_slice(b"TES4");
        let mut sub_data = Vec::new();
        sub_data.extend_from_slice(b"MAST");
        sub_data.extend_from_slice(&(13u16.to_le_bytes()));
        sub_data.extend_from_slice(b"Starfield.esm\0");
        med_tes4.extend_from_slice(&(sub_data.len() as u32).to_le_bytes());
        med_tes4.extend_from_slice(&TES4_FLAG_MEDIUM.to_le_bytes());
        med_tes4.extend_from_slice(&[0u8; 12]);
        med_tes4.extend_from_slice(&sub_data);

        let (med_masters, _, med_flags) = extract_tes_masters_and_author(&med_tes4);
        assert_eq!(med_masters, vec!["Starfield.esm".to_string()]);
        assert_eq!(med_flags & TES4_FLAG_MEDIUM, TES4_FLAG_MEDIUM);

        let mut base = mk_entry("FullMaster.esm", "FullMaster.esm", "");
        base.file_name = "FullMaster.esm".into();
        base.metadata.header_flags = TES4_FLAG_ESM;

        let mut medium = mk_entry("MediumHub.esm", "MediumHub.esm", "");
        medium.file_name = "MediumHub.esm".into();
        medium.metadata.header_flags = med_flags;

        let mut light = mk_entry("LightPatch.esm", "LightPatch.esm", "");
        light.file_name = "LightPatch.esm".into();
        light.metadata.header_flags = TES4_FLAG_LIGHT;

        let mut entries = vec![light, medium, base];
        let lo_cfg = LoadOrderConfig {
            early_master_flag_mask: Some(TES4_FLAG_ESM),
            slot_buckets: Some(vec![
                crate::schema::LoadOrderSlotBucket {
                    id: "full_plugins".into(),
                    label: "Full Plugins (00-FC)".into(),
                    max_slots: 253,
                    include_extensions: vec![".esm".into(), ".esp".into()],
                    required_flag_mask: None,
                    excluded_flag_mask: Some(TES4_FLAG_LIGHT | TES4_FLAG_MEDIUM),
                },
                crate::schema::LoadOrderSlotBucket {
                    id: "medium_plugins".into(),
                    label: "Medium Masters (FD)".into(),
                    max_slots: 256,
                    include_extensions: vec![".esm".into(), ".esp".into()],
                    required_flag_mask: Some(TES4_FLAG_MEDIUM),
                    excluded_flag_mask: Some(TES4_FLAG_LIGHT),
                },
                crate::schema::LoadOrderSlotBucket {
                    id: "light_plugins".into(),
                    label: "Light Masters (FE)".into(),
                    max_slots: 4096,
                    include_extensions: vec![".esl".into(), ".esm".into(), ".esp".into()],
                    required_flag_mask: Some(TES4_FLAG_LIGHT),
                    excluded_flag_mask: None,
                },
            ]),
            ..Default::default()
        };

        let baseline = std::collections::HashSet::new();
        let diag = solve_entries_dag_and_slots(&mut entries, Some(&lo_cfg), &baseline);
        assert_eq!(diag.slot_usage.iter().find(|b| b.id == "full_plugins").unwrap().used, 1);
        assert_eq!(diag.slot_usage.iter().find(|b| b.id == "medium_plugins").unwrap().used, 1);
        assert_eq!(diag.slot_usage.iter().find(|b| b.id == "light_plugins").unwrap().used, 1);
    }

    #[test]
    fn lower_wins_preserves_dag_masters_before_dependents_and_early_masters() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_lower_wins_dag_test_{}",
            uuid::Uuid::new_v4()
        ));
        let mods_dir = base.join("Data");
        let docs_dir = base.join("Docs");
        let live_dir = base.clone();
        std::fs::create_dir_all(&mods_dir).unwrap();
        std::fs::create_dir_all(&docs_dir).unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "dag_lower_wins",
                "game_id": "dag_lower_wins",
                "load_order": {
                    "strategy": "manifest_list",
                    "direction": "lower_wins",
                    "early_master_flag_mask": 1,
                    "early_master_extensions": [".esm"],
                    "manifest_targets": [
                        {
                            "root_source": "docs_path",
                            "relative_path": "plugins.txt",
                            "format": "plugins_asterisk",
                            "include_extensions": [".esm", ".esp"]
                        }
                    ]
                }
            }))
            .unwrap(),
        );

        let mut master = mk_entry("CoreBase", "CoreBase", "");
        master.file_name = "CoreBase.esm".into();
        master.rel_path = "CoreBase.esm".into();
        master.metadata.header_flags = TES4_FLAG_ESM;

        let mut dep = mk_entry("DepPatch", "DepPatch", "");
        dep.file_name = "DepPatch.esp".into();
        dep.rel_path = "DepPatch.esp".into();
        dep.metadata.masters = vec!["CoreBase.esm".into()];

        let mut free_a = mk_entry("LooseA", "LooseA", "");
        free_a.file_name = "LooseA.esp".into();
        free_a.rel_path = "LooseA.esp".into();

        let mut free_b = mk_entry("LooseB", "LooseB", "");
        free_b.file_name = "LooseB.esp".into();
        free_b.rel_path = "LooseB.esp".into();

        // User order before direction/DAG: DepPatch first, then LooseA, LooseB, CoreBase.esm last
        let entries = vec![dep, free_a, free_b, master];
        let written = apply_load_order_outputs(&schema, &mods_dir, &docs_dir, &live_dir, &entries);
        assert_eq!(written.len(), 1);
        let plugins_txt = std::fs::read_to_string(docs_dir.join("plugins.txt")).unwrap();
        let lines: Vec<&str> = plugins_txt
            .lines()
            .filter(|l| l.starts_with('*'))
            .collect();
        let master_pos = lines.iter().position(|&l| l == "*CoreBase.esm").unwrap();
        let dep_pos = lines.iter().position(|&l| l == "*DepPatch.esp").unwrap();
        let a_pos = lines.iter().position(|&l| l == "*LooseA.esp").unwrap();
        let b_pos = lines.iter().position(|&l| l == "*LooseB.esp").unwrap();
        assert!(
            master_pos < dep_pos,
            "lower_wins must never place dependent before required master: {:?}",
            lines
        );
        assert_eq!(master_pos, 0, "early_master must stay pinned at index 0");
        assert!(
            b_pos < a_pos,
            "unconstrained LooseB should sort ahead of LooseA under lower_wins: {:?}",
            lines
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn declarative_template_and_toml_and_enabled_object_manifests_and_20b_tes4() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_decl_manifests_test_{}",
            uuid::Uuid::new_v4()
        ));
        let mods_dir = base.join("mods");
        let docs_dir = base.join("docs");
        let live_dir = base.join("live");
        std::fs::create_dir_all(&mods_dir).unwrap();
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::create_dir_all(&live_dir).unwrap();

        // Pre-seed TOML with non-managed section to assert preservation
        let toml_path = live_dir.join("engine.toml");
        std::fs::write(&toml_path, "[engine]\ndebug = true\n\nmods = [\n    { enabled = true, name = \"old\", path = \"old\" },\n]\n").unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "decl_test",
                "game_id": "decl_test",
                "load_order": {
                    "strategy": "manifest_list",
                    "direction": "higher_wins",
                    "manifest_targets": [
                        {
                            "root_source": "docs_path",
                            "relative_path": "mods.xml",
                            "format": "declarative_template",
                            "require_uuid": true,
                            "document_header": "<Root>\n  <Order>\n{secondary_entries}  </Order>\n  <Items>\n{entries}  </Items>\n</Root>\n",
                            "entry_template": "    <Item folder=\"{xml_folder}\" uuid=\"{xml_uuid}\" title=\"{xml_title}\"/>\n",
                            "secondary_list_template": "    <OrderId>{xml_uuid}</OrderId>\n",
                            "base_entries": ["28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8|BaseMod|Base Mod|BaseMod|1"]
                        },
                        {
                            "root_source": "live_path",
                            "relative_path": "engine.toml",
                            "format": "toml_array_table",
                            "entry_key": "mods"
                        },
                        {
                            "root_source": "mods_path",
                            "relative_path": "mod-list.json",
                            "format": "enabled_object_list",
                            "entry_key": "mods",
                            "base_entries": ["base"]
                        }
                    ]
                }
            }))
            .unwrap(),
        );

        let e1 = mk_entry("Alpha&Co", "alpha_id", "aaaaaaaa-1111-2222-3333-444444444444");
        let e2 = mk_entry("NoUuidTool", "tool_id", "");
        let written = apply_load_order_outputs(&schema, &mods_dir, &docs_dir, &live_dir, &[e1, e2]);
        assert_eq!(written.len(), 3);

        let xml_out = std::fs::read_to_string(docs_dir.join("mods.xml")).unwrap();
        assert!(xml_out.contains("<OrderId>28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8</OrderId>"));
        assert!(xml_out.contains("<OrderId>aaaaaaaa-1111-2222-3333-444444444444</OrderId>"));
        assert!(xml_out.contains("title=\"Base Mod\""));
        assert!(!xml_out.contains("NoUuidTool"));

        let toml_out = std::fs::read_to_string(&toml_path).unwrap();
        assert!(toml_out.contains("[engine]\ndebug = true"));
        assert!(!toml_out.contains("old"));
        assert!(toml_out.contains("name = \"alpha_id\", path = \"Alpha&Co.pak\""));

        let json_out: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(mods_dir.join("mod-list.json")).unwrap())
                .unwrap();
        assert_eq!(json_out["mods"][0]["name"], "base");
        assert_eq!(json_out["mods"][1]["name"], "alpha_id");
        assert_eq!(json_out["mods"][2]["name"], "tool_id");

        // 20-byte legacy TES4 record header with HEDR at byte offset 20
        let mut tes4_20 = Vec::new();
        tes4_20.extend_from_slice(b"TES4");
        let mut sub_data = Vec::new();
        sub_data.extend_from_slice(b"HEDR");
        sub_data.extend_from_slice(&12u16.to_le_bytes());
        sub_data.extend_from_slice(&[0u8; 12]);
        sub_data.extend_from_slice(b"MAST");
        sub_data.extend_from_slice(&13u16.to_le_bytes());
        sub_data.extend_from_slice(b"Oblivion.esm\0");
        tes4_20.extend_from_slice(&(sub_data.len() as u32).to_le_bytes());
        tes4_20.extend_from_slice(&TES4_FLAG_ESM.to_le_bytes());
        tes4_20.extend_from_slice(&[0u8; 8]); // 12 + 8 = 20-byte header before HEDR
        tes4_20.extend_from_slice(&sub_data);
        let (masters_20, _, flags_20) = extract_tes_masters_and_author(&tes4_20);
        assert_eq!(masters_20, vec!["Oblivion.esm".to_string()]);
        assert_eq!(flags_20 & TES4_FLAG_ESM, TES4_FLAG_ESM);

        let _ = std::fs::remove_dir_all(&base);
    }
}
