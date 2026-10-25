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
  toggleLocalFollow,
  getKeepersPipelineConfig,
  loadPartnerCommunitiesList,
  checkSupporterDevBuildUpdate,
  downloadAndInstallReleaseAsset,
  syncUpdateChannelNotification,
  buildPartnerCheckoutUrl,
  isSandboxDonationUrl,
  presentSupporterCelebrationModal,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
  LocalSupporterStatePayload,
} from "../utils/supporterManager";
import { isDesktop } from "../utils/envUtils";
import { useModalStore } from "../store/modalStore";
import packageJson from "../../package.json";

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
  const isDevBuildUnlocked = devBuildUntil > nowSecs;
  const remainingSeconds = Math.max(0, devBuildUntil - nowSecs);
  const remainingDays = Math.ceil(remainingSeconds / 86400);
  const creditDollars = (
    (supporterState.dev_build.donation_credit_cents || 0) / 100
  ).toFixed(2);

  const handleSyncAndCheckStream = async () => {
    if (checkingDevStream) return;
    setCheckingDevStream(true);
    try {
      await refreshData();
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

    // Automatically poll supporter status in the background while checkout is open so webhook credits appear live
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
            "Creator Supporter Pass verified and saved to your local SQLite Vault!",
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

  const handleRemoveMasonBridge = async (masonId: string) => {
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
          "Local Creator Supporter Pass removed from Vault.",
        ),
        "info",
      );
  };

  const handleUnfollowLocal = async (follow: any) => {
    await toggleLocalFollow({
      masonId: follow.mason_id,
      masonName: follow.mason_name,
      avatarUrl: follow.avatar_url,
      workspaceId: follow.workspace_id,
    });
    setSupporterState((prev) => ({
      ...prev,
      follows: prev.follows.filter((f) => f.mason_id !== follow.mason_id),
    }));
  };

  return (
    <>
      <div className="flex flex-col gap-16 w-full pb-48">
        {/* SECTION 1: GLOBAL DAILY DEV BUILDS (2 CLEAN CARDS) */}
        <TabContainer
          title={t("supporter_dev_builds_title", "Global Daily Dev Builds")}
          icon={t("icon_bolt", "bolt")}
        >
          <SettingsGrid>
            <UniversalCard
              title={t(
                "supporter_dev_builds_channel_toggle",
                "Daily Dev Build Channel",
              )}
              subtitle={
                isDevBuildUnlocked
                  ? t("supporter_active_channel_label", "Active Stream")
                  : t("supporter_dev_builds_locked", "Standard Stable Channel")
              }
              description={t(
                "supporter_dev_builds_channel_desc",
                "Receive nightly preview builds from the Dev Build channel while your supporter time is active.",
              )}
              icon={t("icon_bolt", "bolt")}
              onClick={async () => {
                if (!isDevBuildUnlocked) return;
                const nextEnabled = !supporterState.dev_build.channel_enabled;
                const updated = await setDevBuildChannelPreference(nextEnabled);
                setSupporterState((prev) => ({
                  ...prev,
                  dev_build: updated,
                }));
                await syncUpdateChannelNotification({
                  currentVersion: packageJson.version,
                  switchedToChannel: updated.channel_enabled ? "dev" : "stable",
                  forceGitHubRefresh: true,
                });
                useStore
                  .getState()
                  .pushStatus(
                    updated.channel_enabled
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
              }}
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
              <div
                className={`w-full mt-2 px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 border backdrop-blur-md transition-all ${
                  isDevBuildUnlocked
                    ? "bg-[color-mix(in_srgb,var(--success)_12%,rgba(var(--bg-rgb),0.65))] border-[color-mix(in_srgb,var(--success)_38%,transparent)] text-[var(--success)]"
                    : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)]"
                }`}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[16px] shrink-0">
                    {isDevBuildUnlocked
                      ? t("icon_verified", "verified")
                      : t("icon_lock_clock", "lock_clock")}
                  </span>
                  <span className="text-[11px] font-black tracking-wide whitespace-nowrap">
                    {isDevBuildUnlocked
                      ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                      : t("supporter_dev_builds_locked", "Standard Stable Channel")}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold opacity-90 shrink-0 whitespace-nowrap">
                  {isDevBuildUnlocked
                    ? new Date(devBuildUntil * 1000).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )
                    : t("supporter_stable_fallback_label", "$5 = +30 Days Access")}
                </span>
              </div>
            </UniversalCard>

            <UniversalCard
              title={t(
                "supporter_status_card_title",
                "Supporter Time & Updates",
              )}
              subtitle={`${supporterState.dev_build.total_months_unlocked || 0} ${t("supporter_months_suffix", "Months")} • $${creditDollars} / $5.00`}
              description={t(
                "supporter_status_card_desc",
                "Every $5 donated to any Partner Community automatically adds +30 days via payment processor webhook.",
              )}
              icon={t("icon_verified", "verified")}
              onClick={handleSyncAndCheckStream}
              actions={
                <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-2 shadow-sm">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {t("icon_calendar_month", "calendar_month")}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
                    ${creditDollars} / $5.00
                  </span>
                </div>
              }
            >
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
                className="w-full pointer-events-none mt-2"
              />
            </UniversalCard>
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 2: PARTNER COMMUNITIES (KEEPERS CORE + CONFIGURED PARTNERS) */}
        <TabContainer
          title={t("supporter_partners_title", "Partner Communities")}
          icon={t("icon_public", "public")}
        >
          <div className="flex flex-col gap-6 w-full">
            {/* SINGLE COMBINED HIGH-CONTRAST NOTICE BAR (ABOVE COMMUNITIES) */}
            <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,rgba(var(--bg-rgb),0.88))] shadow-[0_8px_24px_rgba(0,0,0,0.28)] flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined !text-[20px]">
                  {t("icon_info", "info")}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-black text-[var(--warning)] tracking-wide">
                  {t(
                    "supporter_liability_title",
                    "100% Non-Custodial • 0% Platform Fee",
                  )}
                </span>
                <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed">
                  {t(
                    "supporter_combined_partner_notice",
                    "Partner Communities run their own payment processors and receive 100% of your donation (0% platform fee, no chargebacks covered by Sanctuary OS). Payment webhooks automatically credit your account with +30 days per $5. If a community isn't listed yet, its Wayfinders can link their payment processor in Wayfinder Operations.",
                  )}
                </p>
              </div>
            </div>

            <SettingsGrid>
              <UniversalCard
                title={t(
                  "supporter_keepers_title",
                  "Sanctuary Foundry",
                )}
                subtitle={t(
                  "supporter_keepers_card_subtitle",
                  "Core OS & Global Dev Builds",
                )}
                description={t(
                  "supporter_keepers_desc",
                  "Directly support Sanctuary Foundry building Sanctuary OS. Every $5 donation adds +30 days of Global Dev Build access to your account.",
                )}
                icon={t("icon_rocket_launch", "rocket_launch")}
                onClick={() =>
                  handlePartnerDonateClick(
                    "keepers_core",
                    keepersConfig.keepers_donation_url,
                  )
                }
                actions={
                  <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                      {isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                        ? t("icon_science", "science")
                        : t("icon_payments", "payments")}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text)] tracking-wide">
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
                  onClick={() =>
                    handlePartnerDonateClick(
                      String(partner.id),
                      partner.donation_url,
                    )
                  }
                  actions={
                    <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {isSandboxDonationUrl(partner.donation_url)
                          ? t("icon_science", "science")
                          : t("icon_payments", "payments")}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text)] tracking-wide">
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
                        : t(
                            "supporter_btn_donate_partner",
                            "Support Community",
                          )
                    }
                    className="w-full pointer-events-none mt-2"
                  />
                </UniversalCard>
              ))}
            </SettingsGrid>
          </div>
        </TabContainer>

        {/* SECTION 3: CREATOR SUPPORTER PASSES (CLEAN CARD GRID) */}
        <TabContainer
          title={t(
            "supporter_masons_vault_title",
            "{Mason} Supporter Passes (Local {Vault})",
          )}
          icon={t("icon_encrypted", "encrypted")}
        >
          <div className="flex flex-col gap-6 w-full">
            <SettingsGrid>
              <UniversalCard
                title={t(
                  "supporter_btn_add_mason_bridge",
                  "Link {Mason} Supporter Pass",
                )}
                subtitle={t("supporter_local_vault_chip", "Local PC {Vault}")}
                description={t(
                  "supporter_link_pass_card_desc",
                  "Verify a Patreon or Ko-fi pass locally on your PC (zero cloud tracking) to unlock Priority Support and Early Access.",
                )}
                icon={t("icon_add_link", "add_link")}
                onClick={() => setIsBridgeOpen(true)}
                actions={
                  <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                      {t("icon_lock", "lock")}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--success)] tracking-wide">
                      {t("supporter_local_vault_chip", "Local PC {Vault}")}
                    </span>
                  </div>
                }
              >
                <ActionButton
                  variant="accent"
                  icon={t("icon_add_link", "add_link")}
                  label={t(
                    "supporter_btn_add_mason_bridge",
                    "Link Creator Supporter Pass",
                  )}
                  className="w-full pointer-events-none mt-2"
                />
              </UniversalCard>

              {supporterState.supporters.map((pass) => (
                <UniversalCard
                  key={pass.mason_id}
                  title={pass.mason_name || pass.mason_id}
                  subtitle={`${pass.provider.toUpperCase()} • ${pass.tier_name}`}
                  icon={t("icon_workspace_premium", "workspace_premium")}
                  actions={
                    <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--success)] tracking-wide">
                        {t(
                          "supporter_badge_verified_patron",
                          "Verified Supporter",
                        )}
                      </span>
                    </div>
                  }
                >
                  <ActionButton
                    variant="danger"
                    icon={t("icon_delete", "delete")}
                    label={t(
                      "supporter_btn_unlink_bridge",
                      "Remove Local Pass",
                    )}
                    className="w-full mt-2"
                    onClick={() => handleRemoveMasonBridge(pass.mason_id)}
                  />
                </UniversalCard>
              ))}

              {supporterState.follows.map((f) => (
                <UniversalCard
                  key={f.mason_id}
                  title={f.mason_name || f.mason_id}
                  subtitle={new Date(f.followed_at * 1000).toLocaleDateString()}
                  icon={t("icon_person", "person")}
                >
                  <ActionButton
                    variant="glass"
                    icon={t("icon_person_remove", "person_remove")}
                    label={t("btn_unfollow", "Unfollow")}
                    className="w-full mt-2"
                    onClick={() => handleUnfollowLocal(f)}
                  />
                </UniversalCard>
              ))}
            </SettingsGrid>
          </div>
        </TabContainer>
      </div>

      {/* SIDEPANEL: LINK PRIVATE CREATOR SUPPORTER PASS */}
      <SidePanel
        isOpen={isBridgeOpen}
        onClose={() => setIsBridgeOpen(false)}
        title={t(
          "supporter_bridge_modal_title",
          "Link Creator Supporter Pass",
        )}
        subtitle={t(
          "supporter_bridge_modal_subtitle",
          "Verify Patreon or Ko-fi support locally on your PC without cloud tracking",
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
                "Verify & Save to Vault",
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
              "Link Creator Supporter Pass",
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
            placeholder={t("supporter_bridge_creator_label", "{Mason} Name or ID")}
          />

          <UniversalGroup
            title={t(
              "supporter_bridge_modal_title",
              "Link Creator Supporter Pass",
            )}
            icon={t("icon_encrypted", "encrypted")}
          >
            {knownMasons.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                  {t("supporter_bridge_creator_label", "{Mason} Name or ID")}
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
                        setBridgeProvider(found.payment_processor.toLowerCase());
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
                  "Patreon Token or Supporter Pass Key",
                )}
              </label>
              <input
                type="password"
                value={bridgeToken}
                onChange={(e) => setBridgeToken(e.target.value)}
                placeholder={t(
                  "supporter_bridge_token_ph",
                  "Paste your token or supporter pass key (saved on your PC only)...",
                )}
                className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t(
                  "supporter_bridge_tier_label",
                  "Supporter Tier Name (Optional)",
                )}
              </label>
              <input
                type="text"
                value={bridgeTierName}
                onChange={(e) => setBridgeTierName(e.target.value)}
                placeholder={t(
                  "supporter_bridge_tier_label",
                  "Supporter Tier Name (Optional)",
                )}
                className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner"
              />
            </div>

            <ActionButton
              variant="accent"
              icon={t("icon_encrypted", "encrypted")}
              label={t(
                "supporter_bridge_btn_verify",
                "Verify & Save to Vault",
              )}
              disabled={
                isLinkingBridge ||
                (!bridgeMasonName.trim() && !bridgeMasonId.trim()) ||
                !bridgeToken.trim()
              }
              onClick={handleLinkMasonBridge}
              className="w-full"
            />
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
