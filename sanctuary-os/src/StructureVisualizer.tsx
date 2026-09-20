import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { logArchitectAction } from "./lib/audit";
import { useLexicon } from "./LexiconContext";
import { ActionButton, EmptyState, ActionPill, CustomClassificationDropdown, CustomDropdown } from "./shared";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import { useStore } from "./store";
import ModStructureBuilder, { StructureNode } from "./ModStructureBuilder";
import { ArtifactCard } from "./Cards";
import { UniversalCard } from "./components/universal/UniversalCard";

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

  // Tabs
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Selection Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");

  // Overview Data
  const [recentHashes, setRecentHashes] = useState<any[]>([]);
  const [recentStructures, setRecentStructures] = useState<any[]>([]);

  useEffect(() => {
    const fetchMods = async () => {
      let query = supabase.from('mods').select('id, name, master_author, image_url, status, mason_id, folder_structure, latest_version, category_override, sub_type').order('name');
      if (!isArchitect && masonId) query = query.eq('mason_id', masonId);
      const { data } = await fetchAllPaginated(() => query);
      if (data) setCloudMods(data);
    };
    fetchMods();
  }, [masonId, isArchitect]);

  useEffect(() => {
    const fetchOverviewData = async () => {
      // Recent hashes
      let hashesQuery = supabase.from('mod_versions')
        .select('id, dna_hash, version_label, created_at, mods!inner(name, image_url, mason_id)')
        .order('created_at', { ascending: false }).limit(6);
      if (!isArchitect && masonId) hashesQuery = hashesQuery.eq('mods.mason_id', masonId);
      const { data: hashes } = await hashesQuery;
      if (hashes) setRecentHashes(hashes);

      // Recent structures
      let structuresQuery = supabase.from('mods')
        .select('id, name, updated_at, image_url, folder_structure, master_author, latest_version, mason_id')
        .not('folder_structure', 'is', null)
        .order('updated_at', { ascending: false }).limit(6);
      if (!isArchitect && masonId) structuresQuery = structuresQuery.eq('mason_id', masonId);
      const { data: structures } = await structuresQuery;
      if (structures) setRecentStructures(structures);
    };
    if (activeTab === 'overview') {
      fetchOverviewData();
    }
  }, [activeTab]);

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

  const filteredMods = cloudMods.filter(mod => {
    if (statusFilter !== "ALL" && mod.status !== statusFilter) return false;
    if (activeCategory !== "ALL" && (mod.category_override || "Script") !== activeCategory) return false;
    if (searchTerm) return (mod.name?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    return true;
  });

  const tabs = [
    { id: "overview", label: t("landing_overview") || "Overview", icon: "dashboard" },
    { id: "select", label: t("sel_artifact") || "Select Artifact", icon: "search" },
    { id: "workspace", label: t("tab_workspace") || "Workspace", icon: "architecture" },
    { id: "recent", label: t("tab_recent") || "Recent Changes", icon: "history" }
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("mason_hub_title")}
      headerBreadcrumb={t("tab_structure") || "Structure"}
      headerIcon="architecture"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      hideSearch={activeTab !== 'select' && activeTab !== 'recent'}
      hideHeader={activeTab !== 'select' && activeTab !== 'recent'}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      primaryPopover={activeTab === 'select' ? {
        icon: "tune",
        label: t("filters") || "Filters",
        content: (
          <div className="flex flex-col w-[400px] p-4 text-left max-w-[calc(100vw-40px)]">
            <div className="flex flex-col mb-5 w-full">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                {t("filter_category") || "Category"}
              </div>
              <CustomClassificationDropdown 
                value={activeCategory} 
                onChange={(v) => setActiveCategory(v as string)} 
              />
            </div>
            <div className="flex flex-col w-full">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                {t("filter_status") || "Status"}
              </div>
              <CustomDropdown 
                variant="pill" 
                value={statusFilter} 
                onChange={(v: string[]) => setStatusFilter(v[0])} 
                options={[
                  { id: "ALL", label: t("status_dd_all") },
                  { id: "stable", label: t("status_dd_stable") },
                  { id: "unstable", label: t("label_unstable") },
                  { id: "corrupted", label: t("status_corrupted") },
                  { id: "under_review", label: t("status_dd_review") },
                  { id: "pending", label: t("pending") },
                  { id: "unverified", label: t("unverified") }
                ]} 
              />
            </div>
          </div>
        )
      } : undefined}
    >
      <div className="flex-1 w-full relative z-0 h-full overflow-hidden flex flex-col pt-4">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--accent)]">fingerprint</span>
                <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("recent_hashes") || "Recent DNA Hashes"}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
              </div>
              {recentHashes.length === 0 ? (
                <EmptyState icon="fingerprint" className="py-8" />
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 md:pr-2">
                  {recentHashes.slice(0, 12).map(h => (
                    <UniversalCard
                      key={h.id}
                      layout="vertical"
                      image={h.mods?.image_url}
                      icon={!h.mods?.image_url ? "deployed_code" : undefined}
                      title={h.mods?.name || "Unknown"}
                      subtitle={`${h.version_label} • ${new Date(h.created_at).toLocaleDateString()}`}
                      onClick={() => {
                        if (h.mods) {
                          setTargetMod(h.mods);
                          setActiveTab('workspace');
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--accent)]">architecture</span>
                <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("recent_structures") || "Recent Structures"}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
              </div>
              {recentStructures.length === 0 ? (
                <EmptyState icon="architecture" className="py-8" />
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 md:pr-2">
                  {recentStructures.slice(0, 12).map(m => (
                    <UniversalCard
                      key={m.id}
                      layout="vertical"
                      image={m.image_url}
                      icon={!m.image_url ? "architecture" : undefined}
                      title={m.name}
                      subtitle={`${m.master_author || t("unknown_mason")} • ${new Date(m.updated_at).toLocaleDateString()}`}
                      onClick={() => { setTargetMod(m); setActiveTab('workspace'); }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'select' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredMods.length === 0 ? (
                <EmptyState icon="search_off" title={t("no_matches")} className="col-span-full py-16" />
              ) : filteredMods.map(mod => (
                <ArtifactCard
                  key={mod.id}
                  mod={mod}
                  activeModId={targetMod?.id}
                  onClick={() => { setTargetMod(mod); setActiveTab('workspace'); }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'workspace' && (
          <div className="w-full flex flex-col gap-10 animate-in fade-in zoom-in-95 duration-500 pb-32 h-full">
            {!targetMod ? (
              <div className="w-full h-full flex items-center justify-center opacity-80 pb-32">
                <EmptyState icon={t("icon_architecture")} className="py-24" />
              </div>
            ) : (
              <div className="flex-1 relative z-10 flex flex-col h-full gap-6">
                <div className="grid grid-cols-2 gap-6 shrink-0">
                  <UniversalCard
                    layout="horizontal"
                    icon="create_new_folder"
                    title={t("structure_add_root")}
                    onClick={() => {
                      const newFolder = { id: Math.random().toString(36).substr(2, 9), name: t("structure_new_folder"), type: "folder" as const, children: [] };
                      handleStructureChange([...(targetMod.folder_structure || []), newFolder]);
                    }}
                  />
                  <UniversalCard
                    layout="horizontal"
                    icon={isSaving ? "sync" : "save"}
                    title={isSaving ? t("btn_saving") : t("btn_save_structure")}
                    onClick={saveStructure}
                    isDisabled={isSaving}
                  />
                </div>
                <ModStructureBuilder 
                  structure={targetMod.folder_structure || []} 
                  onChange={handleStructureChange} 

                  targetMod={targetMod}
                  availableMods={isArchitect ? cloudMods : cloudMods.filter(m => m.mason_id === targetMod.mason_id)} 
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
               <div className="flex items-center gap-2 mb-6 w-full">
                <span className="material-symbols-outlined text-[var(--text)]">history</span>
                <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("recent_activity") || "Recent Activity"}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 md:pr-2 w-full">
                {recentStructures.filter(m => !searchTerm || m.name?.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 30).map(m => (
                    <UniversalCard
                      key={m.id}
                      layout="vertical"
                      image={m.image_url}
                      icon={!m.image_url ? "architecture" : undefined}
                      title={m.name}
                      subtitle={`${new Date(m.updated_at).toLocaleString()}`}
                      onClick={() => { setTargetMod(m); setActiveTab('workspace'); }}
                    />
                ))}
              </div>
          </div>
        )}
      </div>
    </ElevatedHubLayout>
  );
}
