use crate::schema::GameSchema;
use crate::utils::{
    extract_archive_bounded_to_dir, ExtractedZipEntry, MAX_ARCHIVE_ENTRY_BYTES,
    MAX_ARCHIVE_TOTAL_BYTES,
};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Resolves the maximum allowed relative subfolder depth for `ext` from
/// `schema.constraints.max_depth_by_extension` (exact `.ext` or `ext`, case-insensitive),
/// falling back to `schema.constraints.max_folder_depth` when positive.
pub fn resolve_max_depth_for_extension(schema: &Option<GameSchema>, ext: &str) -> Option<u32> {
    let clean = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    if let Some(constraints) = schema.as_ref().and_then(|s| s.constraints.as_ref()) {
        if !clean.is_empty() {
            if let Some(map) = constraints.max_depth_by_extension.as_ref() {
                for (raw_k, &depth) in map {
                    let k_clean = raw_k.trim().trim_start_matches('.').to_ascii_lowercase();
                    if k_clean == clean {
                        return Some(depth);
                    }
                }
            }
        }
        if let Some(global_depth) = constraints.max_folder_depth {
            if global_depth > 0 {
                return Some(global_depth);
            }
        }
    }
    None
}

/// Clamps `rel` so the directory prefix before the filename contains at most `max_subfolders`
/// normal directory segments (`Some(0)` flattens to just the filename).
pub fn clamp_relative_path_depth(rel: &Path, max_subfolders: Option<u32>) -> PathBuf {
    let comps: Vec<&std::ffi::OsStr> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s),
            _ => None,
        })
        .collect();
    if comps.is_empty() {
        return rel.to_path_buf();
    }
    if comps.len() == 1 {
        return PathBuf::from(comps[0]);
    }
    let dir_comps = &comps[..comps.len() - 1];
    let file_comp = comps[comps.len() - 1];

    let mut out = PathBuf::new();
    match max_subfolders {
        Some(limit) => {
            for seg in dir_comps.iter().take(limit as usize) {
                out.push(seg);
            }
        }
        None => {
            for seg in dir_comps {
                out.push(seg);
            }
        }
    }
    out.push(file_comp);
    out
}

/// Bounded breadth-first expansion of nested archive containers (`.zip`, `.7z`, `.rar`) up to
/// `constraints.max_nested_archive_depth` (or `1` when `requires_script_unzipping` is enabled),
/// strictly skipping `extensions.script_extensions` and cumulative bytes exceeding `MAX_ARCHIVE_TOTAL_BYTES`.
pub fn unpack_nested_archives_bounded(
    extract_root: &Path,
    schema: &Option<GameSchema>,
    files: Vec<ExtractedZipEntry>,
    total_bytes: &mut u64,
) -> Result<Vec<ExtractedZipEntry>, String> {
    let constraints = schema.as_ref().and_then(|s| s.constraints.as_ref());
    let max_depth = constraints
        .and_then(|c| c.max_nested_archive_depth)
        .or_else(|| {
            constraints
                .and_then(|c| c.requires_script_unzipping)
                .filter(|&b| b)
                .map(|_| 1)
        })
        .unwrap_or(0)
        .min(5);

    if max_depth == 0 || files.is_empty() {
        return Ok(files);
    }

    let mut protected_exts: HashSet<String> = HashSet::new();
    if let Some(s) = schema.as_ref() {
        if let Some(ref sc) = s.extensions.script_extensions {
            for ext in sc {
                let c = ext.trim().trim_start_matches('.').to_ascii_lowercase();
                if !c.is_empty() {
                    protected_exts.insert(c);
                }
            }
        }
        for ext in &s.extensions.supported {
            let c = ext.trim().trim_start_matches('.').to_ascii_lowercase();
            if !c.is_empty() && !matches!(c.as_str(), "zip" | "7z" | "rar") {
                protected_exts.insert(c);
            }
        }
    }

    let mut current_files = files;
    for pass in 0..max_depth {
        let mut next_files: Vec<ExtractedZipEntry> = Vec::with_capacity(current_files.len());
        let mut expanded_any = false;

        for entry in current_files {
            let ext_lower = entry
                .rel_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            let is_unpackable_container =
                matches!(ext_lower.as_str(), "zip" | "7z" | "rar")
                    && !protected_exts.contains(&ext_lower);

            if !is_unpackable_container || !entry.staged_path.is_file() {
                next_files.push(entry);
                continue;
            }

            let inner_stem = entry
                .rel_path
                .file_stem()
                .and_then(|s| s.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("nested");
            let inner_parent_rel = entry
                .rel_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_default();
            let nested_stage_dir = entry
                .staged_path
                .parent()
                .unwrap_or(extract_root)
                .join(format!("{}_nested_{}", inner_stem, pass + 1));

            let remaining_budget = MAX_ARCHIVE_TOTAL_BYTES.saturating_sub(*total_bytes);
            if remaining_budget == 0 {
                return Err("Nested archive expansion exceeded total extracted byte limit.".to_string());
            }

            match extract_archive_bounded_to_dir(
                &entry.staged_path,
                &nested_stage_dir,
                Some(inner_stem),
                schema,
                MAX_ARCHIVE_ENTRY_BYTES,
                remaining_budget,
            ) {
                Ok(inner_ext) if !inner_ext.files.is_empty() => {
                    *total_bytes = total_bytes.saturating_add(inner_ext.total_bytes);
                    let _ = std::fs::remove_file(&entry.staged_path);
                    expanded_any = true;
                    for mut inner_item in inner_ext.files {
                        inner_item.rel_path = if inner_parent_rel.as_os_str().is_empty() {
                            PathBuf::from(inner_stem).join(&inner_item.rel_path)
                        } else {
                            inner_parent_rel.join(inner_stem).join(&inner_item.rel_path)
                        };
                        next_files.push(inner_item);
                    }
                }
                Ok(_) => {
                    let _ = std::fs::remove_file(&entry.staged_path);
                    expanded_any = true;
                }
                Err(e) if e.contains("exceeds maximum") => {
                    return Err(e);
                }
                Err(_) => {
                    next_files.push(entry);
                }
            }
        }

        current_files = next_files;
        if !expanded_any {
            break;
        }
    }

    Ok(current_files)
}

fn normalize_group_ext(raw: &str) -> String {
    raw.trim().trim_start_matches('.').to_ascii_lowercase()
}

fn compute_rule_group_key(rel_norm: &str, rule: &crate::schema::SchemaArtifactGroupRule) -> Option<String> {
    let p = Path::new(rel_norm);
    let ext = p.extension().and_then(|e| e.to_str())?.to_ascii_lowercase();
    let matches_ext = rule
        .extensions
        .iter()
        .any(|e| normalize_group_ext(e) == ext);
    if !matches_ext {
        return None;
    }

    let stem = p.file_stem()?.to_string_lossy().to_string();
    let parent_low = p
        .parent()
        .map(|par| par.to_string_lossy().replace('\\', "/").trim_matches('/').to_ascii_lowercase())
        .unwrap_or_default();

    let key_part = match rule.key_strategy.trim().to_ascii_lowercase().as_str() {
        "shared_hex_stem" => {
            if let Some((_, rhs)) = stem.rsplit_once('!') {
                let candidate = rhs.trim();
                let hex_digits = candidate.strip_prefix("0x").or_else(|| candidate.strip_prefix("0X")).unwrap_or(candidate);
                if hex_digits.len() >= 8 && hex_digits.chars().all(|c| c.is_ascii_hexdigit()) {
                    format!("0x{}", hex_digits.to_ascii_lowercase())
                } else {
                    stem.to_ascii_lowercase()
                }
            } else {
                let s_low = stem.to_ascii_lowercase();
                let hex_digits = s_low.strip_prefix("0x").unwrap_or(&s_low);
                if hex_digits.len() >= 8 && hex_digits.chars().all(|c| c.is_ascii_hexdigit()) {
                    format!("0x{}", hex_digits)
                } else {
                    s_low
                }
            }
        }
        _ => stem.to_ascii_lowercase(),
    };

    Some(format!("{}::{}", parent_low, key_part))
}

/// Returns `(rule_id, group_key)` when `rel_norm` matches any `schema.artifact_groups` descriptor.
pub fn compute_artifact_group_key(
    rel_norm: &str,
    schema: &Option<GameSchema>,
) -> Option<(String, String)> {
    let rules = schema.as_ref()?.artifact_groups.as_ref()?;
    for rule in rules {
        if let Some(key) = compute_rule_group_key(rel_norm, rule) {
            return Some((rule.id.clone(), key));
        }
    }
    None
}

/// Collects sorted sibling files in the same parent folder sharing the same artifact group key
/// as `primary_source` (excluding `primary_source` itself).
pub fn expand_artifact_group_siblings(
    primary_source: &Path,
    schema: &Option<GameSchema>,
) -> Vec<PathBuf> {
    let Some(parent) = primary_source.parent() else {
        return Vec::new();
    };
    let Some(fname) = primary_source.file_name().and_then(|n| n.to_str()) else {
        return Vec::new();
    };
    let Some((target_rule_id, target_key)) = compute_artifact_group_key(fname, schema) else {
        return Vec::new();
    };
    let Some(rules) = schema.as_ref().and_then(|s| s.artifact_groups.as_ref()) else {
        return Vec::new();
    };
    let Some(rule) = rules.iter().find(|r| r.id == target_rule_id) else {
        return Vec::new();
    };

    let mut siblings = Vec::new();
    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() || p == primary_source {
                continue;
            }
            if let Some(sib_name) = p.file_name().and_then(|n| n.to_str()) {
                if compute_rule_group_key(sib_name, rule).as_deref() == Some(target_key.as_str()) {
                    siblings.push(p);
                }
            }
        }
    }
    siblings.sort();
    siblings
}

fn encode_base64_bytes(bytes: &[u8]) -> String {
    const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        encoded.push(B64[(n >> 18) & 63] as char);
        encoded.push(B64[(n >> 12) & 63] as char);
        encoded.push(if chunk.len() > 1 { B64[(n >> 6) & 63] as char } else { '=' });
        encoded.push(if chunk.len() > 2 { B64[n & 63] as char } else { '=' });
    }
    encoded
}

fn parse_magic_spec(raw: &str) -> Vec<u8> {
    let trimmed = raw.trim();
    if let Some(hex_raw) = trimmed.strip_prefix("hex:") {
        let clean: String = hex_raw.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        return hex::decode(clean).unwrap_or_default();
    }
    if let Some(ascii_raw) = trimmed.strip_prefix("ascii:") {
        return ascii_raw.as_bytes().to_vec();
    }
    trimmed.as_bytes().to_vec()
}

fn find_embedded_png_or_jpeg(data: &[u8]) -> Option<(&'static str, Vec<u8>)> {
    const MAX_IMAGE_BYTES: usize = 512 * 1024;
    const PNG_HDR: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    const PNG_IEND_FULL: &[u8] = &[0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82];

    if let Some(start) = data.windows(PNG_HDR.len()).position(|w| w == PNG_HDR) {
        let tail = &data[start..];
        let search_limit = tail.len().min(MAX_IMAGE_BYTES);
        if let Some(rel_end) = tail[..search_limit]
            .windows(PNG_IEND_FULL.len())
            .position(|w| w == PNG_IEND_FULL)
        {
            let total_len = rel_end + PNG_IEND_FULL.len();
            if total_len >= 32 {
                return Some(("image/png", tail[..total_len].to_vec()));
            }
        }
    }

    if data.len() >= 32 {
        for start in 0..data.len().saturating_sub(3) {
            if data[start] == 0xFF
                && data[start + 1] == 0xD8
                && data[start + 2] == 0xFF
                && matches!(data[start + 3], 0xE0..=0xEF | 0xDB | 0xC0..=0xCF)
            {
                let tail = &data[start..];
                let search_limit = tail.len().min(MAX_IMAGE_BYTES);
                if let Some(rel_end) = tail[..search_limit]
                    .windows(2)
                    .skip(4)
                    .position(|w| w == [0xFF, 0xD9])
                {
                    let total_len = 4 + rel_end + 2;
                    if total_len >= 32 && total_len <= MAX_IMAGE_BYTES {
                        return Some(("image/jpeg", tail[..total_len].to_vec()));
                    }
                }
                break;
            }
        }
    }

    None
}

/// Scans `path` according to matching `SchemaPreviewExtractor` rules and returns a bounded
/// `data:image/(png|jpeg);base64,...` URI when an embedded thumbnail stream is found.
pub fn extract_preview_data_url_from_file(
    path: &Path,
    rules: &[crate::schema::SchemaPreviewExtractor],
) -> Option<String> {
    if rules.is_empty() || !path.is_file() {
        return None;
    }
    let ext_lower = path.extension().and_then(|e| e.to_str())?.to_ascii_lowercase();

    for rule in rules {
        let ext_ok = rule.extensions.is_empty()
            || rule
                .extensions
                .iter()
                .any(|e| normalize_group_ext(e) == ext_lower);
        if !ext_ok || rule.scan_embedded_png_jpeg == Some(false) {
            continue;
        }

        let max_bytes = rule
            .max_scan_bytes
            .unwrap_or(8 * 1024 * 1024)
            .clamp(1024, 16 * 1024 * 1024);

        let Ok(file) = File::open(path) else {
            continue;
        };
        let mut buf = Vec::new();
        if file.take(max_bytes).read_to_end(&mut buf).is_err() || buf.len() < 16 {
            continue;
        }

        if let Some(ref magic_spec) = rule.container_magic {
            let expected = parse_magic_spec(magic_spec);
            if !expected.is_empty() && !buf.starts_with(&expected) {
                continue;
            }
        }

        if let Some((mime, img_bytes)) = find_embedded_png_or_jpeg(&buf) {
            return Some(format!("data:{};base64,{}", mime, encode_base64_bytes(&img_bytes)));
        }

        let mut zlib_attempts = 0usize;
        let mut idx = 0usize;
        while idx + 2 < buf.len() && zlib_attempts < 24 {
            if buf[idx] == 0x78 && matches!(buf[idx + 1], 0x01 | 0x5E | 0x9C | 0xDA) {
                zlib_attempts += 1;
                let mut decoder = flate2::read::ZlibDecoder::new(&buf[idx..]).take(512 * 1024);
                let mut decomp = Vec::new();
                if decoder.read_to_end(&mut decomp).is_ok() && decomp.len() >= 32 {
                    if let Some((mime, img_bytes)) = find_embedded_png_or_jpeg(&decomp) {
                        return Some(format!(
                            "data:{};base64,{}",
                            mime,
                            encode_base64_bytes(&img_bytes)
                        ));
                    }
                }
                idx += 2;
            } else {
                idx += 1;
            }
        }
    }

    None
}

/// Picks a deterministic primary display member path for an artifact group rule.
pub fn choose_canonical_group_member_name(members: &[String]) -> String {
    let mut sorted = members.to_vec();
    sorted.sort();
    sorted
        .first()
        .cloned()
        .unwrap_or_default()
}

pub fn attach_preview_extractors_cache(
    vault_path: &str,
    items: &[(PathBuf, u64)],
    rules: &[crate::schema::SchemaPreviewExtractor],
) -> HashMap<PathBuf, String> {
    let mut out = HashMap::new();
    if rules.is_empty() || items.is_empty() {
        return out;
    }

    let cached_map = crate::utils::load_preview_thumbnails_map(vault_path);
    let mut to_upsert: Vec<(String, u64, String)> = Vec::new();

    for (path, mtime) in items {
        let p_str = path.to_string_lossy().to_string();
        if let Some((c_mtime, c_url)) = cached_map.get(&p_str) {
            if *c_mtime == *mtime {
                if !c_url.is_empty() {
                    out.insert(path.clone(), c_url.clone());
                }
                continue;
            }
        }

        let extracted = extract_preview_data_url_from_file(path, rules).unwrap_or_default();
        if !extracted.is_empty() {
            out.insert(path.clone(), extracted.clone());
        }
        to_upsert.push((p_str, *mtime, extracted));
    }

    if !to_upsert.is_empty() {
        crate::utils::save_preview_thumbnails_batch(vault_path, &to_upsert);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn clamps_per_extension_and_global_depths() {
        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "depth_test",
                "constraints": {
                    "max_folder_depth": 5,
                    "max_depth_by_extension": {
                        ".scriptmod": 1,
                        ".rootonly": 0
                    }
                }
            }))
            .unwrap(),
        );

        assert_eq!(resolve_max_depth_for_extension(&schema, "scriptmod"), Some(1));
        assert_eq!(resolve_max_depth_for_extension(&schema, ".SCRIPTMOD"), Some(1));
        assert_eq!(resolve_max_depth_for_extension(&schema, "rootonly"), Some(0));
        assert_eq!(resolve_max_depth_for_extension(&schema, "data"), Some(5));

        assert_eq!(
            clamp_relative_path_depth(Path::new("A/B/C/deep.scriptmod"), Some(1)),
            PathBuf::from("A").join("deep.scriptmod")
        );
        assert_eq!(
            clamp_relative_path_depth(Path::new("A/B/C/root.rootonly"), Some(0)),
            PathBuf::from("root.rootonly")
        );
        assert_eq!(
            clamp_relative_path_depth(Path::new("A/B/C/mod.data"), Some(5)),
            PathBuf::from("A").join("B").join("C").join("mod.data")
        );
    }

    #[test]
    fn unpacks_multi_level_nested_archives_and_preserves_script_ext() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_nested_arch_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let inner_zip = tmp.join("inner.zip");
        {
            let f = File::create(&inner_zip).unwrap();
            let mut zw = zip::ZipWriter::new(f);
            let opts = zip::write::SimpleFileOptions::default();
            zw.start_file("deep_payload.binmod", opts).unwrap();
            zw.write_all(b"payload").unwrap();
            zw.start_file("addon.scriptmod", opts).unwrap();
            zw.write_all(b"script_zip_should_stay_intact").unwrap();
            zw.finish().unwrap();
        }

        let outer_zip = tmp.join("outer.zip");
        {
            let f = File::create(&outer_zip).unwrap();
            let mut zw = zip::ZipWriter::new(f);
            let opts = zip::write::SimpleFileOptions::default();
            zw.start_file("inner.zip", opts).unwrap();
            zw.write_all(&std::fs::read(&inner_zip).unwrap()).unwrap();
            zw.finish().unwrap();
        }

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "nested_test",
                "extensions": {
                    "supported": [".binmod", ".scriptmod"],
                    "script_extensions": [".scriptmod"]
                },
                "constraints": {
                    "max_nested_archive_depth": 2
                }
            }))
            .unwrap(),
        );

        let stage = tmp.join("stage");
        let mut ext = crate::utils::extract_archive_bounded_to_dir(
            &outer_zip,
            &stage,
            Some("outer"),
            &schema,
            crate::utils::MAX_ARCHIVE_ENTRY_BYTES,
            crate::utils::MAX_ARCHIVE_TOTAL_BYTES,
        )
        .unwrap();
        let expanded = unpack_nested_archives_bounded(
            &stage,
            &schema,
            ext.files,
            &mut ext.total_bytes,
        )
        .unwrap();

        let rels: Vec<String> = expanded
            .iter()
            .map(|e| e.rel_path.to_string_lossy().replace('\\', "/"))
            .collect();
        assert!(rels.iter().any(|r| r.ends_with("deep_payload.binmod")));
        assert!(rels.iter().any(|r| r.ends_with("addon.scriptmod")));
        assert!(!rels.iter().any(|r| r.ends_with("inner.zip")));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn groups_shared_hex_stems_and_extracts_raw_or_compressed_previews() {
        let tmp = std::env::temp_dir().join(format!(
            "sanctuary_group_preview_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let primary = tmp.join("0x00000000!0x0abc123456789def.item");
        let sib1 = tmp.join("0x00000000!0x0abc123456789def.bpi");
        let other = tmp.join("0x00000000!0xffffffffffffffff.bpi");

        // Construct valid PNG payload bytes (> 32 bytes) wrapped inside BINM header + zlib stream
        let mut png_bytes = vec![
            0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R',
            0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
        ];
        png_bytes.extend_from_slice(&[
            0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
        ]);

        let mut zlib_enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        zlib_enc.write_all(&png_bytes).unwrap();
        let compressed_png = zlib_enc.finish().unwrap();

        let mut container = b"BINM\x02\x01\x00\x00\x00\x00\x00\x00".to_vec();
        container.extend_from_slice(&compressed_png);
        std::fs::write(&primary, &container).unwrap();
        std::fs::write(&sib1, b"sib").unwrap();
        std::fs::write(&other, b"other").unwrap();

        let schema: Option<GameSchema> = Some(
            serde_json::from_value(serde_json::json!({
                "id": "group_preview_test",
                "artifact_groups": [
                    {
                        "id": "bundle",
                        "extensions": [".item", ".bpi"],
                        "key_strategy": "shared_hex_stem"
                    }
                ],
                "preview_extractors": [
                    {
                        "id": "bin_thumb",
                        "extensions": [".item"],
                        "container_magic": "BINM",
                        "scan_embedded_png_jpeg": true,
                        "max_scan_bytes": 65536
                    }
                ]
            }))
            .unwrap(),
        );

        let sibs = expand_artifact_group_siblings(&primary, &schema);
        assert_eq!(sibs, vec![sib1.clone()]);

        let rules = schema.as_ref().unwrap().preview_extractors.as_ref().unwrap();
        let data_url = extract_preview_data_url_from_file(&primary, rules).expect("extract compressed preview");
        assert!(data_url.starts_with("data:image/png;base64,"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
