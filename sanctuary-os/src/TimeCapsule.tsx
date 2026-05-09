import { useLexicon } from "./LexiconContext";
import { ViewHeader } from "./shared";

export default function TimeCapsule({
  selectedVersion, isBackingUp, triggerPrePatchSnapshot, triggerFullEngineBackup,
  restoreGameBackup, openRenameUI, deleteBackup, backupList, getBackupSignature
}: any) {
  const { t } = useLexicon();
  
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
      <ViewHeader title={t("backups_title")} subtitle={t("backups_subtitle")}>
        <div className="flex gap-4 items-center ml-auto shrink-0">
          <div className="flex flex-col bg-black/10 border border-white/5 rounded-2xl px-4 py-2 min-w-[160px] justify-center items-center">
            <span className="text-[7px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest leading-none mb-1">{t("backups_target_patch")}</span>
            <span className="text-[10px] font-black text-[var(--text)] tracking-widest uppercase">{selectedVersion || "1.123.66.1020"} Detected</span>
          </div>
          
          <button 
            onClick={triggerPrePatchSnapshot} 
            disabled={isBackingUp}
            className="w-[220px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center shrink-0 gap-2 theme-btn-standard"
          >
            <span className="text-[14px]">{t("ui_icon_world")}</span> <span>{t("backups_btn_universe")}</span>
          </button>
          
          <button 
            onClick={triggerFullEngineBackup} 
            disabled={isBackingUp}
            className="w-[220px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center shrink-0 gap-2 bg-white/5 border border-white/10 text-[var(--text)] hover:bg-white/10"
          >
            <span className="text-[14px]">{t("ui_icon_engine")}</span> <span>{t("backups_btn_seal")}</span>
          </button>
        </div>
      </ViewHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {backupList?.length > 0 ? (
          backupList.map((backupName: string) => {
            const sig = getBackupSignature ? getBackupSignature(backupName) : null;
            const isEngine = sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
            const title = sig?.alias || (isEngine ? t("backups_engine_full") : t("backups_world_state"));
            const icon = isEngine ? t("ui_icon_engine") : t("ui_icon_world");
            
            return (
              <div key={backupName} className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-[2.5rem] flex flex-col gap-6 shadow-xl min-h-[12rem]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner">{icon}</div>
                  <div className="flex flex-col overflow-hidden max-w-[calc(100%-4rem)]">
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tighter uppercase leading-none mb-1 truncate">{title}</h3>
                    <p className="text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 truncate">
                      {sig ? `${sig.version} • ${sig.timestamp !== "0" ? new Date(Number(sig.timestamp)*1000).toLocaleDateString() : ""}` : backupName.replace(".tar.zst", "")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => restoreGameBackup && restoreGameBackup(backupName)} className="flex-[3] py-3 bg-white/5 border border-white/10 text-[var(--text)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-sm">
                    {t("backups_btn_restore")}
                  </button>
                  <button onClick={() => openRenameUI && openRenameUI(backupName)} className="flex-1 py-3 bg-white/5 border border-white/10 text-[var(--warning)] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center">
                    {t("ui_icon_edit")}
                  </button>
                  <button onClick={() => deleteBackup && deleteBackup(backupName)} className="flex-1 py-3 bg-white/5 border border-[var(--danger)] text-[var(--danger)] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center">
                    {t("ui_icon_trash")}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full flex items-center justify-center h-48 bg-white/5 backdrop-blur-md border border-white/10 rounded-[2.5rem] shadow-xl">
            <span className="text-[var(--subtext)] font-black uppercase tracking-widest opacity-60">No Backups Found</span>
          </div>
        )}
      </div>
      
    </div>
  );
}
