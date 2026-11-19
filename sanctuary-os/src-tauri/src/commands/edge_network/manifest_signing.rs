use super::types::{EdgeManifest, EdgeManifestSignature};
use crate::commands::webauthn::{b64url_decode, b64url_encode, local_passkey_vault};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const CREATOR_KEY_DOMAIN: &str = "mason_manifest_ed25519";
const CREATOR_KEY_SCOPE: &str = "default_creator_key";
const MANIFEST_SIGNING_DOMAIN_TAG: &[u8] = b"SANCTUARY-EDGE-MANIFEST-V1:";

#[derive(Serialize, Deserialize)]
struct SealedSigningKeyRecord {
    public_key_b64: String,
    nonce_b64: String,
    sealed_pkcs8_b64: String,
}

fn creator_key_store_path() -> Result<PathBuf, String> {
    Ok(local_passkey_vault::secure_passkey_dir()?.join("creator_ed25519_signing_key_v1.json"))
}

fn canonicalize_json_value(v: serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let mut sorted = BTreeMap::new();
            for (k, val) in map {
                sorted.insert(k, canonicalize_json_value(val));
            }
            let mut out = serde_json::Map::new();
            for (k, val) in sorted {
                out.insert(k, val);
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(canonicalize_json_value).collect())
        }
        other => other,
    }
}

pub(crate) fn canonical_manifest_signing_bytes(
    manifest: &EdgeManifest,
) -> Result<(Vec<u8>, String), String> {
    let mut unsigned = manifest.clone();
    unsigned.signature = None;
    let val = serde_json::to_value(&unsigned)
        .map_err(|e| format!("Failed serializing manifest for signing: {}", e))?;
    let canon = canonicalize_json_value(val);
    let canon_json = serde_json::to_vec(&canon)
        .map_err(|e| format!("Failed encoding canonical manifest JSON: {}", e))?;

    let mut payload = Vec::with_capacity(MANIFEST_SIGNING_DOMAIN_TAG.len() + canon_json.len());
    payload.extend_from_slice(MANIFEST_SIGNING_DOMAIN_TAG);
    payload.extend_from_slice(&canon_json);

    let digest: String = Sha256::digest(&payload)
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    Ok((payload, digest))
}

fn load_or_create_creator_keypair() -> Result<Ed25519KeyPair, String> {
    let store_path = creator_key_store_path()?;
    let master_key = local_passkey_vault::load_or_create_master_key()?;

    if store_path.is_file() {
        if let Ok(raw) = fs::read_to_string(&store_path) {
            if let Ok(rec) = serde_json::from_str::<SealedSigningKeyRecord>(&raw) {
                if let Ok(pkcs8_bytes) = local_passkey_vault::unseal_private_key_with_key(
                    &master_key,
                    CREATOR_KEY_DOMAIN,
                    CREATOR_KEY_SCOPE,
                    &rec.nonce_b64,
                    &rec.sealed_pkcs8_b64,
                ) {
                    if let Ok(pair) = Ed25519KeyPair::from_pkcs8(&pkcs8_bytes) {
                        return Ok(pair);
                    }
                }
            }
        }
    }

    let rng = SystemRandom::new();
    let pkcs8_doc = Ed25519KeyPair::generate_pkcs8(&rng)
        .map_err(|_| "OS CSPRNG failed generating Ed25519 creator keypair.".to_string())?;
    let pair = Ed25519KeyPair::from_pkcs8(pkcs8_doc.as_ref())
        .map_err(|_| "Failed parsing freshly generated Ed25519 PKCS#8 key.".to_string())?;
    let pub_b64 = b64url_encode(pair.public_key().as_ref());
    let (nonce_b64, sealed_pkcs8_b64) = local_passkey_vault::seal_private_key_with_key(
        &master_key,
        CREATOR_KEY_DOMAIN,
        CREATOR_KEY_SCOPE,
        pkcs8_doc.as_ref(),
    )?;
    let rec = SealedSigningKeyRecord {
        public_key_b64: pub_b64,
        nonce_b64,
        sealed_pkcs8_b64,
    };
    let serialized = serde_json::to_string_pretty(&rec)
        .map_err(|e| format!("Failed serializing creator signing key: {}", e))?;
    local_passkey_vault::write_restricted_file(&store_path, serialized.as_bytes())?;
    Ok(pair)
}

pub(crate) fn build_detached_sig_json(manifest: &EdgeManifest) -> Result<String, String> {
    let sig_struct = manifest
        .signature
        .as_ref()
        .ok_or_else(|| "Manifest is not signed.".to_string())?;
    serde_json::to_string_pretty(&serde_json::json!({
        "schema_version": "1.0",
        "artifact_id": manifest.artifact.id,
        "version": manifest.artifact.version,
        "channel": manifest.artifact.channel,
        "signature": sig_struct,
    }))
    .map_err(|e| format!("Failed serializing detached manifest signature: {}", e))
}

pub(crate) fn sign_edge_manifest_with_keypair(
    manifest: &mut EdgeManifest,
    keypair: &Ed25519KeyPair,
) -> Result<String, String> {
    let (payload, payload_sha256) = canonical_manifest_signing_bytes(manifest)?;
    let sig = keypair.sign(&payload);
    let sig_struct = EdgeManifestSignature {
        algorithm: "ed25519".to_string(),
        public_key_b64: b64url_encode(keypair.public_key().as_ref()),
        signature_b64: b64url_encode(sig.as_ref()),
        signed_payload_sha256: payload_sha256,
    };
    manifest.signature = Some(sig_struct);
    build_detached_sig_json(manifest)
}

pub(crate) fn sign_edge_manifest(manifest: &mut EdgeManifest) -> Result<String, String> {
    let keypair = load_or_create_creator_keypair()?;
    sign_edge_manifest_with_keypair(manifest, &keypair)
}

/// Verifies an incoming `EdgeManifest`'s Ed25519 creator signature when present and enforces
/// Trust-On-First-Use (TOFU) key pinning whenever a prior `creator_pubkey` was recorded.
pub(crate) fn verify_edge_manifest_signature(
    manifest: &EdgeManifest,
    pinned_pubkey_b64: Option<&str>,
) -> Result<Option<String>, String> {
    let pinned = pinned_pubkey_b64.map(str::trim).filter(|s| !s.is_empty());
    let Some(ref sig) = manifest.signature else {
        if pinned.is_some() {
            return Err(
                "Manifest rejected: remote update removed required creator Ed25519 signature."
                    .to_string(),
            );
        }
        return Ok(None);
    };

    if !sig.algorithm.trim().eq_ignore_ascii_case("ed25519") {
        return Err(format!(
            "Unsupported manifest signature algorithm: {}",
            sig.algorithm
        ));
    }

    let pub_clean = sig.public_key_b64.trim();
    if let Some(expected_pub) = pinned {
        if pub_clean != expected_pub {
            return Err(
                "Manifest signature rejected: Ed25519 creator public key does not match pinned key."
                    .to_string(),
            );
        }
    }

    let pub_bytes = b64url_decode(pub_clean)?;
    if pub_bytes.len() != 32 {
        return Err("Invalid Ed25519 public key length in manifest signature.".to_string());
    }
    let sig_bytes = b64url_decode(&sig.signature_b64)?;
    if sig_bytes.len() != 64 {
        return Err("Invalid Ed25519 signature length in manifest signature.".to_string());
    }

    let (payload, payload_sha256) = canonical_manifest_signing_bytes(manifest)?;
    if !sig.signed_payload_sha256.trim().is_empty()
        && !sig
            .signed_payload_sha256
            .trim()
            .eq_ignore_ascii_case(&payload_sha256)
    {
        return Err(
            "Manifest signature rejected: canonical payload SHA-256 digest mismatch."
                .to_string(),
        );
    }

    let verifier = UnparsedPublicKey::new(&ED25519, &pub_bytes);
    verifier.verify(&payload, &sig_bytes).map_err(|_| {
        "Manifest signature rejected: Ed25519 cryptographic verification failed."
            .to_string()
    })?;

    Ok(Some(pub_clean.to_string()))
}

#[tauri::command]
pub fn get_mason_signing_public_key() -> Result<String, String> {
    let keypair = load_or_create_creator_keypair()?;
    Ok(b64url_encode(keypair.public_key().as_ref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ed25519_manifest_signing_verifies_and_rejects_tampering_or_key_swap() {
        let rng = SystemRandom::new();
        let pkcs8_a = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
        let kp_a = Ed25519KeyPair::from_pkcs8(pkcs8_a.as_ref()).unwrap();
        let pkcs8_b = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
        let kp_b = Ed25519KeyPair::from_pkcs8(pkcs8_b.as_ref()).unwrap();

        let mut manifest = EdgeManifest::default();
        manifest.schema_version = "1.0".to_string();
        manifest.artifact.id = "cool-mod".to_string();
        manifest.artifact.name = "Cool Mod".to_string();
        manifest.artifact.version = "2.1.0".to_string();
        manifest.artifact.channel = "beta".to_string();
        manifest.payload.download_url = "https://cdn.example.org/cool-mod.zip".to_string();
        manifest.payload.sha256 = "abcd1234".to_string();

        let detached = sign_edge_manifest_with_keypair(&mut manifest, &kp_a).unwrap();
        assert!(detached.contains("\"ed25519\""));
        let pub_a = verify_edge_manifest_signature(&manifest, None)
            .unwrap()
            .expect("Expected verified public key");
        assert!(verify_edge_manifest_signature(&manifest, Some(&pub_a)).is_ok());

        // Pinning against a different key fails
        let other_pub = b64url_encode(kp_b.public_key().as_ref());
        assert!(verify_edge_manifest_signature(&manifest, Some(&other_pub)).is_err());

        // Tampering with download_url fails verification
        let mut tampered = manifest.clone();
        tampered.payload.download_url = "https://evil.example.org/trojan.zip".to_string();
        assert!(verify_edge_manifest_signature(&tampered, Some(&pub_a)).is_err());

        // Stripping signature when pinned fails verification
        let mut unsigned = manifest.clone();
        unsigned.signature = None;
        assert!(verify_edge_manifest_signature(&unsigned, Some(&pub_a)).is_err());
    }
}
