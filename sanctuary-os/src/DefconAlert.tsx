import { useLexicon } from "./LexiconContext";

export function DefconAlert({ backupProgress }: any) {
  const { t } = useLexicon();
  return (
    <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl animate-in fade-in duration-500 p-8">
      {/* Scanline overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(239,68,68,0.05)_1px,transparent_1px)] bg-[size:100_4px] pointer-events-none opacity-30"></div>
      
      <div className="relative w-full max-w-4xl theme-glass-panel border-2 border-red-600/50 rounded-[3rem] p-12 shadow-[0_0_80px_rgba(220,38,38,0.2)] flex flex-col gap-8 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(239,68,68,0.03)_25%,transparent_25%,transparent_50%,rgba(239,68,68,0.03)_50%,rgba(239,68,68,0.03)_75%,transparent_75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50"></div>
        <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80"></div>
        <div className="absolute bottom-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80"></div>
        
        {/* Inner content */}
        <div className="flex items-start gap-8 relative z-10 text-left">
          <div className="relative w-32 h-32 rounded-3xl bg-red-900/20 border border-red-500/50 flex items-center justify-center text-6xl shrink-0 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
            <div className="absolute inset-0 rounded-3xl border-2 border-red-500/40 animate-ping opacity-50"></div>
            <span className="material-symbols-outlined !text-6xl text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">warning</span>
          </div>

          <div className="flex flex-col gap-4 pt-2 flex-1">
            <h2 className="text-5xl font-black text-red-500 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] leading-none">{t("defcon_alert_title")}</h2>
            <h3 className="text-xl font-bold text-red-400 uppercase tracking-[0.3em] opacity-80">{t("defcon_patch_detected")}</h3>
            <div className="w-full h-px bg-gradient-to-r from-red-500/50 to-transparent my-2"></div>
            <p className="text-sm font-bold text-red-300/90 leading-relaxed uppercase tracking-[0.2em] max-w-2xl">
              {t("defcon_sealing_desc")}
            </p>
          </div>
        </div>

        {/* Progress Bar Section */}
        <div className="relative z-10 w-full mt-2 theme-glass-inner p-8 rounded-[2rem] border border-red-500/20 flex flex-col gap-4 shadow-inner">
          {backupProgress ? (
            <>
              <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-[0.3em] text-red-400">
                <span className="truncate pr-4">{backupProgress.action}</span>
                <span className="shrink-0">{backupProgress.current} / {backupProgress.total}</span>
              </div>
              <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden border border-red-500/20 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-300 relative" 
                  style={{ width: `${Math.max(5, (backupProgress.current / backupProgress.total) * 100)}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-[0.3em] text-red-400">
                <span>{t("defcon_init_secure")}</span>
                <span className="animate-pulse">{t("defcon_stand_by")}</span>
              </div>
              <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden border border-red-500/20 shadow-inner">
                <div className="h-full bg-gradient-to-r from-red-700 to-red-400 animate-pulse w-full"></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
