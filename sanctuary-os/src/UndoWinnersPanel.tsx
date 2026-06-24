import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { SidePanel, formatDisplayName } from "./shared";
import { useStore } from './store';

interface UndoWinnersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  scanScope: string;
  onUndoComplete: () => void;
  onUndo: (fileName: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export default function UndoWinnersPanel({ isOpen, onClose, scanScope, onUndoComplete, onUndo, onClearAll }: UndoWinnersPanelProps) {
  const { t } = useLexicon();
  const [overrides, setOverrides] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchOverrides();
    }
  }, [isOpen, scanScope]);

  const fetchOverrides = async () => {
    setLoading(true);
    try {
      const list: string[] = [];
      const savedSets = localStorage.getItem("sanctuary_playsets");
      if (savedSets) {
        const playsets = JSON.parse(savedSets);
        const currentSet = playsets.find((p: any) => p.name === scanScope);
        if (currentSet && Array.isArray(currentSet.mods)) {
          const blueprintOverrides = currentSet.mods
            .filter((m: string) => m.toLowerCase().startsWith("sanctuary/") || m.toLowerCase().startsWith("sanctuary\\"))
            .map((m: string) => m.replace(/^Sanctuary[/\\]/i, ""));
          for (const o of blueprintOverrides) {
            if (!list.includes(o)) list.push(o);
          }
        }
      }
      setOverrides(list);
    } catch (err) {
      console.error("Failed to load overrides", err);
    }
    setLoading(false);
  };

  const undoOverride = async (fileName: string) => {
    try {
      await onUndo(fileName);
      onUndoComplete();
      onClose();
    } catch (err) {
      useStore.getState().pushStatus(`Undo Error: ${err}`);
    }
  };

  const clearAllOverrides = async () => {
    try {
      await onClearAll();
      onUndoComplete();
      onClose();
    } catch (err) {
      useStore.getState().pushStatus(`Error: ${err}`);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("radar_undo_title") || "REVERT OVERRIDES"}
      subtitle={t("radar_undo_subtitle") || "MANAGE WINNERS"}
      icon="history"
      iconColorClass="text-[var(--danger)] border-[var(--danger)]/30"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      widthClass="w-[525px]"
      footer={
        <div className="flex flex-col gap-3 w-full">
          <button 
            onClick={clearAllOverrides}
            disabled={overrides.length === 0}
            className={`flex-1 py-4 text-xs font-black tracking-widest uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${
              overrides.length === 0 
                ? "bg-white/5 text-white/20 cursor-not-allowed"
                : "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] shadow-lg hover:scale-105"
            }`}
          >
            <span className="material-symbols-outlined !text-sm">{t("ui_icon_warning") || "warning_amber"}</span>
            <span>{t("wf_health_clear_all_overrides") || "CLEAR ALL OVERRIDES"}</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 h-full px-2">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-white/20">
            <span className="material-symbols-outlined animate-spin !text-4xl">{t("ui_icon_sync") || "sync"}</span>
          </div>
        ) : overrides.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-white/20 text-center">
            <span className="material-symbols-outlined !text-4xl mb-4">{t("ui_icon_check_circle") || "check_circle"}</span>
            <p className="text-sm font-black tracking-widest uppercase">{t("radar_no_overrides") || "No Active Overrides"}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {overrides.map((file) => (
              <div key={file} className="flex items-center justify-between p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 hover:border-white/10 transition-all">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-xl text-[var(--accent)]">{t("ui_icon_extension") || "extension"}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-[var(--text)] truncate block">{formatDisplayName(file.replace(/\.(package|ts4script)$/i, ''))}</span>
                    <span className="text-[9px] font-black tracking-widest uppercase text-[var(--subtext)] opacity-60">
                      {file.match(/\.ts4script$/i) ? "SCRIPT" : "PACKAGE"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => undoOverride(file)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text)] opacity-50 hover:opacity-100 hover:text-[var(--accent)] hover:scale-110 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined !text-lg">{t("ui_icon_undo") || "undo"}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
