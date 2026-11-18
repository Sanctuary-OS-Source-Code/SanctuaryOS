use crate::schema::SchemaConflictAnalyzer;
use flate2::read::ZlibDecoder;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

const MAX_TOC_ENTRIES: usize = 8192;
const MAX_RECORD_KEYS: usize = 8192;
const MAX_TEXT_SCAN_BYTES: usize = 8 * 1024 * 1024;

fn read_le_u16(b: &[u8]) -> u16 {
    u16::from_le_bytes([b[0], b[1]])
}

fn read_le_u32(b: &[u8]) -> u32 {
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

fn read_le_i32(b: &[u8]) -> i32 {
    i32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

fn read_le_u64(b: &[u8]) -> u64 {
    u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
}

fn extract_bsa_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 36 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 36];
    if file.read_exact(&mut hdr).is_err() || &hdr[0..4] != b"BSA\0" {
        return Vec::new();
    }
    let version = read_le_u32(&hdr[4..8]);
    let offset = read_le_u32(&hdr[8..12]) as u64;
    let archive_flags = read_le_u32(&hdr[12..16]);
    let folder_count = (read_le_u32(&hdr[16..20]) as usize).min(MAX_TOC_ENTRIES);
    let total_file_count = (read_le_u32(&hdr[20..24]) as usize).min(MAX_TOC_ENTRIES);
    let _total_folder_len = read_le_u32(&hdr[24..28]) as usize;
    let total_file_name_len = (read_le_u32(&hdr[28..32]) as usize).min(4 * 1024 * 1024);

    let has_dir_names = (archive_flags & 0x1) != 0;
    let has_file_names = (archive_flags & 0x2) != 0;
    if !has_file_names || total_file_name_len == 0 || file.seek(SeekFrom::Start(offset)).is_err() {
        return Vec::new();
    }

    let folder_rec_size = if version >= 105 { 24 } else { 16 };
    let folder_table_bytes = folder_count.saturating_mul(folder_rec_size);
    if offset.saturating_add(folder_table_bytes as u64) > file_len {
        return Vec::new();
    }

    let mut folder_raw = vec![0u8; folder_table_bytes];
    if file.read_exact(&mut folder_raw).is_err() {
        return Vec::new();
    }

    let mut folder_file_counts: Vec<usize> = Vec::with_capacity(folder_count);
    for chunk in folder_raw.chunks_exact(folder_rec_size) {
        let count = read_le_u32(&chunk[8..12]) as usize;
        folder_file_counts.push(count);
    }

    let mut folder_names_for_files: Vec<String> = Vec::with_capacity(total_file_count);
    for count in folder_file_counts {
        let mut folder_label = String::new();
        if has_dir_names {
            let mut len_b = [0u8; 1];
            if file.read_exact(&mut len_b).is_err() {
                break;
            }
            let nlen = len_b[0] as usize;
            if nlen > 0 {
                let mut nb = vec![0u8; nlen];
                if file.read_exact(&mut nb).is_err() {
                    break;
                }
                folder_label = String::from_utf8_lossy(&nb)
                    .trim_end_matches('\0')
                    .replace('\\', "/")
                    .to_lowercase();
            }
        }
        let skip_bytes = (count as u64).saturating_mul(16);
        if file.seek(SeekFrom::Current(skip_bytes as i64)).is_err() {
            break;
        }
        for _ in 0..count {
            if folder_names_for_files.len() >= MAX_TOC_ENTRIES {
                break;
            }
            folder_names_for_files.push(folder_label.clone());
        }
        if folder_names_for_files.len() >= MAX_TOC_ENTRIES {
            break;
        }
    }

    let mut name_table = vec![0u8; total_file_name_len];
    if file.read_exact(&mut name_table).is_err() {
        return Vec::new();
    }

    let mut keys = Vec::new();
    for (idx, raw_name) in name_table.split(|b| *b == 0).enumerate() {
        if raw_name.is_empty() || keys.len() >= MAX_TOC_ENTRIES {
            if keys.len() >= MAX_TOC_ENTRIES {
                break;
            }
            continue;
        }
        let fname = String::from_utf8_lossy(raw_name).trim().to_lowercase();
        if fname.is_empty() {
            continue;
        }
        let folder = folder_names_for_files
            .get(idx)
            .map(String::as_str)
            .unwrap_or("");
        let vpath = if folder.is_empty() {
            fname
        } else {
            format!("{}/{}", folder.trim_end_matches('/'), fname)
        };
        keys.push(format!("bsa:{}", vpath));
    }
    keys
}

fn extract_ba2_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 24 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 24];
    if file.read_exact(&mut hdr).is_err() || &hdr[0..4] != b"BTDX" {
        return Vec::new();
    }
    let file_count = (read_le_u32(&hdr[12..16]) as usize).min(MAX_TOC_ENTRIES);
    let name_table_offset = read_le_u64(&hdr[16..24]);
    if name_table_offset == 0 || name_table_offset >= file_len {
        return Vec::new();
    }
    if file.seek(SeekFrom::Start(name_table_offset)).is_err() {
        return Vec::new();
    }

    let mut keys = Vec::with_capacity(file_count.min(512));
    for _ in 0..file_count {
        let mut len_buf = [0u8; 2];
        if file.read_exact(&mut len_buf).is_err() {
            break;
        }
        let str_len = read_le_u16(&len_buf) as usize;
        if str_len == 0 || str_len > 1024 {
            continue;
        }
        let mut sb = vec![0u8; str_len];
        if file.read_exact(&mut sb).is_err() {
            break;
        }
        let rel = String::from_utf8_lossy(&sb)
            .trim()
            .replace('\\', "/")
            .to_lowercase();
        if !rel.is_empty() {
            keys.push(format!("ba2:{}", rel));
        }
    }
    keys
}

fn read_ue_fstring(bytes: &[u8], pos: &mut usize) -> Option<String> {
    if *pos + 4 > bytes.len() {
        return None;
    }
    let len = read_le_i32(&bytes[*pos..*pos + 4]);
    *pos += 4;
    if len == 0 {
        return Some(String::new());
    }
    if len > 0 {
        let ulen = len as usize;
        if ulen > 2048 || *pos + ulen > bytes.len() {
            return None;
        }
        let slice = &bytes[*pos..*pos + ulen];
        *pos += ulen;
        Some(
            String::from_utf8_lossy(slice)
                .trim_end_matches('\0')
                .to_string(),
        )
    } else {
        let char_count = (-len) as usize;
        let byte_count = char_count.saturating_mul(2);
        if char_count > 1024 || *pos + byte_count > bytes.len() {
            return None;
        }
        let slice = &bytes[*pos..*pos + byte_count];
        *pos += byte_count;
        let units: Vec<u16> = slice
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        Some(
            String::from_utf16_lossy(&units)
                .trim_end_matches('\0')
                .to_string(),
        )
    }
}

fn extract_unreal_pak_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    const PAK_MAGIC: u32 = 0x5A6F_12E1;
    let candidate_footer_offsets = [44u64, 45u64, 204u64, 205u64, 221u64];
    for back in candidate_footer_offsets {
        if file_len <= back {
            continue;
        }
        let footer_pos = file_len - back;
        if file.seek(SeekFrom::Start(footer_pos)).is_err() {
            continue;
        }
        let mut fbuf = vec![0u8; back as usize];
        if file.read_exact(&mut fbuf).is_err() {
            continue;
        }
        // Scan footer for UE Pak magic followed by version + index_offset + index_size
        let mut found_idx: Option<(u64, u64)> = None;
        for off in 0..fbuf.len().saturating_sub(24) {
            if read_le_u32(&fbuf[off..off + 4]) == PAK_MAGIC {
                let version = read_le_u32(&fbuf[off + 4..off + 8]);
                if (1..=12).contains(&version) {
                    let idx_off = read_le_u64(&fbuf[off + 8..off + 16]);
                    let idx_size = read_le_u64(&fbuf[off + 16..off + 24]);
                    if idx_off < file_len && idx_size > 0 && idx_size <= 16 * 1024 * 1024 {
                        found_idx = Some((idx_off, idx_size));
                        break;
                    }
                }
            }
        }
        if let Some((idx_off, idx_size)) = found_idx {
            if file.seek(SeekFrom::Start(idx_off)).is_err() {
                break;
            }
            let mut idx_buf = vec![0u8; idx_size as usize];
            if file.read_exact(&mut idx_buf).is_err() {
                break;
            }
            let mut pos = 0usize;
            let Some(mount_point) = read_ue_fstring(&idx_buf, &mut pos) else {
                break;
            };
            if pos + 4 > idx_buf.len() {
                break;
            }
            let count = (read_le_u32(&idx_buf[pos..pos + 4]) as usize).min(MAX_TOC_ENTRIES);
            pos += 4;
            let clean_mount = mount_point
                .trim_start_matches("../../../")
                .trim_matches('/')
                .to_lowercase();
            let mut keys = Vec::new();
            for _ in 0..count {
                let Some(entry_name) = read_ue_fstring(&idx_buf, &mut pos) else {
                    break;
                };
                let rel = entry_name.trim_matches('/').replace('\\', "/").to_lowercase();
                if !rel.is_empty() {
                    let full = if clean_mount.is_empty() {
                        rel
                    } else {
                        format!("{}/{}", clean_mount, rel)
                    };
                    keys.push(format!("pak:{}", full));
                }
                // Skip fixed PakEntry metadata: offset(8)+size(8)+uncomp(8)+comp_method(4)+sha1(20)+flags(1)+comp_block_size(4) >= 53 bytes heuristic unavailable accurately across versions; fallback below handles packed index!
                break;
            }
            // Fallback string scan across unencrypted index buffer for UE .uasset/.umap/.ini/.json paths
            if keys.len() <= 1 {
                keys.clear();
                let mut i = 4;
                while i + 4 < idx_buf.len() && keys.len() < MAX_TOC_ENTRIES {
                    let slen = read_le_i32(&idx_buf[i..i + 4]);
                    if slen > 4 && slen < 320 && i + 4 + (slen as usize) <= idx_buf.len() {
                        let candidate = &idx_buf[i + 4..i + 4 + (slen as usize)];
                        if candidate.ends_with(&[0])
                            && candidate[..candidate.len() - 1]
                                .iter()
                                .all(|b| b.is_ascii_graphic() || *b == b' ')
                        {
                            let s = String::from_utf8_lossy(&candidate[..candidate.len() - 1])
                                .replace('\\', "/")
                                .to_lowercase();
                            if s.contains('/') && !s.starts_with("../../../") {
                                keys.push(format!("pak:{}", s));
                            }
                            i += 4 + (slen as usize);
                            continue;
                        }
                    }
                    i += 1;
                }
            }
            return keys;
        }
    }
    Vec::new()
}

fn extract_lspk_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 32 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 32];
    if file.read_exact(&mut hdr).is_err() || &hdr[0..4] != b"LSPK" {
        return Vec::new();
    }
    let version = read_le_u32(&hdr[4..8]);
    let (list_offset, list_size) = if version >= 15 {
        (read_le_u64(&hdr[8..16]), read_le_u32(&hdr[16..20]) as u64)
    } else {
        (0u64, 0u64)
    };
    if list_offset == 0 || list_offset >= file_len || list_size > 16 * 1024 * 1024 {
        return Vec::new();
    }
    if file.seek(SeekFrom::Start(list_offset)).is_err() {
        return Vec::new();
    }
    let mut table_buf = vec![0u8; (list_size as usize).min((file_len - list_offset) as usize)];
    if file.read_exact(&mut table_buf).is_err() {
        return Vec::new();
    }
    let mut decoded_text_bytes = Vec::new();
    if table_buf.starts_with(&[0x78]) {
        let z = ZlibDecoder::new(table_buf.as_slice());
        let _ = z.take(4 * 1024 * 1024).read_to_end(&mut decoded_text_bytes);
    }
    let scan_slice = if decoded_text_bytes.is_empty() {
        table_buf.as_slice()
    } else {
        decoded_text_bytes.as_slice()
    };

    // Extract printable asset paths inside LSPK table (`Public/`, `Mods/`, `.lsx`, `.lsf`, `.dds`, etc.)
    let mut keys = Vec::new();
    let mut cur = Vec::new();
    for &b in scan_slice {
        if b.is_ascii_graphic() || b == b' ' {
            cur.push(b);
        } else {
            if cur.len() >= 6 && cur.len() <= 240 {
                let s = String::from_utf8_lossy(&cur).replace('\\', "/");
                if s.contains('/') && s.contains('.') && !s.contains("  ") {
                    keys.push(format!("lspk:{}", s.to_lowercase()));
                    if keys.len() >= MAX_TOC_ENTRIES {
                        break;
                    }
                }
            }
            cur.clear();
        }
    }
    keys
}

pub fn extract_container_toc_keys(
    path: &Path,
    _analyzer: &SchemaConflictAnalyzer,
) -> Vec<String> {
    let Ok(raw_file) = File::open(path) else {
        return Vec::new();
    };
    let Ok(meta) = raw_file.metadata() else {
        return Vec::new();
    };
    let file_len = meta.len();
    if file_len < 8 {
        return Vec::new();
    }
    let mut file = BufReader::with_capacity(64 * 1024, raw_file);
    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return Vec::new();
    }

    if &magic == b"BSA\0" {
        return extract_bsa_toc(&mut file, file_len);
    }
    if &magic == b"BTDX" {
        return extract_ba2_toc(&mut file, file_len);
    }
    if &magic == b"LSPK" {
        return extract_lspk_toc(&mut file, file_len);
    }
    if &magic[0..2] == b"PK" {
        if let Ok(f) = File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(f) {
                let mut keys = Vec::new();
                for i in 0..archive.len().min(MAX_TOC_ENTRIES) {
                    if let Ok(entry) = archive.by_index(i) {
                        if !entry.is_dir() {
                            let name = entry.name().replace('\\', "/").to_lowercase();
                            if !name.is_empty() {
                                keys.push(format!("zip:{}", name));
                            }
                        }
                    }
                }
                return keys;
            }
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if ext == "pak" {
        return extract_unreal_pak_toc(&mut file, file_len);
    }
    Vec::new()
}

pub fn extract_chunked_record_keys(
    path: &Path,
    analyzer: &SchemaConflictAnalyzer,
) -> Vec<String> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    if bytes.len() < 24 || &bytes[0..4] != b"TES4" {
        return Vec::new();
    }

    let filter_tags: Vec<String> = analyzer
        .selector_path
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_uppercase())
        .collect();

    // Parse TES4 header first to map master indices -> master plugin filenames
    let tes4_size = read_le_u32(&bytes[4..8]) as usize;
    let tes4_end = 24usize.saturating_add(tes4_size).min(bytes.len());
    let mut masters: Vec<String> = Vec::new();
    let mut hp = 24usize;
    while hp + 6 <= tes4_end {
        let sub = &bytes[hp..hp + 4];
        let slen = read_le_u16(&bytes[hp + 4..hp + 6]) as usize;
        let d_start = hp + 6;
        let d_end = d_start.saturating_add(slen).min(tes4_end);
        if sub == b"MAST" {
            let m = String::from_utf8_lossy(&bytes[d_start..d_end])
                .trim_end_matches('\0')
                .trim()
                .to_ascii_lowercase();
            if !m.is_empty() {
                masters.push(m);
            }
        }
        hp = d_end;
    }

    let self_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("plugin")
        .to_ascii_lowercase();

    let mut keys = Vec::new();
    let mut pos = tes4_end;
    while pos + 24 <= bytes.len() && keys.len() < MAX_RECORD_KEYS {
        let tag_bytes = &bytes[pos..pos + 4];
        let tag = String::from_utf8_lossy(tag_bytes).to_string();
        let data_size = read_le_u32(&bytes[pos + 4..pos + 8]) as usize;
        if tag_bytes == b"GRUP" {
            pos += 24;
            continue;
        }
        let form_id = read_le_u32(&bytes[pos + 12..pos + 16]);
        let next_pos = pos.saturating_add(24).saturating_add(data_size);
        if next_pos <= pos || next_pos > bytes.len() {
            break;
        }

        if filter_tags.is_empty() || filter_tags.iter().any(|ft| ft == &tag) {
            let master_idx = ((form_id >> 24) & 0xFF) as usize;
            let owner_master = if master_idx < masters.len() {
                masters[master_idx].as_str()
            } else {
                self_name.as_str()
            };
            keys.push(format!("rec:{}:{}:{:06x}", owner_master, tag, form_id & 0x00FF_FFFF));
        }
        pos = next_pos;
    }
    keys
}

pub fn extract_selector_path_keys(
    path: &Path,
    analyzer: &SchemaConflictAnalyzer,
) -> Vec<String> {
    let Ok(meta) = std::fs::metadata(path) else {
        return Vec::new();
    };
    if meta.len() == 0 || meta.len() > MAX_TEXT_SCAN_BYTES as u64 {
        return Vec::new();
    }
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };

    let selectors: Vec<String> = analyzer
        .selector_path
        .as_deref()
        .unwrap_or("defName")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();

    let mut keys = Vec::new();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if ext == "json" {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(obj) = val.as_object() {
                for sel in &selectors {
                    if let Some(v) = obj.get(sel) {
                        if let Some(s) = v.as_str() {
                            keys.push(format!("json:{}:{}", sel.to_lowercase(), s.to_lowercase()));
                        } else if let Some(arr) = v.as_array() {
                            for item in arr.iter().take(MAX_TOC_ENTRIES) {
                                if let Some(target) = item.get("Target").and_then(|x| x.as_str()) {
                                    keys.push(format!("json:{}:{}", sel.to_lowercase(), target.to_lowercase()));
                                }
                            }
                        }
                    }
                }
            }
        }
        return keys;
    }

    // XML / Defs tag extraction (`<defName>...</defName>`, `<id>...</id>`, etc.)
    let raw_lower = raw.to_ascii_lowercase();
    for sel in &selectors {
        let open = format!("<{}>", sel.to_ascii_lowercase());
        let close = format!("</{}>", sel.to_ascii_lowercase());
        let mut cursor = 0usize;
        while let Some(rel_start) = raw_lower[cursor..].find(&open) {
            let content_start = cursor + rel_start + open.len();
            let Some(rel_end) = raw_lower[content_start..].find(&close) else {
                break;
            };
            let val = raw[content_start..content_start + rel_end].trim();
            if !val.is_empty() && !val.contains('<') {
                keys.push(format!("xml:{}:{}", sel.to_ascii_lowercase(), val.to_lowercase()));
                if keys.len() >= MAX_TOC_ENTRIES {
                    return keys;
                }
            }
            cursor = content_start + rel_end + close.len();
        }
    }
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tes4_grup_and_selector_path_extraction() {
        let root = std::env::temp_dir().join("sanctuary_radar_containers_unit_test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // Build minimal TES4 + GRUP + WEAP plugin
        let mut tes4_sub = Vec::new();
        tes4_sub.extend_from_slice(b"MAST");
        tes4_sub.extend_from_slice(&(11u16.to_le_bytes()));
        tes4_sub.extend_from_slice(b"Master.esm\0");

        let mut plugin = Vec::new();
        plugin.extend_from_slice(b"TES4");
        plugin.extend_from_slice(&(tes4_sub.len() as u32).to_le_bytes());
        plugin.extend_from_slice(&[0u8; 16]);
        plugin.extend_from_slice(&tes4_sub);

        let mut rec = Vec::new();
        rec.extend_from_slice(b"WEAP");
        rec.extend_from_slice(&(4u32.to_le_bytes())); // data_size
        rec.extend_from_slice(&[0u8; 4]); // flags
        rec.extend_from_slice(&(0x0000_1234u32.to_le_bytes())); // master index 0 -> Master.esm
        rec.extend_from_slice(&[0u8; 8]); // remaining header
        rec.extend_from_slice(&[0u8; 4]); // payload

        plugin.extend_from_slice(b"GRUP");
        plugin.extend_from_slice(&((24 + rec.len()) as u32).to_le_bytes());
        plugin.extend_from_slice(&[0u8; 16]);
        plugin.extend_from_slice(&rec);

        let esp_path = root.join("TestPatch.esp");
        std::fs::write(&esp_path, &plugin).unwrap();

        let esp_analyzer = SchemaConflictAnalyzer {
            id: "tes".into(),
            analyzer_type: "chunked_record_stream".into(),
            extensions: vec![".esp".into()],
            magic_bytes: None,
            header_offset: None,
            index_count_offset: None,
            index_offset_pos: None,
            entry_size: None,
            key_size: None,
            endian: None,
            bitmask_constant_header: None,
            selector_path: Some("WEAP".into()),
        };
        let rec_keys = extract_chunked_record_keys(&esp_path, &esp_analyzer);
        assert_eq!(rec_keys, vec!["rec:master.esm:WEAP:001234".to_string()]);

        let json_path = root.join("content.json");
        std::fs::write(&json_path, r#"{"Changes":[{"Target":"Data/Maps/Farm"}]}"#).unwrap();
        let json_analyzer = SchemaConflictAnalyzer {
            id: "cp".into(),
            analyzer_type: "selector_path".into(),
            extensions: vec![".json".into()],
            magic_bytes: None,
            header_offset: None,
            index_count_offset: None,
            index_offset_pos: None,
            entry_size: None,
            key_size: None,
            endian: None,
            bitmask_constant_header: None,
            selector_path: Some("Changes".into()),
        };
        let sel_keys = extract_selector_path_keys(&json_path, &json_analyzer);
        assert_eq!(sel_keys, vec!["json:changes:data/maps/farm".to_string()]);

        let _ = std::fs::remove_dir_all(&root);
    }
}
