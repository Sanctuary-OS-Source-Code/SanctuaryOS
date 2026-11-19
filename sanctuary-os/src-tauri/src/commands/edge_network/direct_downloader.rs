use sha2::{Digest, Sha256};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime};
use tauri::Emitter;

const MAX_DIRECT_DOWNLOAD_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const STALE_DOWNLOAD_TTL_SECS: u64 = 1800;

fn prune_stale_download_staging_dirs() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !name_str.starts_with("sanctuary_dl_") {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let is_stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|mtime| now.duration_since(mtime).ok())
            .map(|age| age.as_secs() >= STALE_DOWNLOAD_TTL_SECS)
            .unwrap_or(false);
        if is_stale {
            let _ = std::fs::remove_dir_all(path);
        }
    }
}

fn percent_decode_utf8(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn parse_content_disposition_filename(header_val: &str) -> Option<String> {
    for part in header_val.split(';') {
        let trimmed = part.trim();
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("filename*=") {
            let rhs = trimmed[10..].trim().trim_matches('"');
            let encoded = if let Some((_, rest)) = rhs.split_once("''") {
                rest
            } else {
                rhs
            };
            let decoded = percent_decode_utf8(encoded);
            if !decoded.trim().is_empty() {
                return Some(decoded);
            }
        } else if lower.starts_with("filename=") {
            let rhs = trimmed[9..].trim().trim_matches('"').trim_matches('\'');
            let decoded = percent_decode_utf8(rhs);
            if !decoded.trim().is_empty() {
                return Some(decoded);
            }
        }
    }
    None
}

fn clean_single_filename(raw: &str) -> String {
    let last_seg = raw
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    let cleaned: String = last_seg
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .collect();
    cleaned.trim().trim_start_matches('.').to_string()
}

fn has_valid_extension(name: &str) -> bool {
    std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| !e.trim().is_empty())
        .unwrap_or(false)
}

fn neutral_extension_for_content_type(content_type: Option<&str>) -> &'static str {
    let ct = content_type
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match ct.as_str() {
        "application/zip" | "application/x-zip-compressed" => ".zip",
        "application/x-7z-compressed" => ".7z",
        "application/vnd.rar" | "application/x-rar-compressed" => ".rar",
        _ => ".bin",
    }
}

pub(super) fn sanitize_download_filename(
    url: &url::Url,
    content_disposition: Option<&str>,
    content_type: Option<&str>,
    suggested: Option<&str>,
) -> String {
    let from_suggested = suggested.map(clean_single_filename).filter(|s| !s.is_empty());
    let from_cd = content_disposition
        .and_then(parse_content_disposition_filename)
        .map(|s| clean_single_filename(&s))
        .filter(|s| !s.is_empty());
    let from_url = url
        .path_segments()
        .and_then(|mut segs| segs.rfind(|s| !s.trim().is_empty()))
        .map(percent_decode_utf8)
        .map(|s| clean_single_filename(&s))
        .filter(|s| !s.is_empty());

    let mut chosen = from_suggested
        .filter(|s| has_valid_extension(s))
        .or(from_cd)
        .or(from_url)
        .unwrap_or_else(|| "artifact".to_string());

    if !has_valid_extension(&chosen) {
        chosen.push_str(neutral_extension_for_content_type(content_type));
    }
    if chosen.len() > 160 {
        let ext = std::path::Path::new(&chosen)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_else(|| ".bin".to_string());
        let stem_limit = 160usize.saturating_sub(ext.len());
        let stem = std::path::Path::new(&chosen)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("artifact");
        let truncated_stem: String = stem.chars().take(stem_limit).collect();
        chosen = format!("{}{}", truncated_stem, ext);
    }
    chosen
}

pub(super) fn is_html_gate_preamble(bytes: &[u8]) -> bool {
    let window = &bytes[..bytes.len().min(512)];
    let no_bom = window.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(window);
    let trimmed = std::str::from_utf8(no_bom)
        .unwrap_or_default()
        .trim_start()
        .to_ascii_lowercase();
    trimmed.starts_with("<!doctype html") || trimmed.starts_with("<html")
}

pub(super) struct DownloadStageCleanupGuard {
    pub(super) dir: Option<PathBuf>,
}

impl DownloadStageCleanupGuard {
    pub(super) fn disarm(&mut self) {
        self.dir = None;
    }
}

impl Drop for DownloadStageCleanupGuard {
    fn drop(&mut self) {
        if let Some(ref d) = self.dir {
            let _ = std::fs::remove_dir_all(d);
        }
    }
}

pub(super) async fn download_verified_url_to_temp(
    app: &tauri::AppHandle,
    vault_root: &std::path::Path,
    raw_url: &str,
    expected_sha256: Option<&str>,
    suggested_file_name: Option<&str>,
) -> Result<(DownloadStageCleanupGuard, PathBuf, String), String> {
    prune_stale_download_staging_dirs();

    let (resolved_url, extra_headers) =
        super::api_key_broker::resolve_brokered_download_url(raw_url).await?;
    let parsed_url = super::types::validate_safe_https_url(&resolved_url).await?;

    let mut req = super::types::get_large_transfer_http_client().get(parsed_url.as_str());
    for (k, v) in extra_headers {
        req = req.header(k, v);
    }
    let mut resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        if code == 401 || code == 403 || code == 429 {
            return Err("DIRECT_DOWNLOAD_HTML_GATE".into());
        }
        return Err(format!("HTTP_{}", code));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    if let Some(ref ct) = content_type {
        let ct_low = ct.to_ascii_lowercase();
        if ct_low.contains("text/html") || ct_low.contains("application/xhtml+xml") {
            return Err("DIRECT_DOWNLOAD_HTML_GATE".into());
        }
    }

    let content_disposition = resp
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let total_bytes = resp.content_length();
    if let Some(cl) = total_bytes {
        if cl > MAX_DIRECT_DOWNLOAD_BYTES {
            return Err("FILE_TOO_LARGE".into());
        }
    }
    let temp_root = std::env::temp_dir();
    crate::utils::check_available_disk_space(
        &temp_root,
        total_bytes.unwrap_or(64 * 1024 * 1024),
    )?;
    crate::utils::check_available_disk_space(
        vault_root,
        total_bytes.unwrap_or(64 * 1024 * 1024).saturating_mul(2),
    )?;

    let file_name = sanitize_download_filename(
        &parsed_url,
        content_disposition.as_deref(),
        content_type.as_deref(),
        suggested_file_name,
    );

    let dl_dir = temp_root.join(format!("sanctuary_dl_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dl_dir).map_err(|e| e.to_string())?;
    let cleanup_guard = DownloadStageCleanupGuard {
        dir: Some(dl_dir.clone()),
    };
    let dest_path = dl_dir.join(&file_name);

    let actual_hex: String = {
        let out_file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        let mut writer = BufWriter::new(out_file);
        let mut hasher = Sha256::new();
        let mut downloaded_bytes: u64 = 0;
        let mut checked_first_chunk = false;
        let mut last_emit = Instant::now() - Duration::from_secs(1);

        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            if chunk.is_empty() {
                continue;
            }
            if !checked_first_chunk {
                checked_first_chunk = true;
                if is_html_gate_preamble(&chunk) {
                    drop(writer);
                    return Err("DIRECT_DOWNLOAD_HTML_GATE".into());
                }
            }
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
            if downloaded_bytes > MAX_DIRECT_DOWNLOAD_BYTES {
                drop(writer);
                return Err("FILE_TOO_LARGE".into());
            }
            writer.write_all(&chunk).map_err(|e| e.to_string())?;
            hasher.update(&chunk);

            if last_emit.elapsed() >= Duration::from_millis(150) {
                last_emit = Instant::now();
                let _ = app.emit(
                    "edge-download-progress",
                    serde_json::json!({
                        "url": raw_url,
                        "file_name": file_name,
                        "downloaded_bytes": downloaded_bytes,
                        "total_bytes": total_bytes,
                    }),
                );
            }
        }

        writer.flush().map_err(|e| e.to_string())?;
        let _ = app.emit(
            "edge-download-progress",
            serde_json::json!({
                "url": raw_url,
                "file_name": file_name,
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes.or(Some(downloaded_bytes)),
            }),
        );

        let actual: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect();

        if let Some(exp) = expected_sha256.map(str::trim).filter(|s| !s.is_empty()) {
            if !actual.eq_ignore_ascii_case(exp) {
                drop(writer);
                return Err("SHA256_MISMATCH".into());
            }
        }
        actual
    };

    Ok((cleanup_guard, dest_path, actual_hex))
}

/// Streams an HTTPS mod/edge download (or BYO-API-Key resolved `nxm://` URI) into an ephemeral
/// staging directory, validates size/HTML-gate/SHA-256, emits live `"edge-download-progress"` events,
/// and forwards the downloaded artifact to `ingest_dropped_file`.
#[tauri::command]
pub async fn download_and_ingest_direct_artifact(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::SecurityState>,
    app_state: tauri::State<'_, crate::state::AppState>,
    url: String,
    expected_sha256: Option<String>,
    target_folder: Option<String>,
    force_replace: Option<bool>,
    suggested_file_name: Option<String>,
) -> Result<String, String> {
    let coords = crate::commands::state_ops::get_saved_coordinates();
    if coords.vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }
    let vault_root = crate::utils::get_vault_root_dir(&coords.vault_path);

    let (mut cleanup_guard, dest_path, _) = download_verified_url_to_temp(
        &app,
        &vault_root,
        &url,
        expected_sha256.as_deref(),
        suggested_file_name.as_deref(),
    )
    .await?;

    let ingest_res = crate::commands::library::ingest_dropped_file(
        app,
        state,
        app_state,
        dest_path.to_string_lossy().to_string(),
        force_replace.unwrap_or(false),
        target_folder,
        Some(true),
    )
    .await;

    if matches!(ingest_res, Err(ref code) if code == "DNA_MATCH" || code == "SETTINGS_CONFLICT") {
        // Keep temporary download directory until Replace confirmation resolves (30-min TTL cleans abandoned files)
        cleanup_guard.disarm();
    }

    ingest_res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_download_filenames_and_detects_html_gate_preamble() {
        let u = url::Url::parse("https://cdn.example.org/files/cool%20mod.7z?token=abc").unwrap();
        assert_eq!(
            sanitize_download_filename(&u, None, Some("application/x-7z-compressed"), None),
            "cool mod.7z"
        );

        let traversed = url::Url::parse("https://cdn.example.org/dl").unwrap();
        assert_eq!(
            sanitize_download_filename(
                &traversed,
                Some("attachment; filename=\"../../evil:mod.zip\""),
                Some("application/zip"),
                None,
            ),
            "evilmod.zip"
        );

        let no_ext = url::Url::parse("https://cdn.example.org/download/42").unwrap();
        assert_eq!(
            sanitize_download_filename(&no_ext, None, Some("application/x-rar-compressed"), None),
            "42.rar"
        );

        assert!(is_html_gate_preamble(b"\xEF\xBB\xBF  \n<!DOCTYPE html><html>"));
        assert!(is_html_gate_preamble(b"<html><body>Login</body></html>"));
        assert!(!is_html_gate_preamble(b"PK\x03\x04\x14\x00"));
        assert!(!is_html_gate_preamble(b"7z\xBC\xAF\x27\x1C"));
    }
}
