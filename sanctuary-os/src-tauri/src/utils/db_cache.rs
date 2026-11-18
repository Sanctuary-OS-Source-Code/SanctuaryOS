#![allow(unused_imports)]
use crate::state::*;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use super::archive_ops::*;
use super::fs_ops::*;
use super::heuristics::*;
use super::path_security::*;

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

pub(super) static DB_CONNECTION_POOL: std::sync::OnceLock<
    std::sync::Mutex<HashMap<PathBuf, std::sync::Arc<std::sync::Mutex<Connection>>>>,
> = std::sync::OnceLock::new();

pub(super) fn initialize_vault_sqlite_schema(conn: &Connection, db_path: &Path, vault_path: &str) {
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

pub(super) fn load_cache_from_conn(conn: &Connection) -> BunkerCache {
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

