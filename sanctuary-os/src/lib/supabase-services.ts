import { supabase } from "../supabase";

export const supabaseServices = {
  getAllCommunityDefaults: async () => {
    const { data, error } = await supabase
      .from("nexus_assets")
      .select("id, json_data, author, name")
      .eq("asset_type", "workbench_template")
      .eq("is_community_default", true);
    if (error || !data) return [];
    return data
      .map((d: any) => {
        try {
          return {
            id: d.id,
            template_data: JSON.parse(d.json_data),
            author: d.author,
            name: d.name,
          };
        } catch {
          return null;
        }
      })
      .filter((d) => d !== null);
  },
  getWorkbenchTemplates: () =>
    supabase
      .from("nexus_assets")
      .select("*")
      .eq("asset_type", "workbench_template")
      .order("created_at", { ascending: false }),
  setCommunityDefaultTemplate: async (id: string, targetFile: string) => {
    const { data } = await supabase
      .from("nexus_assets")
      .select("id, json_data")
      .eq("asset_type", "workbench_template")
      .eq("is_community_default", true);
    if (data) {
      for (const item of data) {
        try {
          const parsed = JSON.parse(item.json_data);
          if (parsed.target_file === targetFile && item.id !== id) {
            await supabase
              .from("nexus_assets")
              .update({ is_community_default: false })
              .eq("id", item.id);
          }
        } catch {}
      }
    }
    return supabase
      .from("nexus_assets")
      .update({ is_community_default: true })
      .eq("id", id);
  },
  getTrackedTemplateFiles: () =>
    supabase
      .from("tracked_template_files")
      .select("*, profiles(username)")
      .order("created_at", { ascending: false }),
  addTrackedTemplateFile: async (fileName: string, userId: string) => {
    return supabase
      .from("tracked_template_files")
      .insert({ file_name: fileName, added_by: userId });
  },
  flagTemplate: async (templateId: string, reason: string) => {
    return supabase.from("content_flags").insert({
      content_type: "workbench_template",
      content_id: templateId,
      reporter_id: null,
      reason: reason.trim(),
      status: "pending",
    });
  },
  subscribeToDefcon: (callback: (payload: any) => void) => {
    return supabase
      .channel("global-defcon-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "global_network_status" },
        callback
      )
      .subscribe();
  },
};
