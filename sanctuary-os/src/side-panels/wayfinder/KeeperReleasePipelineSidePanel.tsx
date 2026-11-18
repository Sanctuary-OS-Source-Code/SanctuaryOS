import { useState, useEffect } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  SidePanel,
  CustomDropdown,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  DashboardStatTile,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../../shared";
import { TransparentCostReportBlock } from "../CommunitySupportSidePanel";
import { getMonthlyServerGoalStatus, FoundryCostBreakdown } from "../../utils/supporterManager";
import packageJson from "../../../package.json";
import { centsToDollarInput, dollarsToCents } from "./wayfinderPanelHelpers";
import { LockedCycleLedgerSection } from "./LockedCycleLedgerSection";

export function KeeperReleasePipelineSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const [activeSubTab, setActiveSubTab] = useState<
    "pipeline" | "report" | "checkout"
  >("pipeline");
  const [keepersProcessor, setKeepersProcessor] = useState("STRIPE");
  const [keepersUrl, setKeepersUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("support@sanctuaryos.net");

  // Foundry cost breakdown inputs ($ USD)
  const [domainAnnualDollars, setDomainAnnualDollars] = useState("24");
  const [supabaseMonthlyDollars, setSupabaseMonthlyDollars] = useState("25");
  const [windowsAnnualDollars, setWindowsAnnualDollars] = useState("120");
  const [appleAnnualDollars, setAppleAnnualDollars] = useState("99");
  const [infraOtherMonthlyDollars, setInfraOtherMonthlyDollars] = useState("5");
  const [infraHostingDollars, setInfraHostingDollars] = useState("1.50");
  const [infraEmailDollars, setInfraEmailDollars] = useState("1.50");
  const [infraStorageDollars, setInfraStorageDollars] = useState("1.00");
  const [infraMonitoringDollars, setInfraMonitoringDollars] = useState("1.00");
  const [grossDollars, setGrossDollars] = useState("0");
  const [stripeFeesDollars, setStripeFeesDollars] = useState("0");
  const [carryoverDollars, setCarryoverDollars] = useState("0");

  const [liveStableVer, setLiveStableVer] = useState("0.5.7");
  const [liveStableDate, setLiveStableDate] = useState("");
  const [liveDevVer, setLiveDevVer] = useState("");
  const [liveDevDate, setLiveDevDate] = useState("");
  const [liveDevNotes, setLiveDevNotes] = useState("");
  const [hasLiveDev, setHasLiveDev] = useState(false);
  const [syncingGitHub, setSyncingGitHub] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFromGitHubAndConfig = async (forceRefresh = false) => {
    setSyncingGitHub(true);
    try {
      const { getKeepersPipelineConfig, getMonthlyServerGoalStatus } =
        await import("../../utils/supporterManager");
      const cfg = await getKeepersPipelineConfig(forceRefresh);
      const proc = (cfg.keepers_payment_processor || "STRIPE").toUpperCase();
      setKeepersProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
      setKeepersUrl(cfg.keepers_donation_url || "");
      setSupportEmail(cfg.support_contact_email || "support@sanctuaryos.net");

      const status = getMonthlyServerGoalStatus(cfg);
      const fb = status.foundryBreakdown;
      if (fb) {
        setDomainAnnualDollars(centsToDollarInput(fb.domain_annual_cents, 2400));
        setSupabaseMonthlyDollars(
          centsToDollarInput(fb.supabase_monthly_cents, 2500)
        );
        setWindowsAnnualDollars(
          centsToDollarInput(fb.windows_signing_annual_cents, 12000)
        );
        setAppleAnnualDollars(
          centsToDollarInput(fb.apple_dev_annual_cents, 9900)
        );
        setInfraOtherMonthlyDollars(
          centsToDollarInput(fb.infra_other_monthly_cents, 500)
        );
        setInfraHostingDollars(centsToDollarInput(fb.infra_hosting_cents, 150));
        setInfraEmailDollars(centsToDollarInput(fb.infra_email_cents, 150));
        setInfraStorageDollars(
          centsToDollarInput(fb.infra_release_storage_cents, 100)
        );
        setInfraMonitoringDollars(
          centsToDollarInput(fb.infra_monitoring_cents, 100)
        );
        setGrossDollars(centsToDollarInput(fb.gross_contributions_cents, 0));
        setStripeFeesDollars(centsToDollarInput(fb.stripe_fees_cents, 0));
        setCarryoverDollars(centsToDollarInput(fb.carryover_cents, 0));
      }

      setLiveStableVer(cfg.stable_version || "0.5.7");
      setLiveStableDate(cfg.stable_published_at || "");
      setLiveDevVer(cfg.dev_build_version || "");
      setLiveDevDate(cfg.dev_published_at || "");
      setLiveDevNotes(cfg.dev_build_notes || "");
      setHasLiveDev(Boolean(cfg.has_live_dev_release));
      if (forceRefresh) {
        useStore
          .getState()
          .pushStatus(
            t(
              "keepers_github_synced_toast",
              "Synced live release channels from GitHub!"
            ),
            "success"
          );
      }
    } finally {
      setSyncingGitHub(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadFromGitHubAndConfig(true);
  }, [isOpen]);

  const draftFoundryBreakdown: FoundryCostBreakdown = {
    domain_annual_cents: Math.max(0, dollarsToCents(domainAnnualDollars)),
    supabase_monthly_cents: Math.max(0, dollarsToCents(supabaseMonthlyDollars)),
    windows_signing_annual_cents: Math.max(
      0,
      dollarsToCents(windowsAnnualDollars)
    ),
    apple_dev_annual_cents: Math.max(0, dollarsToCents(appleAnnualDollars)),
    infra_other_monthly_cents: Math.max(
      0,
      dollarsToCents(infraOtherMonthlyDollars)
    ),
    infra_hosting_cents: Math.max(0, dollarsToCents(infraHostingDollars)),
    infra_email_cents: Math.max(0, dollarsToCents(infraEmailDollars)),
    infra_release_storage_cents: Math.max(
      0,
      dollarsToCents(infraStorageDollars)
    ),
    infra_monitoring_cents: Math.max(0, dollarsToCents(infraMonitoringDollars)),
    gross_contributions_cents: Math.max(0, dollarsToCents(grossDollars)),
    stripe_fees_cents: Math.max(0, dollarsToCents(stripeFeesDollars)),
    carryover_cents: dollarsToCents(carryoverDollars),
  };

  const previewFoundryGoal = getMonthlyServerGoalStatus({
    keepers_donation_url: keepersUrl,
    keepers_payment_processor: keepersProcessor,
    stable_version: liveStableVer,
    dev_build_version: liveDevVer,
    dev_build_endpoint: "",
    dev_build_download_url: "",
    dev_build_notes: liveDevNotes,
    foundry_cost_breakdown: draftFoundryBreakdown,
    updated_at: "",
  });

  // Compute next tags automatically from package.json and live GitHub versions
  const basePkgVer = (packageJson.version || "0.5.8")
    .replace(/^v/i, "")
    .split("-")[0]
    .trim();
  const nextStableTag = `v${basePkgVer}`;
  const nextDevTag = (() => {
    if (liveDevVer && liveDevVer.startsWith(`${basePkgVer}-dev.`)) {
      const num = parseInt(liveDevVer.split("-dev.")[1] || "1", 10);
      if (!isNaN(num)) return `v${basePkgVer}-dev.${num + 1}`;
    }
    return `v${basePkgVer}-dev.1`;
  })();

  const handleCopyDevTagCommand = () => {
    const cmd = `git tag ${nextDevTag} && git push origin ${nextDevTag}`;
    navigator.clipboard.writeText(cmd);
    useStore
      .getState()
      .pushStatus(
        t(
          "keepers_pipeline_tag_copied",
          "Git tag release command copied to clipboard!"
        ),
        "success"
      );
  };

  const handleCopyStableTagCommand = () => {
    const cmd = `git tag ${nextStableTag} && git push origin ${nextStableTag}`;
    navigator.clipboard.writeText(cmd);
    useStore
      .getState()
      .pushStatus(
        t(
          "keepers_pipeline_tag_copied",
          "Git tag release command copied to clipboard!"
        ),
        "success"
      );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { saveKeepersPipelineConfig } = await import(
        "../../utils/supporterManager"
      );
      await saveKeepersPipelineConfig({
        keepers_payment_processor: keepersProcessor,
        keepers_donation_url: keepersUrl.trim(),
        support_contact_email: supportEmail.trim() || "support@sanctuaryos.net",
        monthly_server_goal_cents: previewFoundryGoal.totalOperatingCostCents,
        monthly_server_covered_cents: previewFoundryGoal.netReceivedCents,
        foundry_cost_breakdown: draftFoundryBreakdown,
      });
      useStore
        .getState()
        .pushStatus(
          t(
            "keepers_pipeline_saved_toast",
            "Release pipeline & donation settings saved!"
          ),
          "success"
        );
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        "keepers_pipeline_panel_title",
        "Dev Build Pipeline & Keepers Donations"
      )}
      subtitle={t(
        "keepers_pipeline_panel_subtitle",
        "Publish Dev Builds for Supporters & Configure Keepers Core Donations"
      )}
      icon={t("icon_rocket_launch", "rocket_launch")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
            tooltip={t("save", "Save")}
            onClick={handleSave}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_rocket_launch", "rocket_launch")}
          overline={t("supporter_keepers_title", "Sanctuary Foundry")}
          title={t(
            "keepers_pipeline_panel_title",
            "Release Pipeline & Supporter Channels"
          )}
          description={t(
            "keepers_github_auto_subtitle",
            "Stable and Dev Build versions, installers, and patch notes are pulled automatically from GitHub Releases."
          )}
          badge={`v${liveStableVer.replace(/^v/i, "")}`}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t(
                "keepers_github_live_stable_label",
                "Live Stable Release"
              )}
              value={`v${liveStableVer.replace(/^v/i, "")}`}
              icon={t("icon_verified", "verified")}
              iconColorClass="text-[var(--accent)]"
              colorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("keepers_github_live_dev_label", "Live Dev Build")}
              value={hasLiveDev ? `v${liveDevVer.replace(/^v/i, "")}` : "--"}
              icon={t("icon_bolt", "bolt")}
              iconColorClass="text-[var(--success)]"
              colorClass="text-[var(--success)]"
            />
          </div>
        </SidePanelHeroCard>

        {/* SUB-TABS INSIDE SIDE PANEL */}
        <SidePanelFilterBar className="grid-cols-3 gap-2.5">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_cloud_sync", "cloud_sync")}
            label={t("report_tab_pipeline", "Release Pipeline")}
            isActive={activeSubTab === "pipeline"}
            onClick={() => setActiveSubTab("pipeline")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_receipt_long", "receipt_long")}
            label={t("report_tab_cost_breakdown", "Cost & Spending Report")}
            isActive={activeSubTab === "report"}
            onClick={() => setActiveSubTab("report")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_payments", "payments")}
            label={t("report_tab_checkout", "Processor & Checkout")}
            isActive={activeSubTab === "checkout"}
            onClick={() => setActiveSubTab("checkout")}
          />
        </SidePanelFilterBar>

        {activeSubTab === "pipeline" && (
          <UniversalGroup
            title={t(
              "keepers_github_auto_title",
              "GitHub Releases Auto-Sync (Live Channels)"
            )}
            icon={t("icon_cloud_sync", "cloud_sync")}
            headerColorClass="text-[var(--success)]"
            headerActions={
              <ActionButton
                variant="glass"
                icon={t("icon_refresh", "refresh")}
                onClick={() => loadFromGitHubAndConfig(true)}
                disabled={syncingGitHub}
                className="!px-3 !py-1.5"
              >
                {t("keepers_github_sync_btn", "Refresh from GitHub")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 gap-3">
                {/* LIVE DEV BUILD */}
                <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--success)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_bolt", "bolt")}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t(
                          "keepers_github_live_dev_label",
                          "Live Dev Build (GitHub)"
                        )}
                      </span>
                    </div>
                    <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                        {t("icon_tag", "tag")}
                      </span>
                      <span>
                        {hasLiveDev
                          ? `v${liveDevVer.replace(/^v/i, "")}${liveDevDate ? ` • ${new Date(liveDevDate).toLocaleDateString()}` : ""}`
                          : t(
                            "keepers_github_not_published",
                            "No dev-latest release published yet"
                          )}
                      </span>
                    </span>
                  </div>
                  {hasLiveDev && liveDevNotes && (
                    <p className="text-[11px] font-medium text-[var(--subtext)] opacity-90 line-clamp-2 leading-relaxed">
                      {liveDevNotes}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                      {`git tag ${nextDevTag} && git push origin ${nextDevTag}`}
                    </span>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={handleCopyDevTagCommand}
                      className="!px-3 !py-1.5 shrink-0"
                    >
                      {t(
                        "keepers_pipeline_copy_dev_btn",
                        "Copy Dev Tag Command"
                      )}
                    </ActionButton>
                  </div>
                </div>

                {/* LIVE STABLE RELEASE */}
                <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_verified", "verified")}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t(
                          "keepers_github_live_stable_label",
                          "Live Stable Release (GitHub)"
                        )}
                      </span>
                    </div>
                    <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_tag", "tag")}
                      </span>
                      <span>
                        {`v${liveStableVer.replace(/^v/i, "")}${liveStableDate ? ` • ${new Date(liveStableDate).toLocaleDateString()}` : ""}`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                      {`git tag ${nextStableTag} && git push origin ${nextStableTag}`}
                    </span>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={handleCopyStableTagCommand}
                      className="!px-3 !py-1.5 shrink-0"
                    >
                      {t(
                        "keepers_pipeline_copy_stable_btn",
                        "Copy Stable Tag Command"
                      )}
                    </ActionButton>
                  </div>
                </div>
              </div>

              <p className="text-xs font-medium text-[var(--subtext)] opacity-90 leading-relaxed">
                {t(
                  "keepers_pipeline_how_it_works",
                  "Pushing a v*-dev* tag (e.g. v0.5.9-dev.1) publishes only to the Supporter Dev Build channel (dev-latest) without changing the public Website download links. Pushing a clean v* tag (e.g. v0.5.9) publishes to the Stable channel for all users and updates the Website."
                )}
              </p>
            </div>
          </UniversalGroup>
        )}

        {activeSubTab === "report" && (
          <div className="flex flex-col gap-4">
            <UniversalGroup
              title={t(
                "report_foundry_title",
                "Foundry Cost & Spending Report"
              )}
              icon={t("icon_receipt_long", "receipt_long")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_domain", "Domain Registration & DNS")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={domainAnnualDollars}
                    onChange={(e) => setDomainAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_supabase_hub", "Supabase (Core Hub)")} (${t("report_monthly_usd_suffix", "/ mo")})`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={supabaseMonthlyDollars}
                    onChange={(e) => setSupabaseMonthlyDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_windows_signing", "Windows OV/EV Code Signing")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={windowsAnnualDollars}
                    onChange={(e) => setWindowsAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_apple_dev", "Apple Developer Program")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={appleAnnualDollars}
                    onChange={(e) => setAppleAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_dns", "dns")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t(
                          "report_item_infra_other",
                          "Hosting, Email, Release Storage & Monitoring"
                        )}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-xs font-black font-mono text-[var(--accent)]">
                      {`$${(Math.max(0, dollarsToCents(infraOtherMonthlyDollars)) / 100).toFixed(2)} ${t("report_monthly_usd_suffix", "/mo")}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: "hosting",
                        label: t(
                          "report_sub_infra_hosting",
                          "Web Hosting & Edge CDN"
                        ),
                        value: infraHostingDollars,
                        onChange: (v: string) => {
                          setInfraHostingDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "email",
                        label: t(
                          "report_sub_infra_email",
                          "Transactional Email & Dispatch"
                        ),
                        value: infraEmailDollars,
                        onChange: (v: string) => {
                          setInfraEmailDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "storage",
                        label: t(
                          "report_sub_infra_storage",
                          "Release Binary Storage"
                        ),
                        value: infraStorageDollars,
                        onChange: (v: string) => {
                          setInfraStorageDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "monitoring",
                        label: t(
                          "report_sub_infra_monitoring",
                          "Uptime & Crash Telemetry"
                        ),
                        value: infraMonitoringDollars,
                        onChange: (v: string) => {
                          setInfraMonitoringDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(0, dollarsToCents(v));
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                    ].map((sub) => (
                      <div key={sub.key} className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                          {`${sub.label} (${t("report_monthly_usd_suffix", "/mo")})`}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sub.value}
                          onChange={(e) => sub.onChange(e.target.value)}
                          className="w-full glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </UniversalGroup>

            <LockedCycleLedgerSection
              grossDollars={grossDollars}
              setGrossDollars={setGrossDollars}
              stripeFeesDollars={stripeFeesDollars}
              setStripeFeesDollars={setStripeFeesDollars}
              carryoverDollars={carryoverDollars}
              setCarryoverDollars={setCarryoverDollars}
            />

            <TransparentCostReportBlock goal={previewFoundryGoal} />

            <ActionButton
              variant="glass"
              icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center !py-3"
            >
              {t("save", "Save")}
            </ActionButton>
          </div>
        )}

        {activeSubTab === "checkout" && (
          <UniversalGroup
            title={t("supporter_keepers_title", "Sanctuary Foundry")}
            icon={t("icon_volunteer_activism", "volunteer_activism")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t("wf_donation_processor_label", "Payment Processor")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={keepersProcessor}
                  onChange={(val: any) =>
                    setKeepersProcessor(Array.isArray(val) ? val[0] : val)
                  }
                  options={[
                    {
                      id: "STRIPE",
                      label: t(
                        "proc_stripe_checkout",
                        "Stripe Checkout / Payment Link"
                      ),
                    },
                    {
                      id: "STRIPE / GITHUB SPONSORS",
                      label: t(
                        "proc_stripe_github",
                        "Stripe / GitHub Sponsors"
                      ),
                    },
                    { id: "PATREON", label: "Patreon" },
                    { id: "KO-FI", label: "Ko-fi" },
                    { id: "PAYPAL", label: "PayPal" },
                    {
                      id: "CUSTOM",
                      label: t(
                        "proc_custom_direct",
                        "Custom Direct Processor"
                      ),
                    },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t("wf_donation_url_label", "Donation / Checkout Link")}
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={keepersUrl}
                  onChange={(e) => setKeepersUrl(e.target.value)}
                  placeholder={t(
                    "wf_donation_url_ph",
                    "https://donate.stripe.com/... or https://ko-fi.com/..."
                  )}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t(
                    "keepers_email_sender_addr_label",
                    "Custom Sender Email (From)"
                  )}
                </label>
                <input
                  type="text"
                  inputMode="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@sanctuaryos.net"
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <ActionButton
                variant="glass"
                icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
                onClick={handleSave}
                disabled={saving}
                className="w-full justify-center !py-3"
              >
                {t("save", "Save")}
              </ActionButton>
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}

