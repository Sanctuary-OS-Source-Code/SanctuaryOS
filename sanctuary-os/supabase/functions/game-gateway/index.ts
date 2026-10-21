// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

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
  'logical_conflicts',
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
    // 1. Authenticate OS User on Hub
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const token = authHeader.replace('Bearer ', '')

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized on OS DB: ' + (authError?.message || 'No user'))

    const v_user_id = user.id;

    // 2. Extract payload
    const body = await req.json()
    const { game_id, action, payload } = body

    if (!action) {
      throw new Error('Missing action')
    }

    // 3. Initialize Hub Admin Client (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
