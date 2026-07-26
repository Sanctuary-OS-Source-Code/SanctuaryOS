import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';

export function SidePanelBrowserDownloads({ downloadsQueue, setDownloadsQueue }: { downloadsQueue: string[], setDownloadsQueue: React.Dispatch<React.SetStateAction<string[]>> }) {
  const { t } = useLexicon();

  if (downloadsQueue.length === 0) return null;

  return (
    <div className="shrink-0 m-4 mt-0 theme-glass-panel border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] rounded-[var(--radius)] p-4 flex flex-col gap-3 z-50 animate-in slide-in-from-bottom-10 backdrop-blur-3xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] animate-bounce">download</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">{t("browser_downloads_intercepted")}</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-2 py-0.5 rounded-full">{downloadsQueue.length}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto accent-scrollbar p-1">
        {downloadsQueue.map(filePath => {
          const fileName = filePath.split(/[/\\]/).pop() || "Unknown File";
          return (
            <div key={filePath} className="flex flex-col justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group shadow-sm hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all">
              <span className="text-[11px] font-bold text-[var(--text)] truncate mb-3" title={fileName}>{fileName}</span>
              <div className="flex gap-2 justify-end w-full">
                <button
                  onClick={() => {
                    const w: any = window;
                    if (!w.__processedDownloads || typeof w.__processedDownloads.set !== 'function') {
                      w.__processedDownloads = new Map();
                    }
                    w.__processedDownloads.set(filePath, Date.now());
                    setDownloadsQueue(prev => prev.filter(p => p !== filePath));
                  }}
                  className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-red-500/20 text-[var(--subtext)] hover:text-red-400 border border-transparent hover:border-red-500/30"
                >
                  {t("browser_ignore")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const w: any = window;
                      if (!w.__processedDownloads || typeof w.__processedDownloads.set !== 'function') {
                        w.__processedDownloads = new Map();
                      }
                      w.__processedDownloads.set(filePath, Date.now());
                      setDownloadsQueue(prev => prev.filter(p => p !== filePath));
                      await invoke("ingest_dropped_file", { path: filePath, forceReplace: false, targetFolder: null });
                      await invoke("delete_local_file", { path: filePath });
                    } catch (err) {
                      console.error("Failed to ingest file", err);
                      alert(`Failed to ingest file: ${err}`);
                    }
                  }}
                  className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)]"
                >
                  {t("browser_import")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
