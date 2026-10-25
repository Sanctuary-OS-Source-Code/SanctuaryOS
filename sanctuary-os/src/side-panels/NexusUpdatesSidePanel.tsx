import React from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
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
      widthClass="w-[90vw] md:w-[680px]"
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
          title={t(
            "nexus_updates_subtitle",
            "Available updates for your installed Nexus assets."
          )}
          description={t(
            "no_updates_available",
            "Inspect and synchronize the latest versions of your installed Chameleons, Lexicons, and Templates."
          )}
          badge={`${nexusAvailableUpdates.length}`}
          badgeIcon={t("icon_new_releases", "new_releases")}
          variant="accent"
        />

        <UniversalGroup
          title={t("nexus_updates_title", "Available Updates")}
          icon={t("icon_new_releases", "new_releases")}
        >
          {nexusAvailableUpdates.length === 0 ? (
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("no_updates_available", "All assets are up to date")}
              minHeightClass="min-h-[180px]"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {nexusAvailableUpdates.map((update, idx) => (
                <div
                  key={`${update.id}-${idx}`}
                  onClick={() => {
                    useStore.getState().setView("nexus");
                    setNexusPreviewAsset({ id: update.id, type: update.type });
                    setIsNexusUpdatesPanelOpen(false);
                  }}
                  className="cursor-pointer glass-surface rounded-xl px-4 py-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[22px]">
                        {update.type === "chameleon"
                          ? t("icon_palette", "palette")
                          : update.type === "lexicon"
                            ? t("icon_translate", "translate")
                            : t("icon_extension", "extension")}
                      </span>
                    </div>

                    <div className="flex flex-col justify-center min-w-0 gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-black text-sm tracking-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate m-0">
                          {update.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] uppercase tracking-wider font-black shrink-0">
                          {update.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-black text-[var(--danger)] bg-transparent px-2 py-0.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] line-through">
                          v{update.oldVersion}
                        </span>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)] opacity-60">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-black text-[var(--success)] bg-transparent px-2 py-0.5 rounded-lg border border-[color-mix(in_srgb,var(--success)_40%,transparent)]">
                          v{update.newVersion}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-center text-[var(--subtext)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </UniversalGroup>

        {nexusAvailableUpdates.length > 0 && (
          <ActionButton
            variant="glass"
            icon={t("icon_done_all", "done_all")}
            label={t("dismiss_all", "Dismiss All")}
            onClick={() => {
              setNexusUpdatesCount(0);
              setIsNexusUpdatesPanelOpen(false);
            }}
            className="w-full"
          />
        )}
      </div>
    </SidePanel>
  );
}
