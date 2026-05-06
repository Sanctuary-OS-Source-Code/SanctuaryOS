import { useLexicon } from "./LexiconContext";


export function DefconAlert({ backupProgress }: any) {
  const { t } = useLexicon();
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-3xl animate-in fade-in duration-300 p-8">
           <div className="w-full max-w-2xl bg-red-950/40 border border-red-500/50 rounded-[3rem] p-12 text-center flex flex-col items-center gap-8 shadow-[0_0_150px_rgba(255,0,0,0.4)]">
              <span className="text-8xl animate-bounce">⚠️</span>
              <div className="flex flex-col gap-2">
                 <h2 className="text-4xl font-black text-red-500 tracking-tighter uppercase">{t("defcon_alert_title")}</h2>
                 <h3 className="text-xl font-bold text-red-300 uppercase tracking-widest">{t("defcon_patch_detected")}</h3>
              </div>
              <p className="text-sm font-bold text-red-200/60 leading-relaxed uppercase tracking-widest max-w-md">
                 {t("defcon_sealing_desc")}
              </p>
              {backupProgress ? (
                <div className="w-full flex flex-col gap-2 mt-4">
                   <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-red-300">
                     <span>{backupProgress.action}</span>
                     <span>{backupProgress.current} / {backupProgress.total}</span>
                   </div>
                   <div className="w-full bg-[var(--bg)]/40 rounded-full h-2 overflow-hidden border border-red-500/20">
                     <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${Math.max(5, (backupProgress.current / backupProgress.total) * 100)}%` }}></div>
                   </div>
                </div>
              ) : (
                <div className="w-full bg-[var(--bg)]/40 rounded-full h-2 mt-4 overflow-hidden border border-red-500/20">
                   <div className="h-full bg-red-500 animate-pulse w-full"></div>
                </div>
              )}
           </div>
        </div>
  );
}
