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
  setDevBuildChannelPreference,
  getKeepersPipelineConfig,
  loadPartnerCommunitiesList,
  buildPartnerCheckoutUrl,
  presentSupporterCelebrationModal,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
  LocalSupporterStatePayload,
  getMonthlyServerGoalStatus,
  getSpokeServerGoalStatus,
  TransparentGoalStatus,
  isFoundryPatron,
} from "../utils/supporterManager";

function formatUsdFromCents(cents: number): string {
  const abs = Math.abs(Number(cents) || 0);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function TransparentCostReportBlock({
  goal,
}: {
  goal: TransparentGoalStatus;
}) {
  const { t } = useLexicon();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getLineMeta = (id: string) => {
    switch (id) {
      case "domain":
        return {
          label: t("report_item_domain", "Domain Registration & DNS"),
          icon: t("icon_language", "language"),
        };
      case "supabase_hub":
        return {
          label: t(
            "report_item_supabase_hub",
            "Supabase (Monthly Equivalent)"
          ),
          icon: t("icon_database", "database"),
        };
      case "windows_signing":
        return {
          label: t(
            "report_item_windows_signing",
            "Windows OV/EV Code Signing"
          ),
          icon: t("icon_verified_user", "verified_user"),
        };
      case "apple_dev":
        return {
          label: t("report_item_apple_dev", "Apple Developer Program"),
          icon: t("icon_laptop_mac", "laptop_mac"),
        };
      case "infra_other":
        return {
          label: t(
            "report_item_infra_other",
            "Hosting, Email, Release Storage & Monitoring"
          ),
          icon: t("icon_dns", "dns"),
        };
      case "spoke_db":
        return {
          label: t("report_item_spoke_db", "Database Compute & Storage"),
          icon: t("icon_database", "database"),
        };
      case "spoke_auth":
        return {
          label: t("report_item_spoke_auth", "Auth Activity"),
          icon: t("icon_passkey", "passkey"),
        };
      case "spoke_realtime":
        return {
          label: t(
            "report_item_spoke_realtime",
            "Realtime Connections & Messages"
          ),
          icon: t("icon_sensors", "sensors"),
        };
      case "spoke_edge":
        return {
          label: t("report_item_spoke_edge", "Edge Functions"),
          icon: t("icon_bolt", "bolt"),
        };
      case "spoke_storage":
        return {
          label: t("report_item_spoke_storage", "File Storage & Egress"),
          icon: t("icon_cloud_queue", "cloud_queue"),
        };
      case "spoke_backups":
      default:
        return {
          label: t(
            "report_item_spoke_backups",
            "Database Backups & Audit Log Retention"
          ),
          icon: t("icon_history", "history"),
        };
    }
  };

  const getSubItemMeta = (subId: string) => {
    switch (subId) {
      case "infra_sub_hosting":
        return {
          label: t(
            "report_sub_infra_hosting",
            "Web Hosting & Edge CDN"
          ),
          icon: t("icon_public", "public"),
        };
      case "infra_sub_email":
        return {
          label: t(
            "report_sub_infra_email",
            "Transactional Email & Dispatch"
          ),
          icon: t("icon_mail", "mail"),
        };
      case "infra_sub_storage":
        return {
          label: t(
            "report_sub_infra_storage",
            "Release Binary Storage"
          ),
          icon: t("icon_cloud_download", "cloud_download"),
        };
      case "infra_sub_monitoring":
      default:
        return {
          label: t(
            "report_sub_infra_monitoring",
            "Uptime & Crash Telemetry"
          ),
          icon: t("icon_monitoring", "monitoring"),
        };
    }
  };

  const isSurplus = goal.carryoverAfterCycleCents >= 0;
  const remainingUnsignedCents = Math.abs(goal.carryoverAfterCycleCents);

  return (
    <div className="flex flex-col gap-4">
      <UniversalGroup
        title={
          goal.isFoundry
            ? t(
              "report_foundry_title",
              "Foundry Operating Cost & Spending Report"
            )
            : t(
              "report_spoke_title",
              "Spoke Infrastructure & Spending Report"
            )
        }
        icon={t("icon_receipt_long", "receipt_long")}
      >
        <div className="px-3.5 py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 flex-1 min-w-[200px]">
            {t(
              "report_period_disclaimer",
              "Figures reflect active monthly cycle invoices and usage rather than fixed permanent pricing."
            )}
          </p>
          <span className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[10px] font-black font-mono uppercase tracking-wider text-[var(--subtext)] inline-flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
              {t("icon_calendar_month", "calendar_month")}
            </span>
            <span>
              {`${t("report_billing_cycle_badge", "Cycle")}: ${goal.billingPeriodLabel} • ${t("report_updated_prefix", "Updated")} ${goal.updatedLabel}`}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {goal.lineItems.map((item, idx) => {
            const meta = getLineMeta(item.id);
            const isAnnual = item.cadence === "annual";
            const hasSubItems =
              Array.isArray(item.subItems) && item.subItems.length > 0;
            const isExpanded = expandedIds.includes(item.id);
            const isOddLastItem =
              goal.lineItems.length % 2 === 1 &&
              idx === goal.lineItems.length - 1;

            if (hasSubItems) {
              return (
                <div
                  key={item.id}
                  onClick={() => toggleExpand(item.id)}
                  className={`p-3.5 rounded-2xl glass-surface border transition-all flex flex-col gap-3 sm:col-span-2 cursor-pointer ${isExpanded
                      ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[17px]">
                          {meta.icon}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black text-[var(--text)] leading-snug">
                          {meta.label}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80">
                          {t(
                            "report_bundled_services_sub",
                            "Bundled Monthly Infrastructure • 4 Services"
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-xs font-black font-mono text-[var(--accent)]">
                        {`${formatUsdFromCents(item.monthlyCents)} ${t("report_monthly_usd_suffix", "/mo")}`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(item.id);
                        }}
                        className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>
                          {t("report_view_services", "4 Services")}
                        </span>
                        <span className="material-symbols-outlined !text-[13px]">
                          {isExpanded
                            ? t("icon_expand_less", "expand_less")
                            : t("icon_expand_more", "expand_more")}
                        </span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      {item.subItems?.map((sub) => {
                        const subMeta = getSubItemMeta(sub.id);
                        return (
                          <div
                            key={sub.id}
                            className="p-2.5 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                <span className="material-symbols-outlined !text-[14px]">
                                  {subMeta.icon}
                                </span>
                              </div>
                              <span className="text-[11px] font-bold text-[var(--text)] leading-snug">
                                {subMeta.label}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[11px] font-black font-mono text-[var(--accent)] shrink-0">
                              {`${formatUsdFromCents(sub.monthlyCents)} ${t("report_monthly_usd_suffix", "/mo")}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-all flex flex-col justify-between gap-2.5 ${isOddLastItem ? "sm:col-span-2" : ""
                  }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                    <span className="material-symbols-outlined !text-[16px]">
                      {meta.icon}
                    </span>
                  </div>

                  {isAnnual && item.annualCents !== undefined && (
                    <span className="px-2 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[10px] font-bold font-mono text-[var(--subtext)]">
                      {`${formatUsdFromCents(item.annualCents)} ${t("report_annual_usd_suffix", "/yr")}`}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-black text-[var(--text)] leading-snug">
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80">
                    {isAnnual
                      ? t(
                        "report_cadence_annual_equiv",
                        "Annual Charge / Monthly Equiv."
                      )
                      : item.cadence === "supabase_dimension"
                        ? t(
                          "report_cadence_supabase_dim",
                          "Supabase Usage Dimension"
                        )
                        : t(
                          "report_cadence_monthly_invoice",
                          "Monthly Equivalent"
                        )}
                  </span>
                </div>

                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                    {t(
                      "report_cadence_monthly_invoice",
                      "Monthly Equivalent"
                    )}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-xs font-black font-mono text-[var(--accent)]">
                    {`${formatUsdFromCents(item.monthlyCents)} ${t("report_monthly_usd_suffix", "/mo")}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </UniversalGroup>

      <UniversalGroup
        title={t(
          "report_payment_processing_title",
          "Payment Processing & Cycle Ledger"
        )}
        icon={t("icon_account_balance", "account_balance")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* CARD 1: GROSS CONTRIBUTIONS */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_payments", "payments")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {t("report_gross_contributions", "Gross Contributions")}
                </span>
                <span className="text-sm font-black font-mono text-[var(--text)]">
                  {formatUsdFromCents(goal.grossContributionsCents)}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 2: PROCESSOR / STRIPE FEES */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--warning)]">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_percent", "percent")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {t("report_stripe_fees", "Payment Processing / Stripe Fees")}
                </span>
                <span className="text-sm font-black font-mono text-[var(--warning)]">
                  {`-${formatUsdFromCents(goal.stripeFeesCents)}`}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 3: NET RECEIVED */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_account_balance_wallet", "account_balance_wallet")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {t("report_net_received", "Net Received")}
                </span>
                <span className="text-sm font-black font-mono text-[var(--accent)]">
                  {formatUsdFromCents(goal.netReceivedCents)}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 4: PRIOR CYCLE CARRYOVER */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_history", "history")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {t("report_prior_carryover_card_title", "Prior Cycle Carryover")}
                </span>
                <span
                  className={`text-sm font-black font-mono ${goal.priorCarryoverCents > 0
                      ? "text-[var(--success)]"
                      : goal.priorCarryoverCents < 0
                        ? "text-[var(--warning)]"
                        : "text-[var(--text)]"
                    }`}
                >
                  {`${goal.priorCarryoverCents > 0 ? "+" : ""}${formatUsdFromCents(goal.priorCarryoverCents)}`}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 5: TOTAL OPERATING COST */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_memory", "memory")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {t("report_total_operating_cost", "Total Operating Cost")}
                </span>
                <span className="text-sm font-black font-mono text-[var(--text)]">
                  {`${formatUsdFromCents(goal.totalOperatingCostCents)} ${t("report_monthly_usd_suffix", "/mo")}`}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 6: REMAINING THIS CYCLE (UNSIGNED) OR SURPLUS CARRIED FORWARD */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 ${isSurplus
                    ? "border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[18px]">
                  {isSurplus
                    ? t("icon_trending_up", "trending_up")
                    : t("icon_schedule", "schedule")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85">
                  {isSurplus
                    ? t("report_carryover_surplus", "Surplus Carried Forward")
                    : t("report_remaining_this_cycle", "Remaining This Cycle")}
                </span>
                <span
                  className={`text-sm font-black font-mono ${isSurplus ? "text-[var(--success)]" : "text-[var(--warning)]"
                    }`}
                >
                  {isSurplus
                    ? `+${formatUsdFromCents(goal.carryoverAfterCycleCents)}`
                    : formatUsdFromCents(remainingUnsignedCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </UniversalGroup>
    </div>
  );
}

interface CommunitySupportSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPartnerId?: string;
  singlePartnerOnly?: boolean;
  onSuccess?: (newState: LocalSupporterStatePayload) => void;
  onNavigateSettings?: () => void;
  panelClass?: string;
  backdropZ?: string;
  panelZ?: string;
}

export function CommunitySupportSidePanel({
  isOpen,
  onClose,
  initialPartnerId,
  singlePartnerOnly = false,
  onSuccess,
  onNavigateSettings,
  panelClass,
  backdropZ,
  panelZ,
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
  const [activeSubTab, setActiveSubTab] = useState<"report" | "perks">(
    "report"
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
      if (initialPartnerId) {
        setSelectedPartnerId(initialPartnerId);
        setActiveSubTab("report");
      }
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
      schema_id: matchedSpokePartner.schema_id || activeSchemaId,
      name: matchedSpokePartner.name,
      icon:
        matchedSpokePartner.icon ||
        t("icon_sports_esports", "sports_esports"),
      donation_url: matchedSpokePartner.donation_url || "",
      payment_processor: matchedSpokePartner.payment_processor || "STRIPE",
      monthly_goal_cents: matchedSpokePartner.monthly_goal_cents,
      monthly_covered_cents: matchedSpokePartner.monthly_covered_cents,
      spoke_cost_breakdown: matchedSpokePartner.spoke_cost_breakdown,
    }
    : {
      id: String(activeWorkspaceId || "active_spoke"),
      schema_id: activeSchemaId,
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

  const selectedPartner: any =
    selectedPartnerId === "keepers_core"
      ? {
        id: "keepers_core",
        schema_id: "keepers_core",
        name: t("supporter_keepers_title", "Sanctuary Foundry"),
        icon: t("icon_rocket_launch", "rocket_launch"),
        donation_url: keepersConfig.keepers_donation_url || "",
        payment_processor:
          keepersConfig.keepers_payment_processor || "STRIPE",
      }
      : partners.find(
        (p) =>
          String(p.id).toLowerCase() ===
          String(selectedPartnerId).toLowerCase() ||
          String(p.schema_id || "").toLowerCase() ===
          String(selectedPartnerId).toLowerCase()
      ) || activeSpokeOption;

  const hasConfiguredUrl = Boolean(
    selectedPartner.donation_url &&
    String(selectedPartner.donation_url).trim().length > 0
  );

  const nowSecs = Math.floor(Date.now() / 1000);
  const devBuildUntil = supporterState.dev_build.dev_build_until || 0;
  const isDevBuildUnlocked = devBuildUntil > nowSecs;
  const remainingSeconds = Math.max(0, devBuildUntil - nowSecs);
  const remainingDays = Math.ceil(remainingSeconds / 86400);
  const creditDollars = (
    (supporterState.dev_build.donation_credit_cents || 0) / 100
  ).toFixed(2);
  const activeGoal =
    selectedPartnerId === "keepers_core"
      ? getMonthlyServerGoalStatus(keepersConfig)
      : getSpokeServerGoalStatus(selectedPartner);
  const isPatron = isFoundryPatron(supporterState);
  const isSurplus = activeGoal.carryoverAfterCycleCents >= 0;

  const handleCheckout = async () => {
    if (!hasConfiguredUrl) return;
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
                "Global Dev Build access updated! +30 days per $5 stacked to your account."
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
        "0% Platform Fee • Every $5 adds +30 days of Global Dev Builds"
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      panelClass={panelClass}
      backdropZ={backdropZ}
      panelZ={panelZ}
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        {/* TARGET PARTNER SELECTOR (FOUNDRY & ACTIVE SPOKE — 2 CENTERED TILES) */}
        {!singlePartnerOnly && (
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
        )}

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
              : selectedPartner.payment_processor
          }
          badgeIcon={
            !hasConfiguredUrl
              ? t("icon_link_off", "link_off")
              : t("icon_payments", "payments")
          }
          variant="accent"
        >
          {activeGoal.enabled && (
            <div className="px-3.5 py-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black font-mono tabular-nums text-[var(--text)]">
                    {`${formatUsdFromCents(activeGoal.fundedThisCycleCents)} / ${formatUsdFromCents(activeGoal.totalOperatingCostCents)}`}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-85">
                    {t(
                      "report_funded_this_cycle",
                      "Funded This Cycle (Net + Carryover)"
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-lg border bg-transparent ${isSurplus
                        ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                        : "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                      } text-[9px] font-black font-mono uppercase tracking-wider inline-flex items-center gap-1`}
                  >
                    <span>
                      {isSurplus
                        ? `${t("report_surplus_short", "Surplus")}: +${formatUsdFromCents(activeGoal.carryoverAfterCycleCents)}`
                        : `${t("report_remaining_short", "Remaining")}: ${formatUsdFromCents(Math.abs(activeGoal.carryoverAfterCycleCents))}`}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] inline-flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined !text-[11px]">
                      {t("icon_trending_up", "trending_up")}
                    </span>
                    <span>{`${activeGoal.percent}%`}</span>
                  </span>
                </div>
              </div>

              <div className="w-full h-3 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] p-0.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-500 relative overflow-hidden"
                  style={{
                    width: `${Math.max(4, activeGoal.percent)}%`,
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, color-mix(in srgb, var(--accent) 78%, transparent) 45%, color-mix(in srgb, var(--accent) 95%, black) 100%)",
                    boxShadow:
                      "0 0 12px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.65)",
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-medium text-[var(--subtext)] opacity-85">
                <span>
                  {selectedPartnerId === "keepers_core"
                    ? t(
                      "supporter_server_goal_title",
                      "Monthly Hub & Code-Signing Goal"
                    )
                    : t(
                      "supporter_spoke_server_goal_title",
                      "Monthly Community Server Goal"
                    )}
                </span>
                <span className="font-mono font-bold text-[9px] uppercase tracking-wider">
                  {`$5 = +${activeGoal.fiveDollarStepPercent}% & +30d`}
                </span>
              </div>
            </div>
          )}

          {hasConfiguredUrl ? (
            <ActionButton
              variant="glass"
              icon={t("icon_open_in_new", "open_in_new")}
              label={
                selectedPartnerId === "keepers_core"
                  ? `${t("supporter_keepers_btn", "Support Sanctuary Foundry")} (${selectedPartner.payment_processor})`
                  : `${t("supporter_btn_donate_partner", "Support Community")} (${selectedPartner.payment_processor})`
              }
              disabled={isSyncing}
              onClick={handleCheckout}
              className="w-full"
            />
          ) : (
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] flex flex-col gap-1.5">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
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
                  "This community's Wayfinders haven't linked a payment processor in Wayfinder Operations yet. You can support Sanctuary Foundry above to unlock Global Dev Builds in the meantime."
                )}
              </p>
            </div>
          )}
        </SidePanelHeroCard>

        {/* SUB-TAB NAVIGATION (COST REPORT VS DEV BUILD PERKS) */}
        <div className="grid grid-cols-2 gap-3 w-full">
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
            icon={t("icon_workspace_premium", "workspace_premium")}
            label={t("report_tab_dev_perks", "Dev Build Perks")}
            isActive={activeSubTab === "perks"}
            onClick={() => setActiveSubTab("perks")}
          />
        </div>

        {activeSubTab === "report" ? (
          <TransparentCostReportBlock goal={activeGoal} />
        ) : (
          <UniversalGroup
            title={t(
              "supporter_dev_builds_channel_toggle",
              "Dev Build Channel"
            )}
            icon={t("icon_rocket_launch", "rocket_launch")}
          >
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label={t(
                  "supporter_stat_time_remaining",
                  "Active Time Remaining"
                )}
                value={
                  isDevBuildUnlocked
                    ? `${remainingDays} ${t("supporter_celebration_days_unit", "Days")}`
                    : t("supporter_no_active_time", "No Active Time")
                }
                icon={t("icon_schedule", "schedule")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t(
                  "supporter_stat_rollover_credit",
                  "Next Month Rollover"
                )}
                value={`$${creditDollars} / $5.00`}
                icon={t("icon_savings", "savings")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>

            <div className="glass-surface px-4 py-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-[var(--text)] truncate">
                    {isDevBuildUnlocked
                      ? `${remainingDays} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                      : t("supporter_no_active_time", "No Active Time")}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg border bg-transparent ${isPatron
                        ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                        : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                      } text-[8px] font-black uppercase tracking-wider inline-flex items-center gap-1 shrink-0`}
                  >
                    <span className="material-symbols-outlined !text-[10px]">
                      {t("icon_workspace_premium", "workspace_premium")}
                    </span>
                    <span>
                      {isPatron
                        ? t(
                          "supporter_patron_badge_label",
                          "Foundry Supporter"
                        )
                        : t(
                          "supporter_patron_locked_chip",
                          "Supporter Badge"
                        )}
                    </span>
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                  {supporterState.dev_build.total_months_unlocked || 0}{" "}
                  {t("supporter_months_suffix", "Months")} • ${creditDollars} /
                  $5.00{" "}
                  {t("supporter_stat_rollover_credit", "Next Month Rollover")}
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
                className={`flex flex-col items-end gap-1 shrink-0 ${isDevBuildUnlocked
                    ? "cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                  }`}
              >
                <SettingsToggle
                  checked={
                    isDevBuildUnlocked &&
                    supporterState.dev_build.channel_enabled
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
        )}

        {onNavigateSettings && (
          <ActionButton
            variant="glass"
            icon={t("icon_settings", "settings")}
            label={t(
              "supporter_spoke_open_settings_btn",
              "Open Support & Perks"
            )}
            onClick={onNavigateSettings}
            className="w-full"
          />
        )}
      </div>
    </SidePanel>
  );
}
