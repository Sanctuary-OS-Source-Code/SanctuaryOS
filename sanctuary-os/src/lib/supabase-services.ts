import { supabase } from "../supabase";

export const supabaseServices = {
  getGlobalSecurity: () => supabase.from('global_security').select('*'),
  getModVersions: (hashes: string[]) => supabase.from("mod_versions").select('dna_hash, version_label, mods (id, name, status, compliance_tier, requiredDLC, category_override, sub_type, image_url, master_author, allow_write, mason_id, masons(name))').in("dna_hash", hashes),
  getModVersionsFallback: (hashes: string[]) => supabase.from("mod_versions").select('dna_hash, version_label, mods (id, name, status, compliance_tier, requiredDLC, category_override, sub_type, image_url, master_author, mason_id, masons(name))').in("dna_hash", hashes),
  getCcSetMembers: () => supabase.from('cc_set_members').select('set_id, mod_id'),
  getCcSets: () => supabase.from('cc_sets').select('*'),
  getFlavorGroupMembers: (hashes: string[]) => supabase.from('flavor_group_members').select('group_id, mod_hash').in('mod_hash', hashes),
  getFlavorGroups: (ids: string[]) => supabase.from('flavor_groups').select('id, name').in('id', ids),
  getModRelationshipsByChild: (ids: string[]) => supabase.from("mod_relationships").select("*").in("child_id", ids),
  getModRelationshipsByParent: (ids: string[]) => supabase.from("mod_relationships").select("*").in("parent_id", ids),
  getModDependenciesByChild: (ids: string[]) => supabase.from("mod_dependencies").select("*").in("child_id", ids),
  getModDependenciesByParent: (ids: string[]) => supabase.from("mod_dependencies").select("*").in("parent_id", ids),
  getModsById: (ids: string[]) => supabase.from("mods").select("id, name, master_author, image_url").in("id", ids),
  getModsBasic: () => supabase.from('mods').select('name, status, mod_versions(version_label)'),
  getSolderLabLogsPending: () => supabase.from('solder_lab_logs').select('*').eq('status', 'pending'),
  getUserRole: (userId: string) => supabase.from('profiles').select('role').eq('id', userId).single(),
  subscribeToDefcon: (callback: (payload: any) => void) => {
    return supabase.channel('global-defcon-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_network_status' }, callback)
      .subscribe();
  }
};
