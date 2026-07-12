import React from 'react';
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";

export function LocalFolderModal({ localFolderModal, setLocalFolderModal, localFolderType, setLocalFolderType, localFolderName, setLocalFolderName, createLocalFolder }: any) {
  const { t } = useLexicon();

  if (!localFolderModal) return null;

  return createPortal(
    <>
      <div className="fixed top-0 right-0 bottom-10 z-[115000] bg-black/0 backdrop-blur-[2px] animate-in fade-in duration-500 transition-all" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setLocalFolderModal(false)} />
      <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[115001] animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
        <button onClick={() => setLocalFolderModal(false)} className="absolute top-12 right-6 z-50 w-12 h-12 bg-black/40 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--text)]/70 hover:text-[var(--success)] rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:scale-110 active:scale-95">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
        </button>

        <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <span className="material-symbols-outlined theme-text-success !leading-none" style={{ fontSize: '100px' }}>{t("icon_create_new_folder")}</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--success)_30%,transparent)] to-transparent pointer-events-none" />
        </div>
        
        <div className="px-10 pt-8 pb-4 relative shrink-0">
          <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{t("local_folder_title")}</h3>
          <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
            {t("local_folder_desc")}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner mb-2">
              <button onClick={() => setLocalFolderType("FOLDER")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "FOLDER" ? 'theme-bg-success text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("folder")}</button>
              <button onClick={() => setLocalFolderType("CC_SET")} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localFolderType === "CC_SET" ? 'theme-bg-accent text-[var(--bg)] shadow-md' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}>{t("collection")}</button>
            </div>
            <input 
              autoFocus 
              type="text" 
              value={localFolderName} 
              onChange={(e) => setLocalFolderName(e.target.value)} 
              onKeyDown={(e) => e.key === "Enter" && createLocalFolder()} 
              placeholder={localFolderType === "CC_SET" ? "Collection Name..." : "Folder Name..."}
              className={`w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none transition-all ${localFolderType === "CC_SET" ? 'focus:theme-border-accent' : 'focus:theme-border-success'}`} 
            />
          </div>
        </div>
        
        <div className="p-8 flex justify-center items-center gap-4 shrink-0 relative z-20 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md">
          <button onClick={createLocalFolder} className="px-16 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center justify-center gap-2">
            <span className="material-symbols-outlined !text-[18px]">{t("icon_folder_open")}</span>
            {t("btn_create_folder")}
          </button>
        </div>
      </div>
    </>, document.body
  );
}
