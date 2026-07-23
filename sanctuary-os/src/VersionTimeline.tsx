import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from './LexiconContext';
import { SidePanel, standardPrimaryButtonClass, SearchBar } from './shared';
import { useTheme } from './ThemeContext';

export default function VersionTimeline({ 
  filePath, 
  onRestore, 
  onClose, 
  hasUnsavedChanges = false,
  activeVersionTimestamp
}: { 
  filePath: string, 
  onRestore: (content: string, timestamp: number) => void, 
  onClose: () => void, 
  hasUnsavedChanges?: boolean,
  activeVersionTimestamp?: number | null
}) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [history, setHistory] = useState<{ timestamp: number, content: string, pinned?: boolean, name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<{ timestamp: number, content: string, pinned?: boolean, name?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

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

  async function saveName(timestamp: number) {
    if (editingTimestamp !== timestamp) return;
    try {
      await invoke('rename_version', { path: filePath, timestamp, name: editNameValue });
      setHistory(prev => prev.map(h => h.timestamp === timestamp ? { ...h, name: editNameValue } : h));
    } catch (e) {
      console.error("Failed to rename version", e);
    }
    setEditingTimestamp(null);
  }

  async function deleteVersion(timestamp: number) {
    try {
      await invoke('delete_version', { path: filePath, timestamp });
      setHistory(prev => prev.filter(h => h.timestamp !== timestamp));
      setConfirmDelete(null);
      if (selectedEntry?.timestamp === timestamp) {
        setSelectedEntry(null);
      }
    } catch (e) {
      console.error("Failed to delete version", e);
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
      title={t("btn_timeline")}
      onClose={onClose}
      icon={t("icon_history")}
      iconColorClass="theme-text-accent"
      widthClass="w-[500px]"
      noBackdropDim={true}
    >
      <div className="flex flex-col gap-6 w-full h-full relative z-10" style={{ color: currentTheme.text }}>
        <div className="px-1 mt-1">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder={t("timeline_search")} />
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center h-40 opacity-50 gap-4">
            <span className="material-symbols-outlined !text-4xl animate-spin">{t("icon_sync")}</span>
            <div className="text-[10px] uppercase font-black tracking-widest">{t("timeline_loading")}</div>
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-4">
            <span className="material-symbols-outlined !text-4xl">{t("icon_history_toggle_off")}</span>
            <div className="text-[10px] uppercase font-black tracking-[0.2em] max-w-[200px] text-center">
              {t("timeline_empty")}
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

          const latestTimestamp = history.length > 0 ? Math.max(...history.map(h => h.timestamp)) : 0;
          const currentActiveTs = activeVersionTimestamp || latestTimestamp;

          if (filteredHistory.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-4">
                <span className="material-symbols-outlined !text-4xl">{t("icon_search_off")}</span>
                <div className="text-[10px] uppercase font-black tracking-[0.2em] max-w-[200px] text-center">
                  {t("search_empty")}
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
                  onClick={() => {
                    setSelectedEntry(entry);
                  }}
                >
                  <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col gap-1 flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2">
                        {entry.pinned && <span className="material-symbols-outlined !text-[12px] text-[var(--accent)] shrink-0">{t("icon_push_pin")}</span>}
                        {editingTimestamp === entry.timestamp ? (
                          <input
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onBlur={() => saveName(entry.timestamp)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveName(entry.timestamp);
                              else if (e.key === 'Escape') setEditingTimestamp(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-transparent border-b border-[var(--accent)] text-xs font-black uppercase tracking-widest outline-none text-[var(--text)] w-full placeholder:opacity-30"
                            placeholder={t("rename_snapshot")}
                          />
                        ) : (
                          <span
                            className={`text-xs font-black uppercase tracking-widest cursor-text ${selectedEntry?.timestamp === entry.timestamp ? 'theme-text-accent' : 'opacity-80'} hover:opacity-100 flex items-center gap-2 group min-w-0`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTimestamp(entry.timestamp);
                              setEditNameValue(entry.name || "");
                            }}
                          >
                            <span className="truncate block">{entry.name || t("unnamed_snapshot")}</span>
                            <span className="material-symbols-outlined !text-[14px] opacity-0 group-hover:opacity-50 transition-opacity">edit</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold font-mono tracking-widest opacity-50 flex items-center gap-2">
                        <span>{new Date(entry.timestamp * 1000).toLocaleDateString()}</span>
                        <span>{new Date(entry.timestamp * 1000).toLocaleTimeString()}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {entry.timestamp === currentActiveTs && !searchQuery && (
                        <div className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center gap-1">
                          {t("active_version")}
                        </div>
                      )}
                      {!entry.pinned && (
                        confirmDelete === entry.timestamp ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text)] bg-black/20 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all"
                            >
                              <span className="material-symbols-outlined !text-[14px]">close</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteVersion(entry.timestamp); }}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 bg-red-500/10 backdrop-blur-md border border-red-500/30 hover:bg-red-500/30 hover:text-white hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all"
                            >
                              <span className="material-symbols-outlined !text-[14px]">delete</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry.timestamp); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                          >
                            <span className="material-symbols-outlined !text-[16px]">delete</span>
                          </button>
                        )
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(entry.timestamp, !entry.pinned); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${entry.pinned ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-white hover:bg-white/10 border-transparent hover:border-white/20'} border`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_push_pin")}</span>
                      </button>
                    </div>
                  </div>

                  {selectedEntry?.timestamp === entry.timestamp && (
                    <div className="flex flex-col gap-4 mt-2 animate-in fade-in slide-in-from-top-2">
                      <div className="bg-black/20 p-4 rounded-xl max-h-48 overflow-y-auto custom-scrollbar border border-white/10 shadow-inner backdrop-blur-sm">
                        <pre className="text-[11px] font-mono opacity-80 whitespace-pre-wrap leading-relaxed text-[var(--text)]">{entry.content.substring(0, 500)}{entry.content.length > 500 ? '\n\n... [TRUNCATED] ...' : ''}</pre>
                      </div>
                      {!(entry.timestamp === currentActiveTs && !searchQuery) && (
                        confirmRestore === entry.timestamp ? (
                          <div className="flex flex-col gap-2 mt-2">
                            {hasUnsavedChanges && <div className="text-[10px] font-black uppercase text-[var(--danger)] text-center tracking-widest">{t("unsaved_warning")}</div>}
                            <div className="flex items-center gap-2 w-full">
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmRestore(null); }}
                                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl text-[var(--text)] hover:bg-white/10 transition-all`}
                              >
                                {t("cancel")}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onRestore(entry.content, entry.timestamp); onClose(); }}
                                className={`h-12 flex-[2] rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center gap-2`}
                              >
                                {hasUnsavedChanges ? (t("confirm_nuke")) : (t("confirm_restore"))}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmRestore(entry.timestamp); }}
                            className={`h-12 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 w-full mt-2`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">{t("icon_restore")}</span>
                            {t("restore_btn")}
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
