/// <reference path="../deno.d.ts" />
import {
  UUID_REGEX,
  b64UrlToBytes,
  bytesToB64,
  createSpokeClient,
} from './cryptoEnvelope.ts'
import {
  decodeCborItem,
  verifyCoseSignature,
  isAllowedWebAuthnOrigin,
  matchesAllowedRpIdHash,
  formatUuidFromBytes,
} from './webauthnCbor.ts'
import {
  resolveGameWithServiceKey,
} from './spokeAccessAndOwnership.ts'
import { handleSubmitDmcaOrLegalNotice } from './dmcaComplianceActions.ts'

export async function handlePreAuthGatewayActions(ctx: {
  req: Request;
  action: string;
  payload: any;
  game_id: any;
  user: any;
  supabaseClient: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseAdmin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const { req: _req, action, payload, game_id, user, supabaseClient, supabaseUrl, supabaseAnonKey, supabaseAdmin, corsHeaders } = ctx;

    if (action === 'verify_webauthn_assertion') {
      const { challenge_id, credential } = payload || {}
      if (!challenge_id || !credential?.response) {
        throw new Error('Missing WebAuthn challenge_id or credential response')
      }

      const { data: challengeSnap } = await supabaseAdmin.rpc('internal_get_webauthn_challenge', {
        p_challenge_id: challenge_id,
      })

      const gotrueHeaders: Record<string, string> = {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      }
      const nativeRes = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/verify`, {
        method: 'POST',
        headers: gotrueHeaders,
        body: JSON.stringify({ challenge_id, credential }),
      })
      const nativeJson = await nativeRes.json().catch(() => ({}))
      if (nativeRes.ok) {
        const verifiedUid = user?.id || nativeJson?.user?.id
        if (verifiedUid) {
          try {
            let baseAppMeta = user?.app_metadata
            if (!baseAppMeta) {
              const { data: existingUsr } = await supabaseAdmin.auth.admin.getUserById(verifiedUid)
              baseAppMeta = existingUsr?.user?.app_metadata || {}
            }
            await supabaseAdmin.auth.admin.updateUserById(verifiedUid, {
              app_metadata: {
                ...(baseAppMeta || {}),
                last_passkey_verified_at: new Date().toISOString(),
              },
            })
          } catch {}
        }
        return new Response(JSON.stringify(nativeJson), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      if (!challengeSnap || challengeSnap.challenge_type !== 'authentication') {
        throw new Error(
          nativeJson?.msg ||
            nativeJson?.error_description ||
            nativeJson?.message ||
            'Passkey challenge expired or not found.'
        )
      }
      if (new Date(challengeSnap.expires_at).getTime() <= Date.now()) {
        throw new Error('Passkey authentication challenge has expired.')
      }

      const expectedChallenge = challengeSnap.session_data?.challenge
      const rpId = challengeSnap.session_data?.rpId || 'sanctuaryos.net'

      const clientDataBytes = b64UrlToBytes(credential.response.clientDataJSON)
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))
      if (clientData.type !== 'webauthn.get') {
        throw new Error('Invalid WebAuthn ceremony type.')
      }
      if (!expectedChallenge || clientData.challenge !== expectedChallenge) {
        throw new Error('WebAuthn challenge mismatch.')
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new Error(`Origin ${clientData.origin} is not authorized for RP ID ${rpId}.`)
      }

      const authDataBytes = b64UrlToBytes(credential.response.authenticatorData)
      if (authDataBytes.length < 37) {
        throw new Error('Invalid authenticatorData length.')
      }

      const rpHashValid = await matchesAllowedRpIdHash(authDataBytes, rpId, clientData.origin)
      if (!rpHashValid) {
        throw new Error('WebAuthn RP ID hash mismatch.')
      }

      const flags = authDataBytes[32]
      if ((flags & 0x01) === 0) {
        throw new Error('WebAuthn User Present flag not set.')
      }

      const signCount =
        ((authDataBytes[33] << 24) >>> 0) +
        ((authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36])

      const credIdB64 = bytesToB64(b64UrlToBytes(credential.rawId || credential.id))
      const { data: credRow } = await supabaseAdmin.rpc('internal_get_webauthn_credential', {
        p_credential_id_b64: credIdB64,
      })

      if (!credRow || !credRow.public_key_b64) {
        throw new Error('Passkey credential is not registered to any account.')
      }

      if (user?.id && credRow.user_id !== user.id) {
        throw new Error('This Passkey belongs to a different account.')
      }
      if (challengeSnap.user_id && credRow.user_id !== challengeSnap.user_id) {
        throw new Error('Passkey user mismatch for active challenge.')
      }

      // Enforce WebAuthn signature counter monotonicity (clone detection)
      const prevSignCount = Number(credRow.sign_count || 0)
      if (prevSignCount > 0 && signCount > 0 && signCount <= prevSignCount) {
        throw new Error('Passkey signature counter anomaly detected (possible cloned authenticator).')
      }

      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', clientDataBytes as BufferSource)
      )
      const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length)
      signedData.set(authDataBytes, 0)
      signedData.set(clientDataHash, authDataBytes.length)

      const sigBytes = b64UrlToBytes(credential.response.signature)
      const pubKeyBytes = b64UrlToBytes(credRow.public_key_b64)
      const isValidSig = await verifyCoseSignature(pubKeyBytes, signedData, sigBytes)
      if (!isValidSig) {
        throw new Error('Credential verification failed: invalid cryptographic signature.')
      }

      await supabaseAdmin.rpc('internal_complete_webauthn_authentication', {
        p_challenge_id: challenge_id,
        p_cred_row_id: credRow.id,
        p_sign_count: signCount,
      })

      const { data: targetUserRes } = await supabaseAdmin.auth.admin.getUserById(credRow.user_id)
      const existingAppMeta = user?.app_metadata || targetUserRes?.user?.app_metadata || {}

      try {
        await supabaseAdmin.auth.admin.updateUserById(credRow.user_id, {
          app_metadata: {
            ...existingAppMeta,
            last_passkey_verified_at: new Date().toISOString(),
          },
        })
      } catch {}

      if (!user) {
        const targetEmail = targetUserRes?.user?.email
        if (targetEmail) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: targetEmail,
          })
          const hashedToken = linkData?.properties?.hashed_token
          if (hashedToken) {
            const { data: otpData } = await supabaseClient.auth.verifyOtp({
              token_hash: hashedToken,
              type: 'magiclink',
            })
            if (otpData?.session) {
              return new Response(
                JSON.stringify({
                  ...otpData.session,
                  user: otpData.user || targetUserRes.user,
                  passkey_verified: true,
                  passkey_id: credRow.id,
                }),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200,
                }
              )
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          verified: true,
          passkey_verified: true,
          passkey_id: credRow.id,
          user: user || { id: credRow.user_id },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Unauthenticated zero-PII public Spoke actions
    if (action === 'increment_mason_post_view') {
      const postId = String(payload?.post_id || payload?.p_post_id || '').trim()
      if (!game_id || !UUID_REGEX.test(postId)) {
        throw new Error('Invalid game_id or post_id')
      }
      const { game, serviceKey: gameServiceKey } = await resolveGameWithServiceKey(supabaseAdmin, String(game_id))
      if (!game || !gameServiceKey) {
        throw new Error('Game DB gateway credential not configured')
      }
      const gameDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)
      const { error: rpcErr } = await gameDb.rpc('increment_mason_post_view', { p_post_id: postId })
      if (rpcErr) {
        const { data: postRow } = await gameDb
          .from('mason_posts')
          .select('view_count')
          .eq('id', postId)
          .maybeSingle()
        if (postRow && typeof postRow.view_count === 'number') {
          await gameDb
            .from('mason_posts')
            .update({ view_count: postRow.view_count + 1 })
            .eq('id', postId)
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'submit_anonymous_malware_manifest') {
      if (!game_id) {
        throw new Error('Missing game_id')
      }
      const detectedHash = String(payload?.detected_hash || '').trim().toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(detectedHash)) {
        throw new Error('Invalid SHA-256 detected_hash')
      }
      const rawName = String(payload?.artifact_name || 'Unknown').trim()
      const leafName =
        rawName
          .split(/[\\/]/)
          .pop()
          ?.replace(/[^\x20-\x7E]/g, '')
          .slice(0, 200)
          .trim() || 'Unknown'
      const cleanSig = String(payload?.signature || 'Known Malware Hash Match').trim().slice(0, 200)
      const { game, serviceKey: gameServiceKey } = await resolveGameWithServiceKey(supabaseAdmin, String(game_id))
      if (!game || !gameServiceKey) {
        throw new Error('Game DB gateway credential not configured')
      }
      const gameDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)
      const rawStatus = String(payload?.status || 'pending').trim().toLowerCase()
      const normalizedStatus =
        rawStatus === 'resolved' || rawStatus === 'dismissed'
          ? rawStatus
          : rawStatus === 'confirmed'
            ? 'confirmed'
            : 'pending'
      const baseRow: Record<string, any> = {
        artifact_name: leafName,
        detected_hash: detectedHash,
        signature: cleanSig,
        original_hash_at_import:
          typeof payload?.original_hash_at_import === 'string' && /^[0-9a-f]{64}$/i.test(payload.original_hash_at_import)
            ? payload.original_hash_at_import.toLowerCase()
            : detectedHash,
        original_exists: Boolean(payload?.original_exists),
        original_shredded: Boolean(payload?.original_shredded),
        quarantined_file_shredded: Boolean(payload?.quarantined_file_shredded),
        detected_at: typeof payload?.detected_at === 'string' ? payload.detected_at : new Date().toISOString(),
        status: normalizedStatus,
      }
      const extendedRow: Record<string, any> = {
        ...baseRow,
        source_moved: Boolean(payload?.source_moved),
        ingest_mode: typeof payload?.ingest_mode === 'string' ? payload.ingest_mode.slice(0, 64) : null,
        file_size_bytes: typeof payload?.file_size_bytes === 'number' ? payload.file_size_bytes : null,
        file_extension: typeof payload?.file_extension === 'string' ? payload.file_extension.slice(0, 24) : null,
        matched_entry: typeof payload?.matched_entry === 'string' ? payload.matched_entry.slice(0, 200) : null,
        detection_type: typeof payload?.detection_type === 'string' ? payload.detection_type.slice(0, 64) : null,
        detection_source: typeof payload?.detection_source === 'string' ? payload.detection_source.slice(0, 64) : null,
        os_platform: typeof payload?.os_platform === 'string' ? payload.os_platform.slice(0, 32) : null,
      }
      let ins = await gameDb.from('malware_reports').insert(extendedRow).select().maybeSingle()
      if (ins.error) {
        ins = await gameDb.from('malware_reports').insert(baseRow).select().maybeSingle()
      }
      if (ins.error) throw ins.error
      return new Response(JSON.stringify({ success: true, data: ins.data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'submit_dmca_or_legal_notice') {
      return await handleSubmitDmcaOrLegalNotice({
        payload,
        user,
        supabaseAdmin,
        corsHeaders,
      })
    }

  return null;
}

export async function handleWebAuthnRegistration(ctx: {
  req: Request;
  action: string;
  payload: any;
  token: string;
  user: any;
  v_user_id: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseAdmin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const { req: _req, action, payload, token, user, v_user_id, supabaseUrl, supabaseAnonKey, supabaseAdmin, corsHeaders } = ctx;

    if (action === 'verify_webauthn_registration') {
      const { challenge_id, credential, friendly_name } = payload || {}
      if (!challenge_id || !credential?.response) {
        throw new Error('Missing WebAuthn challenge_id or credential response')
      }

      const { data: challengeSnap } = await supabaseAdmin.rpc('internal_get_webauthn_challenge', {
        p_challenge_id: challenge_id,
      })

      const gotrueHeaders: Record<string, string> = {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }

      try {
        const existingRes = await fetch(`${supabaseUrl}/auth/v1/passkeys`, {
          method: 'GET',
          headers: gotrueHeaders,
        })
        if (existingRes.ok) {
          const existingJson = await existingRes.json().catch(() => [])
          const existingList = Array.isArray(existingJson)
            ? existingJson
            : Array.isArray(existingJson?.passkeys)
              ? existingJson.passkeys
              : []
          if (existingList.length > 0) {
            const lastVerifiedIso = user?.app_metadata?.last_passkey_verified_at
            const lastVerifiedMs = lastVerifiedIso ? new Date(lastVerifiedIso).getTime() : 0
            const TwelveHoursMs = 12 * 60 * 60 * 1000
            if (!lastVerifiedMs || Date.now() - lastVerifiedMs > TwelveHoursMs) {
              throw new Error(
                'Security Lock: An active FIDO2 Passkey is already registered on this account. Authenticate with your existing Passkey before registering an additional Passkey.'
              )
            }
          }
        }
      } catch (stepUpCheckErr: any) {
        if (String(stepUpCheckErr?.message || '').includes('Security Lock:')) {
          throw stepUpCheckErr
        }
      }

      const nativeRes = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/verify`, {
        method: 'POST',
        headers: gotrueHeaders,
        body: JSON.stringify({ challenge_id, credential }),
      })
      const nativeJson = await nativeRes.json().catch(() => ({}))
      if (nativeRes.ok) {
        if (nativeJson?.id && friendly_name) {
          try {
            await fetch(`${supabaseUrl}/auth/v1/passkeys/${nativeJson.id}`, {
              method: 'PATCH',
              headers: gotrueHeaders,
              body: JSON.stringify({ friendly_name }),
            })
            nativeJson.friendly_name = friendly_name
          } catch {}
        }
        return new Response(JSON.stringify(nativeJson), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      if (
        !challengeSnap ||
        challengeSnap.challenge_type !== 'registration' ||
        challengeSnap.user_id !== v_user_id
      ) {
        throw new Error(
          nativeJson?.msg ||
            nativeJson?.error_description ||
            nativeJson?.message ||
            'Passkey registration challenge expired or invalid.'
        )
      }
      if (new Date(challengeSnap.expires_at).getTime() <= Date.now()) {
        throw new Error('Passkey registration challenge has expired.')
      }

      const expectedChallenge = challengeSnap.session_data?.challenge
      const rpId = challengeSnap.session_data?.rpId || 'sanctuaryos.net'

      const clientDataBytes = b64UrlToBytes(credential.response.clientDataJSON)
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))
      if (clientData.type !== 'webauthn.create') {
        throw new Error('Invalid WebAuthn registration ceremony type.')
      }
      if (!expectedChallenge || clientData.challenge !== expectedChallenge) {
        throw new Error('WebAuthn registration challenge mismatch.')
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new Error(`Origin ${clientData.origin} is not authorized for RP ID ${rpId}.`)
      }

      const attObjBytes = b64UrlToBytes(credential.response.attestationObject)
      const { value: attMap } = decodeCborItem(attObjBytes, 0)
      const fmt = String(attMap.get('fmt') || 'none')
      const authDataBytes = attMap.get('authData') as Uint8Array
      if (!authDataBytes || authDataBytes.length < 55) {
        throw new Error('Invalid attestation authData.')
      }

      const regRpHashValid = await matchesAllowedRpIdHash(authDataBytes, rpId, clientData.origin)
      if (!regRpHashValid) {
        throw new Error('WebAuthn registration RP ID hash mismatch.')
      }

      const flags = authDataBytes[32]
      if ((flags & 0x01) === 0 || (flags & 0x40) === 0) {
        throw new Error('WebAuthn registration missing required authenticator flags.')
      }

      const backupEligible = (flags & 0x08) !== 0
      const backedUp = (flags & 0x10) !== 0
      const signCount =
        ((authDataBytes[33] << 24) >>> 0) +
        ((authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36])
      const aaguid = formatUuidFromBytes(authDataBytes.subarray(37, 53))
      const credIdLen = (authDataBytes[53] << 8) | authDataBytes[54]
      const credIdBytes = authDataBytes.subarray(55, 55 + credIdLen)
      const pubKeyCborBytes = authDataBytes.subarray(55 + credIdLen)

      const { value: coseMap } = decodeCborItem(pubKeyCborBytes, 0)
      if (!coseMap || typeof coseMap.get !== 'function' || !coseMap.get(1)) {
        throw new Error('Invalid COSE public key in attestation.')
      }

      const transports = Array.isArray(credential?.response?.transports)
        ? credential.response.transports
        : ['internal', 'hybrid']

      const { data: createdPasskey, error: regErr } = await supabaseAdmin.rpc(
        'internal_complete_webauthn_registration',
        {
          p_challenge_id: challenge_id,
          p_user_id: v_user_id,
          p_credential_id_b64: bytesToB64(credIdBytes),
          p_public_key_b64: bytesToB64(pubKeyCborBytes),
          p_attestation_type: fmt,
          p_aaguid: aaguid,
          p_sign_count: signCount,
          p_transports: transports,
          p_backup_eligible: backupEligible,
          p_backed_up: backedUp,
          p_friendly_name: friendly_name || 'FIDO2 Passkey',
        }
      )
      if (regErr) throw regErr

      return new Response(JSON.stringify(createdPasskey), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

  return null;
}
