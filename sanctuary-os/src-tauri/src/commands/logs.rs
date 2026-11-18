use crate::state::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScrubbedLogFile {
    pub file_name: String,
    pub content: String,
    pub modified_epoch: u64,
}

pub fn read_and_scrub_exception_file(log_path: &Path) -> Option<String> {
    use std::io::Read;
    const MAX_EXCEPTION_BYTES: u64 = 5 * 1024 * 1024;
    let file = fs::File::open(log_path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_EXCEPTION_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_EXCEPTION_BYTES || bytes.contains(&0) {
        return None;
    }
    let raw_text = std::str::from_utf8(&bytes).ok()?;
    let max_preview = raw_text.chars().take(512 * 1024).collect::<String>();
    let scrubbed = crate::utils::scrub_user_data_from_log(&max_preview);
    Some(scrubbed)
}

fn collect_exception_log_files(
    root: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
) -> Vec<(String, PathBuf, Option<std::time::SystemTime>)> {
    let mut matched = Vec::new();
    if !root.exists() {
        return matched;
    }

    let walker = WalkDir::new(root)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            let lower = name.to_lowercase();
            if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
                return false;
            }
            true
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let full_path = entry.path().to_path_buf();
        let rel_str = full_path
            .strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");
        if crate::game_logic::is_exception_log(game_schema, &rel_str) {
            let mtime = entry.metadata().ok().and_then(|m| m.modified().ok());
            matched.push((rel_str, full_path, mtime));
        }
    }

    matched
}

fn collect_multi_root_exception_logs(
    config: &WorkspaceConfig,
    game_schema: &Option<crate::schema::GameSchema>,
    override_docs: Option<&str>,
) -> Vec<(String, PathBuf, Option<std::time::SystemTime>)> {
    let mut scan_targets: Vec<(PathBuf, usize)> = Vec::new();
    let mut seen_dirs: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let mut push_dir = |p: PathBuf, depth: usize| {
        if !p.is_dir() {
            return;
        }
        let key = crate::utils::resolve_canonical_target(&p).unwrap_or(p);
        if seen_dirs.insert(key.clone()) {
            scan_targets.push((key, depth));
        }
    };

    let eff_docs = if let Some(ov) = override_docs.map(str::trim).filter(|s| !s.is_empty()) {
        crate::utils::resolve_effective_docs_path_with_override(ov, config, game_schema)
    } else {
        let base_docs = crate::utils::resolve_effective_docs_path(config, game_schema);
        if !base_docs.trim().is_empty() {
            PathBuf::from(base_docs)
        } else {
            PathBuf::new()
        }
    };
    if !eff_docs.as_os_str().is_empty() {
        push_dir(eff_docs, 4);
    }

    if !config.mods_path.trim().is_empty() {
        let mods_dir = PathBuf::from(config.mods_path.trim());
        for sub in ["SKSE", "logs", "Logs"] {
            push_dir(crate::utils::resolve_case_insensitive_path(&mods_dir, sub), 3);
        }
        push_dir(mods_dir, 2);
    }

    let live_root = crate::game_logic::resolve_game_engine_root(&config.live_path, game_schema);
    if !live_root.as_os_str().is_empty() && live_root.is_dir() {
        for sub in ["Logs", "CrashDumps", "r6/logs", "red4ext/logs", "bin"] {
            push_dir(crate::utils::resolve_case_insensitive_path(&live_root, sub), 3);
        }
        push_dir(live_root.clone(), 2);
    }

    let mut local_appdata_roots: Vec<PathBuf> = Vec::new();
    if let Some(dl) = dirs::data_local_dir() {
        local_appdata_roots.push(dl);
    }
    if let Some(steam_res) =
        crate::game_logic::resolve_steam_app_and_proton_prefix(game_schema, Some(&config.live_path))
    {
        if let Some(pfx_user) = steam_res.compatdata_pfx_user_dir {
            local_appdata_roots.push(pfx_user.join("AppData").join("Local"));
        }
    }
    if let Some(schema) = game_schema.as_ref() {
        for folder_name in schema.install_folder_names.iter().flatten() {
            let clean_f = folder_name.trim();
            if clean_f.is_empty() {
                continue;
            }
            for appdata in &local_appdata_roots {
                let game_app = crate::utils::resolve_case_insensitive_path(appdata, clean_f);
                if game_app.is_dir() {
                    for sub in ["Saved/Crashes", "Saved/Logs", "Crashes", "Logs"] {
                        push_dir(crate::utils::resolve_case_insensitive_path(&game_app, sub), 4);
                    }
                    push_dir(game_app, 3);
                }
            }
        }
    }

    let mut seen_files: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    let mut combined = Vec::new();
    for (dir_root, max_depth) in scan_targets {
        let walker = WalkDir::new(&dir_root)
            .max_depth(max_depth)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                if e.depth() == 0 {
                    return true;
                }
                let lower = e.file_name().to_string_lossy().to_lowercase();
                if e.file_type().is_dir() && (lower.starts_with(".sanctuary") || lower == ".git") {
                    return false;
                }
                true
            });
        for entry in walker.flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            let full_path = entry.path().to_path_buf();
            let rel_str = full_path
                .strip_prefix(&dir_root)
                .unwrap_or(&full_path)
                .to_string_lossy()
                .replace('\\', "/");
            if !crate::game_logic::is_exception_log(game_schema, &rel_str) {
                continue;
            }
            let canon = crate::utils::resolve_canonical_target(&full_path)
                .unwrap_or_else(|_| full_path.clone());
            if seen_files.insert(canon) {
                let mtime = entry.metadata().ok().and_then(|m| m.modified().ok());
                combined.push((rel_str, full_path, mtime));
            }
        }
    }
    combined
}

#[tauri::command]
pub async fn get_scrubbed_game_logs(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrubbedLogFile>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::commands::state_ops::get_saved_coordinates();
        let mut results: Vec<ScrubbedLogFile> = Vec::new();
        for (rel_name, full_path, mtime) in
            collect_multi_root_exception_logs(&config, &game_schema, Some(&docs_path))
        {
            let mtime_secs = mtime
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if let Some(scrubbed) = read_and_scrub_exception_file(&full_path) {
                if !crate::game_logic::is_ignored_lab_exception(&game_schema, &rel_name, &scrubbed)
                {
                    results.push(ScrubbedLogFile {
                        file_name: rel_name,
                        content: scrubbed,
                        modified_epoch: mtime_secs,
                    });
                }
            }
        }
        results.sort_by(|a, b| b.modified_epoch.cmp(&a.modified_epoch));
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scan_game_logs(
    docs_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::commands::state_ops::get_saved_coordinates();

        let mut exceptions = Vec::new();
        let mut has_crash = false;

        for (rel_name, full_path, mtime) in
            collect_multi_root_exception_logs(&config, &game_schema, Some(&docs_path))
        {
            if rel_name.to_lowercase().contains("crash") {
                has_crash = true;
            }
            if let Some(modified) = mtime {
                exceptions.push((modified, rel_name, full_path));
            }
        }

        if has_crash {
            for (_mtime, _rel_name, log_path) in &exceptions {
                let _ = read_and_scrub_exception_file(log_path);
            }
            return Ok("crash_detected".into());
        }

        if exceptions.is_empty() {
            return Ok("Clean".into());
        }

        exceptions.sort_by(|a, b| b.0.cmp(&a.0));

        for (_mtime, rel_name, log_path) in &exceptions {
            if let Some(scrubbed) = read_and_scrub_exception_file(log_path) {
                if crate::game_logic::is_ignored_lab_exception(&game_schema, &rel_name, &scrubbed) {
                    continue;
                }
                return Ok(format!("⚠️ EXCEPTION DETECTED: {}", scrubbed));
            }
        }

        Ok("Clean".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CrashSuspectMod {
    pub mod_name: String,
    pub confidence_score: u32,
    pub reason: String,
    pub matched_tokens: Vec<String>,
    pub log_file: String,
    pub line_excerpt: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CrashAutopsyReport {
    pub analyzed_logs: Vec<String>,
    pub suspects: Vec<CrashSuspectMod>,
    pub summary_snippet: String,
}

fn contains_token_case_insensitive(haystack_low: &str, token_low: &str) -> bool {
    if token_low.len() < 4 {
        return false;
    }
    let hb = haystack_low.as_bytes();
    let tb = token_low.as_bytes();
    let mut start = 0usize;
    while let Some(rel) = haystack_low[start..].find(token_low) {
        let idx = start + rel;
        let left_ok = idx == 0 || !hb[idx - 1].is_ascii_alphanumeric();
        let end = idx + tb.len();
        let right_ok = end >= hb.len() || !hb[end].is_ascii_alphanumeric();
        if left_ok && right_ok {
            return true;
        }
        start = idx + 1;
    }
    false
}

pub(crate) fn score_crash_logs_against_candidates(
    logs: &[(String, String)],
    candidates: &[(String, Vec<String>)],
    ignore_tokens_low: &std::collections::HashSet<String>,
) -> Vec<CrashSuspectMod> {
    struct Acc {
        score: u32,
        best_reason: &'static str,
        tokens: std::collections::BTreeSet<String>,
        best_log: String,
        best_line: String,
    }
    let mut by_mod: std::collections::HashMap<String, Acc> = std::collections::HashMap::new();

    for (log_name, content) in logs {
        for raw_line in content.lines().take(2500) {
            let trimmed = raw_line.trim();
            if trimmed.len() < 4 || trimmed.len() > 2048 {
                continue;
            }
            let lower = trimmed.to_ascii_lowercase();
            let is_stack_line = lower.contains("+0x")
                || lower.contains("probablesave")
                || lower.contains("probable call stack")
                || lower.contains("callstack")
                || lower.contains("traceback")
                || lower.contains("stack trace")
                || lower.contains("unhandled exception")
                || lower.contains("exception_access_violation")
                || lower.contains("file:")
                || lower.starts_with("[#")
                || lower.starts_with("at ");
            let is_error_line = is_stack_line
                || lower.contains("error")
                || lower.contains("exception")
                || lower.contains("fatal")
                || lower.contains("crash")
                || lower.contains("failed");

            for (mod_name, tokens) in candidates {
                for tok in tokens {
                    let tok_low = tok.to_ascii_lowercase();
                    if tok_low.len() < 4 || ignore_tokens_low.contains(&tok_low) {
                        continue;
                    }
                    if contains_token_case_insensitive(&lower, &tok_low) {
                        let pts = if is_stack_line {
                            if tok_low.contains('.') { 90 } else { 70 }
                        } else if is_error_line {
                            if tok_low.contains('.') { 68 } else { 52 }
                        } else {
                            20
                        };
                        let reason_str = if is_stack_line {
                            "stack_frame"
                        } else if is_error_line {
                            "error_context"
                        } else {
                            "loaded_module"
                        };
                        let entry = by_mod.entry(mod_name.clone()).or_insert_with(|| Acc {
                            score: 0,
                            best_reason: reason_str,
                            tokens: std::collections::BTreeSet::new(),
                            best_log: log_name.clone(),
                            best_line: trimmed.chars().take(180).collect(),
                        });
                        if pts > entry.score {
                            entry.score = pts;
                            entry.best_reason = reason_str;
                            entry.best_log = log_name.clone();
                            entry.best_line = trimmed.chars().take(180).collect();
                        } else if entry.tokens.insert(tok.clone()) && entry.score < 95 {
                            entry.score = (entry.score + 5).min(99);
                        }
                        entry.tokens.insert(tok.clone());
                    }
                }
            }
        }
    }

    let mut suspects: Vec<CrashSuspectMod> = by_mod
        .into_iter()
        .filter(|(_, acc)| acc.score >= 35)
        .map(|(mod_name, acc)| CrashSuspectMod {
            mod_name,
            confidence_score: acc.score.min(100),
            reason: acc.best_reason.to_string(),
            matched_tokens: acc.tokens.into_iter().take(6).collect(),
            log_file: acc.best_log,
            line_excerpt: acc.best_line,
        })
        .collect();
    suspects.sort_by(|a, b| {
        b.confidence_score
            .cmp(&a.confidence_score)
            .then_with(|| a.mod_name.cmp(&b.mod_name))
    });
    suspects.truncate(8);
    suspects
}

#[tauri::command]
pub async fn analyze_crash_autopsy(
    docs_path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<CrashAutopsyReport, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::commands::state_ops::get_saved_coordinates();
        let mut logs = collect_multi_root_exception_logs(
            &config,
            &game_schema,
            docs_path.as_deref(),
        );
        logs.sort_by(|a, b| b.2.cmp(&a.2));
        logs.truncate(6);

        let mut scrubbed_logs: Vec<(String, String)> = Vec::new();
        for (rel_name, full_path, _) in logs {
            if let Some(scrubbed) = read_and_scrub_exception_file(&full_path) {
                if !crate::game_logic::is_ignored_lab_exception(&game_schema, &rel_name, &scrubbed)
                {
                    scrubbed_logs.push((rel_name, scrubbed));
                }
            }
        }
        if scrubbed_logs.is_empty() {
            return Ok(CrashAutopsyReport::default());
        }

        let mut ignore_tokens_low: std::collections::HashSet<String> = [
            "kernel32.dll",
            "ntdll.dll",
            "ucrtbase.dll",
            "vcruntime140.dll",
            "msvcp140.dll",
            "user32.dll",
            "gdi32.dll",
            "d3d11.dll",
            "dxgi.dll",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        if let Some(schema) = game_schema.as_ref() {
            for exe in &schema.executable_names {
                let low = exe.trim().to_ascii_lowercase();
                if !low.is_empty() {
                    if let Some(stem) = Path::new(&low).file_stem().and_then(|s| s.to_str()) {
                        ignore_tokens_low.insert(stem.to_string());
                    }
                    ignore_tokens_low.insert(low);
                }
            }
        }

        let mut candidates_map: std::collections::HashMap<String, std::collections::BTreeSet<String>> =
            std::collections::HashMap::new();
        if !config.vault_path.trim().is_empty() {
            let vault_mods_lane = crate::utils::get_vault_mods_lane(&config.vault_path);
            if vault_mods_lane.is_dir() {
                for entry in WalkDir::new(&vault_mods_lane)
                    .max_depth(4)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let Ok(rel) = entry.path().strip_prefix(&vault_mods_lane) else {
                        continue;
                    };
                    let mut comps = rel.components().filter_map(|c| match c {
                        std::path::Component::Normal(o) => Some(o.to_string_lossy().to_string()),
                        _ => None,
                    });
                    let Some(owner) = comps.next() else {
                        continue;
                    };
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with(".sanctuary") {
                        continue;
                    }
                    let bucket = candidates_map.entry(owner.clone()).or_default();
                    bucket.insert(owner);
                    bucket.insert(fname.clone());
                    if let Some(stem) = Path::new(&fname).file_stem().and_then(|s| s.to_str()) {
                        if stem.len() >= 4 {
                            bucket.insert(stem.to_string());
                        }
                    }
                }
            }
        }

        let candidates: Vec<(String, Vec<String>)> = candidates_map
            .into_iter()
            .map(|(k, v)| (k, v.into_iter().collect()))
            .collect();
        let suspects =
            score_crash_logs_against_candidates(&scrubbed_logs, &candidates, &ignore_tokens_low);
        let analyzed_logs: Vec<String> = scrubbed_logs.iter().map(|(n, _)| n.clone()).collect();
        let summary_snippet = scrubbed_logs
            .first()
            .map(|(_, c)| c.lines().take(12).collect::<Vec<_>>().join("\n"))
            .unwrap_or_default();

        Ok(CrashAutopsyReport {
            analyzed_logs,
            suspects,
            summary_snippet,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn clear_old_logs(docs_path: String, state: tauri::State<'_, AppState>) {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let config = crate::commands::state_ops::get_saved_coordinates();
    let path =
        crate::utils::resolve_effective_docs_path_with_override(&docs_path, &config, &game_schema);
    if !crate::utils::is_safe_workspace_target_dir(&path) {
        return;
    }

    let allowed = [path.clone()];
    for (_rel_name, log_path, _mtime) in collect_exception_log_files(&path, &game_schema) {
        if crate::utils::ensure_strict_descendant_of_roots(&log_path, &allowed).is_ok() {
            let _ = fs::remove_file(log_path);
        }
    }
}

fn is_safe_telemetry_relative(rel: &str) -> bool {
    let trimmed = rel.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return false;
    }
    let norm = trimmed.replace('\\', "/");
    let p = Path::new(&norm);
    if p.is_absolute() {
        return false;
    }
    p.components().all(|c| matches!(c, std::path::Component::Normal(_)))
}

fn is_allowed_telemetry_log_file(path: &Path) -> bool {
    let Some(name_lower) = path.file_name().and_then(|n| n.to_str()).map(|s| s.to_ascii_lowercase()) else {
        return false;
    };
    if matches!(
        name_lower.as_str(),
        "solder_config.json" | "local_passkey_vault_v2.json" | ".passkey_master_key.bin"
    ) || name_lower.starts_with(".env")
    {
        return false;
    }
    let Some(ext_lower) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) else {
        return false;
    };
    matches!(ext_lower.as_str(), "log" | "txt" | "xml" | "json")
}

#[tauri::command]
pub async fn read_workspace_telemetry_log(
    source_root: String,
    relative_pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let config = crate::commands::state_ops::get_saved_coordinates();
        let mods_dir_str = config.mods_path.trim();
        let docs_dir = crate::utils::resolve_effective_docs_path(&config, &game_schema);

        let trimmed_root = source_root.trim();
        let (base_dir, suffix) = if let Some(rest) = trimmed_root.strip_prefix("%MODS_DIR%") {
            if mods_dir_str.is_empty() {
                return Ok(None);
            }
            (PathBuf::from(mods_dir_str), rest.trim_start_matches(&['/', '\\'][..]))
        } else if let Some(rest) = trimmed_root.strip_prefix("%DOC_DIR%") {
            if docs_dir.trim().is_empty() {
                return Ok(None);
            }
            (PathBuf::from(&docs_dir), rest.trim_start_matches(&['/', '\\'][..]))
        } else {
            return Err("Blocked: Telemetry source root must begin with %MODS_DIR% or %DOC_DIR%.".into());
        };

        let mut search_dir = base_dir.clone();
        if !suffix.is_empty() {
            if !is_safe_telemetry_relative(suffix) {
                return Err("Blocked: Unsafe relative subpath in telemetry source root.".into());
            }
            search_dir = search_dir.join(suffix);
        }

        let pat_trimmed = relative_pattern.trim().replace('\\', "/");
        if pat_trimmed.is_empty() {
            return Ok(None);
        }
        let pat_path = Path::new(&pat_trimmed);
        if pat_path.is_absolute()
            || !pat_path
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Blocked: Unsafe telemetry file pattern.".into());
        }

        let allowed_roots: Vec<PathBuf> = vec![base_dir];
        let direct_target = search_dir.join(pat_path);
        let candidate_file = if direct_target.exists() && direct_target.is_file() {
            direct_target
        } else if pat_trimmed.contains('*') {
            let leaf_pat = pat_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let scan_dir = pat_path
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .map(|p| search_dir.join(p))
                .unwrap_or(search_dir);
            if !scan_dir.is_dir() {
                return Ok(None);
            }
            let _ = crate::utils::ensure_path_within_roots(&scan_dir, &allowed_roots)?;
            let parts: Vec<&str> = leaf_pat.split('*').collect();
            let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
            if let Ok(entries) = fs::read_dir(&scan_dir) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if !ep.is_file() || !is_allowed_telemetry_log_file(&ep) {
                        continue;
                    }
                    let fname = entry.file_name().to_string_lossy().to_ascii_lowercase();
                    let matched = if parts.len() == 2 {
                        fname.starts_with(parts[0])
                            && fname.ends_with(parts[1])
                            && fname.len() >= parts[0].len() + parts[1].len()
                    } else {
                        false
                    };
                    if matched {
                        let mtime = entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .unwrap_or(std::time::UNIX_EPOCH);
                        if best.as_ref().map_or(true, |(t, _)| mtime > *t) {
                            best = Some((mtime, ep));
                        }
                    }
                }
            }
            match best {
                Some((_, p)) => p,
                None => return Ok(None),
            }
        } else {
            return Ok(None);
        };

        let resolved_file =
            crate::utils::ensure_strict_descendant_of_roots(&candidate_file, &allowed_roots)?;
        if !is_allowed_telemetry_log_file(&resolved_file) {
            return Err("Blocked: File type is not permitted for telemetry attachment.".into());
        }

        const MAX_TELEMETRY_LOG_BYTES: u64 = 32 * 1024;
        let Ok(file) = fs::File::open(&resolved_file) else {
            return Ok(None);
        };
        let mut buf = Vec::new();
        if file
            .take(MAX_TELEMETRY_LOG_BYTES)
            .read_to_end(&mut buf)
            .is_err()
        {
            return Ok(None);
        }
        if buf.is_empty() || buf.contains(&0) {
            return Ok(None);
        }
        let raw = String::from_utf8_lossy(&buf);
        let scrubbed = crate::utils::scrub_user_data_from_log(&raw);
        Ok(Some(scrubbed))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_os_log(
    app_handle: tauri::AppHandle,
    message: String,
    level: String,
) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    const MAX_OS_LOG_BYTES: u64 = 5 * 1024 * 1024;
    let level_clean = match level.trim().to_ascii_uppercase().as_str() {
        "ERROR" => "ERROR",
        "WARN" | "WARNING" => "WARNING",
        "INFO" => "INFO",
        "DEBUG" => "DEBUG",
        _ => "INFO",
    };

    if let Ok(log_dir) = app_handle.path().app_log_dir() {
        let _ = std::fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("sanctuary-os.log");
        if let Ok(meta) = fs::metadata(&log_file) {
            if meta.len() >= MAX_OS_LOG_BYTES {
                let rotated = log_dir.join("sanctuary-os.log.1");
                let _ = fs::rename(&log_file, &rotated);
            }
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file) {
            let timestamp = match SystemTime::now().duration_since(UNIX_EPOCH) {
                Ok(n) => n.as_secs().to_string(),
                Err(_) => "vlocal".to_string(),
            };
            let single_line: String = message
                .chars()
                .take(4096)
                .map(|c| if c == '\r' || c == '\n' || c.is_control() { ' ' } else { c })
                .collect();
            let scrubbed_msg = crate::utils::scrub_user_data_from_log(&single_line);
            let _ = writeln!(file, "[{}] [{}]: {}", timestamp, level_clean, scrubbed_msg);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_autopsy_blames_dll_and_plugin_stack_frames() {
        let log_text = r#"
Unhandled exception "EXCEPTION_ACCESS_VIOLATION" at 0x7FF612340000
PROBABLE CALL STACK:
    [0] 0x7FF9AABB1234 CustomCombatTweaks.dll+0x0041C8
    [1] 0x7FF9CCCC5678 kernel32.dll+0x001122
Loaded modules:
    OverhaulHelper.esp
    BenignTexturePack.bsa
"#;
        let logs = vec![("crash-2026-11-18.log".to_string(), log_text.to_string())];
        let candidates = vec![
            (
                "CombatOverhaul".to_string(),
                vec!["CombatOverhaul".to_string(), "CustomCombatTweaks.dll".to_string()],
            ),
            (
                "BenignTextures".to_string(),
                vec!["BenignTextures".to_string(), "BenignTexturePack.bsa".to_string()],
            ),
        ];
        let mut ignore = std::collections::HashSet::new();
        ignore.insert("kernel32.dll".to_string());

        let suspects = score_crash_logs_against_candidates(&logs, &candidates, &ignore);
        assert_eq!(suspects.len(), 1);
        assert_eq!(suspects[0].mod_name, "CombatOverhaul");
        assert_eq!(suspects[0].reason, "stack_frame");
        assert!(suspects[0].confidence_score >= 85);
        assert!(suspects[0]
            .matched_tokens
            .iter()
            .any(|t| t == "CustomCombatTweaks.dll"));
    }

    #[test]
    fn test_read_and_scrub_exception_file_scrubs_in_memory_without_modifying_disk_file() {
        let dir = std::env::temp_dir().join(format!(
            "sanctuary_log_inmem_scrub_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("live_engine_exception.log");
        let original_text =
            "Fatal Error in C:\\Users\\Alice\\Documents\\GameLogs\\script_hook.log\n";
        std::fs::write(&log_path, original_text.as_bytes()).unwrap();

        let scrubbed = read_and_scrub_exception_file(&log_path)
            .expect("should read and scrub valid UTF-8 log");
        assert!(
            !scrubbed.contains("Alice"),
            "Returned log preview must scrub PII usernames in memory"
        );
        let disk_after = std::fs::read_to_string(&log_path).unwrap();
        assert_eq!(
            disk_after, original_text,
            "read_and_scrub_exception_file must NEVER overwrite or sever open game logs on disk"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
