import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";

export function DefconAlert() {
  const { t } = useLexicon();
  const backupProgress = useStore((state) => state.backupProgress);
  const setShowDefconAlert = useModalStore((state) => state.setShowDefconAlert);
  const isBackingUp = useModalStore((state) => state.isBackingUp);

  return (
    <div className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-[var(--bg)]/30 backdrop-blur-md animate-in fade-in duration-500 p-8">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] blur-[120px] pointer-events-none mix-blend-screen" />
      
      <div className="relative w-full max-w-4xl bg-white/[0.02] backdrop-blur-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] rounded-[var(--radius)] p-12 shadow-[0_40px_100px_color-mix(in_srgb,var(--danger)_20%,transparent),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col gap-8 overflow-hidden">
        <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] animate-pulse pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-transparent opacity-80" />
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_20%,transparent)] to-transparent opacity-80" />
        
        <div className="flex items-start gap-8 relative z-10 text-left">
          <div className="relative w-32 h-32 rounded-2xl bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shrink-0 shadow-[0_0_30px_color-mix(in_srgb,var(--danger)_10%,transparent),inset_0_0_20px_color-mix(in_srgb,var(--danger)_5%,transparent)]">
            <div className="absolute inset-0 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] animate-ping opacity-30" />
            <span className="material-symbols-outlined !text-6xl text-[var(--danger)] animate-pulse drop-shadow-[0_0_15px_var(--danger)]">{t("icon_warning_amber") || "warning"}</span>
          </div>

          <div className="flex flex-col gap-3 pt-2 flex-1">
            <h2 className="text-5xl font-black text-white tracking-tighter uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] leading-none">{t("defcon_alert_title")}</h2>
            <h3 className="text-xl font-bold text-[var(--danger)] uppercase tracking-[0.3em] opacity-90 drop-shadow-[0_0_10px_color-mix(in_srgb,var(--danger)_30%,transparent)]">{t("defcon_patch_detected")}</h3>
            <div className="w-full h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent my-3" />
            <p className="text-sm font-bold text-[var(--subtext)] leading-relaxed uppercase tracking-[0.15em] max-w-2xl opacity-80 whitespace-pre-line">
              {t(!isBackingUp ? "defcon_sealing_desc_secured" : (backupProgress?.action?.toLowerCase().includes("world") ? "defcon_sealing_desc_world" : "defcon_sealing_desc_engine"))}
            </p>
          </div>
        </div>

        {isBackingUp && (
          <div className="relative z-10 w-full mt-4 bg-[var(--bg)]/10 backdrop-blur-xl p-8 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex flex-col gap-6 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
            {backupProgress ? (
            <>
              <div className="flex justify-between items-end text-[11px] font-black uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--danger)_90%,transparent)] drop-shadow-[0_0_10px_color-mix(in_srgb,var(--danger)_20%,transparent)]">
                <span className="truncate pr-4">{backupProgress.action}</span>
                <span className="shrink-0 opacity-80">{backupProgress.current} / {backupProgress.total}</span>
              </div>
              <div className="w-full bg-black/80 rounded-full h-3 overflow-hidden border border-[color-mix(in_srgb,var(--danger)_10%,transparent)] shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)]">
                <div 
                  className="h-full bg-gradient-to-r from-[color-mix(in_srgb,var(--danger)_50%,transparent)] via-[color-mix(in_srgb,var(--danger)_80%,transparent)] to-[var(--danger)] transition-all duration-300 relative shadow-[0_0_10px_color-mix(in_srgb,var(--danger)_50%,transparent)]" 
                  style={{ width: `${Math.max(2, (backupProgress.current / backupProgress.total) * 100)}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
                  <div className="absolute top-0 right-0 w-10 h-full bg-gradient-to-r from-transparent to-white/30 blur-sm" />
                </div>
              </div>
            </>
            ) : (
              <>
                <div className="flex justify-between items-end text-[11px] font-black uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--danger)_90%,transparent)]">
                  <span>{t("defcon_init_secure")}</span>
                  <span className="animate-pulse opacity-80">{t("defcon_stand_by")}</span>
                </div>
                <div className="w-full bg-black/80 rounded-full h-3 overflow-hidden border border-[color-mix(in_srgb,var(--danger)_10%,transparent)] shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)]">
                  <div className="h-full w-full bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] relative">
                    <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-transparent animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!isBackingUp && (
          <div className="relative z-10 w-full mt-4 flex flex-col items-center justify-center gap-6 py-4">
            <button
              onClick={() => setShowDefconAlert(false)}
              className="mt-2 px-8 py-3 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] rounded-full text-xs font-black text-[color-mix(in_srgb,var(--danger)_80%,transparent)] uppercase tracking-[0.2em] transition-all duration-300 shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-[0_0_25px_color-mix(in_srgb,var(--danger)_40%,transparent)]"
            >
              {t("defcon_btn_dismiss")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
