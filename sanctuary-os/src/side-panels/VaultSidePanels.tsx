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
  const [updateTrigger, setUpdateTrigger] = React.useState(0);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);

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
        widthClass="w-[600px]"
        backdropZ="z-[115000]"
        panelZ="z-[115001]"

        footer={
          <SidePanelActionFooter
            actionLabel={deleteConfirm ? (t("btn_confirm_delete") || "CONFIRM DELETION") : t("local_folders_delete")}
            actionIcon={deleteConfirm ? "warning" : "delete"}
            onAction={() => {
              if (deleteConfirm) {
                const updatedSets = localSets.filter((s: any) => s.id !== target);
                localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                setDeleteConfirm(false);
                setIsLocalFolderEditorOpen(false);
              } else {
                setDeleteConfirm(true);
                setTimeout(() => setDeleteConfirm(false), 3000);
              }
            }}
            actionVariant="danger"
            cancelLabel={t("btn_done") || "DONE"}
            onCancel={() => {
              if (deleteConfirm) setDeleteConfirm(false);
              else setIsLocalFolderEditorOpen(false);
            }}
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

          {/* DUAL MODE WORKSPACE */}
          <div className="flex-1 flex flex-col min-h-0 mt-2 relative gap-4">
            
            {/* UNIFIED SEARCH BAR */}
            <div className="relative shrink-0 z-50">
              <input
                value={searchToAdd}
                onChange={(e) => setSearchToAdd(e.target.value)}
                placeholder={t("btn_search") || "SEARCH TO INJECT..."}
                className="w-full h-14 theme-glass-inner border border-white/10 hover:border-white/20 rounded-2xl px-6 pl-14 text-[12px] uppercase tracking-widest font-black text-[var(--text)] focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 focus:outline-none bg-black/40 shadow-inner"
              />
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-[20px]">search</span>
              
              {/* SEARCH RESULTS POPOVER */}
              {searchToAdd.trim() !== "" && (
                <div className="absolute top-full left-0 right-0 mt-3 max-h-80 bg-[#16161a]/85 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.9)] overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 z-50 ring-1 ring-white/10">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-[var(--subtext)] text-[10px] uppercase font-black tracking-widest opacity-50">No Results Found</div>
                  ) : (
                    Array.from(new Map(searchResults.map((m: any) => [m.hash, m])).values()).slice(0, 50).map((m: any) => {
                      const isAdded = targetSet.items.includes(m.hash);
                      if (isAdded) return null;

                      return (
                        <div key={m.hash} className="w-full theme-glass-inner p-2 rounded-lg flex items-center justify-between gap-3 hover:bg-white/5 transition-all">
                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded border border-white/10 bg-black/40 shrink-0 overflow-hidden flex items-center justify-center">
                              {m.image_url || m.imageUrl ? (
                                <img src={m.image_url || m.imageUrl} className="w-full h-full object-cover" />
                              ) : (
                                <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-50">{getModIcon(m, activeGameSchema, t)}</span>
                              )}
                            </div>
                            <span className="text-[10px] font-black text-[var(--text)] uppercase truncate tracking-[0.1em]">{formatDisplayName(m.displayName || m.name)}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {targetSet.isCollection ? (
                              <button
                                onClick={() => {
                                  const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash] } : s);
                                  localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                  setSearchToAdd("");
                                  setUpdateTrigger(prev => prev + 1);
                                }}
                                className="h-7 px-3 rounded border border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)] hover:text-black text-[9px] font-black uppercase tracking-widest transition-all"
                              >
                                {t("btn_add_node_artifact") || "INJECT"}
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, core: m.hash };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="h-8 px-3 rounded-lg border border-white/10 text-[var(--subtext)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                >
                                  {t("editor_core") || "CORE"}
                                </button>
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, twins: [...(targetSet.archetypes?.twins || []), m.hash] };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="h-8 px-3 rounded-lg border border-white/10 text-[var(--subtext)] hover:border-[var(--success)] hover:text-[var(--success)] hover:bg-[var(--success)]/10 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                >
                                  {t("editor_twin") || "TWIN"}
                                </button>
                                <button
                                  onClick={() => {
                                    const updatedArch = { ...targetSet.archetypes, addons: [...(targetSet.archetypes?.addons || []), m.hash] };
                                    const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: [...s.items, m.hash], archetypes: updatedArch } : s);
                                    localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                    setSearchToAdd("");
                                    setUpdateTrigger(prev => prev + 1);
                                  }}
                                  className="h-8 px-3 rounded-lg border border-white/10 text-[var(--subtext)] hover:border-[var(--warning)] hover:text-[var(--warning)] hover:bg-[var(--warning)]/10 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                >
                                  {t("editor_addon") || "ADDON"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-h-0 theme-glass-panel rounded-2xl overflow-hidden border border-white/10 bg-black/20 shadow-lg relative">
              <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined !text-[18px] opacity-50 ${targetSet.isCollection ? 'text-[var(--accent)]' : 'text-[var(--success)]'}`}>{targetSet.isCollection ? 'category' : 'inventory_2'}</span>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{targetSet.isCollection ? (t("collection_contents") || "COLLECTION CONTENTS") : (t("folder_logic") || "FOLDER LOGIC")} ({targetSet.items.length})</h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
                {targetSet.items.length === 0 ? (
                  <div className="w-full h-32 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50 border border-dashed border-white/10 rounded-2xl bg-white/5">
                    <span className="material-symbols-outlined !text-[32px] mb-2 opacity-50">inventory_2</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t("empty_folder") || "THIS NODE IS EMPTY"}</span>
                  </div>
                ) : targetSet.isCollection ? (
                  // ==============================
                  // MODE 1: COLLECTION LIST
                  // ==============================
                  <div className="flex flex-col gap-2">
                    {targetSet.items.map((hash: string) => {
                      const art = displayModList.find((m: any) => m.hash === hash);
                      if (!art) return null;
                      return (
                        <div key={hash} className="w-full theme-glass-panel bg-white/5 p-3 rounded-xl flex items-center justify-between gap-4 group/item border border-white/10 hover:border-white/30 transition-all shadow-lg">
                          <div className="flex flex-1 items-center gap-4 min-w-0">
                            <div className="w-8 h-8 rounded border border-white/20 bg-black/20 shrink-0 overflow-hidden flex items-center justify-center">
                              {art.image_url || art.imageUrl ? (
                                <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" />
                              ) : (
                                <span className={`material-symbols-outlined !text-[16px] text-[var(--accent)] opacity-50`}>{getModIcon(art, activeGameSchema, t)}</span>
                              )}
                            </div>
                            <span className="text-[10px] font-black text-[var(--text)] uppercase truncate tracking-[0.1em]">{formatDisplayName(art.displayName || art.name)}</span>
                          </div>
                          <button
                            onClick={() => {
                              const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                              const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems } : s);
                              localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                              setUpdateTrigger(prev => prev + 1);
                            }}
                            className="w-7 h-7 rounded text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-all flex items-center justify-center border border-transparent hover:border-[var(--danger)]/50"
                          >
                            <span className="material-symbols-outlined !text-[14px]">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // ==============================
                  // MODE 2: FOLDER BUCKETS
                  // ==============================
                  <div className="flex flex-col gap-8">
                    
                    {/* BUCKET: CORE */}
                    <div className="flex flex-col gap-4 bg-black/20 border border-white/5 rounded-2xl p-5 relative">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">stars</span> {t("editor_core_artifact") || "CORE ARTIFACT"}</h4>
                      {targetSet.archetypes?.core ? (() => {
                        const hash = targetSet.archetypes.core;
                        const art = displayModList.find((m: any) => m.hash === hash);
                        if (!art) return null;
                        return (
                          <div className="w-full theme-glass-inner bg-white/5 border border-[var(--accent)]/30 p-3 rounded-xl flex items-center justify-between gap-4 hover:border-[var(--accent)]/60 transition-all group">
                            <div className="flex flex-1 items-center gap-4 min-w-0">
                              <div className="w-10 h-10 rounded border border-white/10 bg-black/40 shrink-0 overflow-hidden flex items-center justify-center">
                                {art.image_url || art.imageUrl ? <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] opacity-50">{getModIcon(art, activeGameSchema, t)}</span>}
                              </div>
                              <span className="text-[11px] font-black text-[var(--accent)] uppercase truncate tracking-[0.1em]">{formatDisplayName(art.displayName || art.name)}</span>
                            </div>
                            <button onClick={() => {
                              const updatedArch = { ...targetSet.archetypes, core: undefined };
                              const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                              const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                              localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                              setUpdateTrigger(prev => prev + 1);
                            }} className="w-8 h-8 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="material-symbols-outlined !text-[16px]">close</span>
                            </button>
                          </div>
                        );
                      })() : (
                        <div className="w-full p-4 rounded-xl border border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)]/50 text-[10px] font-black uppercase tracking-widest text-center">
                          {t("editor_no_core_selected") || "NO CORE ASSIGNED"}
                        </div>
                      )}
                    </div>

                    {/* BUCKET: TWINS */}
                    <div className="flex flex-col gap-4 bg-black/20 border border-white/5 rounded-2xl p-5 relative">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--success)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">join_inner</span> {t("twin_artifacts") || "TWIN ARTIFACTS"}</h4>
                      <div className="flex flex-col gap-2">
                        {(!targetSet.archetypes?.twins || targetSet.archetypes.twins.length === 0) && (
                           <div className="w-full p-3 rounded-xl border border-dashed border-white/10 text-[var(--subtext)]/50 text-[9px] font-black uppercase tracking-widest text-center">EMPTY</div>
                        )}
                        {(targetSet.archetypes?.twins || []).map((hash: string) => {
                          const art = displayModList.find((m: any) => m.hash === hash);
                          if (!art) return null;
                          return (
                            <div key={hash} className="w-full theme-glass-inner bg-white/5 border border-[var(--success)]/30 p-2 rounded-xl flex items-center justify-between gap-3 hover:border-[var(--success)]/60 transition-all group">
                              <div className="flex flex-1 items-center gap-3 min-w-0">
                                <span className="text-[10px] font-black text-[var(--text)] uppercase truncate tracking-[0.1em]">{formatDisplayName(art.displayName || art.name)}</span>
                              </div>
                              <button onClick={() => {
                                const updatedArch = { ...targetSet.archetypes, twins: targetSet.archetypes.twins.filter((h: string) => h !== hash) };
                                const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                                localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                setUpdateTrigger(prev => prev + 1);
                              }} className="w-7 h-7 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="material-symbols-outlined !text-[14px]">close</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* BUCKET: ADDONS */}
                    <div className="flex flex-col gap-4 bg-black/20 border border-white/5 rounded-2xl p-5 relative">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--warning)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">extension</span> {t("addon_artifacts") || "ADDON ARTIFACTS"}</h4>
                      <div className="flex flex-col gap-2">
                        {(!targetSet.archetypes?.addons || targetSet.archetypes.addons.length === 0) && (
                           <div className="w-full p-3 rounded-xl border border-dashed border-white/10 text-[var(--subtext)]/50 text-[9px] font-black uppercase tracking-widest text-center">EMPTY</div>
                        )}
                        {(targetSet.archetypes?.addons || []).map((hash: string) => {
                          const art = displayModList.find((m: any) => m.hash === hash);
                          if (!art) return null;
                          return (
                            <div key={hash} className="w-full theme-glass-inner bg-white/5 border border-[var(--warning)]/30 p-2 rounded-xl flex items-center justify-between gap-3 hover:border-[var(--warning)]/60 transition-all group">
                              <div className="flex flex-1 items-center gap-3 min-w-0">
                                <span className="text-[10px] font-black text-[var(--text)] uppercase truncate tracking-[0.1em]">{formatDisplayName(art.displayName || art.name)}</span>
                              </div>
                              <button onClick={() => {
                                const updatedArch = { ...targetSet.archetypes, addons: targetSet.archetypes.addons.filter((h: string) => h !== hash) };
                                const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                                const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems, archetypes: updatedArch } : s);
                                localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                                setUpdateTrigger(prev => prev + 1);
                              }} className="w-7 h-7 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="material-symbols-outlined !text-[14px]">close</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidePanel>
    </>
  );
}
