import React from 'react';
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";

export function BulkModal({ bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods }: any) {
  const { t } = useLexicon();

  if (!bulkModal) return null;

  return createPortal(
    <>
      <div className="fixed top-0 right-0 bottom-10 z-[115000] bg-black/0 backdrop-blur-[2px] animate-in fade-in duration-500 transition-all" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setBulkModal(false)} />
      <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[115001] animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
        <button onClick={() => setBulkModal(false)} className="absolute top-12 right-6 z-50 w-12 h-12 bg-black/40 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--text)]/70 hover:text-[var(--accent)] rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-110 active:scale-95">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
        </button>

        <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <span className="material-symbols-outlined text-[var(--accent)] !leading-none" style={{ fontSize: '100px' }}>{t("icon_architecture")}</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent pointer-events-none" />
        </div>
        
        <div className="px-10 pt-8 pb-4 relative shrink-0">
          <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{t("bulk_title")}</h3>
          <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
            {t("bulk_desc1")} <span className="text-[var(--text)] font-black">{selectedMods?.length || 0}</span> {t("bulk_desc2")}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
          <div className="space-y-4">
            <input 
              autoFocus 
              type="text" 
              value={bulkName} 
              onChange={(e) => setBulkName(e.target.value)} 
              onKeyDown={(e) => e.key === "Enter" && executeBulkDraft()} 
              placeholder={t("draft_placeholder")}
              className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all" 
            />
          </div>
        </div>
        
        <div className="p-8 flex justify-center items-center gap-4 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <button 
            onClick={executeBulkDraft}
            className="px-16 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("icon_add_box")}</span>
            {t("btn_draft")}
          </button>
        </div>
      </div>
    </>, document.body
  );
}
