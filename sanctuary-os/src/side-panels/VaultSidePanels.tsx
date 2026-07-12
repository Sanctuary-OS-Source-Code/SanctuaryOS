import React from "react";
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidebarActionButton, CustomDropdown , getFileLabel, isSupportedExtension, formatDisplayName} from "../shared";

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
        title={t("vault_tools_title")}
        subtitle={t("vault_tools_subtitle")}
        icon="tune"
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex flex-col gap-6">
           {playSets && playSets.length > 0 && (
             <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
               <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
               <div className="flex items-center gap-4 mb-6 relative z-10">
                 <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                   <span className="material-symbols-outlined !text-[20px]">{t("icon_layers")}</span>
                 </div>
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("active_blueprint")}</h3>
               </div>
               
               <div className="flex gap-2 relative z-10">
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
                   className="h-14 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2 shrink-0"
                 >
                   <span className="material-symbols-outlined !text-[18px]">{t("icon_check_circle")}</span> {t("ui_btn_save")}
                 </button>
               </div>
             </div>
           )}

           <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
             <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
             <div className="flex items-center gap-4 mb-6 relative z-10">
               <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
                 <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt")}</span>
               </div>
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("sidebar_actions")}</h3>
             </div>
             
             <div className="flex flex-col gap-3 relative z-10">
               <SidebarActionButton id="REFRESH" icon="refresh" label={t("btn_refresh")} onClick={() => { runRadarSweep(true); setIsSidePanelOpen(false); }} active={false} />
               <SidebarActionButton 
                 id="SELECT_ASSETS" 
                 icon={isBulkMode ? "cancel" : "checklist"} 
                 label={isBulkMode ? t("shared_cancel") : t("btn_select_assets")} 
                 onClick={() => { setIsBulkMode(!isBulkMode); setIsSidePanelOpen(false); }} 
                 active={isBulkMode} 
                 danger={isBulkMode}
               />
               <SidebarActionButton 
                 id="SELECT_ALL" 
                 icon="library_add_check" 
                 label={t("btn_select_all")} 
                 onClick={() => {
                   if (!isBulkMode) setIsBulkMode(true);
                   const allNames = finalVisibleMods.map((m: any) => m.name);
                   if (allNames.length > 0) {
                     const allSelected = allNames.every((n: string) => selectedMods.includes(n));
                     if (allSelected) {
                       setSelectedMods([]);
                     } else {
                       const newSelected = new Set([...selectedMods, ...allNames]);
                       setSelectedMods(Array.from(newSelected));
                     }
                   }
                   setIsSidePanelOpen(false);
                 }} 
                 active={false} 
               />
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
               <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card mt-2">
                 <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex items-center gap-4 mb-6 relative z-10">
                   <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                     <span className="material-symbols-outlined !text-[20px]">{t("icon_folder")}</span>
                   </div>
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("local_folders")}</h3>
                 </div>
                 
                 <div className="flex gap-2 relative z-10">
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
                     className="h-14 px-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-white/10 text-[var(--text)]/70 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:text-[var(--text)] font-black shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center shrink-0"
                   >
                     <span className="material-symbols-outlined !text-[18px]">{t("icon_edit")}</span>
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
  displayModList
}: any) {
  const { t } = useLexicon();
  const setIsLocalFolderEditorOpen = (val: boolean) => !val && onClose();

  return (
<SidePanel
        isOpen={isOpen}
        onClose={() => {
          setIsLocalFolderEditorOpen(false);
          setConfirmDeleteId(null);
          setRenameFolderInput("");
        }}
        title={t("local_folders_edit")}
        subtitle={t("local_folders")}
        icon="folder_managed"
        iconColorClass="theme-text-accent"
        widthClass="w-[525px]"
        backdropZ="z-[40002]"
        panelZ="z-[40003]"
        ambientGlows={
          <>
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/3 -left-32 w-96 h-96 bg-[var(--text)] opacity-10 blur-[100px] rounded-full pointer-events-none" />
          </>
        }
      >
        {(() => {
          const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
          const target = activeLocalFolder || localSets[0]?.id;
          if (!target) return null;
          const targetSet = localSets.find((s: any) => s.id === target);
          if (!targetSet) return null;
          
          return (
            <div className="flex flex-col gap-6 h-full">
              <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card shrink-0">
                 <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex flex-col gap-3 relative z-10">
                   <label className="text-[9px] font-black uppercase text-[var(--subtext)] tracking-widest pl-2 opacity-60">
                     {t("local_folders_rename_prompt")}
                   </label>
                   <div className="flex gap-2">
                     <input
                       type="text"
                       value={renameFolderInput === "" ? targetSet.name : renameFolderInput}
                       onChange={(e) => setRenameFolderInput(e.target.value)}
                       className="flex-1 h-14 bg-black/20 border border-white/10 rounded-2xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
                     />
                     <button
                       onClick={() => {
                           const val = renameFolderInput === "" ? targetSet.name : renameFolderInput;
                           if (val.trim() && val.trim() !== targetSet.name) {
                               const updated = localSets.map((s: any) => s.id === target ? { ...s, name: val.trim() } : s);
                               localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                               setRenameFolderInput("");
                               runRadarSweep(true);
                           }
                       }}
                       className="h-14 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] font-black shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center shrink-0 uppercase tracking-widest text-[10px]"
                     >
                       {t("ui_btn_save")}
                     </button>
                   </div>
                 </div>
              </div>

              <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card flex-1 flex flex-col min-h-0">
                 <div className="absolute inset-0 bg-gradient-to-tl from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
                   <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
                     <span className="material-symbols-outlined !text-[20px]">{t("icon_inventory_2")}</span>
                   </div>
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("local_folders_contents")}</h3>
                 </div>
                 
                 <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                   {targetSet.items.map((hash: string) => {
                     const art = displayModList.find((m: any) => m.hash === hash);
                     if (!art) return null;
                     return (
                       <div key={hash} className="theme-glass-inner p-3 rounded-2xl flex items-center gap-4 group/item transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 hover:theme-border-accent">
                         <div className="flex-1 flex flex-col min-w-0">
                           <span className="text-[11px] font-black text-[var(--text)] truncate uppercase">
                             {(art.displayName || art.name).replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
                           </span>
                           <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                             {art.author || t("unknown_mason") || "Unknown Mason"}
                           </span>
                         </div>
                         <button
                           onClick={() => {
                             const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                             const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems } : s);
                             localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                             runRadarSweep(true);
                           }}
                           className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border border-white/5 text-[var(--text)]/50 flex items-center justify-center shrink-0 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:text-[var(--danger)] transition-all hover:scale-110"
                         >
                           <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
                         </button>
                       </div>
                     );
                   })}
                   {targetSet.items.length === 0 && (
                     <div className="text-center py-12 opacity-50 font-bold uppercase text-[10px] tracking-widest flex flex-col items-center gap-2">
                       <span className="material-symbols-outlined !text-[24px]">{t("icon_inbox")}</span>
                       {t("local_folders_empty")}
                     </div>
                   )}
                 </div>
                 
                 <div className="pt-6 mt-2 border-t border-white/5 shrink-0 relative z-10">
                   <button
                     onClick={() => {
                       if (confirmDeleteId === target) {
                         const updated = localSets.filter((s: any) => s.id !== target);
                         localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                         if (activeLocalFolder === target) setActiveLocalFolder("");
                         setIsLocalFolderEditorOpen(false);
                         setConfirmDeleteId(null);
                         runRadarSweep(true);
                       } else {
                         setConfirmDeleteId(target);
                       }
                     }}
                     className={`w-full h-14 rounded-2xl border backdrop-blur-md font-black shadow-sm transition-all flex items-center justify-center uppercase tracking-widest text-[11px] ${confirmDeleteId === target ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] shadow-[0_0_20px_rgba(220,38,38,0.2)] animate-pulse' : 'bg-transparent border-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]/60 hover:bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}`}
                   >
                     {confirmDeleteId === target ? (t("local_folders_confirm_delete")) : (t("local_folders_delete"))}
                   </button>
                 </div>
              </div>
            </div>
          );
        })()}
      </SidePanel>
  );
}
