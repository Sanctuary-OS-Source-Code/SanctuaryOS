import { useLexicon } from "./LexiconContext";

export function YeetConfirmAlert({ yeetConfirmPending, setYeetConfirmPending,  }: any) {
  const { t } = useLexicon();
  
  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-[var(--bg)]/10 backdrop-blur-3xl animate-in fade-in duration-200 p-8">
          <div className="theme-glass-panel border border-white/10 w-full max-w-md rounded-[2.5rem] p-10 flex flex-col items-center gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center">
            <span className="text-6xl animate-pulse drop-shadow-md">{t("ui_icon_warning")}</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h2 className="text-xl font-black theme-text-danger uppercase tracking-tighter">{t("modcard_yeet_cascade") || "YEET CASCADE DETECTED"}</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">{t("modcard_removes") || "REMOVING THIS WILL ALSO YEET THE FOLLOWING"}</p>
            </div>
            <div className="w-full bg-[var(--bg)]/40 border border-[var(--text)]/5 rounded-2xl p-4 flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar shadow-inner">
              {yeetConfirmPending.casualties.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-left bg-black/5 p-2 rounded-xl">
                  <span className="theme-text-danger text-xs">{t("ui_icon_trash")}</span>
                  <span className="text-xs font-black theme-text-danger truncate">{c.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => { yeetConfirmPending.onConfirm(); setYeetConfirmPending(null); }}
                className="flex-1 py-4 theme-bg-danger text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all hover:scale-105 shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)]"
              >
                {t("yeet_btn_confirm") || "CONFIRM YEET"}
              </button>
              <button
                onClick={() => setYeetConfirmPending(null)}
                className="flex-1 py-4 theme-glass-inner text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl border border-white/5 transition-all hover:bg-white/5 shadow-sm"
              >
                {t("yeet_btn_abort") || "ABORT MISSION"}
              </button>
            </div>
          </div>
        </div>
  );
}
