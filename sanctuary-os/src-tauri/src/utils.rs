use crate::commands::backups::*;
use crate::commands::cache::*;
use crate::commands::config::*;
use crate::commands::deployment::*;
use crate::commands::game_info::*;
use crate::commands::library::*;
use crate::commands::logs::*;
use crate::commands::overrides::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::state_ops::*;
use crate::commands::system::*;
use crate::state::*;
use notify::Watcher;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};

pub fn process_structure_nodes(
    schema: &Option<crate::schema::GameSchema>,
    nodes: &[StructureNode],
    current_target_dir: &std::path::Path,
    vault_mods_lane: &std::path::Path,
    folders_to_check: &[&str],
) -> usize {
    let mut linked_count = 0usize;
    for node in nodes {
        if node.node_type == "folder" {
            let next_target_dir = current_target_dir.join(&node.name);
            let _ = std::fs::create_dir_all(&next_target_dir);
            if let Some(children) = &node.children {
                linked_count += process_structure_nodes(
                    schema,
                    children,
                    &next_target_dir,
                    vault_mods_lane,
                    folders_to_check,
                );
            }
        } else if node.node_type == "file" {
            let mod_name = node.assigned_mod_name.as_ref().unwrap_or(&node.name);
            let mut source = vault_mods_lane.join(mod_name);
            let mut found = false;
            let exts = crate::game_logic::get_supported_extensions(schema);
            let mod_stem = std::path::Path::new(mod_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(mod_name);

            for f in folders_to_check {
                let dir_root = if f.is_empty() {
                    vault_mods_lane.to_path_buf()
                } else {
                    vault_mods_lane.join(f)
                };
                let candidates = [
                    dir_root.join(mod_name),
                    dir_root.join(mod_stem).join(mod_name),
                ];
                for base_test in candidates {
                    if base_test.is_file() {
                        source = base_test;
                        found = true;
                        break;
                    } else {
                        for ext in &exts {
                            if base_test.with_extension(ext).is_file() {
                                source = base_test.with_extension(ext);
                                found = true;
                                break;
                            }
                        }
                        if found {
                            break;
                        }
                    }
                }
                if found {
                    break;
                }
            }
            if found {
                let mut final_name = node.name.clone();
                if final_name.starts_with("*.") {
                    final_name = source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                }
                let target_path = current_target_dir.join(final_name);
                if source.is_dir() {
                    if deploy_junction(&source, &target_path).is_ok() {
                        linked_count += 1;
                    }
                } else {
                    if create_symlink_file(&source, &target_path)
                        .or_else(|_| std::fs::hard_link(&source, &target_path))
                        .or_else(|_| std::fs::copy(&source, &target_path).map(|_| ()))
                        .is_ok()
                    {
                        linked_count += 1;
                    }
                }
            }
        }
    }
    linked_count
}

pub fn is_mods_dir(path: &Path) -> bool {
    path.file_name()
        .map_or(false, |n| n.to_string_lossy().eq_ignore_ascii_case("mods"))
}

pub fn get_vault_mods_lane(vault_path: &str) -> PathBuf {
    let p = PathBuf::from(vault_path);
    if is_mods_dir(&p) {
        p
    } else {
        p.join("Mods")
    }
}

pub fn get_cache_path(vault_path: &str) -> PathBuf {
    Path::new(vault_path).join(".sanctuary_cache.db")
}

pub fn get_db_conn(vault_path: &str) -> Connection {
    let path = get_cache_path(vault_path);
    let conn = Connection::open(&path).unwrap_or_else(|_| Connection::open_in_memory().unwrap());
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS cache (
            path TEXT PRIMARY KEY,
            mtime INTEGER NOT NULL,
            dna_hash TEXT NOT NULL,
            explicitly_local INTEGER NOT NULL,
            quarantined INTEGER NOT NULL,
            heuristic_malware_sig TEXT,
            heuristic_sigs_mtime INTEGER NOT NULL DEFAULT 0
        )",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cache ADD COLUMN heuristic_malware_sig TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cache ADD COLUMN heuristic_sigs_mtime INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS edge_manifests (
            artifact_id TEXT PRIMARY KEY,
            mason_id TEXT NOT NULL,
            manifest_url TEXT NOT NULL,
            target_hash TEXT DEFAULT '',
            archive_hashes TEXT DEFAULT '[]',
            game_id TEXT DEFAULT '',
            last_fetched_hash TEXT,
            last_fetched_metadata TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    );
    let _ = conn.execute("ALTER TABLE edge_manifests ADD COLUMN target_hash TEXT DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE edge_manifests ADD COLUMN archive_hashes TEXT DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE edge_manifests ADD COLUMN game_id TEXT DEFAULT ''", []);
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS local_mason_follows (
            mason_id TEXT PRIMARY KEY,
            mason_name TEXT NOT NULL DEFAULT '',
            avatar_url TEXT DEFAULT '',
            workspace_id TEXT DEFAULT '',
            notify_alerts INTEGER NOT NULL DEFAULT 1,
            followed_at INTEGER NOT NULL
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS local_mason_supporters (
            mason_id TEXT PRIMARY KEY,
            mason_name TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT 'patreon',
            tier_name TEXT DEFAULT 'Supporter',
            pledge_cents INTEGER NOT NULL DEFAULT 500,
            patreon_campaign_id TEXT DEFAULT '',
            access_token TEXT DEFAULT '',
            cryptographic_pass TEXT NOT NULL DEFAULT '',
            expedited_support INTEGER NOT NULL DEFAULT 1,
            early_access INTEGER NOT NULL DEFAULT 1,
            verified_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS local_dev_build_status (
            user_id TEXT PRIMARY KEY,
            dev_build_until INTEGER NOT NULL DEFAULT 0,
            donation_credit_cents INTEGER NOT NULL DEFAULT 0,
            total_months_unlocked INTEGER NOT NULL DEFAULT 0,
            channel_enabled INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_hash ON cache (dna_hash)",
        [],
    );
    conn
}

pub fn load_cache(vault_path: &str) -> BunkerCache {
    let conn = get_db_conn(vault_path);
    let mut stmt = match conn.prepare("SELECT path, mtime, dna_hash, explicitly_local, quarantined, heuristic_malware_sig, heuristic_sigs_mtime FROM cache") {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let cache_iter = match stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let mtime: u64 = row.get::<_, i64>(1).unwrap_or(0).max(0) as u64;
        let dna_hash: String = row.get(2).unwrap_or_default();
        let explicitly_local_int: i32 = row.get(3).unwrap_or(0);
        let quarantined_int: i32 = row.get(4).unwrap_or(0);
        let heuristic_malware_sig: Option<String> = row.get(5).ok().flatten();
        let heuristic_sigs_mtime: u64 = row.get::<_, i64>(6).unwrap_or(0).max(0) as u64;
        Ok((
            path,
            CacheEntry {
                mtime,
                dna_hash,
                explicitly_local: explicitly_local_int != 0,
                quarantined: quarantined_int != 0,
                heuristic_malware_sig,
                heuristic_sigs_mtime,
            },
        ))
    }) {
        Ok(iter) => iter,
        Err(_) => return HashMap::new(),
    };

    let mut cache = HashMap::new();
    for entry in cache_iter.flatten() {
        cache.insert(entry.0, entry.1);
    }
    cache
}

pub fn upsert_cache_entry(conn: &Connection, path: &str, entry: &CacheEntry) {
    let explicitly_local_int = if entry.explicitly_local { 1 } else { 0 };
    let quarantined_int = if entry.quarantined { 1 } else { 0 };
    let _ = conn.execute(
        "INSERT INTO cache (path, mtime, dna_hash, explicitly_local, quarantined, heuristic_malware_sig, heuristic_sigs_mtime) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
            mtime=excluded.mtime,
            dna_hash=excluded.dna_hash,
            explicitly_local=excluded.explicitly_local,
            quarantined=excluded.quarantined,
            heuristic_malware_sig=excluded.heuristic_malware_sig,
            heuristic_sigs_mtime=excluded.heuristic_sigs_mtime",
        params![
            path,
            entry.mtime as i64,
            entry.dna_hash,
            explicitly_local_int,
            quarantined_int,
            entry.heuristic_malware_sig,
            entry.heuristic_sigs_mtime as i64
        ]
    );
}

pub fn remove_cache_entry(conn: &Connection, path: &str) {
    let _ = conn.execute("DELETE FROM cache WHERE path = ?1", params![path]);
}

pub fn clear_cache_db(conn: &Connection) {
    let _ = conn.execute("DELETE FROM cache", []);
}

pub fn save_cache(vault_path: &str, cache: &BunkerCache) {
    let mut conn = get_db_conn(vault_path);
    let current_db_cache = load_cache(vault_path);

    let tx = conn.transaction().unwrap();

    for (path, entry) in cache {
        let needs_update = if let Some(old_entry) = current_db_cache.get(path) {
            old_entry.mtime != entry.mtime
                || old_entry.quarantined != entry.quarantined
                || old_entry.explicitly_local != entry.explicitly_local
                || old_entry.heuristic_sigs_mtime != entry.heuristic_sigs_mtime
                || old_entry.dna_hash != entry.dna_hash
        } else {
            true
        };

        if needs_update {
            upsert_cache_entry(&tx, path, entry);
        }
    }

    for path in current_db_cache.keys() {
        if !cache.contains_key(path) {
            remove_cache_entry(&tx, path);
        }
    }

    tx.commit().unwrap();
}

pub fn calculate_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024 * 8];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn get_config_path() -> PathBuf {
    dirs::config_dir()
        .map(|d| d.join("SanctuaryOS"))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("sanctuary_config.json")
}

pub fn walk_packages(
    game_schema: &Option<crate::schema::GameSchema>,
    dir: &Path,
    files: &mut Vec<PathBuf>,
) {
    let manifest_name = game_schema
        .as_ref()
        .map(|s| s.paths.manifest_file.to_lowercase())
        .unwrap_or_else(|| "resource.cfg".to_string());

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name() {
                    let name_str = name.to_string_lossy().to_lowercase();
                    if name_str == "sandbox" || name_str == "dev" || name_str == "resource" {
                        continue;
                    }
                }
                walk_packages(game_schema, &p, files);
            } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                let fname_lower = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_lowercase();
                if fname_lower == "resource.cfg"
                    || (!manifest_name.is_empty() && fname_lower == manifest_name)
                    || ext_lower == "cfg"
                    || ext_lower == "ini"
                    || ext_lower == "txt"
                    || ext_lower == "log"
                {
                    continue;
                }
                let exts = crate::game_logic::get_supported_extensions(&game_schema);
                if exts.contains(&ext_lower) {
                    files.push(p);
                }
            }
        }
    }
}

pub fn deploy_air_gap(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    if let Ok(entries) = std::fs::read_dir(source) {
        for entry in entries.flatten() {
            let file_type = entry.file_type()?;

            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            if file_name == ".sanctuary_cache.json"
                || file_name == "desktop.ini"
                || file_name == "default.ini"
            {
                continue;
            }

            let dest = target.join(entry.file_name());
            if file_type.is_dir() {
                deploy_air_gap(&entry.path(), &dest)?;
            } else {
                let _ = std::fs::hard_link(&entry.path(), &dest)
                    .or_else(|_| create_symlink_file(&entry.path(), &dest))
                    .or_else(|_| std::fs::copy(&entry.path(), &dest).map(|_| ()));
            }
        }
    }
    Ok(())
}

pub fn is_safe_user_file_path(path: &std::path::Path) -> bool {
    let raw = path.to_string_lossy();
    if raw.trim().is_empty() {
        return false;
    }
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return false;
    }
    let normalized = raw.replace('/', "\\").to_lowercase();
    let trimmed = normalized.trim_end_matches('\\');
    if trimmed.is_empty() || trimmed.ends_with(':') {
        return false;
    }
    let blocked_win_prefixes = [
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata\\microsoft",
        "c:\\system volume information",
    ];
    for prefix in &blocked_win_prefixes {
        if trimmed == *prefix || trimmed.starts_with(&format!("{}\\", prefix)) {
            return false;
        }
    }
    let unix_norm = raw.replace('\\', "/");
    let unix_trimmed = unix_norm.trim_end_matches('/');
    if unix_trimmed.is_empty() {
        return false;
    }
    let blocked_unix_prefixes = [
        "/bin", "/sbin", "/usr", "/etc", "/System", "/lib", "/proc", "/sys", "/dev",
    ];
    for prefix in &blocked_unix_prefixes {
        if unix_trimmed.eq_ignore_ascii_case(prefix)
            || unix_trimmed
                .to_lowercase()
                .starts_with(&format!("{}/", prefix.to_lowercase()))
        {
            return false;
        }
    }
    true
}

pub fn deploy_junction(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let target_str = target.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid target path")
        })?;
        let source_str = source.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid source path")
        })?;
        let has_unsafe_chars = |s: &str| {
            s.chars()
                .any(|c| matches!(c, '"' | '&' | '|' | '<' | '>' | '^' | '\r' | '\n' | '\0'))
        };
        if has_unsafe_chars(target_str) || has_unsafe_chars(source_str) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Path contains unsafe shell metacharacters",
            ));
        }
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J", target_str, source_str])
            .status()?;

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Junction failed",
            ));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)?;
    }
    Ok(())
}

pub fn create_symlink_file(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::os::windows::fs::symlink_file(source, target)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)
    }
}

use rayon::prelude::*;

#[tauri::command]
pub fn safe_wipe_mods_dir(dir: &std::path::Path, game_schema: &Option<crate::schema::GameSchema>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let items: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        items.into_par_iter().for_each(|path| {
            let is_symlink_or_junction = std::fs::read_link(&path).is_ok()
                || std::fs::symlink_metadata(&path)
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false);

            if is_symlink_or_junction {
                if path.is_dir() {
                    let _ = std::fs::remove_dir(&path);
                } else {
                    let _ = std::fs::remove_file(&path);
                }
                return;
            }

            let manifest_name = game_schema
                .as_ref()
                .map(|s| s.paths.manifest_file.clone())
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| "Resource.cfg".to_string());

            let parent_is_resource_subdir = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("resource"))
                .unwrap_or(false);

            if !parent_is_resource_subdir
                && path.file_name().and_then(|n| n.to_str()).map_or(false, |n| {
                    n.eq_ignore_ascii_case(&manifest_name)
                        || n.eq_ignore_ascii_case("Resource.cfg")
                })
            {
                return;
            }

            if path.is_dir() {
                safe_wipe_mods_dir(&path, game_schema);
                let _ = std::fs::remove_dir(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        });
    }
}

pub fn obscure_username(path: &str) -> String {
    let lower = path.to_lowercase();
    let mut users_idx = lower.find("\\users\\");
    let mut slash_len = 7;
    let mut slash_char = '\\';
    if users_idx.is_none() {
        users_idx = lower.find("/users/");
        slash_len = 7;
        slash_char = '/';
    }

    if let Some(idx) = users_idx {
        let after_users = idx + slash_len;
        if let Some(next_slash) = path[after_users..].find(slash_char) {
            let mut obscured = String::new();
            obscured.push_str(&path[..after_users]);
            obscured.push_str("...");
            obscured.push_str(&path[after_users + next_slash..]);
            return obscured;
        }
    }
    path.to_string()
}

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

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl CompiledSignatures {
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

        for sig in signatures {
            if !sig.enabled
                || sig.signature.is_empty()
                || !sig.severity.trim().eq_ignore_ascii_case("malware")
            {
                continue;
            }
            compiled.is_empty = false;
            let sig_lower = sig.signature.to_lowercase();
            match sig.match_type.as_str() {
                "file_name_exact" => {
                    compiled
                        .file_name_exact
                        .push((sig_lower, sig.signature.clone()));
                }
                "file_name_contains" => {
                    compiled
                        .file_name_contains
                        .push((sig_lower, sig.signature.clone()));
                }
                "archive_entry_exact" => {
                    compiled
                        .archive_entry_exact
                        .push((sig_lower, sig.signature.clone()));
                }
                "archive_entry_contains" => {
                    compiled
                        .archive_entry_contains
                        .push((sig_lower, sig.signature.clone()));
                }
                "file_content_contains" => {
                    // Support compound heuristic rules joined by " + " or " && "
                    let raw_parts: Vec<&str> = sig_lower
                        .split(" + ")
                        .flat_map(|p| p.split(" && "))
                        .map(|p| p.trim())
                        .filter(|p| !p.is_empty())
                        .take(32)
                        .collect();

                    if raw_parts.is_empty() {
                        continue;
                    }

                    let rule_idx = compiled.content_rules.len();
                    let mut required_mask: u32 = 0;

                    for (part_idx, part) in raw_parts.iter().enumerate() {
                        let lower_bytes = part.as_bytes().to_vec();
                        if lower_bytes.is_empty() {
                            continue;
                        }
                        let clause_bit = 1u32 << part_idx;
                        required_mask |= clause_bit;

                        let pyc_tokens: Vec<Vec<u8>> =
                            if part.contains('.') || part.contains('(') || part.contains('/') || part.contains('\\') {
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

                        let clause_idx = compiled.clauses.len();
                        let first_b = lower_bytes[0] as usize;
                        compiled.by_first_byte[first_b].push(clause_idx);
                        compiled.clauses.push(CompiledClause {
                            rule_idx,
                            clause_bit,
                            lower_bytes,
                            pyc_tokens,
                            requires_leading_boundary,
                        });
                    }

                    if required_mask != 0 {
                        compiled.content_rules.push(CompiledContentRule {
                            original: sig.signature.clone(),
                            required_mask,
                        });
                    }
                }
                _ => {}
            }
        }

        compiled
    }
}

fn scan_buffer_for_compiled_content_sigs(
    buffer: &[u8],
    entry_name_lower: &str,
    compiled: &CompiledSignatures,
) -> Option<String> {
    if buffer.is_empty() || compiled.clauses.is_empty() {
        return None;
    }

    let buf_len = buffer.len();
    let mut rule_masks: Vec<u32> = vec![0; compiled.content_rules.len()];

    // 1 & 2. Single-pass zero-allocation ASCII/UTF-8 + UTF-16LE wide-string scan
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

            // Check standard ASCII / UTF-8 match in-place
            if i + slen <= buf_len
                && buffer[i + slen - 1].to_ascii_lowercase() == sb[slen - 1]
                && (!clause.requires_leading_boundary
                    || i == 0
                    || (!is_ident_byte(buffer[i - 1]) && buffer[i - 1] != b'.'))
            {
                let mut matched = true;
                for k in 1..(slen.saturating_sub(1)) {
                    if buffer[i + k].to_ascii_lowercase() != sb[k] {
                        matched = false;
                        break;
                    }
                }
                if matched {
                    rule_masks[clause.rule_idx] |= clause.clause_bit;
                    let rule = &compiled.content_rules[clause.rule_idx];
                    if rule_masks[clause.rule_idx] == rule.required_mask {
                        return Some(rule.original.clone());
                    }
                    continue;
                }
            }

            // Check UTF-16LE wide-string match in-place (0 heap allocations)
            if is_wide_candidate
                && i + slen * 2 <= buf_len
                && (!clause.requires_leading_boundary
                    || i < 2
                    || (!is_ident_byte(buffer[i - 2]) && buffer[i - 2] != b'.'))
            {
                let last_pos = i + (slen - 1) * 2;
                if buffer[last_pos].to_ascii_lowercase() == sb[slen - 1]
                    && buffer[last_pos + 1] == 0
                {
                    let mut wide_matched = true;
                    for k in 1..(slen.saturating_sub(1)) {
                        let pos = i + k * 2;
                        if buffer[pos].to_ascii_lowercase() != sb[k] || buffer[pos + 1] != 0 {
                            wide_matched = false;
                            break;
                        }
                    }
                    if wide_matched {
                        rule_masks[clause.rule_idx] |= clause.clause_bit;
                        let rule = &compiled.content_rules[clause.rule_idx];
                        if rule_masks[clause.rule_idx] == rule.required_mask {
                            return Some(rule.original.clone());
                        }
                    }
                }
            }
        }
    }

    // 3. Compiled Python bytecode (.pyc / .pyo) symbol-chain inspection
    // Requires tokens in a dotted/call chain (e.g. os.system, subprocess.Popen)
    // to appear as standalone identifiers in sequential order within a tight proximity window
    // (<= 64 bytes apart in the marshalled co_names/co_consts table).
    if entry_name_lower.ends_with(".pyc") || entry_name_lower.ends_with(".pyo") {
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
                        if next_start.saturating_sub(prev_end) > 64 {
                            break;
                        }
                        if next_tok == clause.pyc_tokens[chain_idx].as_slice() {
                            chain_idx += 1;
                            prev_end = next_end;
                            if chain_idx == clause.pyc_tokens.len() {
                                rule_masks[clause.rule_idx] |= clause.clause_bit;
                                let rule = &compiled.content_rules[clause.rule_idx];
                                if rule_masks[clause.rule_idx] == rule.required_mask {
                                    return Some(rule.original.clone());
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

pub fn check_heuristic_malware_compiled(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<String> {
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
            return Some(orig.clone());
        }
    }
    for (sig_lower, orig) in &compiled.file_name_contains {
        if file_name.contains(sig_lower.as_str()) {
            return Some(orig.clone());
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
        let is_zip_container = file.read_exact(&mut magic).is_ok()
            && (magic == [0x50, 0x4B, 0x03, 0x04]
                || magic == [0x50, 0x4B, 0x05, 0x06]
                || magic == [0x50, 0x4B, 0x07, 0x08]);
        let _ = file.seek(SeekFrom::Start(0));

        if is_zip_container {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(mut entry) = archive.by_index(i) {
                        let entry_name = entry.name().replace('\\', "/").to_lowercase();
                        let entry_base = entry_name
                            .rsplit('/')
                            .next()
                            .unwrap_or(&entry_name);

                        for (sig_lower, orig) in &compiled.archive_entry_exact {
                            if &entry_name == sig_lower || entry_base == sig_lower {
                                return Some(orig.clone());
                            }
                        }
                        for (sig_lower, orig) in &compiled.archive_entry_contains {
                            if entry_name.contains(sig_lower.as_str()) {
                                return Some(orig.clone());
                            }
                        }
                        for (sig_lower, orig) in &compiled.file_name_exact {
                            if entry_base == sig_lower {
                                return Some(orig.clone());
                            }
                        }
                        for (sig_lower, orig) in &compiled.file_name_contains {
                            if entry_base.contains(sig_lower.as_str()) {
                                return Some(orig.clone());
                            }
                        }

                        if has_content_sigs && entry.size() <= 16 * 1024 * 1024 {
                            let mut buffer = Vec::with_capacity(entry.size() as usize);
                            if entry.read_to_end(&mut buffer).is_ok() {
                                if let Some(matched) = scan_buffer_for_compiled_content_sigs(
                                    &buffer,
                                    &entry_name,
                                    compiled,
                                ) {
                                    return Some(matched);
                                }
                            }
                        }
                    }
                }
                return None;
            }
        } else if has_content_sigs {
            if let Ok(metadata) = file.metadata() {
                if metadata.is_file() {
                    let file_len = metadata.len();
                    let max_full_read: u64 = 4 * 1024 * 1024;
                    let mut buffer = Vec::new();

                    if file_len <= max_full_read {
                        let _ = file.read_to_end(&mut buffer);
                    } else {
                        // For large binary packages (>4MB), scan the first 2MB (headers/index/scripts)
                        // and the last 1MB (appended payloads/string tables) to keep disk I/O fast and non-blocking.
                        let head_size = 2 * 1024 * 1024;
                        let tail_size = 1 * 1024 * 1024;
                        buffer.resize(head_size + tail_size, 0);
                        let _ = file.read_exact(&mut buffer[..head_size]);
                        if file.seek(SeekFrom::End(-(tail_size as i64))).is_ok() {
                            let _ = file.read_exact(&mut buffer[head_size..]);
                        }
                    }

                    if let Some(matched) =
                        scan_buffer_for_compiled_content_sigs(&buffer, &file_name, compiled)
                    {
                        return Some(matched);
                    }
                }
            }
        }
    }
    None
}

pub fn check_heuristic_malware(path: &Path, signatures: &[HeuristicSignature]) -> Option<String> {
    if signatures.is_empty() {
        return None;
    }
    let compiled = CompiledSignatures::new(signatures);
    check_heuristic_malware_compiled(path, &compiled)
}

pub fn check_is_explicitly_local(
    path: &Path,
    is_script: bool,
    _game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if is_script {
        if let Ok(file) = std::fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(file) = archive.by_index(i) {
                        let name = file.name().to_lowercase();
                        if name.contains("__pycache__") {
                            return true;
                        }
                        if name.ends_with(".pyc") && name.contains('/') {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

pub fn find_backup(vault_path: &str, file_name: &str) -> Option<PathBuf> {
    let base = PathBuf::from(vault_path).join("Backups");
    let p = base.join(file_name);
    if p.exists() {
        return Some(p);
    }
    for sub in &["World", "Engine", "Mods"] {
        let p2 = base.join(sub).join(file_name);
        if p2.exists() {
            return Some(p2);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    if let Some(engine_dir) = get_engine_backups_dir(&config.live_path, vault_path) {
        let p3 = engine_dir.join(file_name);
        if p3.exists() {
            return Some(p3);
        }
    }
    let docs_base = get_docs_base_from_mods_path(&config.mods_path);
    if let Some(world_dir) = get_world_backups_dir(&docs_base, vault_path) {
        let p4 = world_dir.join(file_name);
        if p4.exists() {
            return Some(p4);
        }
    }

    None
}

pub fn get_all_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if dir.is_file() {
        files.push(dir.to_path_buf());
        return files;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(get_all_files(&path));
            } else {
                files.push(path);
            }
        }
    }
    files
}

pub fn enforce_retention_policy(target_dir: &Path, keep_count: u32) {
    if keep_count >= 999 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let mut backups: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                (p.is_file()
                    && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                        || p.extension() == Some(std::ffi::OsStr::new("tar"))))
                    || (p.is_dir()
                        && (name.starts_with("World_State") || name.starts_with("Engine_Core")))
            })
            .collect();

        backups.sort_by(|a, b| {
            let m_a = a
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            let m_b = b
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            m_b.cmp(&m_a)
        });

        if backups.len() > keep_count as usize {
            for old_backup in backups.iter().skip(keep_count as usize) {
                if old_backup.is_dir() {
                    let _ = std::fs::remove_dir_all(old_backup);
                } else {
                    let _ = std::fs::remove_file(old_backup);
                }
            }
        }
    }
}

pub fn get_engine_backups_dir(live_path: &str, vault_path: &str) -> Option<PathBuf> {
    if live_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(live_path);
    let root = p.ancestors().last()?;
    if root.as_os_str().is_empty() {
        return None;
    }

    let vault_name = PathBuf::from(vault_path)
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();

    Some(
        root.join(".sanctuary_backups")
            .join(vault_name)
            .join("Engine"),
    )
}

pub fn get_docs_base_from_mods_path(mods_path: &str) -> String {
    if mods_path.trim().is_empty() {
        return String::new();
    }
    let mut doc_dir = PathBuf::from(mods_path);
    if doc_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .eq_ignore_ascii_case("mods")
    {
        doc_dir.pop();
    }
    doc_dir.to_string_lossy().to_string()
}

pub fn get_world_backups_dir(docs_path: &str, vault_path: &str) -> Option<PathBuf> {
    if docs_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(docs_path);
    let root = p.ancestors().last()?;
    if root.as_os_str().is_empty() {
        return None;
    }

    let vault_name = PathBuf::from(vault_path)
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();

    Some(
        root.join(".sanctuary_backups")
            .join(vault_name)
            .join("World"),
    )
}

#[cfg(windows)]
pub fn calculate_sizes(path: &std::path::Path) -> (u64, u64) {
    let mut total_size = 0;
    let mut diff_size = 0; // Old backups on Windows will gracefully fallback to 0 delta size
    let mut walker = walkdir::WalkDir::new(path).into_iter();

    while let Some(Ok(entry)) = walker.next() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                total_size += metadata.len();
            }
        }
    }
    (total_size, diff_size)
}

#[cfg(not(windows))]
pub fn calculate_sizes(path: &std::path::Path) -> (u64, u64) {
    use std::os::unix::fs::MetadataExt;
    let mut total_size = 0;
    let mut diff_size = 0;
    let mut walker = walkdir::WalkDir::new(path).into_iter();

    while let Some(Ok(entry)) = walker.next() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                total_size += metadata.len();
                if metadata.nlink() == 1 {
                    diff_size += metadata.len();
                }
            }
        }
    }
    (total_size, diff_size)
}

pub fn calculate_dir_size(path: &std::path::Path) -> u64 {
    calculate_sizes(path).0
}

pub fn hardlink_mirror(
    source_dir: &std::path::Path,
    dest_dir: &std::path::Path,
    previous_backup: Option<&std::path::Path>,
) -> std::io::Result<()> {
    if !dest_dir.exists() {
        std::fs::create_dir_all(dest_dir)?;
    }

    if let Ok(entries) = std::fs::read_dir(source_dir) {
        for e in entries.flatten() {
            let src_path = e.path();
            let file_name = e.file_name();
            let dest_path = dest_dir.join(&file_name);

            if src_path.is_dir() {
                let prev_sub = previous_backup.map(|p| p.join(&file_name));
                hardlink_mirror(&src_path, &dest_path, prev_sub.as_deref())?;
            } else {
                let mut linked = false;
                if let Some(prev) = previous_backup {
                    let prev_file = prev.join(&file_name);
                    if prev_file.exists() && prev_file.is_file() {
                        if let (Ok(src_meta), Ok(prev_meta)) =
                            (src_path.metadata(), prev_file.metadata())
                        {
                            if src_meta.len() == prev_meta.len()
                                && src_meta.modified().ok() == prev_meta.modified().ok()
                            {
                                if std::fs::hard_link(&prev_file, &dest_path).is_ok() {
                                    linked = true;
                                }
                            }
                        }
                    }
                }
                if !linked {
                    let _ = std::fs::copy(&src_path, &dest_path);
                }
            }
        }
    }
    Ok(())
}

pub const SANCTUARY_REDACTED_TOKEN: &str = "[REDACTED BY SANCTUARY]";

fn chars_match_ignore_ascii_case(haystack: &[char], pos: usize, needle_lower: &[char]) -> bool {
    if pos + needle_lower.len() > haystack.len() {
        return false;
    }
    for (i, &nc) in needle_lower.iter().enumerate() {
        if haystack[pos + i].to_ascii_lowercase() != nc {
            return false;
        }
    }
    true
}

fn redact_after_marker_chars(input: &str, marker_lower_str: &str, stop_chars: &[char]) -> String {
    let chars: Vec<char> = input.chars().collect();
    let marker: Vec<char> = marker_lower_str.chars().collect();
    let redacted_chars: Vec<char> = SANCTUARY_REDACTED_TOKEN.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;

    while i < chars.len() {
        if chars_match_ignore_ascii_case(&chars, i, &marker) {
            for k in 0..marker.len() {
                out.push(chars[i + k]);
            }
            i += marker.len();
            if chars_match_ignore_ascii_case(&chars, i, &redacted_chars) {
                for k in 0..redacted_chars.len() {
                    out.push(chars[i + k]);
                }
                i += redacted_chars.len();
                continue;
            }
            let seg_start = i;
            while i < chars.len() && !stop_chars.contains(&chars[i]) {
                i += 1;
            }
            if i > seg_start {
                out.push_str(SANCTUARY_REDACTED_TOKEN);
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn redact_xml_tag_chars(input: &str, tag_lower: &str, replacement: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let open_tag: Vec<char> = format!("<{}>", tag_lower).chars().collect();
    let close_tag: Vec<char> = format!("</{}>", tag_lower).chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;

    while i < chars.len() {
        if chars_match_ignore_ascii_case(&chars, i, &open_tag) {
            for k in 0..open_tag.len() {
                out.push(chars[i + k]);
            }
            i += open_tag.len();
            let content_start = i;
            let mut found_close = None;
            let mut scan = i;
            while scan < chars.len() {
                if chars_match_ignore_ascii_case(&chars, scan, &close_tag) {
                    found_close = Some(scan);
                    break;
                }
                if chars[scan] == '<' || chars[scan] == '\n' {
                    break;
                }
                scan += 1;
            }
            if let Some(close_idx) = found_close {
                if close_idx > content_start {
                    out.push_str(replacement);
                }
                for k in 0..close_tag.len() {
                    out.push(chars[close_idx + k]);
                }
                i = close_idx + close_tag.len();
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn redact_guid_tokens(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let guid_kw: Vec<char> = vec!['g', 'u', 'i', 'd'];
    let mut out = String::with_capacity(input.len());
    let mut i = 0;

    while i < chars.len() {
        let prev_ok = i == 0 || !chars[i - 1].is_ascii_alphanumeric();
        if prev_ok && chars_match_ignore_ascii_case(&chars, i, &guid_kw) {
            let mut scan = i + 4;
            while scan < chars.len() && (chars[scan] == ' ' || chars[scan] == '\t') {
                scan += 1;
            }
            if scan < chars.len() && (chars[scan] == ':' || chars[scan] == '=') {
                scan += 1;
                while scan < chars.len() && (chars[scan] == ' ' || chars[scan] == '\t') {
                    scan += 1;
                }
                let val_start = scan;
                while scan < chars.len()
                    && (chars[scan].is_ascii_hexdigit()
                        || chars[scan] == '-'
                        || chars[scan] == '{'
                        || chars[scan] == '}')
                {
                    scan += 1;
                }
                if scan.saturating_sub(val_start) >= 8 {
                    for k in i..val_start {
                        out.push(chars[k]);
                    }
                    out.push_str(SANCTUARY_REDACTED_TOKEN);
                    i = scan;
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

pub const SANCTUARY_REDACTED_HEX_SESSION: &str = "000000000000000000000000";

pub fn scrub_user_data_from_log(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }

    let path_stops = ['\\', '/', '"', '\'', '<', '>', '\r', '\n', '&', '|'];
    let mut text = input.to_string();

    // 1. Redact GUID: <UUID/Hex> (e.g. GUID: BC7AFD5D-ECE9-11EF-BE02-E6D1369926EE&#13; &#10;</desyncdata></report>)
    text = redact_guid_tokens(&text);

    // 2a. Redact sessionid and desyncid with 24 hex zeroes for strict XML hex parser compatibility
    for hex_tag in ["sessionid", "desyncid"] {
        text = redact_xml_tag_chars(&text, hex_tag, SANCTUARY_REDACTED_HEX_SESSION);
    }

    // 2b. Redact machine/user XML tags with [REDACTED BY SANCTUARY]
    for tag in [
        "guid",
        "userid",
        "machineid",
        "computername",
        "accountid",
    ] {
        text = redact_xml_tag_chars(&text, tag, SANCTUARY_REDACTED_TOKEN);
    }

    // 3. Redact file paths containing the Username across Windows, macOS, Linux, and OneDrive
    for marker in [
        "\\\\users\\\\",
        "\\users\\",
        "/users/",
        "/home/",
        "\\documents and settings\\",
        "/documents and settings/",
        "onedrive - ",
    ] {
        text = redact_after_marker_chars(&text, marker, &path_stops);
    }

    // 4. Redact current OS USERNAME / USER and COMPUTERNAME / HOSTNAME if any literal occurrences remain
    for env_key in ["USERNAME", "USER"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 2 {
                for pat in [
                    format!("\\{}\\", trimmed),
                    format!("\\\\{}\\\\", trimmed),
                    format!("/{}/", trimmed),
                ] {
                    let repl = if pat.starts_with("\\\\") {
                        format!("\\\\{}\\\\", SANCTUARY_REDACTED_TOKEN)
                    } else if pat.starts_with('\\') {
                        format!("\\{}\\", SANCTUARY_REDACTED_TOKEN)
                    } else {
                        format!("/{}/", SANCTUARY_REDACTED_TOKEN)
                    };
                    text = text.replace(&pat, &repl);
                }
            }
        }
    }

    for host_key in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(val) = std::env::var(host_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 3 {
                text = text.replace(trimmed, SANCTUARY_REDACTED_TOKEN);
            }
        }
    }

    text
}

