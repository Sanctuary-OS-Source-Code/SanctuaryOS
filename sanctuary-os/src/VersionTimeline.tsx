import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from './LexiconContext';
import { SidePanel, standardPrimaryButtonClass, SearchBar } from './shared';
import { useTheme } from './ThemeContext';

export default function VersionTimeline({ filePath, onRestore, onClose, hasUnsavedChanges = false }: { filePath: string, onRestore: (content: string) => void, onClose: () => void, hasUnsavedChanges?: boolean }) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [history, setHistory] = useState<{timestamp: number, content: string, pinned?: boolean}[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<{timestamp: number, content: string, pinned?: boolean} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  async function togglePin(timestamp: number, pinned: boolean) {
    try {
      await invoke('toggle_pin_version', { path: filePath, timestamp, pinned });
      setHistory(prev => {
        const next = prev.map(h => h.timestamp === timestamp ? { ...h, pinned } : h);
        return next.sort((a, b) => {
          const aPinned = a.pinned || false;
          const bPinned = b.pinned || false;
          if (aPinned !== bPinned) return aPinned ? -1 : 1;
          return b.timestamp - a.timestamp;
        });
      });
    } catch (e) {
      console.error("Failed to toggle pin", e);
    }
  }

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const res: any = await invoke('get_file_history', { path: filePath });
        setHistory(res || []);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
      setLoading(false);
    }
    fetchHistory();
  }, [filePath]);

  return (
    <SidePanel 
        isOpen={true} 
        title={t("timeline_title") || "VERSION TIMELINE"} 
        onClose={onClose} 
        icon={t("ui_icon_history") || "history"}
        iconColorClass="theme-text-accent"
        widthClass="w-[500px]"
        noBackdropDim={true}
    >
      <div className="flex flex-col gap-6 w-full h-full relative z-10" style={{ color: currentTheme.text }}>
        <div className="px-1 mt-1">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder={t("timeline_search") || "Search dates..."} />
        </div>

        {loading && (
           <div className="flex flex-col items-center justify-center h-40 opacity-50 gap-4">
              <span className="material-symbols-outlined !text-4xl animate-spin">{t("ui_icon_sync") || "sync"}</span>
              <div className="text-[10px] uppercase font-black tracking-widest">{t("timeline_loading") || "LOADING TIMELINE..."}</div>
           </div>
        )}
        
        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-4">
             <span className="material-symbols-outlined !text-4xl">{t("ui_icon_history_toggle_off") || "history_toggle_off"}</span>
             <div className="text-[10px] uppercase font-black tracking-[0.2em] max-w-[200px] text-center">
               {t("timeline_empty") || "No versions found for this file."}
             </div>
          </div>
        )}

        {!loading && history.length > 0 && (() => {
          const filteredHistory = history.filter(entry => {
             if (!searchQuery) return true;
             const q = searchQuery.toLowerCase();
             const d = new Date(entry.timestamp * 1000);
             return d.toLocaleDateString().toLowerCase().includes(q) || d.toLocaleTimeString().toLowerCase().includes(q);
          });
          
          if (filteredHistory.length === 0) {
             return (
               <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-4">
                 <span className="material-symbols-outlined !text-4xl">{t("ui_icon_search_off") || "search_off"}</span>
                 <div className="text-[10px] uppercase font-black tracking-[0.2em] max-w-[200px] text-center">
                   {t("timeline_search_empty") || "No matching versions"}
                 </div>
               </div>
             );
          }
          
          return (
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 pb-10 pt-2 px-1">
               {filteredHistory.map((entry, idx) => (
                  <div 
                     key={entry.timestamp} 
                     className={`p-5 rounded-2xl border flex flex-col gap-4 transition-all cursor-pointer ${selectedEntry?.timestamp === entry.timestamp ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:-translate-y-1 hover:shadow-lg'} ${entry.pinned && selectedEntry?.timestamp !== entry.timestamp ? '!border-[color-mix(in_srgb,var(--accent)_15%,transparent)]' : ''}`}
                     onClick={() => setSelectedEntry(entry)}
                  >
                     <div className="flex justify-between items-center">
                       <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {entry.pinned && <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("ui_icon_push_pin") || "push_pin"}</span>}
                            <span className={`text-xs font-black uppercase tracking-widest ${selectedEntry?.timestamp === entry.timestamp ? 'theme-text-accent' : 'opacity-80'}`}>
                              {new Date(entry.timestamp * 1000).toLocaleDateString()}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold font-mono tracking-widest opacity-50">
                            {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                          </span>
                       </div>
                       
                       <div className="flex items-center gap-3">
                         {idx === 0 && !searchQuery && (
                            <div className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center gap-1">
                               <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_5px_var(--accent)]" />
                               {t("timeline_active_version") || "ACTIVE VERSION"}
                            </div>
                         )}
                         <button 
                           onClick={(e) => { e.stopPropagation(); togglePin(entry.timestamp, !entry.pinned); }}
                           className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${entry.pinned ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-white hover:bg-white/10 border-transparent hover:border-white/20'} border`}
                         >
                           <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_push_pin") || "push_pin"}</span>
                         </button>
                       </div>
                     </div>
                   
                   {selectedEntry?.timestamp === entry.timestamp && (
                      <div className="flex flex-col gap-4 mt-2 animate-in fade-in slide-in-from-top-2">
                        <div className="bg-black/20 p-4 rounded-xl max-h-48 overflow-y-auto custom-scrollbar border border-white/10 shadow-inner backdrop-blur-sm">
                           <pre className="text-[11px] font-mono opacity-80 whitespace-pre-wrap leading-relaxed text-[var(--text)]">{entry.content.substring(0, 500)}{entry.content.length > 500 ? '\n\n... [TRUNCATED] ...' : ''}</pre>
                        </div>
                        {!(idx === 0 && !searchQuery) && (
                          confirmRestore === entry.timestamp ? (
                             <div className="flex flex-col gap-2 mt-2">
                               {hasUnsavedChanges && <div className="text-[10px] font-black uppercase text-[var(--danger)] text-center tracking-widest">{t("timeline_unsaved_warning") || "WARNING: UNSAVED CHANGES WILL BE LOST"}</div>}
                               <div className="flex items-center gap-2">
                                  <button 
                                     onClick={(e) => { e.stopPropagation(); setConfirmRestore(null); }}
                                     className={`h-12 flex-1 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center gap-2`}
                                  >
                                     {t("timeline_cancel_restore") || "CANCEL"}
                                  </button>
                                  <button 
                                     onClick={(e) => { e.stopPropagation(); onRestore(entry.content); onClose(); }}
                                     className={`h-12 flex-[2] rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center gap-2`}
                                  >
                                     {hasUnsavedChanges ? (t("timeline_confirm_nuke") || "DISCARD EDITS & RESTORE") : (t("timeline_confirm_restore") || "CONFIRM RESTORE")}
                                  </button>
                               </div>
                             </div>
                          ) : (
                             <button 
                                onClick={(e) => { e.stopPropagation(); setConfirmRestore(entry.timestamp); }}
                                className={`h-12 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 w-full mt-2`}
                             >
                                <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_restore") || "restore"}</span>
                                {t("timeline_restore_btn") || "RESTORE THIS VERSION"}
                             </button>
                          )
                        )}
                      </div>
                   )}
                </div>
             ))}
          </div>
          );
        })()}
      </div>
    </SidePanel>
  );
}
