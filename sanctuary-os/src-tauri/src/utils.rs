use crate::commands::state_ops::*;
use crate::commands::library::*;
use crate::commands::deployment::*;
use crate::commands::backups::*;
use crate::commands::radar::*;
use crate::commands::shelter::*;
use crate::commands::config::*;
use crate::commands::overrides::*;
use crate::commands::system::*;
use crate::commands::logs::*;
use crate::commands::cache::*;
use crate::commands::game_info::*;
use notify::Watcher;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};
use crate::state::*;


pub fn process_structure_nodes(schema: &Option<crate::schema::GameSchema>, nodes: &[StructureNode], current_target_dir: &std::path::Path, vault_mods_lane: &std::path::Path, folders_to_check: &[&str]) {
    for node in nodes {
        if node.node_type == "folder" {
            let next_target_dir = current_target_dir.join(&node.name);
            let _ = std::fs::create_dir_all(&next_target_dir);
            if let Some(children) = &node.children {
                process_structure_nodes(schema, children, &next_target_dir, vault_mods_lane, folders_to_check);
            }
        } else if node.node_type == "file" {
            let mod_name = node.assigned_mod_name.as_ref().unwrap_or(&node.name);
            let mut source = vault_mods_lane.join(mod_name);
            let mut found = false;
            for f in folders_to_check {
                let base_test = if f.is_empty() { vault_mods_lane.join(mod_name) } else { vault_mods_lane.join(f).join(mod_name) };
                                let exts = crate::game_logic::get_supported_extensions(schema);
                if base_test.is_file() { source = base_test; found = true; break; }
                else {
                    for ext in exts {
                        if base_test.with_extension(&ext).is_file() {
                            source = base_test.with_extension(&ext);
                            found = true;
                            break;
                        }
                    }
                    if found { break; }
                }
            }
            if found {
                let mut final_name = node.name.clone();
                if final_name.starts_with("*.") {
                    final_name = source.file_name().unwrap_or_default().to_string_lossy().into_owned();
                }
                let target_path = current_target_dir.join(final_name);
                if source.is_dir() {
                    let _ = deploy_junction(&source, &target_path);
                } else {
                    let _ = create_symlink_file(&source, &target_path)
                        .or_else(|_| std::fs::hard_link(&source, &target_path))
                        .or_else(|_| std::fs::copy(&source, &target_path).map(|_| ()));
                }
            }
        }
    }
}

pub fn is_mods_dir(path: &Path) -> bool {
    path.file_name().map_or(false, |n| n.to_string_lossy().eq_ignore_ascii_case("mods"))
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
            heuristic_sigs_mtime INTEGER NOT NULL
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
    let mut stmt = conn.prepare("SELECT path, mtime, dna_hash, explicitly_local, quarantined, heuristic_malware_sig, heuristic_sigs_mtime FROM cache").unwrap_or_else(|_| panic!("Failed to prepare select statement"));
    let cache_iter = stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let mtime: u64 = row.get(1)?;
        let dna_hash: String = row.get(2)?;
        let explicitly_local_int: i32 = row.get(3)?;
        let quarantined_int: i32 = row.get(4)?;
        let heuristic_malware_sig: Option<String> = row.get(5)?;
        let heuristic_sigs_mtime: u64 = row.get(6)?;
        Ok((path, CacheEntry {
            mtime,
            dna_hash,
            explicitly_local: explicitly_local_int != 0,
            quarantined: quarantined_int != 0,
            heuristic_malware_sig,
            heuristic_sigs_mtime,
        }))
    }).unwrap();

    let mut cache = HashMap::new();
    for entry in cache_iter {
        if let Ok((path, e)) = entry {
            cache.insert(path, e);
        }
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
            entry.mtime,
            entry.dna_hash,
            explicitly_local_int,
            quarantined_int,
            entry.heuristic_malware_sig,
            entry.heuristic_sigs_mtime
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

pub fn walk_packages(game_schema: &Option<crate::schema::GameSchema>, dir: &Path, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name() {
                    let name_str = name.to_string_lossy().to_lowercase();
                    if name_str == "sandbox" || name_str == "dev" {
                        continue;
                    }
                }
                walk_packages(game_schema, &p, files);
            } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
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
            if file_name == ".sanctuary_cache.json" || file_name == "desktop.ini" || file_name == "default.ini" {
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

pub fn deploy_junction(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let cmd_str = format!(
            "mklink /J \"{}\" \"{}\"",
            target.to_str().unwrap(),
            source.to_str().unwrap()
        );
        let status = std::process::Command::new("cmd")
            .args(&["/C", &cmd_str])
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
            let manifest_name = game_schema.as_ref().map(|s| s.paths.manifest_file.clone()).unwrap_or_default();
            if path.file_name().map_or(false, |n| n == manifest_name.as_str()) {
                return;
            }
            
            let is_symlink_or_junction = std::fs::read_link(&path).is_ok() || 
                std::fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);

            if is_symlink_or_junction {
                if path.is_dir() {
                    let _ = std::fs::remove_dir(&path);
                } else {
                    let _ = std::fs::remove_file(&path);
                }
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

pub fn check_heuristic_malware(path: &Path, signatures: &[HeuristicSignature]) -> Option<String> {
    if signatures.is_empty() { return None; }
    
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    
    for sig in signatures {
        if !sig.enabled { continue; }
        let sig_lower = sig.signature.to_lowercase();
        if sig.match_type == "file_name_exact" && file_name == sig_lower { return Some(sig.signature.clone()); }
        if sig.match_type == "file_name_contains" && file_name.contains(&sig_lower) { return Some(sig.signature.clone()); }
    }

    let has_content_sigs = signatures.iter().any(|s| s.enabled && s.match_type == "file_content_contains");
    let content_sigs: Vec<_> = signatures.iter().filter(|s| s.enabled && s.match_type == "file_content_contains").collect();

    if let Ok(file) = std::fs::File::open(path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            for i in 0..archive.len() {
                if let Ok(mut file) = archive.by_index(i) {
                    let entry_name = file.name().to_lowercase();
                    for sig in signatures {
                        if !sig.enabled { continue; }
                        let sig_lower = sig.signature.to_lowercase();
                        if sig.match_type == "archive_entry_exact" && entry_name == sig_lower { return Some(sig.signature.clone()); }
                        if sig.match_type == "archive_entry_contains" && entry_name.contains(&sig_lower) { return Some(sig.signature.clone()); }
                    }

                    if has_content_sigs && file.size() < 5 * 1024 * 1024 {
                        use std::io::Read;
                        let mut buffer = Vec::new();
                        if file.read_to_end(&mut buffer).is_ok() {
                            let content = String::from_utf8_lossy(&buffer);
                            for sig in &content_sigs {
                                if content.contains(&sig.signature) {
                                    return Some(sig.signature.clone());
                                }
                            }
                        }
                    }
                }
            }
            return None;
        }
    }

    if has_content_sigs {
        if let Ok(metadata) = std::fs::metadata(path) {
            if metadata.is_file() && metadata.len() < 5 * 1024 * 1024 {
                if let Ok(content) = std::fs::read_to_string(path) {
                    for sig in &content_sigs {
                        if content.contains(&sig.signature) {
                            return Some(sig.signature.clone());
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn check_is_explicitly_local(path: &Path, is_script: bool, game_schema: &Option<crate::schema::GameSchema>) -> bool {
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
    } else {
        if let Ok(mut file) = std::fs::File::open(path) {
            if let Ok(resources) = crate::dbpf::read_dbpf_index(path) {
                if crate::game_logic::is_explicitly_local_dbpf(game_schema, &resources) {
                    return true;
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
    if keep_count >= 999 { return; }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let mut backups: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                (p.is_file() && (p.extension() == Some(std::ffi::OsStr::new("zst")) || p.extension() == Some(std::ffi::OsStr::new("tar"))))
                || (p.is_dir() && (name.starts_with("World_State") || name.starts_with("Engine_Core")))
            })
            .collect();
            
        backups.sort_by(|a, b| {
            let m_a = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            let m_b = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
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
    let p = PathBuf::from(live_path);
    let root = p.ancestors().last()?;
    
    let vault_name = PathBuf::from(vault_path)
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();
        
    Some(root.join(".sanctuary_backups").join(vault_name).join("Engine"))
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
    previous_backup: Option<&std::path::Path>
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
                        if let (Ok(src_meta), Ok(prev_meta)) = (src_path.metadata(), prev_file.metadata()) {
                            if src_meta.len() == prev_meta.len() && src_meta.modified().ok() == prev_meta.modified().ok() {
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

