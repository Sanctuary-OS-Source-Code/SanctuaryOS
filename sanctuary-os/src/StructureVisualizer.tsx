import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { logArchitectAction } from "./lib/audit";
import { useLexicon } from "./LexiconContext";
import { ActionButton, ModSearchDropdown, EmptyState } from "./shared";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
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
      const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, image_url, status, mason_id, folder_structure, latest_version').order('name'));
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
      useStore.getState().pushStatus(t("btn_saved"), "success");
      
      setCloudMods(prev => prev.map(m => m.id === targetMod.id ? { ...m, folder_structure: targetMod.folder_structure } : m));
    } catch (err) {
      console.error("Failed to save structure:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("mason_hub_title")}
      headerBreadcrumb={t("tab_structure") || "Structure"}
      headerIcon="architecture" hideSearch={true}
      leftContent={
        <div className="w-[400px] z-50">
          <ModSearchDropdown 
            placeholder={t("structure_select_artifact")}
            selectedItem={targetMod}
            onSelect={(mod: any) => setTargetMod(mod)}
            onClear={() => setTargetMod(null)}
            modList={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === masonId)} 
          />
        </div>
      }
      headerActions={
        targetMod && (
          <div className="flex items-center gap-4 z-50">
            <ActionButton
              onClick={() => {
                const newFolder = { id: Math.random().toString(36).substr(2, 9), name: t("structure_new_folder"), type: "folder" as const, children: [] };
                handleStructureChange([...(targetMod.folder_structure || []), newFolder]);
              }}
              className="h-12 px-6 shrink-0 font-black capitalize tracking-widest text-[10px] rounded-full"
              icon={t("icon_create_new_folder")}
              label={t("structure_add_root")}
            />
            <ActionButton
              onClick={saveStructure}
              disabled={isSaving}
              className="h-12 px-6 shrink-0 font-black capitalize tracking-widest text-[10px] rounded-full"
              icon={isSaving ? 'sync' : 'save'}
              label={isSaving ? t("btn_saving") : t("btn_save_structure")}
            />
          </div>
        )
      }
    >

      {/* 2. The Main Body */}
      <div className="flex-1 w-full relative z-0 h-full overflow-hidden flex flex-col pt-4">
        {!targetMod ? (
          <div className="w-full h-full flex items-center justify-center opacity-80 pb-32">
            <EmptyState icon={t("icon_architecture")} className="py-24" />
          </div>
        ) : (
          <div className="w-full flex flex-col gap-10 animate-in fade-in zoom-in-95 duration-500 pb-32 h-full">
            
            <div className="flex-1 relative z-10 flex flex-col h-full">
              <ModStructureBuilder 
                structure={targetMod.folder_structure || []} 
                onChange={handleStructureChange} 
                targetMod={targetMod}
                availableMods={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === targetMod.mason_id)} 
              />
            </div>
          </div>
        )}
      </div>
    </ElevatedHubLayout>
  );
}
