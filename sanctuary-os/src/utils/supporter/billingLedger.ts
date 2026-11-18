import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../envUtils";
import { supabaseAuth, supabase } from "../../supabase";
import { useStore } from "../../store";
import { fnv1aHashHex } from "../../lib/cryptoUtils";
import { lastCloudSupporterPullByUser, NONCE_STORAGE_KEY, estimateStripeFeeCents, formatCycleMonthLabel, hasDevBuildAccessClearance, MONTHLY_SERVER_POOL_STORAGE_KEY, getCurrentMonthKey, formatCentsToUsdString, readFallbackVault, writeFallbackVault, getLocalPartnerDonationOverride, type KeepersPipelineConfig, type SpokeCostBreakdown, type TransparentCostReportLineItem, type TransparentGoalStatus, type LocalMasonSupporter, type LocalSpokeSupporter, type LocalDevBuildStatus, type LocalSupporterStatePayload } from "./typesAndHelpers";
import { syncSupporterVaultWithCloud, getSupporterState } from "./vaultSync";

export async function syncLocalMasonSupporterBridge(params: {
  masonId: string;
  masonName: string;
  provider: string;
  tokenOrKey: string;
  patreonCampaignId?: string;
  tierName?: string;
}): Promise<LocalMasonSupporter> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    const record = await invoke<LocalMasonSupporter>(
      "sync_mason_supporter_bridge",
      {
        vaultPath,
        masonId: params.masonId || params.masonName,
        masonName: params.masonName || params.masonId,
        provider: params.provider || "patreon",
        tokenOrKey: params.tokenOrKey,
        patreonCampaignId: params.patreonCampaignId || "",
        tierName: params.tierName || "",
      },
    );
    const fallback = readFallbackVault(userId);
    fallback.removed_supporters = fallback.removed_supporters || {};
    delete fallback.removed_supporters[record.mason_id];
    fallback.supporters = [
      record,
      ...fallback.supporters.filter((s) => s.mason_id !== record.mason_id),
    ];
    writeFallbackVault(fallback);
    if (userId && userId !== "local_citizen") {
      lastCloudSupporterPullByUser.delete(userId);
      void syncSupporterVaultWithCloud(fallback, vaultPath, userId, true);
    }
    return record;
  }

  const effectiveId = (params.masonId || params.masonName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const record: LocalMasonSupporter = {
    mason_id: params.masonId || effectiveId,
    mason_name: params.masonName || params.masonId,
    provider: (params.provider || "patreon").toLowerCase(),
    tier_name: params.tierName?.trim() || "Verified Supporter",
    pledge_cents: 500,
    patreon_campaign_id: params.patreonCampaignId || "",
    cryptographic_pass: `sp_${btoa(`${effectiveId}:${now}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`,
    expedited_support: true,
    early_access: true,
    verified_at: now,
    expires_at: now + 30 * 86400,
  };

  const fallback = readFallbackVault(userId);
  fallback.removed_supporters = fallback.removed_supporters || {};
  delete fallback.removed_supporters[record.mason_id];
  fallback.supporters = [
    record,
    ...fallback.supporters.filter((s) => s.mason_id !== record.mason_id),
  ];
  writeFallbackVault(fallback);
  if (userId && userId !== "local_citizen") {
    lastCloudSupporterPullByUser.delete(userId);
    void syncSupporterVaultWithCloud(fallback, vaultPath, userId, true);
  }
  return record;
}


export async function stackGlobalDevBuildDonation(params: {
  amountUsd: number;
  txNonce: string;
  targetId?: string;
  spokeName?: string;
  provider?: string;
}): Promise<{
  devBuild: LocalDevBuildStatus;
  monthsAdded: number;
}> {
  const amountCents = Math.round(Number(params.amountUsd || 0) * 100);
  if (amountCents <= 0) {
    throw new Error("Donation amount must be greater than $0.00.");
  }

  const cleanNonce = (params.txNonce || "").trim();
  if (!cleanNonce) {
    throw new Error("Processor transaction / receipt ID is required.");
  }

  // Local anti-replay check
  const redeemedRaw = localStorage.getItem(NONCE_STORAGE_KEY);
  const redeemed: string[] = redeemedRaw ? JSON.parse(redeemedRaw) : [];
  if (redeemed.includes(cleanNonce)) {
    throw new Error("This receipt ID has already been redeemed and stacked.");
  }

  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);
  const currentState = await getSupporterState(vaultPath, userId);

  // 1. Strictly verify donation event via Hub User Database RPC — NEVER fail open or locally mint clearance!
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (localOnly || !navigator.onLine || !userId || userId === "local_citizen") {
    throw new Error(
      "Online authentication is required to verify and stack Dev Build supporter access."
    );
  }

  const client = supabaseAuth || supabase;
  const existingUntilIso =
    (currentState.dev_build.dev_build_until || 0) > now
      ? new Date(currentState.dev_build.dev_build_until * 1000).toISOString()
      : null;

  const { data: rpcData, error: rpcErr } = await client.rpc(
    "register_partner_donation_event",
    {
      p_user_id: userId,
      p_amount_cents: amountCents,
      p_tx_nonce: cleanNonce,
      p_base_until: existingUntilIso,
    },
  );

  if (rpcErr || !rpcData || !rpcData.dev_build_until) {
    throw new Error(
      rpcErr?.message || "Server verification of supporter donation failed."
    );
  }

  const finalUntil = Math.floor(new Date(rpcData.dev_build_until).getTime() / 1000);
  if (!Number.isFinite(finalUntil) || finalUntil <= 0) {
    throw new Error("Server returned an invalid Dev Build expiration timestamp.");
  }
  const finalCredit =
    typeof rpcData.donation_credit_cents === "number"
      ? rpcData.donation_credit_cents
      : 0;
  const finalTotalMonths =
    typeof rpcData.total_months_unlocked === "number"
      ? rpcData.total_months_unlocked
      : currentState.dev_build.total_months_unlocked || 0;
  const finalMonthsAdded =
    typeof rpcData.months_added === "number" ? rpcData.months_added : 0;

  // 2. Cache server-verified state in local SQLite + fallback storage
  let updatedDevBuild: LocalDevBuildStatus = {
    user_id: userId,
    dev_build_until: finalUntil,
    donation_credit_cents: finalCredit,
    total_months_unlocked: finalTotalMonths,
    channel_enabled:
      finalUntil > now ? true : currentState.dev_build.channel_enabled,
    updated_at: now,
  };

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    try {
      updatedDevBuild = await invoke<LocalDevBuildStatus>(
        "stack_local_dev_build_donation",
        {
          vaultPath,
          userId,
          amountCents: 0,
          channelEnabled:
            finalUntil > now ? true : currentState.dev_build.channel_enabled,
          overrideUntil: finalUntil,
          overrideCreditCents: finalCredit,
          overrideTotalMonths: finalTotalMonths,
        },
      );
    } catch (e) {
      console.warn("SQLite stack_local_dev_build_donation cache sync warning:", e);
    }
  }

  currentState.dev_build = updatedDevBuild;
  writeFallbackVault(currentState);

  redeemed.push(cleanNonce);
  localStorage.setItem(NONCE_STORAGE_KEY, JSON.stringify(redeemed));
  if (updatedDevBuild.channel_enabled) {
    localStorage.setItem("sanctuary_dev_build_channel", "true");
  }
  recordMonthlyServerGoalContribution(
    amountCents,
    params.targetId || "keepers_core",
    cleanNonce,
  );

  let returnState = currentState;
  const cleanTargetId = String(params.targetId || "keepers_core").trim().toLowerCase();
  if (cleanTargetId && cleanTargetId !== "keepers_core") {
    returnState = await recordLocalSpokeSupporterPass({
      spokeId: cleanTargetId,
      spokeName: params.spokeName || params.targetId,
      provider: params.provider || "partner_donation",
      pledgeCents: amountCents,
      monthsAdded: finalMonthsAdded || Math.max(1, Math.floor(amountCents / 500)),
      expiresAt: finalUntil,
      txNonce: cleanNonce,
    });
    returnState.dev_build = updatedDevBuild;
    writeFallbackVault(returnState);
  }

  return {
    devBuild: updatedDevBuild,
    monthsAdded: finalMonthsAdded,
  };
}


export function recordMonthlyServerGoalContribution(
  amountCents: number,
  targetId = "keepers_core",
  txNonce?: string,
): void {
  if (!amountCents || amountCents <= 0) return;
  const monthKey = getCurrentMonthKey();
  const normTarget =
    String(targetId || "keepers_core")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "keepers_core";
  const txFeeCents = estimateStripeFeeCents(amountCents);

  try {
    const raw = localStorage.getItem(MONTHLY_SERVER_POOL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const isSameMonth = parsed && parsed.monthKey === monthKey;
    const prevTargets: Record<string, number> =
      isSameMonth && parsed.targets && typeof parsed.targets === "object"
        ? { ...parsed.targets }
        : {};
    const prevTargetFees: Record<string, number> =
      isSameMonth && parsed.targetFees && typeof parsed.targetFees === "object"
        ? { ...parsed.targetFees }
        : {};
    if (
      isSameMonth &&
      typeof parsed.addedCents === "number" &&
      prevTargets.keepers_core === undefined
    ) {
      prevTargets.keepers_core = Number(parsed.addedCents || 0);
    }
    prevTargets[normTarget] =
      Math.max(0, Number(prevTargets[normTarget] || 0)) + amountCents;
    prevTargetFees[normTarget] =
      Math.max(0, Number(prevTargetFees[normTarget] || 0)) + txFeeCents;
    localStorage.setItem(
      MONTHLY_SERVER_POOL_STORAGE_KEY,
      JSON.stringify({
        monthKey,
        addedCents: prevTargets.keepers_core || 0,
        targets: prevTargets,
        targetFees: prevTargetFees,
      }),
    );
  } catch {
    // ignore storage errors
  }

  // Also sync to cloud MonthlyDonationLedger (deduplicated by txNonce) so all clients see the automated monthly total
  const localOnly =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && typeof navigator !== "undefined" && navigator.onLine) {
    (async () => {
      try {
        const client = supabaseAuth || supabase;
        const ledgerTitle = `LEDGER_${monthKey}_${normTarget.toUpperCase()}`;
        const rawNonceKey = txNonce || `client_${Date.now()}`;
        const nonceKey = `tx_${fnv1aHashHex(rawNonceKey)}`;
        const { data: existingLedger } = await client
          .from("keeper_system_broadcasts")
          .select("id, description, message")
          .eq("category", "MonthlyDonationLedger")
          .eq("title", ledgerTitle)
          .limit(1)
          .maybeSingle();

        let prevCents = 0;
        let prevFeeCents = 0;
        let nonces: string[] = [];
        if (existingLedger) {
          try {
            const p = JSON.parse(
              existingLedger.description || existingLedger.message || "{}",
            );
            if (p.month_key === monthKey) {
              prevCents = Math.max(0, Number(p.covered_cents || 0));
              prevFeeCents = Math.max(0, Number(p.stripe_fees_cents || 0));
              if (Array.isArray(p.tx_nonces)) nonces = p.tx_nonces;
            }
          } catch {
            // ignore
          }
        }
        if (!nonces.includes(nonceKey)) {
          const nextCents = prevCents + amountCents;
          const nextFeeCents = prevFeeCents + txFeeCents;
          const payloadStr = JSON.stringify({
            month_key: monthKey,
            target_id: normTarget,
            covered_cents: nextCents,
            stripe_fees_cents: nextFeeCents,
            net_received_cents: Math.max(0, nextCents - nextFeeCents),
            updated_at: new Date().toISOString(),
          });
          if (existingLedger?.id) {
            await client
              .from("keeper_system_broadcasts")
              .update({
                description: payloadStr,
                message: payloadStr,
                target_audience: "Internal_Pipeline",
                is_active: true,
              })
              .eq("id", existingLedger.id);
          } else {
            await client.from("keeper_system_broadcasts").insert([
              {
                title: ledgerTitle,
                category: "MonthlyDonationLedger",
                description: payloadStr,
                message: payloadStr,
                target_audience: "Internal_Pipeline",
                is_active: true,
                is_pinned: false,
              },
            ]);
          }
        }
      } catch {
        // non-fatal
      }
    })();
  }
}

export async function syncMonthlyDonationLedgersFromCloud(): Promise<void> {
  if (
    typeof localStorage === "undefined" ||
    localStorage.getItem("sanctuary_local_only") === "true" ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return;
  }
  try {
    const monthKey = getCurrentMonthKey();
    const client = supabaseAuth || supabase;
    let summaryList: Array<{
      month_key?: string;
      target_id?: string;
      covered_cents?: number;
      stripe_fees_cents?: number;
    }> = [];

    const { data: rpcRows, error: rpcErr } = await client.rpc(
      "get_monthly_donation_summaries",
      { p_month_key: monthKey },
    );

    if (!rpcErr && Array.isArray(rpcRows)) {
      summaryList = rpcRows;
    } else {
      const { data: rows } = await client
        .from("keeper_system_broadcasts")
        .select("title, description, message")
        .eq("category", "MonthlyDonationLedger")
        .ilike("title", `LEDGER_${monthKey}_%`)
        .eq("is_active", true);
      if (Array.isArray(rows)) {
        for (const r of rows) {
          try {
            const p = JSON.parse(r.description || r.message || "{}");
            if (p && typeof p === "object") summaryList.push(p);
          } catch {
            // ignore
          }
        }
      }
    }
    if (summaryList.length === 0) return;

    const raw = localStorage.getItem(MONTHLY_SERVER_POOL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const isSameMonth = parsed && parsed.monthKey === monthKey;
    const targets: Record<string, number> =
      isSameMonth && parsed.targets && typeof parsed.targets === "object"
        ? { ...parsed.targets }
        : {};
    const targetFees: Record<string, number> =
      isSameMonth && parsed.targetFees && typeof parsed.targetFees === "object"
        ? { ...parsed.targetFees }
        : {};

    for (const p of summaryList) {
      if ((p.month_key || monthKey) === monthKey && p.target_id) {
        const tKey = String(p.target_id).toLowerCase();
        const cloudCents = Math.max(0, Number(p.covered_cents || 0));
        const cloudFeeCents = Math.max(0, Number(p.stripe_fees_cents || 0));
        targets[tKey] = Math.max(Number(targets[tKey] || 0), cloudCents);
        targetFees[tKey] = Math.max(
          Number(targetFees[tKey] || 0),
          cloudFeeCents,
        );
      }
    }

    localStorage.setItem(
      MONTHLY_SERVER_POOL_STORAGE_KEY,
      JSON.stringify({
        monthKey,
        addedCents: targets.keepers_core || 0,
        targets,
        targetFees,
      }),
    );
  } catch {
    // ignore
  }
}


export function getLocalAddedCentsForTarget(targetId: string): number {
  try {
    const monthKey = getCurrentMonthKey();
    const normTarget = String(targetId || "keepers_core").trim().toLowerCase();
    const raw = localStorage.getItem(MONTHLY_SERVER_POOL_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.monthKey !== monthKey) return 0;
    if (parsed.targets && typeof parsed.targets === "object") {
      if (parsed.targets[normTarget] !== undefined) {
        return Math.max(0, Number(parsed.targets[normTarget] || 0));
      }
    }
    if (normTarget === "keepers_core") {
      return Math.max(0, Number(parsed.addedCents || 0));
    }
  } catch {
    // ignore
  }
  return 0;
}

export function getLocalAddedFeeCentsForTarget(targetId: string): number {
  try {
    const monthKey = getCurrentMonthKey();
    const normTarget = String(targetId || "keepers_core").trim().toLowerCase();
    const raw = localStorage.getItem(MONTHLY_SERVER_POOL_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.monthKey !== monthKey) return 0;
    if (parsed.targetFees && typeof parsed.targetFees === "object") {
      if (parsed.targetFees[normTarget] !== undefined) {
        return Math.max(0, Number(parsed.targetFees[normTarget] || 0));
      }
    }
  } catch {
    // ignore
  }
  return 0;
}


export function getMonthlyServerGoalStatus(
  config?: KeepersPipelineConfig | null,
): TransparentGoalStatus {
  const currentMonthKey = getCurrentMonthKey();
  const fb = config?.foundry_cost_breakdown;
  const domainAnnual =
    fb?.domain_annual_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.domain_annual_cents) || 0))
      : 2400;
  const supabaseMonthly =
    fb?.supabase_monthly_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.supabase_monthly_cents) || 0))
      : 2500;
  const windowsAnnual =
    fb?.windows_signing_annual_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.windows_signing_annual_cents) || 0))
      : 12000;
  const appleAnnual =
    fb?.apple_dev_annual_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.apple_dev_annual_cents) || 0))
      : 9900;

  const hasSubInfra =
    fb?.infra_hosting_cents !== undefined ||
    fb?.infra_email_cents !== undefined ||
    fb?.infra_release_storage_cents !== undefined ||
    fb?.infra_monitoring_cents !== undefined;
  const rawInfraTotal =
    fb?.infra_other_monthly_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.infra_other_monthly_cents) || 0))
      : 500;
  const infraHosting =
    fb?.infra_hosting_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.infra_hosting_cents) || 0))
      : Math.round(rawInfraTotal * 0.3);
  const infraEmail =
    fb?.infra_email_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.infra_email_cents) || 0))
      : Math.round(rawInfraTotal * 0.3);
  const infraStorage =
    fb?.infra_release_storage_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.infra_release_storage_cents) || 0))
      : Math.round(rawInfraTotal * 0.2);
  const infraMonitoring =
    fb?.infra_monitoring_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.infra_monitoring_cents) || 0))
      : Math.max(0, rawInfraTotal - infraHosting - infraEmail - infraStorage);

  const infraOtherMonthly = hasSubInfra
    ? infraHosting + infraEmail + infraStorage + infraMonitoring
    : rawInfraTotal;

  const domainMonthly = Math.round(domainAnnual / 12);
  const windowsMonthly = Math.round(windowsAnnual / 12);
  const appleMonthly = Math.round(appleAnnual / 12);
  const computedOperatingCost =
    domainMonthly +
    supabaseMonthly +
    windowsMonthly +
    appleMonthly +
    infraOtherMonthly;

  const rawGoal = fb
    ? computedOperatingCost
    : config?.monthly_server_goal_cents !== undefined
      ? Number(config.monthly_server_goal_cents)
      : computedOperatingCost;
  const enabled = rawGoal > 0;
  const totalOperatingCostCents = enabled ? Math.max(100, rawGoal) : 0;

  const localAddedGross = getLocalAddedCentsForTarget("keepers_core");
  const localAddedFees = getLocalAddedFeeCentsForTarget("keepers_core");
  const savedMonthKey = fb?.saved_month_key || currentMonthKey;
  const isNewCycleRollover = Boolean(
    fb?.saved_month_key && fb.saved_month_key !== currentMonthKey,
  );

  const savedBaseGross =
    fb?.gross_contributions_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.gross_contributions_cents) || 0))
      : Math.max(0, Math.round(Number(config?.monthly_server_covered_cents ?? 0)));
  const savedBaseFees =
    fb?.stripe_fees_cents !== undefined
      ? Math.max(0, Math.round(Number(fb.stripe_fees_cents) || 0))
      : 0;
  const savedCarryover = Math.round(Number(fb?.carryover_cents ?? 0) || 0);

  let grossContributionsCents = 0;
  let stripeFeesCents = 0;
  let priorCarryoverCents = savedCarryover;

  if (isNewCycleRollover) {
    // Automatically roll forward the previous cycle's ending balance into the new month's carryover
    const prevNet = Math.max(0, savedBaseGross - savedBaseFees);
    priorCarryoverCents = savedCarryover + prevNet - totalOperatingCostCents;
    grossContributionsCents = localAddedGross;
    stripeFeesCents = localAddedFees;
  } else {
    // Only add automated ledger amounts that arrived AFTER the admin's last save in this month
    const baselineGross =
      fb?.baseline_gross_at_save_cents !== undefined
        ? Math.max(0, Math.round(Number(fb.baseline_gross_at_save_cents) || 0))
        : fb?.gross_contributions_cents !== undefined
          ? localAddedGross
          : 0;
    const baselineFees =
      fb?.baseline_fees_at_save_cents !== undefined
        ? Math.max(0, Math.round(Number(fb.baseline_fees_at_save_cents) || 0))
        : fb?.stripe_fees_cents !== undefined
          ? localAddedFees
          : 0;
    const deltaGross = Math.max(0, localAddedGross - baselineGross);
    const deltaFees = Math.max(0, localAddedFees - baselineFees);
    grossContributionsCents = Math.max(0, savedBaseGross + deltaGross);
    stripeFeesCents = Math.max(0, savedBaseFees + deltaFees);
  }

  const netReceivedCents = Math.max(
    0,
    grossContributionsCents - stripeFeesCents,
  );
  const positiveCarryoverCents = Math.max(0, priorCarryoverCents);
  // Public progress bar uses net received + positive carryover (not gross contributions)
  const fundedThisCycleCents = netReceivedCents + positiveCarryoverCents;
  const carryoverAfterCycleCents =
    priorCarryoverCents + netReceivedCents - totalOperatingCostCents;
  const remainingThisCycleCents = Math.max(
    0,
    totalOperatingCostCents - fundedThisCycleCents,
  );

  const goalCents = totalOperatingCostCents;
  const coveredCents = fundedThisCycleCents;
  const goalDollars = Math.round(goalCents / 100);
  const coveredDollars = Math.round(coveredCents / 100);
  const goalFormatted = formatCentsToUsdString(goalCents);
  const coveredFormatted = formatCentsToUsdString(coveredCents);
  const percent =
    goalCents > 0
      ? Math.min(100, Math.round((coveredCents / goalCents) * 100))
      : 0;
  const fiveDollarStepPercent =
    goalCents > 0 ? Math.max(1, Math.round((500 / goalCents) * 100)) : 0;

  const lineItems: TransparentCostReportLineItem[] = [
    {
      id: "domain",
      cadence: "annual",
      annualCents: domainAnnual,
      monthlyCents: domainMonthly,
    },
    {
      id: "supabase_hub",
      cadence: "monthly",
      monthlyCents: supabaseMonthly,
    },
    {
      id: "windows_signing",
      cadence: "annual",
      annualCents: windowsAnnual,
      monthlyCents: windowsMonthly,
    },
    {
      id: "apple_dev",
      cadence: "annual",
      annualCents: appleAnnual,
      monthlyCents: appleMonthly,
    },
    {
      id: "infra_other",
      cadence: "monthly",
      monthlyCents: infraOtherMonthly,
      subItems: [
        { id: "infra_sub_hosting", monthlyCents: infraHosting },
        { id: "infra_sub_email", monthlyCents: infraEmail },
        { id: "infra_sub_storage", monthlyCents: infraStorage },
        { id: "infra_sub_monitoring", monthlyCents: infraMonitoring },
      ],
    },
  ];

  const billingPeriodLabel = formatCycleMonthLabel(currentMonthKey);
  const updatedLabel = formatCycleMonthLabel(
    config?.updated_at || currentMonthKey,
  );

  return {
    enabled,
    isFoundry: true,
    goalCents,
    coveredCents,
    goalDollars,
    coveredDollars,
    goalFormatted,
    coveredFormatted,
    percent,
    fiveDollarStepPercent,
    lineItems,
    grossContributionsCents,
    stripeFeesCents,
    netReceivedCents,
    positiveCarryoverCents,
    totalOperatingCostCents,
    fundedThisCycleCents,
    priorCarryoverCents,
    carryoverAfterCycleCents,
    remainingThisCycleCents,
    billingPeriodLabel,
    updatedLabel,
    foundryBreakdown: {
      domain_annual_cents: domainAnnual,
      supabase_monthly_cents: supabaseMonthly,
      windows_signing_annual_cents: windowsAnnual,
      apple_dev_annual_cents: appleAnnual,
      infra_other_monthly_cents: infraOtherMonthly,
      infra_hosting_cents: infraHosting,
      infra_email_cents: infraEmail,
      infra_release_storage_cents: infraStorage,
      infra_monitoring_cents: infraMonitoring,
      gross_contributions_cents: grossContributionsCents,
      stripe_fees_cents: stripeFeesCents,
      carryover_cents: priorCarryoverCents,
      saved_month_key: savedMonthKey,
      baseline_gross_at_save_cents: localAddedGross,
      baseline_fees_at_save_cents: localAddedFees,
    },
  };
}

export function getSpokeServerGoalStatus(
  partner?: {
    id?: string;
    schema_id?: string;
    monthly_goal_cents?: number;
    monthly_covered_cents?: number;
    spoke_cost_breakdown?: SpokeCostBreakdown;
    updated_at?: string;
  } | null,
): TransparentGoalStatus {
  const currentMonthKey = getCurrentMonthKey();
  const localOverride =
    getLocalPartnerDonationOverride(partner?.schema_id) ||
    getLocalPartnerDonationOverride(partner?.id);
  const sb = partner?.spoke_cost_breakdown || localOverride?.spoke_cost_breakdown;

  const rawLegacyGoal =
    partner?.monthly_goal_cents !== undefined
      ? Number(partner.monthly_goal_cents)
      : localOverride?.monthly_goal_cents !== undefined
        ? Number(localOverride.monthly_goal_cents)
        : 2500;

  const authActivity =
    sb?.auth_activity_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.auth_activity_cents) || 0))
      : 200;
  const realtime =
    sb?.realtime_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.realtime_cents) || 0))
      : 200;
  const edgeFunctions =
    sb?.edge_functions_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.edge_functions_cents) || 0))
      : 200;
  const storageEgress =
    sb?.storage_egress_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.storage_egress_cents) || 0))
      : 200;
  const backupsLogs =
    sb?.backups_logs_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.backups_logs_cents) || 0))
      : 200;
  const dbComputeStorage =
    sb?.db_compute_storage_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.db_compute_storage_cents) || 0))
      : Math.max(0, rawLegacyGoal - 1000);

  const computedOperatingCost =
    dbComputeStorage +
    authActivity +
    realtime +
    edgeFunctions +
    storageEgress +
    backupsLogs;

  const rawGoal = sb ? computedOperatingCost : rawLegacyGoal;
  const enabled = rawGoal > 0;
  const totalOperatingCostCents = enabled ? Math.max(100, rawGoal) : 0;

  const baseCoveredCents =
    partner?.monthly_covered_cents !== undefined
      ? Number(partner.monthly_covered_cents)
      : localOverride?.monthly_covered_cents !== undefined
        ? Number(localOverride.monthly_covered_cents)
        : 0;
  const addedSchema = partner?.schema_id
    ? getLocalAddedCentsForTarget(partner.schema_id)
    : 0;
  const addedId =
    partner?.id &&
    String(partner.id).toLowerCase() !==
      String(partner?.schema_id || "").toLowerCase()
      ? getLocalAddedCentsForTarget(partner.id)
      : 0;
  const localAddedGross = addedSchema + addedId;

  const feeSchema = partner?.schema_id
    ? getLocalAddedFeeCentsForTarget(partner.schema_id)
    : 0;
  const feeId =
    partner?.id &&
    String(partner.id).toLowerCase() !==
      String(partner?.schema_id || "").toLowerCase()
      ? getLocalAddedFeeCentsForTarget(partner.id)
      : 0;
  const localAddedFees = feeSchema + feeId;

  const savedMonthKey = sb?.saved_month_key || currentMonthKey;
  const isNewCycleRollover = Boolean(
    sb?.saved_month_key && sb.saved_month_key !== currentMonthKey,
  );

  const savedBaseGross =
    sb?.gross_contributions_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.gross_contributions_cents) || 0))
      : Math.max(0, Math.round(baseCoveredCents));
  const savedBaseFees =
    sb?.stripe_fees_cents !== undefined
      ? Math.max(0, Math.round(Number(sb.stripe_fees_cents) || 0))
      : 0;
  const savedCarryover = Math.round(Number(sb?.carryover_cents ?? 0) || 0);

  let grossContributionsCents = 0;
  let stripeFeesCents = 0;
  let priorCarryoverCents = savedCarryover;

  if (isNewCycleRollover) {
    const prevNet = Math.max(0, savedBaseGross - savedBaseFees);
    priorCarryoverCents = savedCarryover + prevNet - totalOperatingCostCents;
    grossContributionsCents = localAddedGross;
    stripeFeesCents = localAddedFees;
  } else {
    const baselineGross =
      sb?.baseline_gross_at_save_cents !== undefined
        ? Math.max(0, Math.round(Number(sb.baseline_gross_at_save_cents) || 0))
        : sb?.gross_contributions_cents !== undefined
          ? localAddedGross
          : 0;
    const baselineFees =
      sb?.baseline_fees_at_save_cents !== undefined
        ? Math.max(0, Math.round(Number(sb.baseline_fees_at_save_cents) || 0))
        : sb?.stripe_fees_cents !== undefined
          ? localAddedFees
          : 0;
    const deltaGross = Math.max(0, localAddedGross - baselineGross);
    const deltaFees = Math.max(0, localAddedFees - baselineFees);
    grossContributionsCents = Math.max(0, savedBaseGross + deltaGross);
    stripeFeesCents = Math.max(0, savedBaseFees + deltaFees);
  }

  const netReceivedCents = Math.max(
    0,
    grossContributionsCents - stripeFeesCents,
  );
  const positiveCarryoverCents = Math.max(0, priorCarryoverCents);
  // Public progress bar uses net received + positive carryover (not gross contributions)
  const fundedThisCycleCents = netReceivedCents + positiveCarryoverCents;
  const carryoverAfterCycleCents =
    priorCarryoverCents + netReceivedCents - totalOperatingCostCents;
  const remainingThisCycleCents = Math.max(
    0,
    totalOperatingCostCents - fundedThisCycleCents,
  );

  const goalCents = totalOperatingCostCents;
  const coveredCents = fundedThisCycleCents;
  const goalDollars = Math.round(goalCents / 100);
  const coveredDollars = Math.round(coveredCents / 100);
  const goalFormatted = formatCentsToUsdString(goalCents);
  const coveredFormatted = formatCentsToUsdString(coveredCents);
  const percent =
    goalCents > 0
      ? Math.min(100, Math.round((coveredCents / goalCents) * 100))
      : 0;
  const fiveDollarStepPercent =
    goalCents > 0 ? Math.max(1, Math.round((500 / goalCents) * 100)) : 0;

  const lineItems: TransparentCostReportLineItem[] = [
    {
      id: "spoke_db",
      cadence: "supabase_dimension",
      monthlyCents: dbComputeStorage,
    },
    {
      id: "spoke_auth",
      cadence: "supabase_dimension",
      monthlyCents: authActivity,
    },
    {
      id: "spoke_realtime",
      cadence: "supabase_dimension",
      monthlyCents: realtime,
    },
    {
      id: "spoke_edge",
      cadence: "supabase_dimension",
      monthlyCents: edgeFunctions,
    },
    {
      id: "spoke_storage",
      cadence: "supabase_dimension",
      monthlyCents: storageEgress,
    },
    {
      id: "spoke_backups",
      cadence: "supabase_dimension",
      monthlyCents: backupsLogs,
    },
  ];

  const billingPeriodLabel = formatCycleMonthLabel(currentMonthKey);
  const updatedLabel = formatCycleMonthLabel(
    partner?.updated_at || currentMonthKey,
  );

  return {
    enabled,
    isFoundry: false,
    goalCents,
    coveredCents,
    goalDollars,
    coveredDollars,
    goalFormatted,
    coveredFormatted,
    percent,
    fiveDollarStepPercent,
    lineItems,
    grossContributionsCents,
    stripeFeesCents,
    netReceivedCents,
    positiveCarryoverCents,
    totalOperatingCostCents,
    fundedThisCycleCents,
    priorCarryoverCents,
    carryoverAfterCycleCents,
    remainingThisCycleCents,
    billingPeriodLabel,
    updatedLabel,
    spokeBreakdown: {
      db_compute_storage_cents: dbComputeStorage,
      auth_activity_cents: authActivity,
      realtime_cents: realtime,
      edge_functions_cents: edgeFunctions,
      storage_egress_cents: storageEgress,
      backups_logs_cents: backupsLogs,
      gross_contributions_cents: grossContributionsCents,
      stripe_fees_cents: stripeFeesCents,
      carryover_cents: priorCarryoverCents,
      saved_month_key: savedMonthKey,
      baseline_gross_at_save_cents: localAddedGross,
      baseline_fees_at_save_cents: localAddedFees,
    },
  };
}


export async function setDevBuildChannelPreference(
  enabled: boolean,
  userIdOverride?: string | null,
): Promise<LocalDevBuildStatus> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId =
    userIdOverride || useStore.getState().session?.user?.id || "local_citizen";
  const state = await getSupporterState(vaultPath, userId);
  const isUnlocked = hasDevBuildAccessClearance(state.dev_build.dev_build_until);
  const finalEnabled = enabled && isUnlocked;

  state.dev_build.channel_enabled = finalEnabled;
  writeFallbackVault(state);
  try {
    localStorage.setItem(
      "sanctuary_dev_build_channel",
      finalEnabled ? "true" : "false",
    );
    if (typeof document !== "undefined") {
      document.documentElement.dataset.buildChannel = finalEnabled
        ? "dev"
        : "public";
    }
  } catch {
    // ignore storage errors
  }

  // Persist Web & Mobile PWA channel preference to Hub profile if authenticated
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && navigator.onLine && userId && userId !== "local_citizen") {
    try {
      const client = supabaseAuth || supabase;
      await client
        .from("profiles")
        .update({ web_dev_channel_enabled: finalEnabled })
        .eq("id", userId);
    } catch {
      // non-fatal
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sanctuary-supporter-updated"));
    window.dispatchEvent(
      new CustomEvent("sanctuary-build-channel-changed", {
        detail: { channel: finalEnabled ? "dev" : "public" },
      }),
    );
  }

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    try {
      return await invoke<LocalDevBuildStatus>(
        "stack_local_dev_build_donation",
        {
          vaultPath,
          userId,
          amountCents: 0,
          channelEnabled: finalEnabled,
          overrideUntil: state.dev_build.dev_build_until,
          overrideCreditCents: state.dev_build.donation_credit_cents,
          overrideTotalMonths: state.dev_build.total_months_unlocked,
        },
      );
    } catch {
      // fallback
    }
  }

  return state.dev_build;
}


export async function recordLocalSpokeSupporterPass(params: {
  spokeId: string;
  spokeName?: string;
  provider?: string;
  pledgeCents?: number;
  monthsAdded?: number;
  expiresAt?: number;
  txNonce?: string;
}): Promise<LocalSupporterStatePayload> {
  const spokeId = String(params.spokeId || "").trim().toLowerCase();
  if (!spokeId || spokeId === "keepers_core") {
    return getSupporterState();
  }
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);
  const currentState = await getSupporterState(vaultPath, userId);
  const existingList = Array.isArray(currentState.spoke_supporters)
    ? [...currentState.spoke_supporters]
    : [];
  const prevIdx = existingList.findIndex(
    (s) => String(s?.spoke_id || "").trim().toLowerCase() === spokeId
  );
  const prev = prevIdx >= 0 ? existingList[prevIdx] : undefined;
  const computedExpiry =
    params.expiresAt && params.expiresAt > now
      ? params.expiresAt
      : Math.max(now, Number(prev?.expires_at || 0)) +
        Math.max(1, Number(params.monthsAdded || 1)) * 30 * 86400;

  const nextEntry: LocalSpokeSupporter = {
    spoke_id: spokeId,
    spoke_name: String(params.spokeName || prev?.spoke_name || params.spokeId).trim(),
    provider: String(params.provider || prev?.provider || "partner_donation"),
    pledge_cents: Number(params.pledgeCents ?? prev?.pledge_cents ?? 500),
    verified_at: now,
    expires_at: computedExpiry,
    tx_nonce: params.txNonce || prev?.tx_nonce,
  };

  if (prevIdx >= 0) {
    existingList[prevIdx] = nextEntry;
  } else {
    existingList.unshift(nextEntry);
  }

  currentState.spoke_supporters = existingList;
  writeFallbackVault(currentState);
  try {
    return await syncSupporterVaultWithCloud(currentState, vaultPath, userId, true);
  } catch {
    return currentState;
  }
}

