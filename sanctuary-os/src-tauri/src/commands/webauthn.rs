use serde_json::{json, Value};

fn b64url_encode(data: &[u8]) -> String {
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

fn b64url_decode(input: &str) -> Result<Vec<u8>, String> {
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
            _ => continue,
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
        let raw_user_name = options["user"]["name"]
            .as_str()
            .unwrap_or("Sanctuary OS");
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

        let client_data_json = format!(
            r#"{{"type":"webauthn.create","challenge":"{}","origin":"{}","crossOrigin":false}}"#,
            challenge_str, origin
        );
        let client_data_bytes = client_data_json.as_bytes();

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
            dwAuthenticatorAttachment: 0, // ANY (Platform Windows Hello + USB/NFC Keys)
            bRequireResidentKey: 1,       // Discoverable passkey
            dwUserVerificationRequirement: 1, // REQUIRED
            dwAttestationConveyancePreference: 1, // NONE
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
            let client_data_b64 = b64url_encode(client_data_bytes);

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

        let client_data_json = format!(
            r#"{{"type":"webauthn.get","challenge":"{}","origin":"{}","crossOrigin":false}}"#,
            challenge_str, origin
        );
        let client_data_bytes = client_data_json.as_bytes();

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
            let client_data_b64 = b64url_encode(client_data_bytes);

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

#[tauri::command]
pub async fn native_webauthn_register(window: tauri::Window, options: Value) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        std::thread::spawn(move || win_webauthn::make_credential_sync(hwnd, options))
            .join()
            .map_err(|_| "WebAuthn thread panicked".to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, options);
        Err("Native WebAuthn bridge is only supported on Windows.".to_string())
    }
}

#[tauri::command]
pub async fn native_webauthn_authenticate(window: tauri::Window, options: Value) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        std::thread::spawn(move || win_webauthn::get_assertion_sync(hwnd, options))
            .join()
            .map_err(|_| "WebAuthn thread panicked".to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, options);
        Err("Native WebAuthn bridge is only supported on Windows.".to_string())
    }
}

