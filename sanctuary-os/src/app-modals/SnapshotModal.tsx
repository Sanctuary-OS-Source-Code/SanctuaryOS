import React from 'react';
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

export function SnapshotModal({ snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot }: any) {
  const { t } = useLexicon();
  const { playSets, activePlaySetIndex } = useStore();

  if (!snapshotModal) return null;

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[var(--radius)] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("snapshot_title")}</h2>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
            {t("snapshot_desc1")} <span className="text-[var(--text)]">{playSets[activePlaySetIndex]?.mods?.length || 0}</span> {t("snapshot_desc2")}
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <input 
            autoFocus 
            type="text" 
            value={snapshotName} 
            onChange={(e) => setSnapshotName(e.target.value)} 
            onKeyDown={(e) => e.key === "Enter" && executeSnapshot()} 
            placeholder={t("snapshot_placeholder")}
            className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
          />
          <div className="flex gap-3 mt-2">
            <button onClick={() => setSnapshotModal(false)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
              {t("nav_cancel")}
            </button>
            <button onClick={executeSnapshot} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
              {t("ui_btn_save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
