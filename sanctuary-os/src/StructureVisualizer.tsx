import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown } from "./shared";
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
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    setSaveSuccess(false);
    try {
      const { error } = await supabase.from('mods').update({ folder_structure: targetMod.folder_structure || [] }).eq('id', targetMod.id);
      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Update local cloudMods state
      setCloudMods(prev => prev.map(m => m.id === targetMod.id ? { ...m, folder_structure: targetMod.folder_structure } : m));
    } catch (err) {
      console.error("Failed to save structure:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 theme-glass-panel rounded-[2.5rem] shadow-2xl p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 min-h-[70vh]">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6 shrink-0 relative z-50">
          <div>
            <h2 className="text-2xl font-black uppercase text-[var(--text)] tracking-tighter flex items-center gap-3">
              <span className="text-3xl grayscale">📁</span> {t("structure_title")}
            </h2>
            <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] mt-1">
              {t("structure_subtitle")}
            </p>
          </div>
          
          <div className="w-full md:w-96 theme-glass-inner p-2 rounded-2xl flex flex-col gap-2">
            <ModSearchDropdown 
              placeholder={t("structure_select_artifact")}
              selectedItem={targetMod}
              onSelect={(mod: any) => setTargetMod(mod)}
              onClear={() => setTargetMod(null)}
              modList={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === masonId)} 
            />
          </div>
       </div>

       {targetMod ? (
         <div className="flex flex-col flex-1 min-h-0 gap-6">
           <div className="flex justify-between items-center theme-glass-inner p-4 rounded-2xl border border-white/5 shrink-0">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl theme-glass-inner overflow-hidden shrink-0">
                  {targetMod.image_url ? <img src={targetMod.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--text)]/10" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-black text-[var(--text)] uppercase truncate">{targetMod.name}</span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase">{targetMod.master_author}</span>
                </div>
             </div>
             
             <button 
                onClick={saveStructure} 
                disabled={isSaving}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 ${saveSuccess ? 'theme-bg-success text-white' : 'theme-bg-accent text-[var(--bg)] hover:opacity-90'}`}
              >
                {isSaving ? t("btn_saving") : saveSuccess ? t("btn_saved") : t("btn_save_structure")}
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar">
             <ModStructureBuilder 
               structure={targetMod.folder_structure || []} 
               onChange={handleStructureChange} 
               targetMod={targetMod}
               availableMods={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === targetMod.mason_id)} 
             />
           </div>
         </div>
       ) : (
         <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
           <span className="text-6xl mb-4 grayscale">📁</span>
           <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("sv_empty_title")}</span>
           <p className="text-[10px] mt-2 font-bold max-w-md">{t("sv_empty_desc")}</p>
         </div>
       )}
    </div>
  );
}
