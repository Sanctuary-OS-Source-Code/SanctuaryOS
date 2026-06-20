const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://chphhvpcgcpnyvshsudh.supabase.co', 'sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D');
async function test() {
  const { data, error } = await supabase.from('mods').select('id, name, mod_versions(version_label, dna_hash, game_version)').limit(5).limit(1, { foreignTable: 'mod_versions' }).order('created_at', { foreignTable: 'mod_versions', ascending: false });
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}
test();
