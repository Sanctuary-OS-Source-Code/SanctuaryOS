use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub(crate) fn b64url_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((data.len() * 4 + 2) / 3);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        out.push(TABLE[(n & 0x3F) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
    }
    out
}

pub(crate) fn b64url_decode(input: &str) -> Result<Vec<u8>, String> {
    let clean = input.trim().trim_end_matches('=');
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for b in clean.bytes() {
        let val: u32 = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'\r' | b'\n' | b' ' | b'\t' => continue,
            _ => return Err(format!("Invalid base64url character: {}", b as char)),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

pub(crate) fn serialize_webauthn_client_data(
    ceremony_type: &str,
    challenge: &str,
    origin: &str,
) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&json!({
        "type": ceremony_type,
        "challenge": challenge,
        "origin": origin,
        "crossOrigin": false,
    }))
    .map_err(|e| format!("Failed to serialize WebAuthn clientDataJSON: {}", e))
}

/// Local AES-256-GCM encrypted passkey private-key store keyed by a random per-install 256-bit
/// master secret persisted locally with `0600` permissions (never derived from `machine_uid`, and
/// never embedding private key material inside the transmitted `credentialId`).
#[allow(dead_code)]
pub(crate) mod local_passkey_vault {
    use super::{b64url_decode, b64url_encode, Deserialize, Serialize};
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    use ring::rand::{SecureRandom, SystemRandom};
    use std::fs;
    use std::path::{Path, PathBuf};

    #[derive(Serialize, Deserialize, Clone)]
    pub struct StoredLocalPasskey {
        pub rp_id: String,
        pub cred_id_b64: String,
        pub user_handle_b64: String,
        pub nonce_b64: String,
        pub sealed_priv_key_b64: String,
        pub created_at: u64,
    }

    fn secure_passkey_dir() -> Result<PathBuf, String> {
        let mut dir = dirs::data_local_dir()
            .or_else(dirs::home_dir)
            .ok_or_else(|| "Unable to resolve local application data directory.".to_string())?;
        dir.push("SanctuaryOS");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed creating local passkey directory: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }
        Ok(dir)
    }

    fn write_restricted_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
        crate::utils::atomic_write_bytes(path, bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Failed setting 0600 permissions on {:?}: {}", path, e))?;
        }
        #[cfg(target_os = "windows")]
        {
            crate::utils::mark_path_hidden(path);
        }
        Ok(())
    }

    pub fn load_or_create_master_key() -> Result<[u8; 32], String> {
        let key_path = secure_passkey_dir()?.join(".passkey_master_key.bin");
        if key_path.exists() {
            let raw = fs::read(&key_path)
                .map_err(|e| format!("Failed reading local passkey master key: {}", e))?;
            if raw.len() == 32 {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600));
                }
                let mut key = [0u8; 32];
                key.copy_from_slice(&raw);
                return Ok(key);
            }
        }

        let rng = SystemRandom::new();
        let mut fresh_key = [0u8; 32];
        rng.fill(&mut fresh_key)
            .map_err(|_| "OS CSPRNG failed generating 256-bit passkey master secret.".to_string())?;
        write_restricted_file(&key_path, &fresh_key)?;
        Ok(fresh_key)
    }

    pub fn generate_opaque_credential_id() -> Result<Vec<u8>, String> {
        let rng = SystemRandom::new();
        let mut cred_id = vec![0u8; 32];
        rng.fill(&mut cred_id)
            .map_err(|_| "OS CSPRNG failed generating opaque WebAuthn credential ID.".to_string())?;
        Ok(cred_id)
    }

    fn build_aad(rp_id: &str, cred_id_b64: &str) -> Vec<u8> {
        format!("sanctuary-webauthn-aes256gcm-v2:{}:{}", rp_id, cred_id_b64).into_bytes()
    }

    pub fn seal_private_key_with_key(
        master_key: &[u8; 32],
        rp_id: &str,
        cred_id_b64: &str,
        plaintext_priv_key: &[u8],
    ) -> Result<(String, String), String> {
        let rng = SystemRandom::new();
        let mut nonce_bytes = [0u8; 12];
        rng.fill(&mut nonce_bytes)
            .map_err(|_| "OS CSPRNG failed generating AES-256-GCM nonce.".to_string())?;

        let unbound = UnboundKey::new(&AES_256_GCM, master_key)
            .map_err(|_| "Failed initializing AES-256-GCM key.".to_string())?;
        let key = LessSafeKey::new(unbound);

        let aad_bytes = build_aad(rp_id, cred_id_b64);
        let mut in_out = plaintext_priv_key.to_vec();
        key.seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce_bytes),
            Aad::from(&aad_bytes),
            &mut in_out,
        )
        .map_err(|_| "AES-256-GCM encryption failed.".to_string())?;

        Ok((b64url_encode(&nonce_bytes), b64url_encode(&in_out)))
    }

    pub fn unseal_private_key_with_key(
        master_key: &[u8; 32],
        rp_id: &str,
        cred_id_b64: &str,
        nonce_b64: &str,
        sealed_b64: &str,
    ) -> Result<Vec<u8>, String> {
        let nonce_vec = b64url_decode(nonce_b64)?;
        if nonce_vec.len() != 12 {
            return Err("Invalid AES-256-GCM nonce length.".to_string());
        }
        let mut nonce_bytes = [0u8; 12];
        nonce_bytes.copy_from_slice(&nonce_vec);

        let mut in_out = b64url_decode(sealed_b64)?;
        let unbound = UnboundKey::new(&AES_256_GCM, master_key)
            .map_err(|_| "Failed initializing AES-256-GCM decryption key.".to_string())?;
        let key = LessSafeKey::new(unbound);

        let aad_bytes = build_aad(rp_id, cred_id_b64);
        let plaintext = key
            .open_in_place(
                Nonce::assume_unique_for_key(nonce_bytes),
                Aad::from(&aad_bytes),
                &mut in_out,
            )
            .map_err(|_| "AES-256-GCM authentication tag verification failed.".to_string())?;
        Ok(plaintext.to_vec())
    }

    fn vault_store_path() -> Result<PathBuf, String> {
        Ok(secure_passkey_dir()?.join("local_passkey_vault_v2.json"))
    }

    pub fn load_stored_credentials() -> Vec<StoredLocalPasskey> {
        let Ok(path) = vault_store_path() else {
            return Vec::new();
        };
        let Ok(raw) = fs::read_to_string(path) else {
            return Vec::new();
        };
        serde_json::from_str::<Vec<StoredLocalPasskey>>(&raw).unwrap_or_default()
    }

    pub fn save_stored_credential(entry: StoredLocalPasskey) -> Result<(), String> {
        let path = vault_store_path()?;
        let mut list = load_stored_credentials();
        list.retain(|item| item.cred_id_b64 != entry.cred_id_b64);
        list.insert(0, entry);
        let serialized = serde_json::to_string_pretty(&list)
            .map_err(|e| format!("Failed serializing passkey store: {}", e))?;
        write_restricted_file(&path, serialized.as_bytes())
    }
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
mod win_webauthn {
    use super::*;
    use std::ffi::c_void;
    use std::ptr;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    #[repr(C)]
    struct WEBAUTHN_RP_ENTITY_INFORMATION {
        dwVersion: u32,
        pwszId: *const u16,
        pwszName: *const u16,
        pwszIcon: *const u16,
    }

    #[repr(C)]
    struct WEBAUTHN_USER_ENTITY_INFORMATION {
        dwVersion: u32,
        cbId: u32,
        pbId: *const u8,
        pwszName: *const u16,
        pwszIcon: *const u16,
        pwszDisplayName: *const u16,
    }

    #[repr(C)]
    struct WEBAUTHN_COSE_CREDENTIAL_PARAMETER {
        dwVersion: u32,
        pwszCredentialType: *const u16,
        lAlg: i32,
    }

    #[repr(C)]
    struct WEBAUTHN_COSE_CREDENTIAL_PARAMETERS {
        cCredentialParameters: u32,
        pCredentialParameters: *const WEBAUTHN_COSE_CREDENTIAL_PARAMETER,
    }

    #[repr(C)]
    struct WEBAUTHN_CLIENT_DATA {
        dwVersion: u32,
        cbClientDataJSON: u32,
        pbClientDataJSON: *const u8,
        pwszHashAlgId: *const u16,
    }

    #[repr(C)]
    struct WEBAUTHN_CREDENTIAL {
        dwVersion: u32,
        cbId: u32,
        pbId: *const u8,
        pwszCredentialType: *const u16,
    }

    #[repr(C)]
    struct WEBAUTHN_CREDENTIALS {
        cCredentials: u32,
        pCredentials: *const WEBAUTHN_CREDENTIAL,
    }

    #[repr(C)]
    struct WEBAUTHN_EXTENSIONS {
        cExtensions: u32,
        pExtensions: *const c_void,
    }

    #[repr(C)]
    struct WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS {
        dwVersion: u32,
        dwTimeoutMilliseconds: u32,
        CredentialList: WEBAUTHN_CREDENTIALS,
        Extensions: WEBAUTHN_EXTENSIONS,
        dwAuthenticatorAttachment: u32,
        bRequireResidentKey: i32,
        dwUserVerificationRequirement: u32,
        dwAttestationConveyancePreference: u32,
        dwFlags: u32,
    }

    #[repr(C)]
    struct WEBAUTHN_CREDENTIAL_ATTESTATION {
        dwVersion: u32,
        pwszFormatType: *const u16,
        cbAuthenticatorData: u32,
        pbAuthenticatorData: *const u8,
        cbAttestation: u32,
        pbAttestation: *const u8,
        dwAttestationDecodeType: u32,
        pvAttestationDecode: *const c_void,
        cbAttestationObject: u32,
        pbAttestationObject: *const u8,
        cbCredentialId: u32,
        pbCredentialId: *const u8,
    }

    #[repr(C)]
    struct WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS {
        dwVersion: u32,
        dwTimeoutMilliseconds: u32,
        CredentialList: WEBAUTHN_CREDENTIALS,
        Extensions: WEBAUTHN_EXTENSIONS,
        dwAuthenticatorAttachment: u32,
        dwUserVerificationRequirement: u32,
        dwFlags: u32,
    }

    #[repr(C)]
    struct WEBAUTHN_ASSERTION {
        dwVersion: u32,
        cbAuthenticatorData: u32,
        pbAuthenticatorData: *const u8,
        cbSignature: u32,
        pbSignature: *const u8,
        Credential: WEBAUTHN_CREDENTIAL,
        cbUserId: u32,
        pbUserId: *const u8,
    }

    #[link(name = "webauthn.dll", kind = "raw-dylib")]
    extern "system" {
        fn WebAuthNAuthenticatorMakeCredential(
            hWnd: isize,
            pRpInformation: *const WEBAUTHN_RP_ENTITY_INFORMATION,
            pUserInformation: *const WEBAUTHN_USER_ENTITY_INFORMATION,
            pPubKeyCredParams: *const WEBAUTHN_COSE_CREDENTIAL_PARAMETERS,
            pWebAuthNClientData: *const WEBAUTHN_CLIENT_DATA,
            pWebAuthNMakeCredentialOptions: *const WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS,
            ppWebAuthNCredentialAttestation: *mut *mut WEBAUTHN_CREDENTIAL_ATTESTATION,
        ) -> i32;

        fn WebAuthNFreeCredentialAttestation(
            pWebAuthNCredentialAttestation: *mut WEBAUTHN_CREDENTIAL_ATTESTATION,
        );

        fn WebAuthNAuthenticatorGetAssertion(
            hWnd: isize,
            pwszRpId: *const u16,
            pWebAuthNClientData: *const WEBAUTHN_CLIENT_DATA,
            pWebAuthNGetAssertionOptions: *const WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS,
            ppWebAuthNAssertion: *mut *mut WEBAUTHN_ASSERTION,
        ) -> i32;

        fn WebAuthNFreeAssertion(pWebAuthNAssertion: *mut WEBAUTHN_ASSERTION);
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn make_credential_sync(hwnd_override: isize, options: Value) -> Result<Value, String> {
        let rp_id = options["rp"]["id"]
            .as_str()
            .unwrap_or("sanctuaryos.net")
            .to_string();
        let rp_name = options["rp"]["name"]
            .as_str()
            .unwrap_or("Sanctuary OS")
            .to_string();

        let challenge_str = options["challenge"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn challenge".to_string())?;

        let user_id_str = options["user"]["id"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn user.id".to_string())?;
        let user_id_bytes = b64url_decode(user_id_str)?;
        let raw_user_name = options["user"]["name"].as_str().unwrap_or("Sanctuary OS");
        let user_name = if raw_user_name.contains('@') || raw_user_name.trim().is_empty() {
            "Sanctuary OS".to_string()
        } else {
            raw_user_name.trim().to_string()
        };
        let raw_disp_name = options["user"]["displayName"]
            .as_str()
            .unwrap_or(&user_name);
        let user_display_name = if raw_disp_name.contains('@') || raw_disp_name.trim().is_empty() {
            user_name.clone()
        } else {
            raw_disp_name.trim().to_string()
        };

        let origin = if let Some(custom_origin) = options["originOverride"].as_str() {
            custom_origin.to_string()
        } else if rp_id == "localhost" {
            "https://sanctuaryos.net".to_string()
        } else {
            format!("https://{}", rp_id)
        };

        let client_data_bytes =
            serialize_webauthn_client_data("webauthn.create", challenge_str, &origin)?;

        let rp_id_w = to_wide(&rp_id);
        let rp_name_w = to_wide(&rp_name);
        let user_name_w = to_wide(&user_name);
        let user_disp_w = to_wide(&user_display_name);
        let cred_type_w = to_wide("public-key");
        let sha256_w = to_wide("SHA-256");

        let rp_info = WEBAUTHN_RP_ENTITY_INFORMATION {
            dwVersion: 1,
            pwszId: rp_id_w.as_ptr(),
            pwszName: rp_name_w.as_ptr(),
            pwszIcon: ptr::null(),
        };

        let user_info = WEBAUTHN_USER_ENTITY_INFORMATION {
            dwVersion: 1,
            cbId: user_id_bytes.len() as u32,
            pbId: user_id_bytes.as_ptr(),
            pwszName: user_name_w.as_ptr(),
            pwszIcon: ptr::null(),
            pwszDisplayName: user_disp_w.as_ptr(),
        };

        let mut cose_params: Vec<WEBAUTHN_COSE_CREDENTIAL_PARAMETER> = Vec::new();
        if let Some(arr) = options["pubKeyCredParams"].as_array() {
            for item in arr {
                if let Some(alg) = item["alg"].as_i64() {
                    cose_params.push(WEBAUTHN_COSE_CREDENTIAL_PARAMETER {
                        dwVersion: 1,
                        pwszCredentialType: cred_type_w.as_ptr(),
                        lAlg: alg as i32,
                    });
                }
            }
        }
        if cose_params.is_empty() {
            for alg in [-7i32, -257i32, -8i32] {
                cose_params.push(WEBAUTHN_COSE_CREDENTIAL_PARAMETER {
                    dwVersion: 1,
                    pwszCredentialType: cred_type_w.as_ptr(),
                    lAlg: alg,
                });
            }
        }

        let cose_params_struct = WEBAUTHN_COSE_CREDENTIAL_PARAMETERS {
            cCredentialParameters: cose_params.len() as u32,
            pCredentialParameters: cose_params.as_ptr(),
        };

        let client_data = WEBAUTHN_CLIENT_DATA {
            dwVersion: 1,
            cbClientDataJSON: client_data_bytes.len() as u32,
            pbClientDataJSON: client_data_bytes.as_ptr(),
            pwszHashAlgId: sha256_w.as_ptr(),
        };

        let mut excluded_buffers: Vec<Vec<u8>> = Vec::new();
        let mut excluded_creds: Vec<WEBAUTHN_CREDENTIAL> = Vec::new();
        if let Some(arr) = options["excludeCredentials"].as_array() {
            for item in arr {
                if let Some(id_str) = item["id"].as_str() {
                    if let Ok(bytes) = b64url_decode(id_str) {
                        excluded_buffers.push(bytes);
                    }
                }
            }
        }
        for buf in &excluded_buffers {
            excluded_creds.push(WEBAUTHN_CREDENTIAL {
                dwVersion: 1,
                cbId: buf.len() as u32,
                pbId: buf.as_ptr(),
                pwszCredentialType: cred_type_w.as_ptr(),
            });
        }

        let make_opts = WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS {
            dwVersion: 1,
            dwTimeoutMilliseconds: 60000,
            CredentialList: WEBAUTHN_CREDENTIALS {
                cCredentials: excluded_creds.len() as u32,
                pCredentials: if excluded_creds.is_empty() {
                    ptr::null()
                } else {
                    excluded_creds.as_ptr()
                },
            },
            Extensions: WEBAUTHN_EXTENSIONS {
                cExtensions: 0,
                pExtensions: ptr::null(),
            },
            dwAuthenticatorAttachment: 0,
            bRequireResidentKey: 1,
            dwUserVerificationRequirement: 1,
            dwAttestationConveyancePreference: 1,
            dwFlags: 0,
        };

        unsafe {
            let hwnd = if hwnd_override != 0 {
                hwnd_override
            } else {
                GetForegroundWindow().0 as isize
            };
            let mut p_attestation: *mut WEBAUTHN_CREDENTIAL_ATTESTATION = ptr::null_mut();

            let hr = WebAuthNAuthenticatorMakeCredential(
                hwnd,
                &rp_info,
                &user_info,
                &cose_params_struct,
                &client_data,
                &make_opts,
                &mut p_attestation,
            );

            if hr < 0 || p_attestation.is_null() {
                if hr as u32 == 0x800704C7 || hr as u32 == 0x80090027 {
                    return Err("Passkey registration was cancelled.".to_string());
                }
                return Err(format!(
                    "Windows WebAuthn credential creation failed (0x{:08X}).",
                    hr as u32
                ));
            }

            let att = &*p_attestation;
            let cred_id_slice =
                std::slice::from_raw_parts(att.pbCredentialId, att.cbCredentialId as usize);
            let att_obj_slice = std::slice::from_raw_parts(
                att.pbAttestationObject,
                att.cbAttestationObject as usize,
            );

            let cred_id_b64 = b64url_encode(cred_id_slice);
            let att_obj_b64 = b64url_encode(att_obj_slice);
            let client_data_b64 = b64url_encode(&client_data_bytes);

            WebAuthNFreeCredentialAttestation(p_attestation);

            Ok(json!({
                "id": cred_id_b64,
                "rawId": cred_id_b64,
                "type": "public-key",
                "response": {
                    "clientDataJSON": client_data_b64,
                    "attestationObject": att_obj_b64,
                    "transports": ["internal", "hybrid", "usb", "nfc", "ble"]
                },
                "clientExtensionResults": {},
                "authenticatorAttachment": "platform"
            }))
        }
    }

    pub fn get_assertion_sync(hwnd_override: isize, options: Value) -> Result<Value, String> {
        let rp_id = options["rpId"]
            .as_str()
            .or_else(|| options["rp"]["id"].as_str())
            .unwrap_or("sanctuaryos.net")
            .to_string();

        let challenge_str = options["challenge"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn challenge".to_string())?;

        let origin = if let Some(custom_origin) = options["originOverride"].as_str() {
            custom_origin.to_string()
        } else if rp_id == "localhost" {
            "https://sanctuaryos.net".to_string()
        } else {
            format!("https://{}", rp_id)
        };

        let client_data_bytes =
            serialize_webauthn_client_data("webauthn.get", challenge_str, &origin)?;

        let rp_id_w = to_wide(&rp_id);
        let cred_type_w = to_wide("public-key");
        let sha256_w = to_wide("SHA-256");

        let client_data = WEBAUTHN_CLIENT_DATA {
            dwVersion: 1,
            cbClientDataJSON: client_data_bytes.len() as u32,
            pbClientDataJSON: client_data_bytes.as_ptr(),
            pwszHashAlgId: sha256_w.as_ptr(),
        };

        let mut allowed_buffers: Vec<Vec<u8>> = Vec::new();
        let mut allowed_creds: Vec<WEBAUTHN_CREDENTIAL> = Vec::new();
        if let Some(arr) = options["allowCredentials"].as_array() {
            for item in arr {
                if let Some(id_str) = item["id"].as_str() {
                    if let Ok(bytes) = b64url_decode(id_str) {
                        allowed_buffers.push(bytes);
                    }
                }
            }
        }
        for buf in &allowed_buffers {
            allowed_creds.push(WEBAUTHN_CREDENTIAL {
                dwVersion: 1,
                cbId: buf.len() as u32,
                pbId: buf.as_ptr(),
                pwszCredentialType: cred_type_w.as_ptr(),
            });
        }

        let get_opts = WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS {
            dwVersion: 1,
            dwTimeoutMilliseconds: 60000,
            CredentialList: WEBAUTHN_CREDENTIALS {
                cCredentials: allowed_creds.len() as u32,
                pCredentials: if allowed_creds.is_empty() {
                    ptr::null()
                } else {
                    allowed_creds.as_ptr()
                },
            },
            Extensions: WEBAUTHN_EXTENSIONS {
                cExtensions: 0,
                pExtensions: ptr::null(),
            },
            dwAuthenticatorAttachment: 0,
            dwUserVerificationRequirement: 1,
            dwFlags: 0,
        };

        unsafe {
            let hwnd = if hwnd_override != 0 {
                hwnd_override
            } else {
                GetForegroundWindow().0 as isize
            };
            let mut p_assertion: *mut WEBAUTHN_ASSERTION = ptr::null_mut();

            let hr = WebAuthNAuthenticatorGetAssertion(
                hwnd,
                rp_id_w.as_ptr(),
                &client_data,
                &get_opts,
                &mut p_assertion,
            );

            if hr < 0 || p_assertion.is_null() {
                if hr as u32 == 0x800704C7 || hr as u32 == 0x80090027 {
                    return Err("Passkey verification was cancelled.".to_string());
                }
                return Err(format!(
                    "Windows WebAuthn authentication failed (0x{:08X}).",
                    hr as u32
                ));
            }

            let assertion = &*p_assertion;
            let cred_id_slice = std::slice::from_raw_parts(
                assertion.Credential.pbId,
                assertion.Credential.cbId as usize,
            );
            let auth_data_slice = std::slice::from_raw_parts(
                assertion.pbAuthenticatorData,
                assertion.cbAuthenticatorData as usize,
            );
            let sig_slice =
                std::slice::from_raw_parts(assertion.pbSignature, assertion.cbSignature as usize);
            let user_handle = if !assertion.pbUserId.is_null() && assertion.cbUserId > 0 {
                let uh_slice =
                    std::slice::from_raw_parts(assertion.pbUserId, assertion.cbUserId as usize);
                Some(b64url_encode(uh_slice))
            } else {
                None
            };

            let cred_id_b64 = b64url_encode(cred_id_slice);
            let auth_data_b64 = b64url_encode(auth_data_slice);
            let sig_b64 = b64url_encode(sig_slice);
            let client_data_b64 = b64url_encode(&client_data_bytes);

            WebAuthNFreeAssertion(p_assertion);

            Ok(json!({
                "id": cred_id_b64,
                "rawId": cred_id_b64,
                "type": "public-key",
                "response": {
                    "authenticatorData": auth_data_b64,
                    "clientDataJSON": client_data_b64,
                    "signature": sig_b64,
                    "userHandle": user_handle
                },
                "clientExtensionResults": {},
                "authenticatorAttachment": "platform"
            }))
        }
    }
}

#[cfg(target_os = "macos")]
mod mac_webauthn {
    use super::local_passkey_vault::{
        generate_opaque_credential_id, load_or_create_master_key, load_stored_credentials,
        save_stored_credential, seal_private_key_with_key, unseal_private_key_with_key,
        StoredLocalPasskey,
    };
    use super::{b64url_decode, b64url_encode, serialize_webauthn_client_data};
    use serde_json::{json, Value};
    use sha2::{Digest, Sha256};
    use std::ffi::{c_char, c_void, CString};
    use std::ptr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Condvar, Mutex};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[link(name = "LocalAuthentication", kind = "framework")]
    #[link(name = "Foundation", kind = "framework")]
    #[link(name = "Security", kind = "framework")]
    #[link(name = "CoreFoundation", kind = "framework")]
    #[link(name = "objc", kind = "dylib")]
    extern "C" {
        static _NSConcreteStackBlock: *const c_void;
        static kCFBooleanFalse: *const c_void;
        static kSecAttrKeyType: *const c_void;
        static kSecAttrKeyTypeECSECPrimeRandom: *const c_void;
        static kSecAttrKeySizeInBits: *const c_void;
        static kSecAttrKeyClass: *const c_void;
        static kSecAttrKeyClassPrivate: *const c_void;
        static kSecAttrIsPermanent: *const c_void;
        static kSecKeyAlgorithmECDSASignatureMessageX962SHA256: *const c_void;

        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();

        fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            value_callbacks: *const c_void,
        ) -> *const c_void;
        fn CFNumberCreate(
            allocator: *const c_void,
            the_type: isize,
            value_ptr: *const c_void,
        ) -> *const c_void;
        fn CFDataCreate(
            allocator: *const c_void,
            bytes: *const u8,
            length: isize,
        ) -> *const c_void;
        fn CFDataGetBytePtr(the_data: *const c_void) -> *const u8;
        fn CFDataGetLength(the_data: *const c_void) -> isize;
        fn CFRelease(cf: *const c_void);

        fn SecKeyCreateRandomKey(
            parameters: *const c_void,
            error: *mut *const c_void,
        ) -> *const c_void;
        fn SecKeyCopyExternalRepresentation(
            key: *const c_void,
            error: *mut *const c_void,
        ) -> *const c_void;
        fn SecKeyCreateWithData(
            key_data: *const c_void,
            attributes: *const c_void,
            error: *mut *const c_void,
        ) -> *const c_void;
        fn SecKeyCreateSignature(
            key: *const c_void,
            algorithm: *const c_void,
            data_to_sign: *const c_void,
            error: *mut *const c_void,
        ) -> *const c_void;
    }

    #[repr(C)]
    struct MacBlockDescriptor {
        reserved: usize,
        size: usize,
    }

    struct LaWaitState {
        result: Mutex<Option<Result<(), String>>>,
        cvar: Condvar,
        claimed: AtomicBool,
    }

    #[repr(C)]
    struct MacLaBlock {
        isa: *const c_void,
        flags: i32,
        reserved: i32,
        invoke: unsafe extern "C" fn(*mut MacLaBlock, i8, *mut c_void),
        descriptor: *const MacBlockDescriptor,
        state_ptr: *const LaWaitState,
    }

    static LA_BLOCK_DESCRIPTOR: MacBlockDescriptor = MacBlockDescriptor {
        reserved: 0,
        size: std::mem::size_of::<MacLaBlock>(),
    };

    unsafe extern "C" fn la_eval_block_invoke(
        block: *mut MacLaBlock,
        success: i8,
        _error: *mut c_void,
    ) {
        if block.is_null() {
            return;
        }
        let state_ptr = (*block).state_ptr;
        if state_ptr.is_null() {
            return;
        }
        let state_ref = &*state_ptr;
        if !state_ref.claimed.swap(true, Ordering::SeqCst) {
            let arc_state = Arc::from_raw(state_ptr);
            let outcome = if (success & 1) != 0 {
                Ok(())
            } else {
                Err("Passkey verification was cancelled.".to_string())
            };
            {
                let lock_res = arc_state.result.lock();
                if let Ok(mut guard) = lock_res {
                    *guard = Some(outcome);
                    arc_state.cvar.notify_all();
                }
            }
            drop(arc_state);
        }
    }

    fn verify_macos_touch_id(reason: &str) -> Result<(), String> {
        unsafe {
            let la_cls_name = CString::new("LAContext").unwrap();
            let ns_str_cls_name = CString::new("NSString").unwrap();
            let sel_alloc_name = CString::new("alloc").unwrap();
            let sel_init_name = CString::new("init").unwrap();
            let sel_release_name = CString::new("release").unwrap();
            let sel_utf8_name = CString::new("stringWithUTF8String:").unwrap();
            let sel_can_eval_name = CString::new("canEvaluatePolicy:error:").unwrap();
            let sel_eval_name = CString::new("evaluatePolicy:localizedReason:reply:").unwrap();

            let la_cls = objc_getClass(la_cls_name.as_ptr());
            let ns_str_cls = objc_getClass(ns_str_cls_name.as_ptr());
            if la_cls.is_null() || ns_str_cls.is_null() {
                return Err("macOS LocalAuthentication framework is unavailable.".to_string());
            }

            let sel_alloc = sel_registerName(sel_alloc_name.as_ptr());
            let sel_init = sel_registerName(sel_init_name.as_ptr());
            let sel_release = sel_registerName(sel_release_name.as_ptr());
            let sel_utf8 = sel_registerName(sel_utf8_name.as_ptr());
            let sel_can_eval = sel_registerName(sel_can_eval_name.as_ptr());
            let sel_eval = sel_registerName(sel_eval_name.as_ptr());

            let msg_send_id: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const c_void);
            let msg_send_void: unsafe extern "C" fn(*mut c_void, *mut c_void) =
                std::mem::transmute(objc_msgSend as *const c_void);
            let msg_send_str: unsafe extern "C" fn(
                *mut c_void,
                *mut c_void,
                *const c_char,
            ) -> *mut c_void = std::mem::transmute(objc_msgSend as *const c_void);
            let msg_send_can_eval: unsafe extern "C" fn(
                *mut c_void,
                *mut c_void,
                isize,
                *mut *mut c_void,
            ) -> i8 = std::mem::transmute(objc_msgSend as *const c_void);
            let msg_send_eval: unsafe extern "C" fn(
                *mut c_void,
                *mut c_void,
                isize,
                *mut c_void,
                *mut MacLaBlock,
            ) = std::mem::transmute(objc_msgSend as *const c_void);

            let ctx_alloc = msg_send_id(la_cls, sel_alloc);
            let ctx = msg_send_id(ctx_alloc, sel_init);
            if ctx.is_null() {
                return Err("Failed to initialize macOS Touch ID context.".to_string());
            }

            let mut err_ptr: *mut c_void = ptr::null_mut();
            let policy: isize = 2;
            let can_eval = msg_send_can_eval(ctx, sel_can_eval, policy, &mut err_ptr);
            if (can_eval & 1) == 0 {
                msg_send_void(ctx, sel_release);
                return Err(
                    "macOS Touch ID or System Authentication is not configured on this Mac."
                        .to_string(),
                );
            }

            let c_reason = CString::new(reason)
                .unwrap_or_else(|_| CString::new("Authenticate with Touch ID").unwrap());
            let ns_reason = msg_send_str(ns_str_cls, sel_utf8, c_reason.as_ptr());

            let wait_state = Arc::new(LaWaitState {
                result: Mutex::new(None),
                cvar: Condvar::new(),
                claimed: AtomicBool::new(false),
            });
            let raw_state = Arc::into_raw(wait_state.clone());

            let mut block = MacLaBlock {
                isa: _NSConcreteStackBlock,
                flags: 0,
                reserved: 0,
                invoke: la_eval_block_invoke,
                descriptor: &LA_BLOCK_DESCRIPTOR,
                state_ptr: raw_state,
            };

            msg_send_eval(ctx, sel_eval, policy, ns_reason, &mut block);

            let (final_res, timed_out) = {
                let guard = wait_state
                    .result
                    .lock()
                    .map_err(|_| "Touch ID synchronization failed.".to_string())?;
                let (guard, timeout_res) = wait_state
                    .cvar
                    .wait_timeout_while(guard, Duration::from_secs(60), |res| res.is_none())
                    .map_err(|_| "Touch ID wait interrupted.".to_string())?;
                (guard.clone(), timeout_res.timed_out())
            };

            msg_send_void(ctx, sel_release);

            if timed_out {
                if !wait_state.claimed.swap(true, Ordering::SeqCst) {
                    let _ = Arc::from_raw(raw_state);
                }
                return Err("Touch ID verification timed out.".to_string());
            }

            final_res.unwrap_or_else(|| Err("Passkey verification was cancelled.".to_string()))
        }
    }

    fn generate_p256_x963_keypair() -> Result<Vec<u8>, String> {
        unsafe {
            let bit_size: i32 = 256;
            let cf_bits = CFNumberCreate(ptr::null(), 3, &bit_size as *const i32 as *const c_void);
            if cf_bits.is_null() {
                return Err("Failed to allocate CFNumber for P-256 key generation.".to_string());
            }

            let keys: [*const c_void; 3] =
                [kSecAttrKeyType, kSecAttrKeySizeInBits, kSecAttrIsPermanent];
            let values: [*const c_void; 3] =
                [kSecAttrKeyTypeECSECPrimeRandom, cf_bits, kCFBooleanFalse];

            let attrs = CFDictionaryCreate(
                ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                3,
                ptr::null(),
                ptr::null(),
            );
            CFRelease(cf_bits);
            if attrs.is_null() {
                return Err("Failed to create Security key attributes dictionary.".to_string());
            }

            let mut err: *const c_void = ptr::null();
            let priv_key = SecKeyCreateRandomKey(attrs, &mut err);
            CFRelease(attrs);
            if priv_key.is_null() {
                if !err.is_null() {
                    CFRelease(err);
                }
                return Err("macOS Security.framework failed to generate P-256 Passkey.".to_string());
            }

            let mut exp_err: *const c_void = ptr::null();
            let cf_data = SecKeyCopyExternalRepresentation(priv_key, &mut exp_err);
            CFRelease(priv_key);
            if cf_data.is_null() {
                if !exp_err.is_null() {
                    CFRelease(exp_err);
                }
                return Err("Failed to export P-256 Passkey representation.".to_string());
            }

            let len = CFDataGetLength(cf_data) as usize;
            let ptr_bytes = CFDataGetBytePtr(cf_data);
            let mut out = Vec::with_capacity(len);
            if !ptr_bytes.is_null() && len > 0 {
                out.extend_from_slice(std::slice::from_raw_parts(ptr_bytes, len));
            }
            CFRelease(cf_data);

            if out.len() != 97 || out[0] != 0x04 {
                return Err(
                    "Unexpected P-256 key format from macOS Security.framework.".to_string(),
                );
            }
            Ok(out)
        }
    }

    fn sign_p256_sha256(x963_priv: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let bit_size: i32 = 256;
            let cf_bits = CFNumberCreate(ptr::null(), 3, &bit_size as *const i32 as *const c_void);
            if cf_bits.is_null() {
                return Err("Failed to allocate CFNumber for P-256 signing.".to_string());
            }

            let keys: [*const c_void; 3] =
                [kSecAttrKeyType, kSecAttrKeyClass, kSecAttrKeySizeInBits];
            let values: [*const c_void; 3] = [
                kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeyClassPrivate,
                cf_bits,
            ];

            let attrs = CFDictionaryCreate(
                ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                3,
                ptr::null(),
                ptr::null(),
            );
            CFRelease(cf_bits);
            if attrs.is_null() {
                return Err("Failed to create P-256 private key attributes.".to_string());
            }

            let cf_key_data =
                CFDataCreate(ptr::null(), x963_priv.as_ptr(), x963_priv.len() as isize);
            if cf_key_data.is_null() {
                CFRelease(attrs);
                return Err("Failed to create CFData for P-256 private key.".to_string());
            }

            let mut key_err: *const c_void = ptr::null();
            let priv_key = SecKeyCreateWithData(cf_key_data, attrs, &mut key_err);
            CFRelease(cf_key_data);
            CFRelease(attrs);
            if priv_key.is_null() {
                if !key_err.is_null() {
                    CFRelease(key_err);
                }
                return Err("Failed to reconstruct macOS P-256 Passkey.".to_string());
            }

            let cf_msg = CFDataCreate(ptr::null(), message.as_ptr(), message.len() as isize);
            if cf_msg.is_null() {
                CFRelease(priv_key);
                return Err("Failed to allocate CFData for WebAuthn payload.".to_string());
            }

            let mut sig_err: *const c_void = ptr::null();
            let cf_sig = SecKeyCreateSignature(
                priv_key,
                kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                cf_msg,
                &mut sig_err,
            );
            CFRelease(cf_msg);
            CFRelease(priv_key);

            if cf_sig.is_null() {
                if !sig_err.is_null() {
                    CFRelease(sig_err);
                }
                return Err(
                    "macOS Security.framework failed to sign WebAuthn assertion.".to_string(),
                );
            }

            let len = CFDataGetLength(cf_sig) as usize;
            let ptr_bytes = CFDataGetBytePtr(cf_sig);
            let mut sig_out = Vec::with_capacity(len);
            if !ptr_bytes.is_null() && len > 0 {
                sig_out.extend_from_slice(std::slice::from_raw_parts(ptr_bytes, len));
            }
            CFRelease(cf_sig);
            Ok(sig_out)
        }
    }

    fn encode_cose_p256_public_key(x: &[u8], y: &[u8]) -> Vec<u8> {
        let mut cose = Vec::with_capacity(77);
        cose.push(0xA5);
        cose.push(0x01);
        cose.push(0x02);
        cose.push(0x03);
        cose.push(0x26);
        cose.push(0x20);
        cose.push(0x01);
        cose.push(0x21);
        cose.push(0x58);
        cose.push(0x20);
        cose.extend_from_slice(&x[0..32]);
        cose.push(0x22);
        cose.push(0x58);
        cose.push(0x20);
        cose.extend_from_slice(&y[0..32]);
        cose
    }

    fn encode_none_attestation_object(auth_data: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(auth_data.len() + 32);
        out.push(0xA3);
        out.extend_from_slice(&[0x63, b'f', b'm', b't', 0x64, b'n', b'o', b'n', b'e']);
        out.extend_from_slice(&[0x67, b'a', b't', b't', b'S', b't', b'm', b't', 0xA0]);
        out.extend_from_slice(&[0x68, b'a', b'u', b't', b'h', b'D', b'a', b't', b'a']);
        let len = auth_data.len();
        if len <= 0xFF {
            out.push(0x58);
            out.push(len as u8);
        } else {
            out.push(0x59);
            out.extend_from_slice(&(len as u16).to_be_bytes());
        }
        out.extend_from_slice(auth_data);
        out
    }

    pub fn make_credential_sync(options: Value) -> Result<Value, String> {
        let rp_id = options["rp"]["id"]
            .as_str()
            .unwrap_or("sanctuaryos.net")
            .to_string();
        let challenge_str = options["challenge"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn challenge".to_string())?;
        let user_id_str = options["user"]["id"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn user.id".to_string())?;

        verify_macos_touch_id("register a Sanctuary OS FIDO2 Passkey")?;

        let origin = if let Some(custom_origin) = options["originOverride"].as_str() {
            custom_origin.to_string()
        } else if rp_id == "localhost" {
            "https://sanctuaryos.net".to_string()
        } else {
            format!("https://{}", rp_id)
        };

        let client_data_bytes =
            serialize_webauthn_client_data("webauthn.create", challenge_str, &origin)?;

        let mut x963_priv = generate_p256_x963_keypair()?;
        let pub_x = x963_priv[1..33].to_vec();
        let pub_y = x963_priv[33..65].to_vec();

        // Generate an opaque 32-byte random credentialId — private key material NEVER leaves local storage!
        let cred_id = generate_opaque_credential_id()?;
        let cred_id_b64 = b64url_encode(&cred_id);

        let mut master_key = load_or_create_master_key()?;
        let seal_res = seal_private_key_with_key(&master_key, &rp_id, &cred_id_b64, &x963_priv);
        master_key.fill(0);
        x963_priv.fill(0);
        let (nonce_b64, sealed_priv_key_b64) = seal_res?;

        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(1);

        save_stored_credential(StoredLocalPasskey {
            rp_id: rp_id.clone(),
            cred_id_b64: cred_id_b64.clone(),
            user_handle_b64: user_id_str.to_string(),
            nonce_b64,
            sealed_priv_key_b64,
            created_at: now_secs,
        })?;

        let mut rp_hasher = Sha256::new();
        rp_hasher.update(rp_id.as_bytes());
        let rp_id_hash = rp_hasher.finalize();

        let cose_pub_key = encode_cose_p256_public_key(&pub_x, &pub_y);
        let sign_count = (now_secs as u32).to_be_bytes();

        let mut auth_data = Vec::with_capacity(37 + 18 + cred_id.len() + cose_pub_key.len());
        auth_data.extend_from_slice(&rp_id_hash);
        auth_data.push(0x45);
        auth_data.extend_from_slice(&sign_count);
        auth_data.extend_from_slice(&[0u8; 16]);
        auth_data.extend_from_slice(&(cred_id.len() as u16).to_be_bytes());
        auth_data.extend_from_slice(&cred_id);
        auth_data.extend_from_slice(&cose_pub_key);

        let attestation_obj = encode_none_attestation_object(&auth_data);
        let att_obj_b64 = b64url_encode(&attestation_obj);
        let client_data_b64 = b64url_encode(&client_data_bytes);

        Ok(json!({
            "id": cred_id_b64,
            "rawId": cred_id_b64,
            "type": "public-key",
            "response": {
                "clientDataJSON": client_data_b64,
                "attestationObject": att_obj_b64,
                "transports": ["internal", "hybrid"]
            },
            "clientExtensionResults": {},
            "authenticatorAttachment": "platform"
        }))
    }

    pub fn get_assertion_sync(options: Value) -> Result<Value, String> {
        let rp_id = options["rpId"]
            .as_str()
            .or_else(|| options["rp"]["id"].as_str())
            .unwrap_or("sanctuaryos.net")
            .to_string();
        let challenge_str = options["challenge"]
            .as_str()
            .ok_or_else(|| "Missing WebAuthn challenge".to_string())?;

        let stored_list = load_stored_credentials();
        let mut matched_entry: Option<StoredLocalPasskey> = None;

        if let Some(arr) = options["allowCredentials"].as_array() {
            for item in arr {
                if let Some(id_str) = item["id"].as_str() {
                    if let Some(found) = stored_list
                        .iter()
                        .find(|c| c.rp_id == rp_id && c.cred_id_b64 == id_str.trim())
                    {
                        matched_entry = Some(found.clone());
                        break;
                    }
                }
            }
        }

        if matched_entry.is_none() {
            if let Some(found) = stored_list.iter().find(|c| c.rp_id == rp_id) {
                matched_entry = Some(found.clone());
            }
        }

        let entry = matched_entry.ok_or_else(|| {
            "No macOS Touch ID Passkey found on this Mac for this account. Register a Passkey with Touch ID or use Companion Passkey Handshake.".to_string()
        })?;

        let cred_id_bytes = b64url_decode(&entry.cred_id_b64)?;

        // Gate key unsealing strictly behind Touch ID / system biometric verification
        verify_macos_touch_id("authenticate your Sanctuary OS FIDO2 Passkey")?;

        let mut master_key = load_or_create_master_key()?;
        let unseal_res = unseal_private_key_with_key(
            &master_key,
            &entry.rp_id,
            &entry.cred_id_b64,
            &entry.nonce_b64,
            &entry.sealed_priv_key_b64,
        );
        master_key.fill(0);
        let mut x963_priv = unseal_res?;

        let origin = if let Some(custom_origin) = options["originOverride"].as_str() {
            custom_origin.to_string()
        } else if rp_id == "localhost" {
            "https://sanctuaryos.net".to_string()
        } else {
            format!("https://{}", rp_id)
        };

        let client_data_bytes =
            serialize_webauthn_client_data("webauthn.get", challenge_str, &origin)?;

        let mut rp_hasher = Sha256::new();
        rp_hasher.update(rp_id.as_bytes());
        let rp_id_hash = rp_hasher.finalize();

        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as u32)
            .unwrap_or(2);

        let mut auth_data = Vec::with_capacity(37);
        auth_data.extend_from_slice(&rp_id_hash);
        auth_data.push(0x05);
        auth_data.extend_from_slice(&now_secs.to_be_bytes());

        let mut client_hasher = Sha256::new();
        client_hasher.update(&client_data_bytes);
        let client_data_hash = client_hasher.finalize();

        let mut signed_payload = Vec::with_capacity(auth_data.len() + 32);
        signed_payload.extend_from_slice(&auth_data);
        signed_payload.extend_from_slice(&client_data_hash);

        let sign_res = sign_p256_sha256(&x963_priv, &signed_payload);
        x963_priv.fill(0);
        let signature_der = sign_res?;

        let cred_id_b64 = b64url_encode(&cred_id_bytes);
        let auth_data_b64 = b64url_encode(&auth_data);
        let sig_b64 = b64url_encode(&signature_der);
        let client_data_b64 = b64url_encode(&client_data_bytes);

        Ok(json!({
            "id": cred_id_b64,
            "rawId": cred_id_b64,
            "type": "public-key",
            "response": {
                "authenticatorData": auth_data_b64,
                "clientDataJSON": client_data_b64,
                "signature": sig_b64,
                "userHandle": Some(entry.user_handle_b64)
            },
            "clientExtensionResults": {},
            "authenticatorAttachment": "platform"
        }))
    }
}

#[tauri::command]
pub async fn native_webauthn_register(
    window: tauri::Window,
    options: Value,
) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || win_webauthn::make_credential_sync(hwnd, options))
            .await
            .map_err(|e| format!("WebAuthn task failed: {}", e))?
    }
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        tauri::async_runtime::spawn_blocking(move || mac_webauthn::make_credential_sync(options))
            .await
            .map_err(|e| format!("WebAuthn task failed: {}", e))?
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (window, options);
        Err("Native WebAuthn bridge is only supported on Windows and macOS.".to_string())
    }
}

#[tauri::command]
pub async fn native_webauthn_authenticate(
    window: tauri::Window,
    options: Value,
) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || win_webauthn::get_assertion_sync(hwnd, options))
            .await
            .map_err(|e| format!("WebAuthn task failed: {}", e))?
    }
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        tauri::async_runtime::spawn_blocking(move || mac_webauthn::get_assertion_sync(options))
            .await
            .map_err(|e| format!("WebAuthn task failed: {}", e))?
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (window, options);
        Err("Native WebAuthn bridge is only supported on Windows and macOS.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::local_passkey_vault::*;
    use super::*;

    #[test]
    fn client_data_json_escapes_injection_payloads() {
        let malicious_challenge = r#"abc","origin":"https://evil.example","extra":"#;
        let bytes = serialize_webauthn_client_data(
            "webauthn.get",
            malicious_challenge,
            "https://sanctuaryos.net",
        )
        .expect("serialize_webauthn_client_data");
        let parsed: Value = serde_json::from_slice(&bytes).expect("valid JSON");
        assert_eq!(parsed["type"], "webauthn.get");
        assert_eq!(parsed["challenge"], malicious_challenge);
        assert_eq!(parsed["origin"], "https://sanctuaryos.net");
        assert_eq!(parsed["crossOrigin"], false);
        assert!(parsed.get("extra").is_none());
    }

    #[test]
    fn aes_256_gcm_passkey_sealing_roundtrip_and_aad_binding() {
        let key = [0x42u8; 32];
        let cred_id = generate_opaque_credential_id().expect("opaque cred id");
        assert_eq!(cred_id.len(), 32);
        let cred_id_b64 = b64url_encode(&cred_id);
        let dummy_priv = vec![0x04u8; 97];

        let (nonce_b64, sealed_b64) =
            seal_private_key_with_key(&key, "sanctuaryos.net", &cred_id_b64, &dummy_priv)
                .expect("seal");
        assert_ne!(cred_id_b64, sealed_b64);

        let opened = unseal_private_key_with_key(
            &key,
            "sanctuaryos.net",
            &cred_id_b64,
            &nonce_b64,
            &sealed_b64,
        )
        .expect("unseal");
        assert_eq!(opened, dummy_priv);

        // Tampered RP ID must fail AES-GCM tag verification
        assert!(unseal_private_key_with_key(
            &key,
            "evil.example",
            &cred_id_b64,
            &nonce_b64,
            &sealed_b64,
        )
        .is_err());
    }
}
