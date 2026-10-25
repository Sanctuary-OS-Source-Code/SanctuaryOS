import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";

export function YeetConfirmAlert({
  yeetConfirmPending,
  setYeetConfirmPending,
}: any) {
  const { t } = useLexicon();

  if (!yeetConfirmPending) return null;

  const casualties: string[] = Array.isArray(yeetConfirmPending?.casualties)
    ? yeetConfirmPending.casualties
    : [];

  const handleConfirm = () => {
    yeetConfirmPending.onConfirm?.();
    setYeetConfirmPending(null);
  };

  return (
    <SidePanel
      isOpen={!!yeetConfirmPending}
      onClose={() => setYeetConfirmPending(null)}
      title={t("yeet_cascade_detected", "Cascade Removal Detected")}
      subtitle={t(
        "yeet_removing_following",
        "Removing the following dependent artifacts"
      )}
      icon={t("icon_warning_amber", "warning")}
      iconColorClass="text-[var(--danger)] animate-pulse"
      backdropZ="z-[100002]"
      panelZ="z-[100003]"
      widthClass="w-[90vw] md:w-[620px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_delete", "delete")}
            tooltip={t("yeet_btn_confirm", "Confirm Removal")}
            variant="danger"
            onClick={handleConfirm}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_warning_amber", "warning")}
          overline={t("protocol_override", "Protocol Override")}
          title={t("yeet_cascade_detected", "Cascade Removal Detected")}
          description={t(
            "yeet_removing_following",
            "These dependent artifacts require the target module and will also be unequipped."
          )}
          badge={`${casualties.length} ${t("items", "Items")}`}
          badgeIcon={t("icon_delete", "delete")}
          variant="danger"
        />

        <UniversalGroup
          title={`${t("yeet_removing_following", "Affected Artifacts")} (${casualties.length})`}
          icon={t("icon_delete", "delete")}
          headerColorClass="text-[var(--danger)]"
        >
          <div className="flex flex-col gap-2.5">
            {casualties.map((c: any, i: number) => (
              <div
                key={i}
                className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_delete", "delete")}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                    {String(c).replace(/_/g, " ")}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] shrink-0">
                  {t("protocol_override", "Dependent")}
                </span>
              </div>
            ))}
          </div>
        </UniversalGroup>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <ActionButton
            variant="glass"
            icon={t("icon_close", "close")}
            label={t("yeet_btn_abort", "Cancel")}
            onClick={() => setYeetConfirmPending(null)}
            className="w-full"
          />
          <ActionButton
            variant="glass"
            icon={t("icon_delete", "delete")}
            label={t("yeet_btn_confirm", "Confirm Removal")}
            onClick={handleConfirm}
            className="w-full !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
          />
        </div>
      </div>
    </SidePanel>
  );
}
