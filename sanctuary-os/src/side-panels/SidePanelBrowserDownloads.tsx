import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { ActionButton, HoverTooltip } from '../shared';

export function SidePanelBrowserDownloads({
  downloadsQueue,
  setDownloadsQueue,
}: {
  downloadsQueue: string[];
  setDownloadsQueue: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const { t } = useLexicon();

  if (downloadsQueue.length === 0) return null;

  const markDownloadProcessed = (filePath: string) => {
    const w: any = window;
    if (!w.__processedDownloads || typeof w.__processedDownloads.set !== 'function') {
      w.__processedDownloads = new Map();
    }
    w.__processedDownloads.set(filePath, Date.now());
  };

  return (
    <div className="shrink-0 mx-4 mb-4 sm:mx-5 sm:mb-5 mt-0 glass-panel rounded-2xl p-4 flex flex-col gap-3 z-50 relative">
      <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[18px] animate-bounce">
              {t("icon_download", "download")}
            </span>
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
            {t("browser_downloads_intercepted", "Downloads Intercepted")}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_inventory_2", "inventory_2")}
            </span>
            {downloadsQueue.length}
          </span>
          {downloadsQueue.length > 1 && (
            <button
              type="button"
              onClick={() => {
                downloadsQueue.forEach(markDownloadProcessed);
                setDownloadsQueue([]);
              }}
              className="glass-surface px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] hover:!border-[color-mix(in_srgb,var(--danger)_40%,transparent)] transition-all"
            >
              {t("dismiss_all", "Dismiss All")}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[240px] overflow-y-auto custom-scrollbar pr-0.5">
        {downloadsQueue.map((filePath) => {
          const fileName = filePath.split(/[/\\]/).pop() || t("unknown", "Unknown");
          return (
            <div
              key={filePath}
              className="glass-surface p-3.5 rounded-2xl flex flex-col justify-between gap-3 group hover:!border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.28))] transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 opacity-85">
                  {t("icon_archive", "archive")}
                </span>
                <span className="text-xs font-bold text-[var(--text)] truncate flex-1">
                  {fileName}
                  <HoverTooltip title={fileName} />
                </span>
              </div>

              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("btn_ignore", "Ignore")}
                    className="!w-full !py-2 !px-3 !rounded-xl !text-[10px]"
                    onClick={() => {
                      markDownloadProcessed(filePath);
                      setDownloadsQueue((prev) => prev.filter((p) => p !== filePath));
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <ActionButton
                    variant="accent"
                    icon={t("icon_download", "download")}
                    label={t("btn_import", "Import")}
                    className="!w-full !py-2 !px-3 !rounded-xl !text-[10px]"
                    onClick={async () => {
                      try {
                        markDownloadProcessed(filePath);
                        setDownloadsQueue((prev) => prev.filter((p) => p !== filePath));
                        const moveOriginal =
                          (localStorage.getItem("sanctuary_ingest_file_mode") || "copy") === "move";
                        await invoke("ingest_dropped_file", {
                          path: filePath,
                          forceReplace: false,
                          targetFolder: null,
                          moveOriginal,
                        });
                      } catch (err) {
                        console.error("Failed to ingest file", err);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
