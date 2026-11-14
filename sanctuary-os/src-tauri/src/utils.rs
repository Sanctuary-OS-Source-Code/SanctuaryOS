use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

pub const SANCTUARY_EDGE_MANIFEST_FILE: &str = ".sanctuary.manifest.json";
pub const SANCTUARY_EDGE_OVERRIDE_FILE: &str = ".sanctuary.override.json";

pub const MAX_ARCHIVE_ENTRY_BYTES: u64 = 1024 * 1024 * 1024; // 1 GiB per file
pub const MAX_ARCHIVE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024; // 4 GiB total archive
pub const MAX_ARCHIVE_ENTRIES: usize = 25_000;

/// Atomically writes `bytes` to `path` via a sibling temporary file + `fsync` + `rename`.
pub fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create parent directory {:?}: {}", parent, e))?;

    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let base_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sanctuary_atomic");
    let tmp_path = parent.join(format!(".{}.tmp.{}.{}", base_name, pid, nanos));

    let write_res = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed writing temporary file {:?}: {}", tmp_path, e));
    }

    if path.exists() {
        if let Ok(meta) = fs::metadata(path) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
    }

    if let Err(rename_err) = fs::rename(&tmp_path, path) {
        #[cfg(target_os = "windows")]
        {
            if path.exists() {
                let _ = fs::remove_file(path);
                if fs::rename(&tmp_path, path).is_ok() {
                    return Ok(());
                }
            }
        }
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "Failed to atomically replace {:?}: {}",
            path, rename_err
        ));
    }

    Ok(())
}

pub fn process_structure_nodes(
    schema: &Option<crate::schema::GameSchema>,
    nodes: &[StructureNode],
    current_target_dir: &std::path::Path,
    vault_mods_lane: &std::path::Path,
    folders_to_check: &[&str],
    deployed_links: Option<&std::sync::Mutex<Vec<String>>>,
) -> usize {
    let mut linked_count = 0usize;
    for node in nodes {
        if node.node_type == "folder" {
            let next_target_dir = current_target_dir.join(&node.name);
            let _ = std::fs::create_dir_all(&next_target_dir);
            if let Some(dl_mutex) = deployed_links {
                if let Ok(mut dl) = dl_mutex.lock() {
                    let dir_str = next_target_dir.to_string_lossy().to_string();
                    if !dl.contains(&dir_str) {
                        dl.push(dir_str);
                    }
                }
            }
            if let Some(children) = &node.children {
                linked_count += process_structure_nodes(
                    schema,
                    children,
                    &next_target_dir,
                    vault_mods_lane,
                    folders_to_check,
                    deployed_links,
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
                        if let Some(dl_mutex) = deployed_links {
                            if let Ok(mut dl) = dl_mutex.lock() {
                                let t_str = target_path.to_string_lossy().to_string();
                                if !dl.contains(&t_str) {
                                    dl.push(t_str);
                                }
                            }
                        }
                        linked_count += 1;
                    }
                } else {
                    if create_symlink_file(&source, &target_path)
                        .or_else(|_| std::fs::hard_link(&source, &target_path))
                        .or_else(|_| std::fs::copy(&source, &target_path).map(|_| ()))
                        .is_ok()
                    {
                        if let Some(dl_mutex) = deployed_links {
                            if let Ok(mut dl) = dl_mutex.lock() {
                                let t_str = target_path.to_string_lossy().to_string();
                                if !dl.contains(&t_str) {
                                    dl.push(t_str);
                                }
                            }
                        }
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

pub fn get_vault_root_dir(vault_path: &str) -> PathBuf {
    let p = PathBuf::from(vault_path);
    if is_mods_dir(&p) {
        p.parent().unwrap_or(&p).to_path_buf()
    } else {
        p
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
    let vp_trimmed = vault_path.trim().trim_end_matches(&['/', '\\'][..]);
    let raw_p = Path::new(vp_trimmed);
    // Guard against creating a rogue .sanctuary_cache.db inside the Master Vault root (one level above <schema_id> spokes)
    if !vp_trimmed.is_empty() && raw_p.join("Data").is_dir() && !raw_p.join("Mods").is_dir() {
        let global_cfg = crate::commands::state_ops::get_global_config();
        let active_schema = global_cfg
            .active_workspace_id
            .as_deref()
            .and_then(|aid| {
                global_cfg
                    .workspaces
                    .iter()
                    .find(|w| w.id.eq_ignore_ascii_case(aid) || w.schema_id.eq_ignore_ascii_case(aid))
                    .map(|w| w.schema_id.clone())
            })
            .or_else(|| global_cfg.workspaces.first().map(|w| w.schema_id.clone()));
        if let Some(schema_id) = active_schema {
            if !schema_id.trim().is_empty() {
                let spoke_dir = raw_p.join(schema_id.trim());
                if spoke_dir.is_dir() {
                    let rogue_db = raw_p.join(".sanctuary_cache.db");
                    if rogue_db.exists() {
                        let _ = fs::remove_file(&rogue_db);
                        let _ = fs::remove_file(raw_p.join(".sanctuary_cache.db-wal"));
                        let _ = fs::remove_file(raw_p.join(".sanctuary_cache.db-shm"));
                    }
                    return spoke_dir.join(".sanctuary_cache.db");
                }
            }
        }
    }
    Path::new(vault_path).join(".sanctuary_cache.db")
}

static DB_CONNECTION_POOL: std::sync::OnceLock<
    std::sync::Mutex<HashMap<PathBuf, std::sync::Arc<std::sync::Mutex<Connection>>>>,
> = std::sync::OnceLock::new();

fn initialize_vault_sqlite_schema(conn: &Connection, db_path: &Path, vault_path: &str) {
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));

    mark_path_hidden(db_path);
    mark_path_hidden(&PathBuf::from(format!("{}-wal", db_path.to_string_lossy())));
    mark_path_hidden(&PathBuf::from(format!("{}-shm", db_path.to_string_lossy())));

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
    let _ = conn.execute("ALTER TABLE cache ADD COLUMN heuristic_malware_sig TEXT", []);
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
            created_at INTEGER NOT NULL,
            etag TEXT,
            last_modified TEXT,
            last_polled_at INTEGER,
            last_http_status INTEGER
        )",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN target_hash TEXT DEFAULT ''",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN archive_hashes TEXT DEFAULT '[]'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN game_id TEXT DEFAULT ''",
        [],
    );
    let _ = conn.execute("ALTER TABLE edge_manifests ADD COLUMN etag TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN last_modified TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN last_polled_at INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE edge_manifests ADD COLUMN last_http_status INTEGER",
        [],
    );

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

        // Keep actual quarantined binaries isolated inside hidden .sanctuary_quarantine, while Quarantine holds JSON reports
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

pub fn open_db_conn(
    vault_path: &str,
) -> Result<std::sync::Arc<std::sync::Mutex<Connection>>, String> {
    if vault_path.trim().is_empty() {
        return Err("Vault path is not configured.".to_string());
    }
    let path = get_cache_path(vault_path);
    let pool = DB_CONNECTION_POOL.get_or_init(|| std::sync::Mutex::new(HashMap::new()));

    {
        let map = pool
            .lock()
            .map_err(|_| "SQLite connection pool lock poisoned.".to_string())?;
        if path.exists() {
            if let Some(existing) = map.get(&path) {
                return Ok(existing.clone());
            }
        }
    }

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create Vault directory {:?}: {}", parent, e))?;
        }
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("Failed to open Vault database {:?}: {}", path, e))?;
    initialize_vault_sqlite_schema(&conn, &path, vault_path);

    let arc_conn = std::sync::Arc::new(std::sync::Mutex::new(conn));
    let mut map = pool
        .lock()
        .map_err(|_| "SQLite connection pool lock poisoned.".to_string())?;
    let entry = map.entry(path).or_insert_with(|| arc_conn.clone());
    Ok(entry.clone())
}

pub fn get_vault_kv(vault_path: &str, key: &str) -> Option<(String, u64)> {
    if vault_path.trim().is_empty() {
        return None;
    }
    let db = open_db_conn(vault_path).ok()?;
    let conn = db.lock().ok()?;
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
    let Ok(db) = open_db_conn(vault_path) else {
        return;
    };
    let Ok(conn) = db.lock() else {
        return;
    };
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
    let Ok(db) = open_db_conn(vault_path) else {
        return;
    };
    let Ok(conn) = db.lock() else {
        return;
    };
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
    let Ok(db) = open_db_conn(vault_path) else {
        return HashMap::new();
    };
    let Ok(conn) = db.lock() else {
        return HashMap::new();
    };
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

pub fn save_cache_entries_batch(vault_path: &str, entries: &[(String, CacheEntry)]) {
    if entries.is_empty() {
        return;
    }
    let Ok(db) = open_db_conn(vault_path) else {
        return;
    };
    let Ok(mut conn) = db.lock() else {
        return;
    };
    let Ok(tx) = conn.transaction() else {
        return;
    };
    for (path, entry) in entries {
        upsert_cache_entry(&tx, path, entry);
    }
    let _ = tx.commit();
}

/// Non-destructive incremental batched cache upsert. Never deletes unvisited rows.
pub fn save_cache(vault_path: &str, cache: &BunkerCache) {
    if cache.is_empty() {
        return;
    }
    let Ok(db) = open_db_conn(vault_path) else {
        return;
    };
    let Ok(mut conn) = db.lock() else {
        return;
    };
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
                || old_entry.heuristic_malware_sig != entry.heuristic_malware_sig
        } else {
            true
        };

        if needs_update {
            upsert_cache_entry(&tx, path, entry);
        }
    }

    let _ = tx.commit();
}

/// Prunes stale non-quarantined cache rows ONLY after a completed full scan sweep.
pub fn prune_stale_cache_entries(
    vault_path: &str,
    valid_paths: &std::collections::HashSet<String>,
) {
    let Ok(db) = open_db_conn(vault_path) else {
        return;
    };
    let Ok(mut conn) = db.lock() else {
        return;
    };
    let current_db_cache = load_cache_from_conn(&conn);
    let stale: Vec<String> = current_db_cache
        .into_iter()
        .filter(|(path, entry)| {
            !entry.quarantined
                && !path.contains(".sanctuary_quarantine")
                && !valid_paths.contains(path)
        })
        .map(|(path, _)| path)
        .collect();

    if stale.is_empty() {
        return;
    }
    let Ok(tx) = conn.transaction() else {
        return;
    };
    for path in stale {
        remove_cache_entry(&tx, &path);
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
    let exts = crate::game_logic::get_supported_extensions(game_schema);
    if exts.is_empty() {
        return;
    }
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

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
                        || name_str == "quarantine"
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
                if fname_lower.starts_with('.')
                    || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
                {
                    continue;
                }
                if !exts.contains(&ext_lower) {
                    continue;
                }
                files.push(p);
            }
        }
    }
}

#[allow(dead_code)]
pub fn deploy_air_gap(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;

        let file_name = entry.file_name().to_string_lossy().to_lowercase();
        if file_name == ".sanctuary_cache.json"
            || file_name == ".sanctuary_cache.db"
            || file_name == "desktop.ini"
            || file_name == "thumbs.db"
            || file_name == ".ds_store"
        {
            continue;
        }

        let dest = target.join(entry.file_name());
        if file_type.is_dir() {
            deploy_air_gap(&entry.path(), &dest)?;
        } else if file_type.is_file() {
            // Never create symlinks or hardlinks here: save airgap copies must have independent
            // inodes and propagate any I/O failure immediately before source removal.
            std::fs::copy(&entry.path(), &dest)?;
        }
    }
    Ok(())
}

/// Returns true if `path` is inside `.sanctuary_lab_airgap`, `.lab_save_vault`, or any schema-configured
/// live save directory, preventing accidental deletion via general file removal or shred commands.
pub fn is_protected_save_or_airgap_path(
    path: &Path,
    saved_coords: &crate::state::WorkspaceConfig,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    let cleaned = strip_windows_verbatim_prefix(path);
    for comp in cleaned.components() {
        let seg = comp.as_os_str().to_string_lossy().to_lowercase();
        if seg == ".sanctuary_lab_airgap"
            || seg == ".sanctuary_lab_sandbox"
            || seg == ".lab_save_airgap"
            || seg == ".lab_save_sandbox"
            || seg == ".lab_save_vault"
            || seg == ".airgap_journal.json"
            || seg == ".airgap_active.json"
            || seg == ".sandbox_state.json"
        {
            return true;
        }
    }

    let docs_str = resolve_effective_docs_path(saved_coords, game_schema);
    if !docs_str.trim().is_empty() {
        let docs_dir = PathBuf::from(&docs_str);
        let mut save_rels: Vec<String> = Vec::new();
        if let Some(s) = game_schema {
            if let Some(tc) = &s.time_capsule {
                if let Some(targets) = &tc.save_airgap_targets {
                    for t in targets {
                        let trimmed = t.trim();
                        if !trimmed.is_empty() {
                            save_rels.push(trimmed.to_string());
                        }
                    }
                }
                for wt in &tc.world_state_targets {
                    let wt_trimmed = wt.path.trim();
                    if !wt_trimmed.is_empty()
                        && (wt_trimmed.to_lowercase().contains("save")
                            || wt.name.to_lowercase().contains("save"))
                    {
                        save_rels.push(wt_trimmed.to_string());
                    }
                }
            }
        }
        let cand_norm = normalize_path_key(&cleaned);
        for rel in save_rels {
            let resolved_save_dir = resolve_case_insensitive_path(&docs_dir, &rel);
            let save_norm = normalize_path_key(&resolved_save_dir);
            if !save_norm.is_empty()
                && !cand_norm.is_empty()
                && (cand_norm == save_norm || cand_norm.starts_with(&format!("{}/", save_norm)))
            {
                return true;
            }
        }
    }
    false
}

pub fn is_safe_single_filename(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.contains("..")
        && !trimmed.contains('/')
        && !trimmed.contains('\\')
        && !trimmed.contains('\0')
}

/// Strips Windows extended-length verbatim prefixes (`\\?\UNC\...`, `\\?\...`, `\\.\...`)
/// consistently so path comparisons and system-folder checks can never be bypassed via `\\?\C:\Windows`.
pub fn strip_windows_verbatim_prefix(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    let trimmed = raw.trim();
    let upper = trimmed.to_ascii_uppercase();
    if upper.starts_with("\\\\?\\UNC\\") || upper.starts_with("//?/UNC/") {
        return PathBuf::from(format!("\\\\{}", &trimmed[8..]));
    }
    if upper.starts_with("\\\\?\\")
        || upper.starts_with("\\\\.\\")
        || upper.starts_with("//?/")
        || upper.starts_with("//./")
    {
        return PathBuf::from(&trimmed[4..]);
    }
    PathBuf::from(trimmed)
}

/// Resolves `target` (or its nearest existing ancestor when `target` does not yet exist)
/// via `std::fs::canonicalize`, rejecting `..`, NUL bytes, and stripping Windows verbatim prefixes.
pub fn resolve_canonical_target(target: &Path) -> Result<PathBuf, String> {
    let raw = target.to_string_lossy();
    if raw.trim().is_empty() || raw.contains('\0') {
        return Err("Path is empty or contains NUL bytes.".to_string());
    }
    let cleaned = strip_windows_verbatim_prefix(target);
    if cleaned
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Path traversal ('..') is forbidden.".to_string());
    }

    if cleaned.exists() {
        let canon = fs::canonicalize(&cleaned)
            .map_err(|e| format!("Failed to canonicalize path {:?}: {}", cleaned, e))?;
        return Ok(strip_windows_verbatim_prefix(&canon));
    }

    // Walk up to the nearest existing ancestor so new files inside symlinks/junctions still resolve canonically.
    let mut suffix_segments: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor: &Path = &cleaned;
    loop {
        if cursor.exists() {
            let canon_anc = fs::canonicalize(cursor)
                .map_err(|e| format!("Failed to canonicalize ancestor {:?}: {}", cursor, e))?;
            let mut resolved = strip_windows_verbatim_prefix(&canon_anc);
            for seg in suffix_segments.into_iter().rev() {
                resolved.push(seg);
            }
            return Ok(resolved);
        }
        let Some(name) = cursor.file_name() else {
            // Reached filesystem root without finding an existing ancestor
            return Err(format!("No existing ancestor directory for {:?}.", cleaned));
        };
        let name_str = name.to_string_lossy();
        if name_str == "." || name_str == ".." || name_str.is_empty() {
            return Err("Invalid path segment.".to_string());
        }
        suffix_segments.push(name.to_os_string());
        match cursor.parent() {
            Some(p) if !p.as_os_str().is_empty() => cursor = p,
            _ => return Err(format!("Relative or unrooted path {:?} is forbidden.", cleaned)),
        }
    }
}

pub fn path_is_within_root(child: &Path, root: &Path) -> bool {
    let mut child_comps = child.components();
    let mut root_count = 0usize;
    for r_comp in root.components() {
        root_count += 1;
        let Some(c_comp) = child_comps.next() else {
            return false;
        };
        if cfg!(target_os = "windows") {
            let r_s = r_comp.as_os_str().to_string_lossy();
            let c_s = c_comp.as_os_str().to_string_lossy();
            if !r_s.eq_ignore_ascii_case(&c_s) {
                return false;
            }
        } else if r_comp != c_comp {
            return false;
        }
    }
    root_count > 0
}

fn paths_equal_platform(a: &Path, b: &Path) -> bool {
    path_is_within_root(a, b) && path_is_within_root(b, a)
}

fn is_blocked_sensitive_or_system_path(resolved: &Path) -> bool {
    let stripped = strip_windows_verbatim_prefix(resolved);
    let win_norm = stripped
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    if win_norm.is_empty() || win_norm.ends_with(':') {
        return true;
    }

    // Block sensitive credential/key/autostart directories anywhere in the path
    let unix_norm = stripped
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase();
    for seg in [
        "/.ssh",
        "/.gnupg",
        "/.aws",
        "/.kube",
        "/.config/gcloud",
        "/.config/autostart",
        "/library/launchagents",
        "/library/launchdaemons",
        "/microsoft/windows/start menu/programs/startup",
    ] {
        if unix_norm.ends_with(seg) || unix_norm.contains(&format!("{}/", seg)) {
            return true;
        }
    }

    // Block Sanctuary's own executable install directory and internal app config/key directories
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if let Ok(canon_exe_dir) = resolve_canonical_target(exe_dir) {
                if path_is_within_root(&stripped, &canon_exe_dir) {
                    return true;
                }
            }
        }
    }
    for app_dir in [
        dirs::config_dir().map(|d| d.join("sanctuary-os")),
        dirs::config_dir().map(|d| d.join("SanctuaryOS")),
        dirs::data_local_dir().map(|d| d.join("sanctuary-os")),
        dirs::data_local_dir().map(|d| d.join("SanctuaryOS")),
        dirs::data_local_dir().map(|d| d.join("Programs").join("sanctuary-os")),
        dirs::data_local_dir().map(|d| d.join("Programs").join("SanctuaryOS")),
    ]
    .into_iter()
    .flatten()
    {
        let app_clean = strip_windows_verbatim_prefix(&app_dir);
        if path_is_within_root(&stripped, &app_clean) {
            return true;
        }
    }

    // Block OS & system prefixes across Windows, macOS, and Linux
    let mut blocked_win_prefixes: Vec<String> = vec![
        "c:\\windows".to_string(),
        "c:\\program files\\windows".to_string(),
        "c:\\program files\\windowsapps".to_string(),
        "c:\\program files\\common files".to_string(),
        "c:\\program files (x86)\\common files".to_string(),
        "c:\\programdata\\microsoft".to_string(),
        "c:\\system volume information".to_string(),
    ];
    if let Ok(sys_root) = std::env::var("SystemRoot") {
        let sr = sys_root.replace('/', "\\").trim_end_matches('\\').to_lowercase();
        if !sr.is_empty() {
            blocked_win_prefixes.push(sr);
        }
    }
    for prefix in &blocked_win_prefixes {
        if &win_norm == prefix || win_norm.starts_with(&format!("{}\\", prefix)) {
            return true;
        }
    }
    if win_norm == "c:\\program files" || win_norm == "c:\\program files (x86)" {
        return true;
    }

    let blocked_unix_prefixes = [
        "/bin", "/sbin", "/usr", "/etc", "/system", "/lib", "/lib64", "/proc", "/sys", "/dev",
        "/boot", "/root",
    ];
    for prefix in &blocked_unix_prefixes {
        if unix_norm == *prefix || unix_norm.starts_with(&format!("{}/", prefix)) {
            return true;
        }
    }

    false
}

/// Strictly verifies that `target` resolves canonically inside at least one of `allowed_roots`,
/// strips Windows `\\?\` prefixes consistently, rejects symlinks/junctions escaping `allowed_roots`,
/// and blocks OS system dirs, `~/.ssh`, `~/.gnupg`, `~/.aws`, Startup folders, and Sanctuary executable dirs.
pub fn ensure_path_within_roots(
    target: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    if allowed_roots.is_empty() {
        return Err("No allowed roots configured for path containment check.".to_string());
    }
    let cleaned_target = strip_windows_verbatim_prefix(target);
    let resolved = resolve_canonical_target(&cleaned_target)?;
    if is_blocked_sensitive_or_system_path(&resolved) {
        return Err("Refusing operation on protected system or sensitive directory.".to_string());
    }

    let mut canonical_roots: Vec<PathBuf> = Vec::new();
    for root in allowed_roots {
        if root.as_os_str().is_empty() {
            continue;
        }
        if let Ok(canon_r) = resolve_canonical_target(root) {
            if !is_blocked_sensitive_or_system_path(&canon_r) {
                canonical_roots.push(canon_r);
            }
        }
    }
    if canonical_roots.is_empty() {
        return Err("Allowed root directories could not be resolved safely.".to_string());
    }

    // Also verify the lexical parent and any symlink target so dangling symlinks cannot point outside allowed_roots
    if let Ok(meta) = fs::symlink_metadata(&cleaned_target) {
        if meta.file_type().is_symlink() {
            if let Ok(raw_link) = fs::read_link(&cleaned_target) {
                let joined_link = if raw_link.is_absolute() {
                    raw_link
                } else {
                    cleaned_target
                        .parent()
                        .unwrap_or_else(|| Path::new("."))
                        .join(raw_link)
                };
                if let Ok(canon_link) = resolve_canonical_target(&joined_link) {
                    if is_blocked_sensitive_or_system_path(&canon_link)
                        || !canonical_roots
                            .iter()
                            .any(|r| path_is_within_root(&canon_link, r))
                    {
                        return Err(
                            "Blocked symlink/junction escaping allowed root boundaries."
                                .to_string(),
                        );
                    }
                } else {
                    return Err("Blocked unresolvable symlink target.".to_string());
                }
            }
        }
    }

    if canonical_roots
        .iter()
        .any(|r| path_is_within_root(&resolved, r))
    {
        Ok(resolved)
    } else {
        Err(format!(
            "Path {:?} escapes allowed workspace boundaries.",
            cleaned_target
        ))
    }
}

/// Like `ensure_path_within_roots`, and additionally forbids operating on the root directory itself.
pub fn ensure_strict_descendant_of_roots(
    target: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    let resolved = ensure_path_within_roots(target, allowed_roots)?;
    for root in allowed_roots {
        if root.as_os_str().is_empty() {
            continue;
        }
        if let Ok(canon_r) = resolve_canonical_target(root) {
            if paths_equal_platform(&resolved, &canon_r) {
                return Err("Refusing destructive operation on workspace root directory itself.".to_string());
            }
        }
    }
    Ok(resolved)
}

pub fn get_allowed_workspace_roots(config: &WorkspaceConfig) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for s in [
        Some(config.vault_path.as_str()),
        Some(config.mods_path.as_str()),
        Some(config.live_path.as_str()),
        config.docs_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            roots.push(p.clone());
            if is_mods_dir(&p) {
                if let Some(parent) = p.parent() {
                    if !parent.as_os_str().is_empty() {
                        roots.push(parent.to_path_buf());
                    }
                }
            }
        }
    }
    roots
}

pub fn is_safe_user_file_path(path: &std::path::Path) -> bool {
    let Ok(resolved) = resolve_canonical_target(path) else {
        return false;
    };
    if is_blocked_sensitive_or_system_path(&resolved) {
        return false;
    }

    // Never allow deleting or overwriting top-level user directories or active workspace root directories themselves
    let mut protected_exact_dirs: Vec<PathBuf> = vec![
        PathBuf::from("C:\\Users"),
        PathBuf::from("/Users"),
        PathBuf::from("/home"),
        PathBuf::from("/var/home"),
        PathBuf::from("/Volumes"),
        PathBuf::from("/run/media"),
        PathBuf::from("/media"),
        PathBuf::from("/mnt"),
        PathBuf::from("/Applications"),
    ];
    for dir_opt in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::config_dir(),
        dirs::data_dir(),
        dirs::data_local_dir(),
    ]
    .into_iter()
    .flatten()
    {
        if let Ok(canon) = resolve_canonical_target(&dir_opt) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&dir_opt));
        }
    }

    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    for root_opt in [
        Some(saved_coords.vault_path.as_str()),
        Some(saved_coords.mods_path.as_str()),
        Some(saved_coords.live_path.as_str()),
        saved_coords.docs_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        let trimmed = root_opt.trim();
        if !trimmed.is_empty() {
            let rp = PathBuf::from(trimmed);
            if let Ok(canon) = resolve_canonical_target(&rp) {
                protected_exact_dirs.push(canon);
            } else {
                protected_exact_dirs.push(strip_windows_verbatim_prefix(&rp));
            }
        }
    }

    if protected_exact_dirs
        .iter()
        .any(|p| paths_equal_platform(&resolved, p))
    {
        return false;
    }

    true
}

/// Validates that `path` is a safe game/user-data workspace target directory (such as a configured
/// `docs_path` or `live_path` root) rather than an OS system path, drive root, top-level profile directory,
/// or the Sanctuary Vault root itself.
pub fn is_safe_workspace_target_dir(path: &std::path::Path) -> bool {
    if path.as_os_str().is_empty() || !path.is_absolute() {
        return false;
    }
    let Ok(resolved) = resolve_canonical_target(path) else {
        return false;
    };
    if is_blocked_sensitive_or_system_path(&resolved) {
        return false;
    }

    let mut protected_exact_dirs: Vec<PathBuf> = vec![
        PathBuf::from("C:\\Users"),
        PathBuf::from("/Users"),
        PathBuf::from("/home"),
        PathBuf::from("/var/home"),
        PathBuf::from("/Volumes"),
        PathBuf::from("/run/media"),
        PathBuf::from("/media"),
        PathBuf::from("/mnt"),
        PathBuf::from("/Applications"),
    ];
    for dir_opt in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::config_dir(),
        dirs::data_dir(),
        dirs::data_local_dir(),
    ]
    .into_iter()
    .flatten()
    {
        if let Ok(canon) = resolve_canonical_target(&dir_opt) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&dir_opt));
        }
    }

    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    let vault_trimmed = saved_coords.vault_path.trim();
    if !vault_trimmed.is_empty() {
        let vp = PathBuf::from(vault_trimmed);
        if let Ok(canon) = resolve_canonical_target(&vp) {
            protected_exact_dirs.push(canon);
        } else {
            protected_exact_dirs.push(strip_windows_verbatim_prefix(&vp));
        }
    }

    if protected_exact_dirs
        .iter()
        .any(|p| paths_equal_platform(&resolved, p))
    {
        return false;
    }

    true
}

#[derive(Clone, Debug)]
pub struct ExtractedZipEntry {
    pub staged_path: PathBuf,
    pub rel_path: PathBuf,
    #[allow(dead_code)]
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Default)]
pub struct BoundedZipExtraction {
    pub files: Vec<ExtractedZipEntry>,
    pub sanctuary_manifest_json: Option<String>,
    pub sanctuary_override_json: Option<String>,
    pub total_bytes: u64,
}

/// Pure-Rust bounded `.zip` extraction into `staging_dir` using `Read::take` (defeating Zip-Bombs
/// regardless of spoofed header size), rejecting `..`, absolute roots, drive prefixes, and Unix symlink modes,
/// preserving full directory trees & auxiliary assets (`preserve_auxiliary_assets` defaults to `true`),
/// stripping redundant wrapper/anchor folders, and reading `.sanctuary.manifest.json` / `.sanctuary.override.json`
/// without touching native game `manifest.json` files.
pub fn extract_zip_bounded_to_dir(
    zip_path: &Path,
    staging_dir: &Path,
    zip_stem_hint: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
    max_entry_bytes: u64,
    max_total_bytes: u64,
) -> Result<BoundedZipExtraction, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open archive {:?}: {}", zip_path, e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid or unsupported ZIP container: {}", e))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "Archive exceeds maximum safe entry count ({} > {}).",
            archive.len(),
            MAX_ARCHIVE_ENTRIES
        ));
    }

    fs::create_dir_all(staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;

    let preserve_aux = crate::game_logic::should_preserve_auxiliary_assets(game_schema);
    let visible_exts = crate::game_logic::get_vault_visible_extensions(game_schema);

    // First pass: validate all entry headers/modes/paths and detect if all files share a single wrapper folder matching zip_stem_hint
    let mut validated_rel_paths: Vec<(usize, PathBuf)> = Vec::new();
    for i in 0..archive.len() {
        let zf = archive
            .by_index_raw(i)
            .map_err(|e| format!("Corrupt archive header at index {}: {}", i, e))?;

        if let Some(mode) = zf.unix_mode() {
            if (mode & 0o170000) == 0o120000 {
                let _ = fs::remove_dir_all(staging_dir);
                return Err("Archive rejected: contains unsafe symlink entry.".to_string());
            }
        }

        let raw_name = zf.name();
        if raw_name.contains('\0')
            || raw_name.starts_with('/')
            || raw_name.starts_with('\\')
            || raw_name.contains(':')
        {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!(
                "Archive rejected: unsafe absolute or rooted entry {:?}.",
                raw_name
            ));
        }

        let norm_name = raw_name.replace('\\', "/");
        let rel_candidate = Path::new(&norm_name);
        if rel_candidate.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!(
                "Archive rejected: path traversal detected in entry {:?}.",
                raw_name
            ));
        }

        if zf.is_dir() || norm_name.ends_with('/') {
            continue;
        }

        let Some(enclosed) = zf.enclosed_name() else {
            let _ = fs::remove_dir_all(staging_dir);
            return Err(format!("Archive rejected: invalid enclosed path {:?}.", raw_name));
        };
        if is_macos_or_os_metadata_path(&enclosed) {
            continue;
        }

        validated_rel_paths.push((i, enclosed));
    }

    let strip_single_wrapper: Option<String> = zip_stem_hint
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|stem| {
            if validated_rel_paths.is_empty() {
                return None;
            }
            let mut common_first: Option<String> = None;
            for (_, rel) in &validated_rel_paths {
                let mut comps = rel.components();
                let first = comps.next()?.as_os_str().to_string_lossy().to_string();
                // Must have at least one child component beneath the wrapper
                comps.next()?;
                if !first.eq_ignore_ascii_case(stem) {
                    return None;
                }
                match &common_first {
                    None => common_first = Some(first),
                    Some(prev) if !prev.eq_ignore_ascii_case(&first) => return None,
                    _ => {}
                }
            }
            common_first
        });

    let mut result = BoundedZipExtraction::default();
    let mut copy_buf = vec![0u8; 64 * 1024];

    for (entry_idx, raw_rel) in validated_rel_paths {
        let mut zf = archive
            .by_index(entry_idx)
            .map_err(|e| format!("Failed reading archive entry {}: {}", entry_idx, e))?;

        let unwrapped = if let Some(ref wrapper) = strip_single_wrapper {
            let mut comps = raw_rel.components();
            if let Some(first) = comps.next() {
                if first.as_os_str().to_string_lossy().eq_ignore_ascii_case(wrapper) {
                    comps.as_path().to_path_buf()
                } else {
                    raw_rel
                }
            } else {
                raw_rel
            }
        } else {
            raw_rel
        };

        let rel_clean = crate::game_logic::strip_relative_root_anchors(&unwrapped, game_schema);
        if rel_clean.as_os_str().is_empty()
            || rel_clean
                .components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
        {
            continue;
        }

        let fname_lower = rel_clean
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_lowercase();

        // Intercept namespaced Sanctuary Static Edge sidecars without writing them over mod assets
        if fname_lower == SANCTUARY_EDGE_MANIFEST_FILE || fname_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        {
            let mut sidecar_bytes = Vec::new();
            let mut limited = (&mut zf).take((2 * 1024 * 1024) + 1);
            limited
                .read_to_end(&mut sidecar_bytes)
                .map_err(|e| format!("Failed reading sidecar {}: {}", fname_lower, e))?;
            if sidecar_bytes.len() > 2 * 1024 * 1024 {
                let _ = fs::remove_dir_all(staging_dir);
                return Err("Sanctuary sidecar JSON exceeds 2 MiB limit.".to_string());
            }
            if let Ok(text) = String::from_utf8(sidecar_bytes) {
                if fname_lower == SANCTUARY_EDGE_MANIFEST_FILE {
                    result.sanctuary_manifest_json = Some(text);
                } else {
                    result.sanctuary_override_json = Some(text);
                }
            }
            continue;
        }

        if fname_lower.starts_with('.') || fname_lower == "desktop.ini" || fname_lower == "thumbs.db"
        {
            continue;
        }

        if !preserve_aux && !visible_exts.is_empty() {
            let ext_lower = rel_clean
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_lowercase();
            if !visible_exts.contains(&ext_lower) {
                continue;
            }
        }

        let dest_path = staging_dir.join(&rel_clean);
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed creating staged subdir {:?}: {}", parent, e))?;
        }

        let mut out_file = fs::File::create(&dest_path)
            .map_err(|e| format!("Failed creating staged file {:?}: {}", dest_path, e))?;

        let mut entry_written: u64 = 0;
        let mut bounded_reader = (&mut zf).take(max_entry_bytes.saturating_add(1));
        loop {
            let n = bounded_reader
                .read(&mut copy_buf)
                .map_err(|e| format!("Archive decompression read error: {}", e))?;
            if n == 0 {
                break;
            }
            entry_written = entry_written.saturating_add(n as u64);
            result.total_bytes = result.total_bytes.saturating_add(n as u64);
            if entry_written > max_entry_bytes || result.total_bytes > max_total_bytes {
                drop(out_file);
                let _ = fs::remove_dir_all(staging_dir);
                return Err(
                    "Archive exceeds maximum safe decompressed byte limit (Zip-Bomb protection)."
                        .to_string(),
                );
            }
            use std::io::Write;
            out_file
                .write_all(&copy_buf[..n])
                .map_err(|e| format!("Failed writing staged file {:?}: {}", dest_path, e))?;
        }

        result.files.push(ExtractedZipEntry {
            staged_path: dest_path,
            rel_path: rel_clean,
            size_bytes: entry_written,
        });
    }

    Ok(result)
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

pub(crate) fn normalize_path_key(p: &std::path::Path) -> String {
    p.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn dir_looks_like_shared_game_folder(
    dir: &std::path::Path,
    live_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    let schema_flag = game_schema
        .as_ref()
        .and_then(|s| s.constraints.as_ref())
        .and_then(|c| c.mods_dir_is_shared_with_vanilla)
        .unwrap_or(false);
    if schema_flag {
        return true;
    }

    let norm_dir = normalize_path_key(dir);
    if !live_path.trim().is_empty() {
        let norm_live = normalize_path_key(std::path::Path::new(live_path.trim()));
        let engine_root =
            crate::game_logic::resolve_game_engine_root(live_path.trim(), game_schema);
        let norm_engine = normalize_path_key(&engine_root);
        if (!norm_live.is_empty() && norm_dir == norm_live)
            || (!norm_engine.is_empty() && norm_dir == norm_engine)
        {
            return true;
        }
    }

    // Also treat any directory that directly contains game executables (.exe or .app) as a shared root folder
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("exe") || ext.eq_ignore_ascii_case("app") {
                    return true;
                }
            }
        }
    }

    false
}

fn rescue_untracked_mod_file(
    file_path: &std::path::Path,
    root_mods_dir: &std::path::Path,
    vault_mods_lane: &std::path::Path,
    supported_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
) -> bool {
    if supported_exts.is_empty() {
        return false;
    }
    if !vault_mods_lane.exists() {
        let _ = std::fs::create_dir_all(vault_mods_lane);
    }
    let fname = match file_path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let fname_lower = fname.to_lowercase();
    let manifest_name_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    let rel_or_name = file_path
        .strip_prefix(root_mods_dir)
        .unwrap_or(file_path)
        .to_string_lossy();
    if fname_lower.starts_with('.')
        || fname_lower.starts_with("._")
        || fname_lower == "desktop.ini"
        || fname_lower == "thumbs.db"
        || (!manifest_name_lower.is_empty() && fname_lower == manifest_name_lower)
        || crate::game_logic::is_cache_file(game_schema, &rel_or_name)
    {
        return false;
    }

    let ext_lower = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.trim_start_matches('.').to_lowercase())
        .unwrap_or_default();
    if ext_lower.is_empty() {
        return false;
    }

    let is_mod_ext = supported_exts
        .iter()
        .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
    if !is_mod_ext {
        return false;
    }

    let src_len = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    if src_len == 0 {
        return false;
    }

    // Check if an identical file (by size + SHA-256) already exists in the Vault
    if let Some(existing_vault_path) =
        find_surviving_vault_file(vault_mods_lane, &fname_lower, file_path)
    {
        let existing_len = std::fs::metadata(&existing_vault_path)
            .map(|m| m.len())
            .unwrap_or(0);
        if existing_len == src_len {
            if let (Ok(h1), Ok(h2)) = (
                calculate_hash(file_path),
                calculate_hash(&existing_vault_path),
            ) {
                if h1 == h2 {
                    let _ = std::fs::remove_file(file_path);
                    return true;
                }
            }
        }
    }

    let rel = file_path
        .strip_prefix(root_mods_dir)
        .unwrap_or_else(|_| std::path::Path::new(fname));
    let mut dest = vault_mods_lane.join(rel);

    if dest.exists() {
        let dest_len = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        if dest_len == src_len {
            if let (Ok(h1), Ok(h2)) = (calculate_hash(file_path), calculate_hash(&dest)) {
                if h1 == h2 {
                    let _ = std::fs::remove_file(file_path);
                    return true;
                }
            }
        }
        let stem = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Artifact");
        let parent = dest.parent().unwrap_or(vault_mods_lane);
        let mut attempt = 1usize;
        loop {
            let candidate_name = if attempt == 1 {
                format!("{}_Rescued.{}", stem, ext_lower)
            } else {
                format!("{}_Rescued_{}.{}", stem, attempt, ext_lower)
            };
            let candidate = parent.join(candidate_name);
            if !candidate.exists() {
                dest = candidate;
                break;
            }
            attempt += 1;
        }
    }

    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if std::fs::rename(file_path, &dest).is_ok() {
        return true;
    }
    if std::fs::copy(file_path, &dest).is_ok() {
        let _ = std::fs::remove_file(file_path);
        return true;
    }

    true
}

pub fn is_symlink_or_reparse_point(path: &std::path::Path) -> bool {
    if std::fs::read_link(path).is_ok() {
        return true;
    }
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        let attrs = meta.file_attributes();
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        const CLOUD_PLACEHOLDER_MASK: u32 = 0x0044_0000; // RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS
        if (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0 && (attrs & CLOUD_PLACEHOLDER_MASK) == 0 {
            return true;
        }
    }
    false
}

pub fn remove_symlink_or_junction(path: &std::path::Path) -> bool {
    let is_dir_link = match std::fs::symlink_metadata(path) {
        Ok(meta) => {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                (meta.file_attributes() & 0x0000_0010) != 0 || meta.is_dir()
            }
            #[cfg(not(target_os = "windows"))]
            {
                meta.is_dir() || path.is_dir()
            }
        }
        Err(_) => false,
    };

    if is_dir_link {
        std::fs::remove_dir(path)
            .or_else(|_| std::fs::remove_file(path))
            .is_ok()
    } else {
        std::fs::remove_file(path)
            .or_else(|_| std::fs::remove_dir(path))
            .is_ok()
    }
}

fn safe_wipe_mods_dir_inner(
    dir: &std::path::Path,
    root_mods_dir: &std::path::Path,
    vault_mods_lane: &Option<PathBuf>,
    supported_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
    shared_with_vanilla: bool,
    tracked_set: &std::collections::HashSet<String>,
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let items: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(game_schema);
        items.into_par_iter().for_each(|path| {
            if is_symlink_or_reparse_point(&path) {
                let _ = remove_symlink_or_junction(&path);
                return;
            }

            let file_name_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Preserve the game schema's root manifest file at the top level of mods_dir
            if dir == root_mods_dir
                && !manifest_leaf.is_empty()
                && file_name_lower == manifest_leaf
            {
                return;
            }

            // Always remove internal Sanctuary deployment state files
            if file_name_lower.starts_with(".sanctuary_") {
                let _ = std::fs::remove_file(&path);
                return;
            }

            let norm = normalize_path_key(&path);

            if shared_with_vanilla {
                if path.is_dir() {
                    safe_wipe_mods_dir_inner(
                        &path,
                        root_mods_dir,
                        vault_mods_lane,
                        supported_exts,
                        game_schema,
                        true,
                        tracked_set,
                    );
                    if tracked_set.contains(&norm) {
                        let _ = std::fs::remove_dir(&path);
                    }
                } else if tracked_set.contains(&norm) {
                    let _ = std::fs::remove_file(&path);
                }
                return;
            }

            if path.is_dir() {
                safe_wipe_mods_dir_inner(
                    &path,
                    root_mods_dir,
                    vault_mods_lane,
                    supported_exts,
                    game_schema,
                    false,
                    tracked_set,
                );
                if let Ok(meta) = std::fs::symlink_metadata(&path) {
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
                let _ = std::fs::remove_dir(&path);
            } else {
                if file_name_lower == "desktop.ini"
                    || file_name_lower == "thumbs.db"
                    || file_name_lower == ".ds_store"
                    || (!manifest_leaf.is_empty() && file_name_lower == manifest_leaf)
                    || tracked_set.contains(&norm)
                {
                    let _ = std::fs::remove_file(&path);
                    return;
                }
                let rel_path = path
                    .strip_prefix(root_mods_dir)
                    .unwrap_or_else(|_| std::path::Path::new(&file_name_lower));
                let rel_str = rel_path.to_string_lossy();
                if crate::game_logic::is_cache_file(game_schema, &rel_str) {
                    let _ = std::fs::remove_file(&path);
                    return;
                }
                if let Some(ref lane) = vault_mods_lane {
                    if rescue_untracked_mod_file(
                        &path,
                        root_mods_dir,
                        lane,
                        supported_exts,
                        game_schema,
                    ) {
                        return;
                    }
                    // Also evacuate non-mod sidecar/config files (e.g. subfolder `.cfg` / `.json` / `.log`)
                    // inside a dedicated (!shared_with_vanilla) mods directory into Vault/Mods so
                    // subdirectories like `MCCC/` are cleanly emptied and removed without losing user configs!
                    let dest = lane.join(rel_path);
                    if let Some(parent) = dest.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if std::fs::rename(&path, &dest).is_err() {
                        if std::fs::copy(&path, &dest).is_ok() {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        });
    }
}

pub fn safe_wipe_mods_dir(dir: &std::path::Path, game_schema: &Option<crate::schema::GameSchema>) {
    safe_wipe_mods_dir_with_vault(dir, None, game_schema);
}

pub fn safe_wipe_mods_dir_with_vault(
    dir: &std::path::Path,
    explicit_vault_path: Option<&str>,
    game_schema: &Option<crate::schema::GameSchema>,
) {
    let saved_coords = crate::commands::state_ops::get_saved_coordinates();
    let shared_with_vanilla =
        dir_looks_like_shared_game_folder(dir, &saved_coords.live_path, game_schema);

    let effective_vault_str = explicit_vault_path
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| saved_coords.vault_path.trim());

    let vault_mods_lane = if !effective_vault_str.is_empty() {
        Some(get_vault_mods_lane(effective_vault_str))
    } else {
        None
    };
    let supported_exts = crate::game_logic::get_supported_extensions(game_schema);

    let mut tracked_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut manifest_locations = vec![dir.join(".sanctuary_deployed_links.json")];
    if !effective_vault_str.is_empty() {
        if let Some((raw, _)) = get_vault_kv(effective_vault_str, "deployed_links") {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for item in list {
                    let p = std::path::PathBuf::from(&item);
                    let norm = normalize_path_key(&p);
                    if !norm.is_empty() {
                        tracked_set.insert(norm);
                    }
                }
            }
            delete_vault_kv(effective_vault_str, "deployed_links");
        }
        manifest_locations.push(
            std::path::PathBuf::from(effective_vault_str)
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

    safe_wipe_mods_dir_inner(
        dir,
        dir,
        &vault_mods_lane,
        &supported_exts,
        game_schema,
        shared_with_vanilla,
        &tracked_set,
    );
}

pub fn obscure_username(path: &str) -> String {
    let lower = path.to_lowercase();
    for (marker, slash_char) in [
        ("\\users\\", '\\'),
        ("/users/", '/'),
        ("/var/home/", '/'),
        ("/home/", '/'),
        ("\\documents and settings\\", '\\'),
        ("/documents and settings/", '/'),
    ] {
        if let Some(idx) = lower.find(marker) {
            let after_marker = idx + marker.len();
            if let Some(next_slash) = path[after_marker..].find(slash_char) {
                let mut obscured = String::new();
                obscured.push_str(&path[..after_marker]);
                obscured.push_str("...");
                obscured.push_str(&path[after_marker + next_slash..]);
                return obscured;
            }
        }
    }
    for marker in ["/run/media/", "/media/"] {
        if let Some(idx) = lower.find(marker) {
            let after_marker = idx + marker.len();
            if let Some(next_slash) = path[after_marker..].find('/') {
                let seg = &lower[after_marker..after_marker + next_slash];
                if !seg.starts_with("mmcblk") && !seg.starts_with("nvme") && !seg.starts_with("sd") {
                    let mut obscured = String::new();
                    obscured.push_str(&path[..after_marker]);
                    obscured.push_str("...");
                    obscured.push_str(&path[after_marker + next_slash..]);
                    return obscured;
                }
            }
        }
    }
    scrub_user_data_from_log(path)
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

fn scan_zip_reader<R: std::io::Read + std::io::Seek>(
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
    if !is_safe_single_filename(file_name) {
        return None;
    }
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
    let docs_base = resolve_effective_docs_path(&config, &None);
    if let Some(world_dir) = get_world_backups_dir(&docs_base, vault_path) {
        let p4 = world_dir.join(file_name);
        if p4.exists() {
            return Some(p4);
        }
    }

    None
}

pub fn extract_backup_timestamp(name: &str) -> u64 {
    let clean = name
        .trim_end_matches(".tar.zst")
        .trim_end_matches(".tar")
        .trim_end_matches(".zst");
    if let Some(last) = clean.split("--").last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    if let Some(last) = clean.split('_').last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    0
}

pub fn write_snapshot_meta_file(path: &Path, content: &str) {
    if path.exists() {
        if let Ok(meta) = std::fs::metadata(path) {
            if meta.permissions().readonly() {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(path, perms);
            }
        }
        let _ = std::fs::remove_file(path);
    }
    let _ = std::fs::write(path, content);
}

pub fn clean_stray_snapshot_meta_files(dir: &Path) {
    for meta_name in [".size_bytes.txt", ".diff_size_bytes.txt", ".delta_manifest.json"] {
        let stray = dir.join(meta_name);
        if stray.is_file() {
            if let Ok(meta) = std::fs::metadata(&stray) {
                if meta.permissions().readonly() {
                    let mut perms = meta.permissions();
                    perms.set_readonly(false);
                    let _ = std::fs::set_permissions(&stray, perms);
                }
            }
            let _ = std::fs::remove_file(&stray);
        }
    }
}

pub fn get_all_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if dir.is_file() {
        if let Some(fname) = dir.file_name().and_then(|n| n.to_str()) {
            if !fname.starts_with('.') {
                files.push(dir.to_path_buf());
            }
        }
        return files;
    }
    for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            let p = entry.path();
            if let Ok(rel) = p.strip_prefix(dir) {
                let has_dot_component = rel
                    .components()
                    .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
                if has_dot_component {
                    continue;
                }
            } else if p
                .file_name()
                .map_or(false, |n| n.to_string_lossy().starts_with('.'))
            {
                continue;
            }
            files.push(entry.into_path());
        }
    }
    files
}

pub fn remove_backup_dir_cow_safe(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    use rayon::prelude::*;
    let readonly_paths: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if meta.permissions().readonly() {
                Some(entry.into_path())
            } else {
                None
            }
        })
        .collect();

    readonly_paths.par_iter().for_each(|p| {
        if let Ok(meta) = std::fs::metadata(p) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(p, perms);
            }
        }
    });

    std::fs::remove_dir_all(dir)
}

pub fn enforce_retention_policy(target_dir: &Path, keep_count: u32) {
    if keep_count >= 999 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let mut backups: Vec<PathBuf> = Vec::new();
        let mut stale_purging: Vec<PathBuf> = Vec::new();

        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with(".purging_") && p.is_dir() {
                stale_purging.push(p);
                continue;
            }
            let is_archive = p.is_file()
                && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                    || p.extension() == Some(std::ffi::OsStr::new("tar")));
            let is_snapshot_dir =
                p.is_dir() && (name.starts_with("World_State") || name.starts_with("Engine_Core"));
            if is_archive || is_snapshot_dir {
                backups.push(p);
            }
        }

        backups.sort_by(|a, b| {
            let name_a = a.file_name().unwrap_or_default().to_string_lossy();
            let name_b = b.file_name().unwrap_or_default().to_string_lossy();
            let ts_a = extract_backup_timestamp(&name_a);
            let ts_b = extract_backup_timestamp(&name_b);
            ts_b.cmp(&ts_a).then_with(|| {
                let m_a = a
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                let m_b = b
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                m_b.cmp(&m_a)
            })
        });

        let mut dirs_to_purge_async: Vec<PathBuf> = stale_purging;

        if backups.len() > keep_count as usize {
            let now_ms = current_epoch_ms();
            for (idx, old_backup) in backups.iter().skip(keep_count as usize).enumerate() {
                if old_backup.is_dir() {
                    let old_name = old_backup
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                    let purging_path =
                        old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                    if std::fs::rename(old_backup, &purging_path).is_ok() {
                        dirs_to_purge_async.push(purging_path);
                    } else {
                        dirs_to_purge_async.push(old_backup.clone());
                    }
                } else {
                    let _ = std::fs::remove_file(old_backup);
                }
            }
        }

        if !dirs_to_purge_async.is_empty() {
            std::thread::spawn(move || {
                for dir in dirs_to_purge_async {
                    let _ = remove_backup_dir_cow_safe(&dir);
                }
            });
        }
    }
}

fn estimate_backup_snapshot_physical_bytes(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".diff_size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    if let Ok(raw) = std::fs::read_to_string(path.join(".size_bytes.txt")) {
        if let Ok(n) = raw.trim().parse::<u64>() {
            return n;
        }
    }
    0
}

pub fn enforce_backup_capacity_limit(backup_dirs: &[PathBuf], capacity_gb: u32) {
    if capacity_gb == 0 {
        return;
    }
    let max_bytes = (capacity_gb as u64).saturating_mul(1024 * 1024 * 1024);
    let mut unique_dirs: Vec<PathBuf> = Vec::new();
    for d in backup_dirs {
        if d.exists() && !unique_dirs.contains(d) {
            unique_dirs.push(d.clone());
        }
    }
    if unique_dirs.is_empty() {
        return;
    }

    let mut snapshots: Vec<(PathBuf, u64, bool)> = Vec::new();
    let mut dirs_to_purge_async: Vec<PathBuf> = Vec::new();

    for dir in &unique_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with(".purging_") && p.is_dir() {
                    dirs_to_purge_async.push(p);
                    continue;
                }
                let is_archive = p.is_file()
                    && (p.extension() == Some(std::ffi::OsStr::new("zst"))
                        || p.extension() == Some(std::ffi::OsStr::new("tar")));
                let is_world = name.starts_with("World_State");
                let is_engine = name.starts_with("Engine_Core");
                let is_snapshot_dir = p.is_dir() && (is_world || is_engine);
                if is_archive || is_snapshot_dir {
                    let bytes = estimate_backup_snapshot_physical_bytes(&p);
                    snapshots.push((p, bytes, is_engine));
                }
            }
        }
    }

    snapshots.sort_by(|(a, _, _), (b, _, _)| {
        let name_a = a.file_name().unwrap_or_default().to_string_lossy();
        let name_b = b.file_name().unwrap_or_default().to_string_lossy();
        let ts_a = extract_backup_timestamp(&name_a);
        let ts_b = extract_backup_timestamp(&name_b);
        ts_b.cmp(&ts_a).then_with(|| {
            let m_a = a
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            let m_b = b
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            m_b.cmp(&m_a)
        })
    });

    // Always protect the single newest snapshot in each lane (World_State and Engine_Core)
    let mut newest_world_idx: Option<usize> = None;
    let mut newest_engine_idx: Option<usize> = None;
    let mut total_bytes: u64 = 0;

    for (idx, (_, bytes, is_engine)) in snapshots.iter().enumerate() {
        total_bytes = total_bytes.saturating_add(*bytes);
        if *is_engine {
            if newest_engine_idx.is_none() {
                newest_engine_idx = Some(idx);
            }
        } else if newest_world_idx.is_none() {
            newest_world_idx = Some(idx);
        }
    }

    if total_bytes > max_bytes && snapshots.len() > 1 {
        let now_ms = current_epoch_ms();
        for (idx, (old_backup, bytes, _)) in snapshots.iter().enumerate().rev() {
            if total_bytes <= max_bytes {
                break;
            }
            if Some(idx) == newest_world_idx || Some(idx) == newest_engine_idx {
                continue;
            }
            if old_backup.is_dir() {
                let old_name = old_backup
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                let purging_path =
                    old_backup.with_file_name(format!(".purging_{}_{}_{}", now_ms, idx, old_name));
                if std::fs::rename(old_backup, &purging_path).is_ok() {
                    dirs_to_purge_async.push(purging_path);
                } else {
                    dirs_to_purge_async.push(old_backup.clone());
                }
            } else {
                let _ = std::fs::remove_file(old_backup);
            }
            total_bytes = total_bytes.saturating_sub(*bytes);
        }
    }

    if !dirs_to_purge_async.is_empty() {
        std::thread::spawn(move || {
            for dir in dirs_to_purge_async {
                let _ = remove_backup_dir_cow_safe(&dir);
            }
        });
    }
}

pub fn enforce_workspace_backup_capacity(config: &crate::state::WorkspaceConfig) {
    let cap_gb = config.vault_capacity_gb.unwrap_or(0);
    if cap_gb == 0 || config.vault_path.trim().is_empty() {
        return;
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    let docs_base = config
        .docs_path
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&config.mods_path);
    if let Some(wd) = get_world_backups_dir(docs_base, &config.vault_path) {
        dirs.push(wd);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("World"));

    if let Some(ed) = get_engine_backups_dir(&config.live_path, &config.vault_path) {
        dirs.push(ed);
    }
    dirs.push(PathBuf::from(&config.vault_path).join("Backups").join("Engine"));

    enforce_backup_capacity_limit(&dirs, cap_gb);
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

pub fn resolve_effective_docs_path(
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> String {
    if let Some(ref explicit_docs) = config.docs_path {
        if !explicit_docs.trim().is_empty() {
            return explicit_docs.trim().to_string();
        }
    }
    let resolved = crate::game_logic::resolve_user_data_root(&config.mods_path, schema);
    if !resolved.as_os_str().is_empty() {
        return resolved.to_string_lossy().to_string();
    }
    get_docs_base_from_mods_path(&config.mods_path)
}

pub fn resolve_effective_docs_path_with_override(
    explicit_docs: &str,
    config: &WorkspaceConfig,
    schema: &Option<crate::schema::GameSchema>,
) -> PathBuf {
    let trimmed = explicit_docs.trim();
    if !trimmed.is_empty() {
        let candidate = PathBuf::from(trimmed);
        if is_mods_dir(&candidate) {
            let resolved = crate::game_logic::resolve_user_data_root(trimmed, schema);
            if !resolved.as_os_str().is_empty() {
                return resolved;
            }
        }
        return candidate;
    }
    let fallback = resolve_effective_docs_path(config, schema);
    if fallback.trim().is_empty() {
        PathBuf::new()
    } else {
        PathBuf::from(fallback.trim())
    }
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

pub const SANCTUARY_REDACTED_TOKEN: &str = "[REDACTED BY SANCTUARY]";
pub const SANCTUARY_REDACTED_HEX_SESSION: &str = "000000000000000000000000";

struct LogScrubberRegexes {
    guid_re: regex::Regex,
    hex_xml_re: regex::Regex,
    pii_xml_re: regex::Regex,
    user_path_re: regex::Regex,
    media_mount_re: regex::Regex,
    sid_re: regex::Regex,
    mac_re: regex::Regex,
    email_re: regex::Regex,
    ipv4_re: regex::Regex,
}

static LOG_SCRUBBER_REGEXES: std::sync::OnceLock<LogScrubberRegexes> =
    std::sync::OnceLock::new();

fn get_log_scrubber_regexes() -> &'static LogScrubberRegexes {
    LOG_SCRUBBER_REGEXES.get_or_init(|| LogScrubberRegexes {
        guid_re: regex::Regex::new(
            r"(?i)\b(guid[ \t]*[:=][ \t]*)(\{?[0-9a-f-]{8,}\}?)",
        )
        .unwrap(),
        hex_xml_re: regex::Regex::new(
            r"(?i)<(sessionid|desyncid)>[^<\r\n]+</(sessionid|desyncid)>",
        )
        .unwrap(),
        pii_xml_re: regex::Regex::new(
            r"(?i)<(guid|userid|machineid|computername|accountid|username|hostname|ip|ipaddress|macaddress)>[^<\r\n]+</(guid|userid|machineid|computername|accountid|username|hostname|ip|ipaddress|macaddress)>",
        )
        .unwrap(),
        user_path_re: regex::Regex::new(
            r#"(?i)(\\\\users\\\\|\\users\\|/users/|/var/home/|/home/|drive_c/users/|\\documents and settings\\|/documents and settings/|onedrive - )([^\\/"'<>\r\n&|]+)"#,
        )
        .unwrap(),
        media_mount_re: regex::Regex::new(
            r#"(?i)(/run/media/|/media/)([^\\/"'<>\r\n&|]+)"#,
        )
        .unwrap(),
        sid_re: regex::Regex::new(r"\bS-1-5-21-[0-9-]{4,}\b").unwrap(),
        mac_re: regex::Regex::new(
            r"\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b|\b(?:[0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}\b",
        )
        .unwrap(),
        email_re: regex::Regex::new(
            r"([A-Za-z0-9][A-Za-z0-9._%+-]*)@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.([A-Za-z]{2,24}))\b",
        )
        .unwrap(),
        ipv4_re: regex::Regex::new(
            r"\b([1-9][0-9]{0,2})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?::([0-9]{1,5}))?\b",
        )
        .unwrap(),
    })
}

pub fn scrub_user_data_from_log(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }

    let rx = get_log_scrubber_regexes();

    // 1. Redact GUID: <UUID/Hex>
    let s1 = rx.guid_re.replace_all(input, |caps: &regex::Captures| {
        format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
    });

    // 2a. Redact sessionid / desyncid with 24 hex zeroes
    let s2 = rx.hex_xml_re.replace_all(&s1, |caps: &regex::Captures| {
        if caps[1].eq_ignore_ascii_case(&caps[2]) {
            format!(
                "<{}>{}</{}>",
                &caps[1], SANCTUARY_REDACTED_HEX_SESSION, &caps[2]
            )
        } else {
            caps[0].to_string()
        }
    });

    // 2b. Redact machine/user/network XML tags
    let s3 = rx.pii_xml_re.replace_all(&s2, |caps: &regex::Captures| {
        if caps[1].eq_ignore_ascii_case(&caps[2]) {
            format!("<{}>{}</{}>", &caps[1], SANCTUARY_REDACTED_TOKEN, &caps[2])
        } else {
            caps[0].to_string()
        }
    });

    // 3. Redact OS user home path segments
    let s4 = rx.user_path_re.replace_all(&s3, |caps: &regex::Captures| {
        let seg = &caps[2];
        if seg.eq_ignore_ascii_case(SANCTUARY_REDACTED_TOKEN) {
            caps[0].to_string()
        } else {
            format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
        }
    });

    let s5 = rx
        .media_mount_re
        .replace_all(&s4, |caps: &regex::Captures| {
            let seg = &caps[2];
            let seg_lower = seg.to_ascii_lowercase();
            if seg.eq_ignore_ascii_case(SANCTUARY_REDACTED_TOKEN)
                || seg_lower.starts_with("mmcblk")
                || seg_lower.starts_with("nvme")
                || seg_lower.starts_with("sd")
            {
                caps[0].to_string()
            } else {
                format!("{}{}", &caps[1], SANCTUARY_REDACTED_TOKEN)
            }
        });

    let mut text = s5.into_owned();

    // 4. Redact literal OS USERNAME / USER / LOGNAME & COMPUTERNAME / HOSTNAME
    for env_key in ["USERNAME", "USER", "LOGNAME"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 2 {
                for (pat, repl) in [
                    (
                        format!("\\\\{}\\\\", trimmed),
                        format!("\\\\{}\\\\", SANCTUARY_REDACTED_TOKEN),
                    ),
                    (
                        format!("\\{}\\", trimmed),
                        format!("\\{}\\", SANCTUARY_REDACTED_TOKEN),
                    ),
                    (
                        format!("/{}/", trimmed),
                        format!("/{}/", SANCTUARY_REDACTED_TOKEN),
                    ),
                ] {
                    if text.contains(&pat) {
                        text = text.replace(&pat, &repl);
                    }
                }
            }
        }
    }

    for host_key in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(val) = std::env::var(host_key) {
            let trimmed = val.trim();
            if trimmed.len() >= 3 && text.contains(trimmed) {
                text = text.replace(trimmed, SANCTUARY_REDACTED_TOKEN);
            }
        }
    }

    // 5. Redact Windows SIDs and MAC addresses
    let s6 = rx.sid_re.replace_all(&text, SANCTUARY_REDACTED_TOKEN);
    let s7 = rx.mac_re.replace_all(&s6, SANCTUARY_REDACTED_TOKEN);

    // 6. Redact email addresses (filtering out @filename.ext code/asset tokens)
    let s8 = if s7.contains('@') {
        let s7_ref = s7.as_ref();
        rx.email_re
            .replace_all(s7_ref, |caps: &regex::Captures| {
                let m = caps.get(0).unwrap();
                if m.start() > 0 {
                    let prev_b = s7_ref.as_bytes()[m.start() - 1];
                    if matches!(prev_b, b'/' | b'\\' | b'@') {
                        return caps[0].to_string();
                    }
                }
                let tld_lower = caps[3].to_ascii_lowercase();
                let is_code_or_asset_ext = matches!(
                    tld_lower.as_str(),
                    "py" | "pyc"
                        | "dll"
                        | "exe"
                        | "so"
                        | "dylib"
                        | "json"
                        | "xml"
                        | "cfg"
                        | "ini"
                        | "toml"
                        | "yaml"
                        | "yml"
                        | "txt"
                        | "log"
                        | "png"
                        | "jpg"
                        | "jpeg"
                        | "webp"
                        | "dds"
                        | "js"
                        | "ts"
                        | "tsx"
                        | "css"
                        | "html"
                        | "wasm"
                );
                if is_code_or_asset_ext {
                    caps[0].to_string()
                } else {
                    SANCTUARY_REDACTED_TOKEN.to_string()
                }
            })
            .into_owned()
    } else {
        s7.into_owned()
    };

    // 7. Redact bare IPv4 addresses while preserving 4-part version strings
    let s9 = rx.ipv4_re.replace_all(&s8, |caps: &regex::Captures| {
        let m = caps.get(0).unwrap();
        let bytes = s8.as_bytes();
        if m.start() > 0 && matches!(bytes[m.start() - 1], b'.' | b'-' | b'_') {
            return caps[0].to_string();
        }
        if m.end() < bytes.len() && bytes[m.end()] == b'.' {
            return caps[0].to_string();
        }
        for idx in 1..=4 {
            let oct_s = &caps[idx];
            if oct_s.len() > 1 && oct_s.starts_with('0') {
                return caps[0].to_string();
            }
            if oct_s.parse::<u16>().unwrap_or(999) > 255 {
                return caps[0].to_string();
            }
        }
        if let Some(port_m) = caps.get(5) {
            let p_val = port_m.as_str().parse::<u32>().unwrap_or(0);
            if !(1..=65535).contains(&p_val) {
                return caps[0].to_string();
            }
        }
        let line_prefix_start = s8[..m.start()]
            .rfind('\n')
            .map(|p| p + 1)
            .unwrap_or(0)
            .max(m.start().saturating_sub(40));
        let prefix_lower = s8[line_prefix_start..m.start()].to_ascii_lowercase();
        let trimmed_prefix = prefix_lower.trim_end_matches(|c: char| {
            c.is_ascii_whitespace() || matches!(c, ':' | '=' | '"' | '\'')
        });
        let is_version_context = prefix_lower.contains("<version>")
            || trimmed_prefix.ends_with("version")
            || trimmed_prefix.ends_with("ver")
            || trimmed_prefix.ends_with("build")
            || trimmed_prefix.ends_with("patch")
            || trimmed_prefix.ends_with("release")
            || trimmed_prefix.ends_with("client")
            || trimmed_prefix.ends_with("game")
            || trimmed_prefix.ends_with("mod")
            || trimmed_prefix.ends_with('v');
        if is_version_context {
            caps[0].to_string()
        } else {
            SANCTUARY_REDACTED_TOKEN.to_string()
        }
    });

    s9.into_owned()
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
        || name_lower == "quarantine"
        || name_lower == "__macosx"
        || name_lower.starts_with('.')
}

fn is_plain_text_config_extension(ext_lower: &str) -> bool {
    matches!(
        ext_lower.trim_start_matches('.'),
        "cfg" | "ini" | "json" | "toml" | "yaml" | "yml" | "xml" | "txt" | "log" | "md"
    )
}

fn dir_contains_non_config_mod_assets(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
                if fname_lower.starts_with('.')
                    || fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                {
                    continue;
                }
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if !is_plain_text_config_extension(&ext_lower) {
                        return true;
                    }
                }
            }
        }
    }
    false
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

    // 2. If not yet present in any subfolder, check if a subfolder owns non-config mod files with a matching `<prefix>_`
    if let Some(underscore_idx) = fname_lower.find('_') {
        let prefix = &fname_lower[..=underscore_idx];
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
                    if let Ok(sub_entries) = std::fs::read_dir(&sub_path) {
                        for sub_entry in sub_entries.flatten() {
                            let p = sub_entry.path();
                            if p.is_file() {
                                let child_lower =
                                    sub_entry.file_name().to_string_lossy().to_lowercase();
                                let child_ext = p
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_lowercase())
                                    .unwrap_or_default();
                                if child_lower.starts_with(prefix)
                                    && !child_ext.is_empty()
                                    && !is_plain_text_config_extension(&child_ext)
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
                            if dir_contains_non_config_mod_assets(&p) {
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
                                            if dir_contains_non_config_mod_assets(&sp)
                                                || dir_contains_non_config_mod_assets(&p)
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

pub fn deduplicate_vault_root_configs(
    vault_mods_lane: &Path,
    config_exts: &[String],
    game_schema: &Option<crate::schema::GameSchema>,
) {
    if !vault_mods_lane.exists() {
        return;
    }

    let manifest_leaf_lower = crate::game_logic::resolve_manifest_leaf_lower(game_schema);

    let is_config_ext = |ext_lower: &str| -> bool {
        is_plain_text_config_extension(ext_lower)
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
                if fname_lower == "desktop.ini"
                    || fname_lower == "thumbs.db"
                    || fname_lower.starts_with('.')
                    || (!manifest_leaf_lower.is_empty() && fname_lower == manifest_leaf_lower)
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
                        if dir_contains_non_config_mod_assets(subdir) {
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
                                        if dir_contains_non_config_mod_assets(&sp)
                                            || dir_contains_non_config_mod_assets(subdir)
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

    if !removed_root_paths.is_empty() && !config.vault_path.trim().is_empty() {
        if let Ok(db) = open_db_conn(&config.vault_path) {
            if let Ok(conn) = db.lock() {
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
    }
}

pub fn cleanup_live_counterparts_on_delete(deleted_path: &Path, deleted_file_names: &[String]) {
    let is_protected = |name_lower: &str| -> bool {
        matches!(
            name_lower,
            "desktop.ini"
                | "thumbs.db"
                | ".ds_store"
                | ".sanctuary_deployed_links.json"
                | ".sanctuary_cache.db"
                | ".sanctuary_cache.json"
                | SANCTUARY_EDGE_MANIFEST_FILE
                | SANCTUARY_EDGE_OVERRIDE_FILE
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

    let mut surviving_vault_copies: std::collections::HashMap<String, PathBuf> =
        std::collections::HashMap::new();
    if let Some(ref lane) = vault_mods_lane {
        for name_lower in &target_names_lower {
            if let Some(survivor) = find_surviving_vault_file(lane, name_lower, deleted_path) {
                surviving_vault_copies.insert(name_lower.clone(), survivor);
            }
        }
    }

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
                        if live_rel
                            .parent()
                            .map(|p| p == Path::new(&config.mods_path))
                            .unwrap_or(false)
                        {
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
                            if link_target == deleted_path || link_target.starts_with(deleted_path)
                            {
                                matches_target = true;
                                points_to_deleted = true;
                            }
                        }
                        if matches_target {
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
                        if !dname.starts_with('.') {
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ArchivedModVersion {
    pub rel_path: String,
    pub dna_hash: String,
    #[serde(default)]
    pub backup_rel_path: String,
    #[serde(default)]
    pub mod_version: String,
    #[serde(default)]
    pub compatible_versions: Vec<String>,
    #[serde(default)]
    pub recorded_at: u64,
}

pub fn get_vault_backups_mods_dir(vault_path: &str) -> PathBuf {
    let p = Path::new(vault_path);
    let vault_root = if is_mods_dir(p) {
        p.parent().unwrap_or(p).to_path_buf()
    } else {
        p.to_path_buf()
    };
    vault_root.join("Backups").join("Mods")
}

pub fn load_mod_versions_index(
    vault_path: &str,
) -> std::collections::HashMap<String, Vec<ArchivedModVersion>> {
    let index_path = get_vault_backups_mods_dir(vault_path).join(".mod_versions.json");
    if let Ok(raw) = std::fs::read_to_string(&index_path) {
        if let Ok(parsed) =
            serde_json::from_str::<std::collections::HashMap<String, Vec<ArchivedModVersion>>>(&raw)
        {
            return parsed;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_mod_versions_index(
    vault_path: &str,
    index: &std::collections::HashMap<String, Vec<ArchivedModVersion>>,
) {
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let _ = std::fs::create_dir_all(&backups_mods);
    let index_path = backups_mods.join(".mod_versions.json");
    if let Ok(json_str) = serde_json::to_string_pretty(index) {
        let _ = atomic_write_bytes(&index_path, json_str.as_bytes());
    }
}

pub fn is_game_version_compatible(compatible_versions: &[String], target_game_version: &str) -> bool {
    let clean_target = target_game_version
        .trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim()
        .to_lowercase();
    if clean_target.is_empty() || clean_target == "unknown" || clean_target == "all" {
        return true;
    }
    if compatible_versions.is_empty() {
        return false;
    }
    for v in compatible_versions {
        let clean_v = v
            .trim()
            .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
            .trim()
            .to_lowercase();
        if clean_v.is_empty() || clean_v == "any" || clean_v == "all" || clean_v == "vlocal" || clean_v == "local" {
            return true;
        }
        if clean_v == clean_target
            || clean_target.starts_with(&format!("{}.", clean_v))
            || clean_v.starts_with(&format!("{}.", clean_target))
        {
            return true;
        }
    }
    false
}

pub fn is_mod_version_archiving_enabled(vault_path: &str) -> bool {
    if vault_path.trim().is_empty() {
        return true;
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "archive_mod_versions") {
        return !val.trim().eq_ignore_ascii_case("false") && val.trim() != "0";
    }
    true
}

pub fn load_pinned_mod_versions(vault_path: &str) -> std::collections::HashMap<String, String> {
    if vault_path.trim().is_empty() {
        return std::collections::HashMap::new();
    }
    if let Some((val, _)) = get_vault_kv(vault_path, "pinned_mod_versions") {
        if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&val) {
            return map;
        }
    }
    std::collections::HashMap::new()
}

pub fn save_pinned_mod_versions(
    vault_path: &str,
    pins: &std::collections::HashMap<String, String>,
) {
    if vault_path.trim().is_empty() {
        return;
    }
    if let Ok(raw) = serde_json::to_string(pins) {
        set_vault_kv(vault_path, "pinned_mod_versions", &raw);
    }
}

pub fn archive_mod_binary_version(
    vault_path: &str,
    active_file_path: &Path,
    known_hash: Option<&str>,
    mod_version: Option<&str>,
    compatible_versions: Option<Vec<String>>,
) -> Option<ArchivedModVersion> {
    let keep_history = is_mod_version_archiving_enabled(vault_path);
    if !active_file_path.exists() || !active_file_path.is_file() {
        return None;
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let rel = active_file_path
        .strip_prefix(&mods_lane)
        .unwrap_or(active_file_path);
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    if rel_str.is_empty() || rel_str.starts_with('.') {
        return None;
    }

    let hash = match known_hash.filter(|h| !h.trim().is_empty()) {
        Some(h) => h.trim().to_lowercase(),
        None => calculate_hash(active_file_path).ok()?.to_lowercase(),
    };
    if hash.is_empty() {
        return None;
    }

    let short_hash: String = hash.chars().take(12).collect();
    let orig_file_name = active_file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let backup_rel_path = if let Some(parent) = rel.parent() {
        let p_str = parent.to_string_lossy().replace('\\', "/");
        if p_str.is_empty() {
            format!("{}/{}", short_hash, orig_file_name)
        } else {
            format!("{}/{}/{}", p_str, short_hash, orig_file_name)
        }
    } else {
        format!("{}/{}", short_hash, orig_file_name)
    };

    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let backup_full_path = backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(b_parent) = backup_full_path.parent() {
        let _ = std::fs::create_dir_all(b_parent);
    }

    if !backup_full_path.exists() {
        let linked = std::fs::hard_link(active_file_path, &backup_full_path)
            .or_else(|_| std::fs::copy(active_file_path, &backup_full_path).map(|_| ()));
        if linked.is_err() {
            return None;
        }
    }

    let mut index = load_mod_versions_index(vault_path);
    let key = rel_str.to_lowercase();
    let entries = index.entry(key).or_default();
    let now_secs = current_epoch_ms() / 1000;

    let entry = if let Some(existing) = entries.iter_mut().find(|e| e.dna_hash.eq_ignore_ascii_case(&hash)) {
        if existing.backup_rel_path != backup_rel_path && existing.backup_rel_path.contains("__") {
            let old_b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if old_b_full.exists() {
                let _ = std::fs::remove_file(&old_b_full);
            }
        }
        existing.rel_path = rel_str.clone();
        existing.backup_rel_path = backup_rel_path.clone();
        if let Some(mv) = mod_version.filter(|s| !s.trim().is_empty()) {
            existing.mod_version = mv.trim().to_string();
        }
        if let Some(cv) = compatible_versions {
            for v in cv {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                }
            }
        }
        existing.clone()
    } else {
        let created = ArchivedModVersion {
            rel_path: rel_str,
            dna_hash: hash.clone(),
            backup_rel_path,
            mod_version: mod_version.unwrap_or_default().trim().to_string(),
            compatible_versions: compatible_versions
                .unwrap_or_default()
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            recorded_at: now_secs,
        };
        entries.push(created.clone());
        created
    };

    if !keep_history {
        // When Version History is disabled ("Keep One" mode), prune any previous versions of this file on update
        entries.retain(|e| {
            let is_current = e.dna_hash.eq_ignore_ascii_case(&hash);
            if !is_current && !e.backup_rel_path.is_empty() {
                let old_full = backups_mods
                    .join(e.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                if old_full.exists() {
                    let _ = std::fs::remove_file(&old_full);
                    if let Some(p) = old_full.parent() {
                        let _ = std::fs::remove_dir(p);
                    }
                }
            }
            is_current
        });
    }

    save_mod_versions_index(vault_path, &index);
    Some(entry)
}

pub fn sync_vault_mod_versions_for_game(
    vault_path: &str,
    target_game_version: &str,
    metadata_updates: &[ArchivedModVersion],
) -> Vec<ArchivedModVersion> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let mods_lane = get_vault_mods_lane(vault_path);
    let backups_mods = get_vault_backups_mods_dir(vault_path);
    let archiving_enabled = is_mod_version_archiving_enabled(vault_path);
    let mut index = load_mod_versions_index(vault_path);
    let mut index_dirty = false;

    for meta in metadata_updates {
        let rel_norm = meta.rel_path.replace('\\', "/");
        if rel_norm.is_empty() || meta.dna_hash.trim().is_empty() {
            continue;
        }
        let key = rel_norm.to_lowercase();
        let hash_lower = meta.dna_hash.trim().to_lowercase();
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));

        let entries = index.entry(key).or_default();
        if let Some(existing) = entries
            .iter_mut()
            .find(|e| e.dna_hash.eq_ignore_ascii_case(&hash_lower))
        {
            if !meta.mod_version.trim().is_empty() && existing.mod_version != meta.mod_version.trim() {
                existing.mod_version = meta.mod_version.trim().to_string();
                index_dirty = true;
            }
            for v in &meta.compatible_versions {
                let trimmed = v.trim().to_string();
                if !trimmed.is_empty() && !existing.compatible_versions.contains(&trimmed) {
                    existing.compatible_versions.push(trimmed);
                    index_dirty = true;
                }
            }
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = Path::new(&rel_norm)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let canonical_backup_rel = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            if existing.backup_rel_path.is_empty() {
                existing.backup_rel_path = canonical_backup_rel.clone();
                index_dirty = true;
            } else if existing.backup_rel_path != canonical_backup_rel
                && existing.backup_rel_path.contains("__")
            {
                let old_b_full = backups_mods.join(
                    existing
                        .backup_rel_path
                        .replace('/', std::path::MAIN_SEPARATOR_STR),
                );
                let new_b_full = backups_mods
                    .join(canonical_backup_rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                if let Some(np) = new_b_full.parent() {
                    let _ = std::fs::create_dir_all(np);
                }
                if old_b_full.exists() {
                    if !new_b_full.exists() {
                        let _ = std::fs::rename(&old_b_full, &new_b_full);
                    } else {
                        let _ = std::fs::remove_file(&old_b_full);
                    }
                }
                existing.backup_rel_path = canonical_backup_rel;
                index_dirty = true;
            }
            let b_full = backups_mods
                .join(existing.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() && active_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
        } else if archiving_enabled && active_full.exists() {
            let short_hash: String = hash_lower.chars().take(12).collect();
            let orig_file_name = active_full
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let backup_rel_path = if let Some(parent) = Path::new(&rel_norm).parent() {
                let p_str = parent.to_string_lossy().replace('\\', "/");
                if p_str.is_empty() {
                    format!("{}/{}", short_hash, orig_file_name)
                } else {
                    format!("{}/{}/{}", p_str, short_hash, orig_file_name)
                }
            } else {
                format!("{}/{}", short_hash, orig_file_name)
            };
            let b_full =
                backups_mods.join(backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                if let Some(bp) = b_full.parent() {
                    let _ = std::fs::create_dir_all(bp);
                }
                let _ = std::fs::hard_link(&active_full, &b_full)
                    .or_else(|_| std::fs::copy(&active_full, &b_full).map(|_| ()));
            }
            if b_full.exists() {
                entries.push(ArchivedModVersion {
                    rel_path: rel_norm,
                    dna_hash: hash_lower,
                    backup_rel_path,
                    mod_version: meta.mod_version.trim().to_string(),
                    compatible_versions: meta
                        .compatible_versions
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    recorded_at: current_epoch_ms() / 1000,
                });
                index_dirty = true;
            }
        }
    }

    let mut cache = load_cache(vault_path);
    let mut cache_dirty = false;

    // Consolidate duplicate binary filenames across subfolders in <Vault>/Mods so two versions of the same file never coexist in <Vault>/Mods
    let mut keys_by_filename: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for k in index.keys() {
        let f_name = Path::new(k)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let ext = Path::new(&f_name)
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if !f_name.is_empty() && !ext.is_empty() && !is_plain_text_config_extension(&ext) {
            keys_by_filename.entry(f_name).or_default().push(k.clone());
        }
    }

    for (_f_name, mut key_list) in keys_by_filename {
        if key_list.len() <= 1 {
            continue;
        }
        // Prefer the path that currently exists on disk, has metadata (compatible_versions), or is the shorter/cleaner path
        key_list.sort_by(|a, b| {
            let a_full = mods_lane.join(a.replace('/', std::path::MAIN_SEPARATOR_STR));
            let b_full = mods_lane.join(b.replace('/', std::path::MAIN_SEPARATOR_STR));
            let a_exists = a_full.exists();
            let b_exists = b_full.exists();
            let a_has_meta = index
                .get(a)
                .map(|v| v.iter().any(|e| !e.compatible_versions.is_empty()))
                .unwrap_or(false);
            let b_has_meta = index
                .get(b)
                .map(|v| v.iter().any(|e| !e.compatible_versions.is_empty()))
                .unwrap_or(false);
            b_exists
                .cmp(&a_exists)
                .then_with(|| b_has_meta.cmp(&a_has_meta))
                .then_with(|| a.len().cmp(&b.len()))
        });

        let primary_key = key_list[0].clone();
        let primary_rel = index
            .get(&primary_key)
            .and_then(|v| v.first())
            .map(|e| e.rel_path.clone())
            .unwrap_or_else(|| primary_key.clone());

        for dup_key in key_list.into_iter().skip(1) {
            if let Some(dup_entries) = index.remove(&dup_key) {
                if let Some(first_dup) = dup_entries.first() {
                    let dup_full = mods_lane
                        .join(first_dup.rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if dup_full.exists() {
                        let _ = std::fs::remove_file(&dup_full);
                        let dup_full_str = dup_full.to_string_lossy().to_string();
                        if cache.remove(&dup_full_str).is_some() {
                            cache_dirty = true;
                        }
                        let mut cur_dir = dup_full.parent().map(|p| p.to_path_buf());
                        while let Some(d) = cur_dir {
                            if d == mods_lane || !d.starts_with(&mods_lane) {
                                break;
                            }
                            if std::fs::remove_dir(&d).is_err() {
                                break;
                            }
                            cur_dir = d.parent().map(|p| p.to_path_buf());
                        }
                    }
                }
                let primary_vec = index.entry(primary_key.clone()).or_default();
                for mut de in dup_entries {
                    de.rel_path = primary_rel.clone();
                    if let Some(existing) = primary_vec
                        .iter_mut()
                        .find(|pe| pe.dna_hash.eq_ignore_ascii_case(&de.dna_hash))
                    {
                        if existing.mod_version.is_empty() && !de.mod_version.is_empty() {
                            existing.mod_version = de.mod_version;
                        }
                        for cv in de.compatible_versions {
                            if !existing
                                .compatible_versions
                                .iter()
                                .any(|c| c.eq_ignore_ascii_case(&cv))
                            {
                                existing.compatible_versions.push(cv);
                            }
                        }
                        if de.recorded_at > existing.recorded_at {
                            existing.recorded_at = de.recorded_at;
                        }
                    } else {
                        primary_vec.push(de);
                    }
                }
                index_dirty = true;
            }
        }
    }

    let clean_target = target_game_version
        .trim()
        .trim_start_matches(|c: char| c == 'v' || c == 'V' || c == '.')
        .trim();
    if clean_target.is_empty() || clean_target.eq_ignore_ascii_case("unknown") {
        if index_dirty {
            save_mod_versions_index(vault_path, &index);
        }
        if cache_dirty {
            save_cache(vault_path, &cache);
        }
        return Vec::new();
    }

    let mut swapped = Vec::new();
    let pinned_map = load_pinned_mod_versions(vault_path);

    for entries in index.values() {
        if entries.is_empty() {
            continue;
        }
        let rel_norm = &entries[0].rel_path;
        let f_name_lower = Path::new(rel_norm)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if !f_name_lower.is_empty() && pinned_map.contains_key(&f_name_lower) {
            // Respect manual power-user version pin until reset to Auto-Swap
            continue;
        }
        let active_full = mods_lane.join(rel_norm.replace('/', std::path::MAIN_SEPARATOR_STR));
        let active_full_str = active_full.to_string_lossy().to_string();

        let current_hash = if let Some(c) = cache.get(&active_full_str) {
            if !c.dna_hash.is_empty() && active_full.exists() {
                c.dna_hash.to_lowercase()
            } else if active_full.exists() {
                calculate_hash(&active_full).unwrap_or_default().to_lowercase()
            } else {
                String::new()
            }
        } else if active_full.exists() {
            calculate_hash(&active_full).unwrap_or_default().to_lowercase()
        } else {
            String::new()
        };

        let current_entry = entries
            .iter()
            .find(|e| !current_hash.is_empty() && e.dna_hash.eq_ignore_ascii_case(&current_hash));

        if let Some(cur) = current_entry {
            if cur.compatible_versions.is_empty()
                || is_game_version_compatible(&cur.compatible_versions, clean_target)
            {
                continue;
            }
        } else if active_full.exists() {
            // Current file is not in version index or has no known version constraint
            continue;
        }

        // Look for an archived version that matches clean_target and exists in Backups/Mods
        let mut best_match: Option<&ArchivedModVersion> = None;
        for candidate in entries {
            if candidate.backup_rel_path.is_empty() {
                continue;
            }
            if !is_game_version_compatible(&candidate.compatible_versions, clean_target) {
                continue;
            }
            let b_full = backups_mods
                .join(candidate.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !b_full.exists() {
                continue;
            }
            match best_match {
                None => best_match = Some(candidate),
                Some(prev) => {
                    if candidate.recorded_at >= prev.recorded_at {
                        best_match = Some(candidate);
                    }
                }
            }
        }

        if let Some(winner) = best_match {
            if !current_hash.is_empty() && winner.dna_hash.eq_ignore_ascii_case(&current_hash) {
                continue;
            }
            let b_full =
                backups_mods.join(winner.backup_rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(ap) = active_full.parent() {
                let _ = std::fs::create_dir_all(ap);
            }
            if active_full.exists() {
                let _ = std::fs::remove_file(&active_full);
            }
            let linked = std::fs::hard_link(&b_full, &active_full)
                .or_else(|_| create_symlink_file(&b_full, &active_full))
                .or_else(|_| std::fs::copy(&b_full, &active_full).map(|_| ()));
            if linked.is_ok() {
                let mtime = std::fs::metadata(&active_full)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if let Some(c) = cache.get_mut(&active_full_str) {
                    c.dna_hash = winner.dna_hash.clone();
                    c.mtime = mtime;
                    cache_dirty = true;
                } else {
                    cache.insert(
                        active_full_str,
                        crate::state::CacheEntry {
                            mtime,
                            dna_hash: winner.dna_hash.clone(),
                            explicitly_local: false,
                            quarantined: false,
                            heuristic_malware_sig: None,
                            heuristic_sigs_mtime: 0,
                        },
                    );
                    cache_dirty = true;
                }
                swapped.push(winner.clone());
            }
        }
    }

    if index_dirty {
        save_mod_versions_index(vault_path, &index);
    }
    if cache_dirty {
        save_cache(vault_path, &cache);
    }

    swapped
}



