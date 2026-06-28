import { supabase } from "../supabase";

export async function logArchitectAction(action: string, target_table: string, target_name: string, customReason?: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('audit_logs').insert({
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason: customReason || "Automated from Architect Console"
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function logUserAction(action: string, target_table: string, target_name: string, reason: string = "User Action") {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('audit_logs').insert({
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
