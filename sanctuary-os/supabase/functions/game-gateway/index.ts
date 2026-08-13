// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate OS User
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

    if (!game_id || !action) {
      throw new Error('Missing game_id or action')
    }

    // 3. Get Game DB Configuration securely via Service Role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: game, error: gameError } = await supabaseAdmin
      .from('sanctuary_games')
      .select('supabase_url, supabase_service_key')
      .eq('id', game_id)
      .single()

    if (gameError || !game) throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    if (!game.supabase_service_key) throw new Error('Game DB service key not configured - connection rejected')

    // 4. Initialize Game DB Client with Service Role Key
    const gameDb = createClient(game.supabase_url, game.supabase_service_key)

    // Ensure user exists in Game DB profiles before any action
    const { error: profileError } = await gameDb.from('profiles').upsert({
      id: v_user_id,
      username: 'Citizen_' + v_user_id.substring(0, 6)
    }, { onConflict: 'id', ignoreDuplicates: true })

    if (profileError) console.error("Profile upsert warning:", profileError)

    let resultData = null;

    // 5. Route actions
    switch (action) {
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
        
        // Ensure id column exists and delete
        const { data, error } = await gameDb
          .from(target_table)
          .delete()
          .eq('id', id_value)
          
        if (error) throw error
        resultData = { success: true }
        break;
      }
      default:
        throw new Error('Unknown action')
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
