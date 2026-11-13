import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  VAULT_CHIP_CLASS,
  openModDossier,
} from "../shared";

export function YeetConfirmAlert({
  yeetConfirmPending,
  setYeetConfirmPending,
}: any) {
  const { t } = useLexicon();

  if (!yeetConfirmPending) return null;

  const isHighlanderSwap = yeetConfirmPending?.mode === "highlander_swap";

  const handleConfirm = () => {
    const cb = yeetConfirmPending.onConfirm;
    setYeetConfirmPending(null);
    cb?.();
  };

  const handleKeepBoth = () => {
    const cb = yeetConfirmPending.onKeepBoth;
    setYeetConfirmPending(null);
    cb?.();
  };

  if (isHighlanderSwap) {
    const rivals: { name: string; displayName: string; slotLabel?: string }[] =
      Array.isArray(yeetConfirmPending?.rivals) ? yeetConfirmPending.rivals : [];
    const slotName = String(yeetConfirmPending?.slotName || "").trim();
    const targetTitle = String(yeetConfirmPending?.targetTitle || "").trim();
    const panelTitle = slotName
      ? `${t("highlander_exclusive_slot", "Exclusive Slot")}: ${slotName}`
      : t("flavor_swap", "Flavor Swap");

    return (
      <SidePanel
        isOpen={!!yeetConfirmPending}
        onClose={() => setYeetConfirmPending(null)}
        title={panelTitle}
        subtitle={targetTitle || t("swap_alert_subtitle", "Review active slot replacement before equipping")}
        icon={t("icon_swap_horiz", "swap_horiz")}
        iconColorClass="text-[var(--accent)]"
        backdropZ="z-[125000]"
        panelZ="z-[125001]"
        widthClass="w-[90vw] md:w-[620px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_swap_horiz", "swap_horiz")}
              tooltip={t("btn_swap_mods", "Swap {Mods}")}
              variant="accent"
              onClick={handleConfirm}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_swap_horiz", "swap_horiz")}
            overline={t("highlander_exclusive_slot", "Exclusive Slot")}
            title={panelTitle}
            description={t(
              "highlander_swap_prompt_desc",
              "Another {mod} in this exclusive slot is already equipped. Swap to replace it cleanly, or keep both equipped and track the overlap in Conflict Radar."
            )}
            badge={
              slotName || `${rivals.length} ${t("term_mods", "{Mods}")}`
            }
            badgeIcon={t("icon_swap_horiz", "swap_horiz")}
            variant="accent"
          >
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_close", "close")}
                label={t("cancel", "Cancel")}
                onClick={() => setYeetConfirmPending(null)}
              />
              {yeetConfirmPending?.onKeepBoth && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_layers", "layers")}
                  label={t("btn_keep_both", "Keep Both")}
                  onClick={handleKeepBoth}
                />
              )}
              <ActionButton
                variant="accent"
                icon={t("icon_swap_horiz", "swap_horiz")}
                label={t("btn_swap_mods", "Swap {Mods}")}
                onClick={handleConfirm}
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={`${t("flavor_replaced", "Will Replace")} (${rivals.length})`}
            icon={t("icon_swap_horiz", "swap_horiz")}
            headerColorClass="text-[var(--accent)]"
          >
            <div className="flex flex-col gap-2.5">
              {rivals.map((rv, i) => (
                <div
                  key={rv.name || i}
                  onClick={() => {
                    if (rv.name) openModDossier(rv.name);
                  }}
                  className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_swap_horiz", "swap_horiz")}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                        {rv.displayName || String(rv.name || "").replace(/_/g, " ")}
                      </span>
                      {rv.slotLabel && (
                        <span className="text-[10px] font-semibold text-[var(--subtext)] truncate">
                          {t("highlander_exclusive_slot", "Exclusive Slot")}: {rv.slotLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                      {t("icon_swap_horiz", "swap_horiz")}
                    </span>
                    <span>{t("flavor_replaced", "Will Replace")}</span>
                  </span>
                </div>
              ))}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    );
  }

  const casualties: string[] = Array.isArray(yeetConfirmPending?.casualties)
    ? yeetConfirmPending.casualties
    : [];

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
        >
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <ActionButton
              variant="glass"
              icon={t("icon_close", "close")}
              label={t("cancel", "Cancel")}
              onClick={() => setYeetConfirmPending(null)}
            />
            <ActionButton
              variant="danger"
              icon={t("icon_delete", "delete")}
              label={t("yeet_btn_confirm", "Confirm Removal")}
              onClick={handleConfirm}
            />
          </div>
        </SidePanelHeroCard>

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
