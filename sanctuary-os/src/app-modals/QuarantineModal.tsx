import React from 'react';
import { useLexicon } from "../LexiconContext";

export function QuarantineModal({ showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod }: any) {
  const { t } = useLexicon();

  if (!showQuarantineModal) return null;

  return (
    <div className="fixed inset-0 z-[150000] flex items-center justify-center bg-[var(--bg)]/90 backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="theme-glass-panel border-2 theme-border-danger p-8 rounded-[var(--radius)] w-full max-w-2xl shadow-2xl flex flex-col gap-6" style={{ color: 'var(--text)' }}>
        <h2 className="text-3xl font-black uppercase text-red-500 tracking-tighter flex items-center gap-3"><span className="material-symbols-outlined !text-4xl text-red-500">{t("icon_warning_amber")}</span> {t("quarantine_modal_title")}</h2>
        <p className="opacity-80 font-bold text-sm">{t("quarantine_modal_desc")}</p>
        
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {quarantineList.length > 0 ? quarantineList.map((q: string) => (
            <div key={q} className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 transition-colors">
              <span className="font-mono text-xs opacity-90 truncate flex-1">{q}</span>
              <div className="flex gap-2 shrink-0 ml-4">
                <button onClick={() => restoreMod(q)} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-500/40 transition-colors">{t("quarantine_modal_restore")}</button>
                <button onClick={() => purgeMod(q)} className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-red-500/40 transition-colors">{t("quarantine_modal_purge")}</button>
              </div>
            </div>
          )) : (
            <div className="text-[var(--text)] text-center opacity-50 p-4 italic">{t("quarantine_modal_empty")}</div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={() => setShowQuarantineModal(false)} className="px-8 h-12 theme-btn-standard text-[var(--text)] font-black text-xs tracking-widest rounded-2xl transition-colors">{t("nav_cancel")}</button>
        </div>
      </div>
    </div>
  );
}
