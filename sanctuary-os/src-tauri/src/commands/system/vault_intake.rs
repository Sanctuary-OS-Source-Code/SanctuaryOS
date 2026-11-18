#![allow(unused_imports)]
use super::file_ops::open_folder;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// ============================================================================
// Cloud-Sync Folder Interference Detection & Consent-Gated Remediation
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CloudSyncInspectInput {
    #[serde(default)]
    pub master_vault_path: Option<String>,
    #[serde(default)]
    pub vault_path: Option<String>,
    #[serde(default)]
    pub mods_path: Option<String>,
    #[serde(default, alias = "user_data_path")]
    pub docs_path: Option<String>,
    #[serde(default)]
    pub live_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudSyncPathFinding {
    pub role: String,
    pub configured_path: String,
    pub resolved_path: String,
    pub cloud_root_path: Option<String>,
    pub provider: String,
    pub severity: String,
    pub symlink_risk: bool,
    pub has_dehydrated_files: bool,
    pub is_pinned_locally: bool,
    pub is_unpinned: bool,
    pub active_symlink_count: usize,
    pub can_pin_hydration: bool,
    pub is_windows_kfm_redirect: bool,
    pub suggested_local_vault_path: Option<String>,
    pub is_parent_folder_synced: bool,
    pub supports_folder_exclusion: bool,
    pub is_excluded_from_sync: bool,
    pub schema_saves_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudSyncSystemReport {
    pub has_interference: bool,
    pub findings: Vec<CloudSyncPathFinding>,
    pub recommended_safe_vault_root: String,
    pub scanned_at_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudHydrationPinResult {
    pub pinned_count: usize,
    pub skipped_symlinks: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultRelocationResult {
    pub new_master_vault_path: String,
    pub new_active_vault_path: String,
    pub copied_files_count: usize,
    pub copied_bytes: u64,
}

#[derive(Clone, Debug, Default)]
pub struct DetectedCloudInfo {
    pub provider: String,
    pub resolved_path: String,
    pub cloud_root_path: Option<String>,
    pub has_dehydrated_files: bool,
    pub is_pinned_locally: bool,
    pub is_unpinned: bool,
    pub is_windows_kfm_redirect: bool,
}

fn normalize_cloud_cmp_path(path: &std::path::Path) -> String {
    let cleaned = crate::utils::strip_windows_verbatim_prefix(path);
    let s = cleaned.to_string_lossy().replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if cfg!(target_os = "windows") || cfg!(target_os = "macos") {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

fn path_starts_with_root(candidate: &std::path::Path, root: &std::path::Path) -> bool {
    let c = normalize_cloud_cmp_path(candidate);
    let r = normalize_cloud_cmp_path(root);
    if c.is_empty() || r.is_empty() {
        return false;
    }
    c == r || c.starts_with(&format!("{}/", r))
}

static KNOWN_CLOUD_ROOTS_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(std::time::Instant, Vec<(PathBuf, String)>)>>,
> = std::sync::OnceLock::new();

pub fn invalidate_known_cloud_roots_cache() {
    if let Some(mtx) = KNOWN_CLOUD_ROOTS_CACHE.get() {
        if let Ok(mut guard) = mtx.lock() {
            *guard = None;
        }
    }
}

struct TempProbeDirGuard(PathBuf);
impl Drop for TempProbeDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn collect_drivefs_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    let mut base_dirs: Vec<PathBuf> = Vec::new();
    if let Some(local_data) = dirs::data_local_dir() {
        base_dirs.push(local_data.join("Google").join("DriveFS"));
    }
    if cfg!(target_os = "macos") {
        if let Some(app_sup) = dirs::data_dir() {
            let p = app_sup.join("Google").join("DriveFS");
            if !base_dirs.contains(&p) {
                base_dirs.push(p);
            }
        }
    }

    let mut push_valid_drive_dir = |cand: PathBuf| {
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&cand);
        let c_lower = cleaned.to_string_lossy().to_lowercase();
        let has_normal = cleaned
            .components()
            .any(|c| matches!(c, std::path::Component::Normal(_)));
        if !cleaned.is_absolute()
            || !has_normal
            || c_lower.contains("drivefs")
            || c_lower.contains("content_cache")
            || !cleaned.is_dir()
        {
            return;
        }
        push_root(cleaned.clone(), "Google Drive");
        if let Ok(canon) = crate::utils::resolve_canonical_target(&cleaned) {
            let canon_clean = crate::utils::strip_windows_verbatim_prefix(&canon);
            let canon_lower = canon_clean.to_string_lossy().to_lowercase();
            let canon_has_normal = canon_clean
                .components()
                .any(|c| matches!(c, std::path::Component::Normal(_)));
            if canon_clean.is_absolute()
                && canon_has_normal
                && !canon_lower.contains("drivefs")
                && !canon_lower.contains("content_cache")
                && canon_clean.is_dir()
            {
                push_root(canon_clean, "Google Drive");
            }
        }
    };

    let read_row_text = |row: &rusqlite::Row<'_>, idx_opt: Option<usize>| -> Option<String> {
        let idx = idx_opt?;
        match row.get_ref(idx).ok()? {
            rusqlite::types::ValueRef::Text(bytes) => {
                let s = std::str::from_utf8(bytes).ok()?.trim();
                (!s.is_empty()).then(|| s.to_string())
            }
            _ => None,
        }
    };

    let read_row_i64 = |row: &rusqlite::Row<'_>, idx_opt: Option<usize>| -> Option<i64> {
        let idx = idx_opt?;
        match row.get_ref(idx).ok()? {
            rusqlite::types::ValueRef::Integer(v) => Some(v),
            _ => None,
        }
    };

    for base_dir in base_dirs {
        if !base_dir.is_dir() {
            continue;
        }
        let mut active_accounts: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut probe_dirs: Vec<PathBuf> = vec![base_dir.clone()];

        if let Ok(acct_entries) = std::fs::read_dir(&base_dir) {
            for entry in acct_entries.flatten() {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let exact_name = entry.file_name().to_string_lossy().to_string();
                let dir_lower = exact_name.to_lowercase();
                if matches!(
                    dir_lower.as_str(),
                    "logs"
                        | "cef_cache"
                        | "crashpad"
                        | "resources"
                        | "content_cache"
                        | "webview2_user_data"
                        | "thumbnails_cache"
                ) {
                    continue;
                }
                active_accounts.insert(exact_name);
                probe_dirs.push(entry.path());
            }
        }

        for dir_to_probe in probe_dirs {
            for db_name in ["root_preference_sqlite.db", "mirror_sqlite.db"] {
                let db_path = dir_to_probe.join(db_name);
                let Ok(meta) = std::fs::metadata(&db_path) else {
                    continue;
                };
                if !meta.is_file() || meta.len() == 0 || meta.len() > 32 * 1024 * 1024 {
                    continue;
                }

                let tmp_dir = std::env::temp_dir().join(format!(
                    "sanctuary_drivefs_probe_{}",
                    uuid::Uuid::new_v4()
                ));
                if std::fs::create_dir_all(&tmp_dir).is_err() {
                    continue;
                }
                let _guard = TempProbeDirGuard(tmp_dir.clone());
                let tmp_db = tmp_dir.join(db_name);
                if std::fs::copy(&db_path, &tmp_db).is_err() {
                    continue;
                }
                // Copy only -wal (never live memory-mapped -shm) so SQLite cleanly reconstructs state on tmp_db
                let wal_src = dir_to_probe.join(format!("{}-wal", db_name));
                if let Ok(sm) = std::fs::metadata(&wal_src) {
                    if sm.is_file() && sm.len() <= 16 * 1024 * 1024 {
                        let _ = std::fs::copy(&wal_src, tmp_dir.join(format!("{}-wal", db_name)));
                    }
                }

                let Ok(conn) = rusqlite::Connection::open(&tmp_db).or_else(|_| {
                    let ro_flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                        | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX;
                    rusqlite::Connection::open_with_flags(&tmp_db, ro_flags)
                }) else {
                    continue;
                };

                // Structured extraction from root_preference_sqlite's `media` & `roots` tables
                let mut media_mounts: std::collections::HashMap<String, String> =
                    std::collections::HashMap::new();
                if let Ok(mut media_stmt) = conn.prepare("SELECT * FROM \"media\"") {
                    let id_col = media_stmt.column_index("media_id").ok();
                    let mount_col = media_stmt.column_index("last_mount_point").ok();
                    let name_col = media_stmt.column_index("name").ok();
                    let ignored_col = media_stmt.column_index("ignored").ok();
                    if let Ok(mut rows) = media_stmt.query([]) {
                        while let Ok(Some(row)) = rows.next() {
                            let Some(mount) = read_row_text(row, mount_col) else {
                                continue;
                            };
                            if let Some(media_id) = read_row_text(row, id_col) {
                                media_mounts.insert(media_id, mount.clone());
                            }
                            let media_name = read_row_text(row, name_col).unwrap_or_default();
                            let ignored = read_row_i64(row, ignored_col).unwrap_or(0);
                            if media_name.eq_ignore_ascii_case("google drive") && ignored == 0 {
                                let mount_path = std::path::Path::new(&mount);
                                push_valid_drive_dir(mount_path.join("My Drive"));
                                push_valid_drive_dir(mount_path.join("Other computers"));
                            }
                        }
                    }
                }

                if let Ok(mut roots_stmt) = conn.prepare("SELECT * FROM \"roots\"") {
                    let acct_col = roots_stmt.column_index("account_token").ok();
                    let abs_col = roots_stmt.column_index("last_seen_absolute_path").ok();
                    let media_id_col = roots_stmt.column_index("media_id").ok();
                    let rel_col = roots_stmt.column_index("root_path").ok();
                    if let Ok(mut rows) = roots_stmt.query([]) {
                        while let Ok(Some(row)) = rows.next() {
                            if let Some(acct_tok) = read_row_text(row, acct_col) {
                                if !active_accounts.is_empty()
                                    && !active_accounts.contains(&acct_tok)
                                {
                                    continue;
                                }
                            }
                            if let Some(last_seen) = read_row_text(row, abs_col) {
                                push_valid_drive_dir(PathBuf::from(&last_seen));
                            }
                            if let Some(root_path) = read_row_text(row, rel_col) {
                                let rp = std::path::Path::new(&root_path);
                                if rp.is_absolute() {
                                    push_valid_drive_dir(rp.to_path_buf());
                                } else if let Some(mid) = read_row_text(row, media_id_col) {
                                    if let Some(mount) = media_mounts.get(&mid) {
                                        let rel_trimmed =
                                            root_path.trim_start_matches(&['\\', '/'][..]);
                                        if !rel_trimmed.is_empty() {
                                            push_valid_drive_dir(
                                                std::path::Path::new(mount).join(rel_trimmed),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback scan for any other sync-preference tables
                let mut table_names: Vec<String> = Vec::new();
                if let Ok(mut stmt) =
                    conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
                {
                    if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                        for t in rows.flatten() {
                            let tl = t.to_lowercase();
                            if !matches!(tl.as_str(), "media" | "roots" | "mirror_item")
                                && (tl.contains("root")
                                    || tl.contains("sync")
                                    || tl.contains("folder")
                                    || tl.contains("pref"))
                                && !t.is_empty()
                                && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                            {
                                table_names.push(t);
                            }
                        }
                    }
                }

                for table in table_names {
                    let sql = format!("SELECT * FROM \"{}\" LIMIT 200", table);
                    let Ok(mut stmt) = conn.prepare(&sql) else {
                        continue;
                    };
                    let col_count = stmt.column_count();
                    let Ok(mut rows) = stmt.query([]) else {
                        continue;
                    };
                    while let Ok(Some(row)) = rows.next() {
                        for idx in 0..col_count {
                            if let Ok(rusqlite::types::ValueRef::Text(bytes)) = row.get_ref(idx) {
                                let raw = std::str::from_utf8(bytes).unwrap_or("").trim();
                                if raw.len() < 4 || raw.len() > 1024 {
                                    continue;
                                }
                                let mut cand = PathBuf::from(raw);
                                if cfg!(target_os = "windows")
                                    && !cand.is_absolute()
                                    && (raw.contains('\\') || raw.contains('/'))
                                {
                                    if let Some(home) = dirs::home_dir() {
                                        let mut drive_root = PathBuf::new();
                                        for comp in home.components() {
                                            match comp {
                                                std::path::Component::Prefix(_)
                                                | std::path::Component::RootDir => {
                                                    drive_root.push(comp.as_os_str());
                                                }
                                                _ => break,
                                            }
                                        }
                                        let rel_trimmed = raw.trim_start_matches(&['\\', '/'][..]);
                                        if !rel_trimmed.is_empty()
                                            && !drive_root.as_os_str().is_empty()
                                        {
                                            let joined = drive_root.join(rel_trimmed);
                                            if joined.is_dir() {
                                                cand = joined;
                                            }
                                        }
                                    }
                                }
                                push_valid_drive_dir(cand);
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_registry_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let provider_from_key_line = |line_lower: &str| -> &'static str {
        if line_lower.contains("googledrive") || line_lower.contains("drivefs") {
            "Google Drive"
        } else if line_lower.contains("onedrive") {
            "OneDrive"
        } else if line_lower.contains("dropbox") {
            "Dropbox"
        } else if line_lower.contains("icloud") {
            "iCloud Drive"
        } else if line_lower.contains("nextcloud") {
            "Nextcloud"
        } else if line_lower.contains("owncloud") {
            "ownCloud"
        } else if line_lower.contains("proton") {
            "Proton Drive"
        } else if line_lower.contains("pcloud") {
            "pCloud"
        } else if line_lower.contains("mega") {
            "MEGA"
        } else if line_lower.contains("box") {
            "Box"
        } else {
            "Cloud Sync"
        }
    };

    if let Ok(output) = std::process::Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SyncRootManager",
            "/s",
            "/v",
            "UserSyncRoots",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut cur_provider = "Cloud Sync";
            for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("HKEY_") {
                    cur_provider = provider_from_key_line(&trimmed.to_lowercase());
                    continue;
                }
                if let Some(pos) = trimmed.find("REG_SZ") {
                    let val = trimmed[pos + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(val),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, cur_provider);
                        }
                    }
                }
            }
        }
    }

    if let Ok(output) = std::process::Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "query",
            "HKCU\\Software\\Microsoft\\OneDrive\\Accounts",
            "/s",
            "/v",
            "UserFolder",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Some(pos) = trimmed.find("REG_SZ") {
                    let val = trimmed[pos + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(val),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, "OneDrive");
                        }
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn collect_windows_registry_sync_roots(_push_root: &mut dyn FnMut(PathBuf, &str)) {}

fn collect_client_config_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
    let mut cfg_targets: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(cfg_dir) = dirs::config_dir() {
        cfg_targets.push((cfg_dir.join("Nextcloud").join("nextcloud.cfg"), "Nextcloud"));
        cfg_targets.push((cfg_dir.join("ownCloud").join("owncloud.cfg"), "ownCloud"));
    }
    if let Some(home) = dirs::home_dir() {
        cfg_targets.push((
            home.join("Library").join("Preferences").join("Nextcloud").join("nextcloud.cfg"),
            "Nextcloud",
        ));
        cfg_targets.push((
            home.join(".config").join("Nextcloud").join("nextcloud.cfg"),
            "Nextcloud",
        ));
        cfg_targets.push((
            home.join(".config").join("ownCloud").join("owncloud.cfg"),
            "ownCloud",
        ));
    }
    for (cfg_path, provider) in cfg_targets {
        let Ok(meta) = std::fs::metadata(&cfg_path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&cfg_path) {
            for line in raw.lines() {
                let trimmed = line.trim();
                if let Some((k, v)) = trimmed.split_once('=') {
                    let k_lower = k.trim().to_lowercase();
                    if k_lower.ends_with("localpath") && !k_lower.contains("ignore") {
                        let clean_val = v.trim().trim_matches('"');
                        if !clean_val.is_empty() {
                            let p = crate::utils::strip_windows_verbatim_prefix(
                                std::path::Path::new(clean_val),
                            );
                            if p.is_absolute() && p.is_dir() {
                                push_root(p, provider);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut syncthing_cfgs: Vec<PathBuf> = Vec::new();
    if let Some(local_data) = dirs::data_local_dir() {
        syncthing_cfgs.push(local_data.join("Syncthing").join("config.xml"));
    }
    if let Some(cfg_dir) = dirs::config_dir() {
        syncthing_cfgs.push(cfg_dir.join("syncthing").join("config.xml"));
    }
    if let Some(home) = dirs::home_dir() {
        syncthing_cfgs.push(home.join(".config").join("syncthing").join("config.xml"));
        syncthing_cfgs.push(
            home.join("Library")
                .join("Application Support")
                .join("Syncthing")
                .join("config.xml"),
        );
    }
    for st_cfg in syncthing_cfgs {
        let Ok(meta) = std::fs::metadata(&st_cfg) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&st_cfg) {
            for chunk in raw.split("<folder ") {
                let tag_end = chunk.find('>').unwrap_or(chunk.len());
                let tag_head = &chunk[..tag_end];
                if let Some(pos) = tag_head.find("path=\"") {
                    let after = &tag_head[pos + 6..];
                    if let Some(end_q) = after.find('"') {
                        let raw_p = after[..end_q].replace("&amp;", "&");
                        let p = crate::utils::strip_windows_verbatim_prefix(
                            std::path::Path::new(raw_p.trim()),
                        );
                        if p.is_absolute() && p.is_dir() {
                            push_root(p, "Syncthing");
                        }
                    }
                }
            }
        }
    }
}

fn collect_known_cloud_sync_roots() -> Vec<(PathBuf, String)> {
    let mtx = KNOWN_CLOUD_ROOTS_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(guard) = mtx.lock() {
        if let Some((captured_at, ref cached)) = *guard {
            if captured_at.elapsed() < std::time::Duration::from_secs(5) {
                return cached.clone();
            }
        }
    }

    let mut roots: Vec<(PathBuf, String)> = Vec::new();
    let mut push_root = |path: PathBuf, provider: &str| {
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&path);
        if !cleaned.as_os_str().is_empty()
            && !roots.iter().any(|(existing, _)| {
                normalize_cloud_cmp_path(existing) == normalize_cloud_cmp_path(&cleaned)
            })
        {
            roots.push((cleaned, provider.to_string()));
        }
    };

    for env_key in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                push_root(PathBuf::from(trimmed), "OneDrive");
            }
        }
    }

    // Read Dropbox client config if present (info.json lists exact personal/business folder paths)
    let mut dropbox_info_candidates: Vec<PathBuf> = Vec::new();
    if let Some(app_data) = std::env::var_os("APPDATA") {
        dropbox_info_candidates.push(PathBuf::from(app_data).join("Dropbox").join("info.json"));
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        dropbox_info_candidates.push(PathBuf::from(local_app_data).join("Dropbox").join("info.json"));
    }
    if let Some(home) = dirs::home_dir() {
        dropbox_info_candidates.push(home.join(".dropbox").join("info.json"));
    }
    for cfg_path in dropbox_info_candidates {
        if let Ok(raw) = std::fs::read_to_string(&cfg_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                for key in ["personal", "business"] {
                    if let Some(p) = val
                        .get(key)
                        .and_then(|v| v.get("path"))
                        .and_then(|v| v.as_str())
                    {
                        let trimmed = p.trim();
                        if !trimmed.is_empty() {
                            push_root(PathBuf::from(trimmed), "Dropbox");
                        }
                    }
                }
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let mobile_docs = home.join("Library").join("Mobile Documents");
        if mobile_docs.exists() {
            push_root(mobile_docs, "iCloud Drive");
        }
        let cloud_storage = home.join("Library").join("CloudStorage");
        if let Ok(entries) = std::fs::read_dir(&cloud_storage) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let provider = if name.starts_with("onedrive") {
                    "OneDrive"
                } else if name.starts_with("dropbox") {
                    "Dropbox"
                } else if name.starts_with("googledrive") || name.starts_with("google drive") {
                    "Google Drive"
                } else if name.starts_with("protondrive") || name.starts_with("proton drive") {
                    "Proton Drive"
                } else if name.starts_with("nextcloud") {
                    "Nextcloud"
                } else if name.starts_with("owncloud") {
                    "ownCloud"
                } else if name.starts_with("pcloud") {
                    "pCloud"
                } else if name.starts_with("box") {
                    "Box"
                } else if name.starts_with("mega") {
                    "MEGA"
                } else if name.starts_with("icloud") {
                    "iCloud Drive"
                } else {
                    "Cloud Sync"
                };
                push_root(entry.path(), provider);
            }
        }
    }

    collect_drivefs_sync_roots(&mut push_root);
    collect_windows_registry_sync_roots(&mut push_root);
    collect_client_config_sync_roots(&mut push_root);

    if let Ok(mut guard) = mtx.lock() {
        *guard = Some((std::time::Instant::now(), roots.clone()));
    }

    roots
}

fn match_cloud_provider_segment(segment: &str, prev_segment_lower: &str) -> Option<&'static str> {
    let lower = segment.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }
    if lower == "onedrive" || lower.starts_with("onedrive - ") || lower.starts_with("onedrive_") {
        return Some("OneDrive");
    }
    if matches!(
        lower.as_str(),
        "icloud drive" | "iclouddrive" | "mobile documents" | "clouddocs" | "com~apple~clouddocs"
    ) {
        return Some("iCloud Drive");
    }
    if lower == "dropbox" || lower.starts_with("dropbox (") {
        return Some("Dropbox");
    }
    if lower == "google drive" || lower == "googledrive" || lower.starts_with("google drive (") {
        return Some("Google Drive");
    }
    if lower == "nextcloud" || lower.starts_with("nextcloud (") {
        return Some("Nextcloud");
    }
    if lower == "owncloud" || lower.starts_with("owncloud (") {
        return Some("ownCloud");
    }
    if lower == "proton drive" || lower == "protondrive" || lower.starts_with("proton drive") {
        return Some("Proton Drive");
    }
    if lower == "pcloud" || lower == "pcloud drive" || lower == "pclouddrive" {
        return Some("pCloud");
    }
    if lower == "resilio sync" || lower == "resilio" {
        return Some("Resilio Sync");
    }
    if lower == "box sync"
        || lower == "box drive"
        || (lower == "box"
            && (prev_segment_lower == "users"
                || prev_segment_lower == "home"
                || prev_segment_lower == "cloudstorage"
                || prev_segment_lower.is_empty()))
    {
        return Some("Box");
    }
    if lower == "megasync"
        || (lower == "mega"
            && (prev_segment_lower == "users"
                || prev_segment_lower == "home"
                || prev_segment_lower == "cloudstorage"))
    {
        return Some("MEGA");
    }
    None
}

#[cfg(target_os = "windows")]
fn check_windows_cloud_filter_flags(path: &std::path::Path) -> (bool, bool, bool, bool) {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::fs::MetadataExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{FindClose, FindFirstFileW, WIN32_FIND_DATAW};

    const FILE_ATTRIBUTE_OFFLINE: u32 = 0x0000_1000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    const FILE_ATTRIBUTE_PINNED: u32 = 0x0008_0000;
    const FILE_ATTRIBUTE_UNPINNED: u32 = 0x0010_0000;
    const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x0004_0000;
    const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;

    let mut has_cloud_reparse = false;
    let mut has_dehydrated = false;
    let mut is_pinned = false;
    let mut is_unpinned = false;

    let inspect_one = |target: &std::path::Path,
                       cloud_rep: &mut bool,
                       dehyd: &mut bool,
                       pinned: &mut bool,
                       unpinned: &mut bool| {
        let Ok(meta) = std::fs::symlink_metadata(target) else {
            return;
        };
        let attrs = meta.file_attributes();
        if (attrs & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_OFFLINE)) != 0 {
            *dehyd = true;
        }
        if (attrs & FILE_ATTRIBUTE_PINNED) != 0 {
            *pinned = true;
        }
        if (attrs & FILE_ATTRIBUTE_UNPINNED) != 0 {
            *unpinned = true;
        }
        if (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            let trimmed = crate::utils::strip_windows_verbatim_prefix(target);
            let s = trimmed.to_string_lossy();
            let clean_s = s.trim_end_matches(&['\\', '/'][..]);
            if !clean_s.is_empty() {
                let wide: Vec<u16> = std::ffi::OsStr::new(clean_s)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let mut find_data = WIN32_FIND_DATAW::default();
                unsafe {
                    if let Ok(handle) = FindFirstFileW(PCWSTR(wide.as_ptr()), &mut find_data) {
                        let tag = find_data.dwReserved0;
                        // IO_REPARSE_TAG_CLOUD* (0x9000_001A .. 0x9000_F01A)
                        if (tag & !0x0000_F000) == 0x9000_001A {
                            *cloud_rep = true;
                        }
                        let _ = FindClose(handle);
                    }
                }
            }
        }
    };

    inspect_one(
        path,
        &mut has_cloud_reparse,
        &mut has_dehydrated,
        &mut is_pinned,
        &mut is_unpinned,
    );

    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten().take(64) {
                inspect_one(
                    &entry.path(),
                    &mut has_cloud_reparse,
                    &mut has_dehydrated,
                    &mut is_pinned,
                    &mut is_unpinned,
                );
            }
        }
    }

    (has_cloud_reparse, has_dehydrated, is_pinned, is_unpinned)
}

#[cfg(not(target_os = "windows"))]
fn check_windows_cloud_filter_flags(_path: &std::path::Path) -> (bool, bool, bool, bool) {
    (false, false, false, false)
}

fn decode_desktop_ini_lower(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) && bytes.len() >= 4 {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s).to_lowercase();
    }
    if bytes.len() >= 4 && bytes[0] != 0 && bytes[1] == 0 && bytes[3] == 0 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s).to_lowercase();
    }
    String::from_utf8_lossy(bytes).to_lowercase()
}

fn match_provider_from_desktop_ini(ini_path: &std::path::Path) -> Option<&'static str> {
    let meta = std::fs::metadata(ini_path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > 65536 {
        return None;
    }
    let bytes = std::fs::read(ini_path).ok()?;
    let lower = decode_desktop_ini_lower(&bytes);
    if lower.contains("googledrivefs")
        || lower.contains("drive file stream")
        || lower.contains("google\\drive")
        || lower.contains("google/drive")
        || lower.contains("google drive")
    {
        return Some("Google Drive");
    }
    if lower.contains("onedrive") {
        return Some("OneDrive");
    }
    if lower.contains("dropbox") {
        return Some("Dropbox");
    }
    if lower.contains("icloud") {
        return Some("iCloud Drive");
    }
    if lower.contains("megasync") {
        return Some("MEGA");
    }
    if lower.contains("nextcloud") {
        return Some("Nextcloud");
    }
    if lower.contains("owncloud") {
        return Some("ownCloud");
    }
    if lower.contains("pcloud") {
        return Some("pCloud");
    }
    if lower.contains("proton drive") || lower.contains("protondrive") {
        return Some("Proton Drive");
    }
    None
}

pub fn detect_cloud_provider_for_path(raw_path: &std::path::Path) -> Option<DetectedCloudInfo> {
    let raw_str = raw_path.to_string_lossy().trim().to_string();
    if raw_str.is_empty() || raw_str.eq_ignore_ascii_case("web") {
        return None;
    }

    let cleaned = crate::utils::strip_windows_verbatim_prefix(raw_path);
    let canonical = crate::utils::resolve_canonical_target(&cleaned).unwrap_or_else(|_| cleaned.clone());
    let resolved_path_str = canonical.to_string_lossy().to_string();

    let known_roots = collect_known_cloud_sync_roots();
    let mut matched_provider: Option<String> = None;
    let mut matched_root: Option<String> = None;

    // 1. Check exact/ancestor match against known OS cloud-sync client roots
    for candidate in [&canonical, &cleaned] {
        for (root, provider) in &known_roots {
            if path_starts_with_root(candidate, root) {
                matched_provider = Some(provider.clone());
                matched_root = Some(root.to_string_lossy().to_string());
                break;
            }
        }
        if matched_provider.is_some() {
            break;
        }
    }

    // 2. Component-aware path segment matching (avoids false positives on substrings)
    if matched_provider.is_none() {
        for candidate in [&canonical, &cleaned] {
            let mut accum = PathBuf::new();
            let mut prev_lower = String::new();
            let comps: Vec<_> = candidate.components().collect();
            for (idx, comp) in comps.iter().enumerate() {
                accum.push(comp.as_os_str());
                if let std::path::Component::Normal(os_s) = comp {
                    let seg = os_s.to_string_lossy();
                    let next_prev = seg.to_lowercase();
                    // Avoid matching the immediate parent of the user folder wrong; pass previous component
                    if let Some(provider) = match_cloud_provider_segment(&seg, &prev_lower) {
                        matched_provider = Some(provider.to_string());
                        matched_root = Some(accum.to_string_lossy().to_string());
                        break;
                    }
                    // On macOS/Linux/Windows `<Home>\Box` has idx >= 3 (`C:\Users\<User>\Box`)
                    let _ = idx;
                    prev_lower = next_prev;
                }
            }
            if matched_provider.is_some() {
                break;
            }
        }
    }

    // 3. Ancestor marker files (.stfolder, .dropbox, .sync/ID, .owncloudsync.log, .megaignore, desktop.ini)
    if matched_provider.is_none() {
        for candidate in [&canonical, &cleaned] {
            let mut cur_opt = Some(candidate.as_path());
            let mut depth = 0usize;
            while let Some(cur) = cur_opt {
                if depth > 12 {
                    break;
                }
                if cur.join(".stfolder").exists() || cur.join(".stignore").exists() {
                    matched_provider = Some("Syncthing".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".sync").join("ID").exists() || cur.join(".sync").join("IgnoreList").exists() {
                    matched_provider = Some("Resilio Sync".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".dropbox").exists() {
                    matched_provider = Some("Dropbox".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".owncloudsync.log").exists() {
                    matched_provider = Some("Nextcloud".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if cur.join(".megaignore").exists() {
                    matched_provider = Some("MEGA".to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                if let Some(ini_provider) = match_provider_from_desktop_ini(&cur.join("desktop.ini")) {
                    matched_provider = Some(ini_provider.to_string());
                    matched_root = Some(cur.to_string_lossy().to_string());
                    break;
                }
                cur_opt = cur.parent();
                depth += 1;
            }
            if matched_provider.is_some() {
                break;
            }
        }
    }

    // 4. Shallow directory inspection for iCloud placeholders (.icloud) & Windows Cloud Filter tags
    let inspect_target = if canonical.exists() {
        canonical.as_path()
    } else {
        cleaned.as_path()
    };

    let mut has_icloud_placeholders = false;
    if inspect_target.is_dir() {
        if let Ok(entries) = std::fs::read_dir(inspect_target) {
            for entry in entries.flatten().take(64) {
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.ends_with(".icloud") {
                    has_icloud_placeholders = true;
                    if matched_provider.is_none() {
                        matched_provider = Some("iCloud Drive".to_string());
                    }
                    break;
                }
            }
        }
    }

    let (has_cloud_reparse, win_dehydrated, is_pinned, is_unpinned) =
        check_windows_cloud_filter_flags(inspect_target);

    if matched_provider.is_none() && (has_cloud_reparse || win_dehydrated || is_unpinned) {
        matched_provider = Some("Cloud Sync".to_string());
    }

    let provider = matched_provider?;

    let is_windows_kfm_redirect = if cfg!(target_os = "windows") && provider == "OneDrive" {
        let lower_norm = normalize_cloud_cmp_path(&canonical);
        lower_norm.contains("/onedrive/documents")
            || lower_norm.ends_with("/onedrive/documents")
            || lower_norm.contains("/onedrive/desktop")
            || lower_norm.ends_with("/onedrive/desktop")
            || matched_root.as_ref().map_or(false, |r| {
                let r_norm = normalize_cloud_cmp_path(std::path::Path::new(r));
                lower_norm.starts_with(&format!("{}/documents", r_norm))
                    || lower_norm.starts_with(&format!("{}/desktop", r_norm))
            })
    } else {
        false
    };

    Some(DetectedCloudInfo {
        provider,
        resolved_path: resolved_path_str,
        cloud_root_path: matched_root,
        has_dehydrated_files: win_dehydrated || has_icloud_placeholders,
        is_pinned_locally: is_pinned && !is_unpinned && !win_dehydrated,
        is_unpinned,
        is_windows_kfm_redirect,
    })
}

pub fn recommended_safe_vault_root() -> String {
    if let Some(home) = std::env::var("HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
    {
        let home_vault = home.join("SanctuaryVault");
        if detect_cloud_provider_for_path(&home_vault).is_none() {
            return crate::utils::strip_windows_verbatim_prefix(&home_vault)
                .to_string_lossy()
                .to_string();
        }
    }
    if let Some(local_data) = dirs::data_local_dir() {
        let local_vault = local_data.join("SanctuaryVault");
        if detect_cloud_provider_for_path(&local_vault).is_none() {
            return crate::utils::strip_windows_verbatim_prefix(&local_vault)
                .to_string_lossy()
                .to_string();
        }
    }
    if let Ok(sys_drive) = std::env::var("SystemDrive") {
        let trimmed = sys_drive.trim();
        if !trimmed.is_empty() {
            return format!("{}\\SanctuaryVault", trimmed.trim_end_matches('\\'));
        }
    }
    if cfg!(target_os = "windows") {
        dirs::home_dir()
            .and_then(|h| {
                let s = h.to_string_lossy().to_string();
                s.get(0..2).map(|drv| format!("{}\\SanctuaryVault", drv))
            })
            .unwrap_or_else(|| "SanctuaryVault".to_string())
    } else {
        "/var/tmp/SanctuaryVault".to_string()
    }
}

fn count_shallow_symlinks(dir: &std::path::Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    let mut count = 0usize;
    let mut inspected = 0usize;
    let mut queue = std::collections::VecDeque::new();
    queue.push_back((dir.to_path_buf(), 0usize));

    while let Some((cur_dir, depth)) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&cur_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if inspected >= 1000 {
                return count;
            }
            inspected += 1;
            let p = entry.path();
            if crate::utils::is_symlink_or_reparse_point(&p) {
                count += 1;
                continue;
            }
            if depth + 1 < 5 && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                queue.push_back((p, depth + 1));
            }
        }
    }
    count
}

fn role_priority(role: &str) -> u8 {
    match role {
        "master_vault" => 6,
        "workspace_vault" => 5,
        "mods_target" => 4,
        "install_route" => 3,
        "user_data" => 2,
        "game_root" => 1,
        _ => 0,
    }
}

fn is_symlink_risk_role(role: &str) -> bool {
    matches!(
        role,
        "master_vault" | "workspace_vault" | "mods_target" | "install_route"
    )
}

fn supports_provider_folder_exclusion(provider: &str) -> bool {
    matches!(
        provider,
        "Dropbox" | "Nextcloud" | "ownCloud" | "Syncthing" | "Resilio Sync" | "MEGA"
    )
}

fn ignore_file_rel_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "Syncthing" => Some(".stignore"),
        "Resilio Sync" => Some(".sync/IgnoreList"),
        "Nextcloud" | "ownCloud" => Some(".sync-exclude.lst"),
        "MEGA" => Some(".megaignore"),
        _ => None,
    }
}

fn check_ignore_list_contains_target(
    list_file: &std::path::Path,
    base_root: &std::path::Path,
    target: &std::path::Path,
) -> bool {
    let Ok(raw) = std::fs::read_to_string(list_file) else {
        return false;
    };
    let rel_forward = target
        .strip_prefix(base_root)
        .ok()
        .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_lowercase())
        .filter(|s| !s.is_empty());
    let leaf_lower = target
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }
        let cleaned = trimmed
            .trim_start_matches('/')
            .trim_end_matches('/')
            .trim_end_matches("/*")
            .replace('\\', "/")
            .to_lowercase();
        if let Some(ref rel) = rel_forward {
            if cleaned == *rel {
                return true;
            }
        }
        if let Some(ref leaf) = leaf_lower {
            if cleaned == *leaf {
                return true;
            }
        }
    }
    false
}

fn check_is_folder_excluded_from_sync(
    resolved_path: &std::path::Path,
    provider: &str,
    cloud_root_path: Option<&std::path::Path>,
) -> bool {
    if provider == "Dropbox" {
        let mut candidates: Vec<PathBuf> = vec![resolved_path.to_path_buf()];
        if let Some(root) = cloud_root_path {
            let mut cur = resolved_path.parent();
            let mut steps = 0usize;
            while let Some(p) = cur {
                if steps > 8 || normalize_cloud_cmp_path(p) == normalize_cloud_cmp_path(root) {
                    break;
                }
                candidates.push(p.to_path_buf());
                cur = p.parent();
                steps += 1;
            }
        }
        for cand in candidates {
            #[cfg(target_os = "windows")]
            {
                let ads = PathBuf::from(format!(
                    "{}:com.dropbox.ignored",
                    cand.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                ));
                if let Ok(val) = std::fs::read_to_string(&ads) {
                    if val.trim() == "1" {
                        return true;
                    }
                }
            }
            #[cfg(target_os = "macos")]
            {
                if let Ok(out) = std::process::Command::new("xattr")
                    .args(["-p", "com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                if let Ok(out) = std::process::Command::new("getfattr")
                    .args(["--only-values", "-n", "user.com.dropbox.ignored"])
                    .arg(&cand)
                    .output()
                {
                    if out.status.success()
                        && String::from_utf8_lossy(&out.stdout).trim() == "1"
                    {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    if let Some(rel_ignore_file) = ignore_file_rel_for_provider(provider) {
        if let Some(root) = cloud_root_path {
            let list_file = root.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, root, resolved_path)
            {
                return true;
            }
        }
        if let Some(parent) = resolved_path.parent() {
            let list_file = parent.join(rel_ignore_file);
            if list_file.is_file()
                && check_ignore_list_contains_target(&list_file, parent, resolved_path)
            {
                return true;
            }
        }
    }

    false
}

fn resolve_schema_saves_path(
    user_data_dir: Option<&str>,
    active_schema: &Option<crate::schema::GameSchema>,
) -> Option<String> {
    let docs_str = user_data_dir?.trim();
    if docs_str.is_empty() || docs_str.eq_ignore_ascii_case("web") {
        return None;
    }
    let schema = active_schema.as_ref()?;
    let tc = schema.time_capsule.as_ref()?;
    let mut rel_targets: Vec<String> = Vec::new();
    if let Some(ref airgap) = tc.save_airgap_targets {
        for rel in airgap {
            let trimmed = rel.trim();
            if !trimmed.is_empty() && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(trimmed)) {
                rel_targets.push(trimmed.to_string());
            }
        }
    }
    for wt in &tc.world_state_targets {
        let p_trimmed = wt.path.trim();
        let name_lower = wt.name.to_lowercase();
        if !p_trimmed.is_empty()
            && (p_trimmed.to_lowercase().contains("save") || name_lower.contains("save"))
            && !rel_targets.iter().any(|x| x.eq_ignore_ascii_case(p_trimmed))
        {
            rel_targets.push(p_trimmed.to_string());
        }
    }
    if rel_targets.is_empty() {
        return None;
    }

    let normalized_docs = if cfg!(target_os = "windows") {
        docs_str.replace('/', "\\")
    } else {
        docs_str.replace('\\', "/")
    };
    let raw_docs_path = std::path::Path::new(&normalized_docs);
    let clean_docs_buf = crate::utils::resolve_canonical_target(raw_docs_path)
        .unwrap_or_else(|_| crate::utils::strip_windows_verbatim_prefix(raw_docs_path));
    let mut first_candidate: Option<PathBuf> = None;
    for rel in rel_targets {
        let expanded_rel = crate::game_logic::expand_env_vars(&rel);
        let resolved = crate::utils::resolve_case_insensitive_path(&clean_docs_buf, &expanded_rel);
        let cleaned = crate::utils::strip_windows_verbatim_prefix(&resolved);
        if cleaned.exists() {
            return Some(cleaned.to_string_lossy().to_string());
        }
        if first_candidate.is_none() {
            first_candidate = Some(cleaned);
        }
    }
    first_candidate.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn inspect_cloud_sync_status(
    paths_override: Option<CloudSyncInspectInput>,
    force_refresh: Option<bool>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<CloudSyncSystemReport, String> {
    let active_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<CloudSyncSystemReport, String> {
        if force_refresh.unwrap_or(false) {
            invalidate_known_cloud_roots_cache();
        }
        let global_cfg = crate::commands::state_ops::get_global_config();
        let coords = crate::commands::state_ops::get_saved_coordinates();

        let ov = paths_override.unwrap_or_default();
        let master_vault = ov
            .master_vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                global_cfg
                    .vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                coords
                    .master_vault_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            });

        let workspace_vault = ov
            .vault_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let v = coords.vault_path.trim();
                (!v.is_empty() && !v.eq_ignore_ascii_case("web")).then(|| v.to_string())
            });

        let mods_target = ov
            .mods_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let m = coords.mods_path.trim();
                (!m.is_empty() && !m.eq_ignore_ascii_case("web")).then(|| m.to_string())
            })
            .or_else(|| {
                crate::game_logic::get_default_mods_folder(&active_schema)
                    .map(|p| crate::utils::strip_windows_verbatim_prefix(&p).to_string_lossy().to_string())
            });

        let user_data = ov
            .docs_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                coords
                    .docs_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
                    .map(str::to_string)
            })
            .or_else(|| {
                let resolved = crate::game_logic::resolve_user_data_root(
                    mods_target.as_deref().unwrap_or(""),
                    &active_schema,
                );
                let s = crate::utils::strip_windows_verbatim_prefix(&resolved)
                    .to_string_lossy()
                    .trim()
                    .to_string();
                (!s.is_empty() && !s.eq_ignore_ascii_case("web")).then_some(s)
            });

        let game_root = ov
            .live_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(str::to_string)
            .or_else(|| {
                let l = coords.live_path.trim();
                (!l.is_empty() && !l.eq_ignore_ascii_case("web")).then(|| l.to_string())
            });

        let mut candidates: Vec<(String, String)> = Vec::new();
        if let Some(ref p) = master_vault {
            candidates.push(("master_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = workspace_vault {
            candidates.push(("workspace_vault".to_string(), p.clone()));
        }
        if let Some(ref p) = mods_target {
            candidates.push(("mods_target".to_string(), p.clone()));
        }
        if let Some(ref p) = user_data {
            candidates.push(("user_data".to_string(), p.clone()));
        }
        if let Some(ref p) = game_root {
            candidates.push(("game_root".to_string(), p.clone()));
        }

        // Resolve additional schema install_routes targets dynamically
        let routes = crate::game_logic::get_install_routes(&active_schema);
        for route in routes {
            let base_str = match route.target_root.trim().to_lowercase().as_str() {
                "live_path" | "engine" | "game" => game_root.as_deref().unwrap_or(""),
                "docs_path" | "documents" | "docs" | "user_data" => {
                    user_data.as_deref().unwrap_or("")
                }
                _ => mods_target.as_deref().unwrap_or(""),
            };
            if base_str.is_empty() {
                continue;
            }
            let base_p = PathBuf::from(base_str);
            let sub_trimmed = route.target_subdir.trim();
            let route_target = if sub_trimmed.is_empty() || sub_trimmed == "." {
                base_p
            } else {
                let expanded_sub = crate::game_logic::expand_schema_path_for_os(
                    sub_trimmed,
                    &active_schema,
                    game_root.as_deref(),
                );
                let sub_p = PathBuf::from(&expanded_sub);
                if sub_p.is_absolute() {
                    sub_p
                } else {
                    base_p.join(sub_p)
                }
            };
            candidates.push((
                "install_route".to_string(),
                route_target.to_string_lossy().to_string(),
            ));
        }

        let resolved_schema_saves =
            resolve_schema_saves_path(user_data.as_deref(), &active_schema);
        let safe_vault_root = recommended_safe_vault_root();
        let mut by_resolved: std::collections::HashMap<String, CloudSyncPathFinding> =
            std::collections::HashMap::new();

        for (role, raw_path) in candidates {
            let Some(detected) = detect_cloud_provider_for_path(std::path::Path::new(&raw_path)) else {
                continue;
            };
            let dedup_key = normalize_cloud_cmp_path(std::path::Path::new(&detected.resolved_path));
            let replace = by_resolved
                .get(&dedup_key)
                .map(|existing| role_priority(&role) > role_priority(&existing.role))
                .unwrap_or(true);
            if !replace {
                continue;
            }

            let is_excluded_from_sync = check_is_folder_excluded_from_sync(
                std::path::Path::new(&detected.resolved_path),
                &detected.provider,
                detected.cloud_root_path.as_deref().map(std::path::Path::new),
            );
            let symlink_risk = !is_excluded_from_sync && is_symlink_risk_role(&role);
            let symlink_count = if is_symlink_risk_role(&role) {
                count_shallow_symlinks(std::path::Path::new(&detected.resolved_path))
            } else {
                0
            };
            let is_critical = !is_excluded_from_sync
                && (symlink_risk || detected.has_dehydrated_files || detected.is_unpinned);
            let can_pin_hydration = (cfg!(target_os = "windows")
                && (detected.has_dehydrated_files
                    || detected.is_unpinned
                    || detected.provider.eq_ignore_ascii_case("OneDrive")
                    || detected.provider.eq_ignore_ascii_case("iCloud Drive")))
                || (cfg!(target_os = "macos")
                    && detected.provider.eq_ignore_ascii_case("iCloud Drive")
                    && (detected.has_dehydrated_files || detected.is_unpinned));
            let suggested_local_vault_path = if matches!(role.as_str(), "master_vault" | "workspace_vault") {
                Some(safe_vault_root.clone())
            } else {
                None
            };
            let is_parent_folder_synced = detected.cloud_root_path.as_deref().map_or(false, |root| {
                let rp = std::path::Path::new(root);
                let tp = std::path::Path::new(&detected.resolved_path);
                path_starts_with_root(tp, rp)
                    && normalize_cloud_cmp_path(tp) != normalize_cloud_cmp_path(rp)
            });
            let supports_folder_exclusion =
                supports_provider_folder_exclusion(&detected.provider);
            let schema_saves_path = if matches!(
                role.as_str(),
                "mods_target" | "install_route" | "user_data"
            ) {
                resolved_schema_saves.clone()
            } else {
                None
            };

            by_resolved.insert(
                dedup_key,
                CloudSyncPathFinding {
                    role,
                    configured_path: raw_path,
                    resolved_path: detected.resolved_path,
                    cloud_root_path: detected.cloud_root_path,
                    provider: detected.provider,
                    severity: if is_excluded_from_sync {
                        "info".to_string()
                    } else if is_critical {
                        "critical".to_string()
                    } else {
                        "warning".to_string()
                    },
                    symlink_risk,
                    has_dehydrated_files: detected.has_dehydrated_files,
                    is_pinned_locally: detected.is_pinned_locally,
                    is_unpinned: detected.is_unpinned,
                    active_symlink_count: symlink_count,
                    can_pin_hydration,
                    is_windows_kfm_redirect: detected.is_windows_kfm_redirect,
                    suggested_local_vault_path,
                    is_parent_folder_synced,
                    supports_folder_exclusion,
                    is_excluded_from_sync,
                    schema_saves_path,
                },
            );
        }

        let raw_findings: Vec<CloudSyncPathFinding> = by_resolved.into_values().collect();
        let mut findings: Vec<CloudSyncPathFinding> = raw_findings
            .iter()
            .filter(|f| {
                if matches!(f.role.as_str(), "user_data" | "game_root") && !f.has_dehydrated_files {
                    let covered_by_descendant = raw_findings.iter().any(|other| {
                        !std::ptr::eq(*f, other)
                            && matches!(other.role.as_str(), "mods_target" | "install_route")
                            && other.provider.eq_ignore_ascii_case(&f.provider)
                            && path_starts_with_root(
                                std::path::Path::new(&other.resolved_path),
                                std::path::Path::new(&f.resolved_path),
                            )
                    });
                    if covered_by_descendant {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();
        findings.sort_by(|a, b| role_priority(&b.role).cmp(&role_priority(&a.role)));
        let has_interference = findings.iter().any(|f| !f.is_excluded_from_sync);

        let scanned_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(CloudSyncSystemReport {
            has_interference,
            findings,
            recommended_safe_vault_root: safe_vault_root,
            scanned_at_ms,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn ensure_path_is_allowed_user_dir(target: &std::path::Path) -> Result<PathBuf, String> {
    let resolved = crate::utils::resolve_canonical_target(target)?;
    if crate::utils::is_blocked_sensitive_or_system_path(&resolved) {
        return Err("Refusing to operate on a protected system directory.".into());
    }
    let coords = crate::commands::state_ops::get_saved_coordinates();
    let mut allowed_roots = crate::utils::get_allowed_workspace_roots(&coords);
    for user_dir in [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
    ]
    .into_iter()
    .flatten()
    {
        allowed_roots.push(user_dir);
    }
    if allowed_roots.is_empty() {
        return Err("No allowed user or workspace roots resolved.".into());
    }
    crate::utils::ensure_path_within_roots(&resolved, &allowed_roots)?;
    Ok(resolved)
}

#[tauri::command]
pub async fn pin_cloud_folder_local_hydration(
    path: String,
    _state: tauri::State<'_, crate::AppState>,
) -> Result<CloudHydrationPinResult, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<CloudHydrationPinResult, String> {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid folder path.".into());
        }
        let target = PathBuf::from(trimmed);
        if !target.exists() {
            return Err("Target folder does not exist on disk.".into());
        }
        let resolved = ensure_path_is_allowed_user_dir(&target)?;

        let mut pinned_count = 0usize;
        let mut skipped_symlinks = 0usize;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use std::os::windows::process::CommandExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::{
                GetFileAttributesW, SetFileAttributesW, FILE_FLAGS_AND_ATTRIBUTES,
                INVALID_FILE_ATTRIBUTES,
            };
            const FILE_ATTRIBUTE_PINNED: u32 = 0x0008_0000;
            const FILE_ATTRIBUTE_UNPINNED: u32 = 0x0010_0000;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            let pin_entry = |entry_path: &std::path::Path| -> bool {
                let wide: Vec<u16> = entry_path
                    .as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    let current = GetFileAttributesW(PCWSTR(wide.as_ptr()));
                    if current == INVALID_FILE_ATTRIBUTES {
                        return false;
                    }
                    let next = (current | FILE_ATTRIBUTE_PINNED) & !FILE_ATTRIBUTE_UNPINNED;
                    SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(next))
                        .is_ok()
                }
            };

            if !crate::utils::is_symlink_or_reparse_point(&resolved) && pin_entry(&resolved) {
                pinned_count += 1;
            }

            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if p == resolved {
                    continue;
                }
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if pin_entry(p) {
                    pinned_count += 1;
                }
            }

            // Apply folder-level attrib +P -U on the root directory itself (never recursive /S so symlinks remain untouched)
            let _ = std::process::Command::new("attrib")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["+P", "-U"])
                .arg(&resolved)
                .status();
        }

        #[cfg(target_os = "macos")]
        {
            let mut walker = walkdir::WalkDir::new(&resolved).follow_links(false).into_iter();
            while let Some(Ok(entry)) = walker.next() {
                let p = entry.path();
                if crate::utils::is_symlink_or_reparse_point(p) {
                    skipped_symlinks += 1;
                    if entry.file_type().is_dir() {
                        walker.skip_current_dir();
                    }
                    continue;
                }
                if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                    if fname.to_lowercase().ends_with(".icloud") {
                        if std::process::Command::new("brctl")
                            .args(["download"])
                            .arg(p)
                            .status()
                            .map(|s| s.success())
                            .unwrap_or(false)
                        {
                            pinned_count += 1;
                        }
                    }
                }
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = &resolved;
        }

        Ok(CloudHydrationPinResult {
            pinned_count,
            skipped_symlinks,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn copy_dir_non_destructive_skip_symlinks(
    src_root: &std::path::Path,
    dst_root: &std::path::Path,
) -> Result<(usize, u64), String> {
    let mut copied_files = 0usize;
    let mut copied_bytes = 0u64;
    let mut walker = walkdir::WalkDir::new(src_root).follow_links(false).into_iter();
    while let Some(Ok(entry)) = walker.next() {
        let path = entry.path();
        if path == src_root {
            continue;
        }
        if crate::utils::is_symlink_or_reparse_point(path) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }
        let Ok(rel) = path.strip_prefix(src_root) else {
            continue;
        };
        let target = dst_root.join(rel);
        if entry.file_type().is_dir() {
            let _ = std::fs::create_dir_all(&target);
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if !target.exists() {
                let bytes = std::fs::copy(path, &target).map_err(|e| {
                    format!(
                        "Failed copying {:?} -> {:?}: {}",
                        path.file_name().unwrap_or_default(),
                        target,
                        e
                    )
                })?;
                copied_files += 1;
                copied_bytes = copied_bytes.saturating_add(bytes);
            }
        }
    }
    Ok((copied_files, copied_bytes))
}

#[tauri::command]
pub async fn relocate_master_vault_with_consent(
    source_vault_path: String,
    destination_vault_path: String,
    copy_existing_files: bool,
    wipe_active_symlinks_first: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<VaultRelocationResult, String> {
    let dest_trimmed = destination_vault_path.trim().to_string();
    if dest_trimmed.is_empty() || dest_trimmed.eq_ignore_ascii_case("web") {
        return Err("Destination folder path cannot be empty.".into());
    }

    let active_schema_for_wipe = if wipe_active_symlinks_first {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    } else {
        None
    };

    tauri::async_runtime::spawn_blocking(move || -> Result<VaultRelocationResult, String> {
        if wipe_active_symlinks_first {
            let _ = crate::commands::deployment::wipe_symlinks_sync(&active_schema_for_wipe);
        }
        let dest_raw = PathBuf::from(&dest_trimmed);
        if !dest_raw.is_absolute() {
            return Err("Destination folder must be an absolute local path.".into());
        }
        if crate::utils::is_blocked_sensitive_or_system_path(&dest_raw) {
            return Err("Destination folder points to a protected system directory.".into());
        }
        if let Some(cloud_info) = detect_cloud_provider_for_path(&dest_raw) {
            return Err(format!(
                "Destination folder is also inside {} ({}). Choose a local non-synced folder.",
                cloud_info.provider, cloud_info.resolved_path
            ));
        }

        let src_trimmed = source_vault_path.trim();
        let src_resolved = if !src_trimmed.is_empty() && !src_trimmed.eq_ignore_ascii_case("web") {
            let sp = PathBuf::from(src_trimmed);
            let canon_src = crate::utils::resolve_canonical_target(&sp)?;
            if crate::utils::is_blocked_sensitive_or_system_path(&canon_src) {
                return Err("Source folder points to a protected system or sensitive directory.".into());
            }
            let current_global = crate::commands::state_ops::get_global_config();
            if let Some(configured_mv) = current_global
                .vault_path
                .as_deref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            {
                let canon_mv = crate::utils::resolve_canonical_target(std::path::Path::new(configured_mv))
                    .unwrap_or_else(|_| PathBuf::from(configured_mv));
                if !crate::utils::path_is_within_root(&canon_src, &canon_mv) {
                    return Err("Source vault path does not match the currently configured Sanctuary Vault.".into());
                }
            }
            canon_src
        } else {
            PathBuf::new()
        };

        let dest_clean = crate::utils::strip_windows_verbatim_prefix(&dest_raw);
        if !src_resolved.as_os_str().is_empty()
            && (path_starts_with_root(&dest_clean, &src_resolved)
                || path_starts_with_root(&src_resolved, &dest_clean))
        {
            return Err(
                "Destination folder cannot overlap or be nested inside the current storage root."
                    .into(),
            );
        }

        std::fs::create_dir_all(dest_clean.join("Data").join("Themes"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;
        std::fs::create_dir_all(dest_clean.join("Data").join("Lexicons"))
            .map_err(|e| format!("Failed creating destination folder: {}", e))?;

        let (copied_files_count, copied_bytes) =
            if copy_existing_files && !src_resolved.as_os_str().is_empty() && src_resolved.is_dir()
            {
                copy_dir_non_destructive_skip_symlinks(&src_resolved, &dest_clean)?
            } else {
                (0usize, 0u64)
            };

        let new_master_str = dest_clean.to_string_lossy().to_string();
        let mut global_cfg = crate::commands::state_ops::get_global_config();
        global_cfg.vault_path = Some(new_master_str.clone());
        crate::commands::state_ops::save_coordinates(global_cfg)?;
        invalidate_known_cloud_roots_cache();
        let updated_coords = crate::commands::state_ops::get_saved_coordinates();

        Ok(VaultRelocationResult {
            new_master_vault_path: new_master_str,
            new_active_vault_path: updated_coords.vault_path,
            copied_files_count,
            copied_bytes,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn apply_cloud_sync_folder_exclusion(
    target_path: String,
    provider: String,
    cloud_root_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let trimmed = target_path.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
            return Err("Invalid target folder path.".into());
        }
        let target_raw = crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(trimmed));
        if crate::utils::is_blocked_sensitive_or_system_path(&target_raw) {
            return Err("Refusing to modify a protected system directory.".into());
        }
        if !target_raw.exists() {
            let parent = target_raw
                .parent()
                .ok_or_else(|| "Target parent folder does not exist.".to_string())?;
            if !parent.exists() {
                return Err("Target folder and its parent do not exist on disk yet.".into());
            }
            let _ = ensure_path_is_allowed_user_dir(parent)?;
            std::fs::create_dir_all(&target_raw)
                .map_err(|e| format!("Failed creating folder for sync exclusion: {}", e))?;
        }
        let canon_target = ensure_path_is_allowed_user_dir(&target_raw)?;
        let prov = provider.trim();

        if prov == "Dropbox" {
            #[cfg(target_os = "windows")]
            {
                let ads_path = format!(
                    "{}:com.dropbox.ignored",
                    canon_target.to_string_lossy().trim_end_matches(&['\\', '/'][..])
                );
                std::fs::write(&ads_path, b"1")
                    .map_err(|e| format!("Failed writing Dropbox ignore stream: {}", e))?;
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(target_os = "macos")]
            {
                let status = std::process::Command::new("xattr")
                    .args(["-w", "com.dropbox.ignored", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking xattr: {}", e))?;
                if !status.success() {
                    return Err("xattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                let status = std::process::Command::new("setfattr")
                    .args(["-n", "user.com.dropbox.ignored", "-v", "1"])
                    .arg(&canon_target)
                    .status()
                    .map_err(|e| format!("Failed invoking setfattr: {}", e))?;
                if !status.success() {
                    return Err("setfattr exited with a non-zero status.".into());
                }
                invalidate_known_cloud_roots_cache();
                return Ok(prov.to_string());
            }
        }

        let Some(rel_ignore_file) = ignore_file_rel_for_provider(prov) else {
            return Err(format!(
                "{} does not support native folder-ignore exclusion files.",
                prov
            ));
        };

        let base_root = if let Some(ref raw_root) = cloud_root_path {
            let root_trimmed = raw_root.trim();
            if !root_trimmed.is_empty() {
                let root_p =
                    crate::utils::strip_windows_verbatim_prefix(std::path::Path::new(root_trimmed));
                if let Ok(canon_root) = ensure_path_is_allowed_user_dir(&root_p) {
                    if path_starts_with_root(&canon_target, &canon_root)
                        && normalize_cloud_cmp_path(&canon_target)
                            != normalize_cloud_cmp_path(&canon_root)
                    {
                        canon_root
                    } else {
                        canon_target
                            .parent()
                            .map(|p| p.to_path_buf())
                            .unwrap_or_else(|| canon_target.clone())
                    }
                } else {
                    canon_target
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| canon_target.clone())
                }
            } else {
                canon_target
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| canon_target.clone())
            }
        } else {
            canon_target
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| canon_target.clone())
        };

        let rel_pattern = canon_target
            .strip_prefix(&base_root)
            .ok()
            .map(|r| r.to_string_lossy().replace('\\', "/").trim_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                canon_target
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| "Could not determine relative folder name to exclude.".to_string())?;

        let ignore_file = base_root.join(rel_ignore_file);
        if let Some(parent) = ignore_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let existing = std::fs::read_to_string(&ignore_file).unwrap_or_default();
        if !check_ignore_list_contains_target(&ignore_file, &base_root, &canon_target) {
            let mut next_content = existing;
            if !next_content.is_empty() && !next_content.ends_with('\n') {
                next_content.push('\n');
            }
            let entry = if prov == "Syncthing" || prov == "Nextcloud" || prov == "ownCloud" {
                format!("/{}\n", rel_pattern)
            } else {
                format!("{}\n", rel_pattern)
            };
            next_content.push_str(&entry);
            std::fs::write(&ignore_file, next_content.as_bytes())
                .map_err(|e| format!("Failed updating {}: {}", rel_ignore_file, e))?;
        }

        invalidate_known_cloud_roots_cache();
        Ok(prov.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_cloud_sync_provider_settings(
    provider: String,
    target_path: Option<String>,
    cloud_root_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let p_lower = provider.trim().to_lowercase();
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            if p_lower.contains("google") {
                for env_var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
                    let Ok(base) = std::env::var(env_var) else {
                        continue;
                    };
                    let dfs_dir = PathBuf::from(&base).join("Google").join("Drive File Stream");
                    let direct_exe = dfs_dir.join("GoogleDriveFS.exe");
                    // GoogleDriveFS.exe defines `--preferences` as a key:value config override flag
                    // (causing "ERROR: Missing the value for the flag 'preferences'"); the official
                    // Start Menu shortcut launches GoogleDriveFS.exe with zero arguments to open/focus UI.
                    if direct_exe.is_file() && std::process::Command::new(&direct_exe).spawn().is_ok()
                    {
                        return Ok(());
                    }
                    if let Ok(entries) = std::fs::read_dir(&dfs_dir) {
                        let mut ver_dirs: Vec<PathBuf> = entries
                            .flatten()
                            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                            .map(|e| e.path())
                            .collect();
                        ver_dirs.sort_by(|a, b| b.cmp(a));
                        for ver_dir in ver_dirs {
                            let ver_exe = ver_dir.join("GoogleDriveFS.exe");
                            if ver_exe.is_file()
                                && std::process::Command::new(&ver_exe).spawn().is_ok()
                            {
                                return Ok(());
                            }
                        }
                    }
                }
            }

            if p_lower.contains("onedrive") {
                for base in [
                    std::env::var("LOCALAPPDATA").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let od_exe = PathBuf::from(base)
                        .join("Microsoft")
                        .join("OneDrive")
                        .join("OneDrive.exe");
                    if od_exe.exists() {
                        if std::process::Command::new(&od_exe)
                            .arg("/settings")
                            .spawn()
                            .is_ok()
                        {
                            return Ok(());
                        }
                    }
                }
                if std::process::Command::new("cmd")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["/c", "start", "ms-settings:backup"])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }

            if p_lower.contains("dropbox") {
                for base in [
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let db_exe = PathBuf::from(base)
                        .join("Dropbox")
                        .join("Client")
                        .join("Dropbox.exe");
                    if db_exe.is_file() && std::process::Command::new(&db_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("nextcloud") {
                for base in [
                    std::env::var("ProgramFiles").ok(),
                    std::env::var("ProgramFiles(x86)").ok(),
                    std::env::var("LOCALAPPDATA").ok(),
                ]
                .into_iter()
                .flatten()
                {
                    let nc_exe = PathBuf::from(base).join("Nextcloud").join("nextcloud.exe");
                    if nc_exe.is_file() && std::process::Command::new(&nc_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }

            if p_lower.contains("mega") {
                if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
                    let mega_exe = PathBuf::from(local_app)
                        .join("MEGAsync")
                        .join("MEGAsync.exe");
                    if mega_exe.is_file() && std::process::Command::new(&mega_exe).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let mac_app = if p_lower.contains("google") {
                Some("Google Drive")
            } else if p_lower.contains("onedrive") {
                Some("OneDrive")
            } else if p_lower.contains("dropbox") {
                Some("Dropbox")
            } else if p_lower.contains("nextcloud") {
                Some("Nextcloud")
            } else if p_lower.contains("mega") {
                Some("MEGAsync")
            } else {
                None
            };
            if let Some(app_name) = mac_app {
                if std::process::Command::new("open")
                    .args(["-a", app_name])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
            if p_lower.contains("icloud") {
                if std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preferences.AppleIDPrefPane")
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
        }

        let _ = p_lower;
        for raw_opt in [cloud_root_path, target_path] {
            if let Some(raw_target) = raw_opt {
                let trimmed = raw_target.trim();
                if !trimmed.is_empty() {
                    let mut candidate = PathBuf::from(trimmed);
                    while !candidate.exists() {
                        let Some(parent) = candidate.parent() else {
                            break;
                        };
                        candidate = parent.to_path_buf();
                    }
                    if candidate.exists() {
                        return open_folder(candidate.to_string_lossy().to_string());
                    }
                }
            }
        }

        Err("Could not open cloud provider settings automatically.".into())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}


