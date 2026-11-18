/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SERVER_AUTH_OPTS } from './corsAndSanitization.ts'
import {
  UUID_REGEX,
  isValidSpokeSupabaseUrl,
  normalizeSpokeUrl,
  detectCredentialKind,
  maskCredentialFingerprint,
  sealSpokeEnvelope,
  openSpokeEnvelope,
  createSpokeClient,
  verifySpokeCredentialHandshake,
} from './cryptoEnvelope.ts'
import {
  invalidateSpokeGameConfigCache,
  resolveGameWithServiceKey,
} from './spokeAccessAndOwnership.ts'
import {
  handleExecuteDmcaTriageAction,
  handleListSpokeDmcaNotices,
} from './dmcaComplianceActions.ts'

export async function handleKeeperHubActions(ctx: {
  action: string;
  payload: any;
  game_id: any;
  v_user_id: string;
  hubRole: string;
  hubIsBanned: boolean;
  supabaseAdmin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const { action, payload, game_id, v_user_id, hubRole, hubIsBanned, supabaseAdmin, corsHeaders } = ctx;

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
      if (!isValidSpokeSupabaseUrl(cleanUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co or custom HTTPS Supabase domain')
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
      if (!isValidSpokeSupabaseUrl(resolvedUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co or custom HTTPS Supabase domain')
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

  return null;
}

export async function handlePreClientSpokeAdminActions(ctx: {
  action: string;
  payload: any;
  game: any;
  gameServiceKey: string | null;
  v_user_id: string;
  hubRole: string;
  supabaseAdmin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const { action, payload, game, gameServiceKey, v_user_id, hubRole, supabaseAdmin, corsHeaders } = ctx;

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
      if (gameServiceKey && isValidSpokeSupabaseUrl(String(game.supabase_url || '').trim())) {
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

    if (action === 'list_spoke_dmca_notices' && hubRole === 'keeper') {
      const data = await handleListSpokeDmcaNotices({
        payload,
        hubRole,
        supabaseAdmin,
      })
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'execute_dmca_triage_action' && hubRole === 'keeper') {
      const data = await handleExecuteDmcaTriageAction({
        payload,
        v_user_id,
        hubRole,
        supabaseAdmin,
      })
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

  return null;
}
