import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";

export function NexusUpdatesSidePanel() {
  const { t } = useLexicon();
  const { isNexusUpdatesPanelOpen, setIsNexusUpdatesPanelOpen, setNexusPreviewAsset } =
    useModalStore();
  const nexusAvailableUpdates =
    useStore((state) => state.nexusAvailableUpdates) || [];
  const setNexusUpdatesCount = useStore((state) => state.setNexusUpdatesCount);

  if (!isNexusUpdatesPanelOpen) return null;

  const getAssetIcon = (type: string) =>
    type === "chameleon"
      ? t("icon_palette", "palette")
      : type === "lexicon"
        ? t("icon_translate", "translate")
        : t("icon_extension", "extension");

  const getAssetTypeLabel = (type: string) =>
    type === "chameleon"
      ? t("tab_chameleons", "Chameleon")
      : type === "lexicon"
        ? t("tab_lexicons", "Lexicon")
        : t("workbench_templates", "Template");

  return (
    <SidePanel
      isOpen={isNexusUpdatesPanelOpen}
      onClose={() => setIsNexusUpdatesPanelOpen(false)}
      title={t("nexus_updates_title", "Nexus Updates")}
      subtitle={t(
        "nexus_updates_subtitle",
        "Available updates for your installed Nexus assets."
      )}
      icon={t("icon_cloud_download", "cloud_download")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_done_all", "done_all")}
            tooltip={t("dismiss_all", "Dismiss All")}
            variant="default"
            onClick={() => {
              setNexusUpdatesCount(0);
              setIsNexusUpdatesPanelOpen(false);
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_cloud_download", "cloud_download")}
          overline={t("nexus_updates_title", "Nexus Updates")}
          title={`${nexusAvailableUpdates.length} ${t("updates_available_title", "Updates Available")}`}
          description={t(
            "nexus_updates_subtitle",
            "Available updates for your installed Nexus assets."
          )}
          badge={`${nexusAvailableUpdates.length}`}
          badgeIcon={t("icon_new_releases", "new_releases")}
          variant="accent"
        />

        <UniversalGroup
          title={`${t("updates_available_title", "Updates Available")} (${nexusAvailableUpdates.length})`}
          icon={t("icon_new_releases", "new_releases")}
        >
          {nexusAvailableUpdates.length === 0 ? (
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("no_updates_available", "All assets are up to date")}
              minHeightClass="min-h-[180px]"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {nexusAvailableUpdates.map((update, idx) => {
                const assetIcon = getAssetIcon(update.type);
                const assetTypeLabel = getAssetTypeLabel(update.type);

                const handleOpenUpdate = () => {
                  useStore.getState().setView("nexus");
                  setNexusPreviewAsset({ id: update.id, type: update.type });
                  setIsNexusUpdatesPanelOpen(false);
                };

                return (
                  <div
                    key={`${update.id}-${idx}`}
                    onClick={handleOpenUpdate}
                    className="cursor-pointer glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all flex flex-col justify-between gap-3 group"
                  >
                    {/* Top Row: Full-Width Icon + Name/Subtitle Identity */}
                    <div className="flex items-center gap-3 min-w-0 w-full">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-rounded !text-[20px]">
                          {assetIcon}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="relative group/nxtitle flex items-center min-w-0 w-fit max-w-full">
                          <h3 className="font-black text-sm tracking-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors leading-snug truncate m-0">
                            {update.name}
                          </h3>
                          <HoverTooltip
                            className="z-[200]"
                            title={update.name}
                            icon={assetIcon}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-[var(--subtext)] truncate">
                          {assetTypeLabel}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Footer Row: Version Chips on Left | Inspect Action on Right */}
                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={`${VAULT_CHIP_CLASS} line-through opacity-75`}>
                          <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                            {t("icon_history", "history")}
                          </span>
                          <span>v{update.oldVersion}</span>
                        </span>
                        <span className="material-symbols-rounded !text-[12px] text-[var(--subtext)] opacity-60">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                            {t("icon_new_releases", "new_releases")}
                          </span>
                          <span>v{update.newVersion}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenUpdate();
                          }}
                          className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_open_in_new", "open_in_new")}
                          </span>
                          <HoverTooltip
                            title={t("inspect", "Inspect")}
                            variant="accent"
                            className="group-hover/btn:flex z-[200] !right-0 !translate-x-0 !left-auto"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
