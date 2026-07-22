import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "./store";

// Main OS Database Credentials (Authentication & Users Source of Truth)
const authUrl = "https://tpsbtaqxlczrysqqmanp.supabase.co";
const authKey = "sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC";

// 1. Create the persistent Auth Client
export const supabaseAuth = createClient(authUrl, authKey, {
    auth: { storageKey: "sanctuary-os-auth-token" }
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
            currentGameClient = createClient("https://chphhvpcgcpnyvshsudh.supabase.co", "sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D");
        }
        return currentGameClient!;
    }

    // Only instantiate a new client if the workspace has changed or token changed
    if (currentGameId !== activeWs.id || currentToken !== token) {
        currentGameId = activeWs.id;
        currentToken = token;
        currentGameClient = createClient(activeWs.supabase_url, activeWs.supabase_anon_key);
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
                    'sanctuary_games'
                ];

                // Route OS-level tables to the Main OS Database
                if (osTables.includes(table)) {
                    return supabaseAuth.from(table);
                }

                // Route Game-level tables to the Game Database
                return getActiveGameClient().from(table);
            };
        }

        // All other requests (e.g., .rpc) get routed to the Active Game Database
        const client = getActiveGameClient();
        return (client as any)[prop];
    }
});
