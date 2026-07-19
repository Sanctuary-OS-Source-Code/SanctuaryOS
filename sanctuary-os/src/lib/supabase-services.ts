import { supabase } from "../supabase";

export const supabaseServices = {
  getGlobalSecurity: () => supabase.from('global_security').select('*'),
  getModVersions: (hashes: string[]) => supabase.from("mod_versions").select('dna_hash, version_label, download_url, mods (id, name, status, compliance_tier, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, mason_id, masons(name))').in("dna_hash", hashes),
  getModVersionsFallback: (hashes: string[]) => supabase.from("mod_versions").select('dna_hash, version_label, download_url, mods (id, name, status, compliance_tier, requiredDLC, category_override, sub_type, image_url, url, master_author, mason_id, masons(name))').in("dna_hash", hashes),
  getCcSetMembers: () => supabase.from('collection_members').select('set_id, mod_id'),
  getCcSets: () => supabase.from('collections').select('*'),
  getFlavorGroupMembers: (hashes: string[]) => supabase.from('flavor_group_members').select('group_id, mod_hash').in('mod_hash', hashes),
  getFlavorGroups: (ids: string[]) => supabase.from('flavor_groups').select('id, name').in('id', ids),
  getModRelationshipsByChild: (ids: string[]) => supabase.from("mod_relationships").select("*").in("child_id", ids),
  getModRelationshipsByParent: (ids: string[]) => supabase.from("mod_relationships").select("*").in("parent_id", ids),
  getModDependenciesByChild: (ids: string[]) => supabase.from("mod_dependencies").select("*").in("child_id", ids),
  getModDependenciesByParent: (ids: string[]) => supabase.from("mod_dependencies").select("*").in("parent_id", ids),
  getModsById: (ids: string[]) => supabase.from("mods").select("id, name, master_author, image_url").in("id", ids),
  getModsBasic: () => supabase.from('mods').select('name, status, mod_versions(version_label)'),
  getHomesteadLabLogsPending: () => supabase.from('homestead_lab_logs').select('*').eq('status', 'pending'),
  getUserRole: (userId: string) => supabase.from('profiles').select("role").eq('id', userId).single(),
  getCommunityTemplate: async (targetFile: string) => {
    const { data, error } = await supabase.from('nexus_assets').select('*').eq('asset_type', 'workbench_template').eq('is_community_default', true);
    if (error) return { data: null, error };
    if (data) {
        const match = data.find(d => {
             try { 
                 const p = JSON.parse(d.json_data); 
                 return p.target_file === targetFile; 
             } catch { return false; }
        });
        return { data: match || null, error: null };
    }
    return { data: null, error: null };
  },
  getAllCommunityDefaults: async () => {
    const { data, error } = await supabase.from('nexus_assets').select('id, json_data, author, name').eq('asset_type', 'workbench_template').eq('is_community_default', true);
    if (error || !data) return [];
    return data.map((d: any) => {
        try {
            return { id: d.id, template_data: JSON.parse(d.json_data), author: d.author, name: d.name };
        } catch(e) { return null; }
    }).filter(d => d !== null);
  },
  getWorkbenchTemplates: () => supabase.from('nexus_assets').select('*').eq('asset_type', 'workbench_template').order('created_at', { ascending: false }),
  setCommunityDefaultTemplate: async (id: string, targetFile: string) => {
    const { data } = await supabase.from('nexus_assets').select('id, json_data').eq('asset_type', 'workbench_template').eq('is_community_default', true);
    if (data) {
        for (const item of data) {
            try {
                const parsed = JSON.parse(item.json_data);
                if (parsed.target_file === targetFile && item.id !== id) {
                    await supabase.from('nexus_assets').update({ is_community_default: false }).eq('id', item.id);
                }
            } catch (e) {}
        }
    }
    return supabase.from('nexus_assets').update({ is_community_default: true }).eq('id', id);
  },
  getTrackedTemplateFiles: () => supabase.from('tracked_template_files').select('*, profiles(username)').order('created_at', { ascending: false }),
  addTrackedTemplateFile: async (fileName: string, userId: string) => {
    return supabase.from('tracked_template_files').insert({ file_name: fileName, added_by: userId });
  },
  flagTemplate: async (templateId: string, reason: string, userId: string) => {
    return supabase.from('sanctuary_tickets').insert({
      author_id: userId,
      status: "ESCALATED",
      ticket_type: "TEMPLATE_FLAG",
      title: `Flagged Template`,
      description: `Reason: ${reason}`,
      metadata: { target_mod_id: templateId, flag_reason: reason }
    });
  },
  subscribeToDefcon: (callback: (payload: any) => void) => {
    return supabase.channel('global-defcon-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_network_status' }, callback)
      .subscribe();
  }
};
