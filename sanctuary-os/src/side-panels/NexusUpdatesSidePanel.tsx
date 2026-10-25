import React from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
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
                    <div
                      className="w-10 h-10 rounded-xl glass-surface border flex items-center justify-center shrink-0 text-[var(--accent)]"
                      style={{
                        borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                      }}
                    >
                      <span className="material-symbols-rounded !text-[20px]">
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
                        <span
                          className={VAULT_CHIP_CLASS}
                          style={{
                            color: "var(--accent)",
                            borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {update.type === "chameleon"
                              ? t("icon_palette", "palette")
                              : update.type === "lexicon"
                                ? t("icon_translate", "translate")
                                : t("icon_extension", "extension")}
                          </span>
                          <span>{update.type}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`${VAULT_CHIP_CLASS} line-through`}
                          style={{
                            color: "var(--danger)",
                            borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {t("icon_history", "history")}
                          </span>
                          <span>v{update.oldVersion}</span>
                        </span>
                        <span className="material-symbols-rounded !text-[12px] text-[var(--subtext)] opacity-60">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                        <span
                          className={VAULT_CHIP_CLASS}
                          style={{
                            color: "var(--success)",
                            borderColor: "color-mix(in srgb, var(--success) 35%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {t("icon_new_releases", "new_releases")}
                          </span>
                          <span>v{update.newVersion}</span>
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
