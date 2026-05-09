const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://chphhvpcgcpnyvshsudh.supabase.co', 'sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D');

async function run() {
  let cleanMod = 'mc_cas.ts4script'.replace(/\.(package|ts4script)$/i, '');
  console.log('cleanMod:', cleanMod);
  const { data: mod } = await sb.from('mods').select('id').ilike('name', cleanMod).maybeSingle();
  console.log('Mod:', mod);
  if (!mod) return;
  const orQuery = `child_id.eq.${mod.id}`;
  console.log('orQuery:', orQuery);
  const { data: addonLinks } = await sb.from('mod_relationships').select('parent_id').or(orQuery).eq('relationship_type', 'addon');
  console.log('addonLinks:', addonLinks);
  const { data: depMods } = await sb.from('mods').select('name').in('id', addonLinks.map(l => l.parent_id));
  console.log('depMods:', depMods);
}
run();
