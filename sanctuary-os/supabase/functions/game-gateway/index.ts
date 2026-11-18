// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  SERVER_AUTH_OPTS,
  getCorsHeaders,
  sanitizeGatewayErrorMessage,
} from './corsAndSanitization.ts'
import { createSpokeClient } from './cryptoEnvelope.ts'
import {
  STAFF_ROLES,
  CREATOR_OR_STAFF_ROLES,
  resolveGameWithServiceKey,
} from './spokeAccessAndOwnership.ts'
import { handlePreAuthGatewayActions, handleWebAuthnRegistration } from './publicAndWebauthnActions.ts'
import { handleKeeperHubActions, handlePreClientSpokeAdminActions } from './keeperHubActions.ts'
import { handleSpokeQueryAction } from './spokeQueryProxy.ts'
import { createSpokeOwnershipHelpers, handleSpokeMutationAction } from './spokeMutationActions.ts'

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

    const preAuthRes = await handlePreAuthGatewayActions({
      req, action, payload, game_id, supabaseUrl, supabaseAnonKey, supabaseAdmin, corsHeaders,
    })
    if (preAuthRes) return preAuthRes

    // All remaining actions require an authenticated OS user
    if (authError || !user) {
      throw new Error('Unauthorized on OS DB: ' + (authError?.message || 'No user'))
    }

    const v_user_id = user.id;


    const webauthnRegRes = await handleWebAuthnRegistration({
      req, action, payload, token, v_user_id, supabaseUrl, supabaseAnonKey, supabaseAdmin, corsHeaders,
    })
    if (webauthnRegRes) return webauthnRegRes

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


    const keeperHubRes = await handleKeeperHubActions({
      action, payload, game_id, v_user_id, hubRole, hubIsBanned, supabaseAdmin, corsHeaders,
    })
    if (keeperHubRes) return keeperHubRes

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


    const preClientAdminRes = await handlePreClientSpokeAdminActions({
      action, payload, game, gameServiceKey, v_user_id, hubRole, supabaseAdmin, corsHeaders,
    })
    if (preClientAdminRes) return preClientAdminRes

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


    const ownershipHelpers = createSpokeOwnershipHelpers({ gameDb, v_user_id, isCallerStaff })

    let resultData: any = null
    if (action === 'spoke_query' || action === 'spoke_query_batch') {
      resultData = await handleSpokeQueryAction({
        action, payload, game, gameDb, v_user_id, callerSpokeProfile, callerSpokeRole,
        isCallerBanned, isCallerStaff, isCallerCreatorOrStaff, isArchitectOnlyStaff, isOversightOnlyStaff,
        ...ownershipHelpers,
      })
    } else {
      resultData = await handleSpokeMutationAction({
        action, payload, game, gameDb, v_user_id, hubUsername, hubRole, hubIsBanned, hubBlacklistReason,
        callerSpokeProfile, callerSpokeRole, isCallerBanned, isCallerStaff, isCallerCreatorOrStaff,
        resolvedCredentialKind, resolvedKeyVersion, resolvedKeyFingerprint, resolvedRotatedAt,
        supabaseAdmin, ...ownershipHelpers,
      })
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

