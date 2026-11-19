use super::archive_packager::{
    absorb_existing_remote_lineage_and_prepare_payload, EdgePushConfig, EdgePushResult,
};
use super::manifest_signing::build_detached_sig_json;
use super::types::{
    get_http_client, get_large_transfer_http_client, validate_safe_https_url,
    validate_safe_https_url_syntax, EdgeManifest, EDGE_USER_AGENT,
};
use crate::utils::SANCTUARY_EDGE_MANIFEST_SIG_FILE;
use chrono::Utc;
use ring::hmac::{sign, Key, HMAC_SHA256};
use sha2::{Digest, Sha256};
use std::path::Path;

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex_lower(Sha256::digest(bytes).as_slice())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let k = Key::new(HMAC_SHA256, key);
    sign(&k, data).as_ref().to_vec()
}

fn encode_s3_uri_path(path: &str) -> String {
    let mut out = String::new();
    for seg in path.split('/') {
        out.push('/');
        for b in seg.bytes() {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    out.push(b as char);
                }
                _ => out.push_str(&format!("%{:02X}", b)),
            }
        }
    }
    if out.is_empty() {
        "/".to_string()
    } else {
        out
    }
}

/// Computes AWS Signature Version 4 (`AWS4-HMAC-SHA256`) headers for S3 and Cloudflare R2 requests
/// deterministically from `(method, canonical_uri, host, region, access_key, secret_key, amz_date, payload_hash)`.
pub(crate) fn build_s3_sigv4_headers_at(
    method: &str,
    canonical_uri: &str,
    host: &str,
    region: &str,
    access_key: &str,
    secret_key: &str,
    payload_sha256_hex: &str,
    amz_date: &str,
) -> Result<Vec<(String, String)>, String> {
    if amz_date.len() < 8 {
        return Err("Invalid AMZ timestamp for SigV4.".to_string());
    }
    let date_stamp = &amz_date[..8];
    let service = "s3";

    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_sha256_hex, amz_date
    );
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method, canonical_uri, canonical_headers, signed_headers, payload_sha256_hex
    );

    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    let k_date = hmac_sha256(
        format!("AWS4{}", secret_key).as_bytes(),
        date_stamp.as_bytes(),
    );
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature_hex = hex_lower(&hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key, credential_scope, signed_headers, signature_hex
    );

    Ok(vec![
        ("Host".to_string(), host.to_string()),
        ("x-amz-date".to_string(), amz_date.to_string()),
        (
            "x-amz-content-sha256".to_string(),
            payload_sha256_hex.to_string(),
        ),
        ("Authorization".to_string(), authorization),
    ])
}

struct ResolvedS3Target {
    put_endpoint_base: String,
    host: String,
    bucket: String,
    region: String,
    access_key: String,
    secret_key: String,
    public_base_url: String,
}

async fn resolve_s3_target(cfg: &EdgePushConfig) -> Result<ResolvedS3Target, String> {
    let bucket = cfg.s3_bucket.trim().trim_matches('/').to_string();
    if bucket.is_empty() {
        return Err("S3 / R2 Bucket name is required.".to_string());
    }
    let access_key = cfg.s3_access_key_id.trim().to_string();
    if access_key.is_empty() {
        return Err("S3 / R2 Access Key ID is required.".to_string());
    }
    let secret_key = cfg.token.trim().to_string();
    if secret_key.is_empty() {
        return Err("S3 / R2 Secret Access Key is required.".to_string());
    }
    let region = if cfg.s3_region.trim().is_empty() {
        "auto".to_string()
    } else {
        cfg.s3_region.trim().to_string()
    };

    let endpoint_base = if !cfg.custom_endpoint.trim().is_empty() {
        cfg.custom_endpoint.trim().trim_end_matches('/').to_string()
    } else {
        format!("https://{}.s3.{}.amazonaws.com", bucket, region)
    };
    let parsed_ep = validate_safe_https_url(&endpoint_base).await?;
    let host = parsed_ep
        .host_str()
        .ok_or_else(|| "Invalid S3/R2 endpoint host.".to_string())?
        .to_string();

    let public_base = if !cfg.public_base_url.trim().is_empty() {
        let trimmed_pub = cfg.public_base_url.trim().trim_end_matches('/').to_string();
        validate_safe_https_url_syntax(&trimmed_pub)?;
        trimmed_pub
    } else if !cfg.custom_endpoint.trim().is_empty() {
        format!("{}/{}", endpoint_base, bucket)
    } else {
        endpoint_base.clone()
    };

    Ok(ResolvedS3Target {
        put_endpoint_base: endpoint_base,
        host,
        bucket,
        region,
        access_key,
        secret_key,
        public_base_url: public_base,
    })
}

fn build_s3_object_url_and_uri(target: &ResolvedS3Target, object_key: &str) -> (String, String) {
    let clean_key = object_key.trim().trim_start_matches('/');
    // Virtual-hosted style URLs put the key directly at root; path-style endpoints (like R2 API host) prefix /<bucket>
    let uses_virtual_host = target
        .host
        .to_ascii_lowercase()
        .starts_with(&format!("{}.", target.bucket.to_ascii_lowercase()));
    let uri_raw = if uses_virtual_host {
        format!("/{}", clean_key)
    } else {
        format!("/{}/{}", target.bucket, clean_key)
    };
    let canonical_uri = encode_s3_uri_path(&uri_raw);
    let url = format!("{}{}", target.put_endpoint_base, canonical_uri);
    (url, canonical_uri)
}

async fn s3_put_bytes(
    target: &ResolvedS3Target,
    object_key: &str,
    content_type: &str,
    body: Vec<u8>,
    large_transfer: bool,
) -> Result<(), String> {
    let (url, canonical_uri) = build_s3_object_url_and_uri(target, object_key);
    let amz_date = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let payload_hash = sha256_hex(&body);
    let headers = build_s3_sigv4_headers_at(
        "PUT",
        &canonical_uri,
        &target.host,
        &target.region,
        &target.access_key,
        &target.secret_key,
        &payload_hash,
        &amz_date,
    )?;

    let client = if large_transfer {
        get_large_transfer_http_client()
    } else {
        get_http_client()
    };
    let mut req = client
        .put(&url)
        .header("User-Agent", EDGE_USER_AGENT)
        .header("Content-Type", content_type);
    for (k, v) in headers {
        req = req.header(k, v);
    }

    let resp = req
        .body(body)
        .send()
        .await
        .map_err(|e| format!("S3/R2 PUT failed for {}: {}", object_key, e))?;
    if !resp.status().is_success() {
        let st = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("S3/R2 PUT {} failed ({}): {}", object_key, st, err));
    }
    Ok(())
}

pub(crate) async fn push_manifest_to_s3_r2(
    manifest: &mut EdgeManifest,
    cfg: &EdgePushConfig,
    remote_path: &str,
    is_catalog: bool,
) -> Result<EdgePushResult, String> {
    let target = resolve_s3_target(cfg).await?;
    let clean_key = remote_path.trim().trim_start_matches('/');
    let resolved_url = format!("{}/{}", target.public_base_url, clean_key);
    validate_safe_https_url_syntax(&resolved_url)?;
    manifest.manifest_url = Some(resolved_url.clone());

    let (get_url, canonical_uri) = build_s3_object_url_and_uri(&target, clean_key);
    let amz_date = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let empty_hash = sha256_hex(b"");
    let get_headers = build_s3_sigv4_headers_at(
        "GET",
        &canonical_uri,
        &target.host,
        &target.region,
        &target.access_key,
        &target.secret_key,
        &empty_hash,
        &amz_date,
    )?;

    let mut existing_content: Option<String> = None;
    let mut get_req = get_http_client()
        .get(&get_url)
        .header("User-Agent", EDGE_USER_AGENT);
    for (k, v) in get_headers {
        get_req = get_req.header(k, v);
    }
    if let Ok(resp) = get_req.send().await {
        if resp.status().is_success() {
            if let Ok(bytes) = super::types::read_bounded_response_bytes(resp).await {
                existing_content = String::from_utf8(bytes).ok();
            }
        }
    }

    let payload_str = absorb_existing_remote_lineage_and_prepare_payload(
        existing_content.as_deref(),
        manifest,
        is_catalog,
    )?;
    let sig_doc = build_detached_sig_json(manifest)?;

    s3_put_bytes(
        &target,
        clean_key,
        "application/json",
        payload_str.into_bytes(),
        false,
    )
    .await?;

    let sig_key = if let Some((dir, _)) = clean_key.rsplit_once('/') {
        format!("{}/{}", dir, SANCTUARY_EDGE_MANIFEST_SIG_FILE)
    } else {
        SANCTUARY_EDGE_MANIFEST_SIG_FILE.to_string()
    };
    let _ = s3_put_bytes(
        &target,
        &sig_key,
        "application/json",
        sig_doc.into_bytes(),
        false,
    )
    .await;

    Ok(EdgePushResult {
        resolved_manifest_url: resolved_url,
        provider_ref: format!("{}/{}", target.bucket, clean_key),
        message: "Pushed signed manifest to S3 / Cloudflare R2".to_string(),
    })
}

pub(crate) async fn resolve_s3_zip_public_url(
    cfg: &EdgePushConfig,
    remote_manifest_path: &str,
    zip_filename: &str,
) -> Result<String, String> {
    let target = resolve_s3_target(cfg).await?;
    let clean_manifest_key = remote_manifest_path.trim().trim_start_matches('/');
    let zip_key = if let Some((dir, _)) = clean_manifest_key.rsplit_once('/') {
        format!("{}/{}", dir, zip_filename)
    } else {
        zip_filename.to_string()
    };
    Ok(format!("{}/{}", target.public_base_url, zip_key))
}

pub(crate) async fn upload_release_zip_to_s3_r2(
    cfg: &EdgePushConfig,
    zip_path: &Path,
    remote_manifest_path: &str,
    zip_filename: &str,
) -> Result<String, String> {
    let target = resolve_s3_target(cfg).await?;
    let clean_manifest_key = remote_manifest_path.trim().trim_start_matches('/');
    let zip_key = if let Some((dir, _)) = clean_manifest_key.rsplit_once('/') {
        format!("{}/{}", dir, zip_filename)
    } else {
        zip_filename.to_string()
    };
    let zip_bytes = std::fs::read(zip_path)
        .map_err(|e| format!("Failed reading release archive {:?} for S3 upload: {}", zip_path, e))?;
    s3_put_bytes(&target, &zip_key, "application/zip", zip_bytes, true).await?;
    Ok(format!("{}/{}", target.public_base_url, zip_key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_deterministic_aws_sigv4_authorization_header() {
        let body_hash = sha256_hex(b"hello-sanctuary");
        let headers = build_s3_sigv4_headers_at(
            "PUT",
            "/mods/.sanctuary.manifest.json",
            "acct123.r2.cloudflarestorage.com",
            "auto",
            "AKIAEXAMPLE",
            "SECRETEXAMPLE",
            &body_hash,
            "20261118T200000Z",
        )
        .unwrap();

        let auth = headers
            .iter()
            .find(|(k, _)| k == "Authorization")
            .map(|(_, v)| v.as_str())
            .unwrap();
        assert!(auth.starts_with(
            "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261118/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="
        ));
        let sig_hex = auth.split("Signature=").nth(1).unwrap();
        assert_eq!(sig_hex.len(), 64);

        // Identical inputs yield identical signature
        let headers_2 = build_s3_sigv4_headers_at(
            "PUT",
            "/mods/.sanctuary.manifest.json",
            "acct123.r2.cloudflarestorage.com",
            "auto",
            "AKIAEXAMPLE",
            "SECRETEXAMPLE",
            &body_hash,
            "20261118T200000Z",
        )
        .unwrap();
        assert_eq!(headers, headers_2);
    }
}
