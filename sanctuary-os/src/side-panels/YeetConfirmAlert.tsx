import { useLexicon } from "../LexiconContext";
import { SidePanel, standardDangerButtonClass, standardButtonClass, ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";

export function YeetConfirmAlert({ yeetConfirmPending, setYeetConfirmPending, }: any) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={!!yeetConfirmPending}
      onClose={() => setYeetConfirmPending(null)}
      title={t("yeet_cascade_detected")}
      subtitle={t("yeet_removing_following")}
      icon={t("icon_warning_amber")}
      iconColorClass="theme-text-danger animate-pulse drop-shadow-[0_0_8px_rgba(var(--danger-rgb),0.6)]"
      backdropZ="z-[100002]"
      panelZ="z-[100002]"
      widthClass="w-[600px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_close") || "close"}
            tooltip={t("yeet_btn_abort")}
            onClick={() => setYeetConfirmPending(null)}
          />
          <PanelHeaderButton
            icon={t("icon_delete") || "delete"}
            tooltip={t("yeet_btn_confirm")}
            variant="error"
            onClick={() => { yeetConfirmPending.onConfirm(); setYeetConfirmPending(null); }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-3">
        {yeetConfirmPending.casualties.map((c: any, i: number) => (
          <div key={i} className="flex items-center gap-4 text-left bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-4 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-sm hover:scale-[1.02] transition-transform">
            <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined theme-text-danger !text-[18px]">{t("icon_delete")}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-[var(--text)] truncate">{c.replace(/_/g, " ")}</span>
              <span className="text-[9px] font-bold theme-text-danger capitalize tracking-widest opacity-80">{t("protocol_override")}</span>
            </div>
          </div>
        ))}
      </div>
    </SidePanel>
  );
}


