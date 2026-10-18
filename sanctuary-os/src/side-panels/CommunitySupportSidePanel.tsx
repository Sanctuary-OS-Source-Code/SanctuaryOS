import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  ActionButton,
  CustomDropdown,
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
    DEFAULT_KEEPERS_PIPELINE_CONFIG,
  );
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(
    initialPartnerId || "active_spoke",
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
      (w: any) => w.id === activeWorkspaceId,
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
        String(p.id).toLowerCase() === String(activeWorkspaceId).toLowerCase() ||
        (activeSchemaId &&
          String(p.schema_id).toLowerCase() === activeSchemaId) ||
        (activeName && String(p.name).toLowerCase() === activeName),
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
  }, [isOpen, initialPartnerId, activeWorkspaceId]);

  const activeWs = (workspaces || []).find(
    (w: any) => w.id === activeWorkspaceId,
  );
  const activeSpokeName =
    activeWs?.name ||
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    "Current Workspace";

  const dropdownOptions = [
    {
      id: "keepers_core",
      label: t("supporter_keepers_title", "Sanctuary OS (Keepers Core)"),
    },
    ...partners
      .filter((p) => {
        const isConfigured = Boolean(
          p.donation_url && String(p.donation_url).trim().length > 0,
        );
        const isSelected = String(p.id) === String(selectedPartnerId);
        const isCurrentSpoke =
          String(p.name || "").toLowerCase() ===
            String(activeSpokeName).toLowerCase() ||
          String(p.id) === String(activeWorkspaceId);
        return isConfigured || isSelected || isCurrentSpoke;
      })
      .map((p) => ({
        id: String(p.id),
        label: p.name,
      })),
  ];

  const selectedPartner =
    selectedPartnerId === "keepers_core"
      ? {
          id: "keepers_core",
          name: t("supporter_keepers_title", "Sanctuary OS (Keepers Core)"),
          icon: t("icon_rocket_launch", "rocket_launch"),
          donation_url: keepersConfig.keepers_donation_url || "",
          payment_processor:
            keepersConfig.keepers_payment_processor || "STRIPE / GITHUB SPONSORS",
        }
      : partners.find((p) => String(p.id) === String(selectedPartnerId)) || {
          id: activeWorkspaceId || "active_spoke",
          name: activeSpokeName,
          icon: t("icon_sports_esports", "sports_esports"),
          donation_url: "",
          payment_processor: "STRIPE",
        };

  const hasConfiguredUrl = Boolean(
    selectedPartner.donation_url &&
      String(selectedPartner.donation_url).trim().length > 0,
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
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    const checkoutUrl = buildPartnerCheckoutUrl(
      selectedPartner.donation_url,
      session?.user?.id,
      session?.user?.email,
    );
    handleOpenUrl(checkoutUrl);

    let attempts = 0;
    const baselineUntil = supporterState.dev_build.dev_build_until || 0;
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
            "Supporter status synced with the Hub!",
          ),
          "info",
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
        "0% Platform Fee • Every $5 adds +30 days of Global Daily Dev Builds",
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
    >
      <div className="flex flex-col gap-5 w-full">
        {/* TARGET PARTNER SELECTOR */}
        {dropdownOptions.length > 1 && (
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("supporter_claim_partner_label", "Partner Community")}
            </label>
            <CustomDropdown
              disableTint={true}
              value={selectedPartnerId}
              onChange={(val: any) =>
                setSelectedPartnerId(Array.isArray(val) ? val[0] : val)
              }
              options={dropdownOptions}
            />
          </div>
        )}

        {/* SELECTED COMMUNITY DONATION CARD */}
        <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,rgba(var(--bg-rgb),0.86))] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px]">
                  {selectedPartner.icon || t("icon_sports_esports", "sports_esports")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-black text-[var(--text)] truncate">
                  {selectedPartner.name}
                </span>
                <span className="text-xs font-medium text-[var(--subtext)] opacity-90 truncate">
                  {t(
                    "landing_support_card_badge",
                    "0% Platform Fee • +30 Days Dev Builds per $5",
                  )}
                </span>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-1.5 shrink-0 shadow-sm">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {isSandbox
                  ? t("icon_science", "science")
                  : t("icon_payments", "payments")}
              </span>
              <span className="text-[10px] font-bold text-[var(--text)] tracking-wide">
                {isSandbox
                  ? t("supporter_sandbox_mode_badge", "Sandbox Mode")
                  : selectedPartner.payment_processor}
              </span>
            </div>
          </div>

          <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed">
            {t(
              "supporter_webhook_auto_note",
              "Donations are verified automatically by the payment processor's webhook using your Sanctuary ID—no manual receipt entry required.",
            )}
          </p>

          {hasConfiguredUrl ? (
            <ActionButton
              variant="accent"
              icon={
                isSandbox
                  ? t("icon_science", "science")
                  : t("icon_open_in_new", "open_in_new")
              }
              label={
                isSandbox
                  ? t(
                      "supporter_spoke_sandbox_checkout_btn",
                      "Simulate Sandbox Checkout (Test Mode)",
                    )
                  : `${t("supporter_btn_donate_partner", "Support Community")} (${selectedPartner.payment_processor})`
              }
              disabled={isSyncing}
              onClick={handleCheckoutOrSandbox}
              className="w-full"
            />
          ) : (
            <div className="p-4 rounded-xl bg-[color-mix(in_srgb,var(--warning)_15%,rgba(var(--bg-rgb),0.9))] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] flex flex-col gap-2">
              <span className="text-xs font-black text-[var(--warning)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_warning", "warning")}
                </span>
                {t(
                  "supporter_spoke_not_setup_title",
                  "Payment Processor Not Configured Yet",
                )}
              </span>
              <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed">
                {t(
                  "supporter_spoke_not_setup_desc",
                  "The Wayfinders for this community haven't linked a payment processor in the Wayfinder Hub yet. You can support Sanctuary OS (Keepers Core) or enable the Sandbox Test Processor in the Wayfinder Hub.",
                )}
              </p>
            </div>
          )}
        </div>

        {/* YOUR GLOBAL DAILY DEV BUILD STATUS */}
        <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                {t("supporter_stat_time_remaining", "Active Time Remaining")}
              </span>
              <span className="text-lg font-black text-[var(--text)]">
                {isDevBuildUnlocked
                  ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                  : t("supporter_no_active_time", "No Active Time")}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
                {supporterState.dev_build.total_months_unlocked || 0}{" "}
                {t("supporter_months_suffix", "Months")} • ${creditDollars} / $5.00{" "}
                {t("supporter_stat_rollover_credit", "Next Month Rollover")}
              </span>
            </div>

            <div
              onClick={async () => {
                if (!isDevBuildUnlocked) return;
                const updated = await setDevBuildChannelPreference(
                  !supporterState.dev_build.channel_enabled,
                );
                const nextState = {
                  ...supporterState,
                  dev_build: updated,
                };
                setSupporterState(nextState);
                if (onSuccess) onSuccess(nextState);
              }}
              className={`flex flex-col items-end gap-1.5 ${
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
            icon={isSyncing ? t("icon_sync", "sync") : t("icon_refresh", "refresh")}
            label={t("supporter_sync_and_check_btn", "Sync Status & Check Updates")}
            disabled={isSyncing}
            onClick={handleSyncStatus}
            className="w-full"
          />
        </div>

        {onNavigateSettings && (
          <button
            type="button"
            onClick={onNavigateSettings}
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
        )}
      </div>
    </SidePanel>
  );
}
