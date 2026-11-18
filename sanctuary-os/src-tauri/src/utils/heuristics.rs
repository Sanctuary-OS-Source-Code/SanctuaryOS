#![allow(unused_imports)]
use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use super::archive_ops::*;
use super::db_cache::*;
use super::fs_ops::*;
use super::path_security::*;

pub fn compute_signatures_version(signatures: &[HeuristicSignature]) -> u64 {
    let mut enabled_rules: Vec<String> = signatures
        .iter()
        .filter(|s| s.enabled)
        .map(|s| {
            format!(
                "{}|{}|{}|{}",
                s.id.trim().to_lowercase(),
                s.match_type.trim().to_lowercase(),
                s.severity.trim().to_lowercase(),
                s.signature.trim().to_lowercase()
            )
        })
        .collect();
    if enabled_rules.is_empty() {
        return 1;
    }
    enabled_rules.sort();
    let mut hasher = Sha256::new();
    for rule in &enabled_rules {
        hasher.update(rule.as_bytes());
        hasher.update(b"\n");
    }
    let digest = hasher.finalize();
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    ((u64::from_le_bytes(bytes)) & 0x0000_FFFF_FFFF_FFFF).max(1)
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HeuristicMatchDetail {
    pub signature: String,
    pub matched_entry: Option<String>,
    pub detection_type: String,
}

#[derive(Clone)]
pub struct CompiledClause {
    pub rule_idx: usize,
    pub clause_bit: u32,
    pub lower_bytes: Vec<u8>,
    pub pyc_tokens: Vec<Vec<u8>>,
    pub requires_leading_boundary: bool,
}

#[derive(Clone)]
pub struct CompiledContentRule {
    pub original: String,
    pub required_mask: u32,
}

#[derive(Clone, Default)]
pub struct CompiledSignatures {
    pub is_empty: bool,
    pub file_name_exact: Vec<(String, String)>,
    pub file_name_contains: Vec<(String, String)>,
    pub archive_entry_exact: Vec<(String, String)>,
    pub archive_entry_contains: Vec<(String, String)>,
    pub content_rules: Vec<CompiledContentRule>,
    pub clauses: Vec<CompiledClause>,
    pub by_first_byte: Vec<Vec<usize>>,
}

pub(super) fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

pub(super) fn is_path_sep_byte(b: u8) -> bool {
    b == b'/' || b == b'\\'
}

pub(super) fn normalize_sig_bytes(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i].to_ascii_lowercase();
        if is_path_sep_byte(b) {
            out.push(b'/');
            while i + 1 < bytes.len() && is_path_sep_byte(bytes[i + 1]) {
                i += 1;
            }
        } else {
            out.push(b);
        }
        i += 1;
    }
    out
}

pub(super) fn default_baseline_heuristic_rules() -> Vec<(&'static str, &'static str)> {
    vec![
        ("discord.com/api/webhooks", "file_content_contains"),
        ("discordapp.com/api/webhooks", "file_content_contains"),
        ("api.telegram.org/bot", "file_content_contains"),
        ("Local Storage\\leveldb", "file_content_contains"),
        ("User Data\\Default\\Login Data", "file_content_contains"),
        ("Default\\Network\\Cookies", "file_content_contains"),
        (".ROBLOSECURITY", "file_content_contains"),
        ("CryptUnprotectData", "file_content_contains"),
        ("powershell -enc", "file_content_contains"),
        ("powershell -w hidden", "file_content_contains"),
        ("powershell -windowstyle hidden", "file_content_contains"),
        ("subprocess.Popen( + powershell", "file_content_contains"),
        ("subprocess.Popen( + cmd.exe", "file_content_contains"),
        ("os.system( + powershell", "file_content_contains"),
        ("os.system( + cmd.exe /c", "file_content_contains"),
        ("base64.b64decode( + exec(", "file_content_contains"),
        ("base64.b64decode( + eval(", "file_content_contains"),
        ("zlib.decompress( + exec(", "file_content_contains"),
        ("marshal.loads( + exec(", "file_content_contains"),
        ("urllib.request.urlopen( + exec(", "file_content_contains"),
        ("__import__('os') + system(", "file_content_contains"),
        ("__import__(\"os\") + system(", "file_content_contains"),
        ("WriteProcessMemory + CreateRemoteThread", "file_content_contains"),
        ("URLDownloadToFile", "file_content_contains"),
        ("WScript.Shell", "file_content_contains"),
        ("DownloadString(", "file_content_contains"),
        ("DisableRealtimeMonitoring", "file_content_contains"),
        ("Add-MpPreference + ExclusionPath", "file_content_contains"),
        ("certutil -urlcache", "file_content_contains"),
        ("vssadmin delete shadows", "file_content_contains"),
        ("grabber.py", "file_name_exact"),
        ("stealer.exe", "file_name_exact"),
        (".vbs", "file_name_contains"),
        (".hta", "file_name_contains"),
        (".scr", "file_name_contains"),
    ]
}

impl CompiledSignatures {
    fn add_rule(&mut self, signature_orig: &str, match_type: &str) {
        let trimmed = signature_orig.trim();
        if trimmed.is_empty() {
            return;
        }
        self.is_empty = false;
        let sig_lower = trimmed.to_lowercase();
        let mt = match_type.trim().to_lowercase();

        match mt.as_str() {
            "file_name_exact" => {
                if !self.file_name_exact.iter().any(|(s, _)| s == &sig_lower) {
                    self.file_name_exact.push((sig_lower, trimmed.to_string()));
                }
            }
            "file_name_contains" => {
                if !self.file_name_contains.iter().any(|(s, _)| s == &sig_lower) {
                    self.file_name_contains.push((sig_lower, trimmed.to_string()));
                }
            }
            "archive_entry_exact" => {
                if !self.archive_entry_exact.iter().any(|(s, _)| s == &sig_lower) {
                    self.archive_entry_exact.push((sig_lower, trimmed.to_string()));
                }
            }
            "archive_entry_contains" => {
                if !self.archive_entry_contains.iter().any(|(s, _)| s == &sig_lower) {
                    self.archive_entry_contains.push((sig_lower, trimmed.to_string()));
                }
            }
            _ => {
                if self
                    .content_rules
                    .iter()
                    .any(|r| r.original.eq_ignore_ascii_case(trimmed))
                {
                    return;
                }
                // Support compound heuristic rules joined by " + " or " && "
                let raw_parts: Vec<&str> = sig_lower
                    .split(" + ")
                    .flat_map(|p| p.split(" && "))
                    .map(|p| p.trim())
                    .filter(|p| !p.is_empty())
                    .take(32)
                    .collect();

                if raw_parts.is_empty() {
                    return;
                }

                let rule_idx = self.content_rules.len();
                let mut required_mask: u32 = 0;

                for (part_idx, part) in raw_parts.iter().enumerate() {
                    let lower_bytes = normalize_sig_bytes(part);
                    if lower_bytes.is_empty() {
                        continue;
                    }
                    let clause_bit = 1u32 << part_idx;
                    required_mask |= clause_bit;

                    let pyc_tokens: Vec<Vec<u8>> = if part.contains('.')
                        || part.contains('(')
                        || part.contains('/')
                        || part.contains('\\')
                        || part.contains(' ')
                        || part.contains('-')
                    {
                        part.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                            .filter(|t| t.len() >= 2)
                            .map(|t| t.as_bytes().to_vec())
                            .collect()
                    } else {
                        Vec::new()
                    };

                    let requires_leading_boundary = is_ident_byte(lower_bytes[0])
                        && lower_bytes.ends_with(b"(")
                        && !lower_bytes.contains(&b'.');

                    let clause_idx = self.clauses.len();
                    let first_b = lower_bytes[0] as usize;
                    self.by_first_byte[first_b].push(clause_idx);
                    if first_b == (b'/' as usize) {
                        self.by_first_byte[b'\\' as usize].push(clause_idx);
                    }
                    self.clauses.push(CompiledClause {
                        rule_idx,
                        clause_bit,
                        lower_bytes,
                        pyc_tokens,
                        requires_leading_boundary,
                    });
                }

                if required_mask != 0 {
                    self.content_rules.push(CompiledContentRule {
                        original: trimmed.to_string(),
                        required_mask,
                    });
                }
            }
        }
    }

    pub fn new(signatures: &[HeuristicSignature]) -> Self {
        let mut compiled = CompiledSignatures {
            is_empty: true,
            file_name_exact: Vec::new(),
            file_name_contains: Vec::new(),
            archive_entry_exact: Vec::new(),
            archive_entry_contains: Vec::new(),
            content_rules: Vec::new(),
            clauses: Vec::new(),
            by_first_byte: vec![Vec::new(); 256],
        };

        let mut disabled_sigs = std::collections::HashSet::new();
        for sig in signatures {
            if !sig.enabled {
                disabled_sigs.insert(sig.signature.trim().to_lowercase());
                continue;
            }
            let sev = sig.severity.trim();
            if !sev.is_empty()
                && !sev.eq_ignore_ascii_case("malware")
                && !sev.eq_ignore_ascii_case("critical")
                && !sev.eq_ignore_ascii_case("high")
            {
                continue;
            }
            compiled.add_rule(&sig.signature, &sig.match_type);
        }

        for (base_sig, base_type) in default_baseline_heuristic_rules() {
            if !disabled_sigs.contains(&base_sig.to_lowercase()) {
                compiled.add_rule(base_sig, base_type);
            }
        }

        compiled
    }
}

pub(super) fn match_normalized_ascii_at(buffer: &[u8], start: usize, pattern: &[u8]) -> bool {
    let mut b_idx = start;
    let mut p_idx = 0;
    while p_idx < pattern.len() {
        if b_idx >= buffer.len() {
            return false;
        }
        let pb = pattern[p_idx];
        let bb = buffer[b_idx].to_ascii_lowercase();
        if pb == b'/' {
            if !is_path_sep_byte(bb) {
                return false;
            }
            b_idx += 1;
            // Collapse escaped double backslashes or repeated slashes in source/JSON/binary
            while b_idx < buffer.len() && is_path_sep_byte(buffer[b_idx]) {
                b_idx += 1;
            }
            p_idx += 1;
        } else {
            if bb != pb {
                return false;
            }
            b_idx += 1;
            p_idx += 1;
        }
    }
    true
}

pub(super) fn decode_base64_slice(input: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity((input.len() * 3) / 4);
    let mut buf: u32 = 0;
    let mut bits: u8 = 0;
    for &b in input {
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            b' ' | b'\r' | b'\n' | b'\t' => continue,
            _ => return None,
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    if out.len() >= 12 {
        Some(out)
    } else {
        None
    }
}

pub(super) fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub(super) fn scan_raw_buffer_core(
    buffer: &[u8],
    compiled: &CompiledSignatures,
    rule_masks: &mut [u32],
) -> Option<(String, &'static str)> {
    if buffer.is_empty() || compiled.clauses.is_empty() {
        return None;
    }

    let buf_len = buffer.len();

    // 1 & 2. Single-pass zero-allocation ASCII/UTF-8 (with path separator normalization) + UTF-16LE wide-string scan
    for i in 0..buf_len {
        let b0_lower = buffer[i].to_ascii_lowercase();
        let candidates = &compiled.by_first_byte[b0_lower as usize];
        if candidates.is_empty() {
            continue;
        }

        let is_wide_candidate = i + 1 < buf_len && buffer[i + 1] == 0;

        for &clause_idx in candidates {
            let clause = &compiled.clauses[clause_idx];
            if (rule_masks[clause.rule_idx] & clause.clause_bit) != 0 {
                continue;
            }
            let sb = &clause.lower_bytes;
            let slen = sb.len();

            if i + slen <= buf_len
                && (!clause.requires_leading_boundary
                    || i == 0
                    || (!is_ident_byte(buffer[i - 1]) && buffer[i - 1] != b'.'))
                && match_normalized_ascii_at(buffer, i, sb)
            {
                rule_masks[clause.rule_idx] |= clause.clause_bit;
                let rule = &compiled.content_rules[clause.rule_idx];
                if rule_masks[clause.rule_idx] == rule.required_mask {
                    return Some((rule.original.clone(), "heuristic_content"));
                }
                continue;
            }

            // Check UTF-16LE wide-string match in-place
            if is_wide_candidate
                && i + slen * 2 <= buf_len
                && (!clause.requires_leading_boundary
                    || i < 2
                    || (!is_ident_byte(buffer[i - 2]) && buffer[i - 2] != b'.'))
            {
                let last_pos = i + (slen - 1) * 2;
                let last_b = buffer[last_pos].to_ascii_lowercase();
                let last_ok = if sb[slen - 1] == b'/' {
                    is_path_sep_byte(last_b)
                } else {
                    last_b == sb[slen - 1]
                };
                if last_ok && buffer[last_pos + 1] == 0 {
                    let mut wide_matched = true;
                    for k in 1..(slen.saturating_sub(1)) {
                        let pos = i + k * 2;
                        let cb = buffer[pos].to_ascii_lowercase();
                        let char_ok = if sb[k] == b'/' {
                            is_path_sep_byte(cb)
                        } else {
                            cb == sb[k]
                        };
                        if !char_ok || buffer[pos + 1] != 0 {
                            wide_matched = false;
                            break;
                        }
                    }
                    if wide_matched {
                        rule_masks[clause.rule_idx] |= clause.clause_bit;
                        let rule = &compiled.content_rules[clause.rule_idx];
                        if rule_masks[clause.rule_idx] == rule.required_mask {
                            return Some((rule.original.clone(), "heuristic_content"));
                        }
                    }
                }
            }
        }
    }

    // 3. Universal Symbol-Chain & Token-Proximity Inspection (across bytecode, scripts, native plugins, and binary containers)
    let has_unresolved_token_clauses = compiled.clauses.iter().any(|c| {
        (rule_masks[c.rule_idx] & c.clause_bit) == 0 && c.pyc_tokens.len() >= 2
    });
    if has_unresolved_token_clauses && buf_len <= 4 * 1024 * 1024 {
        let lower_buf: Vec<u8> = buffer.iter().map(|b| b.to_ascii_lowercase()).collect();
        let mut tokens_with_pos: Vec<(&[u8], usize, usize)> = Vec::new();
        let mut start = None;
        for (idx, &b) in lower_buf.iter().enumerate() {
            if is_ident_byte(b) {
                if start.is_none() {
                    start = Some(idx);
                }
            } else if let Some(s) = start {
                if idx - s >= 2 {
                    tokens_with_pos.push((&lower_buf[s..idx], s, idx));
                }
                start = None;
            }
        }
        if let Some(s) = start {
            if lower_buf.len() - s >= 2 {
                tokens_with_pos.push((&lower_buf[s..], s, lower_buf.len()));
            }
        }

        for clause in &compiled.clauses {
            if (rule_masks[clause.rule_idx] & clause.clause_bit) != 0 {
                continue;
            }
            if clause.pyc_tokens.len() >= 2 {
                let first_tok = clause.pyc_tokens[0].as_slice();
                for (i, &(tok, _, end_pos)) in tokens_with_pos.iter().enumerate() {
                    if tok != first_tok {
                        continue;
                    }
                    let mut prev_end = end_pos;
                    let mut chain_idx = 1;
                    for &(next_tok, next_start, next_end) in &tokens_with_pos[(i + 1)..] {
                        if next_start.saturating_sub(prev_end) > 96 {
                            break;
                        }
                        if next_tok == clause.pyc_tokens[chain_idx].as_slice() {
                            chain_idx += 1;
                            prev_end = next_end;
                            if chain_idx == clause.pyc_tokens.len() {
                                rule_masks[clause.rule_idx] |= clause.clause_bit;
                                let rule = &compiled.content_rules[clause.rule_idx];
                                if rule_masks[clause.rule_idx] == rule.required_mask {
                                    return Some((
                                        rule.original.clone(),
                                        "heuristic_bytecode_chain",
                                    ));
                                }
                                break;
                            }
                        }
                    }
                    if (rule_masks[clause.rule_idx] & clause.clause_bit) != 0 {
                        break;
                    }
                }
            }
        }
    }

    None
}

pub(super) fn scan_buffer_for_compiled_content_sigs_detailed(
    buffer: &[u8],
    _entry_name_lower: &str,
    compiled: &CompiledSignatures,
    allow_deep_unpack: bool,
) -> Option<(String, &'static str)> {
    if buffer.is_empty() || compiled.clauses.is_empty() {
        return None;
    }

    let mut rule_masks: Vec<u32> = vec![0; compiled.content_rules.len()];

    if let Some(hit) = scan_raw_buffer_core(buffer, compiled, &mut rule_masks) {
        return Some(hit);
    }

    if !allow_deep_unpack {
        return None;
    }

    // 4. Deobfuscation Layer: Decode embedded Base64 blobs and \xNN hex-escaped payloads
    let buf_len = buffer.len();
    let max_obf_scan = std::cmp::min(buf_len, 1024 * 1024);
    let mut idx = 0;
    let mut b64_checked = 0usize;
    while idx < max_obf_scan && b64_checked < 48 {
        let b = buffer[idx];
        let is_b64_char = b.is_ascii_alphanumeric() || b == b'+' || b == b'/';
        if is_b64_char {
            let start = idx;
            while idx < max_obf_scan {
                let c = buffer[idx];
                if c.is_ascii_alphanumeric() || c == b'+' || c == b'/' || c == b'=' {
                    idx += 1;
                } else {
                    break;
                }
            }
            let run_len = idx - start;
            if (24..=16384).contains(&run_len) {
                let slice = &buffer[start..idx];
                // Heuristic filter: real Base64 of URLs/commands mixes digits/uppercase/lowercase or ends with '='
                let has_mixed = slice.iter().any(|c| c.is_ascii_uppercase())
                    && slice.iter().any(|c| c.is_ascii_lowercase());
                if has_mixed || slice.ends_with(b"=") {
                    b64_checked += 1;
                    if let Some(decoded) = decode_base64_slice(slice) {
                        if let Some((sig, _)) =
                            scan_raw_buffer_core(&decoded, compiled, &mut rule_masks)
                        {
                            return Some((sig, "heuristic_deobfuscated_payload"));
                        }
                    }
                }
            }
        } else {
            idx += 1;
        }
    }

    // Decode \xNN hex escape sequences (e.g. \x64\x69\x73\x63\x6f\x72\x64)
    let mut hex_decoded = Vec::new();
    let mut h_idx = 0;
    while h_idx + 3 < max_obf_scan {
        if buffer[h_idx] == b'\\' && (buffer[h_idx + 1] == b'x' || buffer[h_idx + 1] == b'X') {
            if let (Some(hi), Some(lo)) =
                (hex_nibble(buffer[h_idx + 2]), hex_nibble(buffer[h_idx + 3]))
            {
                hex_decoded.push((hi << 4) | lo);
                h_idx += 4;
                continue;
            }
        }
        h_idx += 1;
    }
    if hex_decoded.len() >= 8 {
        if let Some((sig, _)) = scan_raw_buffer_core(&hex_decoded, compiled, &mut rule_masks) {
            return Some((sig, "heuristic_deobfuscated_payload"));
        }
    }

    // 5. Binary Container Zlib / Zstd Decompression Layer
    // Probe candidate compressed streams with a stack-only 64-byte read first to avoid
    // heap allocations on false-positive magic-byte sequences in binary assets.
    let mut streams_checked = 0usize;
    let max_streams = 32usize;
    let mut pos = 0usize;
    while pos + 8 < buf_len && streams_checked < max_streams {
        let b0 = buffer[pos];
        let b1 = buffer[pos + 1];

        // Check Zlib header (CMF = 0x78, FLG check bits valid)
        if b0 == 0x78
            && (b1 == 0x9C || b1 == 0x01 || b1 == 0xDA || b1 == 0x5E)
            && ((b0 as u16) * 256 + (b1 as u16)) % 31 == 0
        {
            use std::io::Read;
            let mut raw_dec = flate2::read::ZlibDecoder::new(&buffer[pos..]);
            let mut stack_probe = [0u8; 64];
            let probe_n = raw_dec.read(&mut stack_probe).unwrap_or(0);
            if probe_n >= 12 {
                streams_checked += 1;
                let max_rem = (256 * 1024usize).saturating_sub(probe_n);
                let mut decompressed = Vec::with_capacity(probe_n + 1024);
                decompressed.extend_from_slice(&stack_probe[..probe_n]);
                let _ = (&mut raw_dec).take(max_rem as u64).read_to_end(&mut decompressed);
                if let Some((sig, _)) = scan_buffer_for_compiled_content_sigs_detailed(
                    &decompressed,
                    _entry_name_lower,
                    compiled,
                    false,
                ) {
                    return Some((sig, "heuristic_decompressed_stream"));
                }
                let consumed = raw_dec.total_in() as usize;
                pos += consumed.max(2);
                continue;
            }
        } else if b0 == 0x28
            && b1 == 0xB5
            && buffer[pos + 2] == 0x2F
            && buffer[pos + 3] == 0xFD
        {
            use std::io::Read;
            if let Ok(mut decoder) = zstd::stream::read::Decoder::new(&buffer[pos..]) {
                let mut stack_probe = [0u8; 64];
                let probe_n = decoder.read(&mut stack_probe).unwrap_or(0);
                if probe_n >= 12 {
                    streams_checked += 1;
                    let max_rem = (256 * 1024usize).saturating_sub(probe_n);
                    let mut decompressed = Vec::with_capacity(probe_n + 1024);
                    decompressed.extend_from_slice(&stack_probe[..probe_n]);
                    let _ = (&mut decoder)
                        .take(max_rem as u64)
                        .read_to_end(&mut decompressed);
                    if let Some((sig, _)) = scan_buffer_for_compiled_content_sigs_detailed(
                        &decompressed,
                        _entry_name_lower,
                        compiled,
                        false,
                    ) {
                        return Some((sig, "heuristic_decompressed_stream"));
                    }
                }
            }
        }
        pos += 1;
    }

    None
}

pub(super) fn scan_zip_reader<R: std::io::Read + std::io::Seek>(
    reader: R,
    parent_prefix: &str,
    compiled: &CompiledSignatures,
    depth: u8,
) -> Option<HeuristicMatchDetail> {
    use std::io::Read;
    let has_content_sigs = !compiled.clauses.is_empty();
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    let max_entries = archive.len().min(MAX_ARCHIVE_ENTRIES);

    for i in 0..max_entries {
        if let Ok(mut entry) = archive.by_index(i) {
            let raw_entry_name = entry.name().replace('\\', "/");
            let entry_name = raw_entry_name.to_lowercase();
            let entry_base = entry_name.rsplit('/').next().unwrap_or(&entry_name);
            let display_entry = if parent_prefix.is_empty() {
                raw_entry_name.clone()
            } else {
                format!("{}::{}", parent_prefix, raw_entry_name)
            };

            for (sig_lower, orig) in &compiled.archive_entry_exact {
                if &entry_name == sig_lower || entry_base == sig_lower {
                    return Some(HeuristicMatchDetail {
                        signature: orig.clone(),
                        matched_entry: Some(display_entry),
                        detection_type: "heuristic_archive_entry".to_string(),
                    });
                }
            }
            for (sig_lower, orig) in &compiled.archive_entry_contains {
                if entry_name.contains(sig_lower.as_str()) {
                    return Some(HeuristicMatchDetail {
                        signature: orig.clone(),
                        matched_entry: Some(display_entry),
                        detection_type: "heuristic_archive_entry".to_string(),
                    });
                }
            }
            for (sig_lower, orig) in &compiled.file_name_exact {
                if entry_base == sig_lower {
                    return Some(HeuristicMatchDetail {
                        signature: orig.clone(),
                        matched_entry: Some(display_entry),
                        detection_type: "heuristic_filename".to_string(),
                    });
                }
            }
            for (sig_lower, orig) in &compiled.file_name_contains {
                if entry_base.contains(sig_lower.as_str()) {
                    return Some(HeuristicMatchDetail {
                        signature: orig.clone(),
                        matched_entry: Some(display_entry),
                        detection_type: "heuristic_filename".to_string(),
                    });
                }
            }

            const MAX_SCAN_ENTRY_BYTES: u64 = 16 * 1024 * 1024;
            let cap_hint = entry.size().min(256 * 1024) as usize;
            let mut buffer = Vec::with_capacity(cap_hint);
            let mut bounded = (&mut entry).take(MAX_SCAN_ENTRY_BYTES);
            if bounded.read_to_end(&mut buffer).is_ok() && !buffer.is_empty() {
                // Check if this entry is a nested ZIP-based script/mod archive
                let is_nested_zip = depth < 2
                    && buffer.len() >= 4
                    && (buffer[0..4] == [0x50, 0x4B, 0x03, 0x04]
                        || buffer[0..4] == [0x50, 0x4B, 0x05, 0x06]);

                if is_nested_zip {
                    if let Some(nested_hit) = scan_zip_reader(
                        std::io::Cursor::new(&buffer),
                        &display_entry,
                        compiled,
                        depth + 1,
                    ) {
                        return Some(nested_hit);
                    }
                }

                if has_content_sigs {
                    if let Some((matched_sig, det_kind)) =
                        scan_buffer_for_compiled_content_sigs_detailed(
                            &buffer,
                            &entry_name,
                            compiled,
                            true,
                        )
                    {
                        return Some(HeuristicMatchDetail {
                            signature: matched_sig,
                            matched_entry: Some(display_entry),
                            detection_type: det_kind.to_string(),
                        });
                    }
                }
            }
        }
    }
    None
}

pub fn check_heuristic_malware_detailed(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<HeuristicMatchDetail> {
    if compiled.is_empty {
        return None;
    }

    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    for (sig_lower, orig) in &compiled.file_name_exact {
        if &file_name == sig_lower {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: None,
                detection_type: "heuristic_filename".to_string(),
            });
        }
    }
    for (sig_lower, orig) in &compiled.file_name_contains {
        if file_name.contains(sig_lower.as_str()) {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: None,
                detection_type: "heuristic_filename".to_string(),
            });
        }
    }

    let has_content_sigs = !compiled.clauses.is_empty();
    let has_archive_sigs = !compiled.archive_entry_exact.is_empty()
        || !compiled.archive_entry_contains.is_empty()
        || !compiled.file_name_exact.is_empty()
        || !compiled.file_name_contains.is_empty();

    if !has_content_sigs && !has_archive_sigs {
        return None;
    }

    if let Ok(mut file) = std::fs::File::open(path) {
        use std::io::{Read, Seek, SeekFrom};
        let mut magic = [0u8; 4];
        let has_magic = file.read_exact(&mut magic).is_ok();
        let is_zip_container = has_magic
            && (magic == [0x50, 0x4B, 0x03, 0x04]
                || magic == [0x50, 0x4B, 0x05, 0x06]
                || magic == [0x50, 0x4B, 0x07, 0x08]);
        let _ = file.seek(SeekFrom::Start(0));

        if is_zip_container {
            if let Some(hit) = scan_zip_reader(file, "", compiled, 0) {
                return Some(hit);
            }
            return None;
        } else if has_content_sigs {
            if let Ok(metadata) = file.metadata() {
                if metadata.is_file() {
                    let file_len = metadata.len();
                    let max_full_read: u64 = 8 * 1024 * 1024;
                    let mut buffer = Vec::new();

                    if file_len <= max_full_read {
                        let _ = file.read_to_end(&mut buffer);
                    } else {
                        let head_size = 4 * 1024 * 1024;
                        let tail_size = 2 * 1024 * 1024;
                        buffer.resize(head_size + tail_size, 0);
                        let _ = file.read_exact(&mut buffer[..head_size]);
                        if file.seek(SeekFrom::End(-(tail_size as i64))).is_ok() {
                            let _ = file.read_exact(&mut buffer[head_size..]);
                        }
                    }

                    if let Some((matched_sig, det_kind)) =
                        scan_buffer_for_compiled_content_sigs_detailed(
                            &buffer,
                            &file_name,
                            compiled,
                            true,
                        )
                    {
                        let matched_entry = if det_kind == "heuristic_decompressed_stream" {
                            Some("BinaryContainer::CompressedStream".to_string())
                        } else {
                            None
                        };
                        return Some(HeuristicMatchDetail {
                            signature: matched_sig,
                            matched_entry,
                            detection_type: det_kind.to_string(),
                        });
                    }
                }
            }
        }
    }
    None
}

