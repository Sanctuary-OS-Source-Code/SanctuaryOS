import React from 'react';
import { useLexicon } from "../LexiconContext";
import { ActionButton } from "../shared";

export function RenameModal({ renameModal, setRenameModal, executeRename, renameTarget, setRenameTarget, nameInput, setNameInput, confirmRename }: any) {
  const { t } = useLexicon();

  if (!renameModal && !renameTarget) return null;

  return (
    <>
      {renameModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-2xl p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-2xl font-black capitalize theme-text-accent tracking-tighter mb-1">{t("rename_title")}</h2>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                {t("rename_desc")}
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <input 
                autoFocus 
                type="text" 
                value={renameModal.newName} 
                onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value }) } 
                onKeyDown={(e) => e.key === "Enter" && executeRename()} 
                className="w-full glass-surface px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
              />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] capitalize tracking-widest rounded-xl transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  {t("nav_cancel")}
                </button>
                <ActionButton onClick={executeRename} className="flex-1 shrink-0 h-12" label={t("btn_rename")} />
              </div>
            </div>
          </div>
        </div>
      )}
      {renameTarget && (
        <div className="fixed inset-0 z-10000 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_10%,transparent)] backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel border theme-border-accent rounded-2xl p-8 shadow-2xl">
            <h3 className="text-xs font-black tracking-[0.3em] theme-text-accent capitalize mb-6 flex items-center gap-2"><span className="w-2 h-2 theme-bg-accent rounded-full animate-pulse"></span>{t("rename_title")}</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[color-mix(in_srgb,var(--text)_40%,transparent)] capitalize tracking-widest ml-1">{t("redesignate_label")}</label>
                <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setRenameTarget(null)} className="flex-1 px-4 py-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[color-mix(in_srgb,var(--text)_60%,transparent)] text-[10px] font-bold capitalize tracking-widest hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">{t("btn_abort")}</button>
                <ActionButton onClick={confirmRename} className="flex-1 shrink-0 h-12" label={t("btn_confirm")} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


