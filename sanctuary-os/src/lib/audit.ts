import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";

export async function logArchitectAction(action: string, target_table: string, target_name: string, customReason?: string, sourceHub: string = "Architect Console", isKeepers: boolean = false) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    await client.from('audit_logs').insert({
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason: customReason || `Automated from the ${sourceHub}`
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function logUserAction(action: string, target_table: string, target_name: string, reason: string = "User Action", isKeepers: boolean = false) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    await client.from('audit_logs').insert({
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}
