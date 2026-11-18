#![allow(unused_imports)]
use crate::utils::{
    atomic_write_bytes, ensure_path_within_roots, ensure_strict_descendant_of_roots,
    get_vault_mods_lane, get_vault_root_dir, is_mods_dir, is_safe_user_file_path, open_db_conn,
    SANCTUARY_EDGE_MANIFEST_FILE, SANCTUARY_EDGE_OVERRIDE_FILE,
};
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use super::manifest_sync::*;
use super::batch_poller::*;
use super::archive_packager::*;

pub(super) const EDGE_USER_AGENT: &str = "SanctuaryOS/0.6";
pub(super) const MAX_MANIFEST_RESPONSE_BYTES: u64 = 2 * 1024 * 1024; // 2 MiB hard cap
pub(super) const EDGE_POLL_TTL_SECS: i64 = 900; // 15 minutes
pub(super) const EDGE_POLL_CONCURRENCY: usize = 8;

pub(super) static EDGE_HTTP_CLIENT: std::sync::OnceLock<Client> = std::sync::OnceLock::new();

pub fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            let is_cgnat = octets[0] == 100 && (octets[1] & 0b1100_0000) == 64;
            let is_benchmark = octets[0] == 198 && (octets[1] == 18 || octets[1] == 19);
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || octets[0] == 0
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation()
                || is_cgnat
                || is_benchmark
        }
        IpAddr::V6(v6) => {
            if let Some(mapped_v4) = v6.to_ipv4_mapped() {
                if is_forbidden_ip(IpAddr::V4(mapped_v4)) {
                    return true;
                }
            }
            let seg0 = v6.segments()[0];
            let is_unique_local = (seg0 & 0xfe00) == 0xfc00; // fc00::/7
            let is_link_local = (seg0 & 0xffc0) == 0xfe80; // fe80::/10
            let is_doc = seg0 == 0x2001 && v6.segments()[1] == 0x0db8;
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || is_unique_local
                || is_link_local
                || is_doc
        }
    }
}

pub fn validate_safe_https_url_syntax(raw_url: &str) -> Result<url::Url, String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err("Manifest URL is empty.".to_string());
    }
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed.scheme() != "https" {
        return Err("Blocked non-HTTPS URL: only https:// endpoints are permitted.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Blocked URL containing embedded credentials.".to_string());
    }
    let host = parsed
        .host()
        .ok_or_else(|| "URL is missing a valid host.".to_string())?;
    match host {
        url::Host::Ipv4(v4) => {
            if is_forbidden_ip(IpAddr::V4(v4)) {
                return Err(format!("Blocked restricted IPv4 host: {}", v4));
            }
        }
        url::Host::Ipv6(v6) => {
            if is_forbidden_ip(IpAddr::V6(v6)) {
                return Err(format!("Blocked restricted IPv6 host: {}", v6));
            }
        }
        url::Host::Domain(domain) => {
            let lower = domain.trim().trim_end_matches('.').to_ascii_lowercase();
            if lower.is_empty()
                || lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".local")
                || lower.ends_with(".internal")
            {
                return Err(format!("Blocked local/internal hostname: {}", domain));
            }
            if let Ok(ip) = lower.parse::<IpAddr>() {
                if is_forbidden_ip(ip) {
                    return Err(format!("Blocked restricted IP host: {}", ip));
                }
            }
        }
    }
    Ok(parsed)
}

pub(super) async fn validate_safe_https_url(raw_url: &str) -> Result<url::Url, String> {
    let parsed = validate_safe_https_url_syntax(raw_url)?;
    let host_str = parsed
        .host_str()
        .ok_or_else(|| "URL is missing a host string.".to_string())?
        .to_string();
    let port = parsed.port_or_known_default().unwrap_or(443);

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let trimmed_host = host_str.trim_matches(&['[', ']'][..]);
        if let Ok(ip) = trimmed_host.parse::<IpAddr>() {
            if is_forbidden_ip(ip) {
                return Err(format!("Blocked restricted IP address: {}", ip));
            }
            return Ok(());
        }
        let addrs = (trimmed_host, port)
            .to_socket_addrs()
            .map_err(|e| format!("DNS resolution failed for {}: {}", trimmed_host, e))?;
        let mut resolved_any = false;
        for sock in addrs {
            resolved_any = true;
            if is_forbidden_ip(sock.ip()) {
                return Err(format!(
                    "Blocked host {} resolving to private/loopback IP {}",
                    trimmed_host,
                    sock.ip()
                ));
            }
        }
        if !resolved_any {
            return Err(format!("No DNS records resolved for {}", trimmed_host));
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("URL validation join error: {}", e))??;

    Ok(parsed)
}

pub(super) fn get_http_client() -> &'static Client {
    EDGE_HTTP_CLIENT.get_or_init(|| {
        let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("Exceeded maximum redirect depth (5)");
            }
            let target_url = attempt.url().clone();
            match validate_safe_https_url_syntax(target_url.as_str()) {
                Ok(parsed) => {
                    if let Some(host_str) = parsed.host_str() {
                        let clean_host = host_str.trim_matches(&['[', ']'][..]);
                        let port = parsed.port_or_known_default().unwrap_or(443);
                        if let Ok(addrs) = (clean_host, port).to_socket_addrs() {
                            for sock in addrs {
                                if is_forbidden_ip(sock.ip()) {
                                    return attempt
                                        .error("Blocked redirect to private/loopback IP");
                                }
                            }
                        }
                    }
                    attempt.follow()
                }
                Err(msg) => attempt.error(msg),
            }
        });

        Client::builder()
            .user_agent(EDGE_USER_AGENT)
            .redirect(redirect_policy)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

pub(super) async fn read_bounded_response_bytes(mut resp: reqwest::Response) -> Result<Vec<u8>, String> {
    if let Some(len) = resp.content_length() {
        if len > MAX_MANIFEST_RESPONSE_BYTES {
            return Err(format!(
                "Remote response Content-Length ({} bytes) exceeds {} byte limit",
                len, MAX_MANIFEST_RESPONSE_BYTES
            ));
        }
    }
    let mut buf = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Failed reading HTTP response stream: {}", e))?
    {
        if (buf.len() as u64).saturating_add(chunk.len() as u64) > MAX_MANIFEST_RESPONSE_BYTES {
            return Err(format!(
                "Remote response body exceeds {} byte limit",
                MAX_MANIFEST_RESPONSE_BYTES
            ));
        }
        buf.extend_from_slice(&chunk);
    }
    let mut bounded = Vec::with_capacity(buf.len());
    Cursor::new(buf)
        .take(MAX_MANIFEST_RESPONSE_BYTES)
        .read_to_end(&mut bounded)
        .map_err(|e| format!("Bounded stream read error: {}", e))?;
    Ok(bounded)
}

pub(super) fn parse_bounded_json(bytes: &[u8]) -> Result<serde_json::Value, String> {
    let reader = Cursor::new(bytes).take(MAX_MANIFEST_RESPONSE_BYTES);
    serde_json::from_reader(reader).map_err(|e| format!("JSON parsing failed: {}", e))
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeOverride {
    pub artifact_id: String,
    pub mason_id: String,
    pub game_id: String,
    pub manifest_url: String,
    pub target_hash: String,
    pub archive_hashes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fetched_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fetched_metadata: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_polled_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_http_status: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeArtifactMeta {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub game_version: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub compatible_versions: Vec<String>,
    pub release_date: String,
    pub game_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgePayloadMeta {
    pub download_url: String,
    pub sha256: String,
    pub archive_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeModuleEntry {
    pub name: String,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct DependencyRule {
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_version: Option<String>,
}

impl<'de> Deserialize<'de> for DependencyRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawDep {
            Str(String),
            Obj {
                #[serde(default)]
                hash: String,
                #[serde(default)]
                id: Option<String>,
                #[serde(default)]
                name: Option<String>,
                #[serde(default)]
                min_version: Option<String>,
            },
        }
        match RawDep::deserialize(deserializer)? {
            RawDep::Str(s) => Ok(DependencyRule {
                hash: s.clone(),
                id: Some(s.clone()),
                name: Some(s),
                min_version: None,
            }),
            RawDep::Obj {
                hash,
                id,
                name,
                min_version,
            } => {
                let resolved_hash = if !hash.is_empty() {
                    hash
                } else if let Some(ref i) = id {
                    i.clone()
                } else if let Some(ref n) = name {
                    n.clone()
                } else {
                    String::new()
                };
                Ok(DependencyRule {
                    hash: resolved_hash,
                    id,
                    name,
                    min_version,
                })
            }
        }
    }
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ConflictRule {
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub severity: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl<'de> Deserialize<'de> for ConflictRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawConflict {
            Str(String),
            Obj {
                #[serde(default)]
                hash: String,
                #[serde(default)]
                id: Option<String>,
                #[serde(default)]
                name: Option<String>,
                #[serde(default)]
                severity: Option<u8>,
                #[serde(default)]
                tier: Option<u8>,
                #[serde(default)]
                description: Option<String>,
            },
        }
        match RawConflict::deserialize(deserializer)? {
            RawConflict::Str(s) => Ok(ConflictRule {
                hash: s.clone(),
                id: Some(s.clone()),
                name: Some(s),
                severity: 3,
                description: None,
            }),
            RawConflict::Obj {
                hash,
                id,
                name,
                severity,
                tier,
                description,
            } => {
                let resolved_hash = if !hash.is_empty() {
                    hash
                } else if let Some(ref i) = id {
                    i.clone()
                } else if let Some(ref n) = name {
                    n.clone()
                } else {
                    String::new()
                };
                Ok(ConflictRule {
                    hash: resolved_hash,
                    id,
                    name,
                    severity: severity.or(tier).unwrap_or(3),
                    description,
                })
            }
        }
    }
}

pub(super) fn to_highlander_slot_slug(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut prev_dash = false;
    for ch in raw.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct HighlanderSlotRule {
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl<'de> Deserialize<'de> for HighlanderSlotRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawHighlanderSlot {
            Str(String),
            Obj {
                #[serde(default)]
                slug: Option<String>,
                #[serde(default)]
                id: Option<String>,
                #[serde(default)]
                name: Option<String>,
            },
        }
        match RawHighlanderSlot::deserialize(deserializer)? {
            RawHighlanderSlot::Str(s) => {
                let trimmed = s.trim().to_string();
                let slug = to_highlander_slot_slug(&trimmed);
                Ok(HighlanderSlotRule {
                    slug,
                    name: if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    },
                })
            }
            RawHighlanderSlot::Obj { slug, id, name } => {
                let raw_slug = slug
                    .as_deref()
                    .filter(|v| !v.trim().is_empty())
                    .or_else(|| id.as_deref().filter(|v| !v.trim().is_empty()))
                    .or_else(|| name.as_deref().filter(|v| !v.trim().is_empty()))
                    .unwrap_or_default();
                let resolved_slug = to_highlander_slot_slug(raw_slug);
                let resolved_name = name
                    .map(|n| n.trim().to_string())
                    .filter(|n| !n.is_empty());
                Ok(HighlanderSlotRule {
                    slug: resolved_slug,
                    name: resolved_name,
                })
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeAtomicLogic {
    pub required_dlc: Vec<String>,
    pub dependencies: Vec<DependencyRule>,
    pub twins: Vec<String>,
    pub addons: Vec<String>,
    pub conflicts: Vec<ConflictRule>,
    pub flavors: Vec<String>,
    pub collections: Vec<String>,
    #[serde(
        default,
        alias = "exclusive_slot",
        skip_serializing_if = "Option::is_none"
    )]
    pub highlander_group: Option<HighlanderSlotRule>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeVirtualFilesystem {
    pub overrides: Vec<String>,
    pub injected_folders: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgeManifest {
    pub schema_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_url: Option<String>,
    pub artifact: EdgeArtifactMeta,
    pub payload: EdgePayloadMeta,
    #[serde(default)]
    pub modules: Vec<EdgeModuleEntry>,
    #[serde(default)]
    pub current_hashes: Vec<String>,
    pub atomic_logic: EdgeAtomicLogic,
    pub virtual_filesystem: EdgeVirtualFilesystem,
    pub changelog: Vec<String>,
    #[serde(default)]
    pub previous_hashes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgePollTarget {
    pub artifact_id: String,
    pub manifest_url: String,
    pub local_hash: Option<String>,
    pub local_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EdgePollItemResult {
    pub artifact_id: String,
    pub manifest_url: String,
    pub status: String,
    pub http_status: Option<u16>,
    pub manifest: Option<EdgeManifest>,
    pub error: Option<String>,
}

pub(super) fn now_epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(super) fn push_unique_hash(vec: &mut Vec<String>, hash: &str) {
    let trimmed = hash.trim();
    if trimmed.is_empty() {
        return;
    }
    if !vec.iter().any(|h| h.eq_ignore_ascii_case(trimmed)) {
        vec.push(trimmed.to_string());
    }
}

pub(super) fn is_placeholder_manifest_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.is_empty() || lower.contains("your-domain.com") || lower.contains("example.com")
}

pub(super) fn is_non_empty_manifest(m: &EdgeManifest) -> bool {
    !m.artifact.id.trim().is_empty()
        || !m.artifact.name.trim().is_empty()
        || !m.payload.sha256.trim().is_empty()
        || !m.modules.is_empty()
        || !m.current_hashes.is_empty()
}

pub(super) fn manifest_matches_needle(m: &EdgeManifest, needle_lower: &str) -> bool {
    if needle_lower.is_empty() {
        return false;
    }
    m.artifact.id.trim().eq_ignore_ascii_case(needle_lower)
        || m.artifact.name.trim().eq_ignore_ascii_case(needle_lower)
        || m.payload.sha256.trim().eq_ignore_ascii_case(needle_lower)
        || m.current_hashes
            .iter()
            .any(|h| h.trim().eq_ignore_ascii_case(needle_lower))
        || m.modules
            .iter()
            .any(|mod_entry| mod_entry.sha256.trim().eq_ignore_ascii_case(needle_lower))
        || m.previous_hashes
            .iter()
            .any(|h| h.trim().eq_ignore_ascii_case(needle_lower))
}
