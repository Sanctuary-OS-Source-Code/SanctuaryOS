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

pub fn mark_path_hidden(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::{
            GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN,
            FILE_FLAGS_AND_ATTRIBUTES, INVALID_FILE_ATTRIBUTES,
        };
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let current = GetFileAttributesW(PCWSTR(wide.as_ptr()));
            if current != INVALID_FILE_ATTRIBUTES && (current & FILE_ATTRIBUTE_HIDDEN.0) == 0 {
                let _ = SetFileAttributesW(
                    PCWSTR(wide.as_ptr()),
                    FILE_FLAGS_AND_ATTRIBUTES(current | FILE_ATTRIBUTE_HIDDEN.0),
                );
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
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
        .map(|mut set| set.insert(path.clone()))
        .unwrap_or(true);

    if needs_init {
        mark_path_hidden(&path);
        mark_path_hidden(&PathBuf::from(format!("{}-wal", path.to_string_lossy())));
        mark_path_hidden(&PathBuf::from(format!("{}-shm", path.to_string_lossy())));
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
            "CREATE TABLE IF NOT EXISTS lab_certificates (
                dna_hash TEXT PRIMARY KEY,
                cert_json TEXT NOT NULL,
                verified_at INTEGER NOT NULL DEFAULT 0
            )",
            [],
        );
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS vault_kv_store (
                cache_key TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT 0
            )",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_hash ON cache (dna_hash)",
            [],
        );

        // Automatic migration of legacy loose JSON state files into SQLite (.sanctuary_cache.db)
        if !vault_path.trim().is_empty() {
            let v_root = Path::new(vault_path);
            let now_secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            // 1. .sanctuary_lab_certificates.json -> lab_certificates
            let legacy_certs = v_root.join(".sanctuary_lab_certificates.json");
            if legacy_certs.exists() {
                if let Ok(raw) = fs::read_to_string(&legacy_certs) {
                    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                        for item in arr {
                            if let Some(hash) = item.get("dna_hash").and_then(|h| h.as_str()) {
                                if !hash.is_empty() {
                                    let c_str = serde_json::to_string(&item).unwrap_or_default();
                                    let _ = conn.execute(
                                        "INSERT OR REPLACE INTO lab_certificates (dna_hash, cert_json, verified_at) VALUES (?1, ?2, ?3)",
                                        params![hash, c_str, now_secs],
                                    );
                                }
                            }
                        }
                    }
                    let _ = fs::remove_file(&legacy_certs);
                }
            }

            // 2. .sanctuary_routed_links.json -> vault_kv_store('routed_links')
            let legacy_routed = v_root.join(".sanctuary_routed_links.json");
            if legacy_routed.exists() {
                if let Ok(raw) = fs::read_to_string(&legacy_routed) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO vault_kv_store (cache_key, payload_json, updated_at) VALUES ('routed_links', ?1, ?2)",
                        params![raw, now_secs],
                    );
                    let _ = fs::remove_file(&legacy_routed);
                }
            }

            // 3. .sanctuary_deployed_links.json (in Vault) -> vault_kv_store('deployed_links')
            let legacy_deployed = v_root.join(".sanctuary_deployed_links.json");
            if legacy_deployed.exists() {
                if let Ok(raw) = fs::read_to_string(&legacy_deployed) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO vault_kv_store (cache_key, payload_json, updated_at) VALUES ('deployed_links', ?1, ?2)",
                        params![raw, now_secs],
                    );
                    let _ = fs::remove_file(&legacy_deployed);
                }
            }

            // 4. Data/.sanctuary_master_cache.json -> vault_kv_store('master_registry_cache')
            let legacy_master = v_root.join("Data").join(".sanctuary_master_cache.json");
            if legacy_master.exists() {
                if let Ok(raw) = fs::read_to_string(&legacy_master) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO vault_kv_store (cache_key, payload_json, updated_at) VALUES ('master_registry_cache', ?1, ?2)",
                        params![raw, now_secs],
                    );
                    let _ = fs::remove_file(&legacy_master);
                }
            }

            // 5. Data/.malware_signatures.json -> vault_kv_store('malware_signatures')
            let legacy_sigs = v_root.join("Data").join(".malware_signatures.json");
            if legacy_sigs.exists() {
                if let Ok(raw) = fs::read_to_string(&legacy_sigs) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO vault_kv_store (cache_key, payload_json, updated_at) VALUES ('malware_signatures', ?1, ?2)",
                        params![raw, now_secs],
                    );
                    let _ = fs::remove_file(&legacy_sigs);
                }
            }

            // 6. Keep actual quarantined binaries isolated inside hidden .sanctuary_quarantine, while Quarantine holds only .manifest.json reports
            let hidden_q = v_root.join(".sanctuary_quarantine");
            let reports_q = v_root.join("Quarantine");
            if hidden_q.is_dir() {
                mark_path_hidden(&hidden_q);
            }
            if reports_q.is_dir() {
                if let Ok(entries) = fs::read_dir(&reports_q) {
                    for entry in entries.flatten() {
                        let src = entry.path();
                        if src.is_file() {
                            let fname = entry.file_name().to_string_lossy().to_lowercase();
                            if !fname.ends_with(".json") {
                                let _ = fs::create_dir_all(&hidden_q);
                                mark_path_hidden(&hidden_q);
                                let dst = hidden_q.join(entry.file_name());
                                let _ = fs::rename(&src, &dst).or_else(|_| {
                                    fs::copy(&src, &dst).and_then(|_| fs::remove_file(&src))
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    conn
}

pub fn get_vault_kv(vault_path: &str, key: &str) -> Option<(String, u64)> {
    if vault_path.trim().is_empty() {
        return None;
    }
    let conn = get_db_conn(vault_path);
    conn.query_row(
        "SELECT payload_json, updated_at FROM vault_kv_store WHERE cache_key = ?1",
        params![key],
        |row| {
            let payload: String = row.get(0)?;
            let updated: i64 = row.get(1).unwrap_or(0);
            Ok((payload, updated.max(0) as u64))
        },
    )
    .ok()
}

pub fn set_vault_kv(vault_path: &str, key: &str, payload_json: &str) {
    if vault_path.trim().is_empty() {
        return;
    }
    let conn = get_db_conn(vault_path);
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let _ = conn.execute(
        "INSERT INTO vault_kv_store (cache_key, payload_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
        params![key, payload_json, now_secs],
    );
}

pub fn delete_vault_kv(vault_path: &str, key: &str) {
    if vault_path.trim().is_empty() {
        return;
    }
    let conn = get_db_conn(vault_path);
    let _ = conn.execute("DELETE FROM vault_kv_store WHERE cache_key = ?1", params![key]);
}

pub fn get_master_vault_root(vault_path: &str) -> PathBuf {
    let global_cfg = crate::commands::state_ops::get_global_config();
    if let Some(mv) = global_cfg.vault_path {
        if !mv.trim().is_empty() {
            return PathBuf::from(mv);
        }
    }
    let vp = PathBuf::from(vault_path);
    if let Some(fname) = vp.file_name().and_then(|n| n.to_str()) {
        let matches_ws = global_cfg.workspaces.iter().any(|w| {
            w.schema_id.eq_ignore_ascii_case(fname) || w.id.eq_ignore_ascii_case(fname)
        });
        if matches_ws {
            if let Some(parent) = vp.parent() {
                return parent.to_path_buf();
            }
        }
    }
    vp
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
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let unified_dir = base.join("sanctuary-os");
    let unified_path = unified_dir.join("sanctuary_config.json");
    let legacy_dir = base.join("SanctuaryOS");
    let legacy_path = legacy_dir.join("sanctuary_config.json");

    if !unified_path.exists() && legacy_path.exists() {
        let _ = fs::create_dir_all(&unified_dir);
        if fs::copy(&legacy_path, &unified_path).is_ok() {
            let _ = fs::remove_file(&legacy_path);
        }
    }
    unified_path
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
                            if cfg!(target_os = "windows") {
                                format!("{}\\AppData\\Local", p)
                            } else if cfg!(target_os = "macos") {
                                format!("{}/Library/Application Support", p)
                            } else {
                                std::env::var("XDG_DATA_HOME")
                                    .ok()
                                    .filter(|v| !v.trim().is_empty())
                                    .unwrap_or_else(|| format!("{}/.local/share", p))
                            }
                        }),
                        "APPDATA" => home_dir.as_ref().map(|p| {
                            if cfg!(target_os = "windows") {
                                format!("{}\\AppData\\Roaming", p)
                            } else if cfg!(target_os = "macos") {
                                format!("{}/Library/Application Support", p)
                            } else {
                                std::env::var("XDG_CONFIG_HOME")
                                    .ok()
                                    .filter(|v| !v.trim().is_empty())
                                    .unwrap_or_else(|| format!("{}/.config", p))
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
    if !cfg!(target_os = "windows") {
        let upper = dollar_expanded.to_uppercase();
        if (upper.contains("%USERPROFILE%")
            || upper.contains("%LOCALAPPDATA%")
            || upper.contains("%APPDATA%"))
            && result.contains('\\')
        {
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
        if let Some((raw, _)) = get_vault_kv(&saved_coords.vault_path, "deployed_links") {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for item in list {
                    let p = std::path::PathBuf::from(&item);
                    let norm = normalize_path_key(&p);
                    if !norm.is_empty() {
                        tracked_set.insert(norm);
                    }
                }
            }
            delete_vault_kv(&saved_coords.vault_path, "deployed_links");
        }
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

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn is_path_sep_byte(b: u8) -> bool {
    b == b'/' || b == b'\\'
}

fn normalize_sig_bytes(s: &str) -> Vec<u8> {
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

fn default_baseline_heuristic_rules() -> Vec<(&'static str, &'static str)> {
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
        ("ts4_poc.py", "archive_entry_exact"),
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

fn match_normalized_ascii_at(buffer: &[u8], start: usize, pattern: &[u8]) -> bool {
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

fn decode_base64_slice(input: &[u8]) -> Option<Vec<u8>> {
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

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn scan_raw_buffer_core(
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

    // 3. Universal Symbol-Chain & Token-Proximity Inspection (across .pyc, .py, .package, .dll, scripts, and binaries)
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

fn scan_buffer_for_compiled_content_sigs_detailed(
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

    // 5. Binary Container & DBPF (.package) Zlib / Zstd Decompression Layer
    // Sims 4 .package (DBPF 2.x) and other binary mod containers store internal XML tuning,
    // scripts, and resources as compressed Zlib (0x78 0x9C / 0x01 / 0xDA / 0x5E) or Zstd streams.
    let mut streams_checked = 0usize;
    let max_streams = 64usize;
    let mut pos = 0usize;
    while pos + 6 < buf_len && streams_checked < max_streams {
        let b0 = buffer[pos];
        let b1 = buffer[pos + 1];

        // Check Zlib header (CMF = 0x78, FLG check bits valid)
        if b0 == 0x78
            && (b1 == 0x9C || b1 == 0x01 || b1 == 0xDA || b1 == 0x5E)
            && ((b0 as u16) * 256 + (b1 as u16)) % 31 == 0
        {
            use std::io::Read;
            let mut decoder =
                flate2::read::ZlibDecoder::new(&buffer[pos..]).take(512 * 1024);
            let mut decompressed = Vec::new();
            let _ = decoder.read_to_end(&mut decompressed);
            if decompressed.len() >= 12 {
                streams_checked += 1;
                if let Some((sig, _)) =
                    scan_buffer_for_compiled_content_sigs_detailed(
                        &decompressed,
                        _entry_name_lower,
                        compiled,
                        false,
                    )
                {
                    return Some((sig, "heuristic_decompressed_stream"));
                }
                let consumed = decoder.into_inner().total_in() as usize;
                pos += consumed.max(2);
                continue;
            }
        } else if b0 == 0x28
            && b1 == 0xB5
            && buffer[pos + 2] == 0x2F
            && buffer[pos + 3] == 0xFD
        {
            // Zstandard frame magic
            use std::io::Read;
            if let Ok(decoder) = zstd::stream::read::Decoder::new(&buffer[pos..]) {
                let mut bounded = decoder.take(512 * 1024);
                let mut decompressed = Vec::new();
                let _ = bounded.read_to_end(&mut decompressed);
                if decompressed.len() >= 12 {
                    streams_checked += 1;
                    if let Some((sig, _)) =
                        scan_buffer_for_compiled_content_sigs_detailed(
                            &decompressed,
                            _entry_name_lower,
                            compiled,
                            false,
                        )
                    {
                        return Some((sig, "heuristic_decompressed_stream"));
                    }
                }
            }
        }
        pos += 1;
    }

    None
}

fn scan_zip_reader<R: std::io::Read + std::io::Seek>(
    reader: R,
    parent_prefix: &str,
    compiled: &CompiledSignatures,
    depth: u8,
) -> Option<HeuristicMatchDetail> {
    use std::io::Read;
    let has_content_sigs = !compiled.clauses.is_empty();
    let mut archive = zip::ZipArchive::new(reader).ok()?;

    for i in 0..archive.len() {
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

            if entry.size() <= 16 * 1024 * 1024 {
                let mut buffer = Vec::with_capacity(entry.size() as usize);
                if entry.read_to_end(&mut buffer).is_ok() && !buffer.is_empty() {
                    // Check if this entry is a nested ZIP / .ts4script archive
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
        let is_dbpf_package = has_magic && &magic == b"DBPF";
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
                        let matched_entry = if is_dbpf_package
                            && det_kind == "heuristic_decompressed_stream"
                        {
                            Some("DBPF::CompressedResourceStream".to_string())
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

pub fn check_heuristic_malware_compiled(
    path: &Path,
    compiled: &CompiledSignatures,
) -> Option<String> {
    check_heuristic_malware_detailed(path, compiled).map(|d| d.signature)
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
    for prefix in ["/run/media/", "/media/", "/mnt/"] {
        if let Some(rest) = src_str.strip_prefix(prefix) {
            let parts: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
            let mount_root = if (prefix == "/run/media/" || prefix == "/media/") && parts.len() >= 2 {
                // e.g. /run/media/deck/SDCard or /media/user/Drive
                let candidate_two = PathBuf::from(prefix).join(parts[0]).join(parts[1]);
                if candidate_two.is_dir() {
                    Some(candidate_two)
                } else {
                    Some(PathBuf::from(prefix).join(parts[0]))
                }
            } else if !parts.is_empty() {
                // e.g. /run/media/mmcblk0p1 or /mnt/gamedrive
                Some(PathBuf::from(prefix).join(parts[0]))
            } else {
                None
            };
            if let Some(root_dir) = mount_root {
                return Some(
                    root_dir
                        .join(".sanctuary_backups")
                        .join(&vault_name)
                        .join(lane),
                );
            }
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
        matches!(
            ext_lower,
            "cfg" | "ini" | "json" | "toml" | "xml" | "txt" | "log"
        ) || config_exts.iter().any(|e| e.eq_ignore_ascii_case(ext_lower))
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

/// Resolves `rel` against `base` case-insensitively on case-sensitive filesystems (Linux ext4/btrfs).
/// For each path segment, if a directory/file already exists on disk with different casing
/// (e.g. `Saves` vs `saves`, `Data/SKSE/Plugins` vs `data/skse/plugins`, `Mods` vs `mods`),
/// the existing on-disk casing is preserved so Sanctuary never creates duplicate differently-cased folders.
pub fn resolve_case_insensitive_path(base: &Path, rel: &str) -> PathBuf {
    let mut current = base.to_path_buf();
    let norm = rel.replace('\\', "/");
    for seg in norm.split('/').map(|s| s.trim()).filter(|s| !s.is_empty() && *s != ".") {
        let exact = current.join(seg);
        if exact.exists() || !current.is_dir() {
            current = exact;
            continue;
        }
        let mut matched: Option<PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().eq_ignore_ascii_case(seg) {
                    matched = Some(entry.path());
                    break;
                }
            }
        }
        current = matched.unwrap_or(exact);
    }
    current
}

/// Normalizes an absolute or relative path by matching existing parent segments case-insensitively on Linux/Unix.
pub fn normalize_existing_case_path(full_path: &Path) -> PathBuf {
    if full_path.exists() || cfg!(target_os = "windows") {
        return full_path.to_path_buf();
    }
    let mut components = full_path.components();
    let mut current = match components.next() {
        Some(first) => PathBuf::from(first.as_os_str()),
        None => return full_path.to_path_buf(),
    };
    for comp in components {
        let seg = comp.as_os_str().to_string_lossy();
        let exact = current.join(comp.as_os_str());
        if exact.exists() || !current.is_dir() {
            current = exact;
            continue;
        }
        let mut matched: Option<PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().eq_ignore_ascii_case(&seg) {
                    matched = Some(entry.path());
                    break;
                }
            }
        }
        current = matched.unwrap_or(exact);
    }
    current
}


