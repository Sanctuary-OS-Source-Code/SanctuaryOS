import React from 'react';
import { createPortal } from "react-dom";
import { MissingImportsAlert } from "./MissingImportsAlert";
import { YeetConfirmAlert } from "./YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { useLexicon } from "./LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass, standardSuccessButtonClass } from "./shared";
import { useModalStore } from "./store/modalStore";
import { useStore } from './store';

export function AppModals(props: any) {
  const [isLogExpanded, setIsLogExpanded] = React.useState(false);
  const { t } = useLexicon();
  const {
    snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot, playSets, activePlaySetIndex, toggleInActiveSet,
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
    dnaMatchQueue, setDnaMatchQueue, ignoredHashesRef, setStatus, statusLog, clearStatusLog,
    scoutQueue, setScoutQueue, onOpenScoutDossier,
    malwareAlert, setMalwareAlert, setPlaySets
  } = props;

  const { backupType, restoreType } = useModalStore();

  const logModalRef = React.useRef<HTMLDivElement>(null);
  const logDragRef = React.useRef({ isDragging: false, startX: 0, startY: 0, currentX: 0, currentY: 0, initOffsetX: 0, initOffsetY: 0 });

  const handleLogPointerDown = (e: React.PointerEvent) => {
    logDragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: logDragRef.current.currentX,
      currentY: logDragRef.current.currentY,
      initOffsetX: logDragRef.current.currentX,
      initOffsetY: logDragRef.current.currentY
    };
    if (logModalRef.current) {
      logModalRef.current.style.transition = 'none';
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleLogPointerMove = (e: React.PointerEvent) => {
    if (!logDragRef.current.isDragging) return;
    const dx = e.clientX - logDragRef.current.startX;
    const dy = e.clientY - logDragRef.current.startY;
    logDragRef.current.currentX = logDragRef.current.initOffsetX + dx;
    logDragRef.current.currentY = logDragRef.current.initOffsetY + dy;
    
    if (logModalRef.current) {
       logModalRef.current.style.transform = `translate(${logDragRef.current.currentX}px, ${logDragRef.current.currentY}px)`;
    }
  };

  const handleLogPointerUp = (e: React.PointerEvent) => {
    logDragRef.current.isDragging = false;
    if (logModalRef.current) {
      logModalRef.current.style.transition = '';
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const isEngineBackup = backupType === 'engine';
  const backupTitle = isEngineBackup ? t("overlay_sealing_engine") || "SEALING ENGINE CORE" : t("overlay_sealing_world") || "SEALING WORLD STATE";
  const backupDesc = isEngineBackup ? t("overlay_sealing_engine_desc") || "Archiving game engine files and runtime structure..." : t("overlay_sealing_world_desc") || "Archiving saves, trays, and local world data...";

  const isEngineRestore = restoreType === 'engine';
  const restoreTitle = isEngineRestore ? t("overlay_restoring_engine") || "RESTORING ENGINE CORE" : t("overlay_restoring_world") || "RESTORING WORLD STATE";
  const restoreDesc = isEngineRestore ? t("overlay_restoring_engine_desc") || "Rebuilding game engine archive..." : t("overlay_restoring_world_desc") || "Extracting saves and tray archive...";

  const [shredState, setShredState] = React.useState<Record<string, string>>({});

  const obscureUsername = (path: string) => {
    if (!path) return "";
    return path.replace(/([\\/])Users[\\/][^\\/]+([\\/])/i, "$1Users$1...$2");
  };

  const handleSecureShred = async (m: any) => {
    setShredState(prev => ({ ...prev, [m.hash]: 'shredding_vault' }));
    try {
        await invoke("purge_quarantined_file", {
          filename: m.name.split(/[\\/]/).pop() || m.name,
        });
        setStatus(`${t("ui_icon_success") || "check_circle"} ${t("status_file_shredded") || "File shredded securely."}`);
        
        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          const { data: session } = await supabase.auth.getSession();
          await supabase.from('malware_reports')
            .update({ quarantined_file_shredded: true })
            .eq('detected_hash', m.hash)
            .eq('citizen_id', session?.session?.user?.id);
        }

        let originalPath = droppedFiles?.find((f: string) => f.split(/[\\/]/).pop() === m.name.split(/[\\/]/).pop());
      if (!originalPath && droppedFiles && droppedFiles.length > 0) {
        originalPath = droppedFiles.find((f: string) => /\.(zip|rar|7z|tar|gz)$/i.test(f));
      }
      
      if (originalPath) {
        setShredState(prev => ({ ...prev, [m.hash]: originalPath }));
      } else {
        setShredState(prev => { const n = {...prev}; delete n[m.hash]; return n; });
        setMalwareAlert(malwareAlert.filter((x: any) => x.hash !== m.hash));
        runRadarSweep();
      }
    } catch (err: any) {
      setShredState(prev => { const n = {...prev}; delete n[m.hash]; return n; });
      setStatus(`Error: ${err}`);
    }
  };

  const handleSkipExternalShred = (m: any) => {
    setShredState(prev => { const n = {...prev}; delete n[m.hash]; return n; });
    setMalwareAlert(malwareAlert.filter((x: any) => x.hash !== m.hash));
    runRadarSweep();
  };

  const handleExternalShred = async (m: any, originalPath: string) => {
    setShredState(prev => ({ ...prev, [m.hash]: 'shredding_external' }));
    try {
      await invoke("purge_external_file", { path: originalPath, hash: m.hash, filename: m.name });
      setStatus(`${t("ui_icon_success") || "check_circle"} ${t("status_external_shredded") || "Original file shredded securely."}`);

      if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
        const { data: session } = await supabase.auth.getSession();
        await supabase.from('malware_reports')
          .update({ original_shredded: true, original_exists: false })
          .eq('detected_hash', m.hash)
          .eq('citizen_id', session?.session?.user?.id);
      }
    } catch (err: any) {
      setStatus(`Error: ${err}`);
    } finally {
      setShredState(prev => { const n = {...prev}; delete n[m.hash]; return n; });
      setMalwareAlert(malwareAlert.filter((x: any) => x.hash !== m.hash));
      runRadarSweep();
    }
  };

  const isErrorStatus = typeof status === 'string' && (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.toLowerCase().includes('fatal') || status.includes('❌'));
  const isSuccessStatus = typeof status === 'string' && (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('ui_icon_success'));
  
  const statusBgClass = isErrorStatus ? 'bg-red-900/40 border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.3)]' : isSuccessStatus ? 'bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'bg-[var(--bg)]/40 border-white/5 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]';
  const statusTextClass = isErrorStatus ? 'text-red-400 font-black' : isSuccessStatus ? 'text-emerald-400 font-black' : 'theme-text-accent';
  const statusAccentClass = isErrorStatus ? 'bg-red-500 shadow-[0_0_10px_rgba(220,38,38,1)]' : isSuccessStatus ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]' : 'theme-bg-accent shadow-[0_0_10px_var(--accent)]';
  const statusIconClass = isErrorStatus ? 'text-red-500' : isSuccessStatus ? 'text-emerald-500' : 'text-[var(--accent)]';

  return (
    <>
      {malwareAlert && malwareAlert.length > 0 && (
        <div className="fixed inset-0 z-[999999] bg-[#0a0505]/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-500 overflow-hidden">
          
          {/* Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-red-500 opacity-[0.05] blur-[120px] pointer-events-none z-0 mix-blend-screen" />
          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(220,38,38,0.03)_25%,transparent_25%,transparent_50%,rgba(220,38,38,0.03)_50%,rgba(220,38,38,0.03)_75%,transparent_75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50 z-0"></div>

          <div className="relative z-10 w-full max-w-4xl bg-white/[0.02] backdrop-blur-2xl border border-red-500/20 rounded-[3rem] p-12 shadow-[0_40px_100px_rgba(220,38,38,0.2),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col gap-8">
            <div className="absolute inset-0 bg-red-900/5 animate-pulse pointer-events-none rounded-[3rem]" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600/80 to-transparent"></div>
            
            <div className="flex items-start gap-8 relative z-20">
              <div className="relative w-32 h-32 rounded-3xl bg-red-900/20 border border-red-500/30 flex items-center justify-center text-6xl shrink-0 shadow-[0_0_40px_rgba(220,38,38,0.2)]">
                <div className="absolute inset-0 rounded-3xl border border-red-500/20 shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]"></div>
                <span className="material-symbols-outlined !text-[64px] text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse">{t("ui_icon_malware_skull") || "skull"}</span>
              </div>
              <div className="flex flex-col gap-4 pt-2 flex-1">
                <h2 className="text-5xl font-black uppercase tracking-tighter text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.4)] leading-none">
                  {t("malware_alert_title") || "CRITICAL: MALWARE DETECTED"}
                </h2>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400 opacity-90">
                  {t("malware_alert_subtitle") || "Sanctuary OS has quarantined dangerous artifacts."}
                </p>
                <div className="w-full h-px bg-gradient-to-r from-red-500/30 to-transparent my-2"></div>
                <p className="text-sm font-medium text-red-100/70 leading-relaxed max-w-2xl">
                  {t("malware_alert_description") || "Known malware signatures have been detected on your local system. To protect your files and ensure systemic integrity, the OS requires an immediate SECURE SHRED. This action will permanently overwrite the malicious data multiple times, making it unrecoverable by specialized software."}
                </p>
              </div>
            </div>

            <div className="relative z-20 bg-black/40 backdrop-blur-md p-6 rounded-[2rem] border border-red-500/10 max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-3 shadow-inner">
              <div className="flex flex-col gap-3">
                {malwareAlert.map((m: any) => (
                  <React.Fragment key={m.hash}>
                    <div className="flex items-center justify-between p-5 bg-white/[0.02] rounded-2xl border border-red-500/10 hover:border-red-500/30 transition-all group">
                      <div className="flex items-center gap-4 min-w-0 pr-4">
                        <div className="w-2 h-2 ml-1 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse shrink-0"></div>
                        <div className="flex flex-col truncate">
                          <span className="text-sm font-black text-red-400 truncate uppercase tracking-widest">{m.displayName || m.name}</span>
                          <span className="text-[10px] font-mono text-red-300/50 truncate mt-1">{t("malware_alert_hash_label") || "Hash:"} {m.hash}</span>
                        </div>
                      </div>
                      {shredState[m.hash] === 'shredding_vault' || shredState[m.hash] === 'shredding_external' ? (
                        <div className="px-8 py-4 font-black text-[10px] uppercase tracking-[0.3em] text-red-400 animate-pulse shrink-0">
                          {t("malware_btn_shredding") || "SHREDDING..."}
                        </div>
                      ) : shredState[m.hash] ? (
                        <div className="flex gap-2 shrink-0">
                           <button 
                             onClick={() => handleSkipExternalShred(m)} 
                             className="px-4 py-4 bg-transparent border border-red-500/20 hover:bg-red-500/10 text-red-400/60 hover:text-red-300 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                           >
                             {t("malware_btn_skip") || "SKIP"}
                           </button>
                           <button 
                             onClick={() => handleExternalShred(m, shredState[m.hash])} 
                             className="px-6 py-4 bg-red-500/20 border border-red-500/50 hover:bg-red-500/40 text-red-300 hover:text-red-200 font-black text-[10px] uppercase tracking-[0.1em] rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)] hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] active:scale-95"
                           >
                             {t("malware_btn_shred_original") || "SHRED ORIGINAL"}
                           </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleSecureShred(m)} 
                          className="px-8 py-4 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 font-black text-[10px] uppercase tracking-[0.3em] rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.1)] hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] active:scale-95 shrink-0"
                        >
                          {t("malware_alert_btn_shred") || "SECURE SHRED"}
                        </button>
                      )}
                    </div>
                    
                    {shredState[m.hash] && typeof shredState[m.hash] === 'string' && shredState[m.hash] !== 'shredding_vault' && shredState[m.hash] !== 'shredding_external' && (
                      <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/20 text-sm flex flex-col gap-3 animate-in slide-in-from-top-2 ml-10">
                        <p className="text-red-300 font-bold">{t("malware_alert_external_title") || "WARNING: The original infected payload is still in your system!"}</p>
                        <div className="group/path cursor-pointer">
                          <p className="text-red-400/80 break-all group-hover/path:hidden">{obscureUsername(shredState[m.hash])}</p>
                          <p className="text-red-400/80 break-all hidden group-hover/path:block">{shredState[m.hash]}</p>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
            
            <div className="relative z-20 flex justify-center mt-2">
              <span className="px-6 py-2 rounded-full border border-red-500/20 bg-red-500/5 text-[10px] font-black uppercase tracking-[0.4em] text-red-500/80 animate-pulse backdrop-blur-md shadow-[0_0_20px_rgba(220,38,38,0.1)]">
                {t("malware_alert_action_required") || "ACTION REQUIRED TO PROCEED"}
              </span>
            </div>
          </div>
        </div>
      )}
      {snapshotModal && (
          <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("modal_snapshot_title") || "Snapshot Active Bunker"}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_snapshot_desc1") || "Enter a name to capture all"} <span className="text-[var(--text)]">{playSets[activePlaySetIndex]?.mods?.length || 0}</span> {t("modal_snapshot_desc2") || "currently active artifacts."}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <input 
                  autoFocus 
                  type="text" 
                  value={snapshotName} 
                  onChange={(e) => setSnapshotName(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && executeSnapshot()} 
                  placeholder={t("modal_snapshot_placeholder") || "e.g., Decades Challenge..."}
                  className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setSnapshotModal(false)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                    {t("playsets_btn_cancel") || "CANCEL"}
                  </button>
                  <button onClick={executeSnapshot} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("playsets_btn_save") || "SAVE"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{bulkModal && createPortal(
          <>
            <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[2px] animate-in fade-in duration-500 transition-all" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setBulkModal(false)} />
            <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[15001] animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
              <button onClick={() => setBulkModal(false)} className="absolute top-12 right-6 z-50 w-12 h-12 bg-black/40 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--text)]/70 hover:text-[var(--accent)] rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-110 active:scale-95">
                <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
              </button>

              <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                  <span className="material-symbols-outlined text-[var(--accent)] !leading-none" style={{ fontSize: '100px' }}>{t("ui_icon_architecture") || "architecture"}</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent pointer-events-none" />
              </div>
              
              <div className="px-10 pt-8 pb-4 relative shrink-0">
                <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{t("modal_bulk_title") || "Draft Bulk Blueprint"}</h3>
                <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
                  {t("modal_bulk_desc1") || "Enter a name to combine your"} <span className="text-[var(--text)] font-black">{selectedMods.length}</span> {t("modal_bulk_desc2") || "selected artifacts into a new Play Set."}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
                <div className="space-y-4">
                  <input 
                    autoFocus 
                    type="text" 
                    value={bulkName} 
                    onChange={(e) => setBulkName(e.target.value)} 
                    onKeyDown={(e) => e.key === "Enter" && executeBulkDraft()} 
                    placeholder={t("playsets_draft_placeholder") || "Blueprint Name..."}
                    className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
                  />
                </div>
              </div>
              
              <div className="p-8 flex justify-center items-center gap-4 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <button 
                  onClick={executeBulkDraft}
                  className="px-16 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_add_box") || "add_box"}</span>
                  {t("modal_btn_draft") || "DRAFT"}
                </button>
              </div>
            </div>
          </>, document.body

        )}{renameModal && (
          <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("modal_rename_title") || "Relabel Archive"}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                  {t("modal_rename_desc") || "Update the designation for this backup. Type prefix will be preserved automatically."}
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
                    {t("playsets_btn_cancel") || "CANCEL"}
                  </button>
                  <button onClick={executeRename} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                    {t("modal_btn_rename") || "RENAME"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}{renameTarget && (
          <div className="fixed inset-0 z-10000 flex items-center justify-center bg-[var(--bg)]/10 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="w-full max-w-md theme-glass-panel border theme-border-accent rounded-[2rem] p-8 shadow-2xl">
              <h3 className="text-xs font-black tracking-[0.3em] theme-text-accent uppercase mb-6 flex items-center gap-2"><span className="w-2 h-2 theme-bg-accent rounded-full animate-pulse"></span>{t("modal_redesignate_title") || "Re-designate Signature"}</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--text)]/40 uppercase tracking-widest ml-1">{t("modal_redesignate_label") || "New Designation"}</label>
                  <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setRenameTarget(null)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-[var(--text)]/60 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all">{t("modal_btn_abort") || "Abort"}</button>
                  <button onClick={confirmRename} className="flex-1 px-4 py-3 rounded-xl theme-bg-accent text-[var(--bg)] text-[10px] font-bold uppercase tracking-widest hover:opacity-90 shadow-lg transition-all">{t("modal_btn_confirm") || "Confirm"}</button>
                </div>
              </div>
            </div>
          </div>
        )}{localFolderModal && createPortal(
          <>
            <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[2px] animate-in fade-in duration-500 transition-all" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setLocalFolderModal(false)} />
            <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[15001] animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
              <button onClick={() => setLocalFolderModal(false)} className="absolute top-12 right-6 z-50 w-12 h-12 bg-black/40 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--text)]/70 hover:text-[var(--success)] rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:scale-110 active:scale-95">
                <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
              </button>

              <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                  <span className="material-symbols-outlined theme-text-success !leading-none" style={{ fontSize: '100px' }}>{t("ui_icon_create_new_folder") || "create_new_folder"}</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--success)_30%,transparent)] to-transparent pointer-events-none" />
              </div>
              
              <div className="px-10 pt-8 pb-4 relative shrink-0">
                <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{t("modal_local_folder_title") || "CREATE VIRTUAL FOLDER"}</h3>
                <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
                  {t("modal_local_folder_desc") || "Group these artifacts locally. This does not affect the global database."}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner mb-2">
                    <button onClick={() => setLocalFolderType("FOLDER")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "FOLDER" ? 'theme-bg-success text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("dossier_folder") || "Twins / Addons"}</button>
                    <button onClick={() => setLocalFolderType("CC_SET")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "CC_SET" ? 'theme-bg-accent text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("dossier_cc_set") || "COLLECTION"}</button>
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
                </div>
              </div>
              
              <div className="p-8 flex justify-center items-center gap-4 shrink-0 relative z-20 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md">
                <button onClick={createLocalFolder} className="px-16 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_folder_open") || "folder_open"}</span>
                  {t("modal_btn_create_folder") || "CREATE FOLDER"}
                </button>
              </div>
            </div>
          </>, document.body
        )}{(missingImportMods && missingImportMods.length > 0) && pendingImportSet && (
          <MissingImportsAlert 
            missingImportMods={missingImportMods} setMissingImportMods={setMissingImportMods} pendingImportSet={pendingImportSet} setPendingImportSet={setPendingImportSet} finalizeImport={finalizeImport} setIsDropzoneOpen={setIsDropzoneOpen}
          />
        )}{confirmDialog && (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl">
            {confirmDialog.isDefcon ? (
              <div className="relative w-full max-w-4xl theme-glass-panel border-2 border-red-600/50 rounded-[3rem] p-12 shadow-[0_0_80px_rgba(220,38,38,0.2)] flex flex-col gap-8 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(239,68,68,0.03)_25%,transparent_25%,transparent_50%,rgba(239,68,68,0.03)_50%,rgba(239,68,68,0.03)_75%,transparent_75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50"></div>
                <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80"></div>
                <div className="absolute bottom-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80"></div>
                
                <div className="flex items-start gap-8 relative z-10 text-left">
                  <div className="relative w-32 h-32 rounded-3xl bg-red-900/20 border border-red-500/50 flex items-center justify-center text-6xl shrink-0 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                    <div className="absolute inset-0 rounded-3xl border-2 border-red-500/40 animate-ping opacity-50"></div>
                    <span className="material-symbols-outlined !text-6xl text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">{t("ui_icon_warning") || "warning_amber"}</span>
                  </div>
                  <div className="flex flex-col gap-4 pt-2 flex-1">
                    <h2 className="text-5xl font-black uppercase tracking-tighter text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] leading-none">
                      {confirmDialog.title || t("app_modal_global_alert") || "GLOBAL ALERT"}
                    </h2>
                    <div className="w-full h-px bg-gradient-to-r from-red-500/50 to-transparent my-2"></div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300/90 leading-relaxed max-w-2xl whitespace-pre-line">
                      {confirmDialog.message}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 w-full mt-4 relative z-10">
                   <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className="flex-1 py-6 bg-red-600/30 border-2 border-red-500/80 hover:bg-red-500/50 text-red-100 hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all shadow-[0_0_40px_rgba(220,38,38,0.4)] hover:shadow-[0_0_60px_rgba(220,38,38,0.7)] hover:scale-[1.02] active:scale-95 animate-[pulse_2s_ease-in-out_infinite] backdrop-blur-md">{confirmDialog.confirmText || t("modal_btn_proceed") || "PROCEED"}</button>
                   <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="flex-1 py-6 theme-glass-inner border border-red-500/20 text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all hover:scale-[1.02] shadow-sm active:scale-95">{confirmDialog.cancelText || t("playsets_btn_cancel") || "CANCEL"}</button>
                </div>
              </div>
            ) : (
              <div className={`theme-glass-panel p-10 rounded-[3rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col gap-8 text-center animate-in zoom-in-95 duration-300 w-[500px] overflow-hidden relative`}>
                <div className={`absolute top-0 left-0 w-full h-1 ${confirmDialog.isAlert ? "bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.8)]" : "bg-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_80%,transparent)]"}`} />
                <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full opacity-20 blur-[80px] pointer-events-none ${confirmDialog.isAlert ? "bg-amber-500" : "bg-[var(--accent)]"}`} />

                <div className="flex justify-center mt-2 relative z-10">
                   <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-md ${confirmDialog.isAlert ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"}`}>
                     <span className="material-symbols-outlined !text-4xl drop-shadow-md">{confirmDialog.isAlert ? 'warning' : 'help_center'}</span>
                   </div>
                </div>

                <div className="flex flex-col gap-4 relative z-10">
                  {confirmDialog.title && <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] drop-shadow-sm">{confirmDialog.title}</h2>}
                  <h3 className="text-[var(--subtext)] text-sm font-medium tracking-wide whitespace-pre-line leading-relaxed m-0">{confirmDialog.message}</h3>
                </div>

                <div className="flex gap-4 w-full mt-4 relative z-10">
                  {confirmDialog.isAlert ? (
                    <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className={`flex-1 py-4 bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/40 text-amber-400 hover:text-amber-300 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg hover:scale-[1.02] active:scale-95`}>{confirmDialog.confirmText || t("modal_btn_ok") || "OK"}</button>
                  ) : (
                    <>
                      <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className={`flex-1 py-4 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg hover:scale-[1.02] active:scale-95`}>{confirmDialog.confirmText || t("modal_btn_proceed") || "PROCEED"}</button>
                      <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="flex-1 py-4 theme-glass-inner border border-white/10 hover:border-white/20 text-[var(--text)] hover:bg-white/5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-95">{confirmDialog.cancelText || t("playsets_btn_cancel") || "CANCEL"}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      <SidePanel
        isOpen={isDropzoneOpen || isDragging}
        onClose={() => { setIsDragging(false); if (dropzoneState !== 'ingesting') { setIsDropzoneOpen(false); setDropzoneState('awaiting'); setDroppedFiles([]); } }}
        title={dropzoneState === "awaiting" ? t("dropzone_awaiting_title") || "Awaiting Payload" : t("dropzone_secured_title") || "Payload Secured"}
        subtitle={
          dropzoneState === "awaiting" ? 
            <>{t("dropzone_awaiting_desc1") || "Drag and Drop"}<span className="text-[var(--text)]">.package</span>{t("dropzone_awaiting_desc2") || ","}<span className="text-[var(--text)]">.ts4script</span>{t("dropzone_awaiting_desc3") || ", or"}<span className="text-[var(--text)]">.zip</span>{t("dropzone_awaiting_desc4") || "archives directly into this zone to ingest them into the secure Vault."}</>
            : 
            <>{droppedFiles.length > 0 ? `${t("dropzone_secured_desc_prefix")}${droppedFiles.length}${t("dropzone_secured_desc_suffix") || "file(s) detected via manual uplink."}` : t("dropzone_secured_desc_empty") || "Please select an ingestion protocol for the incoming assets."}</>
        }
        icon={t("ui_icon_cloud") || "cloud"}
        iconColorClass={dropzoneState === "received" ? "text-emerald-400 drop-shadow-[0_0_10px_color-mix(in_srgb,var(--success)_50%,transparent)]" : "theme-text-accent"}
        widthClass="w-[550px]"
        footer={
          dropzoneState !== "awaiting" ? (
            <div className="w-full">
              {dropzoneState === "ingesting" ? (
                <div className="w-full py-4 theme-bg-accent/20 text-[var(--text)] rounded-xl border border-[var(--accent)]/50 shadow-lg flex flex-col items-center justify-center gap-1 backdrop-blur-md">
                  <span className="text-sm font-black uppercase tracking-widest animate-pulse">{t("app_modal_ingesting") || "INGESTING..."}</span>
                  <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">{ingestProgress?.current || 0} / {ingestProgress?.total || 0} {t("app_modal_files") || "Files"}</span>
                </div>
              ) : (
                <div className="flex justify-center items-center gap-4 w-full">
                  <button onClick={() => { handleDroppedFiles(droppedFiles); }} className={standardSuccessButtonClass}>
                    <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_flight_takeoff") || "flight_takeoff"}</span>
                    {t("dropzone_btn_yeet") || "YEET TO VAULT"}
                  </button>
                  <button onClick={() => { useStore.getState().pushStatus(t("dropzone_alert_quarantine") || "Quarantine ingestion protocol initiated."); setIsDropzoneOpen(false); setDropzoneState("awaiting"); setDroppedFiles([]); runRadarSweep(true); }} className={standardDangerButtonClass}>
                    <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_warning") || "warning_amber"}</span>
                    {t("dropzone_btn_quarantine") || "QUARANTINE"}
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
      >
        <div className="flex-1 flex flex-col h-full min-h-[400px]">
          {dropzoneState === "awaiting" ? (
            <div className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center pointer-events-none transition-all ${isDragging ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[inset_0_0_50px_rgba(37,99,235,0.2)]' : 'border-white/20 bg-black/10'}`}>
              <span className="material-symbols-outlined !text-[120px] opacity-20 drop-shadow-md mb-4 animate-bounce">{t("ui_icon_cloud") || "cloud"}</span>
              <span className="text-xs font-black text-[var(--subtext)] uppercase tracking-widest opacity-50">{t("app_modal_drop_files") || "Drop files here"}</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {droppedFiles.length > 0 && (
                <div className="w-full theme-glass-inner rounded-2xl p-4 flex flex-col gap-2 shadow-inner border border-emerald-500/20 bg-emerald-500/5">
                  {droppedFiles.map((f: any, i: number) => (
                    <div key={i} className="text-xs font-bold text-[var(--text)] py-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 truncate flex items-center gap-3">
                      <span className="text-emerald-400 material-symbols-outlined !text-sm">{t("ui_icon_check_circle") || "check_circle"}</span>
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SidePanel><SidePanel
        isOpen={showBrokenModal}
        onClose={() => setShowBrokenModal(false)}
        title={`${t("status_broken") || "BROKEN"} ${t("status_broken_detected") || "Detected"}`}
        subtitle={t("broken_modal_desc") || "The following Artifacts have been flagged as severely broken or severely out of date. They should be reviewed immediately."}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4">
          {modList.filter((m: any) => {
            const isInActive = playSets[activePlaySetIndex]?.mods.includes(m.name);
            if (!isInActive) return false;
            const isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2;
            const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
            return isBroken || isMismatch;
          }).map((m: any) => {
            const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
            const isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken';
            return (
              <div key={m.hash} className="flex items-center justify-between p-4 theme-glass-inner rounded-xl border border-white/5 hover:border-amber-500/50 transition-all group gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-black text-[var(--text)] truncate group-hover:text-amber-500 transition-colors">
                    {m.name.split(/[/\\]/).pop()}
                  </span>
                  <span className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest">
                    {isMismatch ? (t("app_modal_version_mismatch") || "Version Mismatch") : (t("app_modal_severely_broken") || "Severely Broken")}
                  </span>
                </div>
                <button 
                  onClick={() => toggleInActiveSet && toggleInActiveSet(m.name)} 
                  className="shrink-0 px-5 py-2.5 theme-bg-danger text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-lg transition-all hover:scale-105 shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)]"
                >
                  {t("status_remove") || "REMOVE"}
                </button>
              </div>
            );
          })}
          {modList.filter((m: any) => {
            const isInActive = playSets[activePlaySetIndex]?.mods.includes(m.name);
            if (!isInActive) return false;
            const isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2;
            const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
            return isBroken || isMismatch;
          }).length === 0 && (
            <div className="text-[var(--subtext)] text-center opacity-50 p-6 italic font-bold text-xs uppercase tracking-widest bg-black/10 rounded-xl border border-white/5">
              {t("broken_modal_empty") || "No broken Artifacts detected!"}
            </div>
          )}
        </div>
      </SidePanel>{showQuarantineModal && (
        <div className="fixed inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl z-[15000] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="theme-glass-panel border-2 theme-border-danger p-8 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col gap-6" style={{ color: 'var(--text)' }}>
            <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3"><span className="text-3xl">{t("ui_icon_broken") || "bug_report"}</span> {t("quarantine_zone_title") || "Quarantine Zone"}</h2>
            <p className="opacity-80 font-bold text-sm">{t("quarantine_modal_desc") || "These files are highly volatile and have been structurally disabled to protect your environment."}</p>
            <div className="bg-black/20 p-4 rounded-xl max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {quarantineList.map((m: any) => (
                <div key={m.hash} className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono">{m.name}</div>
              ))}
              {quarantineList.length === 0 && (
                <div className="text-[var(--text)] text-center opacity-50 p-4 italic">{t("quarantine_modal_empty") || "Quarantine is empty!"}</div>
              )}
            </div>
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setShowQuarantineModal(false)} className="px-8 h-12 theme-btn-standard text-[var(--text)] font-black text-xs tracking-widest rounded-2xl transition-colors">{t("radar_tier3_cancel") || "CANCEL"}</button>
            </div>
          </div>
        </div>
      )}{isBackingUp && (
        <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-[var(--bg)]/80 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className={`w-full py-16 theme-glass-panel border-y flex items-center justify-center relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] ${isEngineBackup ? 'border-rose-500/20' : 'border-indigo-500/20'}`}>
            <div className={`absolute top-0 left-1/4 w-[50vw] h-full opacity-10 blur-[100px] pointer-events-none mix-blend-screen ${isEngineBackup ? 'bg-rose-500' : 'bg-indigo-500'}`} />
            
            <div className="flex items-center gap-16 max-w-5xl w-full px-12 relative z-10">
              <div className="relative w-32 h-32 shrink-0">
                 <div className={`absolute inset-0 border-4 opacity-20 rounded-full shadow-inner ${isEngineBackup ? 'border-rose-500' : 'border-indigo-500'}`}></div>
                 <div className={`absolute inset-0 border-4 rounded-full animate-spin ${isEngineBackup ? 'border-t-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.5)]' : 'border-t-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]'}`}></div>
                 <div className={`absolute inset-4 border-2 rounded-full animate-spin-slow ${isEngineBackup ? 'border-b-rose-400' : 'border-b-indigo-400'}`}></div>
                 <div className={`absolute inset-0 opacity-[0.15] blur-xl rounded-full mix-blend-screen animate-pulse ${isEngineBackup ? 'bg-rose-500' : 'bg-indigo-500'}`} />
              </div>

              <div className="flex flex-col justify-center flex-1">
                 <h2 className="text-4xl font-black tracking-[0.4em] text-[var(--text)] uppercase drop-shadow-lg mb-2">{backupTitle}</h2>
                 <div className="flex items-center gap-4 mb-8">
                   <div className={`h-[1px] flex-1 bg-gradient-to-r to-transparent opacity-50 ${isEngineBackup ? 'from-rose-500' : 'from-indigo-500'}`} />
                   <p className={`text-xs font-mono font-bold tracking-[0.3em] uppercase animate-pulse shrink-0 ${isEngineBackup ? 'text-rose-500' : 'text-indigo-500'}`}>{backupDesc}</p>
                 </div>
                 
                 <div className={`px-6 py-3 theme-glass-inner border-l-2 bg-black/20 text-[10px] font-bold text-[var(--text)]/60 uppercase tracking-[0.2em] shadow-inner inline-block self-start ${isEngineBackup ? 'border-rose-500' : 'border-indigo-500'}`}>
                   {t("overlay_sealing_warn") || "System may become unresponsive during high-level compression"}
                 </div>
              </div>
            </div>
            
            {/* Cinematic scanline */}
            <div className={`absolute top-0 left-0 w-full h-[1px] animate-[scan_3s_ease-in-out_infinite] ${isEngineBackup ? 'bg-rose-500/30' : 'bg-indigo-500/30'}`} />
          </div>
        </div>
      )}{isRestoring && (
        <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-[var(--bg)]/80 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className={`w-full py-16 theme-glass-panel border-y flex items-center justify-center relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] ${isEngineRestore ? 'border-rose-500/20' : 'border-indigo-500/20'}`}>
            <div className={`absolute top-0 left-1/4 w-[50vw] h-full opacity-10 blur-[100px] pointer-events-none mix-blend-screen ${isEngineRestore ? 'bg-rose-500' : 'bg-indigo-500'}`} />
            
            <div className="flex items-center gap-16 max-w-5xl w-full px-12 relative z-10">
              <div className="relative w-32 h-32 shrink-0">
                 <div className={`absolute inset-0 border-4 opacity-20 rounded-full shadow-inner ${isEngineRestore ? 'border-rose-500' : 'border-indigo-500'}`}></div>
                 <div className={`absolute inset-0 border-4 rounded-full animate-spin ${isEngineRestore ? 'border-t-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.5)]' : 'border-t-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]'}`}></div>
                 <div className={`absolute inset-4 border-2 rounded-full animate-spin-slow ${isEngineRestore ? 'border-b-rose-400' : 'border-b-indigo-400'}`}></div>
                 <div className={`absolute inset-0 opacity-[0.15] blur-xl rounded-full mix-blend-screen animate-pulse ${isEngineRestore ? 'bg-rose-500' : 'bg-indigo-500'}`} />
              </div>

              <div className="flex flex-col justify-center flex-1">
                 <h2 className="text-4xl font-black tracking-[0.4em] text-[var(--text)] uppercase drop-shadow-lg mb-2">{restoreTitle}</h2>
                 <div className="flex items-center gap-4 mb-8">
                   <div className={`h-[1px] flex-1 bg-gradient-to-r to-transparent opacity-50 ${isEngineRestore ? 'from-rose-500' : 'from-indigo-500'}`} />
                   <p className={`text-xs font-mono font-bold tracking-[0.3em] uppercase animate-pulse shrink-0 ${isEngineRestore ? 'text-rose-500' : 'text-indigo-500'}`}>{restoreDesc}</p>
                 </div>
                 
                 <div className={`px-6 py-3 theme-glass-inner border-l-2 bg-black/20 text-[10px] font-bold text-[var(--text)]/60 uppercase tracking-[0.2em] shadow-inner inline-block self-start ${isEngineRestore ? 'border-rose-500' : 'border-indigo-500'}`}>
                   {t("overlay_restoring_warn") || "Large archives may take a few minutes to restore."}
                 </div>
              </div>
            </div>
            
            {/* Cinematic scanline */}
            <div className={`absolute top-0 left-0 w-full h-[1px] animate-[scan_3s_ease-in-out_infinite] ${isEngineRestore ? 'bg-rose-500/30' : 'bg-indigo-500/30'}`} />
          </div>
        </div>
      )}{ingestProgress?.active && (
      <div className="fixed bottom-14 right-6 z-[15000] w-72 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-none flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[var(--accent)] text-lg animate-pulse">{t("ui_icon_cloud") || "cloud"}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text)]">{t("overlay_uplink_title") || "Global Uplink"}</span>
          </div>
          <span className="text-[9px] font-mono font-bold theme-text-accent">{Math.round(((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100)}%</span>
        </div>
        <div className="w-full h-1 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full overflow-hidden">
          <div className="h-full theme-bg-accent transition-all duration-300 relative shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" style={{ width: `${((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100}%` }}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
          </div>
        </div>
      </div>
    )}
      {isLogExpanded && statusLog && statusLog.length > 0 && (
        <div 
          ref={logModalRef}
          className="fixed bottom-14 right-4 w-[420px] max-h-[60vh] theme-glass-panel border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_30px_rgba(var(--accent-rgb),0.15)] rounded-[2rem] z-[99998] flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-300 overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none"
        >
          <div 
            className="flex items-center justify-between p-5 border-b border-white/10 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 relative z-10 cursor-move"
            onPointerDown={handleLogPointerDown}
            onPointerMove={handleLogPointerMove}
            onPointerUp={handleLogPointerUp}
          >
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-xl theme-glass-inner border border-white/5 flex items-center justify-center shadow-inner">
                 <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("ui_icon_receipt_long") || "receipt_long"}</span>
               </div>
               <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">
                 {t("sys_log_history") || "System Log History"}
               </span>
            </div>
            <div className="flex items-center gap-2">
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { clearStatusLog(); setIsLogExpanded(false); }} className="p-2 hover:bg-red-500/10 text-[var(--subtext)] hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20">
                <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_delete_sweep") || "delete_sweep"}</span>
              </button>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setIsLogExpanded(false)} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] rounded-xl transition-all border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close") || "close"}</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 relative z-10">
            {statusLog.map((log: any) => {
              const match = log.message.match(/^([a-z_0-9]+)\s+(.*)$/);
              const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];
              
              let logIcon = 'terminal';
              let logText = log.message;
              
              if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
                  logIcon = match[1];
                  logText = match[2];
              }

              let logTextNode: React.ReactNode = logText;
              
              const cachedMatch = (typeof logText === 'string') ? logText.match(/^(.*?) (has|have) cached changes from your last session\.$/) : null;
              if (cachedMatch) {
                 const filesString = cachedMatch[1];
                 const isPlural = cachedMatch[2] === 'have';
                 const parts = filesString.split(" and ");
                 const fileNames = parts[0].split(", ");
                 const otherFilesPart = parts.length > 1 ? ` and ${parts[1]}` : '';
                 
                 logTextNode = (
                    <span className="flex flex-wrap gap-1.5 items-center leading-normal">
                       {fileNames.map((f, idx) => (
                          <React.Fragment key={f}>
                             <button onClick={(e) => {
                                e.stopPropagation();
                                if (f.endsWith('.json') || useStore.getState().userRole === 'citizen') {
                                   useStore.getState().setView('CitizensWorkbench');
                                } else {
                                   useStore.getState().setView('MasonHub');
                                   useStore.getState().setMasonActiveTab('ide');
                                }
                                setIsLogExpanded(false);
                             }} className="px-2 py-0.5 bg-black/20 border border-white/5 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-md transition-all uppercase tracking-widest cursor-pointer">
                                {f}
                             </button>
                             {idx < fileNames.length - 1 && <span className="opacity-50">,</span>}
                          </React.Fragment>
                       ))}
                       {otherFilesPart} <span className="opacity-80 ml-1">{isPlural ? 'have' : 'has'} cached changes from your last session.</span>
                    </span>
                 );
                 if (logIcon === 'terminal') logIcon = 'save';
              }
              
              const isErr = log.type === 'error' || logIcon === 'error' || logIcon === 'bug_report';
              const isSucc = log.type === 'success' || logIcon === 'check_circle' || logIcon === 'done' || logIcon === 'verified';
              const isWarn = log.type === 'warning' || logIcon === 'warning' || logIcon === 'priority_high';
              
              const logColor = isErr ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]' : isSucc ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : isWarn ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]';
              const bgHover = isErr ? 'hover:bg-red-500/10 hover:border-red-500/20' : isSucc ? 'hover:bg-emerald-500/10 hover:border-emerald-500/20' : isWarn ? 'hover:bg-amber-500/10 hover:border-amber-500/20' : 'hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/20';
              const iconBg = isErr ? 'bg-red-500/10 border-red-500/20' : isSucc ? 'bg-emerald-500/10 border-emerald-500/20' : isWarn ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[var(--accent)]/10 border-[var(--accent)]/20';
              
              return (
                <div key={log.id} className={`flex items-start gap-4 p-4 rounded-[1rem] border border-transparent transition-all duration-300 group ${bgHover}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${iconBg}`}>
                    <span className={`material-symbols-outlined !text-[18px] ${logColor}`}>{logIcon}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0 pt-0.5">
                    <div className="text-[10px] font-bold text-[var(--text)] uppercase tracking-wider whitespace-pre-wrap leading-relaxed break-words opacity-90 group-hover:opacity-100 transition-opacity">{logTextNode}</div>
                    <span className="text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("ui_icon_schedule") || "schedule"}</span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div 
        className={`fixed bottom-0 right-0 h-10 backdrop-blur-2xl border-t flex items-center px-6 z-[99999] font-mono text-[10px] tracking-widest uppercase transition-all duration-300 ${statusBgClass} cursor-pointer hover:brightness-110 active:brightness-95 select-none`} 
        style={{ left: "var(--sidebar-width, 288px)" }}
        onClick={() => setIsLogExpanded(!isLogExpanded)}
      >
        <div className="flex items-center gap-3 w-full h-full relative">
          <div className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${statusAccentClass}`} />
          <span className={`material-symbols-outlined text-sm shrink-0 opacity-70 ${statusIconClass}`}>
             {isErrorStatus ? 'error' : isSuccessStatus ? 'check_circle' : 'terminal'}
          </span>
          <span className={`${statusTextClass} opacity-50 shrink-0`}>{t("sys_log") || "Status"} </span>
          <span className={`${isErrorStatus ? 'text-red-100' : isSuccessStatus ? 'text-emerald-100' : 'text-[var(--text)]'} font-bold truncate flex-1 flex items-center drop-shadow-md`}>
            {(() => {
              if (typeof status !== 'string') return status;
              const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
              const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];
              if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
                return (
                  <span className="flex items-center gap-2">
                    <span className={`material-symbols-outlined !text-[14px] leading-none ${statusIconClass}`}>{match[1]}</span>
                    <span className="truncate">{match[2]}</span>
                  </span>
                );
              }
              return <span className="truncate">{status}</span>;
            })()}
          </span>
          
          {isScanning && (
            <div className={`flex items-center gap-4 h-full ml-auto pl-6 border-l shrink-0 w-80 animate-in fade-in duration-300 ${isErrorStatus ? 'border-red-500/20' : isSuccessStatus ? 'border-emerald-500/20' : 'border-white/5'}`}>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-lg animate-spin-slow ${statusIconClass}`}>{t("ui_icon_radar3") || "radar"}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isErrorStatus ? 'text-red-300' : isSuccessStatus ? 'text-emerald-300' : 'text-[var(--text)]'}`}>{t("overlay_scan_title") || "Bunker Scan"}</span>
              </div>
              <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isErrorStatus ? 'bg-red-900/50' : isSuccessStatus ? 'bg-emerald-900/50' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <div className={`h-full transition-all duration-300 relative ${statusAccentClass}`} style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
                </div>
              </div>
              <span className={`text-[9px] font-mono font-bold w-8 text-right ${statusTextClass}`}>{scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%</span>
            </div>
          )}
        </div>
      </div>
      {showDefconAlert && (
          <DefconAlert 
            showDefconAlert={showDefconAlert} setShowDefconAlert={setShowDefconAlert} triggerFullEngineBackup={triggerFullEngineBackup} triggerPrePatchSnapshot={triggerPrePatchSnapshot}
          />
        )}{yeetConfirmPending && (
          <YeetConfirmAlert 
            yeetConfirmPending={yeetConfirmPending} setYeetConfirmPending={setYeetConfirmPending}   
          />
        )}
      <SidePanel
        isOpen={dnaMatchQueue.length > 0}
        onClose={() => setDnaMatchQueue([])}
        title={t("overlay_dna_match_title") || "DNA MATCH DETECTED"}
        subtitle={t("overlay_dna_match_desc") || "An Artifact with an identical DNA signature already exists in the Vault."}
        icon="difference"
        widthClass="w-[550px]"
        footer={
          dnaMatchQueue.length > 1 ? (
            <div className="flex justify-center items-center gap-4 w-full">
              <button
                onClick={async () => {
                  const queueCopy = [...dnaMatchQueue];
                  setDnaMatchQueue([]);
                  for (const match of queueCopy) {
                    try {
                      ignoredHashesRef.current.add(match.hash || match.path);
                      await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                    } catch(e) {}
                  }
                  if (queueCopy.length > 0) runRadarSweep(true);
                }}
                className={standardButtonClass}
              >
                <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_delete") || "delete"}</span>
                {t("modal_btn_keep_all_old") || "KEEP ALL OLD"}
              </button>
              <button
                onClick={async () => {
                  const queueCopy = [...dnaMatchQueue];
                  setDnaMatchQueue([]);
                  for (const match of queueCopy) {
                    try {
                      await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                      if (match.existing_name) {
                        const oldName = match.existing_name.split(/[/\\]/).pop();
                        const newName = match.path.split(/[/\\]/).pop();
                        if (oldName && newName && oldName !== newName && setPlaySets) {
                          setPlaySets((prev: any) => prev.map((s: any, idx: number) => {
                            if (idx === activePlaySetIndex) {
                              return { ...s, mods: s.mods.filter((m: string) => m !== oldName) };
                            }
                            return s;
                          }));
                        }
                      }
                    } catch(e) {}
                  }
                  if (queueCopy.length > 0) runRadarSweep(true);
                }}
                className={standardAccentGlassButtonClass}
              >
                <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_merge") || "merge"}</span>
                {t("modal_btn_replace_all") || "KEEP ALL NEW"}
              </button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {dnaMatchQueue.map((match: any, index: number) => (
            <div key={index} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-5 flex flex-col gap-4 shadow-inner text-left hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_call_received") || "call_received"}</span>
                    {t("overlay_dna_incoming") || "Incoming Artifact"}
                 </span>
                 <span className="text-sm font-black text-[var(--text)] truncate opacity-90">{match.path?.split(/[\\/]/).pop()?.replace('.tmp_sanctuary_conflict', '')}</span>
               </div>
               
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_inventory_2") || "inventory_2"}</span>
                    {t("overlay_dna_existing") || "Existing Artifact"}
                 </span>
                 <span className="text-sm font-medium text-[var(--subtext)] opacity-80 truncate">{match.existing_name ? match.existing_name.split(/[\\/]/).pop() : 'Unknown'}</span>
               </div>
               <div className="flex justify-center items-center gap-3 w-full mt-4">
                 <button
                   onClick={async () => {
                     try {
                       await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                       if (dnaMatchQueue.length === 1) runRadarSweep(true);
                     } catch (e: any) { setStatus(`Error replacing file: ${e}`); }
                     setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                   }}
                   className={standardAccentGlassButtonClass}
                 >
                   <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_merge") || "merge"}</span>
                   {t("modal_btn_replace") || "KEEP NEW"}
                 </button>
                 <button
                   onClick={async () => {
                     try {
                       ignoredHashesRef.current.add(match.hash || match.path);
                       await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                       if (dnaMatchQueue.length === 1 && match.source_action === "radar_sweep") runRadarSweep(true);
                     } catch (e: any) { console.error("Error ignoring:", e); }
                     setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                   }}
                   className={standardButtonClass}
                 >
                   <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_delete") || "delete"}</span>
                   {t("modal_btn_keep_old") || "KEEP OLD"}
                 </button>
               </div>
            </div>
          ))}
        </div>
      </SidePanel>

      <SidePanel
        isOpen={scoutQueue && scoutQueue.length > 0}
        onClose={() => setScoutQueue([])}
        title={t("scout_queue_title") || "UNIDENTIFIED DNA"}
        subtitle={t("scout_queue_desc") || "Unidentified artifacts detected."}
        icon={t("ui_icon_radar") || "track_changes"}
        widthClass="w-[550px]"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button
              onClick={() => setScoutQueue([])}
              className={standardButtonClass}
            >
              {t("modal_btn_close") || "CLOSE"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {scoutQueue && scoutQueue.map((mod: any, index: number) => (
            <div key={index} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-5 flex flex-col gap-4 shadow-inner text-left hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] font-black theme-text-accent uppercase tracking-widest">{t("scout_queue_target") || "Artifact Target"}</span>
                 <span className="text-xs font-black text-[var(--text)] truncate">{mod.displayName || mod.name}</span>
               </div>
               <div className="flex justify-center items-center gap-3 w-full mt-4">
                 <button
                   onClick={() => {
                     onOpenScoutDossier(mod);
                     setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                   }}
                   className={standardAccentGlassButtonClass}
                 >
                   <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_cloud_upload") || "cloud_upload"}</span>
                   {t("scout_queue_btn_upload") || "UPLOAD TO REGISTRY"}
                 </button>
                 <button
                   onClick={async () => {
                     try {
                       const config: any = await invoke("get_saved_coordinates");
                       await invoke("mark_explicitly_local", { vaultPath: config.vault_path, filePath: mod.path || mod.name });
                       setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                     } catch (e) { console.error(e); }
                   }}
                   className={standardDangerButtonClass}
                 >
                   <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_flag") || "flag"}</span>
                   {t("scout_queue_btn_flag") || "FLAG AS LOCAL"}
                 </button>
               </div>
            </div>
          ))}
        </div>
      </SidePanel>
    </>
  );
}
