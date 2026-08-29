import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "./store";

// Main OS Database Credentials (Authentication & Users Source of Truth)
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

    // If no workspace is active, or if credentials are missing, fallback to the Legacy Database
    if (!activeWs || !activeWs.supabase_url || !activeWs.supabase_anon_key) {
        if (currentGameId !== "legacy_fallback" || currentToken !== token) {
            currentGameId = "legacy_fallback";
            currentToken = token;
            currentGameClient = createClient("https://chphhvpcgcpnyvshsudh.supabase.co", "sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D", {
                auth: { 
                    persistSession: false, 
                    storageKey: "sanctuary-legacy-fallback-token",
                    lock: async (name, acquireTimeout, fn) => await fn() 
                }
            });
        }
        return currentGameClient!;
    }

    // Only instantiate a new client if the workspace has changed or token changed
    if (currentGameId !== activeWs.id || currentToken !== token) {
        currentGameId = activeWs.id;
        currentToken = token;
        currentGameClient = createClient(activeWs.supabase_url, activeWs.supabase_anon_key, {
            auth: { 
                persistSession: false, 
                storageKey: `sanctuary-game-${activeWs.id}-token`,
                lock: async (name, acquireTimeout, fn) => await fn()
            },
            global: {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
            }
        });
    }

    return currentGameClient!;
}

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
                    'sanctuary_theme_images'
                ];

                // Route OS-level tables to the Main OS Database
                if (osTables.includes(table)) {
                    return supabaseAuth.from(table);
                }

                // Route Game-level tables to the Game Database
                return getActiveGameClient().from(table);
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
                    'secure_delete_notifications'
                ].includes(fnName);
                
                if (isInterceptedRpc) {
                    let targetGameId = activeWsId;
                    
                    // If on the dummy default workspace, map it to the Legacy Database's actual Game ID
                    if (targetGameId === 'default_workspace' || !activeWs) {
                        const fallbackWs = workspaces.find((w: any) => w.supabase_url === "https://chphhvpcgcpnyvshsudh.supabase.co");
                        targetGameId = fallbackWs ? fallbackWs.id : "0f5fc08a-2e87-4295-9164-ecd46f3961dd";
                    }

                    const actionMap: Record<string, string> = {
                        'secure_upsert_cloud_file': 'upsert_cloud_file',
                        'secure_delete_cloud_file': 'delete_cloud_file',
                        'secure_update_mason_profile': 'update_mason_profile',
                        'secure_toggle_mason_follow': args?.p_action === 'follow' ? 'follow_mason' : 'unfollow_mason',
                        'secure_fetch_notifications': 'fetch_notifications',
                        'secure_mark_notifications_read': 'mark_notifications_read',
                        'secure_delete_notifications': 'delete_notifications'
                    };

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
                return (client as any)[prop](fnName, args);
            };
        }

        // All other requests get routed to the Active Game Database
        const client = getActiveGameClient();
        return (client as any)[prop];
    }
});




