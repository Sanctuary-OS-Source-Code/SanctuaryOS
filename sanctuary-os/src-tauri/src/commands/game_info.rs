use crate::commands::state_ops::*;
use crate::state::*;
use crate::utils::*;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn rip_game_version(
    live_path: String,
    game_schema: Option<crate::schema::GameSchema>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let effective_schema = game_schema.or_else(|| {
        state
            .active_schema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    });
    tauri::async_runtime::spawn_blocking(move || {
        rip_game_version_with_schema(&live_path, &effective_schema)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn extract_json_key_version(json_val: &serde_json::Value, key_path: &str) -> Option<String> {
    let mut current = json_val;
    for segment in key_path.split('.').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(segment)?;
            }
            serde_json::Value::Array(arr) => {
                let idx = segment.parse::<usize>().ok()?;
                current = arr.get(idx)?;
            }
            _ => return None,
        }
    }

    let raw = match current {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => return None,
    };
    crate::game_logic::clean_semver_like_version(&raw)
}

fn try_extract_version_from_schema_descriptor(
    live_path: &str,
    root_path: &std::path::Path,
    version_ext: &crate::schema::VersionExtraction,
) -> Option<String> {
    let rel = version_ext.relative_path.trim();
    if rel.is_empty() {
        return None;
    }

    let candidates = [root_path.join(rel), PathBuf::from(live_path).join(rel)];
    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let Ok(content) = fs::read_to_string(&candidate) else {
            continue;
        };

        if let Some(json_key) = version_ext
            .json_key
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(ver) = extract_json_key_version(&parsed, json_key) {
                    return Some(ver);
                }
            }
        }

        let prefix = version_ext.line_prefix.trim();
        if !prefix.is_empty() {
            let prefix_lower = prefix.to_lowercase();
            for line in content.lines() {
                let trimmed_line = line.trim();
                if trimmed_line.to_lowercase().starts_with(&prefix_lower) {
                    let remainder = if let Some(idx) = trimmed_line.find('=') {
                        &trimmed_line[idx + 1..]
                    } else if let Some(idx) = trimmed_line.find(':') {
                        &trimmed_line[idx + 1..]
                    } else {
                        &trimmed_line[prefix.len()..]
                    };
                    if let Some(cleaned) = crate::game_logic::clean_semver_like_version(remainder) {
                        return Some(cleaned);
                    }
                }
            }
        } else if matches!(
            version_ext.method.as_deref(),
            Some("plain_text" | "raw_file" | "text")
        ) {
            if let Some(first_line) = content.lines().map(|l| l.trim()).find(|l| !l.is_empty()) {
                if let Some(cleaned) = crate::game_logic::clean_semver_like_version(first_line) {
                    return Some(cleaned);
                }
            }
        }
    }

    None
}

pub fn rip_game_version_with_schema(
    live_path: &str,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Result<String, String> {
    let root_path = crate::game_logic::resolve_game_engine_root(live_path, game_schema);

    // 1. If schema explicitly configures JSON key extraction, prefer it first so wrapper executables
    // do not shadow authoritative manifest versions (e.g., version.json / info.json / pack.mcmeta).
    if let Some(schema) = game_schema {
        if let Some(version_ext) = &schema.version_extraction {
            let prefers_json = version_ext.method.as_deref() == Some("json_key")
                || version_ext
                    .json_key
                    .as_deref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
            if prefers_json {
                if let Some(ver) =
                    try_extract_version_from_schema_descriptor(live_path, &root_path, version_ext)
                {
                    return Ok(ver);
                }
            }
        }
    }

    // 2. Probe executable PE version header using schema executable_names / executable_subdir
    let mut exe_path = crate::game_logic::resolve_executable_path(live_path, game_schema);

    if exe_path.is_none() {
        let mut search_folder = root_path.clone();
        if let Some(schema) = game_schema {
            if let Some(sub_str) = schema
                .paths
                .executable_subdir
                .as_deref()
                .filter(|s| !s.is_empty())
            {
                let sub = root_path.join(sub_str);
                if sub.exists() {
                    search_folder = sub;
                }
            }
        }

        if let Ok(entries) = fs::read_dir(&search_folder) {
            let mut largest_exe = None;
            let mut max_size = 0;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file()
                    && path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_lowercase())
                        == Some("exe".to_string())
                {
                    if let Some(file_name) = path.file_stem().and_then(|n| n.to_str()) {
                        let name_lower = file_name.to_lowercase();
                        if name_lower.contains("redist")
                            || name_lower.contains("crashhandler")
                            || name_lower.contains("anticheat")
                            || name_lower.contains("unins")
                            || name_lower.contains("setup")
                        {
                            continue;
                        }
                    }
                    if let Ok(metadata) = path.metadata() {
                        if metadata.len() > max_size {
                            max_size = metadata.len();
                            largest_exe = Some(path);
                        }
                    }
                }
            }
            exe_path = largest_exe;
        }
    }

    if let Some(exe) = &exe_path {
        if let Some(version_str) = crate::game_logic::extract_pe_file_version(exe) {
            if !version_str.is_empty() && version_str != "0.0.0.0" {
                return Ok(version_str);
            }
        }
    }

    if let Some(version_str) =
        crate::game_logic::extract_pe_file_version(std::path::Path::new(&live_path))
            .or_else(|| crate::game_logic::extract_pe_file_version(&root_path))
    {
        if !version_str.is_empty() && version_str != "0.0.0.0" {
            return Ok(version_str);
        }
    }

    // 3. Schema-driven text / INI / JSON version extraction fallback
    if let Some(schema) = game_schema {
        if let Some(version_ext) = &schema.version_extraction {
            if let Some(ver) =
                try_extract_version_from_schema_descriptor(live_path, &root_path, version_ext)
            {
                return Ok(ver);
            }
        }
    }

    Err("backend_version_string_empty".into())
}

#[tauri::command]
pub async fn scan_installed_dlc(
    live_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut installed_packs = Vec::new();
        let root = crate::game_logic::resolve_game_engine_root(&live_path, &game_schema);
        let live_path_buf = PathBuf::from(&live_path);

        let mut dirs_to_scan = vec![root.clone()];
        if let Some(schema) = &game_schema {
            if let Some(subs) = &schema.dlc_subdirs {
                for sub in subs {
                    let trimmed = sub.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    for candidate in [root.join(trimmed), live_path_buf.join(trimmed)] {
                        if candidate.exists() && !dirs_to_scan.contains(&candidate) {
                            dirs_to_scan.push(candidate);
                        }
                    }
                }
            }
        }

        let dlc_exts: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.dlc_file_extensions.as_ref())
            .map(|list| {
                list.iter()
                    .map(|e| e.trim_start_matches('.').to_lowercase())
                    .collect()
            })
            .unwrap_or_default();

        for dir in dirs_to_scan {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        if let Ok(name) = entry.file_name().into_string() {
                            let name_up = name.to_uppercase();
                            if crate::game_logic::is_dlc_folder(&game_schema, &name_up)
                                && !installed_packs.contains(&name_up)
                            {
                                installed_packs.push(name_up);
                            }
                        }
                    } else if p.is_file() && !dlc_exts.is_empty() {
                        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                            if dlc_exts.contains(&ext.to_lowercase()) {
                                if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                                    let name_up = stem.to_uppercase();
                                    if crate::game_logic::is_dlc_folder(&game_schema, &name_up)
                                        && !installed_packs.contains(&name_up)
                                    {
                                        installed_packs.push(name_up);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        installed_packs.sort();
        Ok(installed_packs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_heuristic_signatures(vault_path: String) -> Result<Vec<HeuristicSignature>, String> {
    if let Some((content, _)) = crate::utils::get_vault_kv(&vault_path, "malware_signatures") {
        if let Ok(sigs) = serde_json::from_str::<Vec<HeuristicSignature>>(&content) {
            if !sigs.is_empty() {
                return Ok(sigs);
            }
        }
    }

    let now_str = chrono::Local::now().to_rfc3339();
    let default_specs = [
        (
            "discord_com_api_webhooks",
            "discord.com/api/webhooks",
            "file_content_contains",
            "Unauthorized Discord webhook exfiltration.",
        ),
        (
            "discordapp_com_api_webhooks",
            "discordapp.com/api/webhooks",
            "file_content_contains",
            "Legacy Discord webhook exfiltration.",
        ),
        (
            "telegram_bot_exfil",
            "api.telegram.org/bot",
            "file_content_contains",
            "Telegram Bot API credential exfiltration.",
        ),
        (
            "discord_token_leveldb",
            "Local Storage\\leveldb",
            "file_content_contains",
            "Discord/Browser Local Storage LevelDB token harvesting.",
        ),
        (
            "browser_login_data_stealer",
            "User Data\\Default\\Login Data",
            "file_content_contains",
            "Chromium browser SQLite password vault access.",
        ),
        (
            "powershell_encoded_dropper",
            "powershell -enc",
            "file_content_contains",
            "Encoded PowerShell dropper payload.",
        ),
        (
            "powershell_hidden_window",
            "powershell -w hidden",
            "file_content_contains",
            "Hidden PowerShell execution.",
        ),
        (
            "subprocess_popen_powershell",
            "subprocess.Popen( + powershell",
            "file_content_contains",
            "Compound: Spawns PowerShell via subprocess.Popen.",
        ),
        (
            "os_system_powershell",
            "os.system( + powershell",
            "file_content_contains",
            "Compound: Executes PowerShell via os.system.",
        ),
        (
            "os_system_cmd_dropper",
            "os.system( + cmd.exe /c",
            "file_content_contains",
            "Compound: Executes command-prompt chain via os.system.",
        ),
        (
            "b64decode_exec_chain",
            "base64.b64decode( + exec(",
            "file_content_contains",
            "Compound: Base64 payload decode and dynamic exec.",
        ),
        (
            "import_os_system_obfuscated",
            "__import__('os') + system(",
            "file_content_contains",
            "Compound: Obfuscated __import__('os') with system().",
        ),
        ("grabber_py", "grabber.py", "file_name_exact", ""),
        ("stealer_exe", "stealer.exe", "file_name_exact", ""),
        ("_vbs", ".vbs", "file_name_contains", ""),
    ];

    let defaults: Vec<HeuristicSignature> = default_specs
        .into_iter()
        .map(|(id, signature, match_type, notes)| HeuristicSignature {
            id: id.into(),
            signature: signature.into(),
            match_type: match_type.into(),
            severity: "malware".into(),
            source: "system".into(),
            enabled: true,
            created_by: "system".into(),
            created_at: now_str.clone(),
            notes: notes.into(),
        })
        .collect();

    let _ = save_heuristic_signatures(vault_path, defaults.clone());

    Ok(defaults)
}

#[tauri::command]
pub fn save_heuristic_signatures(
    vault_path: String,
    signatures: Vec<HeuristicSignature>,
) -> Result<(), String> {
    if let Some((existing_str, _)) = crate::utils::get_vault_kv(&vault_path, "malware_signatures") {
        if let Ok(existing_sigs) = serde_json::from_str::<Vec<HeuristicSignature>>(&existing_str) {
            if existing_sigs.len() == signatures.len()
                && compute_signatures_version(&existing_sigs)
                    == compute_signatures_version(&signatures)
            {
                return Ok(());
            }
        }
    }
    if let Ok(content) = serde_json::to_string_pretty(&signatures) {
        crate::utils::set_vault_kv(&vault_path, "malware_signatures", &content);
        return Ok(());
    }
    Err("Failed to save heuristic signatures".into())
}

static LAST_WORKBENCH_SAVE_MS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, u64>>,
> = std::sync::OnceLock::new();

fn normalize_history_path_key(path: &str) -> String {
    path.trim().replace('\\', "/").to_lowercase()
}

pub fn mark_workbench_save(path: &str) {
    let now_ms = crate::utils::current_epoch_ms();
    let map_mutex =
        LAST_WORKBENCH_SAVE_MS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(mut map) = map_mutex.lock() {
        map.insert(normalize_history_path_key(path), now_ms);
        if let Some(fname) = std::path::Path::new(path).file_name().and_then(|n| n.to_str()) {
            map.insert(fname.to_lowercase(), now_ms);
        }
    }
}

pub fn was_recently_saved_by_workbench(path: &str, window_ms: u64) -> bool {
    let now_ms = crate::utils::current_epoch_ms();
    let map_mutex =
        LAST_WORKBENCH_SAVE_MS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(map) = map_mutex.lock() {
        let key = normalize_history_path_key(path);
        if let Some(&saved_ms) = map.get(&key) {
            if now_ms.saturating_sub(saved_ms) < window_ms {
                return true;
            }
        }
        if let Some(fname) = std::path::Path::new(path).file_name().and_then(|n| n.to_str()) {
            if let Some(&saved_ms) = map.get(&fname.to_lowercase()) {
                if now_ms.saturating_sub(saved_ms) < window_ms {
                    return true;
                }
            }
        }
    }
    false
}

fn get_file_history_dir(app: &tauri::AppHandle, path: &str) -> Option<PathBuf> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().ok()?;
    let path_hash = format!("{:x}", md5::compute(path));
    Some(app_dir.join("file_history").join(path_hash))
}

fn get_candidate_history_dirs(app: &tauri::AppHandle, path: &str) -> Vec<PathBuf> {
    use tauri::Manager;
    let Ok(app_dir) = app.path().app_data_dir() else {
        return Vec::new();
    };
    let base = app_dir.join("file_history");
    let mut dirs = Vec::new();
    let mut push_unique = |hash_input: &str| {
        let h = format!("{:x}", md5::compute(hash_input));
        let p = base.join(h);
        if !dirs.contains(&p) {
            dirs.push(p);
        }
    };
    push_unique(path);
    push_unique(&path.replace('/', "\\"));
    push_unique(&path.replace('\\', "/"));
    push_unique(&normalize_history_path_key(path));
    dirs
}

fn enforce_file_history_retention(
    file_history_dir: &std::path::Path,
    max_copies: usize,
    max_size_bytes: u64,
) {
    use std::time::SystemTime;
    if let Ok(entries) = std::fs::read_dir(file_history_dir) {
        let mut all_files = Vec::new();
        for p in entries
            .flatten()
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        {
            let path = p.path();
            let is_pinned = std::fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<HistoryEntry>(&content).ok())
                .map(|h| h.pinned.unwrap_or(false))
                .unwrap_or(false);

            let size = path.metadata().map(|m| m.len()).unwrap_or(0);
            let modified = path
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            all_files.push((path, is_pinned, size, modified));
        }

        all_files.sort_by_key(|f| f.3);

        let mut unpinned_count = all_files.iter().filter(|f| !f.1).count();
        let mut unpinned_size: u64 = all_files.iter().filter(|f| !f.1).map(|f| f.2).sum();

        for (path, is_pinned, size, _) in all_files {
            if unpinned_count <= max_copies && unpinned_size <= max_size_bytes {
                break;
            }
            if !is_pinned && std::fs::remove_file(&path).is_ok() {
                unpinned_count = unpinned_count.saturating_sub(1);
                unpinned_size = unpinned_size.saturating_sub(size);
            }
        }
    }
}

pub fn record_in_game_config_snapshot(
    app: &tauri::AppHandle,
    path: &str,
    prior_content: Option<&str>,
    new_content: &str,
) -> Option<u64> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Emitter;

    if new_content.trim().is_empty() {
        return None;
    }

    let config = get_saved_coordinates();
    let max_copies = config.timeline_retention_copies.unwrap_or(50) as usize;
    let max_size_bytes = config.timeline_retention_size_mb.unwrap_or(100) as u64 * 1024 * 1024;
    if max_copies == 0 {
        return None;
    }

    let existing_history = get_file_history(app.clone(), path.to_string()).unwrap_or_default();
    if let Some(latest) = existing_history.iter().max_by_key(|h| h.timestamp) {
        if latest.content == new_content {
            return None;
        }
    }

    let file_history_dir = get_file_history_dir(app, path)?;
    std::fs::create_dir_all(&file_history_dir).unwrap_or_default();

    let mut timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Some(max_existing_ts) = existing_history.iter().map(|h| h.timestamp).max() {
        if timestamp <= max_existing_ts {
            timestamp = max_existing_ts + 1;
        }
    }

    // If no snapshots exist yet and we have the pre-game baseline content, record it first so the user can diff against it
    if existing_history.is_empty() {
        if let Some(prior) = prior_content {
            if !prior.trim().is_empty() && prior != new_content {
                let baseline_ts = timestamp.saturating_sub(1);
                let baseline_file = file_history_dir.join(format!("{}.json", baseline_ts));
                let baseline_entry = HistoryEntry {
                    timestamp: baseline_ts,
                    content: prior.to_string(),
                    pinned: Some(false),
                    name: Some("[Pre-Game Baseline]".to_string()),
                };
                if let Ok(json) = serde_json::to_string(&baseline_entry) {
                    let _ = std::fs::write(&baseline_file, json);
                }
            }
        }
    }

    let history_file = file_history_dir.join(format!("{}.json", timestamp));
    let entry = HistoryEntry {
        timestamp,
        content: new_content.to_string(),
        pinned: Some(false),
        name: Some("[In-Game Engine Edit]".to_string()),
    };

    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = std::fs::write(&history_file, json);
    }

    enforce_file_history_retention(&file_history_dir, max_copies, max_size_bytes);

    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let _ = app.emit(
        "workbench_config_intercepted",
        serde_json::json!({
            "path": path,
            "file_name": file_name,
            "timestamp": timestamp,
            "source": "in_game",
        }),
    );

    Some(timestamp)
}

fn update_history_entry<F>(
    app: &tauri::AppHandle,
    path: &str,
    timestamp: u64,
    mut mutate: F,
    err_msg: &str,
) -> Result<(), String>
where
    F: FnMut(&mut HistoryEntry),
{
    for file_history_dir in get_candidate_history_dirs(app, path) {
        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        if let Ok(content) = std::fs::read_to_string(&history_file) {
            if let Ok(mut h) = serde_json::from_str::<HistoryEntry>(&content) {
                mutate(&mut h);
                if let Ok(json) = serde_json::to_string(&h) {
                    if std::fs::write(&history_file, json).is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }
    Err(err_msg.into())
}

#[tauri::command]
pub fn save_file_with_history(
    app: tauri::AppHandle,
    path: String,
    content: String,
) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    if !crate::utils::is_safe_user_file_path(std::path::Path::new(&path)) {
        return Err("Blocked: Refusing to write to protected system path.".into());
    }

    let prior_disk_content = std::fs::read_to_string(&path).ok();
    mark_workbench_save(&path);
    crate::utils::atomic_write_bytes(std::path::Path::new(&path), content.as_bytes())
        .map_err(|e| format!("Failed to save file: {}", e))?;

    if let Some(file_history_dir) = get_file_history_dir(&app, &path) {
        let config = get_saved_coordinates();
        let max_copies = config.timeline_retention_copies.unwrap_or(50) as usize;
        let max_size_bytes = config.timeline_retention_size_mb.unwrap_or(100) as u64 * 1024 * 1024;

        if max_copies == 0 {
            return Ok("Saved without history".into());
        }

        let existing_history = get_file_history(app.clone(), path.clone()).unwrap_or_default();
        std::fs::create_dir_all(&file_history_dir).unwrap_or_default();

        let mut timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if let Some(max_existing_ts) = existing_history.iter().map(|h| h.timestamp).max() {
            if timestamp <= max_existing_ts {
                timestamp = max_existing_ts + 1;
            }
        }

        if existing_history.is_empty() {
            if let Some(prior) = prior_disk_content.as_deref() {
                if !prior.trim().is_empty() && prior != content {
                    let baseline_ts = timestamp.saturating_sub(1);
                    let baseline_file = file_history_dir.join(format!("{}.json", baseline_ts));
                    let baseline_entry = HistoryEntry {
                        timestamp: baseline_ts,
                        content: prior.to_string(),
                        pinned: Some(false),
                        name: Some("[Pre-Game Baseline]".to_string()),
                    };
                    if let Ok(json) = serde_json::to_string(&baseline_entry) {
                        let _ = std::fs::write(&baseline_file, json);
                    }
                }
            }
        }

        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        let entry = HistoryEntry {
            timestamp,
            content,
            pinned: Some(false),
            name: None,
        };

        if let Ok(json) = serde_json::to_string(&entry) {
            let _ = std::fs::write(&history_file, json);
        }

        enforce_file_history_retention(&file_history_dir, max_copies, max_size_bytes);
    }

    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn save_file_silently(path: String, content: String) -> Result<String, String> {
    if !crate::utils::is_safe_user_file_path(std::path::Path::new(&path)) {
        return Err("Blocked: Refusing to write to protected system path.".into());
    }
    mark_workbench_save(&path);
    crate::utils::atomic_write_bytes(std::path::Path::new(&path), content.as_bytes())
        .map_err(|e| format!("Failed to save file: {}", e))?;
    Ok("Saved successfully".into())
}

#[tauri::command]
pub fn get_file_history(app: tauri::AppHandle, path: String) -> Result<Vec<HistoryEntry>, String> {
    let mut history = Vec::new();
    let mut seen_timestamps = std::collections::HashSet::new();

    for file_history_dir in get_candidate_history_dirs(&app, &path) {
        if file_history_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(file_history_dir) {
                for entry in entries.flatten() {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        if let Ok(h) = serde_json::from_str::<HistoryEntry>(&content) {
                            if seen_timestamps.insert(h.timestamp) {
                                history.push(h);
                            }
                        }
                    }
                }
            }
        }
    }

    history.sort_by(|a, b| {
        let a_pinned = a.pinned.unwrap_or(false);
        let b_pinned = b.pinned.unwrap_or(false);
        if a_pinned != b_pinned {
            b_pinned.cmp(&a_pinned)
        } else {
            b.timestamp.cmp(&a.timestamp)
        }
    });
    Ok(history)
}

#[tauri::command]
pub fn toggle_pin_version(
    app: tauri::AppHandle,
    path: String,
    timestamp: u64,
    pinned: bool,
) -> Result<(), String> {
    update_history_entry(
        &app,
        &path,
        timestamp,
        |h| h.pinned = Some(pinned),
        "Failed to update pin status",
    )
}

#[tauri::command]
pub fn delete_version(app: tauri::AppHandle, path: String, timestamp: u64) -> Result<(), String> {
    let mut deleted = false;
    for file_history_dir in get_candidate_history_dirs(&app, &path) {
        let history_file = file_history_dir.join(format!("{}.json", timestamp));
        if history_file.exists() {
            if std::fs::remove_file(history_file).is_ok() {
                deleted = true;
            }
        }
    }
    if deleted {
        Ok(())
    } else {
        Err("Failed to delete version".into())
    }
}

#[tauri::command]
pub fn rename_version(
    app: tauri::AppHandle,
    path: String,
    timestamp: u64,
    name: String,
) -> Result<(), String> {
    update_history_entry(
        &app,
        &path,
        timestamp,
        |h| h.name = Some(name.clone()),
        "Failed to rename version",
    )
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CloudHijackReport {
    pub is_hijacked: bool,
    pub provider: Option<String>,
    pub detected_path: String,
}

#[tauri::command]
pub fn detect_cloud_hijack(mods_path: String) -> CloudHijackReport {
    let trimmed = mods_path.trim();
    if trimmed.is_empty() {
        return CloudHijackReport {
            is_hijacked: false,
            provider: None,
            detected_path: String::new(),
        };
    }

    let path_obj = PathBuf::from(trimmed);
    let canonical_or_raw = std::fs::canonicalize(&path_obj)
        .unwrap_or_else(|_| path_obj.clone())
        .to_string_lossy()
        .to_string();
    let lower = canonical_or_raw.to_lowercase();

    if lower.contains("onedrive") {
        return CloudHijackReport {
            is_hijacked: true,
            provider: Some("OneDrive".to_string()),
            detected_path: canonical_or_raw,
        };
    }

    if lower.contains("mobile documents")
        || lower.contains("clouddocs")
        || lower.contains("icloud")
    {
        return CloudHijackReport {
            is_hijacked: true,
            provider: Some("iCloud Drive".to_string()),
            detected_path: canonical_or_raw,
        };
    }

    if path_obj.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&path_obj) {
            for entry in entries.flatten() {
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.ends_with(".icloud") {
                    return CloudHijackReport {
                        is_hijacked: true,
                        provider: Some("iCloud Drive".to_string()),
                        detected_path: canonical_or_raw,
                    };
                }
            }
        }
    }

    CloudHijackReport {
        is_hijacked: false,
        provider: None,
        detected_path: canonical_or_raw,
    }
}
