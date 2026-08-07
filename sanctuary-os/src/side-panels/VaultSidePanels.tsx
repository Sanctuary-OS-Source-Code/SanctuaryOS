import React from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidePanelActionFooter, SidebarActionButton, CustomDropdown, getFileLabel, isSupportedExtension, formatDisplayName, HoverTooltip, HubTabs, ActionButton, getModIcon } from "../shared";
import { useStore } from "../store";

export function VaultToolsSidePanel({
  isOpen,
  onClose,
  playSets,
  activePlaySetIndex,
  setActivePlaySetIndex,
  equipPlaySet,
  runRadarSweep,
  isBulkMode,
  setIsBulkMode,
  finalVisibleMods,
  selectedMods,
  setSelectedMods,
  equipFilter,
  setPurgeTargetFiles,
  activeLocalFolder,
  setActiveLocalFolder,
  setIsLocalFolderEditorOpen
}: any) {
  const { t } = useLexicon();
  const setIsSidePanelOpen = (val: boolean) => !val && onClose();

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      keepMounted={true}
      title={t("vault_tools_title")}
      subtitle={t("vault_tools_subtitle")}
      icon="tune"
      iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
    >
      <div className="flex flex-col gap-6">
        {playSets && playSets.length > 0 && (
          <div className="flex flex-col gap-4 pb-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_layers")}</span>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{t("type_blueprint")}</h3>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <CustomDropdown
                  disableTint={true}
                  value={activePlaySetIndex}
                  options={playSets.map((set: any, idx: number) => ({ id: idx, label: set.name }))}
                  onChange={(val: any) => setActivePlaySetIndex && setActivePlaySetIndex(Number(val))}
                />
              </div>
              <button
                onClick={() => equipPlaySet && equipPlaySet(playSets[activePlaySetIndex]?.name)}
                className="h-10 px-4 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span> {t("auto_save")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 pb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined !text-[18px] text-[var(--text)]">{t("icon_bolt")}</span>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{t("sidebar_actions")}</h3>
          </div>

          <div className="flex flex-col gap-2">
            <SidebarActionButton id="REFRESH" icon="refresh" label={t("btn_radar")} onClick={() => { runRadarSweep(true); setIsSidePanelOpen(false); }} active={false} />
            {equipFilter === "ARCHIVES" && (
              <SidebarActionButton
                id="PURGE_FOLDER"
                icon="delete_sweep"
                danger={true}
                label={t("btn_purge_folder")}
                onClick={() => {
                  const allFilesToPurge = new Set<string>();
                  finalVisibleMods.forEach((mod: any) => {
                    if (mod && mod.isVirtual && mod.flavors) {
                      mod.flavors.forEach((f: any) => {
                        if (f.name) allFilesToPurge.add(f.name);
                      });
                    } else if (mod && mod.name) {
                      allFilesToPurge.add(mod.name);
                    }
                  });
                  if (allFilesToPurge.size === 0) return;
                  setPurgeTargetFiles(Array.from(allFilesToPurge));
                  setIsSidePanelOpen(false);
                }}
                active={false}
              />
            )}
          </div>
        </div>

        {(() => {
          const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
          if (localSets.length === 0) return null;

          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_folder")}</span>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{t("local_folders")}</h3>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <CustomDropdown
                    disableTint={true}
                    value={activeLocalFolder || localSets[0]?.id}
                    options={localSets.map((set: any) => ({ id: set.id, label: set.name }))}
                    onChange={(val: any) => setActiveLocalFolder(String(val))}
                  />
                </div>
                <button
                  onClick={() => {
                    const target = activeLocalFolder || localSets[0]?.id;
                    if (!target) return;
                    setIsLocalFolderEditorOpen(true);
                  }}
                  className="h-10 px-4 rounded-xl theme-glass-inner text-[var(--text)] hover:bg-white/10 hover:text-white transition-all flex items-center justify-center shrink-0 border border-white/5"
                >
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_edit")}</span>
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </SidePanel>
  );
}

export function VaultLocalFolderEditorSidePanel({
  isOpen,
  onClose,
  activeLocalFolder,
  setActiveLocalFolder,
  confirmDeleteId,
  setConfirmDeleteId,
  renameFolderInput,
  setRenameFolderInput,
  runRadarSweep,
  displayModList,
  setIsBulkMode,
  setBulkAddTarget
}: any) {
  const { t } = useLexicon();
  const { activeGameSchema } = useStore();
  const setIsLocalFolderEditorOpen = (val: boolean) => {
    if (!val) {
      runRadarSweep(true);
      onClose();
    }
  };
  const [searchToAdd, setSearchToAdd] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("linked");
  const [updateTrigger, setUpdateTrigger] = React.useState(0);

  const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
  const target = activeLocalFolder || localSets[0]?.id;
  const targetSet = localSets.find((s: any) => s.id === target) || { id: "default", name: "", items: [], isCollection: false, archetypes: { core: null, twins: [], addons: [] } };

  if (!targetSet.archetypes) {
    targetSet.archetypes = { core: null, twins: [], addons: [] };
  }

  const typeColor = targetSet.isCollection ? 'var(--accent)' : 'var(--success)';
  const typeIcon = targetSet.isCollection ? 'category' : 'folder';

  const searchResults = displayModList.filter((m: any) => (m.displayName || m.name).toLowerCase().includes(searchToAdd.toLowerCase()));

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={() => setIsLocalFolderEditorOpen(false)}
        keepMounted={true}
        title={t("local_folders_edit")}
        subtitle={t("local_folder_desc")}
        icon={typeIcon}
        iconColorClass={targetSet.isCollection ? "text-[var(--accent)]" : "text-[var(--success)]"}
        widthClass="w-[900px]"
        backdropZ="z-[115000]"
        panelZ="z-[115001]"
        ambientGlows={
          <>
            <div className={`absolute -top-20 -right-20 w-96 h-96 ${targetSet.isCollection ? 'bg-[var(--accent)]' : 'bg-[var(--success)]'} opacity-10 blur-[100px] rounded-full pointer-events-none`} />
          </>
        }
        footer={
          <SidePanelActionFooter
            actionLabel={t("local_folders_delete")}
            actionIcon="delete"
            onAction={() => setConfirmDeleteId(target)}
            actionVariant="danger"
            cancelLabel={t("btn_done") || "DONE"}
            onCancel={() => setIsLocalFolderEditorOpen(false)}
          />
        }
      >
        <div className="flex flex-col h-full">
          <div className="px-8 pt-4 shrink-0 mb-4 flex flex-col gap-4">
            <div className="flex items-center w-full overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/5 shadow-inner h-12 shrink-0 bg-black/20">
              <div className="relative flex-1 h-full flex items-center">
                <span className="absolute left-4 opacity-50 text-[18px] material-symbols-outlined pointer-events-none">
                  {typeIcon}
                </span>
                <input
                  value={renameFolderInput === "" ? targetSet.name : renameFolderInput}
                  onChange={(e) => setRenameFolderInput(e.target.value)}
                  onBlur={() => {
                    const val = renameFolderInput === "" ? targetSet.name : renameFolderInput;
                    if (val.trim() && val.trim() !== targetSet.name) {
                      const updated = localSets.map((s: any) => s.id === target ? { ...s, name: val.trim() } : s);
                      localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                      setRenameFolderInput("");
                      runRadarSweep(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="w-full h-full bg-transparent border-none outline-none px-4 pl-12 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]"
                  placeholder={targetSet.isCollection ? t("ph_collection_name") || "COLLECTION NAME" : t("ph_folder_name") || "FOLDER NAME"}
                />
              </div>
              <button
                onClick={() => {
                  const updated = localSets.map((s: any) => s.id === target ? { ...s, isCollection: !s.isCollection } : s);
                  localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                  runRadarSweep(true);
                }}
                className={`h-full px-6 text-[10px] font-black uppercase tracking-widest transition-all ${targetSet.isCollection ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black' : 'bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)] hover:text-black'} flex items-center justify-center gap-2 shrink-0 border-none outline-none`}
              >
                <span className="material-symbols-outlined text-[16px]">{typeIcon}</span>
                {targetSet.isCollection ? t('collection') : t('folder')}
              </button>
            </div></div>

          {/* Tabs */}
          <div className="w-full h-12 shrink-0 relative z-50">
            <HubTabs
              className="h-full w-full !rounded-2xl"
              tabs={[
                { id: 'linked', icon: 'inventory_2', label: t("tab_overview") || "OVERVIEW" },
                { id: 'add', icon: 'add_circle', label: t("tab_add_artifacts") || "ADD ARTIFACTS" },
                { id: 'archetypes', icon: 'hub', label: t("tab_archetypes") || "ARCHETYPES" }
              ]}
              activeTab={activeTab}
              setTab={(id: string) => setActiveTab(id)}
            />
          </div>

          {/* ACTIVE TAB CONTENT */}
          <div className="flex-1 flex flex-col min-h-0 relative mt-4">

            {activeTab === 'linked' && (
              <div className="absolute inset-0 flex flex-col animate-in fade-in">
                <div className="flex items-center gap-3 mb-6 shrink-0 border-b border-white/5 pb-4">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--text)] opacity-50">{t("icon_inventory_2") || "inventory_2"}</span>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{t("artifacts_linked") || "ARTIFACTS LINKED"} ({targetSet.items.length})</h3>
                </div>
                <div className="flex-1 flex flex-wrap gap-3 overflow-y-auto custom-scrollbar pr-2 items-start content-start">
                  {targetSet.items.length === 0 && (
                    <div className="w-full p-12 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50">
                      <span className="material-symbols-outlined !text-[48px] mb-4">inventory_2</span>
                      <span className="text-[12px] font-black uppercase tracking-widest">{t("empty_folder") || "THIS NODE IS EMPTY"}</span>
                    </div>
                  )}
                  {targetSet.items.map((hash: string) => {
                    const art = displayModList.find((m: any) => m.hash === hash);
                    if (!art) return null;
                    return (
                      <div key={hash} className="w-[calc(50%-0.375rem)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-4 rounded-xl flex items-center justify-between gap-4 group/item transition-all hover:bg-white/5 border border-white/5 hover:border-white/20 shadow-lg relative overflow-hidden">
                        <div className="flex flex-1 items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden shrink-0">
                            {art.image_url || art.imageUrl ? (
                              <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className={`material-symbols-outlined !text-[20px] ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'} opacity-50`}>{getModIcon(art, activeGameSchema, t)}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] font-black text-[var(--text)] uppercase truncate">
                            {(art.displayName || art.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                            const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems } : s);
                            localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                            setUpdateTrigger(prev => prev + 1);
                          }}
                          className="w-6 h-6 rounded-md bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white flex items-center justify-center transition-all opacity-0 group-hover/item:opacity-100 shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[14px]">close</span>
                        </button>
                        <HoverTooltip title={(art.displayName || art.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "")} subtitle={art.author || t("unknown_mason") || "Unknown Mason"} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'add' && (
              <div className="absolute inset-0 flex flex-col animate-in fade-in">
                <div className="flex items-center gap-4 mb-6 shrink-0">
                  <div className="relative flex-1">
                    <input
                      value={searchToAdd}
                      onChange={(e) => setSearchToAdd(e.target.value)}
                      placeholder={t("btn_search") || "SEARCH TO ADD..."}
                      className="w-full h-12 theme-glass-inner border border-white/10 hover:border-white/20 rounded-xl px-4 pl-12 text-[10px] uppercase tracking-widest font-black text-[var(--text)] focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 focus:outline-none"
                    />
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-[18px]">search</span>
                  </div>
                  {searchToAdd.trim() !== "" && searchResults.length > 0 && (
                    <ActionButton
                      onClick={() => {
                        const hashesToAdd = searchResults.map((m: any) => m.hash);
                        const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: Array.from(new Set([...s.items, ...hashesToAdd])) } : s);
                        localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                        setUpdateTrigger(prev => prev + 1);
                        setSearchToAdd("");
                      }}
                      icon="done_all"
                      label={`${t("add_all") || "ADD ALL"} (${searchResults.length})`}
                      className="shrink-0 h-12 px-6"
                    />
                  )}
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  <div className="flex flex-wrap gap-3 w-full">
                    {searchToAdd.trim() === "" ? (
                      <div className="w-full p-12 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50">
                        <span className="material-symbols-outlined !text-[48px] mb-4">search</span>
                        <span className="text-[12px] font-black uppercase tracking-widest">{t("search_to_add") || "SEARCH TO ADD ARTIFACTS"}</span>
                      </div>
                    ) : (
                      Array.from(new Map(searchResults.map((m: any) => [m.hash, m])).values()).slice(0, 100).map((m: any, index: number) => (
                        <div key={m.hash} className="w-[calc(50%-0.375rem)] bg-white/5 hover:bg-white/10 transition-colors min-h-[64px] min-w-0 p-3 rounded-xl flex items-center justify-between gap-4 group/item border border-white/5 shadow-lg relative overflow-hidden">
                          <div className="flex flex-1 items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden shrink-0">
                              {m.image_url || m.imageUrl ? (
                                <img src={m.image_url || m.imageUrl} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className={`material-symbols-outlined !text-[20px] ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'} opacity-50`}>{getModIcon(m, activeGameSchema, t)}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-[11px] font-black text-[var(--text)] uppercase truncate">
                              {(m.displayName || m.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
                            </span>
                          </div>
                          {(() => {
                            const isAdded = targetSet.items.includes(m.hash);
                            return (
                              <button
                                disabled={isAdded}
                                onClick={() => {
                                  if (isAdded) return;
                                  const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash] } : s);
                                  localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                  setUpdateTrigger(prev => prev + 1);
                                }}
                                className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center transition-all shrink-0 border ${isAdded
                                  ? 'bg-white/5 border-white/5 text-[var(--subtext)] opacity-50 cursor-not-allowed'
                                  : 'bg-white/5 border-white/10 text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:text-[var(--accent)] hover:border-[var(--accent)]'
                                  }`}
                              >
                                {isAdded ? (t("btn_added") || "ADDED") : (t("btn_add_node_artifact") || "ADD")}
                              </button>
                            );
                          })()}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'archetypes' && (
              <div className="absolute inset-0 flex flex-col animate-in fade-in overflow-y-auto custom-scrollbar pr-2">
                <div className="flex flex-col gap-6">
                  <div className="p-6 theme-glass-panel rounded-2xl border border-[var(--accent)]/30 shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-10 blur-[50px] rounded-full pointer-events-none" />
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                      <span className="material-symbols-outlined text-[var(--accent)]">stars</span>
                      <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t("core_artifact") || "CORE ARTIFACT"}</h3>
                    </div>
                    <p className="text-[10px] uppercase font-bold text-[var(--subtext)] opacity-70 mb-4 leading-relaxed relative z-10">
                      {t("core_artifact_desc") || "SELECT THE PRIMARY ARTIFACT THAT DEFINES THIS NODE. TWINS AND ADDONS WILL INHERIT STATE FROM THIS CORE."}
                    </p>
                    <div className="relative z-10">
                      <CustomDropdown
                        disableTint={true}
                        value={targetSet.archetypes?.core || ""}
                        options={[
                          { id: "", label: t("no_core_selected") || "NO CORE SELECTED" },
                          ...targetSet.items.map((hash: string) => {
                            const art = displayModList.find((m: any) => m.hash === hash);
                            return { id: hash, label: art ? (art.displayName || art.name) : hash };
                          })
                        ]}
                        onChange={(val: any) => {
                          const coreVal = Array.isArray(val) ? val[0] : val;
                          const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, archetypes: { ...s.archetypes, core: coreVal } } : s);
                          localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                          setUpdateTrigger(prev => prev + 1);
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-6 theme-glass-inner rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[var(--success)]">fork_right</span>
                      <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t("twin_artifacts") || "TWIN ARTIFACTS"}</h3>
                    </div>
                    <p className="text-[10px] uppercase font-bold text-[var(--subtext)] opacity-70 mb-4 leading-relaxed">
                      {t("twin_artifacts_desc") || "TWINS ARE INSEPARABLE COMPONENTS OF THE CORE. THEY ARE ALWAYS ACTIVE WHEN THE CORE IS ACTIVE."}
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {targetSet.items.filter((h: string) => h !== targetSet.archetypes?.core).map((hash: string) => {
                        const art = displayModList.find((m: any) => m.hash === hash);
                        const isTwin = targetSet.archetypes?.twins?.includes(hash);

                        return (
                          <button
                            key={hash}
                            onClick={() => {
                              const currentTwins = targetSet.archetypes?.twins || [];
                              const newTwins = isTwin ? currentTwins.filter((h: string) => h !== hash) : [...currentTwins, hash];
                              const newAddons = (targetSet.archetypes?.addons || []).filter((h: string) => h !== hash);

                              const newArch = { ...targetSet.archetypes, twins: newTwins, addons: newAddons };
                              const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, archetypes: newArch } : s);
                              localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                              setUpdateTrigger(prev => prev + 1);
                            }}
                            className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${isTwin ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[var(--success)]' : 'bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-white/5 hover:border-white/20'}`}
                          >
                            <span className={`material-symbols-outlined !text-[16px] ${isTwin ? 'text-[var(--success)]' : 'opacity-30'}`}>
                              {isTwin ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest truncate flex-1">
                              {art ? (art.displayName || art.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "") : hash}
                            </span>
                          </button>
                        )
                      })}
                      {targetSet.items.length <= 1 && (
                        <div className="col-span-2 text-[10px] font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest p-4 text-center">
                          {t("add_more_items") || "ADD MORE ARTIFACTS TO ASSIGN TWINS"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6 theme-glass-inner rounded-2xl border border-white/5 relative overflow-hidden mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[var(--warning)]">extension</span>
                      <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t("addon_artifacts") || "ADDON ARTIFACTS"}</h3>
                    </div>
                    <p className="text-[10px] uppercase font-bold text-[var(--subtext)] opacity-70 mb-4 leading-relaxed">
                      {t("addon_artifacts_desc") || "ADDONS ARE OPTIONAL EXTENSIONS. THEY REQUIRE THE CORE TO BE ACTIVE, BUT THE CORE DOES NOT REQUIRE THEM."}
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {targetSet.items.filter((h: string) => h !== targetSet.archetypes?.core).map((hash: string) => {
                        const art = displayModList.find((m: any) => m.hash === hash);
                        const isAddon = targetSet.archetypes?.addons?.includes(hash);

                        return (
                          <button
                            key={hash}
                            onClick={() => {
                              const currentAddons = targetSet.archetypes?.addons || [];
                              const newAddons = isAddon ? currentAddons.filter((h: string) => h !== hash) : [...currentAddons, hash];
                              const newTwins = (targetSet.archetypes?.twins || []).filter((h: string) => h !== hash);

                              const newArch = { ...targetSet.archetypes, twins: newTwins, addons: newAddons };
                              const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, archetypes: newArch } : s);
                              localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                              setUpdateTrigger(prev => prev + 1);
                            }}
                            className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${isAddon ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[var(--warning)]' : 'bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-white/5 hover:border-white/20'}`}
                          >
                            <span className={`material-symbols-outlined !text-[16px] ${isAddon ? 'text-[var(--warning)]' : 'opacity-30'}`}>
                              {isAddon ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest truncate flex-1">
                              {art ? (art.displayName || art.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "") : hash}
                            </span>
                          </button>
                        )
                      })}
                      {targetSet.items.length <= 1 && (
                        <div className="col-span-2 text-[10px] font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest p-4 text-center">
                          {t("add_more_items") || "ADD MORE ARTIFACTS TO ASSIGN ADDONS"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </SidePanel>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[120000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in">
          <div className="theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-[2rem] p-8 max-w-md w-full shadow-[0_20px_60px_rgba(var(--danger-rgb),0.2)] flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[var(--danger)] opacity-10 blur-[50px] rounded-full pointer-events-none" />

            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-[var(--danger)]">warning</span>
              </div>
              <div className="flex flex-col">
                <h3 className="text-[14px] font-black uppercase text-[var(--text)] tracking-widest">{t("local_folders_delete")}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-80 mt-1">{t("btn_confirm_delete")}</p>
              </div>
            </div>

            <div className="flex gap-3 mt-2 relative z-10">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-12 rounded-xl theme-glass-inner border border-white/10 hover:border-white/30 text-[10px] font-black uppercase tracking-widest text-[var(--text)] transition-all"
              >
                {t("btn_cancel")}
              </button>
              <button
                onClick={() => {
                  const updatedSets = localSets.filter((s: any) => s.id !== target);
                  localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                  setConfirmDeleteId(null);
                  setIsLocalFolderEditorOpen(false);
                  runRadarSweep(true);
                }}
                className="flex-1 h-12 rounded-xl bg-[var(--danger)] text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_0_20px_rgba(var(--danger-rgb),0.3)]"
              >
                {t("btn_delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
