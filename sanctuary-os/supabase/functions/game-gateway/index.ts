// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (!game_id) {
      throw new Error('Missing game_id')
    }

    // 4. Resolve Target Spoke DB Configuration (by UUID id or schema_id)
    let gameQuery = supabaseAdmin
      .from('sanctuary_games')
      .select('id, schema_id, supabase_url, supabase_service_key')

    if (UUID_REGEX.test(game_id)) {
      gameQuery = gameQuery.eq('id', game_id)
    } else {
      gameQuery = gameQuery.eq('schema_id', game_id)
    }

    const { data: game, error: gameError } = await gameQuery.maybeSingle()

    if (gameError || !game) throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    if (!game.supabase_service_key) throw new Error('Game DB service key not configured - connection rejected')

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
      Boolean(existingSpokeProfile.is_banned) !== Boolean(hubIsBanned) ||
      (existingSpokeProfile.blacklist_reason || null) !== (hubBlacklistReason || null)
    ) {
      const { data: updatedProfile, error: syncErr } = await gameDb
        .from('profiles')
        .update({
          username: hubUsername,
          is_banned: hubIsBanned,
          blacklist_reason: hubBlacklistReason
        })
        .eq('id', v_user_id)
        .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
        .maybeSingle()
      if (syncErr) console.error("Profile sync warning:", syncErr)
      if (updatedProfile) callerSpokeProfile = updatedProfile
    }

    const callerSpokeRole = (callerSpokeProfile?.role || 'citizen').toLowerCase()

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
        const isArchitectMasonPromote = callerSpokeRole === 'architect' && Object.keys(updates).length === 1 && updates.role === 'mason'

        if (!isSelfBan && !isKeeperOrWayfinder && !isOversight && !isArchitectMasonPromote) {
          throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
        }

        // Ensure target user exists in Spoke profiles (if they exist in Hub, pull them in first)
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
        if (updates.role !== undefined) allowedFields.role = updates.role
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

        // If Global Ban (is_banned / blacklist_reason) was updated, synchronize back to Core OS Hub
        if (updates.is_banned !== undefined || updates.blacklist_reason !== undefined) {
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
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').insert({
          user_id: v_user_id,
          mason_id: mason_id
        })
        if (error && error.code !== '23505') throw error // ignore unique violation
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
        const { mason_id, profile_data } = payload
        
        // Verify ownership
        const { data: mason, error: masonError } = await gameDb
          .from('masons')
          .select('profile_id')
          .eq('id', mason_id)
          .single()
          
        if (masonError || !mason) throw new Error('Mason not found')
        if (mason.profile_id !== v_user_id) throw new Error('Forbidden: You do not own this mason profile')
        
        const { data: updatedMason, error: updateError } = await gameDb
          .from('masons')
          .update(profile_data)
          .eq('id', mason_id)
          .select()
          .single()
          
        if (updateError) throw updateError
        resultData = updatedMason
        break;
      }
      case 'upsert_cloud_file': {
        const { target_table, payload_data } = payload
        
        // This is a generic upsert, ensure it's not trying to update sensitive tables
        const restrictedTables = ['profiles', 'auth.users']
        if (restrictedTables.includes(target_table)) {
          throw new Error('Forbidden table target')
        }

        const { data, error } = await gameDb
          .from(target_table)
          .upsert(payload_data)
          .select()
          
        if (error) {
          if (error.code === '23505' && target_table === 'mason_post_views') {
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
        const { target_table, id_value } = payload
        
        const restrictedTables = ['profiles', 'auth.users']
        if (restrictedTables.includes(target_table)) {
          throw new Error('Forbidden table target')
        }
        
        const { error } = await gameDb
          .from(target_table)
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

