import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  ActionButton,
  SidePanelHeroCard,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
} from "../shared";
import {
  getSupporterState,
  setDevBuildChannelPreference,
  syncUpdateChannelNotification,
  LocalSupporterStatePayload,
} from "../utils/supporterManager";
import packageJson from "../../package.json";

export interface SupporterCelebrationPayload {
  devBuildUntil: number;
  monthsAdded: number;
  daysAdded: number;
  remainingDays: number;
  expiryDateStr: string;
}

export function SupporterCelebrationSidePanel() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const vaultPath = useStore((state: any) => state.vaultPath);

  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<SupporterCelebrationPayload | null>(
    null,
  );
  const [supporterState, setSupporterState] =
    useState<LocalSupporterStatePayload | null>(null);

  const refreshState = async () => {
    try {
      const latest = await getSupporterState(vaultPath, session?.user?.id);
      setSupporterState(latest);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handleOpenCelebration = (e: Event) => {
      const customEvent = e as CustomEvent<SupporterCelebrationPayload>;
      if (customEvent.detail) {
        setPayload(customEvent.detail);
      }
      setIsOpen(true);
      refreshState();
    };

    const handleSupporterUpdated = () => {
      if (isOpen) {
        refreshState();
      }
    };

    window.addEventListener(
      "sanctuary-supporter-celebration",
      handleOpenCelebration,
    );
    window.addEventListener(
      "sanctuary-supporter-updated",
      handleSupporterUpdated,
    );
    return () => {
      window.removeEventListener(
        "sanctuary-supporter-celebration",
        handleOpenCelebration,
      );
      window.removeEventListener(
        "sanctuary-supporter-updated",
        handleSupporterUpdated,
      );
    };
  }, [isOpen, vaultPath, session?.user?.id]);

  const nowSecs = Math.floor(Date.now() / 1000);
  const devBuildUntil =
    supporterState?.dev_build?.dev_build_until || payload?.devBuildUntil || 0;
  const isDevBuildUnlocked = devBuildUntil > nowSecs;
  const remainingDays =
    devBuildUntil > nowSecs
      ? Math.ceil((devBuildUntil - nowSecs) / 86400)
      : payload?.remainingDays || 30;
  const monthsAdded = Math.max(1, Number(payload?.monthsAdded || 1));
  const daysAdded = payload?.daysAdded || monthsAdded * 30;
  const expiryDateStr =
    devBuildUntil > 0
      ? new Date(devBuildUntil * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : payload?.expiryDateStr ||
        t("supporter_active_channel_label", "Active Stream");

  const totalMonths =
    supporterState?.dev_build?.total_months_unlocked ||
    Math.max(1, Math.round(remainingDays / 30));
  const creditDollars = (
    (supporterState?.dev_build?.donation_credit_cents || 0) / 100
  ).toFixed(2);
  const channelEnabled =
    supporterState?.dev_build?.channel_enabled !== undefined
      ? supporterState.dev_build.channel_enabled
      : true;

  const daysUnit = t("supporter_celebration_days_unit", "Days");
  const monthUnit =
    monthsAdded === 1
      ? t("supporter_celebration_month_unit", "Month")
      : t("supporter_celebration_months_unit", "Months");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={t("supporter_celebration_title", "Supporter Access Extended!")}
      subtitle={t(
        "supporter_spoke_panel_subtitle",
        "0% Platform Fee • Every $5 adds +30 days of Global Daily Dev Builds",
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[620px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_verified", "verified")}
          overline={t(
            "supporter_celebration_badge",
            "Donation Processed • Dev Channel Active",
          )}
          title={t("supporter_celebration_title", "Supporter Access Extended!")}
          description={t(
            "supporter_celebration_desc",
            "Thank you for supporting the Sanctuary OS ecosystem! Your Global Daily Dev Build timer has been automatically stacked and synced to your account.",
          )}
          badge={`+${daysAdded} ${daysUnit}`}
          badgeIcon={t("icon_bolt", "bolt")}
          variant="success"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            <StatBox
              icon={t("icon_bolt", "bolt")}
              iconColorClass="text-[var(--accent)]"
              label={t("supporter_celebration_stat_added", "Time Added")}
              value={`+${daysAdded} ${daysUnit}`}
              tooltipSubtitle={`+${monthsAdded} ${monthUnit}`}
            />
            <StatBox
              icon={t("icon_verified", "verified")}
              iconColorClass="text-[var(--success)]"
              label={t("supporter_celebration_stat_balance", "Active Timer")}
              value={`${remainingDays} ${daysUnit}`}
              tooltipSubtitle={t(
                "supporter_days_remaining_suffix",
                "Days Remaining",
              )}
            />
            <StatBox
              icon={t("icon_calendar_month", "calendar_month")}
              iconColorClass="text-[var(--accent)]"
              label={t("supporter_celebration_stat_expires", "New Expiration")}
              value={expiryDateStr}
              tooltipSubtitle={t(
                "supporter_active_channel_label",
                "Active Stream",
              )}
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t(
            "supporter_dev_builds_channel_toggle",
            "Daily Dev Build Channel",
          )}
          icon={t("icon_bolt", "bolt")}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("supporter_stat_time_remaining", "Active Time Remaining")}
            </span>
            <span className="text-lg font-black text-[var(--text)] whitespace-nowrap">
              {remainingDays}{" "}
              {t("supporter_days_remaining_suffix", "Days Remaining")}
            </span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
              {totalMonths} {t("supporter_months_suffix", "Months")} • $
              {creditDollars} / $5.00{" "}
              {t("supporter_stat_rollover_credit", "Next Month Rollover")}
            </span>
          </div>

          <SidePanelPillToggle
            checked={isDevBuildUnlocked && channelEnabled}
            disabled={!isDevBuildUnlocked}
            onChange={async (nextEnabled) => {
              if (!isDevBuildUnlocked) return;
              const updated = await setDevBuildChannelPreference(nextEnabled);
              setSupporterState((prev) =>
                prev
                  ? { ...prev, dev_build: updated }
                  : {
                      follows: [],
                      supporters: [],
                      dev_build: updated,
                    },
              );
              window.dispatchEvent(
                new CustomEvent("sanctuary-supporter-updated"),
              );
              await syncUpdateChannelNotification({
                currentVersion: packageJson.version,
                switchedToChannel: updated.channel_enabled ? "dev" : "stable",
                forceGitHubRefresh: true,
              });
            }}
            label={t(
              "supporter_dev_builds_channel_toggle",
              "Daily Dev Build Channel",
            )}
            icon={t("icon_bolt", "bolt")}
            variant="accent"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <ActionButton
              variant="glass"
              icon={t("icon_verified", "verified")}
              label={t("supporter_celebration_btn", "Back to Sanctuary OS")}
              onClick={() => setIsOpen(false)}
              className="w-full"
            />
            <ActionButton
              variant="glass"
              icon={t("icon_settings", "settings")}
              label={t(
                "supporter_spoke_open_settings_btn",
                "Open Full Support & Perks Settings",
              )}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("navigateSettings", {
                      detail: { tab: "SUPPORTER" },
                    }),
                  );
                }, 50);
              }}
              className="w-full"
            />
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
