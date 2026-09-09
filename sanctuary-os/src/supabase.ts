import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "./store";

// Main Core OS Database Credentials (Authentication & Users Source of Truth)
const authUrl = "https://tpsbtaqxlczrysqqmanp.supabase.co";
const authKey = "sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC";

// 1. Create the persistent Auth Client
export const supabaseAuth = createClient(authUrl, authKey, {
    auth: { 
        storageKey: "sanctuary-os-auth-token",
        lock: async (name, acquireTimeout, fn) => {
            // Bypass navigator.locks in development to prevent Vite HMR hangs
            return await fn();
        }
    }
});

// Dynamic Game Client variables
let currentGameClient: SupabaseClient | null = null;
let currentGameId = "";
let currentToken = "";

export function getActiveGameClient(): SupabaseClient {
    const state = useStore.getState();
    const activeWsId = state.activeWorkspaceId;
    const workspaces = state.workspaces || [];
    const activeWs = workspaces.find((w: any) => w.id === activeWsId);
    const session = state.session;
    const token = session?.access_token || "";

    // If no workspace is active (e.g. on the Hub), return null
    if (!activeWs || !activeWs.supabase_url || !activeWs.supabase_anon_key || activeWsId === 'default_workspace') {
        return null as unknown as SupabaseClient; // Handled by proxy traps
    }

    // Only instantiate a new client if the workspace has changed or token changed
    if (currentGameId !== activeWs.id || currentToken !== token) {
        currentGameId = activeWs.id;
        currentToken = token;
        
        const clientOptions: any = {
            auth: { 
                persistSession: false
            }
        };

        // We DO NOT inject the Hub JWT token into the Spoke client.
        // The Hub token uses a different JWT secret than the Spoke databases.
        // Sending the Hub token to the Spoke causes 401 Unauthorized errors on all queries.
        // All read-queries against the Spoke DB execute as 'anon'. 
        // Secure operations are routed through the Hub API Gateway via RPC.
        
        currentGameClient = createClient(activeWs.supabase_url, activeWs.supabase_anon_key, clientOptions);
    }

    return currentGameClient as SupabaseClient;
}

const createMockPostgrestBuilder = () => {
    const builder: any = Promise.resolve({ data: [], error: null });
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
    builder.single = () => Promise.resolve({ data: null, error: null, count: -999, status: 200, statusText: 'OK' });
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null, count: -999, status: 200, statusText: 'OK' });
    builder.csv = () => builder;
    builder.then = (onfulfilled: any) => Promise.resolve({ data: [], error: null, count: -999, status: 200, statusText: 'OK' }).then(onfulfilled);
    builder.catch = (onrejected: any) => Promise.resolve({ data: [], error: null, count: -999, status: 200, statusText: 'OK' }).catch(onrejected);
    builder.finally = (onfinally: any) => Promise.resolve({ data: [], error: null, count: -999, status: 200, statusText: 'OK' }).finally(onfinally);
    return builder;
};

// 2. Create the Magic Proxy Client
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        // Intercept any authentication calls and route them to the Main OS Database
        if (prop === 'auth') {
            return supabaseAuth.auth;
        }

        if (prop === 'from') {
            return (table: string) => {
                const osTables = [
                    'profiles', 
                    'sanctuary_themes', 
                    'sanctuary_games',
                    'keeper_tickets',
                    'keeper_system_broadcasts',
                    'keeper_support_categories',
                    'sanctuary_theme_images',
                    'audit_logs',
                    'hardware_bans'
                ];

                const state = useStore.getState();
                const view = state.view;

                // When in Keepers Core, Schemas and Lexicons must route to the Core Hub Database
                if (view === 'KeepersCore' && (table === 'sanctuary_lexicons' || table === 'sanctuary_schemas' || table === 'master_tags')) {
                    return supabaseAuth.from(table);
                }

                // Route OS-level tables to the Main OS Database
                if (osTables.includes(table)) {
                    return supabaseAuth.from(table);
                }

                // Route Game-level tables to the Game Database
                const client = getActiveGameClient();
                if (!client) {
                    return createMockPostgrestBuilder();
                }
                return client.from(table);
            };
        }

        // Intercept secure RPC calls and route them to the OS Edge Function (API Gateway)
        if (prop === 'rpc') {
            return async (fnName: string, args: any) => {
                const state = useStore.getState();
                const activeWsId = state.activeWorkspaceId;
                const workspaces = state.workspaces || [];
                const activeWs = workspaces.find((w: any) => w.id === activeWsId);
                
                const isInterceptedRpc = [
                    'secure_upsert_cloud_file', 
                    'secure_delete_cloud_file', 
                    'secure_update_mason_profile', 
                    'secure_toggle_mason_follow',
                    'secure_fetch_notifications',
                    'secure_mark_notifications_read',
                    'secure_delete_notifications',
                    'secure_mark_all_notifications_read',
                    'secure_delete_all_notifications'
                ].includes(fnName);
                
                if (isInterceptedRpc) {
                    const view = state.view;
                    
                    if (view === 'KeepersCore') {
                        if (fnName.includes('notifications')) {
                            return { data: [], error: null };
                        }
                        return supabaseAuth.rpc(fnName, args);
                    }
                    
                    let targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWs?.id || activeWsId;
                    
                    // If on the dummy default workspace, we just abort or pass it, because there is no legacy DB
                    if (targetGameId === 'default_workspace' || !activeWs) {
                        return { data: [], error: null }; // Mock response since there is no Game to query
                    }

                    const actionMap: Record<string, string> = {
                        'secure_upsert_cloud_file': 'upsert_cloud_file',
                        'secure_delete_cloud_file': 'delete_cloud_file',
                        'secure_update_mason_profile': 'update_mason_profile',
                        'secure_toggle_mason_follow': args?.p_action === 'follow' ? 'follow_mason' : 'unfollow_mason',
                        'secure_fetch_notifications': 'fetch_notifications',
                        'secure_mark_notifications_read': 'mark_notifications_read',
                        'secure_delete_notifications': 'delete_notifications',
                        'secure_mark_all_notifications_read': 'mark_all_notifications_read',
                        'secure_delete_all_notifications': 'delete_all_notifications'                    };

                    let payload: any = {};
                    if (fnName === 'secure_upsert_cloud_file') {
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
                    }

                    const res = await supabaseAuth.functions.invoke('game-gateway', {
                        headers: {
                            Authorization: `Bearer ${args.p_token}`
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
                // Determine if this is an OS channel (e.g. notifications)
                if (name.includes('notifications') || name.includes('system_broadcasts') || name.includes('audit_logs') || name.includes('sanctuary_games')) {
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

        // All other requests get routed to the Active Game Database
        const client = getActiveGameClient();
        if (!client) {
            return undefined;
        }
        return (client as any)[prop];
    }
});

