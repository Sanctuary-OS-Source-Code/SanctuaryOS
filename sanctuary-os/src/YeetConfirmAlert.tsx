import { useLexicon } from "./LexiconContext";
import { SidePanel, standardDangerButtonClass, standardButtonClass } from "./shared";

export function YeetConfirmAlert({ yeetConfirmPending, setYeetConfirmPending,  }: any) {
  const { t } = useLexicon();
  
  return (
    <SidePanel
      isOpen={!!yeetConfirmPending}
      onClose={() => setYeetConfirmPending(null)}
      title={t("yeet_cascade_detected")}
      subtitle={t("yeet_removing_following")}
      icon={t("ui_icon_warning")}
      iconColorClass="theme-text-danger animate-pulse drop-shadow-[0_0_8px_rgba(var(--danger-rgb),0.6)]"
      backdropZ="z-[65000]"
      panelZ="z-[65001]"
      widthClass="w-[600px]"
      footer={
        <div className="flex flex-row justify-center gap-4 w-full">
          <button
            onClick={() => setYeetConfirmPending(null)}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_close")}</span>
            {t("yeet_btn_abort")}
          </button>
          <button
            onClick={() => { yeetConfirmPending.onConfirm(); setYeetConfirmPending(null); }}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--danger-rgb),0.2)]"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_trash")}</span>
            {t("yeet_btn_confirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {yeetConfirmPending.casualties.map((c: any, i: number) => (
          <div key={i} className="flex items-center gap-4 text-left bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-4 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-sm hover:scale-[1.02] transition-transform">
            <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined theme-text-danger !text-[18px]">{t("ui_icon_trash")}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-[var(--text)] truncate">{c.replace(/_/g, " ")}</span>
              <span className="text-[9px] font-bold theme-text-danger uppercase tracking-widest opacity-80">{t("modcard_override_exclusive")}</span>
            </div>
          </div>
        ))}
      </div>
    </SidePanel>
  );
}
