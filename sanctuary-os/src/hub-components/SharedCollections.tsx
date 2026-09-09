import { SearchBar, ScreenUtilityBar } from "../shared";
import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { EmptyState, SidePanel, CustomDropdown, CustomComplianceDropdown, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass, ActionButton, FilterPopover, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction } from "../lib/audit";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";


export function MasonCollectionBuilder({ masonId, masonName }: { masonId: string, masonName: string }) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [myMods, setMyMods] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [setTier, setSetTier] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchSets = async () => {
    const { data } = await supabase.from('collections').select('*').eq('mason_id', masonId).order('name');
    if (data) setSets(data);
  };

  const fetchMyMods = async () => {
    const { data } = await supabase.from('mods').select('id, name, image_url, category_override').eq('mason_id', masonId).order('name');
    if (data) setMyMods(data);
  };

  const fetchMembers = async (setId: string) => {
    const { data } = await supabase.from('collection_members').select('id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)').eq('set_id', setId);
    if (data) setMembers(data);
  };

  useEffect(() => {
    fetchSets();
    fetchMyMods();
  }, []);

  const handleCreateSet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSetName.trim()) return;
    const { data, error } = await supabase.from('collections').insert([{
      name: newSetName.trim(),
      creator_name: masonName,
      mason_id: masonId,
      is_official: true,
      compliance_tier: setTier
    }]).select().single();

    if (!error && data) {
      setSets(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSetName("");
      setSetTier(0);
      setIsForgePanelOpen(false);
    }
  };

  const handleSaveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const { error } = await supabase.from('collections').update({
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url
    }).eq('id', activeSet.id);
    fetchSets();
    setIsSaving(false);
    if (!error) {
      useStore.getState().pushStatus(t("alert_saved"), "success");
    } else {
      useStore.getState().pushStatus(`${t("alert_error")} ${error.message}`, "error");
    }
  };

  const handleAddMod = async (modId: string) => {
    if (!activeSet) return;
    await supabase.from('collection_members').upsert({ set_id: activeSet.id, mod_id: modId });
    fetchMembers(activeSet.id);
  };

  const handleRemoveMod = async (memberId: string) => {
    await supabase.from('collection_members').delete().eq('id', memberId);
    fetchMembers(activeSet.id);
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const { error: err1 } = await supabase.from('collection_members').delete().eq('set_id', activeSet.id);
    const { error: err2 } = await supabase.from('collections').delete().eq('id', activeSet.id);
    setActiveSet(null);
    setMembers([]);
    fetchSets();
    setIsSaving(false);
    if (!err1 && !err2) {
      useStore.getState().pushStatus(t("alert_deleted"), "success");
    } else {
      useStore.getState().pushStatus(`${t("alert_error")} ${err1?.message || err2?.message}`, "error");
    }
  };

  const filteredSets = sets.filter((s: any) => {
    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
    },
    {
      id: "all",
      label: t("ql_all") || "All",
      icon: "collections_bookmark",
      count: filteredSets.length
    }
  ];

  const renderLanding = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent)]">collections_bookmark</span>
            <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("nav_collections")}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
          </div>
          {filteredSets.length === 0 ? (
            <EmptyState icon={t("icon_extension_off")} title={t("cc_no_sets")} className="py-8" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start pr-2">
              {filteredSets.slice(0, 4).map(setItem => (
                <div key={setItem.id} className="w-full max-w-[450px]">
                  <VaultCard
                    setItem={setItem}
                    activeSetId={activeSet?.id}
                    onClick={() => { setActiveSet(setItem); fetchMembers(setItem.id); }}
                    masonNameFallback={masonName}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderList = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start pr-2">
          {filteredSets.length === 0 && <EmptyState icon={t("icon_extension_off")} title={t("cc_no_sets")} className="col-span-full py-16" />}
          {filteredSets.map(setItem => (
            <div key={setItem.id} className="w-full max-w-[450px]">
              <VaultCard
                setItem={setItem}
                activeSetId={activeSet?.id}
                onClick={() => { setActiveSet(setItem); fetchMembers(setItem.id); }}
                masonNameFallback={masonName}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("nav_collections") || "Collections"}
      headerIcon="collections_bookmark"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("search_ph") as string}
      tabs={[]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      headerActions={
        <div className="flex items-center gap-2">
          <FilterPopover icon="tune" label={t("hub_filters") || "Filters"}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                  {t("registry_col_safety")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={tierFilter}
                  onChange={(v: string[]) => setTierFilter(v[0])}
                  options={[
                    { id: "ALL", label: "ALL TIERS" },
                    { id: "0", label: "TIER 0" },
                    { id: "1", label: "TIER 1" },
                    { id: "2", label: "TIER 2" }
                  ]}
                />
              </div>
              <div className="pt-4 flex justify-center border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-2 md:hidden">
                <ActionButton onClick={() => setIsForgePanelOpen(true)} icon="add" label={t("auto_create")} className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto" />
              </div>
            </div>
          </FilterPopover>
          <ActionButton onClick={() => setIsForgePanelOpen(true)} iconOnly={true} icon="add" label={t("auto_create")} className="hidden md:flex shrink-0 h-10 w-10 px-0" />
        </div>
      }
    >
      <div className="h-full flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {activeTab === 'overview' ? renderLanding() : renderList()}
      </div>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set")}
        subtitle={t("create_subtitle")}
        icon="add_circle"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="add"
              tooltip={t("forge_init_set")}
              onClick={handleCreateSet}
              disabled={!newSetName.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-8">
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("forge_set_name")}</label>
            <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder={t("forge_set_name")} className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_col_safety")}</label>
            <CustomComplianceDropdown value={setTier} onChange={setSetTier} maxTier={4} />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={t("manage_collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon="library_books"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="delete"
              tooltip={t("btn_delete")}
              onClick={handleDeleteSet}
              disabled={isSaving}
              variant="danger"
            />
            <PanelHeaderButton
              icon="save"
              tooltip={isSaving ? (t("btn_saving")) : (t("cc_save_set"))}
              onClick={handleSaveSetMeta}
              disabled={isSaving}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeSet && (
          <div className="flex flex-col h-full gap-6">
            <div className="flex flex-col gap-3 shrink-0 mb-4 mt-2">
              <input
                value={activeSet.name || ""}
                onChange={e => setActiveSet({ ...activeSet, name: e.target.value })}
                placeholder={t("forge_set_name")}
                className="bg-transparent text-3xl font-black text-[var(--text)] capitalize tracking-widest leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full"
              />
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url")}</label>
                <input value={activeSet.image_url || ""} onChange={e => setActiveSet({ ...activeSet, image_url: e.target.value })} placeholder={t("cc_cover_url")} className="w-full glass-surface rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeSet.url || ""} onChange={e => setActiveSet({ ...activeSet, url: e.target.value })} placeholder={t("external_url_placeholder")} className="w-full glass-surface rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
              </div>
            </div>

            <div className="flex flex-col gap-4 pb-12">
              <h4 className="text-[11px] font-black theme-text-accent capitalize tracking-widest">{t("registry_assets_title")}</h4>

              <div className="relative z-[6000]">
                <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder={t("link_search")} className="rounded-2xl h-[58px]" />

                {searchQuery.length >= 2 && (
         <div className="absolute top-full left-0 right-0 mt-2 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl shadow-md z-[7000] animate-in fade-in slide-in-from-top-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {myMods.filter(m => !members.some(mem => mem.mod_id === m.id) && m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                      <button type="button" key={m.id} onClick={() => { handleAddMod(m.id); setSearchQuery(""); }} className="w-full text-left px-5 py-3 hover:theme-panel-accent border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex justify-between items-center group transition-all shrink-0">
                        <span className="text-[10px] font-black text-[var(--text)] capitalize truncate">{m.name}</span>
                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-0 group-hover:opacity-100 capitalize transition-all">{t("cc_btn_add")}</span>
                      </button>
                    ))}
                    {myMods.filter(m => !members.some(mem => mem.mod_id === m.id) && m.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <EmptyState icon={t("icon_search_off")} title={t("mason_cc_no_assets")} className="py-8" />
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[9px] capitalize tracking-widest text-[var(--subtext)] opacity-60">{t("cc_in_set")}</span>
                  <span className="theme-text-accent font-black text-xs">{members.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-2">
                    {members.map(mem => (
                      <ArtifactCard
                        key={mem.id}
                        mod={mem.mods}
                        layout="horizontal"
                        onClick={() => { }}
                        onRemove={(e) => handleRemoveMod(mem.id)}
                        masonsList={[]}
                      />
                    ))}
                  </div>
                  {members.length === 0 && (
                    <EmptyState icon={t("icon_inventory_2")} title={t("cc_no_assets_in_set")} className="py-8" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SidePanel>
    </ElevatedHubLayout>
  );
}

export function CollectionForge({ setStatus }: any) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [setName, setSetName] = useState("");
  const [setMasonId, setSetMasonId] = useState("");
  const [setSetUrl, setSetSetUrl] = useState("");
  const [setTier, setSetTier] = useState(0);

  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");

  const [isSaving, setIsSaving] = useState(false);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSets = async () => {
    const { data } = await supabase.from('collections').select('*').order('name');
    if (data) setSets(data);
  };

  const fetchManifest = async (setId: string) => {
    const { data } = await supabase.from('collection_members')
      .select('id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)')
      .eq('set_id', setId);
    if (data) setManifestMembers(data);
  };

  const searchCCAssets = async () => {
    setIsSearching(true);
    const { data } = await supabase.from('mods')
      .select('id, name, image_url, master_author, masons(name)')
      .ilike('name', `%${assetSearch}%`)
      .limit(20);
    if (data) setAvailableAssets(data);
    setIsSearching(false);
  };

  useEffect(() => {
    fetchSets();
    const fetchMasons = async () => {
      const { data } = await supabase.from('masons').select('id, name').order('name');
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (assetSearch) searchCCAssets(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [assetSearch]);

  const handleSelectSet = (setItem: any) => {
    setActiveSet(setItem);
    fetchManifest(setItem.id);
  };

  const createSet = async () => {
    if (!setName) return;
    const payload: any = {
      name: setName,
      is_official: true,
      compliance_tier: setTier,
      mason_id: (setMasonId && setMasonId.trim() !== "") ? setMasonId : null,
      url: (setSetUrl && setSetUrl.trim() !== "") ? setSetUrl : null
    };

    const { data, error } = await supabase.from('collections').insert([payload]).select().single();
    if (!error && data) {
      logArchitectAction("Created Collection", "collections", setName);
      setSets([...sets, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSetName("");
      setSetMasonId("");
      setSetSetUrl("");
      setSetTier(0);
      setIsForgePanelOpen(false);
    }
  };

  const saveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const { error } = await supabase.from('collections').update({
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      mason_id: activeSet.mason_id,
      compliance_tier: activeSet.compliance_tier
    }).eq('id', activeSet.id);

    if (!error) {
      logArchitectAction("Updated Collection Metadata", "collections", activeSet.name);
      await fetchSets();
      if (setStatus) setStatus(`${t("icon_check_circle")} [${activeSet.name}] ${t("alert_saved")}`);
    } else {
      if (setStatus) setStatus(`${t("icon_block")} ${t("alert_error")} ${t(error.message)}`);
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const addToManifest = async (modId: string) => {
    if (!activeSet) return;
    await supabase.from('collection_members').upsert({ set_id: activeSet.id, mod_id: modId });
    logArchitectAction(`Added Mod ID ${modId} to Collection`, "collections", activeSet.name);
    fetchManifest(activeSet.id);
  };

  const removeFromManifest = async (memberId: string, modName: string) => {
    await supabase.from('collection_members').delete().eq('id', memberId);
    if (activeSet) {
      logArchitectAction(`Removed Mod ${modName} from Collection`, "collections", activeSet.name);
      fetchManifest(activeSet.id);
    }
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    await supabase.from('collection_members').delete().eq('set_id', activeSet.id);
    await supabase.from('collections').delete().eq('id', activeSet.id);
    logArchitectAction(`Deleted Collection`, "collections", activeSet.name);
    setActiveSet(null);
    setManifestMembers([]);
    fetchSets();
    setIsSaving(false);
  };

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      setSetMasonId(newId);
      if (activeSet) setActiveSet({ ...activeSet, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const filteredSets = sets.filter((s: any) => {
    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in pb-20">

      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
        <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_collections_bookmark")}</span>
          </div>
          <span className="truncate">{t("tab_cc")}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t("search_queue")}
              className="h-12 w-full rounded-2xl"
            />
          </div>
          <div className="w-max min-w-[160px] max-w-xs relative z-50 h-12">
            <CustomDropdown disableTint={true} value={tierFilter} onChange={(v: string[]) => setTierFilter(v[0])} options={[{ id: "ALL", label: "ALL TIERS" }, { id: "0", label: "TIER 0" }, { id: "1", label: "TIER 1" }, { id: "2", label: "TIER 2" }]} />
          </div>
          <ActionButton onClick={() => setIsForgePanelOpen(true)} className="h-12 px-6 shrink-0 font-black capitalize tracking-widest text-[10px]" icon={t("icon_add")} label={t("auto_create")} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start pr-2">
          {filteredSets.length === 0 ? (
            <EmptyState icon={searchTerm ? "search_off" : (t("icon_folder"))} title={searchTerm ? t("no_matches") : (t("no_vaults"))} className="col-span-full py-16" />
          ) : filteredSets.map(setItem => (
            <VaultCard
              key={setItem.id}
              setItem={setItem}
              activeSetId={activeSet?.id}
              onClick={() => handleSelectSet(setItem)}
              masonsList={masonsList}
            />
          ))}
        </div>
      </div>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set")}
        subtitle={t("create_subtitle")}
        icon="add_circle"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="add"
              tooltip={t("forge_init_set")}
              onClick={createSet}
              disabled={!setName.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-8">
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("forge_set_name")}</label>
            <input value={setName} onChange={e => setSetName(e.target.value)} placeholder={t("forge_set_name")} className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason")}</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <CustomMasonDropdown value={setMasonId} options={masonsList} onChange={setSetMasonId} />
              </div>
              <button onClick={() => setIsMasonPanelOpen(true)} className="bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">{t("icon_person_add")}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_col_safety")}</label>
            <CustomComplianceDropdown value={setTier} onChange={setSetTier} maxTier={4} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url")}</label>
            <input value={setSetUrl} onChange={e => setSetSetUrl(e.target.value)} placeholder={t("auto_https")} className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold opacity-80 focus:opacity-100 focus:outline-none focus:theme-border-accent transition-all" />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={t("manage_collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon="library_books"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="delete"
              tooltip={t("btn_delete")}
              onClick={handleDeleteSet}
              disabled={isSaving}
              variant="danger"
            />
            <PanelHeaderButton
              icon="save"
              tooltip={isSaving ? (t("ui_loading")) : (t("cc_save_set"))}
              onClick={saveSetMeta}
              disabled={isSaving}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeSet && (
          <div className="flex flex-col h-full gap-6">
            <div className="flex flex-col gap-3 shrink-0 mb-4 mt-2">
              <input
                value={activeSet.name || ""}
                onChange={e => setActiveSet({ ...activeSet, name: e.target.value })}
                placeholder={t("forge_set_name")}
                className="bg-transparent text-3xl font-black text-[var(--text)] capitalize tracking-widest leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full"
              />
            </div>
            <div className="flex flex-col gap-4">


              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason")}</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CustomMasonDropdown value={activeSet.mason_id || ""} options={masonsList} onChange={(val: string) => setActiveSet({ ...activeSet, mason_id: val })} />
                  </div>
                  <button onClick={() => setIsMasonPanelOpen(true)} className="bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">{t("icon_person_add")}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_col_safety")}</label>
                <CustomComplianceDropdown value={activeSet.compliance_tier || 0} onChange={(val: number) => setActiveSet({ ...activeSet, compliance_tier: val })} maxTier={4} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url")}</label>
                <input value={activeSet.image_url || ""} onChange={e => setActiveSet({ ...activeSet, image_url: e.target.value })} placeholder={t("cc_cover_url")} className="w-full glass-surface rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeSet.url || ""} onChange={e => setActiveSet({ ...activeSet, url: e.target.value })} placeholder={t("external_url_placeholder")} className="w-full glass-surface rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
              </div>
            </div>

            <div className="flex flex-col gap-4 pb-12">
              <h4 className="text-[11px] font-black theme-text-accent capitalize tracking-widest">{t("registry_assets_title")}</h4>

              <div className="relative z-[6000]">
                <SearchBar value={assetSearch} onChange={setAssetSearch} placeholder={t("forge_search_assets")} className="rounded-2xl h-[58px]" isLoading={isSearching} />

                {assetSearch.length >= 2 && availableAssets.length > 0 && (
         <div className="absolute top-full left-0 right-0 mt-2 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl shadow-md z-[7000] animate-in fade-in slide-in-from-top-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {availableAssets.filter(asset => !manifestMembers.some(m => m.mod_id === asset.id)).map(asset => (
                      <button type="button" key={asset.id} onClick={() => { addToManifest(asset.id); setAssetSearch(""); }} className="w-full text-left px-5 py-3 hover:theme-panel-accent border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex justify-between items-center group transition-all shrink-0">
                        <div className="flex flex-col min-w-0 pr-4">
                          <span className="text-[10px] font-black text-[var(--text)] capitalize truncate">{asset.name}</span>
                          <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate">{asset.masons?.name || asset.master_author || "UNKNOWN"}</span>
                        </div>
                        <span className="text-[9px] font-bold theme-text-accent opacity-0 group-hover:opacity-100 capitalize transition-all">{t("cc_btn_add")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 mt-2">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[9px] capitalize tracking-widest text-[var(--subtext)] opacity-60">{t("cc_in_set")}</span>
                  <span className="theme-text-accent font-black text-xs">{manifestMembers.length}</span>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-2">
                  {manifestMembers.map(member => (
                    <ArtifactCard
                      key={member.id}
                      mod={member.mods}
                      layout="horizontal"
                      onClick={() => { }}
                      onRemove={() => removeFromManifest(member.id, member.mods?.name || "Unknown")}
                      masonsList={[]}
                    />
                  ))}
                </div>

                {manifestMembers.length === 0 && (
                  <div className="w-full h-32 flex flex-col items-center justify-center opacity-40">
                    <span className="text-3xl mb-2 grayscale"><span className="material-symbols-outlined shrink-0">{t("icon_science")}</span></span>
                    <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("no_mods_found")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title")}
        icon="person_add"
        widthClass="w-[450px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="person_add"
              tooltip={t("create_btn_create")}
              onClick={handleCreateMason}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="p-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason_name")}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("create_ph_name")} className="glass-surface rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>
      </SidePanel>

    </div>
  );
}




