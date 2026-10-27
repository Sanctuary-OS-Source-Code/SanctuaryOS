use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

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

static INITIALIZED_DB_PATHS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashSet<PathBuf>>,
> = std::sync::OnceLock::new();

pub fn get_db_conn(vault_path: &str) -> Connection {
    let path = get_cache_path(vault_path);
    let conn = Connection::open(&path).unwrap_or_else(|_| Connection::open_in_memory().unwrap());
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));

    let initialized =
        INITIALIZED_DB_PATHS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()));
    let needs_init = initialized
        .lock()
        .map(|mut set| set.insert(path))
        .unwrap_or(true);

    if needs_init {
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
    }
    conn
}

fn load_cache_from_conn(conn: &Connection) -> BunkerCache {
    let mut stmt = match conn.prepare_cached("SELECT path, mtime, dna_hash, explicitly_local, quarantined, heuristic_malware_sig, heuristic_sigs_mtime FROM cache") {
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

pub fn load_cache(vault_path: &str) -> BunkerCache {
    let conn = get_db_conn(vault_path);
    load_cache_from_conn(&conn)
}

pub fn upsert_cache_entry(conn: &Connection, path: &str, entry: &CacheEntry) {
    let explicitly_local_int = if entry.explicitly_local { 1 } else { 0 };
    let quarantined_int = if entry.quarantined { 1 } else { 0 };
    if let Ok(mut stmt) = conn.prepare_cached(
        "INSERT INTO cache (path, mtime, dna_hash, explicitly_local, quarantined, heuristic_malware_sig, heuristic_sigs_mtime) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
            mtime=excluded.mtime,
            dna_hash=excluded.dna_hash,
            explicitly_local=excluded.explicitly_local,
            quarantined=excluded.quarantined,
            heuristic_malware_sig=excluded.heuristic_malware_sig,
            heuristic_sigs_mtime=excluded.heuristic_sigs_mtime",
    ) {
        let _ = stmt.execute(params![
            path,
            entry.mtime as i64,
            entry.dna_hash,
            explicitly_local_int,
            quarantined_int,
            entry.heuristic_malware_sig,
            entry.heuristic_sigs_mtime as i64
        ]);
    }
}

pub fn remove_cache_entry(conn: &Connection, path: &str) {
    if let Ok(mut stmt) = conn.prepare_cached("DELETE FROM cache WHERE path = ?1") {
        let _ = stmt.execute(params![path]);
    }
}

pub fn save_cache(vault_path: &str, cache: &BunkerCache) {
    let mut conn = get_db_conn(vault_path);
    let current_db_cache = load_cache_from_conn(&conn);

    let Ok(tx) = conn.transaction() else {
        return;
    };

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

    let _ = tx.commit();
}

pub fn calculate_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
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

pub fn is_macos_or_os_metadata_path(path: &Path) -> bool {
    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
        let lower = fname.to_lowercase();
        if lower == ".ds_store"
            || lower == "desktop.ini"
            || lower == "thumbs.db"
            || lower.starts_with("._")
        {
            return true;
        }
    }
    for comp in path.components() {
        if let std::path::Component::Normal(os_str) = comp {
            let s = os_str.to_string_lossy();
            if s.eq_ignore_ascii_case("__MACOSX") || s.eq_ignore_ascii_case(".DS_Store") {
                return true;
            }
        }
    }
    false
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
            if is_macos_or_os_metadata_path(&p) {
                continue;
            }
            if p.is_dir() {
                if let Some(name) = p.file_name() {
                    let name_str = name.to_string_lossy().to_lowercase();
                    if name_str == "sandbox"
                        || name_str == "dev"
                        || name_str == "resource"
                        || name_str == "__macosx"
                        || name_str.starts_with('.')
                    {
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

pub fn expand_env_vars(path: &str) -> String {
    let trimmed = path.trim();
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .or_else(|| dirs::home_dir().map(|d| d.to_string_lossy().into_owned()));

    let tilde_expanded = if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\")
    {
        if let Some(ref home) = home_dir {
            if trimmed == "~" {
                home.clone()
            } else {
                format!(
                    "{}{}",
                    home.trim_end_matches(|c| c == '/' || c == '\\'),
                    &trimmed[1..]
                )
            }
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    };

    let dollar_expanded = if let Some(ref home) = home_dir {
        tilde_expanded
            .replace("${HOME}", home)
            .replace("$HOME", home)
    } else {
        tilde_expanded
    };

    let mut result = String::new();
    let mut chars = dollar_expanded.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut found_end = false;
            while let Some(&next_c) = chars.peek() {
                if next_c == '%' {
                    chars.next();
                    found_end = true;
                    break;
                }
                var_name.push(chars.next().unwrap());
            }
            if found_end {
                let resolved = std::env::var(&var_name).ok().or_else(|| {
                    match var_name.to_uppercase().as_str() {
                        "USERPROFILE" | "HOME" => home_dir.clone(),
                        "LOCALAPPDATA" => home_dir.as_ref().map(|p| {
                            #[cfg(target_os = "windows")]
                            {
                                format!("{}\\AppData\\Local", p)
                            }
                            #[cfg(not(target_os = "windows"))]
                            {
                                format!("{}/Library/Application Support", p)
                            }
                        }),
                        "APPDATA" => home_dir.as_ref().map(|p| {
                            #[cfg(target_os = "windows")]
                            {
                                format!("{}\\AppData\\Roaming", p)
                            }
                            #[cfg(not(target_os = "windows"))]
                            {
                                format!("{}/Library/Application Support", p)
                            }
                        }),
                        "PROGRAMFILES" => Some("C:\\Program Files".to_string()),
                        "PROGRAMFILES(X86)" => Some("C:\\Program Files (x86)".to_string()),
                        _ => None,
                    }
                });
                if let Some(val) = resolved {
                    result.push_str(&val);
                } else {
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if dollar_expanded.contains("%USERPROFILE%") && result.contains('\\') {
            result = result.replace('\\', "/");
        }
    }
    result
}

fn normalize_path_key(p: &std::path::Path) -> String {
    p.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn safe_wipe_mods_dir_inner(
    dir: &std::path::Path,
    game_schema: &Option<crate::schema::GameSchema>,
    shared_with_vanilla: bool,
    tracked_set: &std::collections::HashSet<String>,
) {
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
                .and_then(|s| {
                    s.load_order
                        .as_ref()
                        .and_then(|lo| lo.manifest_file.clone())
                        .filter(|m| !m.is_empty())
                        .or_else(|| {
                            if !s.paths.manifest_file.is_empty() {
                                Some(s.paths.manifest_file.clone())
                            } else {
                                None
                            }
                        })
                })
                .unwrap_or_else(|| {
                    if crate::game_logic::is_sims4_schema(game_schema) {
                        "Resource.cfg".to_string()
                    } else {
                        String::new()
                    }
                });

            let parent_is_resource_subdir = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("resource"))
                .unwrap_or(false);

            if !parent_is_resource_subdir
                && path.file_name().and_then(|n| n.to_str()).map_or(false, |n| {
                    (!manifest_name.is_empty() && n.eq_ignore_ascii_case(&manifest_name))
                        || (crate::game_logic::is_sims4_schema(game_schema)
                            && n.eq_ignore_ascii_case("Resource.cfg"))
                })
            {
                return;
            }

            if shared_with_vanilla {
                let norm = normalize_path_key(&path);
                if path.is_dir() {
                    safe_wipe_mods_dir_inner(&path, game_schema, true, tracked_set);
                    if tracked_set.contains(&norm) {
                        let _ = std::fs::remove_dir(&path);
                    }
                } else if tracked_set.contains(&norm) {
                    let _ = std::fs::remove_file(&path);
                }
                return;
            }

            if path.is_dir() {
                safe_wipe_mods_dir_inner(&path, game_schema, false, tracked_set);
                let _ = std::fs::remove_dir(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        });
    }
}

pub fn safe_wipe_mods_dir(dir: &std::path::Path, game_schema: &Option<crate::schema::GameSchema>) {
    let shared_with_vanilla = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.mods_dir_is_shared_with_vanilla)
        .unwrap_or(false);

    let mut tracked_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut manifest_locations = vec![dir.join(".sanctuary_deployed_links.json")];
    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    if !saved_coords.vault_path.trim().is_empty() {
        manifest_locations.push(
            std::path::PathBuf::from(&saved_coords.vault_path)
                .join(".sanctuary_deployed_links.json"),
        );
    }

    for loc in &manifest_locations {
        if loc.exists() {
            if let Ok(raw) = std::fs::read_to_string(loc) {
                if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                    for item in list {
                        let p = std::path::PathBuf::from(&item);
                        let norm = normalize_path_key(&p);
                        if !norm.is_empty() {
                            tracked_set.insert(norm);
                        }
                    }
                }
            }
            let _ = std::fs::remove_file(loc);
        }
    }

    safe_wipe_mods_dir_inner(dir, game_schema, shared_with_vanilla, &tracked_set);
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

#[allow(dead_code)]
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

pub fn are_paths_on_same_filesystem(p1: &Path, p2: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let existing_ancestor = |p: &Path| -> Option<PathBuf> {
            for anc in p.ancestors() {
                if !anc.as_os_str().is_empty() && anc.exists() {
                    return Some(anc.to_path_buf());
                }
            }
            None
        };
        if let (Some(a1), Some(a2)) = (existing_ancestor(p1), existing_ancestor(p2)) {
            if let (Ok(m1), Ok(m2)) = (std::fs::metadata(a1), std::fs::metadata(a2)) {
                return m1.dev() == m2.dev();
            }
        }
        false
    }
    #[cfg(not(unix))]
    {
        p1.components().next() == p2.components().next()
    }
}

#[cfg(unix)]
fn resolve_unix_backup_dir(source_path: &Path, vault_path: &str, lane: &str) -> Option<PathBuf> {
    let vault_p = PathBuf::from(vault_path);
    if !vault_path.trim().is_empty() && are_paths_on_same_filesystem(source_path, &vault_p) {
        return Some(vault_p.join("Backups").join(lane));
    }

    let vault_name = vault_p
        .file_name()
        .unwrap_or(std::ffi::OsStr::new("default"))
        .to_string_lossy()
        .into_owned();

    let src_str = source_path.to_string_lossy();
    if let Some(rest) = src_str.strip_prefix("/Volumes/") {
        if let Some(vol_name) = rest.split('/').next().filter(|s| !s.is_empty()) {
            let vol_root = PathBuf::from("/Volumes").join(vol_name);
            return Some(
                vol_root
                    .join(".sanctuary_backups")
                    .join(&vault_name)
                    .join(lane),
            );
        }
    }

    if let Some(home) = dirs::home_dir() {
        return Some(home.join(".sanctuary_backups").join(vault_name).join(lane));
    }

    None
}

pub fn get_engine_backups_dir(live_path: &str, vault_path: &str) -> Option<PathBuf> {
    if live_path.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(live_path);

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "Engine");
    }

    #[cfg(not(unix))]
    {
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

    #[cfg(unix)]
    {
        return resolve_unix_backup_dir(&p, vault_path, "World");
    }

    #[cfg(not(unix))]
    {
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
}

#[cfg(windows)]
pub fn calculate_sizes(path: &std::path::Path) -> (u64, u64) {
    let mut total_size = 0;
    let diff_size = 0; // Old backups on Windows will gracefully fallback to 0 delta size
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

pub fn current_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_skipped_vault_subdir(name_lower: &str) -> bool {
    name_lower == "sandbox"
        || name_lower == "dev"
        || name_lower == "resource"
        || name_lower == "quarantine"
        || name_lower == "__macosx"
        || name_lower.starts_with('.')
}

pub fn resolve_vault_config_destination(
    vault_mods_path: &Path,
    relative_path: &Path,
    file_name: &str,
) -> PathBuf {
    if relative_path.components().count() > 1 {
        return vault_mods_path.join(relative_path);
    }

    let fname_lower = file_name.to_lowercase();

    // 1. Search 1-2 levels deep in vault_mods_path for an existing subfolder containing `file_name`
    if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
        for entry in entries.flatten() {
            let sub_path = entry.path();
            if !sub_path.is_dir() {
                continue;
            }
            let sub_name = entry.file_name().to_string_lossy().to_lowercase();
            if is_skipped_vault_subdir(&sub_name) {
                continue;
            }
            // Check 1 level deep
            if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                for sub_entry in sub_entries.flatten() {
                    let p = sub_entry.path();
                    if p.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        return p;
                    } else if p.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            // Check 2 levels deep
                            if let Ok(sub2_entries) = std::fs::read_dir(&p) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let p2 = sub2_entry.path();
                                    if p2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        return p2;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. If not yet present in any subfolder, check if a subfolder owns mods with a matching `<prefix>_` (e.g., `mc_` -> `mc_cmd_center.ts4script`)
    if let Some(underscore_idx) = fname_lower.find('_') {
        let prefix = &fname_lower[..=underscore_idx]; // includes trailing '_'
        if prefix.len() >= 3 {
            if let Ok(entries) = std::fs::read_dir(vault_mods_path) {
                for entry in entries.flatten() {
                    let sub_path = entry.path();
                    if !sub_path.is_dir() {
                        continue;
                    }
                    let sub_name = entry.file_name().to_string_lossy().to_lowercase();
                    if is_skipped_vault_subdir(&sub_name) {
                        continue;
                    }
                    if prefix == "mc_"
                        && (sub_name.contains("mc command center") || sub_name == "mccc")
                    {
                        return sub_path.join(file_name);
                    }
                    if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                        for sub_entry in sub_entries.flatten() {
                            let p = sub_entry.path();
                            if p.is_file() {
                                let child_lower =
                                    sub_entry.file_name().to_string_lossy().to_lowercase();
                                if child_lower.starts_with(prefix)
                                    && (child_lower.ends_with(".ts4script")
                                        || child_lower.ends_with(".package")
                                        || child_lower.ends_with(".dll")
                                        || child_lower.ends_with(".asi"))
                                {
                                    return sub_path.join(file_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    vault_mods_path.join(relative_path)
}

fn dir_contains_mod_binaries(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if matches!(
                        ext_lower.as_str(),
                        "ts4script"
                            | "package"
                            | "dll"
                            | "asi"
                            | "rpf"
                            | "cak"
                            | "pac"
                            | "esp"
                            | "esm"
                            | "esl"
                            | "bsa"
                            | "ba2"
                            | "archive"
                            | "pak"
                    ) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn find_surviving_vault_file(
    vault_mods_lane: &Path,
    fname_lower: &str,
    excluded_path: &Path,
) -> Option<PathBuf> {
    if !vault_mods_lane.exists() {
        return None;
    }

    let mut fallback_match: Option<PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p == excluded_path {
                continue;
            }
            if p.is_file() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(fname_lower)
                {
                    fallback_match = Some(p);
                }
            } else if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if is_skipped_vault_subdir(&dname) {
                    continue;
                }
                if let Ok(sub_entries) = std::fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sp = sub_entry.path();
                        if sp == excluded_path {
                            continue;
                        }
                        if sp.is_file()
                            && sub_entry
                                .file_name()
                                .to_string_lossy()
                                .eq_ignore_ascii_case(fname_lower)
                        {
                            if dir_contains_mod_binaries(&p) {
                                return Some(sp);
                            }
                            if fallback_match.is_none() {
                                fallback_match = Some(sp);
                            }
                        } else if sp.is_dir() {
                            let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                            if !is_skipped_vault_subdir(&sub2_name) {
                                if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                    for sub2_entry in sub2_entries.flatten() {
                                        let sp2 = sub2_entry.path();
                                        if sp2 == excluded_path {
                                            continue;
                                        }
                                        if sp2.is_file()
                                            && sub2_entry
                                                .file_name()
                                                .to_string_lossy()
                                                .eq_ignore_ascii_case(fname_lower)
                                        {
                                            if dir_contains_mod_binaries(&sp)
                                                || dir_contains_mod_binaries(&p)
                                            {
                                                return Some(sp2);
                                            }
                                            if fallback_match.is_none() {
                                                fallback_match = Some(sp2);
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

    fallback_match
}

pub fn deduplicate_vault_root_configs(vault_mods_lane: &Path, config_exts: &[String]) {
    if !vault_mods_lane.exists() {
        return;
    }

    let is_config_ext = |ext_lower: &str| -> bool {
        matches!(ext_lower, "cfg" | "ini" | "json" | "xml" | "txt" | "log")
            || config_exts.iter().any(|e| e.eq_ignore_ascii_case(ext_lower))
    };

    let mut root_configs: Vec<(String, PathBuf)> = Vec::new();
    let mut subdirs: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(vault_mods_lane) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_lowercase();
                if !is_skipped_vault_subdir(&dname) {
                    subdirs.push(p);
                }
            } else if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower == "resource.cfg"
                    || fname_lower == "default.ini"
                    || fname_lower == "desktop.ini"
                    || fname_lower.starts_with('.')
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if is_config_ext(&ext.to_lowercase()) {
                        root_configs.push((fname_lower, p));
                    }
                }
            }
        }
    }

    if root_configs.is_empty() || subdirs.is_empty() {
        return;
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let mut removed_root_paths: Vec<String> = Vec::new();

    for (fname_lower, root_file) in root_configs {
        // Prefer a subfolder match where the folder actually contains mod binaries
        let mut preferred_match: Option<PathBuf> = None;
        let mut fallback_match: Option<PathBuf> = None;

        'search: for subdir in &subdirs {
            if let Ok(sub_entries) = std::fs::read_dir(subdir) {
                for sub_entry in sub_entries.flatten() {
                    let sp = sub_entry.path();
                    if sp.is_file()
                        && sub_entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&fname_lower)
                    {
                        if dir_contains_mod_binaries(subdir) {
                            preferred_match = Some(sp);
                            break 'search;
                        } else if fallback_match.is_none() {
                            fallback_match = Some(sp);
                        }
                    } else if sp.is_dir() {
                        let sub2_name = sub_entry.file_name().to_string_lossy().to_lowercase();
                        if !is_skipped_vault_subdir(&sub2_name) {
                            if let Ok(sub2_entries) = std::fs::read_dir(&sp) {
                                for sub2_entry in sub2_entries.flatten() {
                                    let sp2 = sub2_entry.path();
                                    if sp2.is_file()
                                        && sub2_entry
                                            .file_name()
                                            .to_string_lossy()
                                            .eq_ignore_ascii_case(&fname_lower)
                                    {
                                        if dir_contains_mod_binaries(&sp)
                                            || dir_contains_mod_binaries(subdir)
                                        {
                                            preferred_match = Some(sp2);
                                            break 'search;
                                        } else if fallback_match.is_none() {
                                            fallback_match = Some(sp2);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(sub_file) = preferred_match.or(fallback_match) {
            let root_is_symlink = std::fs::symlink_metadata(&root_file)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
                || std::fs::read_link(&root_file).is_ok();

            if !root_is_symlink {
                let root_meta = std::fs::metadata(&root_file).ok();
                let sub_meta = std::fs::metadata(&sub_file).ok();
                if let (Some(rm), Some(sm)) = (root_meta, sub_meta) {
                    if rm.len() > 0 {
                        let should_preserve_root_data = if sm.len() == 0 {
                            true
                        } else if let (Ok(rt), Ok(st)) = (rm.modified(), sm.modified()) {
                            // Only overwrite subfolder config if root is newer AND not a truncated/empty stub
                            rt > st && rm.len() >= sm.len() / 2
                        } else {
                            false
                        };
                        if should_preserve_root_data {
                            let _ = std::fs::copy(&root_file, &sub_file);
                        }
                    }
                }
            }

            if std::fs::remove_file(&root_file).is_ok() {
                removed_root_paths.push(root_file.to_string_lossy().to_string());

                // If live Mods/<fname> symlink was pointing to the removed root duplicate, re-point it to sub_file
                if !config.mods_path.trim().is_empty() {
                    if let Some(actual_name) = sub_file.file_name() {
                        let live_cfg = Path::new(&config.mods_path).join(actual_name);
                        if let Ok(link_target) = std::fs::read_link(&live_cfg) {
                            if link_target == root_file {
                                let _ = std::fs::remove_file(&live_cfg);
                                let _ = create_symlink_file(&sub_file, &live_cfg)
                                    .or_else(|_| std::fs::copy(&sub_file, &live_cfg).map(|_| ()));
                            }
                        }
                    }
                }
            }
        }
    }

    // Purge any removed root duplicate entries from SQLite cache so ghost entries never linger
    if !removed_root_paths.is_empty() && !config.vault_path.trim().is_empty() {
        let conn = get_db_conn(&config.vault_path);
        for p_str in &removed_root_paths {
            let norm_win = p_str.replace('/', "\\");
            let norm_unix = p_str.replace('\\', "/");
            let _ = conn.execute(
                "DELETE FROM cache WHERE path = ?1 OR path = ?2 OR path = ?3",
                params![p_str, norm_win, norm_unix],
            );
        }
    }
}

pub fn cleanup_live_counterparts_on_delete(deleted_path: &Path, deleted_file_names: &[String]) {
    let is_protected = |name_lower: &str| -> bool {
        matches!(
            name_lower,
            "resource.cfg"
                | "default.ini"
                | "desktop.ini"
                | ".ds_store"
                | ".sanctuary_deployed_links.json"
                | ".sanctuary_cache.db"
                | ".sanctuary_cache.json"
        )
    };

    let mut target_names_lower: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    if let Some(fname) = deleted_path.file_name().and_then(|n| n.to_str()) {
        let lower = fname.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }
    for name in deleted_file_names {
        let lower = name.to_lowercase();
        if !is_protected(&lower) {
            target_names_lower.insert(lower);
        }
    }

    let config = crate::commands::state_ops::get_saved_coordinates();
    let vault_mods_lane = if !config.vault_path.trim().is_empty() {
        Some(get_vault_mods_lane(&config.vault_path))
    } else {
        None
    };

    // Map any surviving copy in Vault/Mods so deleting a duplicate never kills the remaining copy's live link
    let mut surviving_vault_copies: std::collections::HashMap<String, PathBuf> =
        std::collections::HashMap::new();
    if let Some(ref lane) = vault_mods_lane {
        for name_lower in &target_names_lower {
            if let Some(survivor) = find_surviving_vault_file(lane, name_lower, deleted_path) {
                surviving_vault_copies.insert(name_lower.clone(), survivor);
            }
        }
    }

    // 1. Clean up or re-point exact relative path in live Mods folder if present
    if let Some(ref lane) = vault_mods_lane {
        if let Ok(rel) = deleted_path.strip_prefix(lane) {
            if !config.mods_path.trim().is_empty() {
                let live_rel = Path::new(&config.mods_path).join(rel);
                if live_rel != deleted_path {
                    let fname_lower = live_rel
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default()
                        .to_lowercase();
                    if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                        if live_rel.parent().map(|p| p == Path::new(&config.mods_path)).unwrap_or(false) {
                            let _ = std::fs::remove_file(&live_rel);
                            let _ = create_symlink_file(survivor, &live_rel)
                                .or_else(|_| std::fs::copy(survivor, &live_rel).map(|_| ()));
                        }
                    } else if let Ok(meta) = std::fs::symlink_metadata(&live_rel) {
                        if meta.file_type().is_symlink() || std::fs::read_link(&live_rel).is_ok() {
                            if live_rel.is_dir() {
                                let _ = std::fs::remove_dir(&live_rel);
                            } else {
                                let _ = std::fs::remove_file(&live_rel);
                            }
                        } else if meta.is_file() {
                            let _ = std::fs::remove_file(&live_rel);
                        }
                    }
                }
            }
        }
    }

    // 2. Clean up or re-point live counterparts and symlinks in config.mods_path
    if !config.mods_path.trim().is_empty() {
        let mods_dir = PathBuf::from(&config.mods_path);
        if mods_dir.exists() && mods_dir != deleted_path {
            let remove_or_relink_in_dir = |dir: &Path| {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p == deleted_path {
                            continue;
                        }
                        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                        if is_protected(&fname_lower) {
                            continue;
                        }
                        let mut matches_target = target_names_lower.contains(&fname_lower);
                        let mut points_to_deleted = false;
                        if let Ok(link_target) = std::fs::read_link(&p) {
                            if link_target == deleted_path
                                || link_target.starts_with(deleted_path)
                            {
                                matches_target = true;
                                points_to_deleted = true;
                            }
                        }
                        if matches_target {
                            // If another copy of this file still exists in the Vault, re-link instead of deleting!
                            if let Some(survivor) = surviving_vault_copies.get(&fname_lower) {
                                if points_to_deleted || dir == mods_dir {
                                    let _ = std::fs::remove_file(&p);
                                    let _ = create_symlink_file(survivor, &p)
                                        .or_else(|_| std::fs::copy(survivor, &p).map(|_| ()));
                                }
                                continue;
                            }

                            let is_link = std::fs::read_link(&p).is_ok()
                                || std::fs::symlink_metadata(&p)
                                    .map(|m| m.file_type().is_symlink())
                                    .unwrap_or(false);
                            if is_link {
                                if p.is_dir() {
                                    let _ = std::fs::remove_dir(&p);
                                } else {
                                    let _ = std::fs::remove_file(&p);
                                }
                            } else if p.is_file() {
                                let _ = std::fs::remove_file(&p);
                            }
                        }
                    }
                }
            };

            remove_or_relink_in_dir(&mods_dir);
            if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let dname = entry.file_name().to_string_lossy().to_lowercase();
                        if dname != "resource" && !dname.starts_with('.') {
                            remove_or_relink_in_dir(&p);
                        }
                    }
                }
            }
        }
    }
}

