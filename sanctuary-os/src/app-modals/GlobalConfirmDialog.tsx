import { useLexicon } from "../LexiconContext";
import { useModalStore } from "../store/modalStore";

export function GlobalConfirmDialog() {
  const { t } = useLexicon();
  const confirmDialog = useModalStore((state: any) => state.confirmDialog);
  const setConfirmDialog = useModalStore((state: any) => state.setConfirmDialog);

  if (!confirmDialog) return null;

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-[var(--bg)]/30 backdrop-blur-md">
      {confirmDialog.isDefcon ? (
        <div className="relative w-full max-w-4xl bg-white/[0.02] backdrop-blur-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-[var(--radius)] p-12 shadow-[0_40px_100px_color-mix(in_srgb,var(--danger)_20%,transparent),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col gap-8 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] blur-[120px] pointer-events-none mix-blend-screen" />
          <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] animate-pulse pointer-events-none" />
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-transparent opacity-80" />
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_20%,transparent)] to-transparent opacity-80" />
          
          <div className="flex items-start gap-8 relative z-10 text-left">
            <div className="relative w-32 h-32 rounded-2xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center shrink-0 shadow-[0_0_30px_color-mix(in_srgb,var(--danger)_20%,transparent),inset_0_0_20px_color-mix(in_srgb,var(--danger)_10%,transparent)]">
              <div className="absolute inset-0 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] animate-ping opacity-30"></div>
              <span className="material-symbols-outlined !text-6xl text-[var(--danger)] animate-pulse drop-shadow-[0_0_15px_var(--danger)]">{t("icon_warning_amber") || "warning"}</span>
            </div>
            <div className="flex flex-col gap-3 pt-2 flex-1">
              <h2 className="text-5xl font-black text-white tracking-tighter uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] leading-none">
                {confirmDialog.title || t("defcon_alert_title") || "GLOBAL ALERT"}
              </h2>
              <div className="w-full h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-transparent my-3"></div>
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--subtext)] leading-relaxed max-w-2xl whitespace-pre-line opacity-90">
                {confirmDialog.message}
              </p>
            </div>
          </div>

          <div className="flex gap-6 w-full mt-4 relative z-10">
             <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className="flex-1 py-5 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all shadow-[0_0_30px_color-mix(in_srgb,var(--danger)_30%,transparent)] hover:shadow-[0_0_50px_color-mix(in_srgb,var(--danger)_50%,transparent)] hover:scale-[1.02] active:scale-95 backdrop-blur-md">
               {confirmDialog.confirmText || t("btn_proceed") || "PROCEED"}
             </button>
             <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="flex-1 py-5 bg-white/[0.03] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-white/[0.08] text-[var(--subtext)] hover:text-[var(--text)] rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all hover:scale-[1.02] shadow-sm active:scale-95">
               {confirmDialog.cancelText || t("nav_cancel") || "CANCEL"}
             </button>
          </div>
        </div>
      ) : (
        <div className={`relative w-[500px] bg-white/[0.02] backdrop-blur-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col gap-8 text-center animate-in zoom-in-95 duration-300 overflow-hidden`}>
          <div className={`absolute top-0 left-0 w-full h-1 ${confirmDialog.isAlert ? "bg-[var(--warning)] shadow-[0_0_20px_var(--warning)]" : "bg-[var(--accent)] shadow-[0_0_20px_var(--accent)]"}`} />
          <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full opacity-20 blur-[80px] pointer-events-none ${confirmDialog.isAlert ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`} />

          <div className="flex justify-center mt-2 relative z-10">
             <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-md ${confirmDialog.isAlert ? "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]" : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"}`}>
               <span className="material-symbols-outlined !text-4xl drop-shadow-md">{confirmDialog.isAlert ? 'warning' : 'help_center'}</span>
             </div>
          </div>

          <div className="flex flex-col gap-4 relative z-10">
            {confirmDialog.title && <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] drop-shadow-sm">{confirmDialog.title}</h2>}
            <h3 className="text-[var(--subtext)] text-sm font-medium tracking-wide whitespace-pre-line leading-relaxed m-0">{confirmDialog.message}</h3>
          </div>

          <div className="flex gap-4 w-full mt-4 relative z-10">
            {confirmDialog.isAlert ? (
              <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className={`flex-1 py-4 bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg hover:scale-[1.02] active:scale-95`}>{confirmDialog.confirmText || t("btn_ok") || "OK"}</button>
            ) : (
              <>
                <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className={`flex-1 py-4 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg hover:scale-[1.02] active:scale-95`}>{confirmDialog.confirmText || t("btn_proceed") || "PROCEED"}</button>
                <button onClick={() => { if (confirmDialog.cancelAction) confirmDialog.cancelAction(); else setConfirmDialog(null); }} className="flex-1 py-4 bg-white/[0.03] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-white/[0.08] text-[var(--text)] rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-95">{confirmDialog.cancelText || t("nav_cancel") || "CANCEL"}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
