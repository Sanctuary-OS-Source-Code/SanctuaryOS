import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { logArchitectAction } from "./lib/audit";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, standardAccentGlassButtonClass, standardSuccessButtonClass } from "./shared";
import { useStore } from "./store";
import ModStructureBuilder, { StructureNode } from "./ModStructureBuilder";

const fetchAllPaginated = async (queryFn: () => any) => { 
  let allData: any[] = []; 
  let from = 0; 
  const step = 999; 
  while (true) { 
    const { data, error } = await queryFn().range(from, from + step); 
    if (error || !data || data.length === 0) break; 
    allData = [...allData, ...data]; 
    if (data.length <= step) break; 
    from += step + 1; 
  } 
  return { data: allData, error: null }; 
};

export default function StructureVisualizer({ masonId, isArchitect }: { masonId?: string, isArchitect?: boolean }) {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [targetMod, setTargetMod] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchMods = async () => {
      const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, image_url, status, mason_id, folder_structure').order('name'));
      if (data) setCloudMods(data);
    };
    fetchMods();
  }, [masonId, isArchitect]);

  const handleStructureChange = (newStructure: StructureNode[]) => {
    if (!targetMod) return;
    setTargetMod({ ...targetMod, folder_structure: newStructure });
  };

  const saveStructure = async () => {
    if (!targetMod) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('mods').update({ folder_structure: targetMod.folder_structure || [] }).eq('id', targetMod.id);
      if (error) throw error;
      if (isArchitect) logArchitectAction(`Updated Mod Structure`, `mods`, targetMod.name);
      useStore.getState().pushStatus(t("btn_saved") || "Structure Saved", "success");
      
      // Update local cloudMods state
      setCloudMods(prev => prev.map(m => m.id === targetMod.id ? { ...m, folder_structure: targetMod.folder_structure } : m));
    } catch (err) {
      console.error("Failed to save structure:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full relative animate-in fade-in h-full">
       <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full z-10 relative">
          <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_architecture") || "architecture"}</span>
            </div>
            <span className="truncate">{t("structure_title") || "Structure Matrix"}</span>
          </h2>
          
          <div className="relative flex-1 max-w-md ml-auto flex gap-4 items-center justify-end">
            <ModSearchDropdown 
              placeholder={t("structure_select_artifact")}
              selectedItem={targetMod}
              onSelect={(mod: any) => setTargetMod(mod)}
              onClear={() => setTargetMod(null)}
              modList={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === masonId)} 
            />
          </div>
       </div>

       <div className="flex-1 p-6">
       {targetMod ? (
         <div className="flex flex-col flex-1 min-h-0 gap-6">
           <div className="flex justify-between items-center theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-[var(--accent)]/10 shrink-0 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 to-transparent opacity-30 pointer-events-none" />
             <div className="absolute -left-32 -top-32 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[100px] pointer-events-none rounded-full group-hover:scale-110 transition-transform duration-1000" />
             
             <div className="flex items-center gap-6 relative z-10">
                <div className="w-16 h-16 rounded-2xl theme-glass-inner overflow-hidden shrink-0 border border-white/10 shadow-lg">
                  {targetMod.image_url ? <img src={targetMod.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--text)]/10 flex items-center justify-center"><span className="material-symbols-outlined opacity-50">{t("ui_icon_inventory_2") || "inventory_2"}</span></div>}
                </div>
                <div className="flex flex-col min-w-0 gap-1">
                  <span className="text-xl font-black text-[var(--text)] uppercase truncate tracking-tight">{targetMod.name}</span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_person") || "person"}</span>
                    {targetMod.master_author}
                  </span>
                </div>
             </div>
             
              <button 
                onClick={saveStructure} 
                disabled={isSaving}
                className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group disabled:opacity-50 disabled:hover:scale-100"
              >
                <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{isSaving ? 'sync' : 'save'}</span>
                {isSaving ? t("btn_saving") : t("btn_save_structure")}
              </button>
           </div>
           
           <div className="flex-1 mt-4 relative z-10">
             <ModStructureBuilder 
               structure={targetMod.folder_structure || []} 
               onChange={handleStructureChange} 
               targetMod={targetMod}
               availableMods={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === targetMod.mason_id)} 
             />
           </div>
         </div>
       ) : (
         <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center relative mt-20">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--accent)] rounded-full blur-[120px] opacity-20 pointer-events-none" />
           <span className="material-symbols-outlined !text-6xl mb-4 text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_account_tree") || "account_tree"}</span>
           <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em] z-10">{t("sv_empty_title")}</span>
           <p className="text-[10px] mt-2 font-bold max-w-md z-10">{t("sv_empty_desc")}</p>
         </div>
       )}
       </div>
    </div>
  );
}
