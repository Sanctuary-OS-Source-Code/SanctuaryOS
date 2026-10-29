import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  openModDossier,
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
      backdropZ="z-[125000]"
      panelZ="z-[125001]"
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
          badge={`${casualties.length} ${t("term_mods", "Items")}`}
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
                onClick={() => openModDossier(c)}
                className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_delete", "delete")}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                    {String(c).replace(/_/g, " ")}
                  </span>
                </div>
                <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                  <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                    {t("icon_link_off", "link_off")}
                  </span>
                  <span>{t("protocol_override", "Dependent")}</span>
                </span>
              </div>
            ))}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
