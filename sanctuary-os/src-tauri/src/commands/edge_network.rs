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

const EDGE_USER_AGENT: &str = "SanctuaryOS/0.6";
const MAX_MANIFEST_RESPONSE_BYTES: u64 = 2 * 1024 * 1024; // 2 MiB hard cap
const EDGE_POLL_TTL_SECS: i64 = 900; // 15 minutes
const EDGE_POLL_CONCURRENCY: usize = 8;

static EDGE_HTTP_CLIENT: std::sync::OnceLock<Client> = std::sync::OnceLock::new();

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

async fn validate_safe_https_url(raw_url: &str) -> Result<url::Url, String> {
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

fn get_http_client() -> &'static Client {
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

async fn read_bounded_response_bytes(mut resp: reqwest::Response) -> Result<Vec<u8>, String> {
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

fn parse_bounded_json(bytes: &[u8]) -> Result<serde_json::Value, String> {
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

fn now_epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn push_unique_hash(vec: &mut Vec<String>, hash: &str) {
    let trimmed = hash.trim();
    if trimmed.is_empty() {
        return;
    }
    if !vec.iter().any(|h| h.eq_ignore_ascii_case(trimmed)) {
        vec.push(trimmed.to_string());
    }
}

fn is_placeholder_manifest_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.is_empty() || lower.contains("your-domain.com") || lower.contains("example.com")
}

fn is_non_empty_manifest(m: &EdgeManifest) -> bool {
    !m.artifact.id.trim().is_empty()
        || !m.artifact.name.trim().is_empty()
        || !m.payload.sha256.trim().is_empty()
        || !m.modules.is_empty()
        || !m.current_hashes.is_empty()
}

fn manifest_matches_needle(m: &EdgeManifest, needle_lower: &str) -> bool {
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

pub fn resolve_manifest_from_value(
    raw_value: &serde_json::Value,
    artifact_id: &str,
    local_hash: Option<&str>,
) -> Result<EdgeManifest, String> {
    let id_needle = artifact_id.trim().to_lowercase();
    let hash_needle = local_hash
        .map(|h| h.trim().to_lowercase())
        .unwrap_or_default();

    let candidates_opt = if let Some(arr) = raw_value.as_array() {
        Some(arr)
    } else if let Some(arr) = raw_value.get("artifacts").and_then(|v| v.as_array()) {
        Some(arr)
    } else if let Some(arr) = raw_value.get("manifests").and_then(|v| v.as_array()) {
        Some(arr)
    } else {
        None
    };

    if let Some(candidates) = candidates_opt {
        let mut parsed_list: Vec<EdgeManifest> = Vec::new();
        for item in candidates {
            if let Ok(m) = serde_json::from_value::<EdgeManifest>(item.clone()) {
                if is_non_empty_manifest(&m) {
                    parsed_list.push(m);
                }
            }
        }
        if parsed_list.is_empty() {
            return Err("Catalog contained no valid manifest entries".to_string());
        }
        if !id_needle.is_empty() {
            if let Some(found) = parsed_list
                .iter()
                .find(|m| manifest_matches_needle(m, &id_needle))
            {
                return Ok(found.clone());
            }
        }
        if !hash_needle.is_empty() {
            if let Some(found) = parsed_list
                .iter()
                .find(|m| manifest_matches_needle(m, &hash_needle))
            {
                return Ok(found.clone());
            }
        }
        if parsed_list.len() == 1 && id_needle.is_empty() {
            return Ok(parsed_list.remove(0));
        }
        return Err(format!(
            "Artifact '{}' was not found in remote catalog",
            artifact_id
        ));
    }

    if !raw_value.is_object() {
        return Err("Remote JSON payload is not a manifest object or catalog".to_string());
    }

    let parsed: EdgeManifest =
        serde_json::from_value(raw_value.clone()).map_err(|e| format!("JSON parsing failed: {}", e))?;
    if !is_non_empty_manifest(&parsed) {
        return Err("Remote JSON did not contain valid EdgeManifest fields".to_string());
    }
    Ok(parsed)
}

#[allow(dead_code)]
pub fn parse_manifest_or_catalog(
    raw_value: serde_json::Value,
    artifact_id_or_hash: &str,
) -> Result<EdgeManifest, String> {
    resolve_manifest_from_value(&raw_value, artifact_id_or_hash, None)
}

/// Parses an embedded or dropped `.sanctuary.manifest.json` or `.sanctuary.override.json`, merges extracted
/// file hashes and historical lineage hashes, and auto-registers into SQLite `edge_manifests` when no
/// conflicting URL exists for that artifact.
pub fn auto_ingest_edge_json(
    vault_path: &str,
    raw_json: &str,
    extracted_hashes: &[String],
) -> Option<(EdgeOverride, Option<EdgeManifest>, bool)> {
    let val: serde_json::Value = serde_json::from_str(raw_json).ok()?;
    let is_manifest_doc = val.get("artifact").is_some()
        || val.get("payload").is_some()
        || val.get("atomic_logic").is_some();
    let is_override_doc = val.get("manifest_url").is_some()
        && (val.get("artifact_id").is_some() || val.get("target_hash").is_some());

    if !is_manifest_doc && !is_override_doc {
        return None;
    }

    let mut manifest_opt: Option<EdgeManifest> = None;
    let mut ovr = if is_manifest_doc {
        let mut m: EdgeManifest = serde_json::from_value(val.clone()).ok()?;
        for eh in extracted_hashes {
            push_unique_hash(&mut m.current_hashes, eh);
        }
        if m.payload.sha256.trim().is_empty() {
            if let Some(first_h) = extracted_hashes
                .first()
                .or_else(|| m.modules.first().map(|e| &e.sha256))
                .or_else(|| m.current_hashes.first())
            {
                m.payload.sha256 = first_h.clone();
            }
        }
        for mod_entry in &m.modules {
            push_unique_hash(&mut m.current_hashes, &mod_entry.sha256);
        }
        push_unique_hash(&mut m.current_hashes, &m.payload.sha256);

        let mut all_archive_hashes = Vec::new();
        for h in &m.current_hashes {
            if !h.eq_ignore_ascii_case(&m.payload.sha256) {
                push_unique_hash(&mut all_archive_hashes, h);
            }
        }
        for h in &m.previous_hashes {
            push_unique_hash(&mut all_archive_hashes, h);
        }
        for h in &m.atomic_logic.flavors {
            push_unique_hash(&mut all_archive_hashes, h);
        }

        let raw_url = m
            .manifest_url
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        let resolved_url = if !raw_url.is_empty()
            && !is_placeholder_manifest_url(&raw_url)
            && validate_safe_https_url_syntax(&raw_url).is_err()
        {
            String::new()
        } else {
            raw_url
        };
        let resolved_id = if !m.artifact.id.trim().is_empty() {
            m.artifact.id.trim().to_string()
        } else if !m.artifact.name.trim().is_empty() {
            m.artifact.name.trim().to_string()
        } else {
            m.payload.sha256.clone()
        };

        let meta_str = serde_json::to_string(&m).ok();
        let built = EdgeOverride {
            artifact_id: resolved_id,
            mason_id: m.artifact.author.clone(),
            game_id: m.artifact.game_id.clone(),
            manifest_url: resolved_url,
            target_hash: m.payload.sha256.clone(),
            archive_hashes: all_archive_hashes,
            last_fetched_hash: if m.payload.sha256.is_empty() {
                None
            } else {
                Some(m.payload.sha256.clone())
            },
            last_fetched_metadata: meta_str,
            etag: None,
            last_modified: None,
            last_polled_at: None,
            last_http_status: None,
        };
        manifest_opt = Some(m);
        built
    } else {
        let mut o: EdgeOverride = serde_json::from_value(val).ok()?;
        if !o.manifest_url.trim().is_empty()
            && !is_placeholder_manifest_url(&o.manifest_url)
            && validate_safe_https_url_syntax(&o.manifest_url).is_err()
        {
            o.manifest_url.clear();
        }
        if o.target_hash.trim().is_empty() {
            if let Some(first_h) = extracted_hashes.first() {
                o.target_hash = first_h.clone();
            }
        }
        for eh in extracted_hashes {
            if !eh.eq_ignore_ascii_case(&o.target_hash) {
                push_unique_hash(&mut o.archive_hashes, eh);
            }
        }
        if let Some(ref meta_str) = o.last_fetched_metadata {
            if let Ok(mut m) = serde_json::from_str::<EdgeManifest>(meta_str) {
                for eh in extracted_hashes {
                    push_unique_hash(&mut m.current_hashes, eh);
                }
                manifest_opt = Some(m);
            }
        }
        o
    };

    if vault_path.trim().is_empty() {
        return Some((ovr, manifest_opt, true));
    }

    let conn_arc = match open_db_conn(vault_path) {
        Ok(c) => c,
        Err(_) => return Some((ovr, manifest_opt, true)),
    };
    let conn = match conn_arc.lock() {
        Ok(g) => g,
        Err(_) => return Some((ovr, manifest_opt, true)),
    };

    let existing_row: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT COALESCE(manifest_url, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests
             WHERE artifact_id = ?1 OR (target_hash != '' AND target_hash = ?2)",
            rusqlite::params![ovr.artifact_id, ovr.target_hash],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let mut auto_accepted = true;
    if let Some((existing_url, existing_target, existing_arch_str, existing_meta)) = existing_row {
        if !is_placeholder_manifest_url(&existing_url)
            && !is_placeholder_manifest_url(&ovr.manifest_url)
            && !existing_url.eq_ignore_ascii_case(&ovr.manifest_url)
        {
            auto_accepted = false;
        }
        if is_placeholder_manifest_url(&ovr.manifest_url) && !existing_url.is_empty() {
            ovr.manifest_url = existing_url;
        }
        if !existing_target.is_empty() && !existing_target.eq_ignore_ascii_case(&ovr.target_hash) {
            push_unique_hash(&mut ovr.archive_hashes, &existing_target);
        }
        if let Ok(existing_arch) = serde_json::from_str::<Vec<String>>(&existing_arch_str) {
            for h in existing_arch {
                if !h.eq_ignore_ascii_case(&ovr.target_hash) {
                    push_unique_hash(&mut ovr.archive_hashes, &h);
                }
            }
        }
        if ovr.last_fetched_metadata.is_none() && !existing_meta.is_empty() {
            ovr.last_fetched_metadata = Some(existing_meta);
        }
    }

    if auto_accepted {
        let now = now_epoch_secs();
        let archive_hashes_str =
            serde_json::to_string(&ovr.archive_hashes).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute(
            "INSERT INTO edge_manifests (
                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                last_fetched_hash, last_fetched_metadata, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(artifact_id) DO UPDATE SET
                mason_id = excluded.mason_id,
                manifest_url = excluded.manifest_url,
                target_hash = excluded.target_hash,
                archive_hashes = excluded.archive_hashes,
                game_id = CASE WHEN excluded.game_id != '' THEN excluded.game_id ELSE edge_manifests.game_id END,
                last_fetched_hash = CASE WHEN excluded.last_fetched_hash != '' THEN excluded.last_fetched_hash ELSE edge_manifests.last_fetched_hash END,
                last_fetched_metadata = CASE WHEN excluded.last_fetched_metadata != '' THEN excluded.last_fetched_metadata ELSE edge_manifests.last_fetched_metadata END",
            rusqlite::params![
                ovr.artifact_id,
                ovr.mason_id,
                ovr.manifest_url,
                ovr.target_hash,
                archive_hashes_str,
                ovr.game_id,
                ovr.last_fetched_hash.clone().unwrap_or_default(),
                ovr.last_fetched_metadata.clone().unwrap_or_default(),
                now
            ],
        );
    }

    Some((ovr, manifest_opt, auto_accepted))
}

#[tauri::command]
pub async fn register_edge_override(
    vault_path: String,
    override_data: EdgeOverride,
) -> Result<(), String> {
    if !override_data.manifest_url.trim().is_empty()
        && !is_placeholder_manifest_url(&override_data.manifest_url)
    {
        validate_safe_https_url_syntax(&override_data.manifest_url)?;
    }

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let now = now_epoch_secs();

        let mut merged_archives = override_data.archive_hashes.clone();
        let mut existing_meta = override_data
            .last_fetched_metadata
            .clone()
            .unwrap_or_default();
        let mut existing_fetched_hash =
            override_data.last_fetched_hash.clone().unwrap_or_default();
        let mut preserve_poll_headers = false;

        if let Ok((old_url, old_target, old_archives_str, old_hash, old_meta)) = conn.query_row(
            "SELECT COALESCE(manifest_url, ''), COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_hash, ''), COALESCE(last_fetched_metadata, '')
             FROM edge_manifests WHERE artifact_id = ?1",
            rusqlite::params![override_data.artifact_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        ) {
            preserve_poll_headers = old_url.eq_ignore_ascii_case(override_data.manifest_url.trim());
            if !old_target.is_empty() && !old_target.eq_ignore_ascii_case(&override_data.target_hash) {
                push_unique_hash(&mut merged_archives, &old_target);
            }
            if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&old_archives_str) {
                for h in parsed {
                    if !h.eq_ignore_ascii_case(&override_data.target_hash) {
                        push_unique_hash(&mut merged_archives, &h);
                    }
                }
            }
            if existing_meta.is_empty() && !old_meta.is_empty() {
                existing_meta = old_meta;
            }
            if existing_fetched_hash.is_empty() && !old_hash.is_empty() {
                existing_fetched_hash = old_hash;
            }
        }

        let archive_hashes_str =
            serde_json::to_string(&merged_archives).unwrap_or_else(|_| "[]".to_string());
        if preserve_poll_headers {
            conn.execute(
                "INSERT INTO edge_manifests (
                    artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                    last_fetched_hash, last_fetched_metadata, created_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(artifact_id) DO UPDATE SET
                    mason_id = excluded.mason_id,
                    manifest_url = excluded.manifest_url,
                    target_hash = excluded.target_hash,
                    archive_hashes = excluded.archive_hashes,
                    game_id = excluded.game_id,
                    last_fetched_hash = excluded.last_fetched_hash,
                    last_fetched_metadata = excluded.last_fetched_metadata",
                rusqlite::params![
                    override_data.artifact_id,
                    override_data.mason_id,
                    override_data.manifest_url.trim(),
                    override_data.target_hash,
                    archive_hashes_str,
                    override_data.game_id,
                    existing_fetched_hash,
                    existing_meta,
                    now
                ],
            )
            .map_err(|e| format!("DB Error: {}", e))?;
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO edge_manifests (
                    artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                    last_fetched_hash, last_fetched_metadata, created_at,
                    etag, last_modified, last_polled_at, last_http_status
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, NULL, NULL)",
                rusqlite::params![
                    override_data.artifact_id,
                    override_data.mason_id,
                    override_data.manifest_url.trim(),
                    override_data.target_hash,
                    archive_hashes_str,
                    override_data.game_id,
                    existing_fetched_hash,
                    existing_meta,
                    now
                ],
            )
            .map_err(|e| format!("DB Error: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn finalize_synced_manifest(
    mut manifest: EdgeManifest,
    manifest_url: &str,
    existing_target_hash: &str,
    existing_archive_str: &str,
) -> (EdgeManifest, String, String, String) {
    if manifest.manifest_url.is_none() {
        manifest.manifest_url = Some(manifest_url.to_string());
    }
    for mod_entry in &manifest.modules {
        push_unique_hash(&mut manifest.current_hashes, &mod_entry.sha256);
    }
    push_unique_hash(&mut manifest.current_hashes, &manifest.payload.sha256);

    let mut archive_hashes: Vec<String> =
        serde_json::from_str(existing_archive_str).unwrap_or_default();
    if !existing_target_hash.is_empty()
        && !existing_target_hash.eq_ignore_ascii_case(&manifest.payload.sha256)
    {
        push_unique_hash(&mut archive_hashes, existing_target_hash);
        if !manifest
            .current_hashes
            .iter()
            .any(|ch| ch.eq_ignore_ascii_case(existing_target_hash))
        {
            push_unique_hash(&mut manifest.previous_hashes, existing_target_hash);
        }
    }
    for h in &manifest.previous_hashes {
        push_unique_hash(&mut archive_hashes, h);
    }
    for h in &manifest.current_hashes {
        if !h.eq_ignore_ascii_case(&manifest.payload.sha256) {
            push_unique_hash(&mut archive_hashes, h);
        }
    }

    let metadata_str = serde_json::to_string(&manifest).unwrap_or_default();
    let updated_archive_str =
        serde_json::to_string(&archive_hashes).unwrap_or_else(|_| "[]".to_string());
    let new_target_hash = if !manifest.payload.sha256.is_empty() {
        manifest.payload.sha256.clone()
    } else {
        existing_target_hash.to_string()
    };

    (manifest, metadata_str, new_target_hash, updated_archive_str)
}

#[tauri::command]
pub async fn fetch_and_sync_edge_manifest(
    vault_path: String,
    artifact_id: String,
) -> Result<EdgeManifest, String> {
    let vp_lookup = vault_path.clone();
    let aid_lookup = artifact_id.clone();
    let (
        resolved_artifact_id,
        manifest_url,
        existing_target_hash,
        existing_archive_str,
        cached_meta_str,
        cached_etag,
        cached_last_mod,
    ): (
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
    ) = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let conn_arc = open_db_conn(&vp_lookup)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let like_pattern = format!("%\"{}\"%", aid_lookup);
        conn.query_row(
            "SELECT artifact_id, manifest_url, COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                    COALESCE(last_fetched_metadata, ''), etag, last_modified
             FROM edge_manifests
             WHERE artifact_id = ?1 OR target_hash = ?1 OR archive_hashes LIKE ?2",
            rusqlite::params![aid_lookup, like_pattern],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5).ok().flatten(),
                    row.get(6).ok().flatten(),
                ))
            },
        )
        .map_err(|e| format!("Edge manifest not found: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    if is_placeholder_manifest_url(&manifest_url) {
        return Err("Placeholder manifest URL cannot be polled".to_string());
    }

    let validated_url = validate_safe_https_url(&manifest_url).await?;
    let cached_manifest_opt = if !cached_meta_str.trim().is_empty() {
        serde_json::from_str::<EdgeManifest>(&cached_meta_str)
            .ok()
            .filter(is_non_empty_manifest)
    } else {
        None
    };

    let client = get_http_client();
    let mut req = client
        .get(validated_url)
        .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT);
    if cached_manifest_opt.is_some() {
        if let Some(ref et) = cached_etag {
            if !et.trim().is_empty() {
                req = req.header(reqwest::header::IF_NONE_MATCH, et.trim());
            }
        }
        if let Some(ref lm) = cached_last_mod {
            if !lm.trim().is_empty() {
                req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm.trim());
            }
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    let status = resp.status();
    let status_code = status.as_u16() as i64;
    let now = now_epoch_secs();

    if status == reqwest::StatusCode::NOT_MODIFIED {
        let vp_upd = vault_path.clone();
        let rid = resolved_artifact_id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(conn_arc) = open_db_conn(&vp_upd) {
                if let Ok(conn) = conn_arc.lock() {
                    let _ = conn.execute(
                        "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = 304 WHERE artifact_id = ?2",
                        rusqlite::params![now, rid],
                    );
                }
            }
        })
        .await;
        if let Some(cached) = cached_manifest_opt {
            return Ok(cached);
        }
        return Err("Remote returned 304 Not Modified without local cached metadata".to_string());
    }

    if !status.is_success() {
        let vp_upd = vault_path.clone();
        let rid = resolved_artifact_id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(conn_arc) = open_db_conn(&vp_upd) {
                if let Ok(conn) = conn_arc.lock() {
                    let _ = conn.execute(
                        "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = ?2 WHERE artifact_id = ?3",
                        rusqlite::params![now, status_code, rid],
                    );
                }
            }
        })
        .await;
        return Err(format!(
            "Remote manifest server returned HTTP {}",
            status.as_u16()
        ));
    }

    let new_etag = resp
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or(cached_etag);
    let new_last_modified = resp
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or(cached_last_mod);

    let body_bytes = read_bounded_response_bytes(resp).await?;
    let raw_val = parse_bounded_json(&body_bytes)?;
    let raw_manifest = resolve_manifest_from_value(
        &raw_val,
        &resolved_artifact_id,
        if existing_target_hash.is_empty() {
            None
        } else {
            Some(existing_target_hash.as_str())
        },
    )?;

    let (manifest, metadata_str, new_target_hash, updated_archive_str) = finalize_synced_manifest(
        raw_manifest,
        &manifest_url,
        &existing_target_hash,
        &existing_archive_str,
    );

    let payload_sha = manifest.payload.sha256.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        conn.execute(
            "UPDATE edge_manifests
             SET last_fetched_hash = ?1,
                 last_fetched_metadata = ?2,
                 target_hash = ?3,
                 archive_hashes = ?4,
                 etag = ?5,
                 last_modified = ?6,
                 last_polled_at = ?7,
                 last_http_status = ?8
             WHERE artifact_id = ?9",
            rusqlite::params![
                payload_sha,
                metadata_str,
                new_target_hash,
                updated_archive_str,
                new_etag,
                new_last_modified,
                now,
                status_code,
                resolved_artifact_id
            ],
        )
        .map_err(|e| format!("Failed to update cache: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(manifest)
}

#[derive(Clone, Default)]
struct CachedEdgeRow {
    artifact_id: String,
    mason_id: String,
    manifest_url: String,
    game_id: String,
    target_hash: String,
    archive_hashes_str: String,
    last_fetched_metadata: String,
    etag: Option<String>,
    last_modified: Option<String>,
    last_polled_at: Option<i64>,
    last_http_status: Option<i64>,
}

enum UrlFetchOutcome {
    NotModified,
    OkJson {
        value: serde_json::Value,
        http_status: u16,
        etag: Option<String>,
        last_modified: Option<String>,
    },
    HttpError {
        http_status: u16,
        message: String,
    },
    TransportError {
        message: String,
    },
}

fn manifest_indicates_update(manifest: &EdgeManifest, target: &EdgePollTarget) -> bool {
    if let Some(ref lh) = target.local_hash {
        let lh_trim = lh.trim();
        if !lh_trim.is_empty() {
            let matches_current = (!manifest.payload.sha256.trim().is_empty()
                && manifest.payload.sha256.trim().eq_ignore_ascii_case(lh_trim))
                || manifest
                    .current_hashes
                    .iter()
                    .any(|h| h.trim().eq_ignore_ascii_case(lh_trim))
                || manifest
                    .modules
                    .iter()
                    .any(|m| m.sha256.trim().eq_ignore_ascii_case(lh_trim));
            if matches_current {
                return false;
            }
            if !manifest.payload.sha256.trim().is_empty() || !manifest.current_hashes.is_empty() {
                return true;
            }
        }
    }
    if let Some(ref lv) = target.local_version {
        let lv_clean = lv.trim().trim_start_matches(&['v', 'V'][..]);
        let rv_clean = manifest
            .artifact
            .version
            .trim()
            .trim_start_matches(&['v', 'V'][..]);
        if !lv_clean.is_empty() && !rv_clean.is_empty() && !lv_clean.eq_ignore_ascii_case(rv_clean)
        {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn poll_edge_manifests_batch(
    vault_path: String,
    game_id: String,
    targets: Vec<EdgePollTarget>,
    force: Option<bool>,
) -> Result<Vec<EdgePollItemResult>, String> {
    if targets.is_empty() {
        return Ok(Vec::new());
    }
    let force_poll = force.unwrap_or(false);
    let now = now_epoch_secs();

    let vp_load = vault_path.clone();
    let cached_rows: HashMap<String, CachedEdgeRow> =
        tauri::async_runtime::spawn_blocking(move || -> Result<HashMap<String, CachedEdgeRow>, String> {
            let conn_arc = open_db_conn(&vp_load)?;
            let conn = conn_arc
                .lock()
                .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT artifact_id, mason_id, manifest_url, COALESCE(game_id, ''),
                            COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                            COALESCE(last_fetched_metadata, ''), etag, last_modified,
                            last_polled_at, last_http_status
                     FROM edge_manifests",
                )
                .map_err(|e| format!("DB query prepare error: {}", e))?;
            let iter = stmt
                .query_map([], |row| {
                    Ok(CachedEdgeRow {
                        artifact_id: row.get(0)?,
                        mason_id: row.get(1)?,
                        manifest_url: row.get(2)?,
                        game_id: row.get(3)?,
                        target_hash: row.get(4)?,
                        archive_hashes_str: row.get(5)?,
                        last_fetched_metadata: row.get(6)?,
                        etag: row.get(7).ok().flatten(),
                        last_modified: row.get(8).ok().flatten(),
                        last_polled_at: row.get(9).ok().flatten(),
                        last_http_status: row.get(10).ok().flatten(),
                    })
                })
                .map_err(|e| format!("DB query error: {}", e))?;
            let mut map = HashMap::new();
            for r in iter.flatten() {
                map.insert(r.artifact_id.clone(), r);
            }
            Ok(map)
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    // Pre-resolve effective URLs and identify unique URLs requiring network fetch vs TTL cache hits
    struct PreparedTarget {
        target: EdgePollTarget,
        effective_url: String,
        url_key: String,
        cached_row: Option<CachedEdgeRow>,
        cached_manifest: Option<EdgeManifest>,
        needs_network: bool,
    }

    let mut prepared: Vec<PreparedTarget> = Vec::with_capacity(targets.len());
    // Track per-URL conditional request eligibility: only send If-None-Match / If-Modified-Since
    // for a URL if ALL network-bound targets sharing that URL already have valid cached manifests!
    let mut unique_urls: Vec<String> = Vec::new();
    let mut url_all_have_cache: HashMap<String, bool> = HashMap::new();
    let mut url_cond_headers: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();

    for t in targets {
        let cached_row = cached_rows.get(&t.artifact_id).cloned();
        let effective_url = if !t.manifest_url.trim().is_empty() {
            t.manifest_url.trim().to_string()
        } else {
            cached_row
                .as_ref()
                .map(|r| r.manifest_url.trim().to_string())
                .unwrap_or_default()
        };

        if is_placeholder_manifest_url(&effective_url) {
            prepared.push(PreparedTarget {
                target: t,
                effective_url,
                url_key: String::new(),
                cached_row,
                cached_manifest: None,
                needs_network: false,
            });
            continue;
        }

        let url_key = effective_url.to_lowercase();
        let same_url_as_cached = cached_row
            .as_ref()
            .map(|r| r.manifest_url.trim().eq_ignore_ascii_case(&effective_url))
            .unwrap_or(false);

        let cached_manifest = if same_url_as_cached {
            cached_row
                .as_ref()
                .and_then(|r| {
                    if r.last_fetched_metadata.trim().is_empty() {
                        None
                    } else {
                        serde_json::from_str::<EdgeManifest>(&r.last_fetched_metadata).ok()
                    }
                })
                .filter(is_non_empty_manifest)
        } else {
            None
        };

        let within_ttl = !force_poll
            && same_url_as_cached
            && cached_manifest.is_some()
            && cached_row
                .as_ref()
                .and_then(|r| r.last_polled_at)
                .map(|ts| ts > 0 && now.saturating_sub(ts) < EDGE_POLL_TTL_SECS)
                .unwrap_or(false);

        let needs_network = !within_ttl;
        if needs_network {
            if !url_all_have_cache.contains_key(&url_key) {
                unique_urls.push(effective_url.clone());
                url_all_have_cache.insert(url_key.clone(), true);
            }
            if cached_manifest.is_none() {
                url_all_have_cache.insert(url_key.clone(), false);
            } else if let Some(ref cr) = cached_row {
                url_cond_headers
                    .entry(url_key.clone())
                    .or_insert_with(|| (cr.etag.clone(), cr.last_modified.clone()));
            }
        }

        prepared.push(PreparedTarget {
            target: t,
            effective_url,
            url_key,
            cached_row,
            cached_manifest,
            needs_network,
        });
    }

    // Fetch each unique manifest/catalog URL at most once with Semaphore(8)
    let sem = Arc::new(tokio::sync::Semaphore::new(EDGE_POLL_CONCURRENCY));
    let mut join_set = Vec::with_capacity(unique_urls.len());

    for raw_url in unique_urls {
        let key = raw_url.to_lowercase();
        let allow_cond = url_all_have_cache.get(&key).copied().unwrap_or(false);
        let (etag_opt, last_mod_opt) = if allow_cond {
            url_cond_headers.remove(&key).unwrap_or((None, None))
        } else {
            (None, None)
        };
        let sem_clone = sem.clone();

        join_set.push(tokio::spawn(async move {
            let _permit = sem_clone.acquire_owned().await;
            let validated = match validate_safe_https_url(&raw_url).await {
                Ok(u) => u,
                Err(err_msg) => {
                    return (
                        key,
                        UrlFetchOutcome::TransportError { message: err_msg },
                    );
                }
            };

            let client = get_http_client();
            let mut req = client
                .get(validated)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT);
            if let Some(ref et) = etag_opt {
                if !et.trim().is_empty() {
                    req = req.header(reqwest::header::IF_NONE_MATCH, et.trim());
                }
            }
            if let Some(ref lm) = last_mod_opt {
                if !lm.trim().is_empty() {
                    req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm.trim());
                }
            }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    return (
                        key,
                        UrlFetchOutcome::TransportError {
                            message: format!("HTTP request failed: {}", e),
                        },
                    );
                }
            };

            let status = resp.status();
            let code = status.as_u16();
            if status == reqwest::StatusCode::NOT_MODIFIED {
                return (key, UrlFetchOutcome::NotModified);
            }
            if !status.is_success() {
                return (
                    key,
                    UrlFetchOutcome::HttpError {
                        http_status: code,
                        message: format!("Remote server returned HTTP {}", code),
                    },
                );
            }

            let resp_etag = resp
                .headers()
                .get(reqwest::header::ETAG)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .or(etag_opt);
            let resp_last_mod = resp
                .headers()
                .get(reqwest::header::LAST_MODIFIED)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .or(last_mod_opt);

            let bytes = match read_bounded_response_bytes(resp).await {
                Ok(b) => b,
                Err(msg) => {
                    return (key, UrlFetchOutcome::TransportError { message: msg });
                }
            };
            match parse_bounded_json(&bytes) {
                Ok(val) => (
                    key,
                    UrlFetchOutcome::OkJson {
                        value: val,
                        http_status: code,
                        etag: resp_etag,
                        last_modified: resp_last_mod,
                    },
                ),
                Err(msg) => (key, UrlFetchOutcome::TransportError { message: msg }),
            }
        }));
    }

    let mut outcomes: HashMap<String, UrlFetchOutcome> = HashMap::with_capacity(join_set.len());
    for handle in join_set {
        if let Ok((k, outcome)) = handle.await {
            outcomes.insert(k, outcome);
        }
    }

    // Resolve each target independently (including multi-mod catalog.json entries) and collect DB writes
    enum DbMutation {
        Touch304 {
            artifact_id: String,
            polled_at: i64,
        },
        RecordHttpFailure {
            artifact_id: String,
            polled_at: i64,
            http_status: Option<i64>,
        },
        UpsertSuccess {
            artifact_id: String,
            mason_id: String,
            manifest_url: String,
            game_id: String,
            target_hash: String,
            archive_hashes_str: String,
            last_fetched_hash: String,
            metadata_str: String,
            etag: Option<String>,
            last_modified: Option<String>,
            polled_at: i64,
            http_status: i64,
        },
    }

    let mut results: Vec<EdgePollItemResult> = Vec::with_capacity(prepared.len());
    let mut mutations: Vec<DbMutation> = Vec::new();

    for item in prepared {
        if item.url_key.is_empty() {
            results.push(EdgePollItemResult {
                artifact_id: item.target.artifact_id,
                manifest_url: item.effective_url,
                status: "skipped".to_string(),
                http_status: None,
                manifest: None,
                error: None,
            });
            continue;
        }

        if !item.needs_network {
            if let Some(cached_m) = item.cached_manifest {
                let st = if manifest_indicates_update(&cached_m, &item.target) {
                    "update_available"
                } else {
                    "cached"
                };
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: st.to_string(),
                    http_status: item
                        .cached_row
                        .as_ref()
                        .and_then(|r| r.last_http_status)
                        .and_then(|c| u16::try_from(c).ok()),
                    manifest: Some(cached_m),
                    error: None,
                });
                continue;
            }
        }

        match outcomes.get(&item.url_key) {
            Some(UrlFetchOutcome::NotModified) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::Touch304 {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                    });
                }
                if let Some(cached_m) = item.cached_manifest {
                    let st = if manifest_indicates_update(&cached_m, &item.target) {
                        "update_available"
                    } else {
                        "not_modified"
                    };
                    results.push(EdgePollItemResult {
                        artifact_id: item.target.artifact_id,
                        manifest_url: item.effective_url,
                        status: st.to_string(),
                        http_status: Some(304),
                        manifest: Some(cached_m),
                        error: None,
                    });
                } else {
                    results.push(EdgePollItemResult {
                        artifact_id: item.target.artifact_id,
                        manifest_url: item.effective_url,
                        status: "error".to_string(),
                        http_status: Some(304),
                        manifest: None,
                        error: Some(
                            "Received 304 Not Modified without cached manifest metadata".to_string(),
                        ),
                    });
                }
            }
            Some(UrlFetchOutcome::HttpError {
                http_status,
                message,
            }) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::RecordHttpFailure {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                        http_status: Some(*http_status as i64),
                    });
                }
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: Some(*http_status),
                    manifest: None,
                    error: Some(message.clone()),
                });
            }
            Some(UrlFetchOutcome::TransportError { message }) => {
                if item.cached_row.is_some() {
                    mutations.push(DbMutation::RecordHttpFailure {
                        artifact_id: item.target.artifact_id.clone(),
                        polled_at: now,
                        http_status: None,
                    });
                }
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: None,
                    manifest: None,
                    error: Some(message.clone()),
                });
            }
            Some(UrlFetchOutcome::OkJson {
                value,
                http_status,
                etag,
                last_modified,
            }) => {
                let fallback_hash = item
                    .target
                    .local_hash
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| {
                        item.cached_row
                            .as_ref()
                            .map(|r| r.target_hash.as_str())
                            .filter(|s| !s.trim().is_empty())
                    });

                match resolve_manifest_from_value(value, &item.target.artifact_id, fallback_hash) {
                    Ok(raw_manifest) => {
                        let existing_target = item
                            .cached_row
                            .as_ref()
                            .map(|r| r.target_hash.as_str())
                            .or_else(|| item.target.local_hash.as_deref())
                            .unwrap_or("");
                        let existing_arch = item
                            .cached_row
                            .as_ref()
                            .map(|r| r.archive_hashes_str.as_str())
                            .unwrap_or("[]");

                        let (manifest, metadata_str, new_target_hash, updated_archive_str) =
                            finalize_synced_manifest(
                                raw_manifest,
                                &item.effective_url,
                                existing_target,
                                existing_arch,
                            );

                        let mason_id = if !manifest.artifact.author.trim().is_empty() {
                            manifest.artifact.author.trim().to_string()
                        } else {
                            item.cached_row
                                .as_ref()
                                .map(|r| r.mason_id.clone())
                                .unwrap_or_default()
                        };
                        let resolved_game_id = if !game_id.trim().is_empty() {
                            game_id.trim().to_string()
                        } else if !manifest.artifact.game_id.trim().is_empty() {
                            manifest.artifact.game_id.trim().to_string()
                        } else {
                            item.cached_row
                                .as_ref()
                                .map(|r| r.game_id.clone())
                                .unwrap_or_default()
                        };

                        mutations.push(DbMutation::UpsertSuccess {
                            artifact_id: item.target.artifact_id.clone(),
                            mason_id,
                            manifest_url: item.effective_url.clone(),
                            game_id: resolved_game_id,
                            target_hash: new_target_hash,
                            archive_hashes_str: updated_archive_str,
                            last_fetched_hash: manifest.payload.sha256.clone(),
                            metadata_str,
                            etag: etag.clone(),
                            last_modified: last_modified.clone(),
                            polled_at: now,
                            http_status: *http_status as i64,
                        });

                        let st = if manifest_indicates_update(&manifest, &item.target) {
                            "update_available"
                        } else {
                            "up_to_date"
                        };
                        results.push(EdgePollItemResult {
                            artifact_id: item.target.artifact_id,
                            manifest_url: item.effective_url,
                            status: st.to_string(),
                            http_status: Some(*http_status),
                            manifest: Some(manifest),
                            error: None,
                        });
                    }
                    Err(parse_err) => {
                        if item.cached_row.is_some() {
                            mutations.push(DbMutation::RecordHttpFailure {
                                artifact_id: item.target.artifact_id.clone(),
                                polled_at: now,
                                http_status: Some(*http_status as i64),
                            });
                        }
                        results.push(EdgePollItemResult {
                            artifact_id: item.target.artifact_id,
                            manifest_url: item.effective_url,
                            status: "error".to_string(),
                            http_status: Some(*http_status),
                            manifest: None,
                            error: Some(parse_err),
                        });
                    }
                }
            }
            None => {
                results.push(EdgePollItemResult {
                    artifact_id: item.target.artifact_id,
                    manifest_url: item.effective_url,
                    status: "error".to_string(),
                    http_status: None,
                    manifest: None,
                    error: Some("Polling worker did not return an outcome".to_string()),
                });
            }
        }
    }

    if !mutations.is_empty() {
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let conn_arc = open_db_conn(&vault_path)?;
            let mut conn = conn_arc
                .lock()
                .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
            let tx = conn
                .transaction()
                .map_err(|e| format!("Failed to begin DB transaction: {}", e))?;
            for m in mutations {
                match m {
                    DbMutation::Touch304 {
                        artifact_id,
                        polled_at,
                    } => {
                        let _ = tx.execute(
                            "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = 304 WHERE artifact_id = ?2",
                            rusqlite::params![polled_at, artifact_id],
                        );
                    }
                    DbMutation::RecordHttpFailure {
                        artifact_id,
                        polled_at,
                        http_status,
                    } => {
                        let _ = tx.execute(
                            "UPDATE edge_manifests SET last_polled_at = ?1, last_http_status = COALESCE(?2, last_http_status) WHERE artifact_id = ?3",
                            rusqlite::params![polled_at, http_status, artifact_id],
                        );
                    }
                    DbMutation::UpsertSuccess {
                        artifact_id,
                        mason_id,
                        manifest_url,
                        game_id,
                        target_hash,
                        archive_hashes_str,
                        last_fetched_hash,
                        metadata_str,
                        etag,
                        last_modified,
                        polled_at,
                        http_status,
                    } => {
                        let _ = tx.execute(
                            "INSERT INTO edge_manifests (
                                artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                                last_fetched_hash, last_fetched_metadata, created_at,
                                etag, last_modified, last_polled_at, last_http_status
                             )
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                             ON CONFLICT(artifact_id) DO UPDATE SET
                                mason_id = excluded.mason_id,
                                manifest_url = excluded.manifest_url,
                                target_hash = excluded.target_hash,
                                archive_hashes = excluded.archive_hashes,
                                game_id = CASE WHEN excluded.game_id != '' THEN excluded.game_id ELSE edge_manifests.game_id END,
                                last_fetched_hash = excluded.last_fetched_hash,
                                last_fetched_metadata = excluded.last_fetched_metadata,
                                etag = excluded.etag,
                                last_modified = excluded.last_modified,
                                last_polled_at = excluded.last_polled_at,
                                last_http_status = excluded.last_http_status",
                            rusqlite::params![
                                artifact_id,
                                mason_id,
                                manifest_url,
                                target_hash,
                                archive_hashes_str,
                                game_id,
                                last_fetched_hash,
                                metadata_str,
                                polled_at,
                                etag,
                                last_modified,
                                polled_at,
                                http_status
                            ],
                        );
                    }
                }
            }
            tx.commit()
                .map_err(|e| format!("Failed to commit poll batch: {}", e))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_all_edge_manifests(
    vault_path: String,
    game_id: Option<String>,
) -> Result<Vec<EdgeOverride>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<EdgeOverride>, String> {
        let conn_arc = open_db_conn(&vault_path)?;
        let conn = conn_arc
            .lock()
            .map_err(|_| "Failed to lock Vault database connection.".to_string())?;
        let gid_param = game_id.map(|g| g.trim().to_string());
        let mut stmt = conn
            .prepare(
                "SELECT artifact_id, mason_id, manifest_url, COALESCE(game_id, ''),
                        COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'),
                        last_fetched_hash, last_fetched_metadata,
                        etag, last_modified, last_polled_at, last_http_status
                 FROM edge_manifests
                 WHERE (?1 IS NULL OR ?1 = '' OR game_id = ?1)",
            )
            .map_err(|e| format!("{}", e))?;
        let iter = stmt
            .query_map(rusqlite::params![gid_param], |row| {
                let archive_str: String = row.get(5).unwrap_or_else(|_| "[]".to_string());
                let archive_hashes: Vec<String> =
                    serde_json::from_str(&archive_str).unwrap_or_default();
                Ok(EdgeOverride {
                    artifact_id: row.get(0)?,
                    mason_id: row.get(1)?,
                    manifest_url: row.get(2)?,
                    game_id: row.get(3).unwrap_or_default(),
                    target_hash: row.get(4).unwrap_or_default(),
                    archive_hashes,
                    last_fetched_hash: row.get(6).ok(),
                    last_fetched_metadata: row.get(7).ok(),
                    etag: row.get(8).ok().flatten(),
                    last_modified: row.get(9).ok().flatten(),
                    last_polled_at: row.get(10).ok().flatten(),
                    last_http_status: row.get(11).ok().flatten(),
                })
            })
            .map_err(|e| format!("{}", e))?;

        let mut overrides = Vec::new();
        for row in iter.flatten() {
            overrides.push(row);
        }
        Ok(overrides)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn has_parent_dir_component(p: &Path) -> bool {
    p.components().any(|c| matches!(c, Component::ParentDir))
}

fn should_skip_export_file(rel_path: &Path, target_zip_name: &str) -> bool {
    let fname = rel_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if fname.is_empty() {
        return true;
    }
    let lower = fname.to_ascii_lowercase();
    if lower == SANCTUARY_EDGE_MANIFEST_FILE
        || lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || lower == ".ds_store"
        || lower == "thumbs.db"
        || lower == "desktop.ini"
        || lower.starts_with(".sanctuary")
        || lower.contains(".tmp.")
    {
        return true;
    }
    if fname.eq_ignore_ascii_case(target_zip_name) {
        return true;
    }
    // Avoid recursively bundling a prior exported `*_vX.Y.Z.zip` sitting at the root of `mod_dir`
    if rel_path.components().count() == 1 && lower.ends_with(".zip") && lower.contains("_v") {
        return true;
    }
    false
}

#[tauri::command]
pub async fn export_edge_release(
    vault_path: String,
    sandbox_mod_name: String,
    manifest: EdgeManifest,
    custom_url: String,
    push_config: Option<EdgePushConfig>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<String, String> {
    let game_schema = state.active_schema.lock().unwrap().clone();
    let vp_stage = vault_path.clone();
    let manifest_stage = manifest.clone();
    let custom_url_stage = custom_url.clone();

    let (
        mod_dir,
        export_files,
        actual_hash,
        mut final_manifest,
        mut sqlite_archive_hashes,
        mut effective_url,
        zip_filename,
    ) = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let vault_root = get_vault_root_dir(&vp_stage);
        if !is_safe_user_file_path(&vault_root) {
            return Err("Refusing to export release from unsafe Vault path.".to_string());
        }
        let vault_dir = PathBuf::from(&vp_stage);
        let dev_lane = if is_mods_dir(&vault_dir) {
            vault_dir
                .parent()
                .unwrap_or(&vault_dir)
                .join("Dev")
                .join("Sandbox")
        } else {
            vault_dir.join("Dev").join("Sandbox")
        };
        let mods_lane = get_vault_mods_lane(&vp_stage);
        fs::create_dir_all(&dev_lane)
            .map_err(|e| format!("Failed to initialize Sandbox lane: {}", e))?;

        let allowed_vault_roots = vec![dev_lane.clone(), mods_lane.clone(), vault_root];

        let raw_input_path = Path::new(sandbox_mod_name.trim());
        if has_parent_dir_component(raw_input_path) {
            return Err("Invalid sandbox mod path: parent traversal ('..') is forbidden.".to_string());
        }

        let mut mod_dir = dev_lane.join(raw_input_path);
        let mut base_lane = dev_lane.clone();
        let mut is_from_mods_lane = false;

        if !mod_dir.exists() {
            let direct_path = PathBuf::from(sandbox_mod_name.trim());
            if direct_path.is_absolute() && direct_path.exists() {
                let checked = ensure_strict_descendant_of_roots(&direct_path, &allowed_vault_roots)?;
                if let Ok(canon_mods) = ensure_path_within_roots(&mods_lane, &allowed_vault_roots) {
                    if crate::utils::path_is_within_root(&checked, &canon_mods) {
                        is_from_mods_lane = true;
                    }
                }
                if !is_from_mods_lane {
                    if let Some(p) = checked.parent() {
                        base_lane = p.to_path_buf();
                    }
                }
                mod_dir = checked;
            } else {
                let vault_candidate = mods_lane.join(raw_input_path);
                if vault_candidate.exists() {
                    mod_dir = ensure_strict_descendant_of_roots(
                        &vault_candidate,
                        &allowed_vault_roots,
                    )?;
                    is_from_mods_lane = true;
                }
            }
        } else {
            mod_dir = ensure_strict_descendant_of_roots(&mod_dir, &allowed_vault_roots)?;
        }

        if !mod_dir.exists() {
            let fallback_folder: String = manifest_stage
                .artifact
                .name
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            let folder_name = if fallback_folder.trim_matches('_').is_empty() {
                "sanctuary_export".to_string()
            } else {
                fallback_folder
            };
            let staged_dir = dev_lane.join(&folder_name);
            fs::create_dir_all(&staged_dir).map_err(|e| e.to_string())?;
            mod_dir = ensure_strict_descendant_of_roots(&staged_dir, &allowed_vault_roots)?;
        }

        if !is_safe_user_file_path(&mod_dir) {
            return Err("Target mod path failed safety containment check.".to_string());
        }

        // If `mod_dir` points to a loose file, stage or move it into a dedicated folder inside `Dev/Sandbox`
        if mod_dir.is_file() {
            let file_stem = mod_dir
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let safe_stem = if file_stem.trim().is_empty() {
                "sanctuary_export".to_string()
            } else {
                file_stem
            };
            let target_parent = if is_from_mods_lane {
                &dev_lane
            } else {
                &base_lane
            };
            let new_mod_dir = target_parent.join(&safe_stem);
            fs::create_dir_all(&new_mod_dir).map_err(|e| e.to_string())?;
            let checked_new_dir =
                ensure_strict_descendant_of_roots(&new_mod_dir, &allowed_vault_roots)?;
            let file_name = mod_dir
                .file_name()
                .ok_or_else(|| "Invalid loose mod filename".to_string())?;
            let new_file_path = checked_new_dir.join(file_name);
            if is_from_mods_lane {
                fs::copy(&mod_dir, &new_file_path)
                    .map_err(|e| format!("Failed to stage file from Vault to Sandbox: {}", e))?;
            } else {
                fs::rename(&mod_dir, &new_file_path)
                    .map_err(|e| format!("Failed to move file to folder: {}", e))?;
            }
            mod_dir = checked_new_dir;
        }

        let safe_name: String = manifest_stage
            .artifact
            .name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let safe_ver: String = manifest_stage
            .artifact
            .version
            .trim_start_matches(|c| c == 'v' || c == 'V')
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let zip_filename = format!(
            "{}_v{}.zip",
            if safe_name.is_empty() {
                "release".to_string()
            } else {
                safe_name
            },
            if safe_ver.is_empty() {
                "1.0.0".to_string()
            } else {
                safe_ver
            }
        );

        let mod_exts = crate::game_logic::get_supported_extensions(&game_schema);
        let preserve_aux = game_schema
            .as_ref()
            .and_then(|s| s.extensions.preserve_auxiliary_assets)
            .unwrap_or(true);

        let mut export_files: Vec<PathBuf> = Vec::new();
        for entry in walkdir::WalkDir::new(&mod_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.path();
            let rel = match p.strip_prefix(&mod_dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            if should_skip_export_file(rel, &zip_filename) {
                continue;
            }
            let ext = p
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_primary = mod_exts
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext));
            if preserve_aux || mod_exts.is_empty() || is_primary {
                export_files.push(p.to_path_buf());
            }
        }
        export_files.sort();

        let target_file_for_hash = export_files
            .iter()
            .find(|p| {
                let ext = p
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                mod_exts
                    .iter()
                    .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext))
            })
            .cloned()
            .or_else(|| export_files.first().cloned());

        let actual_hash = if let Some(ref target) = target_file_for_hash {
            crate::utils::calculate_hash(target)
                .unwrap_or_else(|_| manifest_stage.payload.sha256.clone())
        } else {
            manifest_stage.payload.sha256.clone()
        };

        let mut current_hashes = Vec::new();
        let mut current_modules = Vec::new();
        for p in &export_files {
            let ext = p
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_primary = mod_exts
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext));
            let file_hash_res = if target_file_for_hash.as_ref() == Some(p) && !actual_hash.is_empty()
            {
                Ok(actual_hash.clone())
            } else {
                crate::utils::calculate_hash(p)
            };
            if let Ok(h) = file_hash_res {
                push_unique_hash(&mut current_hashes, &h);
                let rel_name = p
                    .strip_prefix(&mod_dir)
                    .unwrap_or(p)
                    .to_string_lossy()
                    .replace('\\', "/");
                let role = if crate::game_logic::is_script_extension(&game_schema, &ext) {
                    "script"
                } else if is_primary || mod_exts.is_empty() {
                    "module"
                } else {
                    "asset"
                };
                current_modules.push(EdgeModuleEntry {
                    name: rel_name,
                    sha256: h,
                    role: Some(role.to_string()),
                });
            }
        }
        push_unique_hash(&mut current_hashes, &actual_hash);

        let mut candidate_lineage_hashes = Vec::new();
        for h in &manifest_stage.previous_hashes {
            push_unique_hash(&mut candidate_lineage_hashes, h);
        }

        let manifest_path = mod_dir.join(SANCTUARY_EDGE_MANIFEST_FILE);
        if manifest_path.exists() {
            if let Ok(old_manifest_str) = fs::read_to_string(&manifest_path) {
                if let Ok(old_manifest) = serde_json::from_str::<EdgeManifest>(&old_manifest_str) {
                    push_unique_hash(&mut candidate_lineage_hashes, &old_manifest.payload.sha256);
                    for m_entry in &old_manifest.modules {
                        push_unique_hash(&mut candidate_lineage_hashes, &m_entry.sha256);
                    }
                    for ch in &old_manifest.current_hashes {
                        push_unique_hash(&mut candidate_lineage_hashes, ch);
                    }
                    for ph in &old_manifest.previous_hashes {
                        push_unique_hash(&mut candidate_lineage_hashes, ph);
                    }
                }
            }
        }

        let override_path = mod_dir.join(SANCTUARY_EDGE_OVERRIDE_FILE);
        if override_path.exists() {
            if let Ok(old_data) = fs::read_to_string(&override_path) {
                if let Ok(old_override) = serde_json::from_str::<EdgeOverride>(&old_data) {
                    push_unique_hash(&mut candidate_lineage_hashes, &old_override.target_hash);
                    for h in old_override.archive_hashes {
                        push_unique_hash(&mut candidate_lineage_hashes, &h);
                    }
                }
            }
            let _ = fs::remove_file(&override_path);
        }

        if let Ok(conn_arc) = open_db_conn(&vp_stage) {
            if let Ok(conn) = conn_arc.lock() {
                if let Ok((existing_target, existing_archive_str, existing_meta_str)) = conn
                    .query_row(
                        "SELECT COALESCE(target_hash, ''), COALESCE(archive_hashes, '[]'), COALESCE(last_fetched_metadata, '')
                         FROM edge_manifests WHERE artifact_id = ?1 OR (target_hash != '' AND target_hash = ?2)",
                        rusqlite::params![manifest_stage.artifact.id, actual_hash],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                            ))
                        },
                    )
                {
                    push_unique_hash(&mut candidate_lineage_hashes, &existing_target);
                    if let Ok(db_archives) = serde_json::from_str::<Vec<String>>(&existing_archive_str) {
                        for h in db_archives {
                            push_unique_hash(&mut candidate_lineage_hashes, &h);
                        }
                    }
                    if let Ok(old_db_manifest) = serde_json::from_str::<EdgeManifest>(&existing_meta_str) {
                        push_unique_hash(&mut candidate_lineage_hashes, &old_db_manifest.payload.sha256);
                        for m_entry in &old_db_manifest.modules {
                            push_unique_hash(&mut candidate_lineage_hashes, &m_entry.sha256);
                        }
                        for ch in &old_db_manifest.current_hashes {
                            push_unique_hash(&mut candidate_lineage_hashes, ch);
                        }
                        for ph in &old_db_manifest.previous_hashes {
                            push_unique_hash(&mut candidate_lineage_hashes, ph);
                        }
                    }
                }
            }
        }

        let mut historical_previous_hashes = Vec::new();
        for h in &candidate_lineage_hashes {
            if !current_hashes.iter().any(|ch| ch.eq_ignore_ascii_case(h)) {
                push_unique_hash(&mut historical_previous_hashes, h);
            }
        }

        let mut sqlite_archive_hashes = historical_previous_hashes.clone();
        for h in &current_hashes {
            if !h.eq_ignore_ascii_case(&actual_hash) {
                push_unique_hash(&mut sqlite_archive_hashes, h);
            }
        }

        let default_placeholder_url =
            format!("https://your-domain.com/{}", SANCTUARY_EDGE_MANIFEST_FILE);
        let effective_url = if !custom_url_stage.trim().is_empty() {
            custom_url_stage.trim().to_string()
        } else if let Some(ref m_url) = manifest_stage.manifest_url {
            if !m_url.trim().is_empty() {
                m_url.trim().to_string()
            } else {
                default_placeholder_url
            }
        } else {
            default_placeholder_url
        };

        let mut final_manifest = manifest_stage;
        final_manifest.manifest_url = Some(effective_url.clone());
        final_manifest.payload.sha256 = actual_hash.clone();
        final_manifest.modules = current_modules;
        final_manifest.current_hashes = current_hashes;
        final_manifest.previous_hashes = historical_previous_hashes;

        Ok((
            mod_dir,
            export_files,
            actual_hash,
            final_manifest,
            sqlite_archive_hashes,
            effective_url,
            zip_filename,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // If an Auto-Push provider is configured, push (and merge remote lineage / catalog.json)
    // BEFORE writing `.sanctuary.manifest.json`, `.sanctuary.override.json`, and the release `.zip`
    if let Some(ref cfg) = push_config {
        let p = cfg.provider.trim().to_lowercase();
        if !p.is_empty() && p != "manual" && p != "none" {
            let push_res =
                execute_edge_manifest_push(&mut final_manifest, cfg, &effective_url).await?;
            if !push_res.resolved_manifest_url.trim().is_empty() {
                effective_url = push_res.resolved_manifest_url.clone();
                final_manifest.manifest_url = Some(effective_url.clone());
            }
            for ph in &final_manifest.previous_hashes {
                if !ph.eq_ignore_ascii_case(&actual_hash) {
                    push_unique_hash(&mut sqlite_archive_hashes, ph);
                }
            }
        }
    }

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let manifest_path = mod_dir.join(SANCTUARY_EDGE_MANIFEST_FILE);
        let manifest_str = serde_json::to_string_pretty(&final_manifest)
            .map_err(|e| format!("JSON error: {}", e))?;
        atomic_write_bytes(&manifest_path, manifest_str.as_bytes()).map_err(|e| {
            format!(
                "Write error manifest ({}): {}",
                manifest_path.display(),
                e
            )
        })?;

        let override_data = EdgeOverride {
            artifact_id: final_manifest.artifact.id.clone(),
            mason_id: final_manifest.artifact.author.clone(),
            game_id: final_manifest.artifact.game_id.clone(),
            manifest_url: effective_url,
            target_hash: actual_hash.clone(),
            archive_hashes: sqlite_archive_hashes,
            last_fetched_hash: Some(actual_hash.clone()),
            last_fetched_metadata: Some(manifest_str.clone()),
            etag: None,
            last_modified: None,
            last_polled_at: None,
            last_http_status: None,
        };

        let override_str = serde_json::to_string_pretty(&override_data)
            .map_err(|e| format!("JSON error: {}", e))?;

        if let Ok(conn_arc) = open_db_conn(&vault_path) {
            if let Ok(conn) = conn_arc.lock() {
                let now = now_epoch_secs();
                let archive_hashes_str = serde_json::to_string(&override_data.archive_hashes)
                    .unwrap_or_else(|_| "[]".to_string());
                let _ = conn.execute(
                    "INSERT INTO edge_manifests (
                        artifact_id, mason_id, manifest_url, target_hash, archive_hashes, game_id,
                        last_fetched_hash, last_fetched_metadata, created_at
                     )
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                     ON CONFLICT(artifact_id) DO UPDATE SET
                        mason_id = excluded.mason_id,
                        manifest_url = excluded.manifest_url,
                        target_hash = excluded.target_hash,
                        archive_hashes = excluded.archive_hashes,
                        game_id = excluded.game_id,
                        last_fetched_hash = excluded.last_fetched_hash,
                        last_fetched_metadata = excluded.last_fetched_metadata",
                    rusqlite::params![
                        override_data.artifact_id,
                        override_data.mason_id,
                        override_data.manifest_url,
                        override_data.target_hash,
                        archive_hashes_str,
                        override_data.game_id,
                        actual_hash,
                        manifest_str,
                        now
                    ],
                );
            }
        }

        // Package ALL preserved mod files (preserving relative subpaths) + `.sanctuary.manifest.json`
        // + `.sanctuary.override.json` into the release `.zip` archive
        let zip_path = mod_dir.join(&zip_filename);
        let zip_file = fs::File::create(&zip_path)
            .map_err(|e| format!("Failed creating release zip {:?}: {}", zip_path, e))?;
        let mut zip_writer = zip::ZipWriter::new(zip_file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let mut added_entries: HashSet<String> = HashSet::new();
        for file_path in &export_files {
            if let Ok(rel) = file_path.strip_prefix(&mod_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if rel_str.is_empty() || !added_entries.insert(rel_str.to_lowercase()) {
                    continue;
                }
                if zip_writer.start_file(&rel_str, options).is_ok() {
                    if let Ok(mut f) = fs::File::open(file_path) {
                        let _ = std::io::copy(&mut f, &mut zip_writer);
                    }
                }
            }
        }
        if zip_writer
            .start_file(SANCTUARY_EDGE_MANIFEST_FILE, options)
            .is_ok()
        {
            let _ = zip_writer.write_all(manifest_str.as_bytes());
        }
        if zip_writer
            .start_file(SANCTUARY_EDGE_OVERRIDE_FILE, options)
            .is_ok()
        {
            let _ = zip_writer.write_all(override_str.as_bytes());
        }
        zip_writer
            .finish()
            .map_err(|e| format!("Failed finalizing release zip: {}", e))?;

        Ok(mod_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct EdgePushConfig {
    pub provider: String,
    pub target_mode: String,
    pub token: String,
    pub repo_or_project: String,
    pub branch: String,
    pub remote_path: String,
    pub custom_endpoint: String,
    pub local_folder_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EdgePushResult {
    pub resolved_manifest_url: String,
    pub provider_ref: String,
    pub message: String,
}

fn base64_encode_bytes(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn base64_decode_str(input: &str) -> Option<String> {
    let mut val = 0u32;
    let mut bits = 0i32;
    let mut bytes = Vec::new();
    for ch in input.bytes() {
        let d = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b'\r' | b'\n' | b' ' | b'\t' => continue,
            _ => return None,
        };
        val = (val << 6) | (d as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes.push(((val >> bits) & 0xFF) as u8);
        }
    }
    String::from_utf8(bytes).ok()
}

fn url_encode_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn absorb_existing_remote_lineage_and_prepare_payload(
    existing_json_str: Option<&str>,
    manifest: &mut EdgeManifest,
    is_catalog: bool,
) -> Result<String, String> {
    let absorb_from_old = |old_m: &EdgeManifest, target: &mut EdgeManifest| {
        if !old_m.payload.sha256.is_empty()
            && !target
                .current_hashes
                .iter()
                .any(|ch| ch.eq_ignore_ascii_case(&old_m.payload.sha256))
        {
            push_unique_hash(&mut target.previous_hashes, &old_m.payload.sha256);
        }
        for ch in &old_m.current_hashes {
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(ch))
            {
                push_unique_hash(&mut target.previous_hashes, ch);
            }
        }
        for mod_entry in &old_m.modules {
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(&mod_entry.sha256))
            {
                push_unique_hash(&mut target.previous_hashes, &mod_entry.sha256);
            }
        }
        for ph in &old_m.previous_hashes {
            if !target
                .current_hashes
                .iter()
                .any(|c| c.eq_ignore_ascii_case(ph))
            {
                push_unique_hash(&mut target.previous_hashes, ph);
            }
        }
    };

    if is_catalog {
        let mut catalog_val: serde_json::Value = existing_json_str
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .unwrap_or_else(|| {
                serde_json::json!({
                    "schema_version": 2,
                    "author": manifest.artifact.author,
                    "artifacts": []
                })
            });

        if !catalog_val.is_object() {
            catalog_val = serde_json::json!({
                "schema_version": 2,
                "author": manifest.artifact.author,
                "artifacts": []
            });
        }

        let key = if catalog_val
            .get("manifests")
            .and_then(|v| v.as_array())
            .is_some()
        {
            "manifests"
        } else {
            "artifacts"
        };

        let mut arr = catalog_val
            .get(key)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut matched_idx: Option<usize> = None;
        for (idx, item) in arr.iter().enumerate() {
            if let Ok(old_m) = serde_json::from_value::<EdgeManifest>(item.clone()) {
                if (!old_m.artifact.id.is_empty()
                    && old_m.artifact.id.eq_ignore_ascii_case(&manifest.artifact.id))
                    || (!old_m.artifact.name.is_empty()
                        && old_m
                            .artifact
                            .name
                            .eq_ignore_ascii_case(&manifest.artifact.name))
                {
                    absorb_from_old(&old_m, manifest);
                    matched_idx = Some(idx);
                    break;
                }
            }
        }

        let new_entry_val =
            serde_json::to_value(&*manifest).map_err(|e| format!("JSON serialize error: {}", e))?;
        if let Some(idx) = matched_idx {
            arr[idx] = new_entry_val;
        } else {
            arr.push(new_entry_val);
        }

        if let Some(obj) = catalog_val.as_object_mut() {
            obj.insert(key.to_string(), serde_json::Value::Array(arr));
        }

        serde_json::to_string_pretty(&catalog_val).map_err(|e| format!("Catalog JSON error: {}", e))
    } else {
        if let Some(raw) = existing_json_str {
            if let Ok(old_m) = serde_json::from_str::<EdgeManifest>(raw) {
                absorb_from_old(&old_m, manifest);
            }
        }
        serde_json::to_string_pretty(manifest).map_err(|e| format!("Manifest JSON error: {}", e))
    }
}

pub async fn execute_edge_manifest_push(
    manifest: &mut EdgeManifest,
    cfg: &EdgePushConfig,
    current_url: &str,
) -> Result<EdgePushResult, String> {
    let provider = cfg.provider.trim().to_lowercase();
    let is_catalog = cfg.target_mode.trim().eq_ignore_ascii_case("catalog");
    let branch = if cfg.branch.trim().is_empty() {
        "main".to_string()
    } else {
        cfg.branch.trim().to_string()
    };
    let default_filename = if is_catalog {
        "catalog.json".to_string()
    } else {
        format!("{}/{}", manifest.artifact.id, SANCTUARY_EDGE_MANIFEST_FILE)
    };
    let remote_path = if cfg.remote_path.trim().is_empty() {
        default_filename
    } else {
        cfg.remote_path.trim().trim_start_matches('/').to_string()
    };

    let client = get_http_client();

    match provider.as_str() {
        "github_repo" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err(
                    "GitHub Personal Access Token is required for GitHub Repo Auto-Push."
                        .to_string(),
                );
            }

            let mut repo_slug = cfg
                .repo_or_project
                .trim()
                .trim_start_matches("https://github.com/")
                .trim_start_matches("http://github.com/")
                .trim_end_matches(".git")
                .trim_matches('/')
                .to_string();
            let mut path_in_repo = remote_path.clone();
            let mut branch_name = branch.clone();

            if repo_slug.is_empty() && current_url.contains("raw.githubusercontent.com/") {
                if let Some(after) = current_url.split("raw.githubusercontent.com/").nth(1) {
                    let parts: Vec<&str> = after.split('/').collect();
                    if parts.len() >= 4 {
                        repo_slug = format!("{}/{}", parts[0], parts[1]);
                        if cfg.branch.trim().is_empty() {
                            branch_name = parts[2].to_string();
                        }
                        if cfg.remote_path.trim().is_empty() {
                            path_in_repo = parts[3..].join("/");
                        }
                    }
                }
            }

            if !repo_slug.contains('/') {
                return Err("GitHub Repository must be formatted as 'owner/repo' (e.g. 'myname/my-manifests').".to_string());
            }

            let resolved_url = if !is_placeholder_manifest_url(current_url)
                && !current_url.contains("raw.githubusercontent.com/")
            {
                validate_safe_https_url_syntax(current_url)?;
                current_url.to_string()
            } else {
                format!(
                    "https://raw.githubusercontent.com/{}/{}/{}",
                    repo_slug, branch_name, path_in_repo
                )
            };
            manifest.manifest_url = Some(resolved_url.clone());

            let api_url = format!(
                "https://api.github.com/repos/{}/contents/{}",
                repo_slug, path_in_repo
            );

            let mut existing_sha: Option<String> = None;
            let mut existing_content: Option<String> = None;

            if let Ok(get_resp) = client
                .get(&format!(
                    "{}?ref={}",
                    api_url,
                    url_encode_component(&branch_name)
                ))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", EDGE_USER_AGENT)
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        if let Ok(val) = parse_bounded_json(&bytes) {
                            existing_sha = val
                                .get("sha")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                                existing_content = base64_decode_str(b64);
                            }
                        }
                    }
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let mut body = serde_json::json!({
                "message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version),
                "content": base64_encode_bytes(payload_str.as_bytes()),
                "branch": branch_name,
            });
            if let Some(ref sha) = existing_sha {
                body["sha"] = serde_json::Value::String(sha.clone());
            }

            let put_resp = client
                .put(&api_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", EDGE_USER_AGENT)
                .header("Accept", "application/vnd.github+json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("GitHub API request failed: {}", e))?;

            if !put_resp.status().is_success() {
                let status = put_resp.status();
                let err_txt = put_resp.text().await.unwrap_or_default();
                return Err(format!("GitHub Repo push failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: repo_slug,
                message: "Pushed to GitHub Repository".to_string(),
            })
        }

        "github_gist" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err(
                    "GitHub Token (with 'gist' scope) is required for GitHub Gist Auto-Push."
                        .to_string(),
                );
            }

            let gist_filename = if is_catalog {
                "catalog.json".to_string()
            } else if !cfg.remote_path.trim().is_empty() {
                cfg.remote_path
                    .trim()
                    .split('/')
                    .last()
                    .unwrap_or(SANCTUARY_EDGE_MANIFEST_FILE)
                    .to_string()
            } else {
                format!("{}{}", manifest.artifact.id, SANCTUARY_EDGE_MANIFEST_FILE)
            };

            let mut gist_id = cfg
                .repo_or_project
                .trim()
                .trim_end_matches('/')
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();

            if gist_id.is_empty() && current_url.contains("gist.githubusercontent.com/") {
                if let Some(after) = current_url.split("gist.githubusercontent.com/").nth(1) {
                    let parts: Vec<&str> = after.split('/').collect();
                    if parts.len() >= 2 {
                        gist_id = parts[1].to_string();
                    }
                }
            }

            if !gist_id.is_empty() {
                let gist_api = format!("https://api.github.com/gists/{}", gist_id);
                let mut existing_content: Option<String> = None;
                let mut owner_login = String::new();

                if let Ok(get_resp) = client
                    .get(&gist_api)
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            if let Ok(val) = parse_bounded_json(&bytes) {
                                owner_login = val
                                    .get("owner")
                                    .and_then(|o| o.get("login"))
                                    .and_then(|l| l.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                existing_content = val
                                    .get("files")
                                    .and_then(|f| f.get(&gist_filename))
                                    .and_then(|f| f.get("content"))
                                    .and_then(|c| c.as_str())
                                    .map(|s| s.to_string());
                            }
                        }
                    }
                }

                let resolved_url = if !owner_login.is_empty() {
                    format!(
                        "https://gist.githubusercontent.com/{}/{}/raw/{}",
                        owner_login, gist_id, gist_filename
                    )
                } else if !is_placeholder_manifest_url(current_url) {
                    validate_safe_https_url_syntax(current_url)?;
                    current_url.to_string()
                } else {
                    format!(
                        "https://gist.githubusercontent.com/raw/{}/{}",
                        gist_id, gist_filename
                    )
                };
                manifest.manifest_url = Some(resolved_url.clone());

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;

                let mut files_map = serde_json::Map::new();
                files_map.insert(
                    gist_filename.clone(),
                    serde_json::json!({ "content": payload_str }),
                );
                let patch_body = serde_json::json!({
                    "description": format!("Sanctuary OS Static Manifest: {}", manifest.artifact.name),
                    "files": files_map
                });

                let patch_resp = client
                    .patch(&gist_api)
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .json(&patch_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist PATCH failed: {}", e))?;

                if !patch_resp.status().is_success() {
                    let status = patch_resp.status();
                    let err_txt = patch_resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "GitHub Gist update failed ({}): {}",
                        status, err_txt
                    ));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: gist_id,
                    message: "Updated GitHub Gist".to_string(),
                })
            } else {
                let initial_payload =
                    absorb_existing_remote_lineage_and_prepare_payload(None, manifest, is_catalog)?;
                let mut files_map = serde_json::Map::new();
                files_map.insert(
                    gist_filename.clone(),
                    serde_json::json!({ "content": initial_payload }),
                );
                let create_body = serde_json::json!({
                    "description": format!("Sanctuary OS Static Manifest: {}", manifest.artifact.name),
                    "public": false,
                    "files": files_map
                });

                let post_resp = client
                    .post("https://api.github.com/gists")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", EDGE_USER_AGENT)
                    .header("Accept", "application/vnd.github+json")
                    .json(&create_body)
                    .send()
                    .await
                    .map_err(|e| format!("GitHub Gist creation failed: {}", e))?;

                if !post_resp.status().is_success() {
                    let status = post_resp.status();
                    let err_txt = post_resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "GitHub Gist create failed ({}): {}",
                        status, err_txt
                    ));
                }

                let created_bytes = read_bounded_response_bytes(post_resp).await?;
                let created_val = parse_bounded_json(&created_bytes)?;
                let new_gist_id = created_val
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let owner_login = created_val
                    .get("owner")
                    .and_then(|o| o.get("login"))
                    .and_then(|l| l.as_str())
                    .unwrap_or("anonymous")
                    .to_string();

                let resolved_url = format!(
                    "https://gist.githubusercontent.com/{}/{}/raw/{}",
                    owner_login, new_gist_id, gist_filename
                );
                manifest.manifest_url = Some(resolved_url.clone());

                if let Ok(updated_payload) =
                    absorb_existing_remote_lineage_and_prepare_payload(None, manifest, is_catalog)
                {
                    let mut updated_files = serde_json::Map::new();
                    updated_files.insert(
                        gist_filename.clone(),
                        serde_json::json!({ "content": updated_payload }),
                    );
                    let _ = client
                        .patch(&format!("https://api.github.com/gists/{}", new_gist_id))
                        .header("Authorization", format!("Bearer {}", token))
                        .header("User-Agent", EDGE_USER_AGENT)
                        .header("Accept", "application/vnd.github+json")
                        .json(&serde_json::json!({ "files": updated_files }))
                        .send()
                        .await;
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: new_gist_id,
                    message: "Created & linked new GitHub Gist".to_string(),
                })
            }
        }

        "gitlab" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err(
                    "Access Token is required for GitLab / Codeberg Auto-Push.".to_string()
                );
            }
            let base_host = if cfg.custom_endpoint.trim().is_empty() {
                if current_url.contains("codeberg.org") {
                    "https://codeberg.org".to_string()
                } else {
                    "https://gitlab.com".to_string()
                }
            } else {
                let ep = cfg.custom_endpoint.trim().trim_end_matches('/').to_string();
                validate_safe_https_url(&ep).await?;
                ep
            };
            let project_slug = cfg
                .repo_or_project
                .trim()
                .trim_start_matches(&base_host)
                .trim_end_matches(".git")
                .trim_matches('/')
                .to_string();

            if !project_slug.contains('/') {
                return Err("Project path must be formatted as 'owner/repo'.".to_string());
            }

            if base_host.contains("codeberg.org") || base_host.contains("gitea") {
                let resolved_url = format!(
                    "{}/{}/raw/branch/{}/{}",
                    base_host, project_slug, branch, remote_path
                );
                manifest.manifest_url = Some(resolved_url.clone());

                let api_url = format!(
                    "{}/api/v1/repos/{}/contents/{}",
                    base_host, project_slug, remote_path
                );
                let mut existing_sha: Option<String> = None;
                let mut existing_content: Option<String> = None;

                if let Ok(get_resp) = client
                    .get(&format!("{}?ref={}", api_url, url_encode_component(&branch)))
                    .header("Authorization", format!("token {}", token))
                    .header("User-Agent", EDGE_USER_AGENT)
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            if let Ok(val) = parse_bounded_json(&bytes) {
                                existing_sha = val
                                    .get("sha")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                if let Some(b64) = val.get("content").and_then(|v| v.as_str()) {
                                    existing_content = base64_decode_str(b64);
                                }
                            }
                        }
                    }
                }

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;
                let mut body = serde_json::json!({
                    "message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version),
                    "content": base64_encode_bytes(payload_str.as_bytes()),
                    "branch": branch,
                });
                let req = if let Some(sha) = existing_sha {
                    body["sha"] = serde_json::Value::String(sha);
                    client.put(&api_url)
                } else {
                    client.post(&api_url)
                };

                let resp = req
                    .header("Authorization", format!("token {}", token))
                    .header("User-Agent", EDGE_USER_AGENT)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Codeberg/Gitea request failed: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_txt = resp.text().await.unwrap_or_default();
                    return Err(format!(
                        "Codeberg/Gitea push failed ({}): {}",
                        status, err_txt
                    ));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: project_slug,
                    message: "Pushed to Codeberg / Gitea".to_string(),
                })
            } else {
                let resolved_url = format!(
                    "{}/{}/-/raw/{}/{}",
                    base_host, project_slug, branch, remote_path
                );
                manifest.manifest_url = Some(resolved_url.clone());

                let enc_proj = url_encode_component(&project_slug);
                let enc_path = url_encode_component(&remote_path);
                let raw_api = format!(
                    "{}/api/v4/projects/{}/repository/files/{}/raw?ref={}",
                    base_host,
                    enc_proj,
                    enc_path,
                    url_encode_component(&branch)
                );
                let file_api = format!(
                    "{}/api/v4/projects/{}/repository/files/{}",
                    base_host, enc_proj, enc_path
                );

                let mut file_exists = false;
                let mut existing_content: Option<String> = None;
                if let Ok(get_resp) = client
                    .get(&raw_api)
                    .header("PRIVATE-TOKEN", token)
                    .header("User-Agent", EDGE_USER_AGENT)
                    .send()
                    .await
                {
                    if get_resp.status().is_success() {
                        file_exists = true;
                        if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                            existing_content = String::from_utf8(bytes).ok();
                        }
                    }
                }

                let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                    existing_content.as_deref(),
                    manifest,
                    is_catalog,
                )?;
                let body = serde_json::json!({
                    "branch": branch,
                    "content": payload_str,
                    "commit_message": format!("Sanctuary OS: Update {} v{}", manifest.artifact.name, manifest.artifact.version)
                });

                let req = if file_exists {
                    client.put(&file_api)
                } else {
                    client.post(&file_api)
                };
                let resp = req
                    .header("PRIVATE-TOKEN", token)
                    .header("User-Agent", EDGE_USER_AGENT)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("GitLab request failed: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_txt = resp.text().await.unwrap_or_default();
                    return Err(format!("GitLab push failed ({}): {}", status, err_txt));
                }

                Ok(EdgePushResult {
                    resolved_manifest_url: resolved_url,
                    provider_ref: project_slug,
                    message: "Pushed to GitLab Repository".to_string(),
                })
            }
        }

        "neocities" => {
            let token = cfg.token.trim();
            if token.is_empty() {
                return Err("Neocities API Key is required for Neocities Auto-Push.".to_string());
            }
            let site_name = cfg
                .repo_or_project
                .trim()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches(".neocities.org")
                .trim_matches('/')
                .to_string();

            let resolved_url = if !site_name.is_empty() {
                format!("https://{}.neocities.org/{}", site_name, remote_path)
            } else if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                return Err(
                    "Enter your Neocities site name (e.g. 'mycreatorname') or full URL."
                        .to_string(),
                );
            };
            validate_safe_https_url(&resolved_url).await?;
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client
                .get(&resolved_url)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT)
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        existing_content = String::from_utf8(bytes).ok();
                    }
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let boundary = "----SanctuaryOSNeocitiesBoundary987654321";
            let mut body_bytes = Vec::new();
            let header_part = format!(
                "--{}\r\nContent-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: application/json\r\n\r\n",
                boundary, remote_path, remote_path
            );
            body_bytes.extend_from_slice(header_part.as_bytes());
            body_bytes.extend_from_slice(payload_str.as_bytes());
            body_bytes.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

            let auth_header = if token.contains(':') {
                format!("Basic {}", base64_encode_bytes(token.as_bytes()))
            } else {
                format!("Bearer {}", token)
            };

            let resp = client
                .post("https://neocities.org/api/upload")
                .header("Authorization", auth_header)
                .header("User-Agent", EDGE_USER_AGENT)
                .header(
                    "Content-Type",
                    format!("multipart/form-data; boundary={}", boundary),
                )
                .body(body_bytes)
                .send()
                .await
                .map_err(|e| format!("Neocities upload failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                return Err(format!("Neocities push failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: site_name,
                message: "Uploaded to Neocities".to_string(),
            })
        }

        "custom_http" => {
            let target_endpoint = if !cfg.custom_endpoint.trim().is_empty() {
                cfg.custom_endpoint.trim().to_string()
            } else if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                return Err("Custom HTTP PUT/WebDAV URL is required.".to_string());
            };

            let resolved_url = if !is_placeholder_manifest_url(current_url) {
                current_url.to_string()
            } else {
                target_endpoint.clone()
            };
            validate_safe_https_url(&target_endpoint).await?;
            validate_safe_https_url(&resolved_url).await?;
            manifest.manifest_url = Some(resolved_url.clone());

            let mut existing_content: Option<String> = None;
            if let Ok(get_resp) = client
                .get(&resolved_url)
                .header(reqwest::header::USER_AGENT, EDGE_USER_AGENT)
                .send()
                .await
            {
                if get_resp.status().is_success() {
                    if let Ok(bytes) = read_bounded_response_bytes(get_resp).await {
                        existing_content = String::from_utf8(bytes).ok();
                    }
                }
            }

            let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                existing_content.as_deref(),
                manifest,
                is_catalog,
            )?;

            let mut req = client
                .put(&target_endpoint)
                .header("Content-Type", "application/json")
                .header("User-Agent", EDGE_USER_AGENT);
            let token = cfg.token.trim();
            if !token.is_empty() {
                let auth_header = if token.contains(':') {
                    format!("Basic {}", base64_encode_bytes(token.as_bytes()))
                } else {
                    format!("Bearer {}", token)
                };
                req = req.header("Authorization", auth_header);
            }

            let resp = req
                .body(payload_str)
                .send()
                .await
                .map_err(|e| format!("Custom HTTP PUT failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                return Err(format!("Custom HTTP PUT failed ({}): {}", status, err_txt));
            }

            Ok(EdgePushResult {
                resolved_manifest_url: resolved_url,
                provider_ref: target_endpoint,
                message: "Pushed via Custom HTTP PUT / WebDAV".to_string(),
            })
        }

        "local_folder" => {
            if cfg.local_folder_path.trim().is_empty() {
                return Err(
                    "Select a Local Synced Folder path for Local Folder Auto-Push.".to_string(),
                );
            }
            let local_root_str = cfg.local_folder_path.trim().to_string();
            let rel_remote = remote_path.clone();
            let current_url_owned = current_url.to_string();
            let mut manifest_clone = manifest.clone();

            let (updated_manifest, push_res) =
                tauri::async_runtime::spawn_blocking(move || -> Result<(EdgeManifest, EdgePushResult), String> {
                    let dest_root = PathBuf::from(&local_root_str);
                    if !dest_root.is_absolute() || !is_safe_user_file_path(&dest_root) {
                        return Err(
                            "Refusing to write to unsafe or non-absolute local synced folder."
                                .to_string(),
                        );
                    }

                    let mut allowed_user_roots: Vec<PathBuf> = [
                        dirs::home_dir(),
                        dirs::document_dir(),
                        dirs::desktop_dir(),
                        dirs::download_dir(),
                    ]
                    .into_iter()
                    .flatten()
                    .collect();
                    let saved = crate::commands::state_ops::get_saved_coordinates();
                    if !saved.vault_path.trim().is_empty() {
                        allowed_user_roots.push(get_vault_root_dir(&saved.vault_path));
                    }

                    let canon_dest_root = ensure_path_within_roots(&dest_root, &allowed_user_roots)?;

                    let rel_p = Path::new(&rel_remote);
                    if rel_p.is_absolute()
                        || has_parent_dir_component(rel_p)
                        || rel_p
                            .components()
                            .any(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
                    {
                        return Err(
                            "Invalid relative remote path for Local Folder Auto-Push.".to_string(),
                        );
                    }

                    let candidate_dest = canon_dest_root.join(rel_p);
                    if let Some(parent) = candidate_dest.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create target folder: {}", e))?;
                    }
                    let dest_file = ensure_strict_descendant_of_roots(
                        &candidate_dest,
                        std::slice::from_ref(&canon_dest_root),
                    )?;
                    if !is_safe_user_file_path(&dest_file) {
                        return Err("Destination file failed safety containment check.".to_string());
                    }

                    let existing_content = if dest_file.exists() {
                        fs::read_to_string(&dest_file).ok()
                    } else {
                        None
                    };

                    let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
                        existing_content.as_deref(),
                        &mut manifest_clone,
                        is_catalog,
                    )?;

                    atomic_write_bytes(&dest_file, payload_str.as_bytes()).map_err(|e| {
                        format!("Failed to write to local synced folder: {}", e)
                    })?;

                    let res = EdgePushResult {
                        resolved_manifest_url: current_url_owned,
                        provider_ref: dest_file.to_string_lossy().to_string(),
                        message: format!("Synced to {}", dest_file.display()),
                    };
                    Ok((manifest_clone, res))
                })
                .await
                .map_err(|e| format!("Task join error: {}", e))??;

            *manifest = updated_manifest;
            Ok(push_res)
        }

        other => Err(format!("Unsupported Auto-Push provider: {}", other)),
    }
}

#[tauri::command]
pub async fn push_static_edge_manifest(
    mut manifest: EdgeManifest,
    custom_url: String,
    push_config: EdgePushConfig,
) -> Result<EdgePushResult, String> {
    let effective_url = if !custom_url.trim().is_empty() {
        custom_url.trim().to_string()
    } else {
        manifest.manifest_url.clone().unwrap_or_default()
    };
    execute_edge_manifest_push(&mut manifest, &push_config, &effective_url).await
}
