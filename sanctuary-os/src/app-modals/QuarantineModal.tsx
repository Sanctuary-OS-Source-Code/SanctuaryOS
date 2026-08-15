import React from 'react';
import { useLexicon } from "../LexiconContext";

export function QuarantineModal({ showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod }: any) {
  const { t } = useLexicon();

  if (!showQuarantineModal) return null;

  return (
    <div className="fixed inset-0 z-[150000] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="glass-panel border-2 theme-border-danger p-8 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col gap-6" style={{ color: 'var(--text)' }}>
        <h2 className="text-3xl font-black capitalize text-red-500 tracking-tighter flex items-center gap-3"><span className="material-symbols-outlined text-red-500">{t("icon_warning_amber")}</span> {t("quarantine_modal_title")}</h2>
        <p className="opacity-80 font-bold text-sm">{t("quarantine_modal_desc")}</p>
        
        <div className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-4 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {quarantineList.length > 0 ? quarantineList.map((q: string) => (
            <div key={q} className="flex justify-start items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-4 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors">
              <span className="font-mono text-xs opacity-90 truncate flex-1">{q}</span>
              <div className="flex gap-2 shrink-0 ml-4">
                <button onClick={() => restoreMod(q)} className="px-4 py-2 bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-emerald-400 border border-[color-mix(in_srgb,var(--success)_30%,transparent)] rounded-lg text-xs font-black capitalize tracking-widest hover:bg-[color-mix(in_srgb,var(--success)_40%,transparent)] transition-colors">{t("quarantine_modal_restore")}</button>
                <button onClick={() => purgeMod(q)} className="px-4 py-2 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-400 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-lg text-xs font-black capitalize tracking-widest hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] transition-colors">{t("quarantine_modal_purge")}</button>
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


