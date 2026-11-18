// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  SERVER_AUTH_OPTS,
  applySpokeQueryFilters,
  applySpokeQueryModifiers,
  getCorsHeaders,
  sanitizeGatewayErrorMessage,
  sanitizeSpokeSelectColumns,
  redactRestrictedEmbeddedRelations,
} from './corsAndSanitization.ts'
import {
  UUID_REGEX,
  SUPABASE_URL_REGEX,
  b64UrlToBytes,
  bytesToB64,
  normalizeSpokeUrl,
  detectCredentialKind,
  maskCredentialFingerprint,
  sealSpokeEnvelope,
  openSpokeEnvelope,
  createSpokeClient,
  verifySpokeCredentialHandshake,
} from './cryptoEnvelope.ts'
import {
  decodeCborItem,
  verifyCoseSignature,
  isAllowedWebAuthnOrigin,
  matchesAllowedRpIdHash,
  formatUuidFromBytes,
} from './webauthnCbor.ts'
import {
  STAFF_ROLES,
  CREATOR_OR_STAFF_ROLES,
  STAFF_ONLY_TABLES,
  CREATOR_OR_STAFF_TABLES,
  CITIZEN_TABLES,
  invalidateSpokeGameConfigCache,
  resolveGameWithServiceKey,
  assertNoOversizedInlineImageBlobs,
  normalizeSpokeTableRow,
  enforceArchitectSubmissionCompliance,
} from './spokeAccessAndOwnership.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, SERVER_AUTH_OPTS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, SERVER_AUTH_OPTS)

    const body = await req.json()
    const { game_id, action, payload } = body

    if (!action) {
      throw new Error('Missing action')
    }

    const authHeader = req.headers.get('Authorization')
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : ''

    let user: any = null
    let authError: any = null
    if (token && token.includes('.')) {
      const authRes = await supabaseClient.auth.getUser(token)
      user = authRes?.data?.user ?? null
      authError = authRes?.error ?? null
    }

    // Special Hub-wide action: WebAuthn Assertion Verification
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

      const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes))
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
      const { game, gameServiceKey } = await resolveGameWithServiceKey(supabaseAdmin, game_id)
      if (!gameServiceKey) {
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
      const { game, gameServiceKey } = await resolveGameWithServiceKey(supabaseAdmin, game_id)
      if (!gameServiceKey) {
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

    // All remaining actions require an authenticated OS user
    if (authError || !user) {
      throw new Error('Unauthorized on OS DB: ' + (authError?.message || 'No user'))
    }

    const v_user_id = user.id;

    // Special Hub-wide action: WebAuthn Registration Verification
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

    // Fetch authoritative Hub Profile for caller
    const { data: hubProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role, is_banned, blacklist_reason')
      .eq('id', v_user_id)
      .maybeSingle()

    const hubUsername = hubProfile?.username || user.user_metadata?.username || ('Citizen_' + v_user_id.substring(0, 6))
    const hubRole = (hubProfile?.role || 'citizen').toLowerCase()
    const hubIsBanned = hubProfile?.is_banned ?? false
    const hubBlacklistReason = hubProfile?.blacklist_reason ?? null

    // Keeper-only action: create or update a Spoke Game entry while envelope-encrypting and Vault-sealing credentials in sanctuary_internal.spoke_credentials
    if (action === 'keeper_upsert_game') {
      if (hubRole !== 'keeper' || hubIsBanned) {
        throw new Error('Forbidden: Only Keepers can register or update Spoke Game configurations')
      }
      const {
        id: targetGameUuid,
        name,
        schema_id,
        supabase_url,
        supabase_anon_key,
        spoke_gateway_token,
        supabase_service_key,
        icon,
        is_active,
        is_keepers_only,
        clear_service_key,
      } = payload || {}

      const cleanName = String(name || '').trim()
      const cleanSchemaId = String(schema_id || '').trim().toUpperCase()
      const cleanUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      const cleanAnon = String(supabase_anon_key || '').trim()
      const cleanCredential = String(spoke_gateway_token || supabase_service_key || '').trim()

      if (!cleanName || !cleanSchemaId || !cleanUrl || !cleanAnon) {
        throw new Error('Missing required Spoke Game fields (name, schema_id, supabase_url, supabase_anon_key)')
      }
      if (!SUPABASE_URL_REGEX.test(cleanUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      let existingGameRow: any = null
      let existingCredRow: any = null
      if (targetGameUuid && UUID_REGEX.test(String(targetGameUuid))) {
        const { data: exGame, error: exErr } = await supabaseAdmin
          .from('sanctuary_games')
          .select('id, schema_id, supabase_url')
          .eq('id', targetGameUuid)
          .maybeSingle()
        if (exErr) throw exErr
        existingGameRow = exGame

        const { data: exCredRows } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
          p_game_id: targetGameUuid,
        })
        existingCredRow = Array.isArray(exCredRows) ? exCredRows[0] : exCredRows

        if (
          existingGameRow &&
          existingCredRow?.envelope_ciphertext &&
          clear_service_key !== true &&
          !cleanCredential &&
          normalizeSpokeUrl(existingGameRow.supabase_url) !== normalizeSpokeUrl(cleanUrl)
        ) {
          throw new Error('Changing Spoke URL requires re-entering or rotating the Spoke credential')
        }
      }

      const publicRow: Record<string, any> = {
        name: cleanName,
        schema_id: cleanSchemaId,
        supabase_url: cleanUrl,
        supabase_anon_key: cleanAnon,
        icon: icon ?? '',
        is_active: is_active !== undefined ? Boolean(is_active) : true,
      }
      if (is_keepers_only !== undefined) publicRow.is_keepers_only = Boolean(is_keepers_only)

      let savedGame: any = null
      if (targetGameUuid && UUID_REGEX.test(String(targetGameUuid))) {
        const { data, error } = await supabaseAdmin
          .from('sanctuary_games')
          .update(publicRow)
          .eq('id', targetGameUuid)
          .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only, created_at')
          .single()
        if (error) throw error
        savedGame = data
      } else {
        const { data, error } = await supabaseAdmin
          .from('sanctuary_games')
          .insert([publicRow])
          .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only, created_at')
          .single()
        if (error) throw error
        savedGame = data
      }

      if (savedGame?.id) {
        if (clear_service_key === true) {
          const { error: delErr } = await supabaseAdmin.rpc('internal_delete_spoke_credential', {
            p_game_id: savedGame.id,
          })
          if (delErr) throw delErr
        } else if (cleanCredential) {
          const credKind = detectCredentialKind(cleanCredential)
          const { envelope, keyVersion } = await sealSpokeEnvelope(cleanCredential, {
            gameId: savedGame.id,
            schemaId: savedGame.schema_id,
            supabaseUrl: savedGame.supabase_url,
          })
          const { error: upsErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
            p_game_id: savedGame.id,
            p_envelope_ciphertext: envelope,
            p_key_version: keyVersion,
            p_credential_kind: credKind,
            p_key_fingerprint: maskCredentialFingerprint(cleanCredential),
          })
          if (upsErr) throw upsErr
        } else if (
          existingGameRow &&
          existingCredRow?.envelope_ciphertext &&
          String(existingGameRow.schema_id || '').trim().toUpperCase() !== savedGame.schema_id
        ) {
          const plainCred = await openSpokeEnvelope(existingCredRow.envelope_ciphertext, {
            gameId: savedGame.id,
            schemaId: String(existingGameRow.schema_id || ''),
            supabaseUrl: String(existingGameRow.supabase_url || ''),
          })
          const { envelope, keyVersion } = await sealSpokeEnvelope(plainCred, {
            gameId: savedGame.id,
            schemaId: savedGame.schema_id,
            supabaseUrl: savedGame.supabase_url,
          })
          const { error: rewrapErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
            p_game_id: savedGame.id,
            p_envelope_ciphertext: envelope,
            p_key_version: keyVersion,
            p_credential_kind: detectCredentialKind(plainCred),
            p_key_fingerprint: maskCredentialFingerprint(plainCred),
          })
          if (rewrapErr) throw rewrapErr
        }
      }

      const { data: metaRows } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
        p_game_id: savedGame.id,
      })
      const metaRow = Array.isArray(metaRows) ? metaRows[0] : metaRows

      invalidateSpokeGameConfigCache();
      return new Response(
        JSON.stringify({
          success: true,
          game: {
            ...savedGame,
            has_service_key: Boolean(metaRow?.envelope_ciphertext),
            credential_kind: metaRow?.credential_kind || null,
            key_version: metaRow?.key_version || null,
            key_fingerprint: metaRow?.key_fingerprint || '',
            rotated_at: metaRow?.rotated_at || null,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Keeper-only action: list non-secret encryption metadata for all Spoke credentials
    if (action === 'keeper_list_spoke_credentials_meta') {
      if (hubRole !== 'keeper' || hubIsBanned) {
        throw new Error('Forbidden: Only Keepers can inspect Spoke credential status metadata')
      }
      const { data: credRows, error: listErr } = await supabaseAdmin.rpc('internal_list_spoke_credentials')
      if (listErr) throw listErr
      const credentials: Record<string, any> = {}
      for (const row of (credRows || [])) {
        if (!row?.game_id) continue
        credentials[row.game_id] = {
          has_credential: Boolean(row.envelope_ciphertext),
          credential_kind: row.credential_kind || null,
          key_version: row.key_version || null,
          key_fingerprint: row.key_fingerprint || '',
          rotated_at: row.rotated_at || null,
          updated_at: row.updated_at || null,
        }
      }
      return new Response(JSON.stringify({ success: true, credentials }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Keeper-only action: auto-pull opt-in malware manifests from all active linked Partner Spokes
    if (action === 'keeper_fetch_ecosystem_malware_manifests') {
      if (hubRole !== 'keeper' || hubIsBanned) {
        throw new Error('Forbidden: Only Keepers can inspect ecosystem Spoke malware manifests')
      }

      const [{ data: allGames, error: gamesErr }, { data: allSecrets, error: secErr }] = await Promise.all([
        supabaseAdmin
          .from('sanctuary_games')
          .select('id, name, schema_id, supabase_url, supabase_anon_key, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabaseAdmin.rpc('internal_list_spoke_credentials'),
      ])
      if (gamesErr) throw gamesErr
      if (secErr) throw secErr

      const secretMap = new Map<string, string>()
      for (const s of (allSecrets || [])) {
        if (s?.game_id && s?.envelope_ciphertext) {
          secretMap.set(String(s.game_id), String(s.envelope_ciphertext))
        }
      }

      const spokeResults = await Promise.all(
        (allGames || []).map(async (g: any) => {
          const spokeMeta = {
            game_id: String(g.id),
            schema_id: String(g.schema_id || g.id),
            name: String(g.name || g.schema_id || g.id),
          }
          const envCipher = secretMap.get(String(g.id))
          if (!g?.supabase_url || !envCipher) {
            return {
              ...spokeMeta,
              count: 0,
              status: 'unlinked' as const,
              rows: [] as any[],
            }
          }
          try {
            const plainCred = await openSpokeEnvelope(envCipher, {
              gameId: String(g.id),
              schemaId: String(g.schema_id || ''),
              supabaseUrl: String(g.supabase_url || ''),
            })
            const spokeClient = createSpokeClient(
              g.supabase_url,
              g.supabase_anon_key || '',
              plainCred
            )
            const { data: rows, error: rowsErr } = await spokeClient
              .from('malware_reports')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(250)
            if (rowsErr) throw rowsErr

            const mapped = (rows || []).map((row: any) => ({
              ...row,
              spoke_game_id: spokeMeta.game_id,
              spoke_schema_id: spokeMeta.schema_id,
              spoke_name: spokeMeta.name,
            }))

            return {
              ...spokeMeta,
              count: mapped.length,
              status: 'ok' as const,
              rows: mapped,
            }
          } catch (err: any) {
            console.error('Failed to pull malware manifests from spoke:', spokeMeta.name, err)
            return {
              ...spokeMeta,
              count: 0,
              status: 'error' as const,
              error: String(err?.message || 'Query failed'),
              rows: [] as any[],
            }
          }
        })
      )

      const manifests = spokeResults
        .flatMap((r) => r.rows)
        .sort(
          (a: any, b: any) =>
            new Date(b.detected_at || b.created_at || 0).getTime() -
            new Date(a.detected_at || a.created_at || 0).getTime()
        )
      const spokes = spokeResults.map(({ rows: _rows, ...meta }) => meta)

      return new Response(JSON.stringify({ success: true, manifests, spokes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Special Hub-wide action: propagate a user's Hub username / global ban to all active Spokes
    if (action === 'sync_hub_ban_to_spokes') {
      if (hubRole !== 'keeper' && payload?.target_user_id !== v_user_id) {
        throw new Error('Forbidden: Only Keepers can propagate global profile updates')
      }
      const targetUserId = payload?.target_user_id || v_user_id
      const { data: targetHubProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, username, is_banned, blacklist_reason')
        .eq('id', targetUserId)
        .maybeSingle()

      if (targetHubProfile) {
        const { data: allGames } = await supabaseAdmin
          .from('sanctuary_games')
          .select('id, schema_id, supabase_url, supabase_anon_key')
          .eq('is_active', true)

        const { data: allSecrets } = await supabaseAdmin.rpc('internal_list_spoke_credentials')

        const secretMap = new Map<string, string>()
        for (const s of (allSecrets || [])) {
          if (s?.game_id && s?.envelope_ciphertext) {
            secretMap.set(s.game_id, s.envelope_ciphertext)
          }
        }

        for (const g of (allGames || [])) {
          const envCipher = secretMap.get(g.id)
          if (!g.supabase_url || !envCipher) continue
          try {
            const plainCred = await openSpokeEnvelope(envCipher, {
              gameId: String(g.id),
              schemaId: String(g.schema_id || ''),
              supabaseUrl: String(g.supabase_url || ''),
            })
            const spokeClient = createSpokeClient(g.supabase_url, g.supabase_anon_key || '', plainCred)
            await spokeClient
              .from('profiles')
              .update({
                username: targetHubProfile.username,
                is_banned: targetHubProfile.is_banned ?? false,
                blacklist_reason: targetHubProfile.blacklist_reason ?? null
              })
              .eq('id', targetUserId)
          } catch (e) {
            console.error('Failed to sync ban to spoke:', g.supabase_url, e)
          }
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Special Hub-wide action: test Spoke connection, verify schema.sql tables, seed network status, and bootstrap Founding Wayfinder
    if (action === 'verify_and_bootstrap_spoke' || action === 'keeper_verify_spoke_handshake') {
      if (hubRole !== 'keeper') {
        throw new Error('Forbidden: Only Keepers can verify and bootstrap Spoke uplinks')
      }
      const {
        game_id: existingGameId,
        supabase_url,
        supabase_anon_key,
        spoke_gateway_token,
        supabase_service_key,
        founder_identifier,
      } = payload || {}

      let resolvedServiceKey = String(spoke_gateway_token || supabase_service_key || '').trim()
      let resolvedUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      let resolvedAnonKey = String(supabase_anon_key || '').trim()

      if ((!resolvedServiceKey || !resolvedUrl || !resolvedAnonKey) && (existingGameId || game_id)) {
        const lookup = await resolveGameWithServiceKey(supabaseAdmin, String(existingGameId || game_id))
        if (lookup.game) {
          if (!resolvedUrl) resolvedUrl = String(lookup.game.supabase_url || '').trim().replace(/\/+$/, '')
          if (!resolvedAnonKey) resolvedAnonKey = String(lookup.game.supabase_anon_key || '').trim()
          if (
            !resolvedServiceKey &&
            lookup.serviceKey &&
            normalizeSpokeUrl(resolvedUrl) === normalizeSpokeUrl(lookup.game.supabase_url)
          ) {
            resolvedServiceKey = lookup.serviceKey
          }
        }
      }

      if (!resolvedUrl || (!resolvedServiceKey && !resolvedAnonKey)) {
        throw new Error('Missing Spoke Supabase URL or Key')
      }
      if (!SUPABASE_URL_REGEX.test(resolvedUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      const startPing = Date.now()
      const testDb = resolvedServiceKey
        ? createSpokeClient(resolvedUrl, resolvedAnonKey, resolvedServiceKey)
        : createClient(resolvedUrl, resolvedAnonKey, SERVER_AUTH_OPTS)
      let handshakeAuthMode = resolvedServiceKey ? detectCredentialKind(resolvedServiceKey) : 'anon_read_only'
      if (resolvedServiceKey) {
        const hs = await verifySpokeCredentialHandshake(testDb, detectCredentialKind(resolvedServiceKey))
        handshakeAuthMode = hs.authMode
      }
      const requiredTables = ['mods', 'profiles', 'system_broadcasts', 'dispatch_poll_votes', 'known_exception_rules', 'dlc_registry', 'global_network_status', 'audit_logs']
      const missingTables: string[] = []

      for (const tbl of requiredTables) {
        const { error: tblErr } = await testDb.from(tbl).select('*', { count: 'exact', head: true }).limit(1)
        if (tblErr && (tblErr.code === '42P01' || tblErr.message?.includes('does not exist') || tblErr.message?.includes('schema cache'))) {
          missingTables.push(tbl)
        }
      }

      const latencyMs = Date.now() - startPing

      if (missingTables.length === 0 && resolvedServiceKey) {
        await testDb.from('global_network_status').upsert({
          id: 1,
          defcon_level: 5,
          status_message: 'Network Secure. All systems nominal.'
        }, { onConflict: 'id' })
      }

      let wayfinderProvisioned: string | null = null
      if (founder_identifier && String(founder_identifier).trim() && resolvedServiceKey && missingTables.length === 0) {
        const cleanFounder = String(founder_identifier).trim()
        let founderHub: any = null
        if (UUID_REGEX.test(cleanFounder)) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .eq('id', cleanFounder)
            .maybeSingle()
          founderHub = data
        } else {
          const { data: byUsername } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .ilike('username', cleanFounder)
            .maybeSingle()
          if (byUsername) {
            founderHub = byUsername
          } else {
            const { data: byEmail } = await supabaseAdmin
              .from('profiles')
              .select('id, username, is_banned, blacklist_reason')
              .ilike('email', cleanFounder)
              .maybeSingle()
            founderHub = byEmail
          }
        }
        if (founderHub) {
          const { error: wfErr } = await testDb.from('profiles').upsert({
            id: founderHub.id,
            username: founderHub.username || ('Wayfinder_' + founderHub.id.substring(0, 6)),
            role: 'wayfinder',
            is_banned: founderHub.is_banned ?? false,
            blacklist_reason: founderHub.blacklist_reason ?? null
          }, { onConflict: 'id' })
          if (!wfErr) {
            wayfinderProvisioned = founderHub.username || founderHub.id
          }
        }
      }

      return new Response(JSON.stringify({
        success: missingTables.length === 0,
        schema_ready: missingTables.length === 0,
        missing_tables: missingTables,
        wayfinder_provisioned: wayfinderProvisioned,
        auth_mode: handshakeAuthMode,
        latency_ms: latencyMs
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!game_id) {
      throw new Error('Missing game_id')
    }

    // 4. Resolve Target Spoke DB Configuration & Split-Custody Envelope Credential
    const {
      game,
      serviceKey: gameServiceKey,
      credentialKind: resolvedCredentialKind,
      keyVersion: resolvedKeyVersion,
      keyFingerprint: resolvedKeyFingerprint,
      rotatedAt: resolvedRotatedAt,
      error: gameError,
    } = await resolveGameWithServiceKey(
      supabaseAdmin,
      String(game_id)
    )

    if (gameError || !game) {
      throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    }

    if (game.is_keepers_only === true && hubRole !== 'keeper') {
      throw new Error('Forbidden: This Spoke is restricted to Keepers Core')
    }

    if (action === 'get_spoke_credential_status' && !gameServiceKey) {
      let isSpokeWayfinder = false
      if (hubRole !== 'keeper' && game.supabase_url && game.supabase_anon_key) {
        try {
          const anonSpoke = createClient(game.supabase_url, game.supabase_anon_key, SERVER_AUTH_OPTS)
          const { data: spProf } = await anonSpoke.from('profiles').select('role, is_banned').eq('id', v_user_id).maybeSingle()
          isSpokeWayfinder = !spProf?.is_banned && String(spProf?.role || '').toLowerCase() === 'wayfinder'
        } catch {}
      }
      if (hubRole !== 'keeper' && !isSpokeWayfinder) {
        throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can inspect credential status')
      }
      return new Response(JSON.stringify({
        has_credential: false,
        credential_kind: null,
        key_version: null,
        key_fingerprint: '',
        rotated_at: null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'sever_spoke_cord' && hubRole === 'keeper') {
      const severReason = payload?.reason?.trim() || 'Keeper Severance Protocol (Cut the Cord)'
      if (gameServiceKey && SUPABASE_URL_REGEX.test(String(game.supabase_url || '').trim())) {
        try {
          const bestEffortSpokeDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)
          await bestEffortSpokeDb.from('audit_logs').insert({
            action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
          })
          await bestEffortSpokeDb.rpc('revoke_spoke_gateway_tokens')
        } catch (e) {
          console.warn('Best-effort Spoke audit/revoke warning on Keeper sever:', e)
        }
      }
      await supabaseAdmin
        .from('sanctuary_games')
        .update({ is_active: false })
        .eq('id', game.id)
      await supabaseAdmin.rpc('internal_delete_spoke_credential', { p_game_id: game.id })
      await supabaseAdmin.from('audit_logs').insert({
        action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
        target_table: 'sanctuary_games',
        target_name: game.name || game.schema_id,
        actor_id: v_user_id,
        reason: severReason,
        game_name: game.name || game.schema_id || 'Keeper Hub',
      })
      invalidateSpokeGameConfigCache();
      return new Response(JSON.stringify({ success: true, severed_by: 'keeper', schema_id: game.schema_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!gameServiceKey) {
      throw new Error('Game DB gateway credential not configured - connection rejected')
    }

    // 5. Initialize Spoke DB Client with Split-Custody Gateway Token (or legacy key)
    const gameDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)

    // 6. Sync Caller's Hub Identity (id, username, is_banned, blacklist_reason) -> Spoke profiles
    const { data: existingSpokeProfile } = await gameDb
      .from('profiles')
      .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
      .eq('id', v_user_id)
      .maybeSingle()

    let callerSpokeProfile = existingSpokeProfile
    if (!existingSpokeProfile) {
      const { data: insertedProfile, error: insertErr } = await gameDb
        .from('profiles')
        .insert({
          id: v_user_id,
          username: hubUsername,
          role: 'citizen',
          is_banned: hubIsBanned,
          blacklist_reason: hubBlacklistReason
        })
        .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
        .maybeSingle()
      if (insertErr) console.error("Profile insert warning:", insertErr)
      callerSpokeProfile = insertedProfile || {
        id: v_user_id,
        username: hubUsername,
        role: 'citizen',
        is_banned: hubIsBanned,
        blacklist_reason: hubBlacklistReason,
        is_comm_banned: false,
        comm_blacklist_reason: null
      }
    } else if (
      existingSpokeProfile.username !== hubUsername ||
      (hubIsBanned && !existingSpokeProfile.is_banned)
    ) {
      const syncFields: Record<string, any> = { username: hubUsername }
      if (hubIsBanned) {
        syncFields.is_banned = true
        syncFields.blacklist_reason = hubBlacklistReason
      }
      const { data: updatedProfile, error: syncErr } = await gameDb
        .from('profiles')
        .update(syncFields)
        .eq('id', v_user_id)
        .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
        .maybeSingle()
      if (syncErr) console.error("Profile sync warning:", syncErr)
      if (updatedProfile) callerSpokeProfile = updatedProfile
    }

    const callerSpokeRole = (callerSpokeProfile?.role || 'citizen').toLowerCase()
    const isCallerBanned = Boolean(hubIsBanned || callerSpokeProfile?.is_banned)
    const isFoundryTestNodeKeeper = hubRole === 'keeper' && Boolean(game?.is_keepers_only)
    const isCallerStaff = isFoundryTestNodeKeeper || STAFF_ROLES.includes(callerSpokeRole)
    const isCallerCreatorOrStaff = isFoundryTestNodeKeeper || CREATOR_OR_STAFF_ROLES.includes(callerSpokeRole)
    const isArchitectOnlyStaff =
      (callerSpokeRole === 'architect' || callerSpokeRole === 'senior_architect') &&
      !isFoundryTestNodeKeeper
    const isOversightOnlyStaff =
      callerSpokeRole === 'oversight' && !isFoundryTestNodeKeeper

    let cachedMasonIdsPromise: Promise<Set<string>> | null = null;
    async function getCallerOwnedMasonIds(): Promise<Set<string>> {
      if (!cachedMasonIdsPromise) {
        cachedMasonIdsPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
          return new Set((mRows || []).map((r: any) => String(r.id)))
        })();
      }
      return cachedMasonIdsPromise;
    }

    let cachedVerifiedMasonPromise: Promise<boolean> | null = null;
    async function getIsCallerVerifiedMason(): Promise<boolean> {
      if (!cachedVerifiedMasonPromise) {
        cachedVerifiedMasonPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
            .eq('is_verified', true)
            .limit(1)
          return Array.isArray(mRows) && mRows.length > 0
        })();
      }
      return cachedVerifiedMasonPromise;
    }

    async function assertOwnedCollectionSetId(
      setId: unknown,
      errorMessage = 'Forbidden: Collection set_id must belong to your Creator profile'
    ): Promise<void> {
      const cleanSetId = String(setId || '').trim()
      if (!cleanSetId) {
        throw new Error(errorMessage)
      }
      const ownedMasons = await getCallerOwnedMasonIds()
      const { data: colEx } = await gameDb
        .from('collections')
        .select('mason_id')
        .eq('id', cleanSetId)
        .maybeSingle()
      if (!colEx || !ownedMasons.has(String(colEx.mason_id))) {
        throw new Error(errorMessage)
      }
    }

    let cachedModIdsPromise: Promise<Set<string>> | null = null;
    async function getCallerOwnedModIds(): Promise<Set<string>> {
      if (!cachedModIdsPromise) {
        cachedModIdsPromise = (async () => {
          const ownedMasons = await getCallerOwnedMasonIds()
          const mIds = Array.from(ownedMasons)
          if (mIds.length === 0) return new Set<string>()
          const { data: modRows } = await gameDb
            .from('mods')
            .select('id')
            .in('mason_id', mIds)
          return new Set((modRows || []).map((r: any) => String(r.id)))
        })();
      }
      return cachedModIdsPromise;
    }

    let cachedStagingOwnerTagPromise: Promise<string> | null = null;
    async function getCallerStagingOwnerTag(): Promise<string> {
      if (!cachedStagingOwnerTagPromise) {
        cachedStagingOwnerTagPromise = (async () => {
          const enc = new TextEncoder().encode(`sanctuary_gw_staging_owner_v1:${v_user_id}`)
          const digest = await crypto.subtle.digest('SHA-256', enc)
          return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        })();
      }
      return cachedStagingOwnerTagPromise;
    }

    async function assertOwnedCreatorChildRow(
      tableName: string,
      row: Record<string, any>,
      isExistingUpdate = false
    ): Promise<void> {
      if (isCallerStaff) return
      const ownedMods = await getCallerOwnedModIds()
      if (tableName === 'mod_versions') {
        const modId = row?.mod_id ? String(row.mod_id) : ''
        if (!modId || !ownedMods.has(modId)) {
          throw new Error('Forbidden: mod_versions mod_id must belong to your owned artifacts')
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from('mod_versions')
            .select('mod_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.mod_id || !ownedMods.has(String(ex.mod_id)))) {
            throw new Error('Forbidden: Cannot modify version of another Creator artifact')
          }
        }
      } else if (tableName === 'mod_bundles') {
        const primaryId = row?.primary_id ? String(row.primary_id) : ''
        if (!primaryId || !ownedMods.has(primaryId)) {
          throw new Error('Forbidden: mod_bundles primary_id must belong to your owned artifacts')
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from('mod_bundles')
            .select('primary_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.primary_id || !ownedMods.has(String(ex.primary_id)))) {
            throw new Error('Forbidden: Cannot modify bundle of another Creator artifact')
          }
        }
      } else if (tableName === 'mod_dependencies' || tableName === 'mod_relationships') {
        const parentId = row?.parent_id ? String(row.parent_id) : ''
        if (!parentId || !ownedMods.has(parentId)) {
          throw new Error(`Forbidden: ${tableName} parent_id must belong to your owned artifacts`)
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from(tableName)
            .select('parent_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.parent_id || !ownedMods.has(String(ex.parent_id)))) {
            throw new Error(`Forbidden: Cannot modify ${tableName} of another Creator artifact`)
          }
        }
      } else if (tableName === 'version_dependencies') {
        const pHash = String(row?.parent_hash || '').trim()
        if (!pHash) {
          throw new Error('Forbidden: version_dependencies requires parent_hash')
        }
        const { data: verRow } = await gameDb
          .from('mod_versions')
          .select('mod_id')
          .eq('dna_hash', pHash)
          .maybeSingle()
        if (!verRow?.mod_id || !ownedMods.has(String(verRow.mod_id))) {
          throw new Error('Forbidden: version_dependencies parent_hash must belong to your owned artifacts')
        }
      } else if (tableName === 'community_groups' || tableName === 'community_group_members') {
        throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
      } else if (tableName === 'logical_conflicts') {
        if (isExistingUpdate) {
          throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
        }
        const modAId = row?.mod_a_id ? String(row.mod_a_id) : ''
        const modBId = row?.mod_b_id ? String(row.mod_b_id) : ''
        if ((!modAId || !ownedMods.has(modAId)) && (!modBId || !ownedMods.has(modBId))) {
          throw new Error('Forbidden: logical_conflicts entry must reference one of your owned artifacts')
        }
        row.status = 'pending'
      } else if (tableName === 'homestead_workbench_templates') {
        throw new Error('Forbidden: Staff clearance required to modify shared Workbench templates')
      }
    }

    let resultData = null;

    // 7. Route actions
    switch (action) {
      case 'sync_spoke_profile': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (/^[0-9a-f]{64}$/.test(rawCommitment)) {
          try {
            await gameDb.rpc('internal_upsert_spoke_relink_commitment', {
              p_profile_id: v_user_id,
              p_commitment_hash: rawCommitment,
            })
          } catch (_e) {
            // Best-effort on Spokes running older schemas
          }
        }
        resultData = {
          ...callerSpokeProfile,
          os_role: hubRole
        }
        break;
      }
      case 'register_relink_commitment': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (!/^[0-9a-f]{64}$/.test(rawCommitment)) {
          throw new Error('Invalid SHA-256 relink commitment hash')
        }
        const { data: commitRes, error: commitErr } = await gameDb.rpc(
          'internal_upsert_spoke_relink_commitment',
          {
            p_profile_id: v_user_id,
            p_commitment_hash: rawCommitment,
          }
        )
        if (commitErr) throw commitErr
        resultData = commitRes || { ok: true }
        break;
      }
      case 'update_spoke_profile': {
        const { target_user_id, updates } = payload || {}
        if (!target_user_id || !updates) throw new Error('Missing target_user_id or updates')

        const isSelfBan = target_user_id === v_user_id && updates.is_banned === true && Object.keys(updates).every(k => ['is_banned', 'blacklist_reason'].includes(k))
        const isKeeperOrWayfinder = isFoundryTestNodeKeeper || callerSpokeRole === 'wayfinder'
        const isOversight = callerSpokeRole === 'oversight'
        const isArchitectMasonPromote = (callerSpokeRole === 'architect' || callerSpokeRole === 'senior_architect') && Object.keys(updates).length === 1 && updates.role === 'mason'

        if (!isSelfBan && !isKeeperOrWayfinder && !isOversight && !isArchitectMasonPromote) {
          throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
        }

        const { data: targetSpoke } = await gameDb
          .from('profiles')
          .select('id, role')
          .eq('id', target_user_id)
          .maybeSingle()

        if (isOversight && !isKeeperOrWayfinder) {
          if (['oversight', 'wayfinder', 'admin'].includes(targetSpoke?.role) || ['oversight', 'wayfinder', 'admin'].includes(updates.role)) {
            throw new Error('Forbidden: Oversight cannot modify Wayfinder, Admin, or Oversight roles')
          }
        }

        if (!targetSpoke) {
          const { data: targetHub } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .eq('id', target_user_id)
            .maybeSingle()
          if (targetHub) {
            await gameDb.from('profiles').insert({
              id: targetHub.id,
              username: targetHub.username || ('Citizen_' + targetHub.id.substring(0, 6)),
              role: 'citizen',
              is_banned: targetHub.is_banned ?? false,
              blacklist_reason: targetHub.blacklist_reason ?? null
            })
          }
        }

        const allowedFields: Record<string, any> = {}
        if (updates.role !== undefined && !isSelfBan) allowedFields.role = updates.role
        if (updates.is_banned !== undefined) allowedFields.is_banned = updates.is_banned
        if (updates.blacklist_reason !== undefined) allowedFields.blacklist_reason = updates.blacklist_reason
        if (updates.is_comm_banned !== undefined) allowedFields.is_comm_banned = updates.is_comm_banned
        if (updates.comm_blacklist_reason !== undefined) allowedFields.comm_blacklist_reason = updates.comm_blacklist_reason

        const { data: updatedRows, error: updateErr } = await gameDb
          .from('profiles')
          .update(allowedFields)
          .eq('id', target_user_id)
          .select()

        if (updateErr) throw updateErr

        if ((hubRole === 'keeper' || isSelfBan) && (updates.is_banned !== undefined || updates.blacklist_reason !== undefined)) {
          const hubBanUpdate: Record<string, any> = {}
          if (updates.is_banned !== undefined) hubBanUpdate.is_banned = updates.is_banned
          if (updates.blacklist_reason !== undefined) hubBanUpdate.blacklist_reason = updates.blacklist_reason
          await supabaseAdmin
            .from('profiles')
            .update(hubBanUpdate)
            .eq('id', target_user_id)
        }

        resultData = updatedRows
        break;
      }
      case 'follow_mason': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').insert({
          user_id: v_user_id,
          mason_id: mason_id
        })
        if (error && error.code !== '23505') throw error
        resultData = { success: true, following: true }
        break;
      }
      case 'unfollow_mason': {
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').delete()
          .match({ user_id: v_user_id, mason_id: mason_id })
        if (error) throw error
        resultData = { success: true, following: false }
        break;
      }
      case 'update_mason_profile': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id, profile_data } = payload || {}
        if (!mason_id || !profile_data || typeof profile_data !== 'object') {
          throw new Error('Missing mason_id or profile_data')
        }

        const { data: mason, error: masonError } = await gameDb
          .from('masons')
          .select('profile_id')
          .eq('id', mason_id)
          .single()

        if (masonError || !mason) throw new Error('Mason not found')
        const isOwner = mason.profile_id === v_user_id
        if (!isOwner && !isCallerStaff) {
          throw new Error('Forbidden: You do not own this mason profile')
        }

        const sanitizedData: Record<string, any> = {}
        const ownerAllowedKeys = [
          'name',
          'bio',
          'avatar_url',
          'patreon_url',
          'donation_url',
          'payment_processor',
          'patreon_campaign_id',
          'website_url',
          'discord_url',
          'pinned_mod_id',
          'pinned_asset_id',
          'pinned_blueprint_id',
          'pinned_collection_id',
        ]
        const staffExtraKeys = ['is_verified', 'profile_id', 'followers_count']
        const allowedKeys = isCallerStaff ? [...ownerAllowedKeys, ...staffExtraKeys] : ownerAllowedKeys

        const normalizedInput = normalizeSpokeTableRow('masons', profile_data)
        for (const k of allowedKeys) {
          if (normalizedInput[k] !== undefined) {
            sanitizedData[k] = normalizedInput[k]
          }
        }

        let updatedMason: any = null
        let updateError: any = null
        const masonPayload = { ...sanitizedData }
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await gameDb
            .from('masons')
            .update(masonPayload)
            .eq('id', mason_id)
            .select()
            .single()
          updatedMason = res.data
          updateError = res.error
          if (!updateError) break
          const missingColMatch = String(updateError.message || '').match(/Could not find the '([^']+)' column/i)
          if (missingColMatch && missingColMatch[1] && Object.prototype.hasOwnProperty.call(masonPayload, missingColMatch[1])) {
            delete masonPayload[missingColMatch[1]]
            continue
          }
          break
        }

        if (updateError) throw updateError
        resultData = updatedMason
        break;
      }
      case 'dispatch_broadcast_notifications': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const {
          mason_id,
          type = 'system_broadcast',
          reference_id = null,
          message = '',
          exclude_self = true,
        } = payload || {}

        const cleanMsg = String(message || '').trim()
        if (!cleanMsg) throw new Error('Missing notification message')

        let recipientIds: string[] = []
        if (mason_id) {
          if (!isCallerStaff) {
            const isVerifiedMason = await getIsCallerVerifiedMason()
            if (!isVerifiedMason) {
              throw new Error('Forbidden: Verified Creator status is required to dispatch Comm-Link follower notifications')
            }
            const ownedMasons = await getCallerOwnedMasonIds()
            if (!ownedMasons.has(String(mason_id))) {
              throw new Error('Forbidden: You can only notify followers of your own Creator profile')
            }
          }
          const { data: followerRows, error: folErr } = await gameDb
            .from('mason_followers')
            .select('user_id')
            .eq('mason_id', mason_id)
          if (folErr) throw folErr
          recipientIds = (followerRows || [])
            .map((r: any) => String(r.user_id || ''))
            .filter(Boolean)
        } else {
          if (!isCallerStaff) {
            throw new Error('Forbidden: Staff clearance required for community-wide broadcast notifications')
          }
          const { data: profRows, error: profErr } = await gameDb
            .from('profiles')
            .select('id')
            .eq('is_banned', false)
          if (profErr) throw profErr
          recipientIds = (profRows || [])
            .map((r: any) => String(r.id || ''))
            .filter(Boolean)
        }

        const uniqueRecipients = Array.from(new Set(recipientIds)).filter(
          (uid) => !exclude_self || uid !== v_user_id
        )

        let insertedCount = 0
        const CHUNK_SIZE = 500
        for (let i = 0; i < uniqueRecipients.length; i += CHUNK_SIZE) {
          const batch = uniqueRecipients.slice(i, i + CHUNK_SIZE).map((uid) => ({
            user_id: uid,
            actor_id: v_user_id,
            type: String(type),
            reference_id: reference_id || null,
            message: cleanMsg,
            is_read: false,
          }))
          const { error: insErr } = await gameDb.from('notifications').insert(batch)
          if (insErr) throw insErr
          insertedCount += batch.length
        }

        resultData = { success: true, dispatched: insertedCount }
        break;
      }
      case 'bulk_ingest_vault_mods': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const canBulkIngest = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canBulkIngest) {
          throw new Error('Forbidden: Verified Creator or Staff clearance required for bulk registry ingestion')
        }
        const items = Array.isArray(payload?.items) ? payload.items : []
        if (items.length === 0) {
          resultData = { success: true, processed: 0 }
          break
        }
        const { data: rpcRes, error: rpcErr } = await gameDb.rpc('bulk_ingest_vault_mods', {
          p_items: items,
        })
        if (rpcErr) throw rpcErr
        resultData = rpcRes
        break;
      }
      case 'upsert_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, payload_data } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || !payload_data) {
          throw new Error('Missing target_table or payload_data')
        }

        const restrictedTables = ['profiles', 'auth.users', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Insufficient permissions to modify ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (cleanTable === 'masons') {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
            }
          } else if (!isCallerStaff && !(await getIsCallerVerifiedMason())) {
            throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
          }
        } else if (!CITIZEN_TABLES.has(cleanTable)) {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const isArrayInput = Array.isArray(payload_data)
        const rawRows = (isArrayInput ? payload_data : [payload_data]).map((r) =>
          normalizeSpokeTableRow(cleanTable, r)
        )

        // Architects flagging Tier 1-4 on mods/collections always route to Oversight Compliance as 'pending'
        if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
          for (const row of rawRows) {
            if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
              row.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(row.compliance_tier))))
              row.status = 'pending'
            }
          }
        }

        // Oversight cannot link/unlink Mason entities belonging to Wayfinder/Oversight/Admin accounts
        if (isOversightOnlyStaff && cleanTable === 'masons') {
          for (const row of rawRows) {
            if (!row || typeof row !== 'object') continue
            if (row.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', row.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }
            if (row.id) {
              const { data: exMason } = await gameDb
                .from('masons')
                .select('profile_id')
                .eq('id', row.id)
                .maybeSingle()
              if (exMason?.profile_id) {
                const { data: exProf } = await gameDb
                  .from('profiles')
                  .select('role')
                  .eq('id', exMason.profile_id)
                  .maybeSingle()
                if (exProf && ['wayfinder', 'oversight', 'admin'].includes(String(exProf.role || '').toLowerCase())) {
                  throw new Error('Forbidden: Oversight cannot modify Creator records owned by Wayfinder or Oversight')
                }
              }
            }
          }
        }

        // Strict row-ownership & anti-IDOR enforcement for non-staff callers
        if (!isCallerStaff) {
          const ownedMasons =
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members' ||
            cleanTable === 'blueprints' ||
            cleanTable === 'mods'
              ? await getCallerOwnedMasonIds()
              : new Set<string>()

          for (const row of rawRows) {
            if (!row || typeof row !== 'object') {
              throw new Error('Invalid payload row')
            }

            if (cleanTable === 'audit_logs') {
              row.actor_id = v_user_id
              delete row.id
            } else if (cleanTable === 'mason_post_comments') {
              if (callerSpokeProfile?.is_comm_banned) {
                throw new Error('Forbidden: Community posting privileges are suspended')
              }
              row.author_id = v_user_id
              delete row.is_hidden
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('mason_post_comments')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen comment')
                }
              }
            } else if (
              cleanTable === 'mason_post_likes' ||
              cleanTable === 'mason_post_views' ||
              cleanTable === 'dispatch_poll_votes'
            ) {
              row.user_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('user_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot modify another citizen record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'blueprints') {
              if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                throw new Error('Forbidden: Blueprint mason_id must belong to caller')
              }
              if (!row.mason_id) {
                row.mason_id = v_user_id
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('blueprints')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.mason_id !== v_user_id && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Blueprint')
                }
              }
              if (row.code) {
                const { data: exByCode } = await gameDb
                  .from('blueprints')
                  .select('id, mason_id')
                  .eq('code', row.code)
                  .maybeSingle()
                if (exByCode && exByCode.mason_id !== v_user_id && !ownedMasons.has(String(exByCode.mason_id))) {
                  throw new Error('Forbidden: Blueprint code belongs to another citizen')
                }
              }
            } else if (cleanTable === 'nexus_assets') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
              }
              row.author_id = v_user_id
              delete row.is_community_default
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('nexus_assets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Nexus asset')
                }
              }
            } else if (cleanTable === 'sanctuary_tickets') {
              row.author_id = (row.author_id === null || row.metadata?.is_anonymous === true) ? null : v_user_id
              delete row.assigned_to
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('sanctuary_tickets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen ticket')
                }
              }
            } else if (
              cleanTable === 'content_flags' ||
              cleanTable === 'nexus_reports' ||
              cleanTable === 'blueprint_reports'
            ) {
              row.reporter_id = null
              if ('reporter_name' in row || cleanTable !== 'content_flags') {
                row.reporter_name = 'Anonymous'
              }
              delete row.resolved_by
              delete row.resolution_note
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('reporter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.reporter_id && ex.reporter_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot overwrite another report in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'scout_suggestions') {
              row.submitter_id = null
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('scout_suggestions')
                  .select('submitter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.submitter_id && ex.submitter_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Scout suggestion')
                }
              }
            } else if (cleanTable === 'notifications') {
              if (row.user_id && String(row.user_id) !== v_user_id) {
                throw new Error('Forbidden: Cannot create notification for another citizen')
              }
              row.user_id = v_user_id
              row.actor_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('notifications')
                  .select('user_id, actor_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id && ex.actor_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen notification')
                }
              }
            } else if (cleanTable === 'citizen_staging_queue') {
              if (!row.user_token || String(row.user_token).length < 16) {
                throw new Error('Invalid staging token')
              }
              const callerOwnerTag = await getCallerStagingOwnerTag()
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('citizen_staging_queue')
                  .select('user_token, owner_tag')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && (ex.user_token !== row.user_token || (ex.owner_tag && ex.owner_tag !== callerOwnerTag))) {
                  throw new Error('Forbidden: Staging queue ownership mismatch')
                }
              }
              row.owner_tag = callerOwnerTag
            } else if (cleanTable === 'masons') {
              delete row.is_verified
              delete row.followers_count
              if (row.id) {
                if (!ownedMasons.has(String(row.id))) {
                  throw new Error('Forbidden: You can only update your own Creator profile')
                }
              }
              row.profile_id = v_user_id
            } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error(
                  cleanTable === 'mason_posts'
                    ? 'Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches'
                    : 'Forbidden: Verified Creator status is required to publish or update Nexus collections'
                )
              }
              if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
              }
              if (cleanTable === 'collections') {
                delete row.is_official
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: Cannot overwrite another Creator record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'collection_members') {
              await assertOwnedCollectionSetId(row.set_id)
              if (row.id) {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMember?.set_id && String(exMember.set_id) !== String(row.set_id)) {
                  await assertOwnedCollectionSetId(exMember.set_id)
                }
              }
            } else if (cleanTable === 'mods') {
              if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                delete row.highlander_group_id
              }
              if (row.id) {
                const { data: exMod } = await gameDb
                  .from('mods')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMod?.mason_id && !ownedMasons.has(String(exMod.mason_id))) {
                  const { data: ownerMason } = await gameDb
                    .from('masons')
                    .select('profile_id')
                    .eq('id', exMod.mason_id)
                    .maybeSingle()
                  if (ownerMason?.profile_id && ownerMason.profile_id !== v_user_id) {
                    throw new Error('Forbidden: Cannot overwrite an artifact owned by another claimed Creator')
                  }
                }
              }
            } else if (
              cleanTable === 'mod_versions' ||
              cleanTable === 'mod_bundles' ||
              cleanTable === 'mod_dependencies' ||
              cleanTable === 'mod_relationships' ||
              cleanTable === 'version_dependencies' ||
              cleanTable === 'community_groups' ||
              cleanTable === 'community_group_members' ||
              cleanTable === 'logical_conflicts' ||
              cleanTable === 'homestead_workbench_templates'
            ) {
              await assertOwnedCreatorChildRow(cleanTable, row, false)
            }
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, false)
          }
        } else {
          for (const row of rawRows) {
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
          }
        }

        let currentPayload: any = isArrayInput ? rawRows : rawRows[0]
        let data: any = null
        let error: any = null

        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await gameDb
            .from(cleanTable)
            .upsert(currentPayload)
            .select()
          data = res.data
          error = res.error
          if (!error) break
          const missingColMatch = String(error.message || '').match(/Could not find the '([^']+)' column/i)
          const missingCol = missingColMatch?.[1]
          if (missingCol) {
            if (Array.isArray(currentPayload)) {
              currentPayload = currentPayload.map((row) => {
                if (row && typeof row === 'object') {
                  const next = { ...row }
                  delete next[missingCol]
                  return next
                }
                return row
              })
              continue
            } else if (currentPayload && typeof currentPayload === 'object' && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
              if (missingCol === 'image_url' && currentPayload.image_url && typeof currentPayload.content === 'string') {
                currentPayload.content = `[IMG:${currentPayload.image_url}]\n\n` + currentPayload.content
              }
              delete currentPayload[missingCol]
              continue
            }
          }
          break
        }

        if (error) {
          if (error.code === '23505' && cleanTable === 'mason_post_views') {
            resultData = [payload_data]
          } else {
            throw error
          }
        } else {
          resultData = data
        }
        break;
      }
      case 'delete_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, id_value } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || id_value === undefined || id_value === null) {
          throw new Error('Missing target_table or id_value')
        }

        const restrictedTables = ['profiles', 'auth.users', 'audit_logs', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members'
          ) {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to delete from ${cleanTable}`)
            }
            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'masons') {
                if (!ownedMasons.has(String(id_value))) {
                  throw new Error('Forbidden: You can only delete your own Creator profile')
                }
              } else if (cleanTable === 'collection_members') {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', id_value)
                  .maybeSingle()
                const { data: exCol } = exMember?.set_id
                  ? await gameDb
                      .from('collections')
                      .select('mason_id')
                      .eq('id', exMember.set_id)
                      .maybeSingle()
                  : { data: null }
                if (!exMember?.set_id || !exCol || !ownedMasons.has(String(exCol.mason_id))) {
                  throw new Error('Forbidden: You can only delete members of your own collections')
                }
              } else {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', id_value)
                  .maybeSingle()
                if (!ex || !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
                }
              }
            }
          } else if (!isCallerStaff) {
            if (!(await getIsCallerVerifiedMason())) {
              throw new Error(`Forbidden: Verified Creator or Staff clearance required to delete from ${cleanTable}`)
            }
            if (cleanTable === 'mods') {
              throw new Error('Forbidden: Creators cannot delete cloud registry artifacts directly')
            }
            if (
              cleanTable === 'logical_conflicts' ||
              cleanTable === 'community_groups' ||
              cleanTable === 'community_group_members' ||
              cleanTable === 'homestead_workbench_templates'
            ) {
              throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
            }
            const ownedMods = await getCallerOwnedModIds()
            if (cleanTable === 'mod_versions') {
              const { data: exVer } = await gameDb.from('mod_versions').select('mod_id').eq('id', id_value).maybeSingle()
              if (!exVer?.mod_id || !ownedMods.has(String(exVer.mod_id))) {
                throw new Error('Forbidden: You can only delete versions of your own artifacts')
              }
            } else if (cleanTable === 'mod_bundles') {
              const { data: exB } = await gameDb.from('mod_bundles').select('primary_id').eq('id', id_value).maybeSingle()
              if (!exB?.primary_id || !ownedMods.has(String(exB.primary_id))) {
                throw new Error('Forbidden: You can only delete bundles of your own artifacts')
              }
            } else if (cleanTable === 'mod_dependencies' || cleanTable === 'mod_relationships') {
              const { data: exRel } = await gameDb.from(cleanTable).select('parent_id').eq('id', id_value).maybeSingle()
              if (!exRel?.parent_id || !ownedMods.has(String(exRel.parent_id))) {
                throw new Error(`Forbidden: You can only delete ${cleanTable} of your own artifacts`)
              }
            } else if (cleanTable === 'version_dependencies') {
              const { data: exVd } = await gameDb.from('version_dependencies').select('parent_hash').eq('id', id_value).maybeSingle()
              const { data: exVer } = exVd?.parent_hash
                ? await gameDb.from('mod_versions').select('mod_id').eq('dna_hash', exVd.parent_hash).maybeSingle()
                : { data: null }
              if (!exVer?.mod_id || !ownedMods.has(String(exVer.mod_id))) {
                throw new Error('Forbidden: You can only delete version_dependencies of your own artifacts')
              }
            } else {
              throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
            }
          }
        } else if (CITIZEN_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            const ownerColumnMap: Record<string, string> = {
              mason_post_comments: 'author_id',
              mason_post_likes: 'user_id',
              dispatch_poll_votes: 'user_id',
              blueprints: 'mason_id',
              nexus_assets: 'author_id',
              sanctuary_tickets: 'author_id',
              notifications: 'user_id',
            }
            const ownerCol = ownerColumnMap[cleanTable]
            if (ownerCol) {
              const { data: existingRow } = await gameDb
                .from(cleanTable)
                .select(ownerCol)
                .eq('id', id_value)
                .maybeSingle()
              const ownedMasons = cleanTable === 'blueprints' ? await getCallerOwnedMasonIds() : new Set<string>()
              const rowOwner = existingRow?.[ownerCol]
              const isOwned =
                rowOwner === v_user_id ||
                (cleanTable === 'blueprints' && rowOwner && ownedMasons.has(String(rowOwner)))
              if (!existingRow || !isOwned) {
                throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
              }
            } else if (cleanTable === 'citizen_staging_queue') {
              const callerOwnerTag = await getCallerStagingOwnerTag()
              const { data: exRow } = await gameDb
                .from('citizen_staging_queue')
                .select('id, owner_tag')
                .eq('id', id_value)
                .maybeSingle()
              if (!exRow || (exRow.owner_tag && exRow.owner_tag !== callerOwnerTag)) {
                throw new Error('Forbidden: Staging queue ownership mismatch')
              }
            } else {
              throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
            }
          }
        } else {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const { error } = await gameDb
          .from(cleanTable)
          .delete()
          .eq('id', id_value)

        if (error) throw error
        resultData = { success: true }
        break;
      }
      case 'fetch_notifications': {
        const { data, error } = await gameDb
          .from('notifications')
          .select('*')
          .eq('user_id', v_user_id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        resultData = data;
        break;
      }
      case 'mark_notifications_read': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').update({ is_read: true }).eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'mark_all_notifications_read': {
        const { error } = await gameDb
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_notifications': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').delete().eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_all_notifications': {
        const { error } = await gameDb
          .from('notifications')
          .delete()
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'wayfinder_update_spoke_donations': {
        // Strictly isolated to the Spoke's own Wayfinder — Hub Keepers cannot view or alter Spoke donation configs
        if (callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can manage Spoke donation settings.')
        }
        const cleanDonUrl = typeof payload?.donation_url === 'string' ? payload.donation_url.trim() : ''
        const rawProc = typeof payload?.payment_processor === 'string' ? payload.payment_processor.trim().toUpperCase() : 'STRIPE'
        const cleanProc = rawProc === 'SANDBOX' || !rawProc ? 'STRIPE' : rawProc
        const goalCents = Math.max(0, Math.round(Number(payload?.monthly_goal_cents) || 0))
        const coveredCents = Math.max(0, Math.round(Number(payload?.monthly_covered_cents) || 0))

        const { error: updateDonErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            donation_url: cleanDonUrl || null,
            payment_processor: cleanProc,
          })
          .eq('id', game.id)
        if (updateDonErr) throw updateDonErr

        const schemaKey = String(game.schema_id || game.id || 'default').toLowerCase()
        const broadcastTitle = `SPOKE_DONATION_${schemaKey.toUpperCase()}`
        const payloadStr = JSON.stringify({
          schema_id: schemaKey,
          game_id: game.id,
          donation_url: cleanDonUrl,
          payment_processor: cleanProc,
          monthly_goal_cents: goalCents,
          monthly_covered_cents: coveredCents,
          spoke_cost_breakdown: payload?.spoke_cost_breakdown,
          updated_at: new Date().toISOString(),
        })

        const { data: existingBroadcast } = await supabaseAdmin
          .from('keeper_system_broadcasts')
          .select('id')
          .eq('category', 'SpokeDonationConfig')
          .eq('title', broadcastTitle)
          .limit(1)
          .maybeSingle()

        if (existingBroadcast?.id) {
          await supabaseAdmin
            .from('keeper_system_broadcasts')
            .update({
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
            })
            .eq('id', existingBroadcast.id)
        } else {
          await supabaseAdmin.from('keeper_system_broadcasts').insert([
            {
              title: broadcastTitle,
              category: 'SpokeDonationConfig',
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
              is_pinned: false,
            },
          ])
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: 'Updated Spoke Donation Settings',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Payment processor: ${cleanProc}`,
          })
        } catch (e) {
          console.warn('Spoke audit log warning on donation update:', e)
        }

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          donation_url: cleanDonUrl || null,
          payment_processor: cleanProc,
        }
        break;
      }
      case 'get_spoke_credential_status': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can inspect credential status')
        }
        resultData = {
          has_credential: true,
          credential_kind: resolvedCredentialKind,
          key_version: resolvedKeyVersion,
          key_fingerprint: resolvedKeyFingerprint,
          rotated_at: resolvedRotatedAt,
        }
        break;
      }
      case 'rotate_spoke_gateway_token': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can rotate the Spoke Gateway Token')
        }
        if (!game.supabase_anon_key) {
          throw new Error('Spoke supabase_anon_key must be configured before minting a scoped Gateway Token')
        }
        const { data: mintData, error: mintErr } = await gameDb.rpc('mint_spoke_gateway_token', {
          p_label: 'Hub Gateway Uplink',
          p_grace_seconds: 60,
        })
        if (mintErr || !mintData?.token) {
          throw new Error('Failed to mint new Spoke Gateway Token: ' + (mintErr?.message || 'Empty response — apply latest schema.sql on Spoke first'))
        }
        const newToken = String(mintData.token).trim()
        const verifyClient = createSpokeClient(game.supabase_url, game.supabase_anon_key, newToken)
        await verifySpokeCredentialHandshake(verifyClient, 'spoke_gateway')

        const { envelope, keyVersion } = await sealSpokeEnvelope(newToken, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: String(game.supabase_url || ''),
        })
        const newFp = maskCredentialFingerprint(newToken)
        const { error: upsErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: 'spoke_gateway',
          p_key_fingerprint: newFp,
        })
        if (upsErr) throw upsErr

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: 'Rotated Scoped Spoke Gateway Token',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `New Fingerprint: ${newFp} (${keyVersion})`,
            game_name: game.name || game.schema_id,
          })
        } catch {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: 'spoke_gateway',
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'sever_spoke_cord': {
        if (hubRole !== 'keeper' && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Core OS Keeper can sever the uplink cord.')
        }
        const severReason = payload?.reason?.trim() || (callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Bilateral Sovereignty Severance)' : 'Keeper Severed Spoke Uplink')
        const actionTitle = callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Severed Uplink)' : 'Keeper Severed Spoke Uplink'

        try {
          await gameDb.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason
          })
          await gameDb.rpc('revoke_spoke_gateway_tokens')
        } catch (e) {
          console.warn('Spoke audit log / token revocation warning on sever:', e)
        }

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
            game_name: game.name || game.schema_id
          })
        } catch (e) {
          console.warn('Hub audit log insert warning on sever:', e)
        }

        const { error: severErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            is_active: false
          })
          .eq('id', game.id)

        if (severErr) throw severErr

        await supabaseAdmin.rpc('internal_delete_spoke_credential', { p_game_id: game.id })

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          severed_by: callerSpokeRole === 'wayfinder' ? 'wayfinder' : 'keeper',
          schema_id: game.schema_id
        }
        break;
      }
      case 'flag_mod_for_compliance': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const rawModId = String(payload?.mod_id || '').trim()
        const rawHash = String(payload?.dna_hash || payload?.hash || '').trim().toLowerCase()
        const rawModName = String(payload?.mod_name || payload?.name || '').trim().slice(0, 200)
        const rawAuthor = String(payload?.author || payload?.master_author || '').trim().slice(0, 120)
        const rawTier = Math.round(Number(payload?.tier || 1))
        const requestedTier = Math.min(4, Math.max(1, Number.isFinite(rawTier) ? rawTier : 1))
        const cleanReason = String(payload?.reason || '').trim().slice(0, 1000) || `Flagged Tier ${requestedTier} for Compliance Review`
        const canApproveCompliance = callerSpokeRole === 'oversight' || callerSpokeRole === 'wayfinder' || callerSpokeRole === 'admin' || isFoundryTestNodeKeeper

        let modId = rawModId
        if (!modId && /^[0-9a-f]{64}$/.test(rawHash)) {
          const { data: verMatch } = await gameDb
            .from('mod_versions')
            .select('mod_id')
            .eq('dna_hash', rawHash)
            .maybeSingle()
          if (verMatch?.mod_id) {
            modId = String(verMatch.mod_id)
          }
        }

        const roleTag = isCallerStaff ? callerSpokeRole.toUpperCase() : (callerSpokeRole === 'mason' ? 'MASON' : 'CITIZEN')
        const taggedReason = `[${roleTag} FLAG - TIER ${requestedTier}] ${cleanReason}`

        let updatedMod: any = null

        if (!modId) {
          if (!/^[0-9a-f]{64}$/.test(rawHash)) {
            throw new Error('Missing mod_id or valid 64-character SHA-256 hash')
          }
          const newModId = crypto.randomUUID()
          const slugBase = (rawModName || 'flagged-artifact')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'flagged-artifact'
          const newSlug = `${slugBase}-${rawHash.slice(0, 8)}`
          const initialStatus = canApproveCompliance ? 'verified' : 'pending'

          const insertPayload: Record<string, any> = {
            id: newModId,
            name: rawModName || `Flagged Artifact (${rawHash.slice(0, 12)})`,
            slug: newSlug,
            master_author: rawAuthor || null,
            compliance_tier: requestedTier,
            status: initialStatus,
            status_reason: taggedReason,
          }
          let insRes = await gameDb
            .from('mods')
            .insert(insertPayload)
            .select()
            .maybeSingle()
          if (insRes.error && String(insRes.error.message || '').includes('status_reason')) {
            delete insertPayload.status_reason
            insRes = await gameDb
              .from('mods')
              .insert(insertPayload)
              .select()
              .maybeSingle()
          }
          if (insRes.error) throw insRes.error
          updatedMod = insRes.data || insertPayload
          modId = newModId

          const { error: verInsErr } = await gameDb
            .from('mod_versions')
            .insert({
              mod_id: newModId,
              dna_hash: rawHash,
              version_label: 'flagged',
              is_core_file: true,
            })
          if (verInsErr && verInsErr.code !== '23505') throw verInsErr
        } else {
          const { data: existingMod, error: fetchModErr } = await gameDb
            .from('mods')
            .select('id, name, compliance_tier, status, status_reason')
            .eq('id', modId)
            .maybeSingle()

          if (fetchModErr) throw fetchModErr
          if (!existingMod) throw new Error('Target artifact not found in Spoke registry')

          const currentTier = Number(existingMod.compliance_tier || 0)
          const currentStatusLower = String(existingMod.status || '').toLowerCase()
          const isCurrentlyPending = ['pending', 'under_review', 'unverified'].includes(currentStatusLower)
          const isConfirmedActiveOrBlocked = currentTier >= 1 && !isCurrentlyPending

          updatedMod = existingMod
          if (!isConfirmedActiveOrBlocked || requestedTier > currentTier) {
            const nextTier = isCurrentlyPending ? Math.max(currentTier, requestedTier) : requestedTier
            const nextStatus = canApproveCompliance
              ? (isCurrentlyPending ? 'pending' : 'verified')
              : 'pending'
            const nextReason =
              isConfirmedActiveOrBlocked && existingMod.status_reason
                ? `${existingMod.status_reason}\n${taggedReason}`
                : taggedReason

            let updRes = await gameDb
              .from('mods')
              .update({
                compliance_tier: nextTier,
                status: nextStatus,
                status_reason: nextReason,
              })
              .eq('id', modId)
              .select()
              .maybeSingle()

            if (updRes.error && String(updRes.error.message || '').includes('status_reason')) {
              updRes = await gameDb
                .from('mods')
                .update({
                  compliance_tier: nextTier,
                  status: nextStatus,
                })
                .eq('id', modId)
                .select()
                .maybeSingle()
            }
            if (updRes.error) throw updRes.error
            if (updRes.data) updatedMod = updRes.data
          }
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: `Flagged Artifact for Compliance (Tier ${requestedTier})`,
            target_table: 'mods',
            target_name: updatedMod?.name || rawModName || modId,
            actor_id: isCallerStaff ? v_user_id : null,
            reason: taggedReason,
          })
        } catch (auditErr) {
          console.warn('Compliance flag audit log warning:', auditErr)
        }

        resultData = {
          success: true,
          queued_pending: String(updatedMod?.status || 'pending').toLowerCase() === 'pending',
          mod: updatedMod,
        }
        break;
      }
      case 'update_spoke_uplink': {
        if (!isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can update Spoke uplink keys.')
        }
        const newUrl = (payload?.supabase_url?.trim() || game.supabase_url || '').replace(/\/+$/, '')
        const newAnonKey = payload?.supabase_anon_key?.trim() || game.supabase_anon_key
        const submittedSecret = String(payload?.spoke_gateway_token || payload?.supabase_service_key || '').trim()

        if (!submittedSecret && normalizeSpokeUrl(newUrl) !== normalizeSpokeUrl(game.supabase_url)) {
          throw new Error('Changing Spoke URL requires supplying a valid Spoke Gateway Token for the target project.')
        }

        const newServiceKey = submittedSecret || gameServiceKey

        if (!newUrl || !newAnonKey || !newServiceKey) {
          throw new Error('Missing required Spoke URL, Anon Key, or Gateway Token.')
        }
        if (!SUPABASE_URL_REGEX.test(newUrl)) {
          throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
        }

        const newKind = detectCredentialKind(newServiceKey)
        const verifyClient = createSpokeClient(newUrl, newAnonKey, newServiceKey)
        await verifySpokeCredentialHandshake(verifyClient, newKind)

        const { error: updErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            supabase_url: newUrl,
            supabase_anon_key: newAnonKey,
            is_active: true
          })
          .eq('id', game.id)

        if (updErr) throw updErr

        const { envelope, keyVersion } = await sealSpokeEnvelope(newServiceKey, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: newUrl,
        })
        const newFp = maskCredentialFingerprint(newServiceKey)
        const { error: secErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: newKind,
          p_key_fingerprint: newFp,
        })
        if (secErr) throw secErr

        try {
          await verifyClient.from('audit_logs').insert({
            action: 'Rotated Spoke Uplink Credentials',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Wayfinder / Keeper Uplink Key Rotation (${newFp})`
          })
        } catch (e) {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: newKind,
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'spoke_query':
      case 'spoke_query_batch': {
        const executeSingleSpokeQuery = async (specPayload: any) => {
          const payload = specPayload || {}
          const cleanTable = String(payload?.table || '').trim().toLowerCase()
          const op = String(payload?.op || 'select').trim().toLowerCase()
          if (!cleanTable) throw new Error('Missing table for spoke_query')
          if (cleanTable === 'auth.users' || cleanTable === 'hardware_bans') {
            throw new Error('Forbidden table target')
          }

          const isKnownSpokeTable =
            cleanTable === 'profiles' ||
            cleanTable === 'pwa_push_subscriptions' ||
            STAFF_ONLY_TABLES.has(cleanTable) ||
            CREATOR_OR_STAFF_TABLES.has(cleanTable) ||
            CITIZEN_TABLES.has(cleanTable)

          if (!isKnownSpokeTable) {
            throw new Error(`Forbidden: Table ${cleanTable} is not in the Spoke registry`)
          }

          if (op === 'select') {
            const selectColumns = sanitizeSpokeSelectColumns(
              typeof payload?.selectColumns === 'string' && payload.selectColumns.trim()
                ? payload.selectColumns
                : '*'
            )
            const selectOpts = payload?.selectOpts && typeof payload.selectOpts === 'object'
              ? payload.selectOpts
              : undefined

            if (cleanTable === 'malware_reports' && !isCallerStaff && hubRole !== 'keeper') {
              throw new Error('Forbidden: Staff clearance required to view malware reports')
            }

            if (cleanTable === 'citizen_staging_queue') {
              const filtersArr = Array.isArray(payload?.filters) ? payload.filters : []
              const hasValidTokenFilter = filtersArr.some(
                (f: any) =>
                  f?.method === 'eq' &&
                  Array.isArray(f?.args) &&
                  String(f.args[0] || '') === 'user_token' &&
                  typeof f.args[1] === 'string' &&
                  f.args[1].trim().length >= 16
              )
              if (!hasValidTokenFilter && !isCallerStaff) {
                throw new Error('Forbidden: Staging queue select requires a valid user_token filter')
              }
              const callerOwnerTag = await getCallerStagingOwnerTag()
              const requestedOwnerTag = selectColumns === '*' || /\bowner_tag\b/.test(selectColumns)
              const qCols = requestedOwnerTag ? selectColumns : `${selectColumns},owner_tag`
              let q = gameDb.from('citizen_staging_queue').select(qCols, selectOpts)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              let rows = res.data
              if (!isCallerStaff) {
                if (Array.isArray(rows)) {
                  rows = rows
                    .filter((r: any) => r && (!r.owner_tag || r.owner_tag === callerOwnerTag))
                    .map((r: any) => {
                      if (!requestedOwnerTag && r && typeof r === 'object') {
                        const { owner_tag: _o, ...rest } = r
                        return rest
                      }
                      return r
                    })
                } else if (rows && typeof rows === 'object') {
                  if ((rows as any).owner_tag && (rows as any).owner_tag !== callerOwnerTag) {
                    rows = null
                  } else if (!requestedOwnerTag) {
                    const { owner_tag: _o, ...rest } = rows as any
                    rows = rest
                  }
                }
              }
              const finalCount = Array.isArray(rows) ? rows.length : (rows ? 1 : 0)
              return { __spoke_query_v1: true, data: rows, count: selectOpts?.head ? res.count ?? finalCount : finalCount }
            }

            if (cleanTable === 'notifications' || cleanTable === 'pwa_push_subscriptions') {
              let q = gameDb.from(cleanTable).select(selectColumns, selectOpts).eq('user_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if (cleanTable === 'sanctuary_tickets' && !isCallerStaff) {
              if (callerSpokeRole === 'mason') {
                const ownedMasons = await getCallerOwnedMasonIds()
                const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                const { data: modRows } = await gameDb
                  .from('mods')
                  .select('id')
                  .in('mason_id', masonIdsArr)
                const ownedModIds = new Set((modRows || []).map((m: any) => String(m.id)))

                let q = gameDb.from('sanctuary_tickets').select(selectColumns === '*' ? '*' : '*')
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const rows = (Array.isArray(res.data) ? res.data : []).filter((t: any) => {
                  if (!t) return false
                  if (t.author_id === v_user_id || t.assigned_to === v_user_id) return true
                  const meta = t.metadata || {}
                  if (meta.target_user_id === v_user_id || meta.target_mason === v_user_id || meta.mason_id === v_user_id) return true
                  if (meta.target_mason && ownedMasons.has(String(meta.target_mason))) return true
                  if (meta.mason_id && ownedMasons.has(String(meta.mason_id))) return true
                  if (meta.target_mod_id && ownedModIds.has(String(meta.target_mod_id))) return true
                  return false
                }).map((t: any) => (
                  t.author_id === v_user_id ? t : { ...t, author_id: null }
                ))
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              let q = gameDb.from('sanctuary_tickets').select(selectColumns, selectOpts).eq('author_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if ((cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') && !isCallerStaff) {
              if (callerSpokeRole === 'mason' && (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports')) {
                const ownedMasons = await getCallerOwnedMasonIds()
                let ownedTargetIds = new Set<string>()
                if (cleanTable === 'nexus_reports') {
                  const { data: myAssets } = await gameDb
                    .from('nexus_assets')
                    .select('id')
                    .eq('author_id', v_user_id)
                  ownedTargetIds = new Set((myAssets || []).map((a: any) => String(a.id)))
                } else {
                  const masonFilterIds = [v_user_id, ...Array.from(ownedMasons)]
                  const { data: myBps } = await gameDb
                    .from('blueprints')
                    .select('id')
                    .in('mason_id', masonFilterIds)
                  ownedTargetIds = new Set((myBps || []).map((b: any) => String(b.id)))
                }
                let q = gameDb.from(cleanTable).select(selectColumns)
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const fkField = cleanTable === 'nexus_reports' ? 'asset_id' : 'blueprint_id'
                const rows = (Array.isArray(res.data) ? res.data : []).filter(
                  (r: any) => r && (r.reporter_id === v_user_id || (r[fkField] && ownedTargetIds.has(String(r[fkField]))))
                )
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              let q = gameDb.from(cleanTable).select(selectColumns, selectOpts).eq('reporter_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            const canReadComplianceTiers =
              callerSpokeRole === 'oversight' ||
              callerSpokeRole === 'wayfinder' ||
              callerSpokeRole === 'admin' ||
              isFoundryTestNodeKeeper

            let effectiveSelectColumns = selectColumns
            let effectiveSelectOpts = selectOpts
            const injectedModId =
              !canReadComplianceTiers &&
              cleanTable === 'mod_versions' &&
              selectColumns !== '*' &&
              !/\bmod_id\b/.test(selectColumns)
            if (injectedModId) {
              effectiveSelectColumns = `${selectColumns},mod_id`
            }
            const needsPostCountFilter =
              !canReadComplianceTiers &&
              Boolean(selectOpts?.head) &&
              ['mods', 'collections', 'mod_versions'].includes(cleanTable)
            if (needsPostCountFilter) {
              effectiveSelectColumns = cleanTable === 'mod_versions' ? 'mod_id' : 'id, compliance_tier'
              effectiveSelectOpts = undefined
            }

            let q = gameDb.from(cleanTable).select(effectiveSelectColumns, effectiveSelectOpts)
            q = applySpokeQueryModifiers(q, payload)
            const res = await q
            if (res.error) throw res.error

            let responseData = res.data
            let responseCount = res.count ?? null

            if (!canReadComplianceTiers && ['mods', 'collections'].includes(cleanTable) && responseData !== null) {
              const isPublicComplianceRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const tier = Number(r.compliance_tier ?? 0)
                return !(tier >= 1 && tier <= 4)
              }
              if (Array.isArray(responseData)) {
                const filtered = responseData.filter(isPublicComplianceRow)
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicComplianceRow(responseData)) {
                responseData = null
                responseCount = 0
              }
            }

            if (!canReadComplianceTiers && cleanTable === 'mod_versions' && responseData !== null) {
              const rowsArr = Array.isArray(responseData) ? responseData : [responseData]
              const modIdsToCheck = Array.from(
                new Set(
                  rowsArr
                    .map((r: any) => {
                      const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                      if (joinedMod && typeof joinedMod.compliance_tier === 'number') return null
                      return r?.mod_id ? String(r.mod_id) : null
                    })
                    .filter(Boolean)
                )
              ) as string[]

              const restrictedModIds = new Set<string>()
              if (modIdsToCheck.length > 0) {
                for (let i = 0; i < modIdsToCheck.length; i += 200) {
                  const chunk = modIdsToCheck.slice(i, i + 200)
                  const { data: modTiers } = await gameDb
                    .from('mods')
                    .select('id, compliance_tier')
                    .in('id', chunk)
                  for (const m of modTiers || []) {
                    const tier = Number((m as any)?.compliance_tier ?? 0)
                    if (tier >= 1 && tier <= 4) {
                      restrictedModIds.add(String((m as any).id))
                    }
                  }
                }
              }

              const isPublicVersionRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                if (joinedMod && typeof joinedMod.compliance_tier === 'number') {
                  const t = Number(joinedMod.compliance_tier)
                  if (t >= 1 && t <= 4) return false
                }
                if (r.mod_id && restrictedModIds.has(String(r.mod_id))) return false
                return true
              }

              if (Array.isArray(responseData)) {
                let filtered = responseData.filter(isPublicVersionRow)
                if (injectedModId) {
                  filtered = filtered.map((r: any) => {
                    if (!r || typeof r !== 'object') return r
                    const { mod_id: _omitted, ...rest } = r
                    return rest
                  })
                }
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicVersionRow(responseData)) {
                responseData = null
                responseCount = 0
              } else if (injectedModId && typeof responseData === 'object') {
                const { mod_id: _omitted, ...rest } = responseData as any
                responseData = rest
              }
            }

            if (!canReadComplianceTiers && responseData !== null) {
              responseData = redactRestrictedEmbeddedRelations(responseData)
            }

            if (
              !isCallerStaff &&
              responseData !== null &&
              ['mason_posts', 'mason_post_comments', 'nexus_assets', 'blueprints', 'collections'].includes(cleanTable)
            ) {
              const hasFlaggedRow = Array.isArray(responseData)
                ? responseData.some((r: any) => r?.has_pending_flag === true)
                : (responseData as any)?.has_pending_flag === true
              if (hasFlaggedRow) {
                const ownedMasons =
                  cleanTable === 'mason_posts' || cleanTable === 'blueprints' || cleanTable === 'collections'
                    ? await getCallerOwnedMasonIds()
                    : new Set<string>()
                const isOwnFlaggedRow = (r: any) => {
                  if (!r || typeof r !== 'object') return false
                  if (r.has_pending_flag !== true) return true
                  if (r.author_id && r.author_id === v_user_id) return true
                  if (r.mason_id && (r.mason_id === v_user_id || ownedMasons.has(String(r.mason_id)))) return true
                  return false
                }
                if (Array.isArray(responseData)) {
                  const filtered = responseData.filter(isOwnFlaggedRow)
                  return { __spoke_query_v1: true, data: filtered, count: filtered.length }
                }
                if (!isOwnFlaggedRow(responseData)) {
                  return { __spoke_query_v1: true, data: null, count: 0 }
                }
              }
            }
            return { __spoke_query_v1: true, data: responseData, count: responseCount }
          }

          // Mutations: insert | upsert | update | delete
          if (cleanTable === 'profiles') {
            if (op !== 'update') throw new Error('Forbidden direct profile operation')
            const rawVals = payload?.values && typeof payload.values === 'object' ? { ...payload.values } : {}
            delete rawVals.id
            delete rawVals.created_at
            const isSelfBanOnly =
              Object.keys(rawVals).length > 0 &&
              rawVals.is_banned === true &&
              Object.keys(rawVals).every((k) => ['is_banned', 'blacklist_reason'].includes(k))
            if (!isCallerStaff && !isSelfBanOnly) {
              throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
            }
            if (isCallerStaff && !isSelfBanOnly) {
              if (!Array.isArray(payload?.filters) || payload.filters.length === 0) {
                throw new Error('Refusing unfiltered update on profiles')
              }
              if (isArchitectOnlyStaff) {
                if (rawVals.role !== undefined) {
                  throw new Error('Forbidden: Architects cannot modify user roles')
                }
                delete rawVals.is_banned
                delete rawVals.blacklist_reason
                delete rawVals.is_comm_banned
                delete rawVals.comm_blacklist_reason
              }
              if (isOversightOnlyStaff) {
                const requestedRole = rawVals.role !== undefined ? String(rawVals.role || '').trim().toLowerCase() : ''
                if (requestedRole && ['wayfinder', 'oversight', 'admin', 'core_dev'].includes(requestedRole)) {
                  throw new Error('Forbidden: Oversight cannot promote users to Wayfinder, Oversight, or Admin roles')
                }
                const { data: matchedProfiles } = await applySpokeQueryFilters(
                  gameDb.from('profiles').select('id, role'),
                  payload.filters
                )
                if (
                  Array.isArray(matchedProfiles) &&
                  matchedProfiles.some((p: any) => ['wayfinder', 'admin'].includes(String(p?.role || '').toLowerCase()))
                ) {
                  throw new Error('Forbidden: Oversight cannot modify Wayfinder or Admin profiles')
                }
              }
            }
            let q = gameDb.from('profiles').update(
              isSelfBanOnly
                ? { is_banned: true, blacklist_reason: rawVals.blacklist_reason ?? null }
                : rawVals
            )
            if (!isCallerStaff) {
              q = q.eq('id', v_user_id)
            } else {
              q = applySpokeQueryFilters(q, payload?.filters || [])
            }
            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }
            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          if (isCallerBanned) {
            throw new Error('Forbidden: Account is suspended')
          }

          if (STAFF_ONLY_TABLES.has(cleanTable) && !isCallerStaff) {
            throw new Error(`Forbidden: Staff clearance required to modify ${cleanTable}`)
          }
          if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
            const isDeleteOwnLegacyContent =
              op === 'delete' &&
              ['mason_posts', 'collections', 'collection_members'].includes(cleanTable)
            const canModifyCreatorTable =
              cleanTable === 'masons' || isDeleteOwnLegacyContent
                ? isCallerCreatorOrStaff || (await getIsCallerVerifiedMason())
                : isCallerStaff || (await getIsCallerVerifiedMason())
            if (!canModifyCreatorTable) {
              throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
            }
          }
          if (
            !STAFF_ONLY_TABLES.has(cleanTable) &&
            !CREATOR_OR_STAFF_TABLES.has(cleanTable) &&
            !CITIZEN_TABLES.has(cleanTable) &&
            cleanTable !== 'pwa_push_subscriptions'
          ) {
            throw new Error(`Forbidden: Table ${cleanTable} cannot be modified`)
          }

          if (op === 'insert' || op === 'upsert') {
            const isArr = Array.isArray(payload?.values)
            const rows = (isArr ? payload.values : [payload?.values]).map((r: any) =>
              normalizeSpokeTableRow(cleanTable, r)
            )
            if (!isCallerStaff) {
              const ownedMasons =
                cleanTable === 'masons' ||
                cleanTable === 'mason_posts' ||
                cleanTable === 'collections' ||
                cleanTable === 'collection_members' ||
                cleanTable === 'blueprints'
                  ? await getCallerOwnedMasonIds()
                  : new Set<string>()
              for (const row of rows) {
                if (!row || typeof row !== 'object') throw new Error('Invalid payload row')
                if (cleanTable === 'audit_logs') {
                  row.actor_id = v_user_id
                  delete row.id
                } else if (cleanTable === 'mason_post_comments') {
                  if (callerSpokeProfile?.is_comm_banned) {
                    throw new Error('Forbidden: Community posting privileges are suspended')
                  }
                  row.author_id = v_user_id
                  delete row.is_hidden
                } else if (
                  cleanTable === 'mason_post_likes' ||
                  cleanTable === 'mason_post_views' ||
                  cleanTable === 'dispatch_poll_votes' ||
                  cleanTable === 'pwa_push_subscriptions'
                ) {
                  row.user_id = v_user_id
                } else if (cleanTable === 'blueprints') {
                  if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                    throw new Error('Forbidden: Blueprint mason_id must belong to caller')
                  }
                  if (!row.mason_id) row.mason_id = v_user_id
                } else if (cleanTable === 'nexus_assets') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                  row.author_id = v_user_id
                  delete row.is_community_default
                } else if (cleanTable === 'sanctuary_tickets') {
                  row.author_id = (row.author_id === null || row.metadata?.is_anonymous === true) ? null : v_user_id
                  delete row.assigned_to
                } else if (
                  cleanTable === 'content_flags' ||
                  cleanTable === 'nexus_reports' ||
                  cleanTable === 'blueprint_reports'
                ) {
                  row.reporter_id = null
                  if ('reporter_name' in row || cleanTable !== 'content_flags') {
                    row.reporter_name = 'Anonymous'
                  }
                  delete row.resolved_by
                  delete row.resolution_note
                } else if (cleanTable === 'scout_suggestions') {
                  row.submitter_id = null
                } else if (cleanTable === 'notifications') {
                  if (row.user_id && String(row.user_id) !== v_user_id) {
                    throw new Error('Forbidden: Cannot create notification for another citizen')
                  }
                  row.user_id = v_user_id
                  row.actor_id = v_user_id
                } else if (cleanTable === 'citizen_staging_queue') {
                  if (!row.user_token || String(row.user_token).length < 16) {
                    throw new Error('Invalid staging token')
                  }
                  const callerOwnerTag = await getCallerStagingOwnerTag()
                  row.owner_tag = callerOwnerTag
                } else if (cleanTable === 'masons') {
                  delete row.is_verified
                  delete row.followers_count
                  row.profile_id = v_user_id
                } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error(
                      cleanTable === 'mason_posts'
                        ? 'Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches'
                        : 'Forbidden: Verified Creator status is required to publish or update Nexus collections'
                    )
                  }
                  if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                    throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                  }
                  if (cleanTable === 'collections') delete row.is_official
                } else if (cleanTable === 'collection_members') {
                  await assertOwnedCollectionSetId(row.set_id)
                } else if (cleanTable === 'mods') {
                  if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                    delete row.highlander_group_id
                  }
                } else if (
                  cleanTable === 'mod_versions' ||
                  cleanTable === 'mod_bundles' ||
                  cleanTable === 'mod_dependencies' ||
                  cleanTable === 'mod_relationships' ||
                  cleanTable === 'version_dependencies' ||
                  cleanTable === 'community_groups' ||
                  cleanTable === 'community_group_members' ||
                  cleanTable === 'logical_conflicts' ||
                  cleanTable === 'homestead_workbench_templates'
                ) {
                  await assertOwnedCreatorChildRow(cleanTable, row, false)
                }
                await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, false)
              }
            } else {
              for (const row of rows) {
                await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
              }
            }

            if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
              for (const row of rows) {
                if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
                  row.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(row.compliance_tier))))
                  row.status = 'pending'
                }
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons') {
              for (const row of rows) {
                if (row?.profile_id) {
                  const { data: targetProf } = await gameDb
                    .from('profiles')
                    .select('role')
                    .eq('id', row.profile_id)
                    .maybeSingle()
                  if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                    throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
                  }
                }
              }
            }

            let currentBody: any = isArr ? rows : rows[0]
            let resData: any = null
            let resErr: any = null
            for (let attempt = 0; attempt < 5; attempt++) {
              let q =
                op === 'upsert'
                  ? gameDb.from(cleanTable).upsert(currentBody, payload?.upsertOpts || undefined)
                  : gameDb.from(cleanTable).insert(currentBody)
              if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
                q = q.select(payload.returnSelect || '*')
                if (payload?.singleMode === 'single') q = q.single()
                else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
              }
              const res = await q
              resData = res.data
              resErr = res.error
              if (!resErr) break
              const missingCol = String(resErr.message || '').match(/Could not find the '([^']+)' column/i)?.[1]
              if (missingCol) {
                if (Array.isArray(currentBody)) {
                  currentBody = currentBody.map((r: any) => {
                    if (r && typeof r === 'object') {
                      const next = { ...r }
                      delete next[missingCol]
                      return next
                    }
                    return r
                  })
                  continue
                } else if (currentBody && typeof currentBody === 'object' && Object.prototype.hasOwnProperty.call(currentBody, missingCol)) {
                  delete currentBody[missingCol]
                  continue
                }
              }
              break
            }
            if (resErr) {
              if (resErr.code === '23505' && cleanTable === 'mason_post_views') {
                return { __spoke_query_v1: true, data: [currentBody], count: 1 }
              }
              throw resErr
            }
            if (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') {
              for (const insertedRow of rows) {
                if (!insertedRow || typeof insertedRow !== 'object') continue
                try {
                  if (cleanTable === 'nexus_reports' && insertedRow.asset_id) {
                    await gameDb.from('nexus_assets').update({ has_pending_flag: true }).eq('id', insertedRow.asset_id)
                  } else if (cleanTable === 'blueprint_reports' && insertedRow.blueprint_id) {
                    await gameDb.from('blueprints').update({ has_pending_flag: true }).eq('id', insertedRow.blueprint_id)
                  } else if (cleanTable === 'content_flags' && insertedRow.content_id) {
                    const normCt = String(insertedRow.content_type || '').toLowerCase()
                    const cTable =
                      normCt === 'collection' || normCt === 'collections'
                        ? 'collections'
                        : normCt === 'comment' || normCt === 'mason_post_comment'
                          ? 'mason_post_comments'
                          : 'mason_posts'
                    await gameDb.from(cTable).update({ has_pending_flag: true }).eq('id', insertedRow.content_id)
                  }
                } catch {
                  // Gracefully ignore if older Spoke schema does not yet have has_pending_flag
                }
              }
            }
            return { __spoke_query_v1: true, data: resData, count: null }
          }

          if (op === 'update' || op === 'delete') {
            if (cleanTable === 'audit_logs') {
              throw new Error('Forbidden: Audit logs are immutable')
            }
            if (!Array.isArray(payload?.filters) || payload.filters.length === 0) {
              throw new Error(`Refusing unfiltered ${op} on ${cleanTable}`)
            }

            let updateVals = payload?.values && typeof payload.values === 'object'
              ? { ...payload.values }
              : {}
            if (op === 'update') {
              assertNoOversizedInlineImageBlobs(cleanTable, updateVals)
            }

            if (isArchitectOnlyStaff && op === 'update' && (cleanTable === 'mods' || cleanTable === 'collections')) {
              if (Number(updateVals.compliance_tier || 0) >= 1) {
                updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                updateVals.status = 'pending'
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons' && updateVals.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', updateVals.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }

            if (!isCallerStaff) {
              if (cleanTable === 'masons') {
                delete updateVals.is_verified
                delete updateVals.followers_count
                delete updateVals.profile_id
              } else if (cleanTable === 'nexus_assets') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                }
                delete updateVals.is_community_default
                delete updateVals.author_id
              } else if (cleanTable === 'mason_posts') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches')
                  }
                }
              } else if (cleanTable === 'collections') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus collections')
                  }
                }
                delete updateVals.is_official
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mods') {
                if (updateVals.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                  delete updateVals.highlander_group_id
                }
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mason_post_comments') {
                delete updateVals.is_hidden
                delete updateVals.author_id
              }

              if (
                op === 'update' &&
                updateVals.mason_id !== undefined &&
                (cleanTable === 'mason_posts' || cleanTable === 'collections' || cleanTable === 'mods')
              ) {
                const ownedMasonsCheck = await getCallerOwnedMasonIds()
                if (!ownedMasonsCheck.has(String(updateVals.mason_id))) {
                  throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                }
              }
            }

            let q = op === 'update'
              ? gameDb.from(cleanTable).update(updateVals)
              : gameDb.from(cleanTable).delete()

            q = applySpokeQueryFilters(q, payload.filters)

            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'mason_post_comments') {
                q = q.eq('author_id', v_user_id)
              } else if (
                cleanTable === 'mason_post_likes' ||
                cleanTable === 'dispatch_poll_votes' ||
                cleanTable === 'notifications' ||
                cleanTable === 'pwa_push_subscriptions'
              ) {
                q = q.eq('user_id', v_user_id)
              } else if (cleanTable === 'nexus_assets') {
                q = q.eq('author_id', v_user_id)
              } else if (cleanTable === 'masons') {
                q = q.eq('profile_id', v_user_id)
              } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'collection_members') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                const { data: myCols } = await gameDb
                  .from('collections')
                  .select('id')
                  .in('mason_id', mIds)
                const ownedSetIds = (myCols || []).map((c: any) => String(c.id))
                if (ownedSetIds.length === 0) throw new Error('Forbidden: No owned collections')
                if (op === 'update' && updateVals.set_id !== undefined && !ownedSetIds.includes(String(updateVals.set_id))) {
                  throw new Error('Forbidden: Collection set_id must belong to your Creator profile')
                }
                q = q.in('set_id', ownedSetIds)
              } else if (cleanTable === 'mods') {
                if (op === 'delete') throw new Error('Forbidden: Creators cannot delete cloud registry artifacts directly')
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'mod_versions') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.mod_id !== undefined && !ownedMods.includes(String(updateVals.mod_id))) {
                  throw new Error('Forbidden: mod_versions mod_id must belong to your owned artifacts')
                }
                q = q.in('mod_id', ownedMods)
              } else if (cleanTable === 'mod_bundles') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.primary_id !== undefined && !ownedMods.includes(String(updateVals.primary_id))) {
                  throw new Error('Forbidden: mod_bundles primary_id must belong to your owned artifacts')
                }
                q = q.in('primary_id', ownedMods)
              } else if (cleanTable === 'mod_dependencies' || cleanTable === 'mod_relationships') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.parent_id !== undefined && !ownedMods.includes(String(updateVals.parent_id))) {
                  throw new Error(`Forbidden: ${cleanTable} parent_id must belong to your owned artifacts`)
                }
                q = q.in('parent_id', ownedMods)
              } else if (cleanTable === 'version_dependencies') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                const { data: myVers } = await gameDb.from('mod_versions').select('dna_hash').in('mod_id', ownedMods)
                const ownedHashes = (myVers || []).map((v: any) => String(v.dna_hash)).filter(Boolean)
                if (ownedHashes.length === 0) throw new Error('Forbidden: No owned version hashes')
                if (op === 'update' && updateVals.parent_hash !== undefined && !ownedHashes.includes(String(updateVals.parent_hash))) {
                  throw new Error('Forbidden: version_dependencies parent_hash must belong to your owned artifacts')
                }
                q = q.in('parent_hash', ownedHashes)
              } else if (
                cleanTable === 'logical_conflicts' ||
                cleanTable === 'community_groups' ||
                cleanTable === 'community_group_members' ||
                cleanTable === 'homestead_workbench_templates'
              ) {
                throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
              } else if (cleanTable === 'citizen_staging_queue') {
                const callerOwnerTag = await getCallerStagingOwnerTag()
                const hasBoundFilter = Array.isArray(payload?.filters) && payload.filters.some(
                  (f: any) =>
                    (f?.method === 'eq' || f?.method === 'in') &&
                    Array.isArray(f?.args) &&
                    ['id', 'user_token'].includes(String(f.args[0] || ''))
                )
                if (!hasBoundFilter) {
                  throw new Error('Forbidden: Staging queue mutation requires id or user_token filter')
                }
                const { data: matchedStaging } = await applySpokeQueryFilters(
                  gameDb.from('citizen_staging_queue').select('id, owner_tag'),
                  payload.filters
                )
                if (
                  Array.isArray(matchedStaging) &&
                  matchedStaging.some((r: any) => r?.owner_tag && r.owner_tag !== callerOwnerTag)
                ) {
                  throw new Error('Forbidden: Staging queue ownership mismatch')
                }
                q = q.or(`owner_tag.is.null,owner_tag.eq.${callerOwnerTag}`)
                if (op === 'update') {
                  updateVals.owner_tag = callerOwnerTag
                }
              } else if (cleanTable === 'blueprints') {
                const mIds = [v_user_id, ...Array.from(ownedMasons)]
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'sanctuary_tickets') {
                if (op === 'delete') throw new Error('Forbidden: Citizens/Creators cannot delete tickets')
                if (callerSpokeRole !== 'mason') {
                  q = q.eq('author_id', v_user_id)
                }
              } else if (
                cleanTable === 'nexus_reports' ||
                cleanTable === 'blueprint_reports'
              ) {
                if (op === 'delete' || callerSpokeRole !== 'mason') {
                  throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
                }
              } else if (
                cleanTable === 'content_flags' ||
                cleanTable === 'malware_reports'
              ) {
                throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
              }
            }

            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }

            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          throw new Error(`Unsupported spoke_query op: ${op}`)
        }

        if (action === 'spoke_query_batch') {
          const queries = Array.isArray(payload?.queries) ? payload.queries.slice(0, 32) : []
          const results = await Promise.all(
            queries.map(async (qSpec: any) => {
              try {
                const out = await executeSingleSpokeQuery(qSpec)
                return { ok: true, ...out }
              } catch (err: any) {
                return { ok: false, error: sanitizeGatewayErrorMessage(err) }
              }
            })
          )
          resultData = { __spoke_batch_v1: true, results }
          break
        }

        resultData = await executeSingleSpokeQuery(payload)
        break
      }
      case 'upload_spoke_theme_asset': {
        if (isCallerBanned) {
          throw new Error('Forbidden: Account is suspended')
        }
        const canUploadThemeAsset = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canUploadThemeAsset) {
          throw new Error(
            'Forbidden: Verified Creator or Staff status is required to upload Nexus theme wallpapers'
          )
        }

        const rawKind = String(payload?.kind || 'bg').trim().toLowerCase()
        const safeKind = ['bg', 'thumb', 'preview'].includes(rawKind) ? rawKind : 'bg'
        const rawMime = String(payload?.mime_type || 'image/webp').trim().toLowerCase()
        const allowedMimeExt: Record<string, string> = {
          'image/webp': 'webp',
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
        }
        const ext = allowedMimeExt[rawMime]
        if (!ext) {
          throw new Error('Unsupported theme image format. Use WebP, PNG, or JPEG.')
        }
        const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime

        const base64Raw = String(payload?.base64_data || '')
          .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '')
          .replace(/\s+/g, '')
        if (!base64Raw) {
          throw new Error('Missing image payload')
        }
        // 390 KB binary cap (~520 KB base64)
        if (base64Raw.length > 535_000) {
          throw new Error('Compressed theme wallpaper exceeds the 380 KB cloud upload budget.')
        }

        let bytes: Uint8Array
        try {
          const bin = atob(base64Raw)
          bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i)
          }
        } catch {
          throw new Error('Invalid base64 image encoding')
        }

        if (bytes.byteLength < 12 || bytes.byteLength > 390_000) {
          throw new Error('Theme image byte size out of bounds (max 380 KB)')
        }

        // Magic-byte header verification (WebP, PNG, JPEG)
        const isWebp =
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50
        const isPng =
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

        if (!isWebp && !isPng && !isJpeg) {
          throw new Error('Rejected file: invalid raster image header')
        }

        const actualMime = isWebp ? 'image/webp' : isPng ? 'image/png' : 'image/jpeg'
        const actualExt = isWebp ? 'webp' : isPng ? 'png' : 'jpg'
        if (actualMime !== normalizedMime && !(isWebp && ext === 'webp')) {
          // Use verified header mime/ext
        }

        const digestBuf = await crypto.subtle.digest('SHA-256', bytes)
        const shaHex = Array.from(new Uint8Array(digestBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const bucket = 'backgrounds'
        const storagePath = `themes/${safeKind}_${shaHex}.${actualExt}`

        // Ensure bucket exists with 512 KB cap on newly onboarded Spokes
        const { error: getBucketErr } = await gameDb.storage.getBucket(bucket)
        if (getBucketErr && resolvedCredentialKind !== 'spoke_gateway') {
          await gameDb.storage
            .createBucket(bucket, {
              public: true,
              fileSizeLimit: 524288,
              allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
            })
            .catch(() => {})
        }

        let finalPublicUrl: string | null = null
        let finalStoragePath = storagePath
        const { error: uploadErr } = await gameDb.storage
          .from(bucket)
          .upload(storagePath, bytes, {
            contentType: actualMime,
            cacheControl: '31536000',
            upsert: true,
          })

        if (!uploadErr) {
          const { data: pubData } = gameDb.storage.from(bucket).getPublicUrl(storagePath)
          finalPublicUrl = pubData?.publicUrl || null
        } else if (resolvedCredentialKind === 'spoke_gateway') {
          // Storage API only evaluates JWT roles on some projects; fall back safely to Hub's hardened backgrounds CDN
          const spokeSlug = String(game.schema_id || 'spoke').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'spoke'
          finalStoragePath = `spoke-themes/${spokeSlug}/${safeKind}_${shaHex}.${actualExt}`
          const { error: hubBucketErr } = await supabaseAdmin.storage.getBucket(bucket)
          if (hubBucketErr) {
            await supabaseAdmin.storage
              .createBucket(bucket, {
                public: true,
                fileSizeLimit: 524288,
                allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
              })
              .catch(() => {})
          }
          const { error: hubUpErr } = await supabaseAdmin.storage
            .from(bucket)
            .upload(finalStoragePath, bytes, {
              contentType: actualMime,
              cacheControl: '31536000',
              upsert: true,
            })
          if (hubUpErr) {
            throw new Error(`Theme wallpaper upload failed: ${hubUpErr.message}`)
          }
          const { data: hubPub } = supabaseAdmin.storage.from(bucket).getPublicUrl(finalStoragePath)
          finalPublicUrl = hubPub?.publicUrl || null
        } else {
          throw new Error(`Theme wallpaper upload failed: ${uploadErr.message}`)
        }

        resultData = {
          publicUrl: finalPublicUrl,
          storagePath: finalStoragePath,
          sha256: shaHex,
          byteLength: bytes.byteLength,
        }
        break
      }
      case 'increment_spoke_counter': {
        if (isCallerBanned) {
          throw new Error('Forbidden: Account is suspended')
        }
        const kind = String(payload?.kind || '').trim().toLowerCase()
        if (kind === 'asset') {
          const assetId = String(payload?.id || payload?.asset_id || '').trim()
          if (!UUID_REGEX.test(assetId)) {
            throw new Error('Invalid asset_id')
          }
          const { error: incErr } = await gameDb.rpc('increment_asset_downloads', { asset_id: assetId })
          if (incErr) throw incErr
          resultData = { success: true }
        } else if (kind === 'blueprint') {
          const bpId = Number(payload?.id ?? payload?.blueprint_id)
          if (!Number.isSafeInteger(bpId) || bpId <= 0) {
            throw new Error('Invalid blueprint_id')
          }
          const { error: incErr } = await gameDb.rpc('increment_blueprint_downloads', { blueprint_id: bpId })
          if (incErr) throw incErr
          resultData = { success: true }
        } else {
          throw new Error('Invalid counter kind')
        }
        break
      }
      default:
        throw new Error('Unknown action: ' + action)
    }

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Edge Function Error:', error?.message || error)
    return new Response(JSON.stringify({ error: sanitizeGatewayErrorMessage(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

