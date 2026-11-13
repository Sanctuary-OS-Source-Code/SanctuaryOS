import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "./store";

// ============================================================================
// SANCTUARY OS — FORK & NETWORK CONFIGURATION (EDIT ONLY THIS BLOCK TO FORK)
// ============================================================================
export const SANCTUARY_CONFIG = {
    /**
     * QUICK FORK OPTION A — Paste a `SANCTUARY-UPLINK://...` bundle exported from the Wayfinder Hub.
     * When populated, Sanctuary OS automatically switches to "standalone" mode and configures your
     * Supabase URL, Anon Key, and Workspace identity from this single string.
     */
    uplinkBundle: (import.meta as any).env?.VITE_SANCTUARY_UPLINK_BUNDLE || "",

    /**
     * QUICK FORK OPTION B — Manual Configuration
     * - "hub_and_spoke": Official multi-game network (Core OS Hub DB + Community Spoke DBs via game-gateway).
     * - "standalone":    Single-database community fork! Uses your single Spoke DB (schema.sql) for Auth,
     *                    Profiles, and Game tables directly — NO Hub DB and NO Edge Function required!
     */
    mode: ((import.meta as any).env?.VITE_SANCTUARY_MODE || "hub_and_spoke") as "hub_and_spoke" | "standalone",

    // Primary Database Credentials (Core Hub DB in "hub_and_spoke" mode, or your Spoke DB in "standalone" mode)
    supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL || "https://tpsbtaqxlczrysqqmanp.supabase.co",
    supabaseAnonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC",

    // Standalone Workspace Definition (Used automatically when mode === "standalone")
    standaloneWorkspace: {
        id: (import.meta as any).env?.VITE_STANDALONE_WORKSPACE_ID || "standalone",
        name: (import.meta as any).env?.VITE_STANDALONE_WORKSPACE_NAME || "Community Workspace",
        schema_id: (import.meta as any).env?.VITE_STANDALONE_SCHEMA_ID || "universal",
        icon: (import.meta as any).env?.VITE_STANDALONE_ICON || "sports_esports",
    },
};
// ============================================================================

function resolveSanctuaryConfig() {
    const bundle = (SANCTUARY_CONFIG.uplinkBundle || "").trim();
    if (bundle.startsWith("SANCTUARY-UPLINK://")) {
        try {
            const b64 = bundle.replace("SANCTUARY-UPLINK://", "").trim();
            const parsed = JSON.parse(atob(b64));
            if (parsed.supabase_url && parsed.supabase_anon_key) {
                const schemaId = (parsed.schema_id || SANCTUARY_CONFIG.standaloneWorkspace.schema_id || "universal").trim();
                return {
                    mode: "standalone" as const,
                    supabaseUrl: parsed.supabase_url.trim(),
                    supabaseAnonKey: parsed.supabase_anon_key.trim(),
                    standaloneWorkspace: {
                        id: schemaId,
                        name: (parsed.name || SANCTUARY_CONFIG.standaloneWorkspace.name || schemaId).trim(),
                        schema_id: schemaId,
                        icon: (parsed.icon || SANCTUARY_CONFIG.standaloneWorkspace.icon || "sports_esports").trim(),
                    },
                };
            }
        } catch (err) {
            console.error("Failed to parse SANCTUARY-UPLINK:// bundle in SANCTUARY_CONFIG:", err);
        }
    }
    return {
        mode: SANCTUARY_CONFIG.mode,
        supabaseUrl: SANCTUARY_CONFIG.supabaseUrl.trim(),
        supabaseAnonKey: SANCTUARY_CONFIG.supabaseAnonKey.trim(),
        standaloneWorkspace: SANCTUARY_CONFIG.standaloneWorkspace,
    };
}

export const RESOLVED_SANCTUARY_CONFIG = resolveSanctuaryConfig();
export const isStandaloneFork = RESOLVED_SANCTUARY_CONFIG.mode === "standalone";

// Main Core OS Database Credentials (or Standalone Spoke Credentials when isStandaloneFork === true)
const authUrl = RESOLVED_SANCTUARY_CONFIG.supabaseUrl;
const authKey = RESOLVED_SANCTUARY_CONFIG.supabaseAnonKey;

const rawAuthClient = createClient(authUrl, authKey, {
    auth: {
        storageKey: "sanctuary-os-auth-token",
    }
});

const createStaticPostgrestBuilder = (staticData: any = [], countOverride?: number) => {
    const resolvedCount = typeof countOverride === "number" ? countOverride : (Array.isArray(staticData) ? staticData.length : 0);
    const response = { data: staticData, error: null, count: resolvedCount, status: 200, statusText: 'OK' };
    const builder: any = Promise.resolve(response);
    builder.select = () => builder;
    builder.insert = () => builder;
    builder.upsert = () => builder;
    builder.update = () => builder;
    builder.delete = () => builder;
    builder.eq = () => builder;
    builder.neq = () => builder;
    builder.gt = () => builder;
    builder.lt = () => builder;
    builder.gte = () => builder;
    builder.lte = () => builder;
    builder.like = () => builder;
    builder.ilike = () => builder;
    builder.is = () => builder;
    builder.in = () => builder;
    builder.contains = () => builder;
    builder.containedBy = () => builder;
    builder.rangeGt = () => builder;
    builder.rangeGte = () => builder;
    builder.rangeLt = () => builder;
    builder.rangeLte = () => builder;
    builder.rangeAdjacent = () => builder;
    builder.overlaps = () => builder;
    builder.textSearch = () => builder;
    builder.match = () => builder;
    builder.not = () => builder;
    builder.or = () => builder;
    builder.filter = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.range = () => builder;
    builder.abortSignal = () => builder;
    builder.single = () => Promise.resolve({
        data: Array.isArray(staticData) ? (staticData[0] ?? null) : staticData,
        error: null,
        count: resolvedCount,
        status: 200,
        statusText: 'OK'
    });
    builder.maybeSingle = () => Promise.resolve({
        data: Array.isArray(staticData) ? (staticData[0] ?? null) : staticData,
        error: null,
        count: resolvedCount,
        status: 200,
        statusText: 'OK'
    });
    builder.csv = () => builder;
    builder.then = (onfulfilled: any, onrejected?: any) => Promise.resolve(response).then(onfulfilled, onrejected);
    builder.catch = (onrejected: any) => Promise.resolve(response).catch(onrejected);
    builder.finally = (onfinally: any) => Promise.resolve(response).finally(onfinally);
    return builder;
};

const createMockPostgrestBuilder = () => createStaticPostgrestBuilder([], 0);

export function hasActiveGameDatabase(): boolean {
    if (isStandaloneFork) return true;
    return getActiveGameClient() !== null;
}

export function getStandaloneWorkspaceRow() {
    const ws = RESOLVED_SANCTUARY_CONFIG.standaloneWorkspace;
    return {
        id: ws.id,
        name: ws.name,
        schema_id: ws.schema_id,
        supabase_url: authUrl,
        supabase_anon_key: authKey,
        icon: ws.icon || "sports_esports",
        is_active: true,
        created_at: new Date().toISOString(),
    };
}

// 1. Export the persistent Auth Client (with automatic Standalone table mapping when in "standalone" fork mode)
export const supabaseAuth: SupabaseClient = new Proxy(rawAuthClient, {
    get(target, prop) {
        if (isStandaloneFork && prop === 'from') {
            return (table: string) => {
                if (table === 'sanctuary_games') {
                    return createStaticPostgrestBuilder([getStandaloneWorkspaceRow()]);
                }
                if (table === 'keeper_heuristic_signatures') {
                    // In standalone mode, Spoke `heuristic_signatures` is already queried in parallel
                    return createStaticPostgrestBuilder([], 0);
                }
                if (table === 'keeper_system_broadcasts') {
                    return target.from('system_broadcasts');
                }
                if (table === 'keeper_dispatch_poll_votes') {
                    return target.from('dispatch_poll_votes');
                }
                if (table === 'keeper_tickets') {
                    return target.from('sanctuary_tickets');
                }
                if (table === 'keeper_support_categories') {
                    return target.from('sanctuary_support_categories');
                }
                return target.from(table);
            };
        }
        const value = (target as any)[prop];
        return typeof value === 'function' ? value.bind(target) : value;
    }
});

// Dynamic Game Client variables
let currentGameClient: SupabaseClient | null = null;
let currentGameId = "";
let currentToken = "";
let currentSpokeUrl = "";
let currentSpokeKey = "";
const spokeClientCache = new Map<string, SupabaseClient>();

export function getActiveGameClient(): SupabaseClient {
    // In Standalone Fork Mode, the Auth DB and the Game Spoke DB are the exact same Supabase instance
    if (isStandaloneFork) {
        return rawAuthClient;
    }

    const state = useStore.getState();
    const activeWsId = state.activeWorkspaceId;
    const workspaces = state.workspaces || [];
    const activeWs = workspaces.find((w: any) => w.id === activeWsId);
    const session = state.session;
    const token = session?.access_token || "";

    // If no workspace is active (e.g. on the Hub), return null
    if (
        !activeWs ||
        !activeWs.supabase_url ||
        !activeWs.supabase_anon_key ||
        activeWsId === 'default_workspace' ||
        !/^https?:\/\//i.test(String(activeWs.supabase_url).trim())
    ) {
        return null as unknown as SupabaseClient; // Handled by proxy traps
    }

    const cleanSpokeUrl = activeWs.supabase_url.trim().replace(/\/+$/, '');
    const cleanSpokeKey = activeWs.supabase_anon_key.trim();

    // Re-instantiate or swap client whenever workspace ID, token, Spoke URL, or Spoke publishable/anon key changes
    if (
        currentGameId !== activeWs.id ||
        currentToken !== token ||
        currentSpokeUrl !== cleanSpokeUrl ||
        currentSpokeKey !== cleanSpokeKey ||
        !currentGameClient
    ) {
        currentGameId = activeWs.id;
        currentToken = token;
        currentSpokeUrl = cleanSpokeUrl;
        currentSpokeKey = cleanSpokeKey;

        // If the Spoke URL matches the Hub URL, reuse rawAuthClient so session JWTs work seamlessly
        if (cleanSpokeUrl === authUrl.trim().replace(/\/+$/, '')) {
            currentGameClient = rawAuthClient;
            return currentGameClient;
        }

        const cacheKey = `${cleanSpokeUrl}::${cleanSpokeKey}`;
        if (spokeClientCache.has(cacheKey)) {
            currentGameClient = spokeClientCache.get(cacheKey)!;
            return currentGameClient;
        }

        const clientOptions: any = {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storageKey: `sb-spoke-client-${activeWs.id}`,
            }
        };

        // In Hub-and-Spoke mode, we DO NOT inject the Hub JWT token into external Spoke clients
        // because external Spoke databases have their own JWT secrets.
        currentGameClient = createClient(cleanSpokeUrl, cleanSpokeKey, clientOptions);
        spokeClientCache.set(cacheKey, currentGameClient);
    }

    return currentGameClient as SupabaseClient;
}

/**
 * Direct Database RPC Execution for Standalone Fork Mode
 * Executes all `secure_*` operations directly against the single community Supabase database
 * so forks do NOT need a separate Hub database or the `game-gateway` Edge Function.
 */
async function executeStandaloneDirectRpc(fnName: string, args: any = {}) {
    try {
        const { data: userData } = await rawAuthClient.auth.getUser();
        const user = userData?.user;

        if (fnName === 'secure_sync_spoke_profile') {
            if (!user) return { data: null, error: null };
            const { data: existingProfile } = await rawAuthClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (existingProfile) {
                if (typeof args?.p_relink_commitment_hash === 'string' && /^[0-9a-f]{64}$/i.test(args.p_relink_commitment_hash)) {
                    try {
                        await rawAuthClient.rpc('register_spoke_relink_commitment', {
                            p_commitment_hash: args.p_relink_commitment_hash.trim().toLowerCase(),
                        });
                    } catch {}
                }
                return { data: existingProfile, error: null };
            }

            // If no Wayfinder exists yet on this standalone database, promote the first registered user!
            const { count: wfCount } = await rawAuthClient
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'wayfinder');

            const initialRole = (wfCount === 0 || wfCount === null) ? 'wayfinder' : 'citizen';
            const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Citizen';

            const { data: createdProfile, error: createError } = await rawAuthClient
                .from('profiles')
                .upsert({
                    id: user.id,
                    username,
                    role: initialRole,
                    is_banned: false,
                    is_comm_banned: false,
                }, { onConflict: 'id' })
                .select()
                .single();

            if (typeof args?.p_relink_commitment_hash === 'string' && /^[0-9a-f]{64}$/i.test(args.p_relink_commitment_hash)) {
                try {
                    await rawAuthClient.rpc('register_spoke_relink_commitment', {
                        p_commitment_hash: args.p_relink_commitment_hash.trim().toLowerCase(),
                    });
                } catch {}
            }

            return { data: createdProfile || { id: user.id, username, role: initialRole }, error: createError };
        }

        if (fnName === 'secure_update_spoke_profile') {
            const { data, error } = await rawAuthClient
                .from('profiles')
                .update(args.p_updates || {})
                .eq('id', args.p_target_user_id)
                .select()
                .single();
            return { data, error };
        }

        if (fnName === 'secure_sync_hub_ban_to_spokes') {
            return { data: { success: true, mode: 'standalone' }, error: null };
        }

        if (fnName === 'secure_verify_and_bootstrap_spoke') {
            const requiredTables = ['mods', 'mod_versions', 'masons', 'blueprints', 'logical_conflicts', 'profiles', 'system_broadcasts', 'dispatch_poll_votes', 'heuristic_signatures', 'global_network_status', 'audit_logs'];
            const verifiedTables: string[] = [];
            const missingTables: string[] = [];
            for (const tbl of requiredTables) {
                const { error } = await rawAuthClient.from(tbl).select('*', { count: 'exact', head: true });
                if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
                    missingTables.push(tbl);
                } else {
                    verifiedTables.push(tbl);
                }
            }
            return {
                data: {
                    success: missingTables.length === 0,
                    verified_tables: verifiedTables,
                    missing_tables: missingTables,
                },
                error: null
            };
        }

        if (fnName === 'secure_sever_spoke_cord' || fnName === 'secure_update_spoke_uplink') {
            return {
                data: {
                    success: true,
                    mode: 'standalone',
                    message: 'Already running in Standalone Fork Mode (no Hub cord attached).'
                },
                error: null
            };
        }

        if (fnName === 'secure_upsert_cloud_file') {
            const { data, error } = await rawAuthClient
                .from(args.p_target)
                .upsert(args.p_payload)
                .select();
            return { data, error };
        }

        if (fnName === 'secure_delete_cloud_file') {
            const { data, error } = await rawAuthClient
                .from(args.p_target)
                .delete()
                .eq('id', args.p_id);
            return { data, error };
        }

        if (fnName === 'secure_update_mason_profile') {
            const { data, error } = await rawAuthClient
                .from('masons')
                .update(args.p_payload)
                .eq('id', args.p_mason_id)
                .select()
                .single();
            return { data, error };
        }

        if (fnName === 'secure_toggle_mason_follow') {
            if (!user) return { data: null, error: new Error('Not authenticated') as any };
            if (args?.p_action === 'follow') {
                await rawAuthClient
                    .from('mason_followers')
                    .upsert({ user_id: user.id, mason_id: args.p_mason_id }, { onConflict: 'user_id,mason_id' });
            } else {
                await rawAuthClient
                    .from('mason_followers')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('mason_id', args.p_mason_id);
            }
            const { count } = await rawAuthClient
                .from('mason_followers')
                .select('*', { count: 'exact', head: true })
                .eq('mason_id', args.p_mason_id);
            if (typeof count === 'number') {
                await rawAuthClient.from('masons').update({ followers_count: count }).eq('id', args.p_mason_id);
            }
            return { data: { success: true, followers_count: count ?? 0 }, error: null };
        }

        if (fnName === 'secure_fetch_notifications') {
            if (!user) return { data: [], error: null };
            const { data, error } = await rawAuthClient
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(100);
            return { data: data || [], error };
        }

        if (fnName === 'secure_mark_notifications_read') {
            if (!user) return { data: [], error: null };
            const { data, error } = await rawAuthClient
                .from('notifications')
                .update({ is_read: true })
                .eq('id', args?.p_id)
                .eq('user_id', user.id);
            return { data, error };
        }

        if (fnName === 'secure_delete_notifications') {
            if (!user) return { data: [], error: null };
            const { data, error } = await rawAuthClient
                .from('notifications')
                .delete()
                .eq('id', args?.p_id)
                .eq('user_id', user.id);
            return { data, error };
        }

        if (fnName === 'secure_mark_all_notifications_read') {
            if (!user) return { data: [], error: null };
            const { data, error } = await rawAuthClient
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id);
            return { data, error };
        }

        if (fnName === 'secure_delete_all_notifications') {
            if (!user) return { data: [], error: null };
            const { data, error } = await rawAuthClient
                .from('notifications')
                .delete()
                .eq('user_id', user.id);
            return { data, error };
        }

        if (fnName === 'bulk_ingest_vault_mods') {
            return await rawAuthClient.rpc('bulk_ingest_vault_mods', {
                p_items: args?.p_items || args?.items || [],
            });
        }

        if (fnName === 'dispatch_follower_notifications') {
            return await rawAuthClient.rpc('dispatch_follower_notifications', {
                p_mason_id: args?.p_mason_id || args?.mason_id,
                p_type: args?.p_type || args?.type || 'new_post',
                p_reference_id: args?.p_reference_id || args?.reference_id,
                p_message: args?.p_message || args?.message || '',
            });
        }

        if (fnName === 'dispatch_broadcast_notifications') {
            const masonId = args?.p_mason_id || args?.mason_id;
            if (masonId) {
                return await rawAuthClient.rpc('dispatch_follower_notifications', {
                    p_mason_id: masonId,
                    p_type: args?.p_type || args?.type || 'new_post',
                    p_reference_id: args?.p_reference_id || args?.reference_id,
                    p_message: args?.p_message || args?.message || '',
                });
            }
            if (!user) return { data: null, error: new Error('Not authenticated') as any };
            const { data: recipients, error: recErr } = await rawAuthClient
                .from('profiles')
                .select('id')
                .or('is_banned.is.null,is_banned.eq.false');
            if (recErr) return { data: null, error: recErr };
            const excludeSelf = args?.p_exclude_self !== false;
            const rows = (recipients || [])
                .filter((r: any) => r?.id && (!excludeSelf || r.id !== user.id))
                .map((r: any) => ({
                    user_id: r.id,
                    actor_id: user.id,
                    type: args?.p_type || args?.type || 'system_broadcast',
                    reference_id: args?.p_reference_id || args?.reference_id,
                    message: args?.p_message || args?.message || '',
                }));
            let dispatched = 0;
            for (let i = 0; i < rows.length; i += 500) {
                const chunk = rows.slice(i, i + 500);
                const { error: insErr } = await rawAuthClient.from('notifications').insert(chunk);
                if (insErr) return { data: null, error: insErr };
                dispatched += chunk.length;
            }
            return { data: { success: true, dispatched }, error: null };
        }

        if (fnName === 'flag_mod_for_compliance') {
            const modId = String(args?.p_mod_id || args?.mod_id || '').trim();
            const requestedTier = Math.min(4, Math.max(1, Math.round(Number(args?.p_tier || args?.tier || 1))));
            const cleanReason = String(args?.p_reason || args?.reason || '').trim() || `Flagged Tier ${requestedTier} for Compliance Review`;
            if (!modId) return { data: null, error: new Error('Missing mod_id') };
            const { data: updated, error: updErr } = await rawAuthClient
                .from('mods')
                .update({
                    compliance_tier: requestedTier,
                    status: 'pending',
                    status_reason: cleanReason,
                })
                .eq('id', modId)
                .select()
                .maybeSingle();
            if (updErr) return { data: null, error: updErr };
            return { data: { success: true, queued_pending: true, mod: updated }, error: null };
        }

        return await rawAuthClient.rpc(fnName, args);
    } catch (err: any) {
        console.error(`Standalone RPC Error (${fnName}):`, err);
        return { data: null, error: err };
    }
}

const RESTRICTED_SPOKE_SELECT_TABLES = new Set([
    'sanctuary_tickets',
    'blueprint_reports',
    'nexus_reports',
    'content_flags',
    'malware_reports',
    'notifications',
    'pwa_push_subscriptions',
]);

interface PendingSpokeSelectItem {
    spec: any;
    resolve: (res: any) => void;
}

const pendingSpokeSelectQueues = new Map<string, PendingSpokeSelectItem[]>();

async function invokeSingleSpokeGatewaySelect(targetGameId: string, token: string, spec: any) {
    try {
        const res = await supabaseAuth.functions.invoke('game-gateway', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: {
                game_id: targetGameId,
                action: 'spoke_query',
                payload: spec,
            },
        });

        if (res.error) {
            return {
                data: null,
                error: res.error,
                count: null,
                status: 500,
                statusText: 'Gateway Error',
            };
        }
        if (res.data?.error) {
            return {
                data: null,
                error: { message: res.data.error, details: res.data.original_error },
                count: null,
                status: 403,
                statusText: 'Forbidden',
            };
        }
        if (res.data && res.data.__spoke_query_v1) {
            return {
                data: res.data.data ?? null,
                error: null,
                count: res.data.count ?? null,
                status: 200,
                statusText: 'OK',
            };
        }
        return {
            data: res.data ?? null,
            error: null,
            count: Array.isArray(res.data) ? res.data.length : null,
            status: 200,
            statusText: 'OK',
        };
    } catch (err: any) {
        return {
            data: null,
            error: { message: err?.message || 'Spoke gateway query failed' },
            count: null,
            status: 500,
            statusText: 'Internal Error',
        };
    }
}

function enqueueBatchedSpokeSelect(targetGameId: string, token: string, spec: any): Promise<any> {
    const queueKey = `${targetGameId}::${token}`;
    return new Promise((resolve) => {
        let queue = pendingSpokeSelectQueues.get(queueKey);
        if (!queue) {
            queue = [];
            pendingSpokeSelectQueues.set(queueKey, queue);
            queueMicrotask(async () => {
                const fullBatch = pendingSpokeSelectQueues.get(queueKey) || [];
                pendingSpokeSelectQueues.delete(queueKey);
                if (fullBatch.length === 0) return;

                const CHUNK_SIZE = 32;
                const chunks: PendingSpokeSelectItem[][] = [];
                for (let i = 0; i < fullBatch.length; i += CHUNK_SIZE) {
                    chunks.push(fullBatch.slice(i, i + CHUNK_SIZE));
                }

                await Promise.all(
                    chunks.map(async (chunk) => {
                        if (chunk.length === 1) {
                            const singleRes = await invokeSingleSpokeGatewaySelect(targetGameId, token, chunk[0].spec);
                            chunk[0].resolve(singleRes);
                            return;
                        }

                        try {
                            const res = await supabaseAuth.functions.invoke('game-gateway', {
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                },
                                body: {
                                    game_id: targetGameId,
                                    action: 'spoke_query_batch',
                                    payload: {
                                        queries: chunk.map((item) => item.spec),
                                    },
                                },
                            });

                            if (res.data?.__spoke_batch_v1 && Array.isArray(res.data.results)) {
                                chunk.forEach((item, idx) => {
                                    const itemRes = res.data.results[idx];
                                    if (!itemRes) {
                                        item.resolve({
                                            data: null,
                                            error: { message: 'Missing batch item response' },
                                            count: null,
                                            status: 500,
                                            statusText: 'Gateway Error',
                                        });
                                    } else if (itemRes.ok === false || itemRes.error) {
                                        item.resolve({
                                            data: null,
                                            error: { message: itemRes.error || 'Spoke query failed', details: itemRes.original_error },
                                            count: null,
                                            status: 403,
                                            statusText: 'Forbidden',
                                        });
                                    } else {
                                        item.resolve({
                                            data: itemRes.data ?? null,
                                            error: null,
                                            count: itemRes.count ?? null,
                                            status: 200,
                                            statusText: 'OK',
                                        });
                                    }
                                });
                                return;
                            }

                            // Fallback if gateway returned an unexpected shape or legacy action error
                            if (res.data?.error && String(res.data.error).includes('Unknown action')) {
                                await Promise.all(
                                    chunk.map(async (item) => {
                                        item.resolve(await invokeSingleSpokeGatewaySelect(targetGameId, token, item.spec));
                                    })
                                );
                                return;
                            }

                            const errPayload = res.error || { message: res.data?.error || 'Spoke batch gateway error', details: res.data?.original_error };
                            chunk.forEach((item) => {
                                item.resolve({
                                    data: null,
                                    error: errPayload,
                                    count: null,
                                    status: res.error ? 500 : 403,
                                    statusText: res.error ? 'Gateway Error' : 'Forbidden',
                                });
                            });
                        } catch (err: any) {
                            chunk.forEach((item) => {
                                item.resolve({
                                    data: null,
                                    error: { message: err?.message || 'Spoke batch gateway query failed' },
                                    count: null,
                                    status: 500,
                                    statusText: 'Internal Error',
                                });
                            });
                        }
                    })
                );
            });
        }
        queue.push({ spec: { ...spec, filters: [...spec.filters], orders: [...spec.orders] }, resolve });
    });
}

function createSpokeGatewayQuery(
    table: string,
    op: 'select' | 'insert' | 'update' | 'upsert' | 'delete',
    initialSpec: Record<string, any> = {}
) {
    const spec: any = {
        table,
        op,
        selectColumns: initialSpec.selectColumns ?? '*',
        selectOpts: initialSpec.selectOpts ?? undefined,
        values: initialSpec.values ?? undefined,
        upsertOpts: initialSpec.upsertOpts ?? undefined,
        returnSelect: initialSpec.returnSelect ?? null,
        filters: [] as Array<{ method: string; args: any[] }>,
        orders: [] as Array<{ column: string; options?: any }>,
        limit: undefined as number | undefined,
        range: undefined as [number, number] | undefined,
        singleMode: null as 'single' | 'maybeSingle' | null,
    };

    let executionPromise: Promise<any> | null = null;

    const execute = async () => {
        const state = useStore.getState();
        let token = state.session?.access_token || '';
        if (!token) {
            try {
                const { data } = await rawAuthClient.auth.getSession();
                token = data?.session?.access_token || '';
            } catch {}
        }

        if (!token) {
            if (op === 'select') {
                return {
                    data: spec.singleMode ? null : [],
                    error: null,
                    count: 0,
                    status: 200,
                    statusText: 'OK',
                };
            }
            return {
                data: null,
                error: { message: 'Authentication required for Spoke mutation' },
                count: null,
                status: 401,
                statusText: 'Unauthorized',
            };
        }

        const activeWsId = state.activeWorkspaceId;
        const workspaces = state.workspaces || [];
        const activeWs = workspaces.find((w: any) => w.id === activeWsId);
        const targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWs?.id || activeWsId;

        if (!targetGameId || targetGameId === 'default_workspace') {
            return {
                data: op === 'select' && !spec.singleMode ? [] : null,
                error: null,
                count: 0,
                status: 200,
                statusText: 'OK',
            };
        }

        if (op === 'select') {
            return enqueueBatchedSpokeSelect(targetGameId, token, spec);
        }

        try {
            const res = await supabaseAuth.functions.invoke('game-gateway', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: {
                    game_id: targetGameId,
                    action: 'spoke_query',
                    payload: spec,
                },
            });

            if (res.error) {
                return {
                    data: null,
                    error: res.error,
                    count: null,
                    status: 500,
                    statusText: 'Gateway Error',
                };
            }
            if (res.data?.error) {
                return {
                    data: null,
                    error: { message: res.data.error, details: res.data.original_error },
                    count: null,
                    status: 403,
                    statusText: 'Forbidden',
                };
            }
            if (res.data && res.data.__spoke_query_v1) {
                return {
                    data: res.data.data ?? null,
                    error: null,
                    count: res.data.count ?? null,
                    status: 200,
                    statusText: 'OK',
                };
            }
            return {
                data: res.data ?? null,
                error: null,
                count: Array.isArray(res.data) ? res.data.length : null,
                status: 200,
                statusText: 'OK',
            };
        } catch (err: any) {
            return {
                data: null,
                error: { message: err?.message || 'Spoke gateway query failed' },
                count: null,
                status: 500,
                statusText: 'Internal Error',
            };
        }
    };

    const getPromise = () => {
        if (!executionPromise) {
            executionPromise = execute();
        }
        return executionPromise;
    };

    const filterMethods = [
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'like',
        'ilike',
        'is',
        'in',
        'contains',
        'containedBy',
        'overlaps',
        'not',
        'or',
        'match',
        'filter',
        'textSearch',
    ];

    const builder: any = {
        select: (cols = '*', opts?: any) => {
            if (op === 'select') {
                spec.selectColumns = cols || '*';
                if (opts) spec.selectOpts = opts;
            } else {
                spec.returnSelect = cols || '*';
            }
            return builder;
        },
        order: (column: string, options?: any) => {
            spec.orders.push({ column, options });
            return builder;
        },
        limit: (n: number) => {
            spec.limit = n;
            return builder;
        },
        range: (from: number, to: number) => {
            spec.range = [from, to];
            return builder;
        },
        abortSignal: () => builder,
        csv: () => builder,
        single: () => {
            spec.singleMode = 'single';
            return builder;
        },
        maybeSingle: () => {
            spec.singleMode = 'maybeSingle';
            return builder;
        },
        then: (onfulfilled?: any, onrejected?: any) => getPromise().then(onfulfilled, onrejected),
        catch: (onrejected?: any) => getPromise().catch(onrejected),
        finally: (onfinally?: any) => getPromise().finally(onfinally),
    };

    for (const m of filterMethods) {
        builder[m] = (...args: any[]) => {
            spec.filters.push({ method: m, args });
            return builder;
        };
    }

    return builder;
}

function createSpokeTableRouter(table: string, client: SupabaseClient) {
    if (table === 'citizen_staging_queue' || client === rawAuthClient) {
        return client.from(table);
    }

    return {
        select: (columns = '*', options?: any) => {
            if (RESTRICTED_SPOKE_SELECT_TABLES.has(table)) {
                return createSpokeGatewayQuery(table, 'select', {
                    selectColumns: columns || '*',
                    selectOpts: options,
                });
            }
            return (client.from(table) as any).select(columns, options);
        },
        insert: (values: any, _options?: any) =>
            createSpokeGatewayQuery(table, 'insert', { values }),
        upsert: (values: any, options?: any) =>
            createSpokeGatewayQuery(table, 'upsert', { values, upsertOpts: options }),
        update: (values: any, _options?: any) =>
            createSpokeGatewayQuery(table, 'update', { values }),
        delete: (_options?: any) =>
            createSpokeGatewayQuery(table, 'delete', {}),
    } as any;
}

// 2. Create the Magic Proxy Client
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        // Intercept any authentication calls and route them to the Main OS / Standalone Database
        if (prop === 'auth') {
            return supabaseAuth.auth;
        }

        if (prop === 'from') {
            return (table: string) => {
                if (isStandaloneFork) {
                    return supabaseAuth.from(table);
                }

                const osTables = [
                    'sanctuary_themes',
                    'sanctuary_games', 'system_directives',
                    'keeper_tickets',
                    'keeper_system_broadcasts',
                    'keeper_dispatch_poll_votes',
                    'keeper_support_categories',
                    'keeper_heuristic_signatures',
                    'sanctuary_theme_images',
                    'hardware_bans'
                ];

                // Route OS-level tables to the Main OS Database
                if (osTables.includes(table)) {
                    return supabaseAuth.from(table);
                }

                // Route Game-level tables (including Spoke profiles, audit_logs, schemas, lexicons, master_tags) to the Game Database
                const client = getActiveGameClient();
                if (!client) {
                    if (table === 'profiles') {
                        return supabaseAuth.from(table);
                    }
                    return createMockPostgrestBuilder();
                }
                return createSpokeTableRouter(table, client);
            };
        }

        // Intercept secure RPC calls and route them to the OS Edge Function (or direct DB in Standalone Fork Mode)
        if (prop === 'rpc') {
            return async (fnName: string, args: any = {}) => {
                const isInterceptedRpc = [
                    'secure_sync_spoke_profile',
                    'secure_update_spoke_profile',
                    'secure_sync_hub_ban_to_spokes',
                    'secure_verify_and_bootstrap_spoke',
                    'secure_sever_spoke_cord',
                    'secure_update_spoke_uplink',
                    'secure_upsert_cloud_file',
                    'secure_delete_cloud_file',
                    'secure_update_mason_profile',
                    'secure_toggle_mason_follow',
                    'secure_fetch_notifications',
                    'secure_mark_notifications_read',
                    'secure_delete_notifications',
                    'secure_mark_all_notifications_read',
                    'secure_delete_all_notifications',
                    'bulk_ingest_vault_mods',
                    'dispatch_follower_notifications',
                    'dispatch_broadcast_notifications',
                    'flag_mod_for_compliance'
                ].includes(fnName);

                if (isStandaloneFork && isInterceptedRpc) {
                    return await executeStandaloneDirectRpc(fnName, args);
                }

                const state = useStore.getState();
                const activeWsId = state.activeWorkspaceId;
                const workspaces = state.workspaces || [];
                const activeWs = workspaces.find((w: any) => w.id === activeWsId);

                if (isInterceptedRpc) {
                    const token = args?.p_token || state.session?.access_token || '';

                    if (fnName === 'secure_sync_hub_ban_to_spokes') {
                        return await supabaseAuth.functions.invoke('game-gateway', {
                            headers: {
                                Authorization: `Bearer ${token}`
                            },
                            body: {
                                action: 'sync_hub_ban_to_spokes',
                                payload: { target_user_id: args?.p_target_user_id }
                            }
                        });
                    }

                    if (fnName === 'secure_verify_and_bootstrap_spoke') {
                        return await supabaseAuth.functions.invoke('game-gateway', {
                            headers: {
                                Authorization: `Bearer ${token}`
                            },
                            body: {
                                action: 'verify_and_bootstrap_spoke',
                                payload: args?.p_payload || {}
                            }
                        });
                    }

                    let targetGameId = args?.p_game_id || activeWs?.game_id || activeWs?.schema_id || activeWs?.id || activeWsId;

                    // If on the dummy default workspace or a workspace with no configured database, return empty mock response
                    if (((targetGameId === 'default_workspace' || !activeWs) && !args?.p_game_id) || (!args?.p_game_id && !getActiveGameClient())) {
                        return { data: [], error: null }; // Mock response since there is no Game DB to query
                    }

                    const actionMap: Record<string, string> = {
                        'secure_sync_spoke_profile': 'sync_spoke_profile',
                        'secure_update_spoke_profile': 'update_spoke_profile',
                        'secure_sever_spoke_cord': 'sever_spoke_cord',
                        'secure_update_spoke_uplink': 'update_spoke_uplink',
                        'secure_upsert_cloud_file': 'upsert_cloud_file',
                        'secure_delete_cloud_file': 'delete_cloud_file',
                        'secure_update_mason_profile': 'update_mason_profile',
                        'secure_toggle_mason_follow': args?.p_action === 'follow' ? 'follow_mason' : 'unfollow_mason',
                        'secure_fetch_notifications': 'fetch_notifications',
                        'secure_mark_notifications_read': 'mark_notifications_read',
                        'secure_delete_notifications': 'delete_notifications',
                        'secure_mark_all_notifications_read': 'mark_all_notifications_read',
                        'secure_delete_all_notifications': 'delete_all_notifications',
                        'bulk_ingest_vault_mods': 'bulk_ingest_vault_mods',
                        'dispatch_follower_notifications': 'dispatch_broadcast_notifications',
                        'dispatch_broadcast_notifications': 'dispatch_broadcast_notifications',
                        'flag_mod_for_compliance': 'flag_mod_for_compliance'
                    };

                    let payload: any = {};
                    if (fnName === 'secure_sync_spoke_profile') {
                        payload = {
                            relink_commitment_hash: args?.p_relink_commitment_hash || undefined,
                        };
                    } else if (fnName === 'secure_update_spoke_profile') {
                        payload = { target_user_id: args.p_target_user_id, updates: args.p_updates };
                    } else if (fnName === 'flag_mod_for_compliance') {
                        payload = {
                            mod_id: args?.p_mod_id || args?.mod_id,
                            tier: args?.p_tier || args?.tier || 1,
                            reason: args?.p_reason || args?.reason || '',
                        };
                    } else if (fnName === 'secure_sever_spoke_cord' || fnName === 'secure_update_spoke_uplink') {
                        payload = args.p_payload || {};
                    } else if (fnName === 'secure_upsert_cloud_file') {
                        payload = { target_table: args.p_target, payload_data: args.p_payload };
                    } else if (fnName === 'secure_delete_cloud_file') {
                        payload = { target_table: args.p_target, id_value: args.p_id };
                    } else if (fnName === 'secure_update_mason_profile') {
                        payload = { mason_id: args.p_mason_id, profile_data: args.p_payload };
                    } else if (fnName === 'secure_toggle_mason_follow') {
                        payload = { mason_id: args.p_mason_id };
                    } else if (fnName === 'secure_mark_notifications_read') {
                        payload = { notification_id: args?.p_id };
                    } else if (fnName === 'secure_delete_notifications') {
                        payload = { notification_id: args?.p_id };
                    } else if (fnName === 'bulk_ingest_vault_mods') {
                        payload = { items: args?.p_items || args?.items || [] };
                    } else if (fnName === 'dispatch_follower_notifications' || fnName === 'dispatch_broadcast_notifications') {
                        payload = {
                            mason_id: args?.p_mason_id || args?.mason_id || undefined,
                            type: args?.p_type || args?.type || 'system_broadcast',
                            reference_id: args?.p_reference_id || args?.reference_id,
                            message: args?.p_message || args?.message || '',
                            exclude_self: args?.p_exclude_self ?? true,
                        };
                    }

                    const res = await supabaseAuth.functions.invoke('game-gateway', {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        body: {
                            game_id: targetGameId,
                            action: actionMap[fnName],
                            payload: payload
                        }
                    });
                    if (res.data?.error) {
                        if (res.data.error.includes('mason_post_views_post_id_user_id_key')) {
                            return { data: [payload] };
                        }
                        console.error('Magic Proxy Edge Function Error:', res.data.error, 'Game ID sent:', targetGameId);
                        res.error = new Error(res.data.error) as any;
                    }
                    return res;
                }
                const client = getActiveGameClient();
                if (!client) {
                    return Promise.resolve({ data: [], error: null });
                }
                return (client as any)[prop](fnName, args);
            };
        }

        if (prop === 'channel') {
            return (name: string, opts?: any) => {
                if (isStandaloneFork) {
                    return rawAuthClient.channel(name, opts);
                }

                // Route Core Hub-only channels explicitly; Spoke channels (notifications, system_broadcasts, etc.) route to the active Spoke client
                if (
                    name.includes('keeper_') ||
                    name.includes('sanctuary_games') ||
                    name.includes('system_directives')
                ) {
                    return supabaseAuth.channel(name, opts);
                }

                const client = getActiveGameClient();
                if (!client) {
                    const mockChannel: any = {
                        on: () => mockChannel,
                        subscribe: () => mockChannel,
                        unsubscribe: () => mockChannel
                    };
                    return mockChannel;
                }
                return client.channel(name, opts);
            };
        }

        if (prop === 'removeChannel') {
            return async (ch: any) => {
                try {
                    const client = getActiveGameClient();
                    if (client && typeof client.removeChannel === 'function') {
                        await client.removeChannel(ch).catch(() => {});
                    }
                    if (typeof supabaseAuth.removeChannel === 'function') {
                        await supabaseAuth.removeChannel(ch).catch(() => {});
                    }
                    if (ch && typeof ch.unsubscribe === 'function') {
                        return ch.unsubscribe();
                    }
                } catch (e) {}
                return 'ok';
            };
        }

        // All other requests get routed to the Active Game Database
        const client = getActiveGameClient();
        if (!client) {
            return undefined;
        }
        return (client as any)[prop];
    }
});

const spokeCredentialsCache = new Map<string, { id: string; schema_id: string; supabase_url: string; supabase_anon_key: string }>();
if (typeof window !== 'undefined') {
    window.addEventListener('sanctuary-games-updated', () => {
        spokeCredentialsCache.clear();
    });
}

export async function getSpokeClientById(targetSpokeId?: string): Promise<SupabaseClient | null> {
    if (isStandaloneFork) {
        return rawAuthClient;
    }

    const state = useStore.getState();
    const wsId = String(targetSpokeId || state.activeWorkspaceId || localStorage.getItem('sanctuary_active_workspace') || '').trim();
    if (!wsId || wsId === 'default_workspace' || wsId === 'global') {
        return null;
    }

    if (wsId === state.activeWorkspaceId) {
        const direct = getActiveGameClient();
        if (direct) return direct;
    }

    try {
        const localMatch = (state.workspaces || []).find(
            (w: any) => (w?.id === wsId || w?.schema_id === wsId) && w?.supabase_url && w?.supabase_anon_key
        );

        let creds = localMatch
            ? {
                  id: String(localMatch.id || wsId),
                  schema_id: String(localMatch.schema_id || wsId),
                  supabase_url: String(localMatch.supabase_url),
                  supabase_anon_key: String(localMatch.supabase_anon_key),
              }
            : spokeCredentialsCache.get(wsId) || null;

        if (!creds) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wsId);
            let query = supabaseAuth
                .from('sanctuary_games')
                .select('id, schema_id, supabase_url, supabase_anon_key');
            query = isUuid ? query.eq('id', wsId) : query.eq('schema_id', wsId);
            const { data: game } = await query.maybeSingle();
            if (game?.supabase_url && game?.supabase_anon_key) {
                creds = {
                    id: String(game.id || wsId),
                    schema_id: String(game.schema_id || wsId),
                    supabase_url: String(game.supabase_url),
                    supabase_anon_key: String(game.supabase_anon_key),
                };
                spokeCredentialsCache.set(wsId, creds);
                if (creds.schema_id) spokeCredentialsCache.set(creds.schema_id, creds);
                if (creds.id) spokeCredentialsCache.set(creds.id, creds);
            }
        }

        if (creds?.supabase_url && creds?.supabase_anon_key) {
            const cleanUrl = String(creds.supabase_url).trim().replace(/\/+$/, '');
            const cleanKey = String(creds.supabase_anon_key).trim();
            if (cleanUrl === authUrl.trim().replace(/\/+$/, '')) {
                return rawAuthClient;
            }
            const cacheKey = `${cleanUrl}::${cleanKey}`;
            if (spokeClientCache.has(cacheKey)) {
                return spokeClientCache.get(cacheKey)!;
            }
            const client = createClient(cleanUrl, cleanKey, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                    storageKey: `sb-spoke-client-${creds.schema_id || wsId}`,
                },
            });
            spokeClientCache.set(cacheKey, client);
            return client;
        }
    } catch (e) {
        console.warn('Spoke client resolution warning:', e);
    }
    return null;
}

async function resolveFallbackSpokeClient(): Promise<SupabaseClient | null> {
    return getSpokeClientById();
}

export async function submitThreatManifestToSpoke(
    item: any,
    options?: { isAuto?: boolean; defaultSignature?: string }
): Promise<{ data: any; error: any; skipped?: boolean }> {
    try {
        if (typeof localStorage !== 'undefined') {
            if (localStorage.getItem('sanctuary_local_only') === 'true') {
                return { data: null, error: null, skipped: true };
            }
            if (options?.isAuto && localStorage.getItem('sanctuary_share_malware_reports') !== 'true') {
                return { data: null, error: null, skipped: true };
            }
        }
        const state = useStore.getState();
        const wsId = String(
            state.activeWorkspaceId ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('sanctuary_active_workspace') : '') ||
            ''
        ).trim();
        if (!wsId || wsId === 'default_workspace') {
            return { data: null, error: null, skipped: true };
        }
        const detectedHash = String(item?.detected_hash || item?.hash || 'unknown-hash').trim();
        const artifactName = String(
            item?.artifact_name || item?.displayName || item?.name || item?.filename || 'Unknown'
        ).trim();
        const rawSig = String(item?.matched_signature || item?.signature || '').trim();
        const cleanSig =
            rawSig && rawSig.toUpperCase() !== 'NO SIGNATURE MATCH'
                ? rawSig
                : options?.defaultSignature || 'Known Malware Hash Match';
        const detectedAt = item?.detected_at || new Date().toISOString();

        // Deduplicate automatic background sweeps per local incident so the same unshredded file
        // does not re-insert on every radar sweep, while still allowing new incidents or manual uploads
        // even if the hash was previously reported on the Spoke.
        const incidentId = `${wsId}::${detectedHash}::${item?.detected_at || item?.quarantine_path || item?.path || artifactName}`;
        if (options?.isAuto && typeof localStorage !== 'undefined') {
            try {
                const seenMap = JSON.parse(localStorage.getItem('sanctuary_submitted_malware_manifests') || '{}');
                const lastTs = seenMap[incidentId];
                if (lastTs && Date.now() - Number(lastTs) < 1000 * 60 * 60 * 12) {
                    return { data: null, error: null, skipped: true };
                }
            } catch {}
        }

        const rawStatus = String(item?.status || 'pending').trim().toLowerCase();
        const normalizedStatus =
            rawStatus === 'resolved' || rawStatus === 'dismissed'
                ? rawStatus
                : 'pending';

        const inferredExt =
            item?.file_extension ||
            (artifactName.includes('.')
                ? `.${artifactName.split('.').pop()!.toLowerCase()}`
                : null);

        const configuredIngestMode =
            typeof localStorage !== 'undefined'
                ? localStorage.getItem('sanctuary_ingest_file_mode') || 'copy'
                : 'copy';
        const ingestMode = String(item?.ingest_mode || configuredIngestMode).toLowerCase();
        const sourceMoved = Boolean(
            item?.source_moved ||
                (ingestMode === 'move' && !item?.original_exists)
        );
        const isHeuristicHit =
            Boolean(rawSig) &&
            rawSig.toUpperCase() !== 'NO SIGNATURE MATCH' &&
            rawSig.toUpperCase() !== 'MALWARE DNA MATCH' &&
            rawSig.toUpperCase() !== 'KNOWN MALWARE HASH MATCH' &&
            rawSig.toUpperCase() !== 'RADAR SWEEP DETECTION' &&
            rawSig.toUpperCase() !== 'PERSISTENT QUARANTINE ARTIFACT';
        const detectionType =
            item?.detection_type ||
            (isHeuristicHit ? 'heuristic_signature' : 'hash_blacklist');
        const detectionSource =
            item?.detection_source ||
            (isHeuristicHit ? 'heuristics_scanner' : 'spoke_blacklist');
        const osPlatform =
            item?.os_platform ||
            (typeof navigator !== 'undefined'
                ? /win/i.test(navigator.userAgent)
                    ? 'windows'
                    : /mac/i.test(navigator.userAgent)
                      ? 'macos'
                      : /linux/i.test(navigator.userAgent)
                        ? 'linux'
                        : 'desktop'
                : 'desktop');

        const baseRowPayload = {
            artifact_name: artifactName,
            detected_hash: detectedHash,
            signature: cleanSig,
            original_hash_at_import: item?.original_hash_at_import || detectedHash || null,
            original_exists: sourceMoved ? false : Boolean(item?.original_exists),
            original_shredded: Boolean(item?.original_shredded),
            quarantined_file_shredded: Boolean(item?.quarantined_file_shredded),
            detected_at: detectedAt,
            status: normalizedStatus,
        };

        const extendedRowPayload = {
            ...baseRowPayload,
            source_moved: sourceMoved,
            ingest_mode: ingestMode,
            file_size_bytes:
                typeof item?.file_size_bytes === 'number' ? item.file_size_bytes : null,
            file_extension: inferredExt,
            matched_entry: item?.matched_entry || null,
            detection_type: detectionType,
            detection_source: detectionSource,
            os_platform: osPlatform,
        };

        let insertedData: any = null;
        let lastError: any = null;

        // 1. Prefer authenticated gateway upsert (uses Spoke Service Role Key and works even before workspace hydration)
        if (state.session?.access_token && !isStandaloneFork) {
            const targetGameId =
                state.workspaces?.find((w: any) => w.id === wsId)?.game_id ||
                state.workspaces?.find((w: any) => w.id === wsId)?.schema_id ||
                wsId;
            let rpcRes = await (supabase as any).rpc('secure_upsert_cloud_file', {
                p_game_id: targetGameId,
                p_target: 'malware_reports',
                p_payload: extendedRowPayload,
            });
            if (rpcRes?.error) {
                rpcRes = await (supabase as any).rpc('secure_upsert_cloud_file', {
                    p_game_id: targetGameId,
                    p_target: 'malware_reports',
                    p_payload: baseRowPayload,
                });
            }
            if (!rpcRes?.error && rpcRes?.data) {
                insertedData = rpcRes.data;
            } else if (rpcRes?.error) {
                lastError = rpcRes.error;
            }
        }

        // 2. Fallback to direct Spoke client insert (works for unauthenticated / anon Spoke clients)
        if (!insertedData) {
            const spokeClient = await resolveFallbackSpokeClient();
            if (!spokeClient) {
                return {
                    data: null,
                    error: lastError || new Error('Active Spoke database client is not connected.'),
                };
            }
            let { data, error } = await spokeClient
                .from('malware_reports')
                .insert(extendedRowPayload)
                .select();
            if (error) {
                const retryRes = await spokeClient
                    .from('malware_reports')
                    .insert(baseRowPayload)
                    .select();
                data = retryRes.data;
                error = retryRes.error;
            }
            if (error) {
                return { data: null, error };
            }
            insertedData = data;
        }

        if (typeof localStorage !== 'undefined') {
            try {
                const seenMap = JSON.parse(localStorage.getItem('sanctuary_submitted_malware_manifests') || '{}');
                seenMap[incidentId] = Date.now();
                localStorage.setItem('sanctuary_submitted_malware_manifests', JSON.stringify(seenMap));
            } catch {}
        }

        return { data: insertedData, error: null };
    } catch (err: any) {
        console.error('submitThreatManifestToSpoke error:', err);
        return { data: null, error: err };
    }
}

export async function updateThreatManifestShredStatus(
    detectedHash: string,
    updates: {
        original_shredded?: boolean;
        original_exists?: boolean;
        quarantined_file_shredded?: boolean;
        source_moved?: boolean;
    }
): Promise<void> {
    if (!detectedHash) return;
    try {
        const spokeClient = await resolveFallbackSpokeClient();
        if (spokeClient) {
            const { error } = await spokeClient
                .from('malware_reports')
                .update(updates)
                .eq('detected_hash', detectedHash);
            if (error && 'source_moved' in updates) {
                const { source_moved: _, ...baseUpdates } = updates;
                await spokeClient
                    .from('malware_reports')
                    .update(baseUpdates)
                    .eq('detected_hash', detectedHash);
            }
        }
    } catch (e) {
        console.warn('Failed to update threat manifest shred status on Spoke:', e);
    }
}
