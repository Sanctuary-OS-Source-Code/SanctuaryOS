import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel, ActionButton } from "../shared";
import { SettingsToggle } from "../settings-tabs/shared";
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
    >
      <div className="flex flex-col gap-5 w-full">
        {/* SUPPORTER CELEBRATION SUMMARY CARD */}
        <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px]">
                  {t("icon_verified", "verified")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-black text-[var(--text)] truncate">
                  {t(
                    "supporter_celebration_title",
                    "Supporter Access Extended!",
                  )}
                </span>
                <span className="text-xs font-medium text-[var(--subtext)] opacity-90 truncate">
                  {t(
                    "supporter_celebration_badge",
                    "Donation Processed • Dev Channel Active",
                  )}
                </span>
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-1.5 shrink-0 shadow-sm">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t("icon_bolt", "bolt")}
              </span>
              <span className="text-[10px] font-bold text-[var(--text)] tracking-wide whitespace-nowrap">
                +{daysAdded} {daysUnit}
              </span>
            </div>
          </div>

          <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed">
            {t(
              "supporter_celebration_desc",
              "Thank you for supporting the Sanctuary OS ecosystem! Your Global Daily Dev Build timer has been automatically stacked and synced to your account.",
            )}
          </p>

          {/* 3-COLUMN TELEMETRY STRIP */}
          <div className="grid grid-cols-3 gap-2.5 w-full pt-1">
            <div className="glass-surface rounded-xl px-3 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center text-center gap-1 min-w-0">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span className="truncate">
                  {t("supporter_celebration_stat_added", "Time Added")}
                </span>
              </div>
              <span className="text-sm font-black text-[var(--text)] tracking-tight whitespace-nowrap">
                +{daysAdded} {daysUnit}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 whitespace-nowrap">
                +{monthsAdded} {monthUnit}
              </span>
            </div>

            <div className="glass-surface rounded-xl px-3 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center text-center gap-1 min-w-0">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_verified", "verified")}
                </span>
                <span className="truncate">
                  {t("supporter_celebration_stat_balance", "Active Timer")}
                </span>
              </div>
              <span className="text-sm font-black text-[var(--text)] tracking-tight whitespace-nowrap">
                {remainingDays} {daysUnit}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 whitespace-nowrap">
                {t("supporter_days_remaining_suffix", "Days Remaining")}
              </span>
            </div>

            <div className="glass-surface rounded-xl px-3 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center text-center gap-1 min-w-0">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_calendar_month", "calendar_month")}
                </span>
                <span className="truncate">
                  {t("supporter_celebration_stat_expires", "New Expiration")}
                </span>
              </div>
              <span className="text-sm font-black text-[var(--text)] tracking-tight whitespace-nowrap">
                {expiryDateStr}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 whitespace-nowrap">
                {t("supporter_active_channel_label", "Active Stream")}
              </span>
            </div>
          </div>
        </div>

        {/* ACTIVE DEV BUILD CHANNEL CONTROLS */}
        <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
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

            <div
              onClick={async () => {
                if (!isDevBuildUnlocked) return;
                const nextEnabled = !channelEnabled;
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
              className="flex flex-col items-end gap-1.5 cursor-pointer shrink-0"
            >
              <SettingsToggle checked={isDevBuildUnlocked && channelEnabled} />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                {t(
                  "supporter_dev_builds_channel_toggle",
                  "Daily Dev Build Channel",
                )}
              </span>
            </div>
          </div>

          <ActionButton
            variant="glass"
            icon={t("icon_verified", "verified")}
            label={t("supporter_celebration_btn", "Back to Sanctuary OS")}
            onClick={() => setIsOpen(false)}
            className="w-full"
          />
        </div>

        <button
          type="button"
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
          className="w-full py-2.5 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-xs font-bold text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center gap-2 transition-all"
        >
          <span className="material-symbols-outlined !text-[16px]">
            {t("icon_settings", "settings")}
          </span>
          <span>
            {t(
              "supporter_spoke_open_settings_btn",
              "Open Full Support & Perks Settings",
            )}
          </span>
        </button>
      </div>
    </SidePanel>
  );
}

