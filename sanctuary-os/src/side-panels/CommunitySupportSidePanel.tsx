import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  DashboardStatTile,
  ActionButton,
  handleOpenUrl,
} from "../shared";
import { SettingsToggle } from "../settings-tabs/shared";
import {
  getSupporterState,
  stackGlobalDevBuildDonation,
  setDevBuildChannelPreference,
  getKeepersPipelineConfig,
  loadPartnerCommunitiesList,
  buildPartnerCheckoutUrl,
  isSandboxDonationUrl,
  presentSupporterCelebrationModal,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
  LocalSupporterStatePayload,
} from "../utils/supporterManager";

interface CommunitySupportSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPartnerId?: string;
  onSuccess?: (newState: LocalSupporterStatePayload) => void;
  onNavigateSettings?: () => void;
}

export function CommunitySupportSidePanel({
  isOpen,
  onClose,
  initialPartnerId,
  onSuccess,
  onNavigateSettings,
}: CommunitySupportSidePanelProps) {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const vaultPath = useStore((state: any) => state.vaultPath);
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);

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
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(
    initialPartnerId || "active_spoke"
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const loadPanelData = async () => {
    const [state, pipelineCfg, partnerList] = await Promise.all([
      getSupporterState(vaultPath, session?.user?.id),
      getKeepersPipelineConfig(),
      loadPartnerCommunitiesList(workspaces),
    ]);
    setSupporterState(state);
    setKeepersConfig(pipelineCfg);
    setPartners(partnerList);
    if (onSuccess) onSuccess(state);

    if (initialPartnerId) {
      setSelectedPartnerId(initialPartnerId);
      return;
    }

    const activeWs = (workspaces || []).find(
      (w: any) => w.id === activeWorkspaceId
    );
    const activeSchemaId = (
      activeWs?.schema_id ||
      activeGameSchema?.schema_id ||
      activeGameSchema?.id ||
      ""
    ).toLowerCase();
    const activeName = (
      activeWs?.name ||
      activeGameSchema?.display_name ||
      activeGameSchema?.name ||
      ""
    ).toLowerCase();

    const matchedPartner = partnerList.find(
      (p) =>
        String(p.id).toLowerCase() ===
          String(activeWorkspaceId).toLowerCase() ||
        (activeSchemaId &&
          String(p.schema_id).toLowerCase() === activeSchemaId) ||
        (activeName && String(p.name).toLowerCase() === activeName)
    );

    if (matchedPartner) {
      setSelectedPartnerId(String(matchedPartner.id));
    } else {
      setSelectedPartnerId("keepers_core");
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPanelData();
    }
    const handleSupporterUpdated = () => {
      if (isOpen) {
        loadPanelData();
      }
    };
    const handleCelebrationOpened = () => {
      if (isOpen) {
        loadPanelData();
        onClose();
      }
    };
    window.addEventListener(
      "sanctuary-supporter-updated",
      handleSupporterUpdated
    );
    window.addEventListener(
      "sanctuary-supporter-celebration",
      handleCelebrationOpened
    );
    return () => {
      window.removeEventListener(
        "sanctuary-supporter-updated",
        handleSupporterUpdated
      );
      window.removeEventListener(
        "sanctuary-supporter-celebration",
        handleCelebrationOpened
      );
    };
  }, [isOpen, initialPartnerId, activeWorkspaceId]);

  const activeWs = (workspaces || []).find(
    (w: any) => String(w.id) === String(activeWorkspaceId)
  );
  const activeSchemaId = (
    activeWs?.schema_id ||
    activeGameSchema?.schema_id ||
    activeGameSchema?.id ||
    ""
  ).toLowerCase();
  const activeSpokeName =
    activeWs?.name ||
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    "Current Workspace";

  const matchedSpokePartner = partners.find(
    (p) =>
      String(p.id).toLowerCase() ===
        String(activeWorkspaceId).toLowerCase() ||
      (activeSchemaId &&
        String(p.schema_id || "").toLowerCase() === activeSchemaId) ||
      (activeSpokeName &&
        String(p.name || "").toLowerCase() === activeSpokeName.toLowerCase())
  );

  const activeSpokeOption = matchedSpokePartner
    ? {
        id: String(matchedSpokePartner.id),
        name: matchedSpokePartner.name,
        icon:
          matchedSpokePartner.icon ||
          t("icon_sports_esports", "sports_esports"),
        donation_url: matchedSpokePartner.donation_url || "",
        payment_processor: matchedSpokePartner.payment_processor || "STRIPE",
      }
    : {
        id: String(activeWorkspaceId || "active_spoke"),
        name: activeSpokeName,
        icon:
          activeWs?.icon ||
          activeGameSchema?.icon ||
          t("icon_sports_esports", "sports_esports"),
        donation_url: "",
        payment_processor: "STRIPE",
      };

  const spokeTileOptions = [
    {
      id: "keepers_core",
      label: t("supporter_keepers_title", "Sanctuary Foundry"),
      icon: t("icon_rocket_launch", "rocket_launch"),
    },
    {
      id: activeSpokeOption.id,
      label: activeSpokeOption.name,
      icon: activeSpokeOption.icon,
    },
  ];

  const selectedPartner =
    selectedPartnerId === "keepers_core"
      ? {
          id: "keepers_core",
          name: t("supporter_keepers_title", "Sanctuary Foundry"),
          icon: t("icon_rocket_launch", "rocket_launch"),
          donation_url: keepersConfig.keepers_donation_url || "",
          payment_processor:
            keepersConfig.keepers_payment_processor ||
            "STRIPE / GITHUB SPONSORS",
        }
      : partners.find((p) => String(p.id) === String(selectedPartnerId)) ||
        activeSpokeOption;

  const hasConfiguredUrl = Boolean(
    selectedPartner.donation_url &&
      String(selectedPartner.donation_url).trim().length > 0
  );
  const isSandbox = isSandboxDonationUrl(selectedPartner.donation_url);

  const nowSecs = Math.floor(Date.now() / 1000);
  const devBuildUntil = supporterState.dev_build.dev_build_until || 0;
  const isDevBuildUnlocked = devBuildUntil > nowSecs;
  const remainingSeconds = Math.max(0, devBuildUntil - nowSecs);
  const remainingDays = Math.ceil(remainingSeconds / 86400);
  const creditDollars = (
    (supporterState.dev_build.donation_credit_cents || 0) / 100
  ).toFixed(2);

  const handleCheckoutOrSandbox = async () => {
    if (!hasConfiguredUrl) return;
    if (isSandbox) {
      setIsSyncing(true);
      try {
        const fakeNonce = `wh_sandbox_${String(selectedPartner.id || "spoke").replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
        const result = await stackGlobalDevBuildDonation({
          amountUsd: 5,
          txNonce: fakeNonce,
        });
        const nextState: LocalSupporterStatePayload = {
          ...supporterState,
          dev_build: result.devBuild,
        };
        setSupporterState(nextState);
        if (onSuccess) onSuccess(nextState);
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
              "Sandbox checkout completed! Verified receipt and added Global Daily Dev Build time."
            ),
            "success"
          );
      } catch (err: any) {
        useStore.getState().pushStatus(err?.message || String(err), "error");
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    const checkoutUrl = buildPartnerCheckoutUrl(
      selectedPartner.donation_url,
      session?.user?.id,
      session?.user?.email
    );
    handleOpenUrl(checkoutUrl);

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
          if (onSuccess) onSuccess(latest);
          clearInterval(pollTimer);
          const addedMonths = Math.max(
            1,
            (latest.dev_build.total_months_unlocked || 0) - baselineMonths
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
                "Global Daily Dev Build access updated! +30 days per $5 stacked to your account."
              ),
              "success"
            );
        }
      } catch {
        // ignore
      }
    }, 5000);
  };

  const handleSyncStatus = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await loadPanelData();
      useStore
        .getState()
        .pushStatus(
          t(
            "supporter_status_synced_toast",
            "Supporter status synced with the Hub!"
          ),
          "info"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("supporter_spoke_panel_title", "Support Community & Perks")}
      subtitle={t(
        "supporter_spoke_panel_subtitle",
        "0% Platform Fee • Every $5 adds +30 days of Global Daily Dev Builds"
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        {/* SELECTED COMMUNITY DONATION HERO CARD */}
        <SidePanelHeroCard
          icon={
            selectedPartner.icon || t("icon_sports_esports", "sports_esports")
          }
          overline={t(
            "landing_support_card_badge",
            "0% Platform Fee • +30 Days Dev Builds per $5"
          )}
          title={selectedPartner.name}
          description={
            selectedPartnerId === "keepers_core"
              ? t(
                  "supporter_keepers_desc",
                  "Directly support Sanctuary Foundry building Sanctuary OS. Every $5 donation adds +30 days of Global Dev Build access to your account."
                )
              : t(
                  "supporter_webhook_auto_note",
                  "Donations are verified automatically by the payment processor's webhook using your Sanctuary ID — no manual receipt entry required."
                )
          }
          badge={
            !hasConfiguredUrl
              ? t("supporter_badge_not_configured", "Not Configured")
              : isSandbox
                ? t("supporter_sandbox_mode_badge", "Sandbox Mode")
                : selectedPartner.payment_processor
          }
          badgeIcon={
            !hasConfiguredUrl
              ? t("icon_link_off", "link_off")
              : isSandbox
                ? t("icon_science", "science")
                : t("icon_payments", "payments")
          }
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("supporter_stat_time_remaining", "Active Time Remaining")}
              value={
                isDevBuildUnlocked
                  ? `${remainingDays} ${t("supporter_celebration_days_unit", "Days")}`
                  : t("supporter_no_active_time", "No Active Time")
              }
              icon={t("icon_schedule", "schedule")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("supporter_stat_rollover_credit", "Next Month Rollover")}
              value={`$${creditDollars} / $5.00`}
              icon={t("icon_savings", "savings")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>

          {hasConfiguredUrl ? (
            <ActionButton
              variant="glass"
              icon={
                isSandbox
                  ? t("icon_science", "science")
                  : t("icon_open_in_new", "open_in_new")
              }
              label={
                isSandbox
                  ? t(
                      "supporter_spoke_sandbox_checkout_btn",
                      "Simulate Sandbox Checkout (Test Mode)"
                    )
                  : selectedPartnerId === "keepers_core"
                    ? `${t("supporter_keepers_btn", "Support Sanctuary Foundry")} (${selectedPartner.payment_processor})`
                    : `${t("supporter_btn_donate_partner", "Support Community")} (${selectedPartner.payment_processor})`
              }
              disabled={isSyncing}
              onClick={handleCheckoutOrSandbox}
              className="w-full"
            />
          ) : (
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] flex flex-col gap-1.5">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--warning)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_warning", "warning")}
                </span>
                {t(
                  "supporter_spoke_not_setup_title",
                  "Payment Processor Not Configured Yet"
                )}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "supporter_spoke_not_setup_desc",
                  "This community's Wayfinders haven't linked a payment processor in Wayfinder Operations yet. You can support Sanctuary Foundry below to unlock Global Dev Builds in the meantime."
                )}
              </p>
            </div>
          )}
        </SidePanelHeroCard>

        {/* TARGET PARTNER SELECTOR (FOUNDRY & ACTIVE SPOKE — 2 CENTERED TILES) */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {spokeTileOptions.map((opt) => (
            <DashboardStatTile
              key={opt.id}
              variant="filter"
              className="!w-full"
              icon={opt.icon || t("icon_sports_esports", "sports_esports")}
              label={opt.label}
              isActive={String(selectedPartnerId) === String(opt.id)}
              onClick={() => setSelectedPartnerId(String(opt.id))}
            />
          ))}
        </div>

        {/* YOUR GLOBAL DAILY DEV BUILD STATUS */}
        <UniversalGroup
          title={t(
            "supporter_dev_builds_channel_toggle",
            "Daily Dev Build Channel"
          )}
          icon={t("icon_rocket_launch", "rocket_launch")}
        >
          <div className="glass-surface px-4 py-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-black text-[var(--text)] truncate">
                {isDevBuildUnlocked
                  ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                  : t("supporter_no_active_time", "No Active Time")}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                {supporterState.dev_build.total_months_unlocked || 0}{" "}
                {t("supporter_months_suffix", "Months")} • ${creditDollars} /
                $5.00 {t("supporter_stat_rollover_credit", "Next Month Rollover")}
              </span>
            </div>

            <div
              onClick={async () => {
                if (!isDevBuildUnlocked) return;
                const updated = await setDevBuildChannelPreference(
                  !supporterState.dev_build.channel_enabled
                );
                const nextState = {
                  ...supporterState,
                  dev_build: updated,
                };
                setSupporterState(nextState);
                if (onSuccess) onSuccess(nextState);
              }}
              className={`flex flex-col items-end gap-1 shrink-0 ${
                isDevBuildUnlocked
                  ? "cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <SettingsToggle
                checked={
                  isDevBuildUnlocked && supporterState.dev_build.channel_enabled
                }
              />
            </div>
          </div>

          <ActionButton
            variant="glass"
            icon={
              isSyncing
                ? t("icon_sync", "sync")
                : t("icon_refresh", "refresh")
            }
            label={t(
              "supporter_sync_and_check_btn",
              "Sync Status & Check Updates"
            )}
            disabled={isSyncing}
            onClick={handleSyncStatus}
            className="w-full"
          />
        </UniversalGroup>

        {onNavigateSettings && (
          <ActionButton
            variant="glass"
            icon={t("icon_settings", "settings")}
            label={t(
              "supporter_spoke_open_settings_btn",
              "Open Full Support & Perks Settings"
            )}
            onClick={onNavigateSettings}
            className="w-full"
          />
        )}
      </div>
    </SidePanel>
  );
}
