use super::types::{
    get_http_client, parse_bounded_json, read_bounded_response_bytes, validate_safe_https_url,
    EDGE_USER_AGENT,
};
use crate::commands::webauthn::local_passkey_vault;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub const SUPPORTED_BYO_PROVIDERS: [&str; 3] = ["nexus", "curseforge", "modrinth"];

fn normalize_byo_provider(raw: &str) -> Result<String, String> {
    let lower = raw.trim().to_ascii_lowercase();
    match lower.as_str() {
        "nexus" | "nexusmods" => Ok("nexus".to_string()),
        "curseforge" | "cf" => Ok("curseforge".to_string()),
        "modrinth" | "mr" => Ok("modrinth".to_string()),
        _ => Err(format!("Unsupported BYO API key provider: {}", raw)),
    }
}

fn byo_vault_path() -> Result<PathBuf, String> {
    Ok(local_passkey_vault::secure_passkey_dir()?.join("byo_api_keys_v1.json"))
}

pub(crate) fn seal_byo_key_in_map(
    map: &mut HashMap<String, (String, String)>,
    master_key: &[u8; 32],
    provider: &str,
    api_key: &str,
) -> Result<(), String> {
    let norm = normalize_byo_provider(provider)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        map.remove(&norm);
        return Ok(());
    }
    let (nonce_b64, sealed_b64) = local_passkey_vault::seal_private_key_with_key(
        master_key,
        "byo_api_key",
        &norm,
        trimmed.as_bytes(),
    )?;
    map.insert(norm, (nonce_b64, sealed_b64));
    Ok(())
}

pub(crate) fn unseal_byo_key_from_map(
    map: &HashMap<String, (String, String)>,
    master_key: &[u8; 32],
    provider: &str,
) -> Result<Option<String>, String> {
    let norm = normalize_byo_provider(provider)?;
    let Some((nonce_b64, sealed_b64)) = map.get(&norm) else {
        return Ok(None);
    };
    let plain = local_passkey_vault::unseal_private_key_with_key(
        master_key,
        "byo_api_key",
        &norm,
        nonce_b64,
        sealed_b64,
    )?;
    let s = String::from_utf8(plain)
        .map_err(|_| "Corrupted UTF-8 data in sealed BYO API key.".to_string())?;
    let trimmed = s.trim().to_string();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed))
    }
}

fn load_sealed_map() -> HashMap<String, (String, String)> {
    let Ok(path) = byo_vault_path() else {
        return HashMap::new();
    };
    if !path.is_file() {
        return HashMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<HashMap<String, (String, String)>>(&raw).ok())
        .unwrap_or_default()
}

fn build_status_map(map: &HashMap<String, (String, String)>) -> HashMap<String, bool> {
    let mut out = HashMap::new();
    for p in SUPPORTED_BYO_PROVIDERS {
        out.insert(p.to_string(), map.contains_key(p));
    }
    out
}

fn load_unsealed_provider_key(provider: &str) -> Option<String> {
    let norm = normalize_byo_provider(provider).ok()?;
    let map = load_sealed_map();
    if !map.contains_key(&norm) {
        return None;
    }
    let master_key = local_passkey_vault::load_or_create_master_key().ok()?;
    unseal_byo_key_from_map(&map, &master_key, &norm).ok().flatten()
}

#[tauri::command]
pub fn get_byo_api_key_status() -> Result<HashMap<String, bool>, String> {
    let map = load_sealed_map();
    Ok(build_status_map(&map))
}

#[tauri::command]
pub fn set_byo_api_key(provider: String, api_key: String) -> Result<HashMap<String, bool>, String> {
    let path = byo_vault_path()?;
    let mut map = load_sealed_map();
    let master_key = local_passkey_vault::load_or_create_master_key()?;
    seal_byo_key_in_map(&mut map, &master_key, &provider, &api_key)?;
    let serialized = serde_json::to_string_pretty(&map)
        .map_err(|e| format!("Failed serializing BYO API key store: {}", e))?;
    local_passkey_vault::write_restricted_file(&path, serialized.as_bytes())?;
    Ok(build_status_map(&map))
}

#[tauri::command]
pub fn clear_byo_api_key(provider: String) -> Result<HashMap<String, bool>, String> {
    set_byo_api_key(provider, String::new())
}

fn parse_nxm_uri(raw: &str) -> Option<(String, String, String, Option<String>, Option<String>)> {
    let parsed = url::Url::parse(raw.trim()).ok()?;
    if parsed.scheme() != "nxm" {
        return None;
    }
    let domain = parsed.host_str()?.trim().to_string();
    let segs: Vec<String> = parsed
        .path_segments()?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if segs.len() < 4 || !segs[0].eq_ignore_ascii_case("mods") || !segs[2].eq_ignore_ascii_case("files") {
        return None;
    }
    let mod_id = segs[1].clone();
    let file_id = segs[3].clone();
    if !mod_id.chars().all(|c| c.is_ascii_digit()) || !file_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let mut key_param = None;
    let mut expires_param = None;
    for (k, v) in parsed.query_pairs() {
        if k == "key" && !v.trim().is_empty() {
            key_param = Some(v.into_owned());
        } else if k == "expires" && !v.trim().is_empty() {
            expires_param = Some(v.into_owned());
        }
    }
    Some((domain, mod_id, file_id, key_param, expires_param))
}

/// Resolves an incoming download URL (including `nxm://` protocol links and brokered API hosts)
/// into a validated HTTPS CDN URL + optional provider auth headers stored locally by the user.
pub(crate) async fn resolve_brokered_download_url(
    raw_url: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err("DIRECT_DOWNLOAD_HTML_GATE".to_string());
    }

    if trimmed.to_ascii_lowercase().starts_with("nxm://") {
        let Some((domain, mod_id, file_id, key_param, expires_param)) = parse_nxm_uri(trimmed)
        else {
            return Err("DIRECT_DOWNLOAD_HTML_GATE".to_string());
        };
        let Some(api_key) = load_unsealed_provider_key("nexus") else {
            return Err("DIRECT_DOWNLOAD_HTML_GATE".to_string());
        };

        let mut api_url = format!(
            "https://api.nexusmods.com/v1/games/{}/mods/{}/files/{}/download_link.json",
            domain, mod_id, file_id
        );
        if let (Some(k), Some(e)) = (key_param, expires_param) {
            api_url.push_str(&format!("?key={}&expires={}", k, e));
        }
        let validated = validate_safe_https_url(&api_url).await?;
        let resp = get_http_client()
            .get(validated)
            .header("User-Agent", EDGE_USER_AGENT)
            .header("apikey", api_key)
            .header("Application-Name", "SanctuaryOS")
            .header("Application-Version", env!("CARGO_PKG_VERSION"))
            .send()
            .await
            .map_err(|_| "DIRECT_DOWNLOAD_HTML_GATE".to_string())?;
        if !resp.status().is_success() {
            return Err("DIRECT_DOWNLOAD_HTML_GATE".to_string());
        }
        let bytes = read_bounded_response_bytes(resp)
            .await
            .map_err(|_| "DIRECT_DOWNLOAD_HTML_GATE".to_string())?;
        let json_val = parse_bounded_json(&bytes)
            .map_err(|_| "DIRECT_DOWNLOAD_HTML_GATE".to_string())?;
        let cdn_uri = json_val
            .as_array()
            .and_then(|arr| {
                arr.iter().find_map(|item| {
                    item.get("URI")
                        .or_else(|| item.get("uri"))
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|s| s.starts_with("https://"))
                        .map(str::to_string)
                })
            })
            .ok_or_else(|| "DIRECT_DOWNLOAD_HTML_GATE".to_string())?;
        return Ok((cdn_uri, Vec::new()));
    }

    let Ok(parsed) = url::Url::parse(trimmed) else {
        return Ok((trimmed.to_string(), Vec::new()));
    };
    let mut extra_headers = Vec::new();
    if let Some(host) = parsed.host_str() {
        let host_low = host.to_ascii_lowercase();
        if host_low == "api.curseforge.com" {
            if let Some(cf_key) = load_unsealed_provider_key("curseforge") {
                extra_headers.push(("x-api-key".to_string(), cf_key));
            }
        } else if host_low == "api.modrinth.com" || host_low == "cdn.modrinth.com" {
            if let Some(mr_key) = load_unsealed_provider_key("modrinth") {
                extra_headers.push(("Authorization".to_string(), mr_key));
            }
        } else if host_low == "api.nexusmods.com" {
            if let Some(nx_key) = load_unsealed_provider_key("nexus") {
                extra_headers.push(("apikey".to_string(), nx_key));
            }
        }
    }
    Ok((trimmed.to_string(), extra_headers))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byo_api_keys_roundtrip_with_provider_aad_isolation() {
        let master = [0x5Au8; 32];
        let mut map = HashMap::new();
        seal_byo_key_in_map(&mut map, &master, "nexus", "nx_secret_123").unwrap();
        assert_ne!(map["nexus"].1, "nx_secret_123");
        assert_eq!(
            unseal_byo_key_from_map(&map, &master, "nexus").unwrap().as_deref(),
            Some("nx_secret_123")
        );

        let mut tampered = HashMap::new();
        tampered.insert("curseforge".to_string(), map["nexus"].clone());
        assert!(unseal_byo_key_from_map(&tampered, &master, "curseforge").is_err());

        seal_byo_key_in_map(&mut map, &master, "nexus", "").unwrap();
        assert!(!map.contains_key("nexus"));
    }

    #[test]
    fn parses_nxm_protocol_links_strictly() {
        let parsed = parse_nxm_uri("nxm://skyrimspecialedition/mods/1234/files/5678?key=abc&expires=999").unwrap();
        assert_eq!(parsed.0, "skyrimspecialedition");
        assert_eq!(parsed.1, "1234");
        assert_eq!(parsed.2, "5678");
        assert_eq!(parsed.3.as_deref(), Some("abc"));
        assert_eq!(parsed.4.as_deref(), Some("999"));
        assert!(parse_nxm_uri("nxm://game/mods/badid/files/5").is_none());
    }
}
