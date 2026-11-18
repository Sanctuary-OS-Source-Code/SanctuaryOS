#![allow(unused_imports)]
use super::file_ops::open_folder;
use super::{cloud_sync_guard::*};
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

pub(super) fn normalize_cloud_cmp_path(path: &std::path::Path) -> String {
    let cleaned = crate::utils::strip_windows_verbatim_prefix(path);
    let s = cleaned.to_string_lossy().replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if cfg!(target_os = "windows") || cfg!(target_os = "macos") {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn path_starts_with_root(candidate: &std::path::Path, root: &std::path::Path) -> bool {
    let c = normalize_cloud_cmp_path(candidate);
    let r = normalize_cloud_cmp_path(root);
    if c.is_empty() || r.is_empty() {
        return false;
    }
    c == r || c.starts_with(&format!("{}/", r))
}

pub(super) static KNOWN_CLOUD_ROOTS_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(std::time::Instant, Vec<(PathBuf, String)>)>>,
> = std::sync::OnceLock::new();

pub fn invalidate_known_cloud_roots_cache() {
    if let Some(mtx) = KNOWN_CLOUD_ROOTS_CACHE.get() {
        if let Ok(mut guard) = mtx.lock() {
            *guard = None;
        }
    }
}

pub(super) struct TempProbeDirGuard(PathBuf);
impl Drop for TempProbeDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(super) fn collect_drivefs_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
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
pub(super) fn collect_windows_registry_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
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
pub(super) fn collect_windows_registry_sync_roots(_push_root: &mut dyn FnMut(PathBuf, &str)) {}

pub(super) fn collect_client_config_sync_roots(push_root: &mut dyn FnMut(PathBuf, &str)) {
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

pub(super) fn collect_known_cloud_sync_roots() -> Vec<(PathBuf, String)> {
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

pub(super) fn match_cloud_provider_segment(segment: &str, prev_segment_lower: &str) -> Option<&'static str> {
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
pub(super) fn check_windows_cloud_filter_flags(path: &std::path::Path) -> (bool, bool, bool, bool) {
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
pub(super) fn check_windows_cloud_filter_flags(_path: &std::path::Path) -> (bool, bool, bool, bool) {
    (false, false, false, false)
}

pub(super) fn decode_desktop_ini_lower(bytes: &[u8]) -> String {
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

pub(super) fn match_provider_from_desktop_ini(ini_path: &std::path::Path) -> Option<&'static str> {
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
