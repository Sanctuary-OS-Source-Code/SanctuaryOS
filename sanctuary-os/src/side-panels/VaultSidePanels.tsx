import React from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidebarActionButton, CustomDropdown, getFileLabel, isSupportedExtension, formatDisplayName, HoverTooltip, HubTabs, ActionButton, getModIcon, SearchBar, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useStore } from "../store";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup } from "../components/universal/UniversalLayout";

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
      iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
    >
      <div className="flex flex-col gap-6">
        {playSets && playSets.length > 0 && (
          <div className="flex flex-col gap-4 pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_layers")}</span>
              <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--subtext)]">{t("type_blueprint")}</h3>
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
                className="h-10 px-4 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] text-[10px] font-black capitalize tracking-widest transition-all flex items-center gap-2 shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span> {t("auto_save")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined !text-[18px] text-[var(--text)]">{t("icon_bolt")}</span>
            <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--subtext)]">{t("sidebar_actions")}</h3>
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
          const localSets = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
          if (localSets.length === 0) return null;

          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_folder")}</span>
                <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--subtext)]">{t("local_folders")}</h3>
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
                  className="h-10 px-4 rounded-xl glass-surface text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-white transition-all flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
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
  const [updateTrigger, setUpdateTrigger] = React.useState(0);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);

  const localSets = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
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
        widthClass="w-[600px]"
        backdropZ="z-[115000]"
        panelZ="z-[115001]"

        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={deleteConfirm ? "warning" : "delete"}
              tooltip={deleteConfirm ? t("btn_confirm_delete") : t("local_folders_delete")}
              variant="danger"
              onClick={() => {
                if (deleteConfirm) {
                  const updatedSets = localSets.filter((s: any) => s.id !== target);
                  localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                  setDeleteConfirm(false);
                  setIsLocalFolderEditorOpen(false);
                } else {
                  setDeleteConfirm(true);
                  setTimeout(() => setDeleteConfirm(false), 3000);
                }
              }}
            />
            <PanelHeaderButton
              icon="check"
              tooltip={t("btn_done")}
              variant="accent"
              onClick={() => {
                if (deleteConfirm) setDeleteConfirm(false);
                else setIsLocalFolderEditorOpen(false);
              }}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-6 w-full pb-24">
          <div className="px-4 py-2 shrink-0 flex flex-col gap-4 relative z-50">
            {/* TOP RENAME INPUT (GLASSY) */}
            <div className="flex items-center w-full overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm h-12 shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md">
              <div className="relative flex-1 h-full flex items-center">
                <span className={`absolute left-4 opacity-50 text-[18px] material-symbols-outlined pointer-events-none ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--success)]'}`}>
                  {typeIcon}
                </span>
                <input
                  value={renameFolderInput === "" ? targetSet.name : renameFolderInput}
                  onChange={(e) => setRenameFolderInput(e.target.value)}
                  onBlur={() => {
                    const val = renameFolderInput === "" ? targetSet.name : renameFolderInput;
                    if (val.trim() && val.trim() !== targetSet.name) {
                      const updated = localSets.map((s: any) => s.id === target ? { ...s, name: val.trim() } : s);
                      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updated));
                      setRenameFolderInput("");
                      runRadarSweep(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="w-full h-full bg-transparent border-none outline-none px-4 pl-12 text-[10px] font-black capitalize tracking-[0.2em] text-[var(--text)]"
                  placeholder={targetSet.isCollection ? t("ph_collection_name") : t("ph_folder_name")}
                />
              </div>
              <button
                onClick={() => {
                  const updated = localSets.map((s: any) => s.id === target ? { ...s, isCollection: !s.isCollection } : s);
                  localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updated));
                  runRadarSweep(true);
                }}
                className={`h-full px-6 text-[10px] font-black capitalize tracking-widest transition-all flex items-center justify-center gap-2 shrink-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--success)]'}`}
              >
                <span className="material-symbols-outlined text-[16px]">{typeIcon}</span>
                {targetSet.isCollection ? t('collection') : t('folder')}
              </button>
            </div>
            
            {/* UNIFIED SEARCH BAR */}
            <div className="relative shrink-0 w-full z-[60]">
              <SearchBar
                value={searchToAdd}
                onChange={setSearchToAdd}
                placeholder={t("btn_search")}
              />
              
              {/* SEARCH RESULTS POPOVER */}
              {searchToAdd.trim() !== "" && (
                <div className="absolute top-full left-0 right-0 mt-3 max-h-80 bg-[color-mix(in_srgb,var(--panel)_95%,transparent)] backdrop-blur-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl shadow-2xl overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 z-[100]">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-[var(--subtext)] text-[10px] capitalize font-black tracking-widest opacity-50">No Results Found</div>
                  ) : (
                    Array.from(new Map(searchResults.map((m: any) => [m.hash, m])).values()).slice(0, 50).map((m: any) => {
                      const isAdded = targetSet.items.includes(m.hash);
                      if (isAdded) return null;

                      return (
                        <UniversalCard
                          key={m.hash}
                          layout="compact"
                          image={m.image_url || m.imageUrl}
                          icon={getModIcon(m, activeGameSchema, t)}
                          title={formatDisplayName(m.displayName || m.name)}
                          className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                          actions={
                            targetSet.isCollection ? (
                              <button
                                onClick={() => {
                                  const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash] } : s);
                                  localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                  setSearchToAdd("");
                                  setUpdateTrigger(prev => prev + 1);
                                }}
                                className="h-8 px-3 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black transition-all flex items-center justify-center gap-1 shrink-0 text-[9px] font-black capitalize tracking-widest border border-transparent hover:border-black/20 relative group/actionbtn"
                              >
                                <span className="material-symbols-outlined !text-[14px]">add</span> {t("ql_add")}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, core: m.hash };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all shadow-sm bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">stars</span>
                                  <HoverTooltip title={t("editor_core")} variant="accent" className="z-[200] !right-0 !left-auto !translate-x-0" />
                                </button>
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, twins: [...(targetSet.archetypes?.twins || []), m.hash] };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[var(--success)] hover:text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-all shadow-sm bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">join_inner</span>
                                  <HoverTooltip title={t("editor_twin")} variant="success" className="z-[200] !right-0 !left-auto !translate-x-0" />
                                </button>
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, addons: [...(targetSet.archetypes?.addons || []), m.hash] };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[var(--warning)] hover:text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all shadow-sm bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">extension</span>
                                  <HoverTooltip title={t("editor_addon")} variant="warning" className="z-[200] !right-0 !left-auto !translate-x-0" />
                                </button>
                              </div>
                            )
                            }
                          />
                        );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="px-4 flex flex-col gap-6 relative z-10">
            <div className="flex items-center justify-start pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined !text-[18px] opacity-70 ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--success)]'}`}>{targetSet.isCollection ? 'category' : 'inventory_2'}</span>
                <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--subtext)]">{targetSet.isCollection ? (t("collection_contents")) : (t("folder_logic"))} ({targetSet.items.length})</h3>
              </div>
            </div>

            {targetSet.items.length === 0 ? (
              <div className="w-full h-32 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50 border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <span className="material-symbols-outlined mb-2 opacity-50">inventory_2</span>
                <span className="text-[10px] font-black capitalize tracking-widest">{t("empty_folder")}</span>
              </div>
            ) : targetSet.isCollection ? (
                  // ==============================
                  // MODE 1: COLLECTION LIST
                  // ==============================
                  <div className="grid grid-cols-2 gap-4">
                    {targetSet.items.map((hash: string) => {
                      const art = displayModList.find((m: any) => m.hash === hash);
                      if (!art) return null;
                      return (
                        <UniversalCard
                          key={hash}
                          layout="vertical-compact"
                          image={art.image_url || art.imageUrl}
                          icon={!art.image_url && !art.imageUrl ? getModIcon(art, activeGameSchema, t) : undefined}
                          title={formatDisplayName(art.displayName || art.name)}
                          className="bg-black/20 hover:bg-white/5 border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all h-[250px]"
                          actions={
                            <div className="absolute top-2 right-2 pointer-events-auto z-50">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems } : s);
                                    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[var(--danger)] hover:text-white transition-all flex items-center justify-center border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-sm"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">close</span>
                                </button>
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  // ==============================
                  // MODE 2: FOLDER BUCKETS
                  // ==============================
                  <div className="flex flex-col gap-8">
                    
                    {/* BUCKET: CORE */}
                    <UniversalGroup
                      title={t("editor_core_artifact")}
                      icon="stars"
                      headerColorClass="text-[var(--accent)]"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {targetSet.archetypes?.core ? (() => {
                          const hash = targetSet.archetypes.core;
                          const art = displayModList.find((m: any) => m.hash === hash);
                          if (!art) return null;
                          return (
                            <UniversalCard
                              layout="vertical-compact"
                              isActive={true}
                              image={art.image_url || art.imageUrl}
                              icon={!art.image_url && !art.imageUrl ? getModIcon(art, activeGameSchema, t) : undefined}
                              title={formatDisplayName(art.displayName || art.name)}
                              className="bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all h-[250px]"
                              actions={
                                <div className="absolute top-2 right-2 pointer-events-auto z-50">
                                    <button onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const updatedArch = { ...targetSet.archetypes, core: undefined };
                                      const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                      const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                                      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                      setUpdateTrigger(prev => prev + 1);
                                    }} className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm">
                                      <span className="material-symbols-outlined !text-[16px]">close</span>
                                    </button>
                                </div>
                              }
                            />
                          );
                        })() : (
                          <div className="col-span-2 w-full p-4 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[10px] font-black capitalize tracking-widest text-center">
                            {t("editor_no_core_selected")}
                          </div>
                        )}
                      </div>
                    </UniversalGroup>

                    {/* BUCKET: TWINS */}
                    <UniversalGroup
                      title={t("twin_artifacts")}
                      icon="join_inner"
                      headerColorClass="text-[var(--success)]"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {(!targetSet.archetypes?.twins || targetSet.archetypes.twins.length === 0) && (
                           <div className="col-span-2 w-full p-3 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] text-[9px] font-black capitalize tracking-widest text-center">EMPTY</div>
                        )}
                        {(targetSet.archetypes?.twins || []).map((hash: string) => {
                          const art = displayModList.find((m: any) => m.hash === hash);
                          if (!art) return null;
                          return (
                            <UniversalCard
                              key={hash}
                              layout="vertical-compact"
                              image={art.image_url || art.imageUrl}
                              icon={!art.image_url && !art.imageUrl ? getModIcon(art, activeGameSchema, t) : undefined}
                              title={formatDisplayName(art.displayName || art.name)}
                              className="bg-[color-mix(in_srgb,var(--success)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-lg hover:shadow-[0_0_20px_rgba(var(--success-rgb),0.15)] transition-all h-[250px]"
                              actions={
                                <div className="absolute top-2 right-2 pointer-events-auto z-50">
                                    <button onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const updatedArch = { ...targetSet.archetypes, twins: targetSet.archetypes.twins.filter((h: string) => h !== hash) };
                                      const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                      const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                                      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                      setUpdateTrigger(prev => prev + 1);
                                    }} className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm">
                                      <span className="material-symbols-outlined !text-[16px]">close</span>
                                    </button>
                                </div>
                              }
                            />
                          );
                        })}
                      </div>
                    </UniversalGroup>

                    {/* BUCKET: ADDONS */}
                    <UniversalGroup
                      title={t("addon_artifacts")}
                      icon="extension"
                      headerColorClass="text-[var(--warning)]"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {(!targetSet.archetypes?.addons || targetSet.archetypes.addons.length === 0) && (
                           <div className="col-span-2 w-full p-3 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] text-[9px] font-black capitalize tracking-widest text-center">EMPTY</div>
                        )}
                        {(targetSet.archetypes?.addons || []).map((hash: string) => {
                          const art = displayModList.find((m: any) => m.hash === hash);
                          if (!art) return null;
                          return (
                            <UniversalCard
                              key={hash}
                              layout="vertical-compact"
                              image={art.image_url || art.imageUrl}
                              icon={!art.image_url && !art.imageUrl ? getModIcon(art, activeGameSchema, t) : undefined}
                              title={formatDisplayName(art.displayName || art.name)}
                              className="bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-lg hover:shadow-[0_0_20px_rgba(var(--warning-rgb),0.15)] transition-all h-[250px]"
                              actions={
                                <div className="absolute top-2 right-2 pointer-events-auto z-50">
                                    <button onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const updatedArch = { ...targetSet.archetypes, addons: targetSet.archetypes.addons.filter((h: string) => h !== hash) };
                                      const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                      const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                                      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                      setUpdateTrigger(prev => prev + 1);
                                    }} className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm">
                                      <span className="material-symbols-outlined !text-[16px]">close</span>
                                    </button>
                                </div>
                              }
                            />
                          );
                        })}
                      </div>
                    </UniversalGroup>

                  </div>
                )}
            <div className="h-24 shrink-0 pointer-events-none" />
          </div>
        </div>
      </SidePanel>
    </>
  );
}


