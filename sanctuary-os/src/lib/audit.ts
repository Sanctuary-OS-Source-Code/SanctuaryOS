import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useStore } from "../store";

export async function logArchitectAction(action: string, target_table: string, target_name: string, customReason?: string, sourceHub: string = "Architect Console", isKeepers: boolean = false) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    const logData = {
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason: customReason || `Automated from the ${sourceHub}`
    };

    if (!isKeepers) {
      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'audit_logs',
        p_payload: logData
      });
    } else {
      await client.from('audit_logs').insert(logData);
    }

    if (!isKeepers) {
      const state = useStore.getState();
      const activeWs = state.workspaces?.find((w: any) => w.id === state.activeWorkspaceId);
      const gameName = activeWs ? activeWs.name : "Unknown Workspace";
      
      await supabaseAuth.from('audit_logs').insert({
        ...logData,
        game_name: gameName
      });
    }
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function logUserAction(action: string, target_table: string, target_name: string, reason: string = "User Action", isKeepers: boolean = false) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    const logData = {
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason
    };

    await client.from('audit_logs').insert(logData);

    if (!isKeepers) {
      const state = useStore.getState();
      const activeWs = state.workspaces?.find((w: any) => w.id === state.activeWorkspaceId);
      const gameName = activeWs ? activeWs.name : "Unknown Workspace";
      
      await supabaseAuth.from('audit_logs').insert({
        ...logData,
        game_name: gameName
      });
    }
  } catch (err) {
    console.error("Audit log error:", err);
  }
}
