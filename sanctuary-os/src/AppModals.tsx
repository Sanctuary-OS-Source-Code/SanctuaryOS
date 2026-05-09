import React from 'react';
import { MissingImportsAlert } from "./MissingImportsAlert";
import { YeetConfirmAlert } from "./YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { useLexicon } from "./LexiconContext";
import { invoke } from "@tauri-apps/api/core";

export function AppModals(props: any) {
  const { t } = useLexicon();
  const {
    snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot, playSets, activePlaySetIndex,
    bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods,
    renameModal, setRenameModal, executeRename,
    renameTarget, setRenameTarget, nameInput, setNameInput, confirmRename,
    localFolderModal, setLocalFolderModal, localFolderType, setLocalFolderType, localFolderName, setLocalFolderName, createLocalFolder,
    missingImportMods, pendingImportSet, setMissingImportMods, setPendingImportSet, finalizeImport, setIsDropzoneOpen,
    confirmDialog, setConfirmDialog,
    isBulkMode, openBulk, openLocalFolder,
    isDropzoneOpen, isDragging, dropzoneState, droppedFiles, setDropzoneState, setDroppedFiles, setIsDragging, handleDroppedFiles, runRadarSweep,
    showBrokenModal, setShowBrokenModal, modList,
    showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod,
    isBackingUp, isRestoring,
    ingestProgress,
    isScanning, scanProgress,
    status,
    showDefconAlert, setShowDefconAlert, triggerFullEngineBackup, triggerPrePatchSnapshot,
    yeetConfirmPending, setYeetConfirmPending,
    dnaMatchQueue, setDnaMatchQueue, ignoredHashesRef, setStatus,
    scoutQueue, setScoutQueue, onOpenScoutDossier
  } = props;

  return (
    <>
      {snapshotModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("modal_snapshot_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_snapshot_desc1")} <span className="text-[var(--text)]">{playSets[activePlaySetIndex]?.mods?.length || 0}</span> {t("modal_snapshot_desc2")}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <input 
                  autoFocus 
                  type="text" 
                  value={snapshotName} 
                  onChange={(e) => setSnapshotName(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && executeSnapshot()} 
                  placeholder={t("modal_snapshot_placeholder")}
                  className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setSnapshotModal(false)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                    {t("playsets_btn_cancel")}
                  </button>
                  <button onClick={executeSnapshot} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("playsets_btn_save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{bulkModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("modal_bulk_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_bulk_desc1")} <span className="text-[var(--text)]">{selectedMods.length}</span> {t("modal_bulk_desc2")}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <input 
                  autoFocus 
                  type="text" 
                  value={bulkName} 
                  onChange={(e) => setBulkName(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && executeBulkDraft()} 
                  placeholder={t("playsets_draft_placeholder")}
                  className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setBulkModal(false)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                    {t("playsets_btn_cancel")}
                  </button>
                  <button onClick={executeBulkDraft} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("modal_btn_draft")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{renameModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("modal_rename_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_rename_desc")}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <input 
                  autoFocus 
                  type="text" 
                  value={renameModal.newName} 
                  onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value }) } 
                  onKeyDown={(e) => e.key === "Enter" && executeRename()} 
                  className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setRenameModal(null)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                    {t("playsets_btn_cancel")}
                  </button>
                  <button onClick={executeRename} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("modal_btn_rename")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{renameTarget && (
          <div className="fixed inset-0 z-10000 flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md theme-glass-panel border theme-border-accent rounded-[2rem] p-8 shadow-2xl">
              <h3 className="text-xs font-black tracking-[0.3em] theme-text-accent uppercase mb-6 flex items-center gap-2"><span className="w-2 h-2 theme-bg-accent rounded-full animate-pulse"></span>{t("modal_redesignate_title")}</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--text)]/40 uppercase tracking-widest ml-1">{t("modal_redesignate_label")}</label>
                  <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setRenameTarget(null)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-[var(--text)]/60 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all">{t("modal_btn_abort")}</button>
                  <button onClick={confirmRename} className="flex-1 px-4 py-3 rounded-xl theme-bg-accent text-[var(--bg)] text-[10px] font-bold uppercase tracking-widest hover:opacity-90 shadow-lg transition-all">{t("modal_btn_confirm")}</button>
                </div>
              </div>
            </div>
          </div>
        )}{localFolderModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-success rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-success tracking-tighter mb-1">{t("modal_local_folder_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_local_folder_desc")}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner mb-2">
                  <button onClick={() => setLocalFolderType("FOLDER")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "FOLDER" ? 'theme-bg-success text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("dossier_folder")}</button>
                  <button onClick={() => setLocalFolderType("CC_SET")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "CC_SET" ? 'theme-bg-accent text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("dossier_cc_set")}</button>
                </div>
                <input 
                  autoFocus 
                  type="text" 
                  value={localFolderName} 
                  onChange={(e) => setLocalFolderName(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && createLocalFolder()} 
                  placeholder={localFolderType === "CC_SET" ? "CC Set Name..." : "Folder Name..."}
                  className={`w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none transition-all ${localFolderType === "CC_SET" ? 'focus:theme-border-accent' : 'focus:theme-border-success'}`} 
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setLocalFolderModal(false)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                    {t("playsets_btn_cancel")}
                  </button>
                  <button onClick={createLocalFolder} className="flex-1 py-3 theme-bg-success text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("modal_btn_create_folder")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{(missingImportMods && missingImportMods.length > 0) && pendingImportSet && (
          <MissingImportsAlert 
            missingImportMods={missingImportMods} setMissingImportMods={setMissingImportMods} pendingImportSet={pendingImportSet} setPendingImportSet={setPendingImportSet} finalizeImport={finalizeImport} setIsDropzoneOpen={setIsDropzoneOpen}
          />
        )}{confirmDialog && (
          <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl">
            {confirmDialog.isDefcon ? (
              <div className="w-full max-w-2xl bg-red-950/40 border border-red-500/50 rounded-[3rem] p-12 text-center flex flex-col items-center gap-8 shadow-[0_0_150px_rgba(255,0,0,0.4)] animate-in zoom-in-95 duration-200">
                 <span className="text-8xl animate-bounce"></span>
                 <div className="flex flex-col gap-2">
                    <h2 className="text-4xl font-black text-red-500 tracking-tighter uppercase">{confirmDialog.title || "GLOBAL ALERT"}</h2>
                    <h3 className="text-xl font-bold text-red-300 uppercase tracking-widest whitespace-pre-line leading-relaxed">{confirmDialog.message}</h3>
                 </div>
                 <div className="flex gap-4 w-full mt-4">
                    <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className="flex-1 py-4 bg-red-500 hover:bg-red-400 text-black border-none rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(255,0,0,0.5)]">{confirmDialog.confirmText || t("modal_btn_proceed")}</button>
                    <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="flex-1 py-4 bg-transparent text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-xl font-black text-sm uppercase tracking-widest transition-all">{confirmDialog.cancelText || t("playsets_btn_cancel")}</button>
                 </div>
              </div>
            ) : (
              <div className={`bg-[var(--sidebar)] p-8 rounded-2xl border-2 w-[400px] shadow-2xl flex flex-col gap-6 text-center ${confirmDialog.isAlert ? "border-[var(--warning)]" : "border-[var(--danger)]"}`}>
                <h3 className="text-[var(--text)] m-0 font-black tracking-tight whitespace-pre-line">{confirmDialog.message}</h3>
                <div className="flex gap-3 justify-center">
                  {confirmDialog.isAlert ? (
                    <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className="px-5 py-2.5 bg-[var(--warning)] text-[var(--sidebar)] border-none rounded font-black flex-1 uppercase tracking-widest">{confirmDialog.confirmText || t("modal_btn_ok")}</button>
                  ) : (
                    <>
                      <button onClick={confirmDialog.action} className="px-5 py-2.5 bg-[var(--danger)] text-[var(--bg)] border-none rounded font-black flex-1 uppercase tracking-widest">{confirmDialog.confirmText || t("modal_btn_proceed")}</button>
                      <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="px-5 py-2.5 bg-transparent text-[var(--text)] border border-[var(--text)] rounded font-black flex-1 uppercase tracking-widest">{confirmDialog.cancelText || t("playsets_btn_cancel")}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}{isBulkMode && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[3000] bg-[var(--bg)]/60 backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10">
          <span className="text-[var(--text)] font-black text-xs tracking-widest">{selectedMods.length} SELECTED</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => setBulkModal(true)} disabled={selectedMods.length === 0} className="text-[10px] font-black theme-text-accent uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50">{t("status_draft_blueprint")}</button>
          <button onClick={() => setLocalFolderModal(true)} disabled={selectedMods.length === 0} className="text-[10px] font-black theme-text-success uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50">{t("vault_btn_group_folder")}</button>
        </div>
      )}{(isDropzoneOpen || isDragging) && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-2xl p-10 animate-in fade-in zoom-in-95 duration-300">
           <div 
             className={`w-full max-w-4xl h-full max-h-[600px] border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center relative transition-all group ${dropzoneState === 'received' ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_100px_rgba(16,185,129,0.1)]' : (isDragging ? 'bg-white/10 border-[var(--accent)] shadow-[0_0_100px_rgba(37,99,235,0.2)] scale-[1.02]' : 'bg-white/5 border-white/20 hover:border-[var(--accent)] hover:shadow-[0_0_100px_rgba(37,99,235,0.1)]')}`}
           >
              <button onClick={() => { setIsDropzoneOpen(false); setDropzoneState("awaiting"); setDroppedFiles([]); setIsDragging(false); }} className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center text-[var(--text)]/50 hover:text-[var(--text)] bg-black/20 hover:theme-bg-danger rounded-full transition-all text-xl z-50">✕</button>
              {dropzoneState === "awaiting" ? (
                <>
                  <span className="text-[100px] mb-8 group-hover:scale-110 transition-transform drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"></span>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-[var(--text)] mb-3 text-center">{t("dropzone_awaiting_title")}</h2>
                  <p className="text-[var(--subtext)] opacity-80 font-bold uppercase tracking-widest text-[11px] text-center max-w-md leading-relaxed">
                    {t("dropzone_awaiting_desc1")}<span className="text-[var(--text)]">.package</span>{t("dropzone_awaiting_desc2")}<span className="text-[var(--text)]">.ts4script</span>{t("dropzone_awaiting_desc3")}<span className="text-[var(--text)]">.zip</span>{t("dropzone_awaiting_desc4")}
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 w-full px-12">
                  <span className="text-[80px] mb-6 drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]"></span>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-emerald-400 mb-2">{t("dropzone_secured_title")}</h2>
                  <p className="text-emerald-400/50 font-black uppercase tracking-widest text-[10px] text-center max-w-md mb-6">
                    {droppedFiles.length > 0 ? `${t("dropzone_secured_desc_prefix")}${droppedFiles.length}${t("dropzone_secured_desc_suffix")}` : t("dropzone_secured_desc_empty")}
                  </p>
                  {droppedFiles.length > 0 && (
                    <div className="w-full max-w-2xl theme-glass-inner rounded-2xl p-4 mb-8 overflow-y-auto max-h-40 custom-scrollbar">
                      {droppedFiles.map((f: any, i: number) => (
                        <div key={i} className="text-xs font-bold text-[var(--text)]/70 py-2 border-b border-white/5 last:border-0 truncate">{f}</div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-4">
                    {dropzoneState === "ingesting" ? (
                      <div className="px-8 py-5 theme-bg-accent/20 text-[var(--text)] rounded-[2rem] border border-[var(--accent)]/50 shadow-lg flex flex-col items-center gap-2 min-w-[200px]">
                        <span className="text-sm font-black uppercase tracking-widest animate-pulse">INGESTING...</span>
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">{ingestProgress?.current || 0} / {ingestProgress?.total || 0} Files</span>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { handleDroppedFiles(droppedFiles); }} className="px-8 py-5 theme-bg-success text-[var(--bg)] rounded-[2rem] hover:scale-105 transition-all shadow-lg flex flex-col items-center gap-1 min-w-[200px]">
                          <span className="text-sm font-black uppercase tracking-widest">{t("dropzone_btn_yeet")}</span>
                          <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">{t("dropzone_btn_yeet_sub")}</span>
                        </button>
                        <button onClick={() => { alert(t("dropzone_alert_quarantine")); setIsDropzoneOpen(false); setDropzoneState("awaiting"); setDroppedFiles([]); runRadarSweep(true); }} className="px-8 py-5 theme-bg-warning text-[var(--bg)] rounded-[2rem] hover:scale-105 transition-all shadow-lg flex flex-col items-center gap-1 min-w-[200px]">
                          <span className="text-sm font-black uppercase tracking-widest">{t("dropzone_btn_quarantine")}</span>
                          <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">{t("dropzone_btn_quarantine_sub")}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
           </div>
        </div>
      )}{showBrokenModal && (
        <div className="fixed inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="theme-glass-panel border-2 theme-border-warning p-8 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col gap-6" style={{ color: 'var(--text)' }}>
            <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3"><span className="text-3xl">{t("ui_icon_warning")}</span> {t("status_broken")} {t("status_broken_detected")}</h2>
            <p className="opacity-80 font-bold text-sm">{t("broken_modal_desc")}</p>
            <div className="bg-black/20 p-4 rounded-xl max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {modList.filter((m: any) => m?.status === t("status_broken")).map((m: any) => (
                <div key={m.hash} className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono">{m.name}</div>
              ))}
              {modList.filter((m: any) => m?.status === t("status_broken")).length === 0 && (
                <div className="text-[var(--text)] text-center opacity-50 p-4 italic">{t("broken_modal_empty")}</div>
              )}
            </div>
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setShowBrokenModal(false)} className="px-8 h-12 theme-btn-standard text-[var(--text)] font-black text-xs tracking-widest rounded-2xl transition-colors">{t("radar_tier3_cancel")}</button>
            </div>
          </div>
        </div>
      )}{showQuarantineModal && (
        <div className="fixed inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="theme-glass-panel border-2 theme-border-danger p-8 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col gap-6" style={{ color: 'var(--text)' }}>
            <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3"><span className="text-3xl">{t("ui_icon_broken")}</span> Quarantine Zone</h2>
            <p className="opacity-80 font-bold text-sm">{t("quarantine_modal_desc")}</p>
            <div className="bg-black/20 p-4 rounded-xl max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {quarantineList.map((m: any) => (
                <div key={m.hash} className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono">{m.name}</div>
              ))}
              {quarantineList.length === 0 && (
                <div className="text-[var(--text)] text-center opacity-50 p-4 italic">{t("quarantine_modal_empty")}</div>
              )}
            </div>
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setShowQuarantineModal(false)} className="px-8 h-12 theme-btn-standard text-[var(--text)] font-black text-xs tracking-widest rounded-2xl transition-colors">{t("radar_tier3_cancel")}</button>
            </div>
          </div>
        </div>
      )}{isBackingUp && (
      <div className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-300">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 theme-border-success opacity-20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-[var(--success)] rounded-full animate-spin"></div>
          <div className="absolute inset-4 border-2 border-b-[var(--accent)] rounded-full animate-spin-slow"></div>
        </div>
        <h2 className="text-2xl font-black tracking-[0.2em] text-[var(--text)] uppercase mb-2">{t("overlay_sealing")}</h2>
        <p className="text-xs theme-text-success opacity-60 font-mono tracking-widest animate-pulse">{t("overlay_sealing_desc")}</p>
        <div className="mt-12 px-6 py-2 border border-white/10 rounded-full bg-white/5 text-[10px] text-[var(--text)]/40 uppercase tracking-tighter">{t("overlay_sealing_warn")}</div>
      </div>
    )}{isRestoring && (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-300">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 theme-border-accent opacity-20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-[var(--accent)] rounded-full animate-spin"></div>
          <div className="absolute inset-4 border-2 border-b-[var(--success)] rounded-full animate-spin-slow"></div>
        </div>
        <h2 className="text-2xl font-black tracking-[0.2em] text-[var(--text)] uppercase mb-2">Restoring Files</h2>
        <p className="text-xs theme-text-accent opacity-60 font-mono tracking-widest animate-pulse">EXTRACTING ARCHIVE... PLEASE WAIT</p>
        <div className="mt-12 px-6 py-2 border border-white/10 rounded-full bg-white/5 text-[10px] text-[var(--text)]/40 uppercase tracking-tighter">Large archives may take a few minutes to restore.</div>
      </div>
    )}{ingestProgress?.active && (
      <div className="fixed bottom-8 right-8 z-[9000] w-96 theme-glass-panel border border-white/10 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 theme-bg-accent opacity-5 blur-[80px]" />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <div className="relative flex shrink-0">
              <div className="absolute inset-0 theme-bg-accent opacity-30 rounded-2xl animate-ping" />
              <div className="w-14 h-14 rounded-2xl theme-glass-inner border theme-border-accent flex items-center justify-center text-3xl relative z-10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)]">
                <span className="animate-bounce">{t("ui_icon_cloud")}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-[var(--text)] font-black uppercase tracking-widest text-sm drop-shadow-md truncate">{t("overlay_uplink_title")}</h3>
              <p className="theme-text-accent font-mono text-[9px] uppercase tracking-[0.3em] animate-pulse truncate">{t("overlay_uplink_desc")}</p>
              <p className="theme-text-accent font-mono text-[9px] uppercase tracking-[0.3em] animate-pulse truncate">{t("overlay_uplink_desc")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-end px-1">
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 tracking-widest uppercase font-mono">{ingestProgress?.current} <span className="opacity-40">/ {ingestProgress?.total}</span> {t("overlay_secured")}</span>
              <span className="text-xl font-black text-[var(--text)] tracking-tighter">{Math.round(((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100)}%</span>
            </div>
            <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
              <div className="h-full theme-bg-accent rounded-full transition-all duration-300 ease-out relative shadow-[0_0_15px_rgba(var(--accent-rgb),0.8)]" style={{ width: `${((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100}%` }}>
                 <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )}{isScanning && (
      <div className="fixed bottom-8 right-8 z-[9999] w-96 bg-[var(--bg)]/90 backdrop-blur-md border border-white/10 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 theme-bg-accent opacity-5 blur-[80px]" />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <div className="relative flex shrink-0">
              <div className="absolute inset-0 theme-bg-accent opacity-30 rounded-2xl animate-ping" />
              <div className="w-14 h-14 rounded-2xl theme-glass-inner border theme-border-accent flex items-center justify-center text-3xl relative z-10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)]">
                <span className="animate-pulse">{t("ui_icon_radar")}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-[var(--text)] font-black uppercase tracking-widest text-sm drop-shadow-md truncate">{t("overlay_scan_title")}</h3>
              <p className="theme-text-accent font-mono text-[9px] uppercase tracking-[0.3em] animate-pulse truncate">{t("overlay_scan_desc")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-end px-1">
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 tracking-widest uppercase font-mono">{scanProgress.current} <span className="opacity-40">/ {scanProgress.total}</span></span>
              <span className="text-xl font-black text-[var(--text)] tracking-tighter">{scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
              <div className="h-full theme-bg-accent rounded-full transition-all duration-300 ease-out relative shadow-[0_0_15px_rgba(var(--accent-rgb),0.8)]" style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}>
                 <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )}<div className="fixed bottom-0 left-64 right-0 h-10 bg-[var(--bg)]/40 backdrop-blur-2xl border-t border-white/5 flex items-center px-6 z-50 font-mono text-[10px] tracking-widest uppercase shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 w-full">
          <div className="w-2 h-2 rounded-full theme-bg-accent animate-pulse"></div>
          <span className="theme-text-accent opacity-50">{t("sys_log")} </span>
          <span className="text-[var(--text)] font-bold truncate flex-1">{status}</span>
        </div>
      </div>{showDefconAlert && (
          <DefconAlert 
            showDefconAlert={showDefconAlert} setShowDefconAlert={setShowDefconAlert} triggerFullEngineBackup={triggerFullEngineBackup} triggerPrePatchSnapshot={triggerPrePatchSnapshot}
          />
        )}{yeetConfirmPending && (
          <YeetConfirmAlert 
            yeetConfirmPending={yeetConfirmPending} setYeetConfirmPending={setYeetConfirmPending}   
          />
        )}{dnaMatchQueue.length > 0 && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-3xl animate-in fade-in duration-200 p-8">
          <div className="theme-glass-panel border border-white/10 w-full max-w-2xl rounded-[2.5rem] p-10 flex flex-col items-center gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center max-h-[85vh]">
            <span className="text-6xl animate-pulse drop-shadow-md">{t("ui_icon_dna")}</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1 w-full">
              <h2 className="text-xl font-black theme-text-accent uppercase tracking-tighter">{t("overlay_dna_match_title")}</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">
                {t("overlay_dna_match_desc")}
              </p>
            </div>
            
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              {dnaMatchQueue.map((match: any, index: number) => (
                <div key={index} className="w-full bg-[var(--bg)]/40 border border-[var(--text)]/5 rounded-2xl p-4 flex flex-col gap-3 shadow-inner text-left">
                   <div className="flex flex-col gap-1">
                     <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("overlay_dna_incoming")}</span>
                     <span className="text-xs font-black text-[var(--text)] truncate">{match.path?.split(/[\\/]/).pop()}</span>
                   </div>
                   <div className="w-full h-px bg-white/5 my-0.5" />
                   <div className="flex flex-col gap-1">
                     <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("overlay_dna_existing")}</span>
                     <span className="text-xs font-black theme-text-accent truncate">{match.existing_name || 'Unknown'}</span>
                   </div>
                   <div className="flex gap-2 w-full mt-1">
                     <button
                       onClick={async () => {
                         try {
                           await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                           if (dnaMatchQueue.length === 1) runRadarSweep(true);
                         } catch (e: any) { setStatus(`Error replacing file: ${e}`); }
                         setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                       }}
                       className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[9px] uppercase tracking-widest rounded-xl transition-all hover:opacity-90 shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]"
                     >
                       {t("modal_btn_replace")}
                     </button>
                     <button
                       onClick={async () => {
                         try {
                           ignoredHashesRef.current.add(match.hash);
                           await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                           if (dnaMatchQueue.length === 1 && match.source_action === "radar_sweep") runRadarSweep(true);
                         } catch (e: any) { console.error("Error ignoring:", e); }
                         setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                       }}
                       className="flex-1 py-3 theme-glass-inner text-[var(--text)] font-black text-[9px] uppercase tracking-widest rounded-xl border border-white/5 transition-all hover:bg-white/5 shadow-sm"
                     >
                       {t("modal_btn_keep_old") || "KEEP OLD"}
                     </button>
                   </div>
                </div>
              ))}
            </div>

            {dnaMatchQueue.length > 1 && (
              <div className="flex gap-3 w-full mt-2 pt-4 border-t border-white/10 shrink-0">
                <button
                  onClick={async () => {
                    const queueCopy = [...dnaMatchQueue];
                    setDnaMatchQueue([]);
                    for (const match of queueCopy) {
                      try {
                        await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                      } catch(e) {}
                    }
                    if (queueCopy.length > 0) runRadarSweep(true);
                  }}
                  className="flex-1 py-4 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all hover:scale-105 shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]"
                >
                  {t("modal_btn_replace_all")}
                </button>
                <button
                  onClick={async () => {
                    const queueCopy = [...dnaMatchQueue];
                    setDnaMatchQueue([]);
                    for (const match of queueCopy) {
                      try {
                        ignoredHashesRef.current.add(match.hash);
                        await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                      } catch(e) {}
                    }
                    if (queueCopy.length > 0) runRadarSweep(true);
                  }}
                  className="flex-1 py-4 theme-glass-inner text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl border border-white/5 transition-all hover:bg-white/5 shadow-sm"
                >
                  {t("modal_btn_keep_all_old") || "KEEP ALL OLD"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {scoutQueue && scoutQueue.length > 0 && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-3xl animate-in fade-in duration-200 p-8">
          <div className="theme-glass-panel border border-white/10 w-full max-w-2xl rounded-[2.5rem] p-10 flex flex-col items-center gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center max-h-[85vh]">
            <span className="text-6xl animate-pulse drop-shadow-md">📡</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1 w-full">
              <h2 className="text-xl font-black theme-text-accent uppercase tracking-tighter">UNIDENTIFIED ARTIFACTS</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">
                Local artifacts were detected that are not mapped in the global registry.
              </p>
            </div>
            
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              {scoutQueue.map((mod: any, index: number) => (
                <div key={index} className="w-full bg-[var(--bg)]/40 border border-[var(--text)]/5 rounded-2xl p-4 flex flex-col gap-3 shadow-inner text-left">
                   <div className="flex flex-col gap-1">
                     <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">Artifact Target</span>
                     <span className="text-xs font-black text-[var(--text)] truncate">{mod.displayName || mod.name}</span>
                   </div>
                   <div className="flex gap-2 w-full mt-1">
                     <button
                       onClick={() => {
                         onOpenScoutDossier(mod);
                         setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                       }}
                       className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[9px] uppercase tracking-widest rounded-xl transition-all hover:opacity-90 shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]"
                     >
                       UPLOAD TO REGISTRY
                     </button>
                     <button
                       onClick={async () => {
                         try {
                           const config: any = await invoke("get_saved_coordinates");
                           await invoke("mark_explicitly_local", { vaultPath: config.vault_path, filePath: mod.path || mod.name });
                           setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                         } catch (e) { console.error(e); }
                       }}
                       className="flex-1 py-3 theme-glass-inner text-[var(--warning)] font-black text-[9px] uppercase tracking-widest rounded-xl border border-[var(--warning)]/30 transition-all hover:bg-[var(--warning)]/10 shadow-sm"
                     >
                       FLAG AS LOCAL (DO NOT UPLOAD)
                     </button>
                   </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full mt-2 pt-4 border-t border-white/10 shrink-0">
              <button
                onClick={() => setScoutQueue([])}
                className="w-full py-4 theme-glass-inner text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl border border-white/5 transition-all hover:bg-white/5 shadow-sm"
              >
                DISMISS ALL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
