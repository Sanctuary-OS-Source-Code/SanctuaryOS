import React from 'react';
import { useLexicon } from "../LexiconContext";

export function RenameModal({ renameModal, setRenameModal, executeRename, renameTarget, setRenameTarget, nameInput, setNameInput, confirmRename }: any) {
  const { t } = useLexicon();

  if (!renameModal && !renameTarget) return null;

  return (
    <>
      {renameModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[var(--radius)] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("rename_title")}</h2>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
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
                className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
              />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-3 theme-btn-standard font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                  {t("shared_cancel")}
                </button>
                <button onClick={executeRename} className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                  {t("btn_rename")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {renameTarget && (
        <div className="fixed inset-0 z-10000 flex items-center justify-center bg-[var(--bg)]/10 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="w-full max-w-md theme-glass-panel border theme-border-accent rounded-[var(--radius)] p-8 shadow-2xl">
            <h3 className="text-xs font-black tracking-[0.3em] theme-text-accent uppercase mb-6 flex items-center gap-2"><span className="w-2 h-2 theme-bg-accent rounded-full animate-pulse"></span>{t("redesignate_title")}</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text)]/40 uppercase tracking-widest ml-1">{t("redesignate_label")}</label>
                <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setRenameTarget(null)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-[var(--text)]/60 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all">{t("btn_abort")}</button>
                <button onClick={confirmRename} className="flex-1 px-4 py-3 rounded-xl theme-bg-accent text-[var(--bg)] text-[10px] font-bold uppercase tracking-widest hover:opacity-90 shadow-lg transition-all">{t("btn_confirm")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
