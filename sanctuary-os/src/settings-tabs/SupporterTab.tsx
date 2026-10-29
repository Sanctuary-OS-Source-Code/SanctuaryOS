import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase } from "../supabase";
import {
  SidePanel,
  ActionButton,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  handleOpenUrl,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
} from "../shared";
import { TabContainer, SettingsGrid, SettingsToggle } from "./shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  getSupporterState,
  stackGlobalDevBuildDonation,
  setDevBuildChannelPreference,
  syncLocalMasonSupporterBridge,
  removeLocalMasonSupporterBridge,
  clearExpiredLocalMasonSupporters,
  getKeepersPipelineConfig,
  loadPartnerCommunitiesList,
  syncUpdateChannelNotification,
  buildPartnerCheckoutUrl,
  isSandboxDonationUrl,
  presentSupporterCelebrationModal,
  extractCheckoutReceiptNonce,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
  LocalSupporterStatePayload,
  LocalMasonSupporter,
  hasDevBuildAccessClearance,
} from "../utils/supporterManager";
import { isDesktop } from "../utils/envUtils";
import { useModalStore } from "../store/modalStore";
import packageJson from "../../package.json";

interface SupporterAlertCardProps {
  icon: string;
  badgeIcon: string;
  badgeLabel: string | number;
  overline: string;
  title: string;
  description: string;
  footerLeft?: string;
  footerRightIcon?: string;
  footerRightLabel?: string;
  action?: React.ReactNode;
}

function SupporterAlertCard({
  icon,
  badgeIcon,
  badgeLabel,
  overline,
  title,
  description,
  footerLeft,
  footerRightIcon,
  footerRightLabel,
  action,
}: SupporterAlertCardProps) {
  return (
    <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full">
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)",
        }}
      />
      <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
        {icon}
      </span>

      {/* Row 1: Warning Icon Well on Left + Neutral Chip on Right */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined !text-[22px]">{icon}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider tabular-nums shrink-0">
          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
            {badgeIcon}
          </span>
          <span>{badgeLabel}</span>
        </span>
      </div>

      {/* Row 2: Overline + Title */}
      <div className="flex flex-col gap-1 relative z-10">
        <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
          {overline}
        </span>
        <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
          {title}
        </h3>
      </div>

      {/* Row 3: Full Description (Never Truncated) */}
      <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
        {description}
      </p>

      {/* Row 4: Clean Footer Row or Action Control */}
      {action ? (
        <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10 w-full">
          {action}
        </div>
      ) : (
        <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-80 uppercase tracking-wider relative z-10">
          <span>{footerLeft}</span>
          <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
            <span className="material-symbols-outlined !text-[13px]">
              {footerRightIcon}
            </span>
            <span>{footerRightLabel}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function SupporterTab() {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const vaultPath = useStore((state) => state.vaultPath);
  const workspaces = useStore((state) => state.workspaces);
  const { setIsUpdatePanelOpen } = useModalStore();

  const [supporterState, setSupporterState] =
    useState<LocalSupporterStatePayload>({
      follows: [],
      supporters: [],
      dev_build: {
        user_id: session?.user?.id || "local_citizen",
        dev_build_until: 0,
        donation_credit_cents: 0,
        total_months_unlocked: 0,
        channel_enabled: false,
        updated_at: 0,
      },
    });
  const [keepersConfig, setKeepersConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG,
  );
  const [partners, setPartners] = useState<any[]>([]);
  const [knownMasons, setKnownMasons] = useState<any[]>([]);
  const [checkingDevStream, setCheckingDevStream] = useState(false);

  // Link Mason Supporter Bridge SidePanel state
  const [isBridgeOpen, setIsBridgeOpen] = useState(false);
  const [bridgeMasonId, setBridgeMasonId] = useState<string>("");
  const [bridgeMasonName, setBridgeMasonName] = useState<string>("");
  const [bridgeProvider, setBridgeProvider] = useState<string>("patreon");
  const [bridgeToken, setBridgeToken] = useState<string>("");
  const [bridgeCampaignId, setBridgeCampaignId] = useState<string>("");
  const [bridgeTierName, setBridgeTierName] = useState<string>("");
  const [isLinkingBridge, setIsLinkingBridge] = useState(false);

  // Web Checkout Receipt Verification SidePanel state (!isDesktop())
  const [isWebVerifyOpen, setIsWebVerifyOpen] = useState(false);
  const [webReceiptInput, setWebReceiptInput] = useState("");
  const [webAmountUsd, setWebAmountUsd] = useState<number>(5);
  const [isVerifyingWebReceipt, setIsVerifyingWebReceipt] = useState(false);

  const refreshData = async () => {
    try {
      const [state, pipelineCfg, partnerList] = await Promise.all([
        getSupporterState(vaultPath, session?.user?.id),
        getKeepersPipelineConfig(),
        loadPartnerCommunitiesList(workspaces),
      ]);
      setSupporterState(state);
      setKeepersConfig(pipelineCfg);
      setPartners(partnerList);

      try {
        const { data: masonsData } = await supabase
          .from("masons")
          .select(
            "id, name, patreon_url, donation_url, payment_processor, patreon_campaign_id",
          )
          .order("name", { ascending: true })
          .limit(100);
        if (Array.isArray(masonsData)) {
          setKnownMasons(masonsData);
        }
      } catch {
        // ignore if offline
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshData();
    const onSupporterUpdated = () => {
      refreshData();
    };
    window.addEventListener("sanctuary-supporter-updated", onSupporterUpdated);
    return () => {
      window.removeEventListener(
        "sanctuary-supporter-updated",
        onSupporterUpdated,
      );
    };
  }, [vaultPath, session?.user?.id]);

  // Only display Partner Communities that have configured a donation_url
  const configuredPartners = partners.filter((p) =>
    Boolean(p.donation_url && String(p.donation_url).trim().length > 0),
  );

  const nowSecs = Math.floor(Date.now() / 1000);
  const devBuildUntil = supporterState.dev_build.dev_build_until || 0;
  const isDevBuildUnlocked =
    devBuildUntil > nowSecs || hasDevBuildAccessClearance(devBuildUntil);
  const remainingSeconds = Math.max(0, devBuildUntil - nowSecs);
  const remainingDays = Math.ceil(remainingSeconds / 86400);
  const creditCents = supporterState.dev_build.donation_credit_cents || 0;
  const creditDollars = (creditCents / 100).toFixed(2);
  const rolloverPercent = Math.min(
    100,
    Math.round(((creditCents % 500) / 500) * 100),
  );
  const expiryDateFormatted =
    devBuildUntil > nowSecs
      ? new Date(devBuildUntil * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : t("active", "Active");

  // Split Mason Supporter Passes into Active vs. Expired
  const activeMasonSubs = supporterState.supporters.filter(
    (s) => !s.expires_at || s.expires_at > nowSecs,
  );
  const expiredMasonSubs = supporterState.supporters.filter(
    (s) => Boolean(s.expires_at && s.expires_at <= nowSecs),
  );

  const handleToggleDevChannel = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isDevBuildUnlocked) {
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_web_stream_locked_toast",
            "Unlock Global Daily Dev Builds ($5 = +30 days) or sign in with Staff clearance to switch to the Beta / Dev Build Stream.",
          ),
          "warning",
        );
      return;
    }
    const nextEnabled = !supporterState.dev_build.channel_enabled;
    const updated = await setDevBuildChannelPreference(
      nextEnabled,
      session?.user?.id,
    );
    setSupporterState((prev) => ({
      ...prev,
      dev_build: updated,
    }));
    if (isDesktop()) {
      await syncUpdateChannelNotification({
        currentVersion: packageJson.version,
        switchedToChannel: updated.channel_enabled ? "dev" : "stable",
        forceGitHubRefresh: true,
      });
    }
    useStore
      .getState()
      .pushStatus(
        !isDesktop()
          ? updated.channel_enabled
            ? t(
                "supporter_web_stream_switched_beta",
                "Website & Mobile PWA switched to the Beta / Dev Build Stream!",
              )
            : t(
                "supporter_web_stream_switched_public",
                "Website & Mobile PWA switched to the Public Build Stream.",
              )
          : updated.channel_enabled
            ? t(
                "supporter_channel_switched_to_dev_toast",
                "Switched to Dev Build channel — latest Dev Build is ready to install.",
              )
            : t(
                "supporter_channel_switched_to_stable_toast",
                "Switched to Stable channel — latest Stable version is ready to install.",
              ),
        "success",
      );
  };

  const handleSyncAndCheckStream = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (checkingDevStream) return;
    setCheckingDevStream(true);
    try {
      await refreshData();
      if (!isDesktop()) {
        useStore
          .getState()
          .pushStatus(
            supporterState.dev_build.channel_enabled
              ? t(
                  "supporter_web_stream_switched_beta",
                  "Website & Mobile PWA switched to the Beta / Dev Build Stream!",
                )
              : t(
                  "supporter_dev_stream_up_to_date",
                  "You are running the latest build on your active channel.",
                ),
            "info",
          );
        return;
      }
      const res = await syncUpdateChannelNotification({
        currentVersion: packageJson.version,
        forceGitHubRefresh: true,
      });
      if (res && res.updateAvailable) {
        setIsUpdatePanelOpen(true);
      } else {
        useStore
          .getState()
          .pushStatus(
            t(
              "supporter_dev_stream_up_to_date",
              "You are running the latest build on your active channel.",
            ),
            "info",
          );
      }
    } finally {
      setCheckingDevStream(false);
    }
  };

  const handlePartnerDonateClick = async (
    targetId: string,
    donationUrl: string,
  ) => {
    if (!donationUrl) return;
    if (isSandboxDonationUrl(donationUrl)) {
      try {
        const fakeNonce = `wh_sandbox_${String(targetId).replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
        const result = await stackGlobalDevBuildDonation({
          amountUsd: 5,
          txNonce: fakeNonce,
        });
        setSupporterState((prev) => ({
          ...prev,
          dev_build: result.devBuild,
        }));
        presentSupporterCelebrationModal({
          devBuildUntil: result.devBuild.dev_build_until,
          monthsAdded: result.monthsAdded,
          t,
        });
        useStore
          .getState()
          .pushStatus(
            t(
              "supporter_sandbox_toast",
              "Sandbox checkout completed! Verified receipt and added Global Daily Dev Build time.",
            ),
            "success",
          );
      } catch (err: any) {
        useStore.getState().pushStatus(err?.message || String(err), "error");
      }
      return;
    }

    handleOpenUrl(
      buildPartnerCheckoutUrl(
        donationUrl,
        session?.user?.id,
        session?.user?.email,
      ),
    );

    if (!isDesktop()) {
      setIsWebVerifyOpen(true);
    }

    let attempts = 0;
    const baselineUntil = supporterState.dev_build.dev_build_until || 0;
    const baselineMonths = supporterState.dev_build.total_months_unlocked || 0;
    const pollTimer = setInterval(async () => {
      attempts += 1;
      if (attempts > 24) {
        clearInterval(pollTimer);
        return;
      }
      try {
        const latest = await getSupporterState(vaultPath, session?.user?.id);
        if ((latest.dev_build.dev_build_until || 0) > baselineUntil) {
          setSupporterState(latest);
          setIsWebVerifyOpen(false);
          clearInterval(pollTimer);
          const addedMonths = Math.max(
            1,
            (latest.dev_build.total_months_unlocked || 0) - baselineMonths,
          );
          presentSupporterCelebrationModal({
            devBuildUntil: latest.dev_build.dev_build_until,
            monthsAdded: addedMonths,
            t,
          });
          useStore
            .getState()
            .pushStatus(
              t(
                "supporter_status_stacked",
                "Global Daily Dev Build access updated! +30 days per $5 stacked to your account.",
              ),
              "success",
            );
        }
      } catch {
        // ignore transient errors
      }
    }, 5000);
  };

  const handleVerifyWebReceipt = async () => {
    if (isVerifyingWebReceipt) return;
    if (!session?.user?.id) {
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_auth_required_for_dev_builds",
            "Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.",
          ),
          "warning",
        );
      return;
    }
    const nonce = extractCheckoutReceiptNonce(webReceiptInput);
    if (!nonce || nonce.length < 4) {
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_web_receipt_ph",
            "Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...",
          ),
          "warning",
        );
      return;
    }
    setIsVerifyingWebReceipt(true);
    try {
      const res = await stackGlobalDevBuildDonation({
        amountUsd: Math.max(1, Number(webAmountUsd || 5)),
        txNonce: nonce,
      });
      setSupporterState((prev) => ({
        ...prev,
        dev_build: res.devBuild,
      }));
      setWebReceiptInput("");
      setIsWebVerifyOpen(false);
      presentSupporterCelebrationModal({
        devBuildUntil: res.devBuild.dev_build_until,
        monthsAdded: Math.max(1, res.monthsAdded || 1),
        t,
      });
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_status_stacked",
            "Global Daily Dev Build access updated! +30 days per $5 stacked to your account.",
          ),
          "success",
        );
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(err?.message || String(err), "error");
    } finally {
      setIsVerifyingWebReceipt(false);
    }
  };

  const handleOpenLinkDrawerForMason = (pass?: LocalMasonSupporter) => {
    if (pass) {
      setBridgeMasonId(pass.mason_id || "");
      setBridgeMasonName(pass.mason_name || pass.mason_id || "");
      setBridgeProvider((pass.provider || "patreon").toLowerCase());
      setBridgeCampaignId(pass.patreon_campaign_id || "");
      setBridgeTierName(pass.tier_name || "");
      setBridgeToken("");
    } else {
      setBridgeMasonId("");
      setBridgeMasonName("");
      setBridgeProvider("patreon");
      setBridgeCampaignId("");
      setBridgeTierName("");
      setBridgeToken("");
    }
    setIsBridgeOpen(true);
  };

  const handleLinkMasonBridge = async () => {
    if (isLinkingBridge) return;
    setIsLinkingBridge(true);
    try {
      const matchedMason = knownMasons.find(
        (m) => m.id === bridgeMasonId || m.name === bridgeMasonName,
      );
      const record = await syncLocalMasonSupporterBridge({
        masonId: matchedMason?.id || bridgeMasonId || bridgeMasonName,
        masonName: matchedMason?.name || bridgeMasonName || bridgeMasonId,
        provider: bridgeProvider,
        tokenOrKey: bridgeToken,
        patreonCampaignId:
          bridgeCampaignId || matchedMason?.patreon_campaign_id || "",
        tierName: bridgeTierName,
      });
      setSupporterState((prev) => ({
        ...prev,
        supporters: [
          record,
          ...prev.supporters.filter((s) => s.mason_id !== record.mason_id),
        ],
      }));
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_status_bridge_linked",
            "{Mason} Supporter Pass verified and saved to your local SQLite {Vault}!",
          ),
          "success",
        );
      setBridgeToken("");
      setBridgeTierName("");
      setIsBridgeOpen(false);
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(err?.message || String(err), "error");
    } finally {
      setIsLinkingBridge(false);
    }
  };

  const handleRemoveMasonBridge = async (
    masonId: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    await removeLocalMasonSupporterBridge(masonId);
    setSupporterState((prev) => ({
      ...prev,
      supporters: prev.supporters.filter((s) => s.mason_id !== masonId),
    }));
    useStore
      .getState()
      .pushStatus(
        t(
          "supporter_status_bridge_removed",
          "Local {Mason} Supporter Pass removed from {Vault}.",
        ),
        "info",
      );
  };

  const handleClearAllExpiredMasonSubs = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (expiredMasonSubs.length === 0) return;
    const expiredIds = expiredMasonSubs.map((s) => s.mason_id);
    const remaining = await clearExpiredLocalMasonSupporters(expiredIds);
    setSupporterState((prev) => ({
      ...prev,
      supporters: remaining,
    }));
    useStore
      .getState()
      .pushStatus(
        t(
          "supporter_toast_expired_cleared",
          "Cleared expired {Mason} supporter passes from your local {Vault}.",
        ),
        "info",
      );
  };

  return (
    <>
      <div className="flex flex-col gap-16 w-full pb-48">
        {/* SECTION 1: GLOBAL DAILY DEV BUILDS (ALERT CARD + COUNTER CARD) */}
        <TabContainer
          title={t("supporter_dev_builds_title", "Global Daily Dev Builds")}
          icon={t("icon_bolt", "bolt")}
        >
          <SettingsGrid>
            {/* CARD 1: BANNERLESS ALERT CARD — DEV BUILD PERK */}
            <SupporterAlertCard
              icon={t("icon_bolt", "bolt")}
              badgeIcon={t("icon_verified", "verified")}
              badgeLabel={t("supporter_rate_badge", "$5 = +30 Days")}
              overline={t(
                "supporter_dev_perk_alert_sub",
                "$5 = +30 Days • Cumulative Time Stacking",
              )}
              title={t(
                "supporter_dev_perk_alert_title",
                "Global Daily Dev Build Perk",
              )}
              description={t(
                "supporter_dev_perk_alert_desc",
                "Every $5 donated to Sanctuary Foundry or any Partner Community stacks +30 days of Global Daily Dev Build access across Desktop, Web, and Mobile PWA. Partial credit rolls over and never expires.",
              )}
              footerLeft={t(
                "supporter_zero_fee_badge",
                "0% Platform Fee • Non-Custodial",
              )}
              footerRightIcon={t("icon_bolt", "bolt")}
              footerRightLabel={t(
                "supporter_active_channel_label",
                "Active Stream",
              )}
            />

            {/* CARD 2: COUNTER CARD — SUPPORTER PERKS (DEV BUILD STREAM TOGGLE & COUNTDOWN TIMER) */}
            <UniversalCard
              title={t(
                "supporter_counter_card_title",
                "Supporter Perks",
              )}
              subtitle={
                isDevBuildUnlocked
                  ? `${
                      supporterState.dev_build.channel_enabled
                        ? t("supporter_dev_toggle_on_lbl", "Dev Build Stream: ON")
                        : t("supporter_dev_toggle_off_lbl", "Dev Build Stream: OFF")
                    } • ${t("supporter_expires_prefix", "Expires")} ${expiryDateFormatted}`
                  : `${t("supporter_dev_toggle_off_lbl", "Dev Build Stream: OFF")} • ${t(
                      "supporter_no_active_time",
                      "No Active Time",
                    )}`
              }
              icon={
                isDevBuildUnlocked
                  ? t("icon_verified", "verified")
                  : t("icon_schedule", "schedule")
              }
              statusColor={isDevBuildUnlocked ? "emerald" : undefined}
              bannerTopLabel={
                isDevBuildUnlocked
                  ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                  : t("supporter_no_active_time", "No Active Time")
              }
              bannerBottomLabel={
                isDevBuildUnlocked
                  ? `${t("supporter_expires_prefix", "Expires")} ${expiryDateFormatted} • ${
                      supporterState.dev_build.channel_enabled
                        ? t("supporter_active_channel_label", "Active Stream")
                        : t("supporter_dev_builds_locked", "Standard Stable Channel")
                    }`
                  : `$${creditDollars} / $5.00 • ${t(
                      "supporter_stable_fallback_label",
                      "$5 = +30 Days Access",
                    )}`
              }
              onClick={handleToggleDevChannel}
              actions={
                <div
                  className={
                    !isDevBuildUnlocked ? "opacity-40 cursor-not-allowed" : ""
                  }
                >
                  <SettingsToggle
                    checked={
                      isDevBuildUnlocked &&
                      supporterState.dev_build.channel_enabled
                    }
                  />
                </div>
              }
            >
              <div className="flex flex-col gap-2.5 w-full mt-1">
                {/* 3-Column Live Counter Strip */}
                <div className="grid grid-cols-3 gap-2 w-full">
                  <div className="px-2 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col items-center justify-center text-center">
                    <span
                      className={`text-sm font-black tabular-nums leading-tight ${
                        isDevBuildUnlocked
                          ? "text-[var(--success)]"
                          : "text-[var(--text)]"
                      }`}
                    >
                      {remainingDays}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80">
                      {t("supporter_counter_days_lbl", "Days Left")}
                    </span>
                  </div>

                  <div className="px-2 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-black tabular-nums leading-tight text-[var(--accent)]">
                      {supporterState.dev_build.total_months_unlocked || 0}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80">
                      {t("supporter_counter_months_lbl", "Months")}
                    </span>
                  </div>

                  <div className="px-2 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <span className="text-sm font-black tabular-nums leading-tight text-[var(--text)]">
                      ${creditDollars}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80">
                      {t("supporter_counter_rollover_lbl", "Rollover")}
                    </span>
                    <div className="absolute bottom-0 inset-x-0 h-0.5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${rolloverPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sync & Check Updates Action */}
                <div onClick={handleSyncAndCheckStream} className="w-full">
                  <ActionButton
                    variant="glass"
                    icon={
                      checkingDevStream
                        ? t("icon_sync", "sync")
                        : t("icon_refresh", "refresh")
                    }
                    label={t(
                      "supporter_sync_and_check_btn",
                      "Sync Status & Check Updates",
                    )}
                    disabled={checkingDevStream}
                    className="w-full"
                  />
                </div>
              </div>
            </UniversalCard>
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 2: PARTNER COMMUNITIES (CLEAN ALERT CARD + FOUNDRY + PARTNERS) */}
        <TabContainer
          title={t("supporter_partners_title", "Partner Communities")}
          icon={t("icon_public", "public")}
          actions={
            !isDesktop() ? (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_verified", "verified")}
                  label={t(
                    "supporter_web_verify_btn",
                    "Verify Completed Donation (+30 Days / $5)",
                  )}
                  onClick={() => setIsWebVerifyOpen(true)}
                />
              </PanelHeaderGroup>
            ) : undefined
          }
        >
          <SettingsGrid>
            {/* CARD 1: BANNERLESS ALERT CARD — 100% NON-CUSTODIAL • 0% PLATFORM FEE */}
            <SupporterAlertCard
              icon={t("icon_warning", "warning")}
              badgeIcon={t("icon_verified", "verified")}
              badgeLabel={t("supporter_rate_badge", "$5 = +30 Days")}
              overline={t(
                "landing_banner_support_partner_top",
                "100% Direct To Community",
              )}
              title={t(
                "supporter_liability_title",
                "100% Non-Custodial • 0% Platform Fee",
              )}
              description={t(
                "supporter_partner_alert_clean_desc",
                "Partner Communities run their own payment processors and receive 100% of your donation directly (0% platform fee). Webhooks automatically stack +30 days of Global Dev Build time per $5.",
              )}
              footerLeft={t(
                "supporter_zero_fee_badge",
                "0% Platform Fee • Non-Custodial",
              )}
              footerRightIcon={t(
                "icon_volunteer_activism",
                "volunteer_activism",
              )}
              footerRightLabel={t("supporter_rate_badge", "$5 = +30 Days")}
            />

            {/* CARD 2: SANCTUARY FOUNDRY */}
            <UniversalCard
              title={t("supporter_keepers_title", "Sanctuary Foundry")}
              subtitle={t(
                "supporter_keepers_card_subtitle",
                "Core OS & Global Dev Builds",
              )}
              description={t(
                "supporter_keepers_desc",
                "Directly support Sanctuary Foundry building Sanctuary OS. Every $5 donation adds +30 days of Global Dev Build access to your account.",
              )}
              icon={t("icon_rocket_launch", "rocket_launch")}
              bannerTopLabel={t(
                "landing_banner_support_os_bottom",
                "100% Core OS Development",
              )}
              bannerBottomLabel={t(
                "landing_banner_support_os_top",
                "$5 = +30 Days Dev Builds",
              )}
              onClick={() =>
                handlePartnerDonateClick(
                  "keepers_core",
                  keepersConfig.keepers_donation_url,
                )
              }
              actions={
                <div className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 shadow-sm">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                    {isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                      ? t("icon_science", "science")
                      : t("icon_payments", "payments")}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                    {isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                      ? t("supporter_sandbox_mode_badge", "Sandbox Mode")
                      : keepersConfig.keepers_payment_processor || "Stripe"}
                  </span>
                </div>
              }
            >
              <ActionButton
                variant="accent"
                icon={
                  isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                    ? t("icon_science", "science")
                    : t("icon_open_in_new", "open_in_new")
                }
                label={
                  isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                    ? t(
                        "supporter_spoke_sandbox_checkout_btn",
                        "Simulate Sandbox Checkout (Test Mode)",
                      )
                    : t("supporter_keepers_btn", "Support Sanctuary Foundry")
                }
                className="w-full pointer-events-none mt-2"
              />
            </UniversalCard>

            {/* CONFIGURED PARTNER COMMUNITIES */}
            {configuredPartners.map((partner) => (
              <UniversalCard
                key={partner.id}
                title={partner.name}
                subtitle={t(
                  "supporter_claim_partner_label",
                  "Partner Community",
                )}
                description={t(
                  "supporter_partners_subtitle",
                  "Donate to any Partner Community below to support their work and stack Global Dev Build time.",
                )}
                icon={
                  partner.icon || t("icon_sports_esports", "sports_esports")
                }
                bannerTopLabel={t(
                  "landing_banner_support_partner_top",
                  "100% Direct To Community",
                )}
                bannerBottomLabel={t(
                  "landing_banner_support_partner_bottom",
                  "Server & {Mason} Support",
                )}
                onClick={() =>
                  handlePartnerDonateClick(
                    String(partner.id),
                    partner.donation_url,
                  )
                }
                actions={
                  <div className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {isSandboxDonationUrl(partner.donation_url)
                        ? t("icon_science", "science")
                        : t("icon_payments", "payments")}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                      {isSandboxDonationUrl(partner.donation_url)
                        ? t("supporter_sandbox_mode_badge", "Sandbox Mode")
                        : partner.payment_processor}
                    </span>
                  </div>
                }
              >
                <ActionButton
                  variant="glass"
                  icon={
                    isSandboxDonationUrl(partner.donation_url)
                      ? t("icon_science", "science")
                      : t("icon_open_in_new", "open_in_new")
                  }
                  label={
                    isSandboxDonationUrl(partner.donation_url)
                      ? t(
                          "supporter_spoke_sandbox_checkout_btn",
                          "Simulate Sandbox Checkout (Test Mode)",
                        )
                      : t("supporter_btn_donate_partner", "Donate to Partner")
                  }
                  className="w-full pointer-events-none mt-2"
                />
              </UniversalCard>
            ))}
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 3: MASON SUPPORTER PASSES (COMBINED LEADING ALERT CARD + LINKED MASON CARDS) */}
        <TabContainer
          title={t(
            "supporter_masons_vault_title",
            "{Mason} Supporter Passes (Local {Vault})",
          )}
          icon={t("icon_encrypted", "encrypted")}
        >
          <SettingsGrid>
            <SupporterAlertCard
              icon={t("icon_encrypted", "encrypted")}
              badgeIcon={t("icon_verified", "verified")}
              badgeLabel={`${activeMasonSubs.length} • ${t(
                "supporter_local_vault_chip",
                "Local PC {Vault}",
              )}`}
              overline={t(
                "supporter_mason_alert_sub",
                "Direct Device Verification • SQLite {Vault} Only",
              )}
              title={t(
                "supporter_mason_alert_title",
                "100% Local Privacy • Zero Cloud Honeypot",
              )}
              description={t(
                "supporter_mason_alert_desc",
                "Patreon, Ko-fi, Stripe, and Fourthwall passes are verified directly on your PC and saved strictly in your local {Vault}. Unlocks Early Access {Mods} and Priority Support for 30 days.",
              )}
              action={
                <ActionButton
                  variant="glass"
                  icon={t("icon_add_link", "add_link")}
                  label={t(
                    "supporter_btn_add_mason_bridge",
                    "Link {Mason} Supporter Pass",
                  )}
                  onClick={() => handleOpenLinkDrawerForMason()}
                  className="w-full"
                />
              }
            />

            {activeMasonSubs.map((pass) => {
              const daysLeft = pass.expires_at
                ? Math.max(1, Math.ceil((pass.expires_at - nowSecs) / 86400))
                : 30;
              return (
                <UniversalCard
                  key={pass.mason_id}
                  title={pass.mason_name || pass.mason_id}
                  subtitle={`${pass.provider.toUpperCase()}${
                    pass.tier_name ? ` • ${pass.tier_name}` : ""
                  } • ${daysLeft} ${t("supporter_celebration_days_unit", "Days")}`}
                  description={`${t(
                    "supporter_perk_early_access",
                    "Early Access",
                  )} • ${t(
                    "supporter_perk_priority_support",
                    "Priority Support",
                  )}`}
                  icon={t("icon_workspace_premium", "workspace_premium")}
                  statusColor="emerald"
                  bannerTopLabel={t(
                    "supporter_badge_verified_patron",
                    "Verified Supporter",
                  )}
                  bannerBottomLabel={`${pass.provider.toUpperCase()} • ${daysLeft}d`}
                  actions={
                    <div className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[13px] text-[var(--success)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider tabular-nums text-[var(--text)]">
                        {`${daysLeft}d`}
                      </span>
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 w-full mt-2">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_refresh", "refresh")}
                      label={t("supporter_btn_renew_pass", "Renew")}
                      onClick={() => handleOpenLinkDrawerForMason(pass)}
                      className="w-full"
                    />
                    <ActionButton
                      variant="danger"
                      icon={t("icon_delete", "delete")}
                      label={t("remove", "Remove")}
                      onClick={(e) =>
                        handleRemoveMasonBridge(pass.mason_id, e)
                      }
                      className="w-full"
                    />
                  </div>
                </UniversalCard>
              );
            })}
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 4: EXPIRED MASON PASSES (LEADING ALERT CARD + EXPIRED MASON CARDS) */}
        <TabContainer
          title={t(
            "supporter_masons_expired_list_title",
            "Expired {Mason} Passes",
          )}
          icon={t("icon_history", "history")}
        >
          <SettingsGrid>
            <SupporterAlertCard
              icon={t("icon_history", "history")}
              badgeIcon={t("icon_history", "history")}
              badgeLabel={expiredMasonSubs.length}
              overline={t("supporter_badge_expired_pass", "Expired")}
              title={t(
                "supporter_masons_expired_list_title",
                "Expired {Mason} Passes",
              )}
              description={t(
                "supporter_masons_expired_empty",
                "No expired {Mason} passes in {Vault}.",
              )}
              action={
                <ActionButton
                  variant="glass"
                  icon={t("icon_delete_sweep", "delete_sweep")}
                  label={t("supporter_btn_clear_expired", "Clear Expired")}
                  disabled={expiredMasonSubs.length === 0}
                  onClick={handleClearAllExpiredMasonSubs}
                  className="w-full"
                />
              }
            />

            {expiredMasonSubs.map((pass) => {
              const expDate = pass.expires_at
                ? new Date(pass.expires_at * 1000).toLocaleDateString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )
                : "";
              return (
                <UniversalCard
                  key={pass.mason_id}
                  title={pass.mason_name || pass.mason_id}
                  subtitle={`${pass.provider.toUpperCase()}${
                    pass.tier_name ? ` • ${pass.tier_name}` : ""
                  }${expDate ? ` • ${expDate}` : ""}`}
                  description={t(
                    "supporter_local_vault_chip",
                    "Local PC {Vault}",
                  )}
                  icon={t("icon_history", "history")}
                  statusColor="warning"
                  bannerTopLabel={t("supporter_badge_expired_pass", "Expired")}
                  bannerBottomLabel={`${pass.provider.toUpperCase()}${
                    expDate ? ` • ${expDate}` : ""
                  }`}
                  actions={
                    <div className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[13px] text-[var(--warning)]">
                        {t("icon_history", "history")}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("supporter_badge_expired_pass", "Expired")}
                      </span>
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 w-full mt-2">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_refresh", "refresh")}
                      label={t("supporter_btn_renew_pass", "Renew")}
                      onClick={() => handleOpenLinkDrawerForMason(pass)}
                      className="w-full"
                    />
                    <ActionButton
                      variant="danger"
                      icon={t("icon_close", "close")}
                      label={t("clear", "Clear")}
                      onClick={(e) =>
                        handleRemoveMasonBridge(pass.mason_id, e)
                      }
                      className="w-full"
                    />
                  </div>
                </UniversalCard>
              );
            })}
          </SettingsGrid>
        </TabContainer>
      </div>

      {/* SIDEPANEL: LINK PRIVATE CREATOR SUPPORTER PASS */}
      <SidePanel
        isOpen={isBridgeOpen}
        onClose={() => setIsBridgeOpen(false)}
        title={t(
          "supporter_bridge_modal_title",
          "Link {Mason} Supporter Bridge",
        )}
        subtitle={t(
          "supporter_bridge_modal_subtitle",
          "Verify Patreon / Ko-fi support locally without cloud tracking",
        )}
        icon={t("icon_encrypted", "encrypted")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[640px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                isLinkingBridge
                  ? t("icon_sync", "sync")
                  : t("icon_check", "check")
              }
              tooltip={t(
                "supporter_bridge_btn_verify",
                "Verify & Save to Local {Vault}",
              )}
              variant="accent"
              disabled={
                isLinkingBridge ||
                (!bridgeMasonName.trim() && !bridgeMasonId.trim()) ||
                !bridgeToken.trim()
              }
              onClick={handleLinkMasonBridge}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_lock", "lock")}
            overline={t("supporter_local_vault_chip", "Local PC {Vault}")}
            title={t(
              "supporter_bridge_modal_title",
              "Link {Mason} Supporter Bridge",
            )}
            description={t(
              "supporter_link_pass_card_desc",
              "Verify a Patreon or Ko-fi pass locally on your PC (zero cloud tracking) to unlock Priority Support and Early Access.",
            )}
            variant="success"
          />

          <SidePanelTitleInput
            value={bridgeMasonName}
            onChange={(val) => setBridgeMasonName(val)}
            label={t("supporter_bridge_creator_label", "{Mason} Name or ID")}
            icon={t("icon_person", "person")}
            placeholder={t(
              "supporter_bridge_creator_label",
              "{Mason} Name or ID",
            )}
          />

          <UniversalGroup
            title={t(
              "supporter_bridge_modal_title",
              "Link {Mason} Supporter Bridge",
            )}
            icon={t("icon_encrypted", "encrypted")}
          >
            {knownMasons.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                  {t("search_masons", "Search {Masons}...")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={bridgeMasonId}
                  onChange={(val: any) => {
                    const id = Array.isArray(val) ? val[0] : val;
                    setBridgeMasonId(id);
                    const found = knownMasons.find((m) => m.id === id);
                    if (found) {
                      setBridgeMasonName(found.name);
                      if (found.payment_processor) {
                        setBridgeProvider(
                          found.payment_processor.toLowerCase(),
                        );
                      }
                      if (found.patreon_campaign_id) {
                        setBridgeCampaignId(found.patreon_campaign_id);
                      }
                    }
                  }}
                  options={knownMasons.map((m) => ({
                    id: m.id,
                    label: m.name,
                  }))}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t(
                  "supporter_bridge_provider_label",
                  "Payment Processor / Platform",
                )}
              </label>
              <CustomDropdown
                disableTint={true}
                value={bridgeProvider}
                onChange={(val: any) =>
                  setBridgeProvider(Array.isArray(val) ? val[0] : val)
                }
                options={[
                  {
                    id: "patreon",
                    label: t(
                      "supporter_provider_patreon",
                      "Patreon (Direct Local API Bridge)",
                    ),
                  },
                  {
                    id: "kofi",
                    label: t("supporter_provider_kofi", "Ko-fi Supporter Pass"),
                  },
                  {
                    id: "stripe",
                    label: t(
                      "supporter_provider_stripe",
                      "Stripe Receipt / Subscription",
                    ),
                  },
                  {
                    id: "fourthwall",
                    label: t(
                      "supporter_provider_fourthwall",
                      "Fourthwall Supporter",
                    ),
                  },
                  {
                    id: "custom",
                    label: t("supporter_provider_custom", "Direct Creator Key"),
                  },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t(
                  "supporter_bridge_token_label",
                  "Patreon Access Token or Creator Supporter Key",
                )}
              </label>
              <input
                type="password"
                value={bridgeToken}
                onChange={(e) => setBridgeToken(e.target.value)}
                placeholder={t(
                  "supporter_bridge_token_ph",
                  "Paste token or supporter pass key (stored in local SQLite only)...",
                )}
                className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t(
                  "supporter_bridge_tier_label",
                  "Supporter Tier Label (Optional)",
                )}
              </label>
              <input
                type="text"
                value={bridgeTierName}
                onChange={(e) => setBridgeTierName(e.target.value)}
                placeholder={t(
                  "supporter_bridge_tier_label",
                  "Supporter Tier Label (Optional)",
                )}
                className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner"
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={isWebVerifyOpen}
        onClose={() => setIsWebVerifyOpen(false)}
        title={t(
          "supporter_web_verify_btn",
          "Verify Completed Donation (+30 Days / $5)",
        )}
        subtitle={t(
          "landing_support_card_badge",
          "0% Platform Fee • +30 Days Dev Builds Per $5",
        )}
        icon={t("icon_verified", "verified")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                isVerifyingWebReceipt
                  ? t("icon_sync", "sync")
                  : t("icon_check", "check")
              }
              tooltip={t(
                "supporter_web_claim_btn",
                "Verify & Unlock Dev Builds",
              )}
              variant="accent"
              disabled={isVerifyingWebReceipt || !webReceiptInput.trim()}
              onClick={handleVerifyWebReceipt}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5">
          <SidePanelHeroCard
            icon={t("icon_volunteer_activism", "volunteer_activism")}
            overline={
              isDevBuildUnlocked
                ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                : t("supporter_rate_badge", "$5 = +30 Days")
            }
            title={t("supporter_keepers_title", "Sanctuary Foundry")}
            description={t(
              "supporter_web_pending_desc",
              "Every $5 contribution adds +30 days of Global Daily Dev Build access. Once completed, your account syncs automatically via webhook or you can verify your Stripe checkout receipt below.",
            )}
            variant={isDevBuildUnlocked ? "success" : "accent"}
          />

          <SidePanelTitleInput
            label={t(
              "supporter_web_receipt_label",
              "Stripe Checkout URL or Receipt ID",
            )}
            icon={t("icon_receipt_long", "receipt_long")}
            value={webReceiptInput}
            onChange={setWebReceiptInput}
            placeholder={t(
              "supporter_web_receipt_ph",
              "Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...",
            )}
          />

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
              {t("supporter_web_amount_label", "Contribution Amount (USD)")}
            </span>
            <div className="grid grid-cols-4 gap-2.5">
              {[5, 10, 15, 25].map((amt) => {
                const selected = webAmountUsd === amt;
                const days = Math.floor(amt / 5) * 30;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setWebAmountUsd(amt)}
                    className={`p-3 rounded-xl glass-surface border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      selected
                        ? "border-[var(--accent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="text-sm font-black">{`$${amt}`}</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider opacity-80">
                      {`+${days} ${t("supporter_celebration_days_unit", "Days")}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SidePanel>
    </>
  );
}
