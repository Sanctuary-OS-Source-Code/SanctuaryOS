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

#[derive(Debug, Clone)]
pub(crate) struct LspkFileEntry {
    pub name: String,
    pub offset: u64,
    pub archive_part: u8,
    pub flags: u8,
    pub size_on_disk: u64,
    pub uncompressed_size: u64,
}

fn read_lspk_entry_name(slice: &[u8]) -> String {
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    String::from_utf8_lossy(&slice[..end])
        .trim()
        .replace('\\', "/")
}

pub(crate) fn parse_lspk_index(
    file: &mut BufReader<File>,
    file_len: u64,
) -> Vec<LspkFileEntry> {
    if file_len < 24 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 32];
    let to_read = (file_len as usize).min(32);
    if file.read_exact(&mut hdr[..to_read]).is_err() || &hdr[0..4] != b"LSPK" {
        return Vec::new();
    }
    let version = read_le_u32(&hdr[4..8]);
    let (list_offset, list_size) = if version >= 15 {
        (read_le_u64(&hdr[8..16]), read_le_u32(&hdr[16..20]) as u64)
    } else {
        (0u64, 0u64)
    };
    if list_offset == 0 || list_offset >= file_len || list_size < 8 || list_size > 16 * 1024 * 1024 {
        return Vec::new();
    }
    if file.seek(SeekFrom::Start(list_offset)).is_err() {
        return Vec::new();
    }
    let mut header_meta = [0u8; 8];
    if file.read_exact(&mut header_meta).is_err() {
        return Vec::new();
    }
    let num_files = (read_le_u32(&header_meta[0..4]) as usize).min(100_000);
    let compressed_size = read_le_u32(&header_meta[4..8]) as usize;
    let entry_size = if version >= 18 { 272usize } else { 296usize };
    let expected_uncompressed = num_files.saturating_mul(entry_size);
    if num_files == 0 || expected_uncompressed > 32 * 1024 * 1024 || compressed_size > 16 * 1024 * 1024 {
        return Vec::new();
    }

    let remaining = (file_len - list_offset - 8) as usize;
    let read_len = compressed_size.min(remaining);
    let mut comp_buf = vec![0u8; read_len];
    if file.read_exact(&mut comp_buf).is_err() {
        return Vec::new();
    }

    let raw_table = if read_len == expected_uncompressed {
        comp_buf
    } else {
        match lz4_flex::block::decompress(&comp_buf, expected_uncompressed) {
            Ok(decompressed) => decompressed,
            Err(_) => {
                // Fallback for zlib-compressed or edge-padded tables
                let mut z_out = Vec::new();
                if comp_buf.starts_with(&[0x78]) {
                    let z = ZlibDecoder::new(comp_buf.as_slice());
                    let _ = z.take(expected_uncompressed as u64).read_to_end(&mut z_out);
                }
                z_out
            }
        }
    };

    let mut out = Vec::with_capacity(num_files.min(MAX_TOC_ENTRIES));
    for chunk in raw_table.chunks_exact(entry_size) {
        let name = read_lspk_entry_name(&chunk[0..256]);
        if name.is_empty() {
            continue;
        }
        if version >= 18 {
            let off_lo = read_le_u32(&chunk[256..260]) as u64;
            let off_hi = read_le_u16(&chunk[260..262]) as u64;
            let offset = off_lo | (off_hi << 32);
            let archive_part = chunk[262];
            let flags = chunk[263];
            let size_on_disk = read_le_u32(&chunk[264..268]) as u64;
            let uncompressed_size = read_le_u32(&chunk[268..272]) as u64;
            out.push(LspkFileEntry {
                name,
                offset,
                archive_part,
                flags,
                size_on_disk,
                uncompressed_size,
            });
        } else {
            let offset = read_le_u64(&chunk[256..264]);
            let size_on_disk = read_le_u64(&chunk[264..272]);
            let uncompressed_size = read_le_u64(&chunk[272..280]);
            let archive_part = chunk[280];
            let flags = chunk[284];
            out.push(LspkFileEntry {
                name,
                offset,
                archive_part,
                flags,
                size_on_disk,
                uncompressed_size,
            });
        }
    }
    out
}

pub(crate) fn read_lspk_entry_bytes(
    file: &mut BufReader<File>,
    file_len: u64,
    entry: &LspkFileEntry,
) -> Option<Vec<u8>> {
    if entry.archive_part != 0
        || entry.size_on_disk == 0
        || entry.size_on_disk > 4 * 1024 * 1024
        || entry.uncompressed_size > 8 * 1024 * 1024
        || entry.offset.saturating_add(entry.size_on_disk) > file_len
    {
        return None;
    }
    file.seek(SeekFrom::Start(entry.offset)).ok()?;
    let mut buf = vec![0u8; entry.size_on_disk as usize];
    file.read_exact(&mut buf).ok()?;
    match entry.flags & 0x0F {
        0 => Some(buf),
        1 => {
            let mut out = Vec::new();
            let z = ZlibDecoder::new(buf.as_slice());
            z.take(8 * 1024 * 1024).read_to_end(&mut out).ok()?;
            Some(out)
        }
        2 => {
            if entry.uncompressed_size == 0 {
                return Some(buf);
            }
            lz4_flex::block::decompress(&buf, entry.uncompressed_size as usize).ok()
        }
        _ => None,
    }
}

fn extract_lspk_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    let entries = parse_lspk_index(file, file_len);
    if !entries.is_empty() {
        return entries
            .into_iter()
            .take(MAX_TOC_ENTRIES)
            .map(|e| format!("lspk:{}", e.name.to_lowercase()))
            .collect();
    }

    // Legacy / pre-v15 printable-path scan fallback
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

fn extract_ue_iostore_utoc_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 60 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 60];
    if file.read_exact(&mut hdr).is_err() || &hdr[0..16] != b"-==--==--==--==-" {
        return Vec::new();
    }
    let header_size = read_le_u32(&hdr[20..24]) as u64;
    let toc_entry_count = (read_le_u32(&hdr[24..28]) as usize).min(MAX_TOC_ENTRIES);
    if toc_entry_count == 0
        || header_size < 60
        || header_size.saturating_add((toc_entry_count as u64).saturating_mul(12)) > file_len
    {
        return Vec::new();
    }
    if file.seek(SeekFrom::Start(header_size)).is_err() {
        return Vec::new();
    }
    let mut ids_buf = vec![0u8; toc_entry_count * 12];
    if file.read_exact(&mut ids_buf).is_err() {
        return Vec::new();
    }
    let mut keys = Vec::with_capacity(toc_entry_count.min(512));
    for chunk in ids_buf.chunks_exact(12) {
        if chunk.iter().any(|&b| b != 0) {
            keys.push(format!("utoc:{}", hex::encode(chunk)));
        }
    }
    keys
}

fn extract_redengine_rdar_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 28 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 28];
    if file.read_exact(&mut hdr).is_err() || &hdr[0..4] != b"RDAR" {
        return Vec::new();
    }
    let index_offset = read_le_u64(&hdr[8..16]);
    let index_size = read_le_u32(&hdr[16..20]) as u64;
    if index_offset == 0 || index_size < 28 || index_offset.saturating_add(28) > file_len {
        return Vec::new();
    }
    if file.seek(SeekFrom::Start(index_offset)).is_err() {
        return Vec::new();
    }
    let mut toc_hdr = [0u8; 28];
    if file.read_exact(&mut toc_hdr).is_err() {
        return Vec::new();
    }
    let file_table_offset = read_le_u32(&toc_hdr[0..4]);
    let file_entry_count = (read_le_u32(&toc_hdr[16..20]) as usize).min(MAX_TOC_ENTRIES);
    if file_entry_count == 0 {
        return Vec::new();
    }
    let entries_start = if file_table_offset >= 28 && (file_table_offset as u64) < index_size {
        index_offset.saturating_add(file_table_offset as u64)
    } else {
        index_offset.saturating_add(28)
    };
    let stride = if entries_start.saturating_add((file_entry_count as u64).saturating_mul(56)) <= file_len {
        56usize
    } else if entries_start.saturating_add((file_entry_count as u64).saturating_mul(40)) <= file_len {
        40usize
    } else {
        return Vec::new();
    };
    if file.seek(SeekFrom::Start(entries_start)).is_err() {
        return Vec::new();
    }
    let mut entries_buf = vec![0u8; file_entry_count * stride];
    if file.read_exact(&mut entries_buf).is_err() {
        return Vec::new();
    }
    let mut keys = Vec::with_capacity(file_entry_count.min(512));
    for rec in entries_buf.chunks_exact(stride) {
        let name_hash = read_le_u64(&rec[0..8]);
        if name_hash != 0 {
            keys.push(format!("rdar:{:016x}", name_hash));
        }
    }
    keys
}

fn read_c_string_from_table(names_buf: &[u8], off: usize) -> String {
    if off >= names_buf.len() {
        return String::new();
    }
    let end = names_buf[off..]
        .iter()
        .position(|&b| b == 0)
        .map(|rel| off + rel)
        .unwrap_or(names_buf.len());
    String::from_utf8_lossy(&names_buf[off..end])
        .trim()
        .replace('\\', "/")
        .to_lowercase()
}

fn walk_rpf7_directory(
    entries_buf: &[u8],
    entry_count: usize,
    names_buf: &[u8],
    dir_idx: usize,
    prefix: &str,
    visited_dirs: &mut Vec<bool>,
    depth: usize,
    out_keys: &mut Vec<String>,
) {
    if depth > 16 || dir_idx >= entry_count || visited_dirs[dir_idx] || out_keys.len() >= MAX_TOC_ENTRIES {
        return;
    }
    visited_dirs[dir_idx] = true;
    let base = dir_idx * 16;
    if base + 16 > entries_buf.len() {
        return;
    }
    let marker = read_le_u32(&entries_buf[base + 4..base + 8]);
    if marker != 0x7FFF_FF00 {
        return;
    }
    let children_idx = read_le_u32(&entries_buf[base + 8..base + 12]) as usize;
    let children_cnt = (read_le_u32(&entries_buf[base + 12..base + 16]) as usize).min(MAX_TOC_ENTRIES);
    if children_idx >= entry_count {
        return;
    }
    let end_idx = children_idx.saturating_add(children_cnt).min(entry_count);

    for child_i in children_idx..end_idx {
        if out_keys.len() >= MAX_TOC_ENTRIES {
            break;
        }
        let cbase = child_i * 16;
        if cbase + 16 > entries_buf.len() {
            break;
        }
        let name_off = read_le_u16(&entries_buf[cbase..cbase + 2]) as usize;
        let child_name = read_c_string_from_table(names_buf, name_off);
        let child_vpath = if prefix.is_empty() {
            child_name.clone()
        } else if child_name.is_empty() {
            prefix.to_string()
        } else {
            format!("{}/{}", prefix, child_name)
        };
        let c_marker = read_le_u32(&entries_buf[cbase + 4..cbase + 8]);
        if c_marker == 0x7FFF_FF00 {
            walk_rpf7_directory(
                entries_buf,
                entry_count,
                names_buf,
                child_i,
                &child_vpath,
                visited_dirs,
                depth + 1,
                out_keys,
            );
        } else if !child_vpath.is_empty() {
            out_keys.push(format!("rpf7:{}", child_vpath));
        }
    }
}

fn extract_rage_rpf7_toc(file: &mut BufReader<File>, file_len: u64) -> Vec<String> {
    if file_len < 32 || file.seek(SeekFrom::Start(0)).is_err() {
        return Vec::new();
    }
    let mut hdr = [0u8; 16];
    if file.read_exact(&mut hdr).is_err() {
        return Vec::new();
    }
    let magic_u32 = read_le_u32(&hdr[0..4]);
    if &hdr[0..4] != b"RPF7" && magic_u32 != 0x5250_4637 {
        return Vec::new();
    }
    let entry_count = (read_le_u32(&hdr[4..8]) as usize).min(MAX_TOC_ENTRIES);
    let names_len = (read_le_u32(&hdr[8..12]) as usize).min(4 * 1024 * 1024);
    let enc_flag = read_le_u32(&hdr[12..16]);
    // Only parse OPEN/unencrypted RPF7 tables directly without guessing proprietary keys
    if enc_flag != 0 && enc_flag != 0x4E45_504F {
        return Vec::new();
    }
    let table_bytes = (entry_count as u64).saturating_mul(16);
    if entry_count == 0
        || names_len == 0
        || 16u64.saturating_add(table_bytes).saturating_add(names_len as u64) > file_len
    {
        return Vec::new();
    }
    let mut entries_buf = vec![0u8; table_bytes as usize];
    let mut names_buf = vec![0u8; names_len];
    if file.read_exact(&mut entries_buf).is_err() || file.read_exact(&mut names_buf).is_err() {
        return Vec::new();
    }
    let mut keys = Vec::new();
    let mut visited_dirs = vec![false; entry_count];
    walk_rpf7_directory(
        &entries_buf,
        entry_count,
        &names_buf,
        0,
        "",
        &mut visited_dirs,
        0,
        &mut keys,
    );
    keys
}

pub fn extract_container_toc_keys(
    path: &Path,
    analyzer: &SchemaConflictAnalyzer,
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

    let explicit_fmt = analyzer
        .container_format
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .to_ascii_lowercase();
    match explicit_fmt.as_str() {
        "utoc" => return extract_ue_iostore_utoc_toc(&mut file, file_len),
        "rdar" => return extract_redengine_rdar_toc(&mut file, file_len),
        "rpf7" => return extract_rage_rpf7_toc(&mut file, file_len),
        "bsa" => return extract_bsa_toc(&mut file, file_len),
        "ba2" => return extract_ba2_toc(&mut file, file_len),
        "lspk" => return extract_lspk_toc(&mut file, file_len),
        "pak" => return extract_unreal_pak_toc(&mut file, file_len),
        _ => {}
    }

    let mut magic = [0u8; 16];
    let magic_read = file.read(&mut magic).unwrap_or(0);
    if magic_read < 4 {
        return Vec::new();
    }

    if magic_read == 16 && &magic[0..16] == b"-==--==--==--==-" {
        return extract_ue_iostore_utoc_toc(&mut file, file_len);
    }
    if &magic[0..4] == b"RDAR" {
        return extract_redengine_rdar_toc(&mut file, file_len);
    }
    if &magic[0..4] == b"RPF7" || read_le_u32(&magic[0..4]) == 0x5250_4637 {
        return extract_rage_rpf7_toc(&mut file, file_len);
    }
    if &magic[0..4] == b"BSA\0" {
        return extract_bsa_toc(&mut file, file_len);
    }
    if &magic[0..4] == b"BTDX" {
        return extract_ba2_toc(&mut file, file_len);
    }
    if &magic[0..4] == b"LSPK" {
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
            selector_path: Some("WEAP".into()),
            ..Default::default()
        };
        let rec_keys = extract_chunked_record_keys(&esp_path, &esp_analyzer);
        assert_eq!(rec_keys, vec!["rec:master.esm:WEAP:001234".to_string()]);

        let json_path = root.join("content.json");
        std::fs::write(&json_path, r#"{"Changes":[{"Target":"Data/Maps/Farm"}]}"#).unwrap();
        let json_analyzer = SchemaConflictAnalyzer {
            id: "cp".into(),
            analyzer_type: "selector_path".into(),
            extensions: vec![".json".into()],
            selector_path: Some("Changes".into()),
            ..Default::default()
        };
        let sel_keys = extract_selector_path_keys(&json_path, &json_analyzer);
        assert_eq!(sel_keys, vec!["json:changes:data/maps/farm".to_string()]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_utoc_rdar_and_rpf7_container_toc_extraction() {
        let root = std::env::temp_dir().join(format!("sanctuary_radar_v2_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();

        // 1. Unreal IoStore .utoc minimal container
        let utoc_path = root.join("ModChunk.utoc");
        let mut utoc = vec![0u8; 60];
        utoc[0..16].copy_from_slice(b"-==--==--==--==-");
        utoc[20..24].copy_from_slice(&60u32.to_le_bytes()); // header_size
        utoc[24..28].copy_from_slice(&2u32.to_le_bytes()); // toc_entry_count
        utoc.extend_from_slice(&[0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x01, 0x00, 0x00, 0x05]);
        utoc.extend_from_slice(&[0xAA, 0xBB, 0xCC, 0xDD, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x05]);
        std::fs::write(&utoc_path, &utoc).unwrap();
        let utoc_keys = extract_container_toc_keys(&utoc_path, &SchemaConflictAnalyzer::default());
        assert_eq!(utoc_keys.len(), 2);
        assert_eq!(utoc_keys[0], "utoc:112233445566778801000005");

        // 2. REDengine .archive (RDAR) container
        let rdar_path = root.join("NightCityPatch.archive");
        let mut rdar = vec![0u8; 28 + 28 + 56];
        rdar[0..4].copy_from_slice(b"RDAR");
        rdar[8..16].copy_from_slice(&28u64.to_le_bytes()); // index_offset
        rdar[16..20].copy_from_slice(&(28u32 + 56u32).to_le_bytes()); // index_size
        // TOC header at offset 28
        rdar[28..32].copy_from_slice(&28u32.to_le_bytes()); // file_table_offset relative to index_offset
        rdar[28 + 16..28 + 20].copy_from_slice(&1u32.to_le_bytes()); // file_entry_count
        // Record at offset 56 (stride 56)
        rdar[56..64].copy_from_slice(&0xCAFE_BABE_1234_5678u64.to_le_bytes());
        std::fs::write(&rdar_path, &rdar).unwrap();
        let rdar_keys = extract_container_toc_keys(&rdar_path, &SchemaConflictAnalyzer::default());
        assert_eq!(rdar_keys, vec!["rdar:cafebabe12345678".to_string()]);

        // 3. RAGE OPEN .rpf (RPF7) container
        let rpf_path = root.join("dlc.rpf");
        let names = b"\0common\0handling.meta\0";
        let mut rpf = Vec::new();
        rpf.extend_from_slice(b"RPF7");
        rpf.extend_from_slice(&3u32.to_le_bytes()); // entry_count: root dir(0), subdir common(1), file handling.meta(2)
        rpf.extend_from_slice(&(names.len() as u32).to_le_bytes());
        rpf.extend_from_slice(&0x4E45_504Fu32.to_le_bytes()); // OPEN unencrypted
        // Entry 0: root dir (children 1..2)
        rpf.extend_from_slice(&[0, 0, 0, 0]);
        rpf.extend_from_slice(&0x7FFF_FF00u32.to_le_bytes());
        rpf.extend_from_slice(&1u32.to_le_bytes());
        rpf.extend_from_slice(&1u32.to_le_bytes());
        // Entry 1: common dir (name_off = 1, children 2..3)
        rpf.extend_from_slice(&1u16.to_le_bytes());
        rpf.extend_from_slice(&[0, 0]);
        rpf.extend_from_slice(&0x7FFF_FF00u32.to_le_bytes());
        rpf.extend_from_slice(&2u32.to_le_bytes());
        rpf.extend_from_slice(&1u32.to_le_bytes());
        // Entry 2: handling.meta file (name_off = 8)
        rpf.extend_from_slice(&8u16.to_le_bytes());
        rpf.extend_from_slice(&[0; 14]);
        rpf.extend_from_slice(names);
        std::fs::write(&rpf_path, &rpf).unwrap();
        let rpf_keys = extract_container_toc_keys(&rpf_path, &SchemaConflictAnalyzer::default());
        assert_eq!(rpf_keys, vec!["rpf7:common/handling.meta".to_string()]);

        let _ = std::fs::remove_dir_all(&root);
    }
}
