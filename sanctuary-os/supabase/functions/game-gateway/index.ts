// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

function b64UrlToBytes(input: string): Uint8Array {
  const clean = (input || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, '');
  const pad = (4 - (clean.length % 4)) % 4;
  const bin = atob(clean + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCborItem(bytes: Uint8Array, offset = 0): { value: any; offset: number } {
  if (offset >= bytes.length) throw new Error('CBOR unexpected EOF');
  const initial = bytes[offset++];
  const major = initial >> 5;
  const info = initial & 0x1f;

  function readLength(): number {
    if (info < 24) return info;
    if (info === 24) return bytes[offset++];
    if (info === 25) {
      const v = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      return v;
    }
    if (info === 26) {
      const v =
        ((bytes[offset] << 24) >>> 0) +
        ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
      offset += 4;
      return v;
    }
    throw new Error('Unsupported CBOR length info: ' + info);
  }

  if (major === 0) return { value: readLength(), offset };
  if (major === 1) return { value: -1 - readLength(), offset };
  if (major === 2) {
    const len = readLength();
    const slice = bytes.subarray(offset, offset + len);
    offset += len;
    return { value: slice, offset };
  }
  if (major === 3) {
    const len = readLength();
    const str = new TextDecoder().decode(bytes.subarray(offset, offset + len));
    offset += len;
    return { value: str, offset };
  }
  if (major === 4) {
    const len = readLength();
    const arr: any[] = [];
    for (let i = 0; i < len; i++) {
      const res = decodeCborItem(bytes, offset);
      arr.push(res.value);
      offset = res.offset;
    }
    return { value: arr, offset };
  }
  if (major === 5) {
    const len = readLength();
    const map = new Map<any, any>();
    for (let i = 0; i < len; i++) {
      const k = decodeCborItem(bytes, offset);
      offset = k.offset;
      const v = decodeCborItem(bytes, offset);
      offset = v.offset;
      map.set(k.value, v.value);
    }
    return { value: map, offset };
  }
  if (major === 7) {
    if (info === 20) return { value: false, offset };
    if (info === 21) return { value: true, offset };
    if (info === 22) return { value: null, offset };
  }
  throw new Error('Unsupported CBOR major type: ' + major);
}

function derSignatureToP1363(der: Uint8Array): Uint8Array {
  if (der.length === 64 && der[0] !== 0x30) return der;
  let pos = 0;
  if (der[pos++] !== 0x30) throw new Error('Invalid DER ECDSA signature');
  const seqLen = der[pos++];
  if (seqLen & 0x80) {
    const nBytes = seqLen & 0x7f;
    pos += nBytes;
  }
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA r-integer tag');
  const rLen = der[pos++];
  let r = der.subarray(pos, pos + rLen);
  pos += rLen;
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA s-integer tag');
  const sLen = der[pos++];
  let s = der.subarray(pos, pos + sLen);

  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1);
  if (r.length > 32 || s.length > 32) throw new Error('Invalid ECDSA coordinate length');

  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

async function verifyCoseSignature(
  publicKeyCborBytes: Uint8Array,
  signedData: Uint8Array,
  signatureBytes: Uint8Array
): Promise<boolean> {
  const { value: coseMap } = decodeCborItem(publicKeyCborBytes, 0);
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  if (kty === 3 || alg === -257) {
    const n = coseMap.get(-1) as Uint8Array;
    const e = coseMap.get(-2) as Uint8Array;
    if (!n || !e) throw new Error('Missing RSA modulus or exponent in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: bytesToB64Url(n), e: bytesToB64Url(e), alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signatureBytes, signedData);
  }

  if (kty === 2 || alg === -7) {
    const x = coseMap.get(-2) as Uint8Array;
    const y = coseMap.get(-3) as Uint8Array;
    if (!x || !y) throw new Error('Missing EC P-256 coordinates in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: bytesToB64Url(x), y: bytesToB64Url(y), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const p1363Sig = derSignatureToP1363(signatureBytes);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      p1363Sig,
      signedData
    );
  }

  if (kty === 1 || alg === -8) {
    const x = coseMap.get(-2) as Uint8Array;
    if (!x) throw new Error('Missing Ed25519 public key bytes in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: bytesToB64Url(x), ext: true },
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes, signedData);
  }

  throw new Error(`Unsupported COSE key type (${kty}) or algorithm (${alg})`);
}

function isAllowedWebAuthnOrigin(originStr: string, rpId: string): boolean {
  try {
    const u = new URL(originStr);
    const host = u.hostname.toLowerCase();
    const target = (rpId || 'sanctuaryos.net').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return u.protocol === 'http:' || u.protocol === 'https:';
    }
    return u.protocol === 'https:' && (host === target || host.endsWith('.' + target));
  } catch {
    return false;
  }
}

function formatUuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const STAFF_ROLES = ['wayfinder', 'oversight', 'architect', 'senior_architect', 'admin'];
const CREATOR_OR_STAFF_ROLES = [...STAFF_ROLES, 'mason'];

const STAFF_ONLY_TABLES = new Set([
  'global_network_status',
  'global_security',
  'heuristic_signatures',
  'sanctuary_schemas',
  'sanctuary_lexicons',
  'sanctuary_support_categories',
  'sanctuary_telemetry_sources',
  'dlc_registry',
  'game_versions',
  'taxonomy',
  'tracked_template_files',
  'system_broadcasts',
]);

const CREATOR_OR_STAFF_TABLES = new Set([
  'mods',
  'mod_versions',
  'mod_bundles',
  'mod_dependencies',
  'mod_relationships',
  'version_dependencies',
  'flavor_groups',
  'flavor_group_members',
  'community_groups',
  'community_group_members',
  'collections',
  'collection_members',
  'logical_conflicts',
  'mason_posts',
  'masons',
  'homestead_workbench_templates',
]);

const CITIZEN_TABLES = new Set([
  'audit_logs',
  'mason_post_comments',
  'mason_post_likes',
  'mason_post_views',
  'dispatch_poll_votes',
  'blueprints',
  'blueprint_reports',
  'nexus_assets',
  'nexus_reports',
  'content_flags',
  'sanctuary_tickets',
  'scout_suggestions',
  'notifications',
  'homestead_lab_logs',
  'malware_reports',
  'hardware_bans',
  'sanctuary_themes',
  'citizen_staging_queue',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Parse payload & initialize Hub clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

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

    // Special Hub-wide action: WebAuthn Assertion Verification (supports both authenticated 2FA step-up and passwordless login across apex + www subdomains)
    if (action === 'verify_webauthn_assertion') {
      const { challenge_id, credential } = payload || {}
      if (!challenge_id || !credential?.response) {
        throw new Error('Missing WebAuthn challenge_id or credential response')
      }

      // 1) Snapshot the challenge before GoTrue consumes it
      const { data: challengeSnap } = await supabaseAdmin.rpc('internal_get_webauthn_challenge', {
        p_challenge_id: challenge_id,
      })

      // 2) Try native GoTrue verification first
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
        return new Response(JSON.stringify(nativeJson), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      // 3) Fallback cryptographic verification for subdomain origins (e.g. https://www.sanctuaryos.net)
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

      const expectedRpIdHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
      )
      for (let i = 0; i < 32; i++) {
        if (authDataBytes[i] !== expectedRpIdHash[i]) {
          throw new Error('WebAuthn RP ID hash mismatch.')
        }
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

      // If no active user session was passed (passwordless login flow), mint a session for credRow.user_id
      if (!user) {
        const { data: targetUserRes } = await supabaseAdmin.auth.admin.getUserById(credRow.user_id)
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

    // All remaining actions require an authenticated OS user
    if (authError || !user) {
      throw new Error('Unauthorized on OS DB: ' + (authError?.message || 'No user'))
    }

    const v_user_id = user.id;

    // Special Hub-wide action: WebAuthn Registration Verification (supports apex + www subdomains)
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

      const expectedRpIdHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
      )
      for (let i = 0; i < 32; i++) {
        if (authDataBytes[i] !== expectedRpIdHash[i]) {
          throw new Error('WebAuthn registration RP ID hash mismatch.')
        }
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
          .select('supabase_url, supabase_service_key')
          .eq('is_active', true)

        for (const g of (allGames || [])) {
          if (!g.supabase_url || !g.supabase_service_key) continue
          try {
            const spokeClient = createClient(g.supabase_url, g.supabase_service_key)
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
    if (action === 'verify_and_bootstrap_spoke') {
      if (hubRole !== 'keeper') {
        throw new Error('Forbidden: Only Keepers can verify and bootstrap Spoke uplinks')
      }
      const { supabase_url, supabase_anon_key, supabase_service_key, founder_identifier } = payload || {}
      const cleanSpokeUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      const targetKey = (supabase_service_key || supabase_anon_key || '').trim()
      if (!cleanSpokeUrl || !targetKey) {
        throw new Error('Missing Spoke Supabase URL or Key')
      }
      if (!SUPABASE_URL_REGEX.test(cleanSpokeUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      const startPing = Date.now()
      const testDb = createClient(cleanSpokeUrl, targetKey)
      const requiredTables = ['mods', 'profiles', 'system_broadcasts', 'dispatch_poll_votes', 'global_network_status', 'audit_logs']
      const missingTables: string[] = []

      for (const tbl of requiredTables) {
        const { error: tblErr } = await testDb.from(tbl).select('*', { count: 'exact', head: true }).limit(1)
        if (tblErr && (tblErr.code === '42P01' || tblErr.message?.includes('does not exist') || tblErr.message?.includes('schema cache'))) {
          missingTables.push(tbl)
        }
      }

      const latencyMs = Date.now() - startPing

      if (missingTables.length === 0 && supabase_service_key) {
        await testDb.from('global_network_status').upsert({
          id: 1,
          defcon_level: 5,
          status_message: 'Network Secure. All systems nominal.'
        }, { onConflict: 'id' })
      }

      let wayfinderProvisioned: string | null = null
      if (founder_identifier && String(founder_identifier).trim() && supabase_service_key && missingTables.length === 0) {
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
          // Safe parameterized lookups without .or() string interpolation
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
        latency_ms: latencyMs
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!game_id) {
      throw new Error('Missing game_id')
    }

    // 4. Resolve Target Spoke DB Configuration (by UUID id or schema_id)
    let gameQuery = supabaseAdmin
      .from('sanctuary_games')
      .select('id, name, schema_id, supabase_url, supabase_anon_key, supabase_service_key, is_active')

    if (UUID_REGEX.test(game_id)) {
      gameQuery = gameQuery.eq('id', game_id)
    } else {
      gameQuery = gameQuery.eq('schema_id', game_id)
    }

    const { data: game, error: gameError } = await gameQuery.maybeSingle()

    if (gameError || !game) throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    if (!game.supabase_service_key) {
      if (action === 'sever_spoke_cord' && hubRole === 'keeper') {
        await supabaseAdmin
          .from('sanctuary_games')
          .update({ is_active: false, supabase_service_key: null })
          .eq('id', game.id)
        await supabaseAdmin.from('audit_logs').insert({
          action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
          target_table: 'sanctuary_games',
          target_name: game.name || game.schema_id,
          actor_id: v_user_id,
          reason: payload?.reason || 'Keeper Severance Protocol',
          game_name: 'Keeper Hub'
        })
        return new Response(JSON.stringify({ success: true, severed_by: 'keeper', schema_id: game.schema_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      throw new Error('Game DB service key not configured - connection rejected')
    }

    // 5. Initialize Spoke DB Client with Service Role Key
    const gameDb = createClient(game.supabase_url, game.supabase_service_key)

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
    const isCallerStaff = hubRole === 'keeper' || STAFF_ROLES.includes(callerSpokeRole)
    const isCallerCreatorOrStaff = hubRole === 'keeper' || CREATOR_OR_STAFF_ROLES.includes(callerSpokeRole)

    let resultData = null;

    // 7. Route actions
    switch (action) {
      case 'sync_spoke_profile': {
        resultData = {
          ...callerSpokeProfile,
          os_role: hubRole
        }
        break;
      }
      case 'update_spoke_profile': {
        const { target_user_id, updates } = payload || {}
        if (!target_user_id || !updates) throw new Error('Missing target_user_id or updates')

        const isSelfBan = target_user_id === v_user_id && updates.is_banned === true && Object.keys(updates).every(k => ['is_banned', 'blacklist_reason'].includes(k))
        const isKeeperOrWayfinder = hubRole === 'keeper' || callerSpokeRole === 'wayfinder'
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
          if (['oversight', 'wayfinder'].includes(targetSpoke?.role) || ['oversight', 'wayfinder'].includes(updates.role)) {
            throw new Error('Forbidden: Oversight cannot modify Wayfinder or Oversight roles')
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

        // Only a Core OS Keeper (or automated local self-quarantine) can escalate a ban to the global Hub profiles table
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

        // Prevent Masons from self-escalating is_verified, followers_count, or profile_id unless caller is Staff/Keeper
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
          'pinned_ccset_id',
        ]
        const staffExtraKeys = ['is_verified', 'profile_id', 'followers_count']
        const allowedKeys = isCallerStaff ? [...ownerAllowedKeys, ...staffExtraKeys] : ownerAllowedKeys

        for (const k of allowedKeys) {
          if (profile_data[k] !== undefined) {
            sanitizedData[k] = profile_data[k]
          }
        }

        const { data: updatedMason, error: updateError } = await gameDb
          .from('masons')
          .update(sanitizedData)
          .eq('id', mason_id)
          .select()
          .single()

        if (updateError) throw updateError
        resultData = updatedMason
        break;
      }
      case 'upsert_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, payload_data } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || !payload_data) {
          throw new Error('Missing target_table or payload_data')
        }

        const restrictedTables = ['profiles', 'auth.users']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Insufficient permissions to modify ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (!isCallerCreatorOrStaff) {
            throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
          }
        } else if (!CITIZEN_TABLES.has(cleanTable)) {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const { data, error } = await gameDb
          .from(cleanTable)
          .upsert(payload_data)
          .select()

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

        const restrictedTables = ['profiles', 'auth.users', 'audit_logs']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (!isCallerCreatorOrStaff) {
            throw new Error(`Forbidden: Creator or Staff role required to delete from ${cleanTable}`)
          }
        } else if (CITIZEN_TABLES.has(cleanTable)) {
          // If not staff, verify ownership on user-owned tables before deletion
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
              if (!existingRow || existingRow[ownerCol] !== v_user_id) {
                throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
              }
            } else if (cleanTable !== 'citizen_staging_queue') {
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
        } catch (e) {
          console.warn('Spoke audit log insert warning on sever:', e)
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
            is_active: false,
            supabase_service_key: null
          })
          .eq('id', game.id)

        if (severErr) throw severErr

        resultData = {
          success: true,
          severed_by: callerSpokeRole === 'wayfinder' ? 'wayfinder' : 'keeper',
          schema_id: game.schema_id
        }
        break;
      }
      case 'update_spoke_uplink': {
        if (hubRole !== 'keeper' && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Core OS Keeper can update Spoke uplink keys.')
        }
        const newUrl = (payload?.supabase_url?.trim() || game.supabase_url || '').replace(/\/+$/, '')
        const newAnonKey = payload?.supabase_anon_key?.trim() || game.supabase_anon_key
        const newServiceKey = payload?.supabase_service_key?.trim() || game.supabase_service_key

        if (!newUrl || !newAnonKey || !newServiceKey) {
          throw new Error('Missing required Spoke URL, Anon Key, or Service Key.')
        }
        if (!SUPABASE_URL_REGEX.test(newUrl)) {
          throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
        }

        const verifyClient = createClient(newUrl, newServiceKey)
        const { error: pingErr } = await verifyClient.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
        if (pingErr) {
          throw new Error('Spoke handshake failed with new credentials: ' + pingErr.message)
        }

        const { error: updErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            supabase_url: newUrl,
            supabase_anon_key: newAnonKey,
            supabase_service_key: newServiceKey,
            is_active: true
          })
          .eq('id', game.id)

        if (updErr) throw updErr

        try {
          await gameDb.from('audit_logs').insert({
            action: 'Rotated Spoke Uplink Credentials',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: 'Wayfinder / Keeper Uplink Key Rotation'
          })
        } catch (e) {}

        resultData = { success: true, schema_id: game.schema_id }
        break;
      }
      default:
        throw new Error('Unknown action: ' + action)
    }

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Edge Function Error:', error.message)
    return new Response(JSON.stringify({ error: error.message, original_error: error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
