import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./envUtils";
import { supabaseAuth, supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";

export interface LocalMasonFollow {
  mason_id: string;
  mason_name: string;
  avatar_url: string;
  workspace_id: string;
  notify_alerts: boolean;
  followed_at: number;
}

export interface LocalMasonSupporter {
  mason_id: string;
  mason_name: string;
  provider: string;
  tier_name: string;
  pledge_cents: number;
  patreon_campaign_id: string;
  cryptographic_pass: string;
  expedited_support: boolean;
  early_access: boolean;
  verified_at: number;
  expires_at: number;
}

export interface LocalDevBuildStatus {
  user_id: string;
  dev_build_until: number;
  donation_credit_cents: number;
  total_months_unlocked: number;
  channel_enabled: boolean;
  updated_at: number;
}

export interface LocalSupporterStatePayload {
  follows: LocalMasonFollow[];
  supporters: LocalMasonSupporter[];
  dev_build: LocalDevBuildStatus;
  total_months_unlocked?: number;
  is_unlocked?: boolean;
}

const LOCAL_STORAGE_KEY = "sanctuary_local_supporter_vault_v1";
const NONCE_STORAGE_KEY = "sanctuary_redeemed_tx_hashes_v1";

function readFallbackVault(userId: string): LocalSupporterStatePayload {
  const isAuthenticatedUser = Boolean(userId && userId !== "local_citizen");
  const defaultDevBuild: LocalDevBuildStatus = {
    user_id: isAuthenticatedUser ? userId : "local_citizen",
    dev_build_until: 0,
    donation_credit_cents: 0,
    total_months_unlocked: 0,
    channel_enabled: false,
    updated_at: Math.floor(Date.now() / 1000),
  };

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      let resolvedDevBuild = defaultDevBuild;
      if (isAuthenticatedUser) {
        const byUser = parsed.dev_build_by_user?.[userId];
        if (byUser && byUser.user_id === userId) {
          resolvedDevBuild = byUser;
        } else if (
          parsed.dev_build &&
          parsed.dev_build.user_id &&
          parsed.dev_build.user_id === userId
        ) {
          resolvedDevBuild = parsed.dev_build;
        }
      }
      return {
        follows: Array.isArray(parsed.follows) ? parsed.follows : [],
        supporters: Array.isArray(parsed.supporters) ? parsed.supporters : [],
        dev_build: resolvedDevBuild,
      };
    }
  } catch {
    // ignore parse errors
  }
  return {
    follows: [],
    supporters: [],
    dev_build: defaultDevBuild,
  };
}

function writeFallbackVault(state: LocalSupporterStatePayload) {
  try {
    let existingByUser: Record<string, LocalDevBuildStatus> = {};
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.dev_build_by_user === "object") {
        existingByUser = { ...parsed.dev_build_by_user };
      }
    }
    const uid = state?.dev_build?.user_id;
    if (uid && uid !== "local_citizen") {
      existingByUser[uid] = state.dev_build;
    }
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        ...state,
        dev_build:
          uid && uid !== "local_citizen"
            ? state.dev_build
            : {
                user_id: "local_citizen",
                dev_build_until: 0,
                donation_credit_cents: 0,
                total_months_unlocked: 0,
                channel_enabled: false,
                updated_at: Math.floor(Date.now() / 1000),
              },
        dev_build_by_user: existingByUser,
      }),
    );
  } catch {
    // ignore storage errors
  }
}

export async function getSupporterState(
  vaultPath?: string,
  userId?: string,
): Promise<LocalSupporterStatePayload> {
  const effectiveVault = vaultPath || useStore.getState().vaultPath || "";
  const effectiveUser =
    userId || useStore.getState().session?.user?.id || "local_citizen";
  const isAuthenticatedUser = Boolean(
    effectiveUser && effectiveUser !== "local_citizen",
  );

  let state: LocalSupporterStatePayload = readFallbackVault(effectiveUser);

  if (isDesktop() && effectiveVault && effectiveVault !== "web") {
    try {
      const sqliteState = await invoke<LocalSupporterStatePayload>(
        "get_local_supporter_state",
        {
          vaultPath: effectiveVault,
          userId: effectiveUser,
        },
      );
      if (sqliteState) {
        state = {
          ...sqliteState,
          dev_build: isAuthenticatedUser
            ? sqliteState.dev_build
            : {
                user_id: "local_citizen",
                dev_build_until: 0,
                donation_credit_cents: 0,
                total_months_unlocked: 0,
                channel_enabled: false,
                updated_at: Math.floor(Date.now() / 1000),
              },
        };
        writeFallbackVault(state);
      }
    } catch (err) {
      console.warn("SQLite supporter state fallback:", err);
    }
  }

  if (!isAuthenticatedUser) {
    state.dev_build = {
      user_id: "local_citizen",
      dev_build_until: 0,
      donation_credit_cents: 0,
      total_months_unlocked: 0,
      channel_enabled: false,
      updated_at: Math.floor(Date.now() / 1000),
    };
    return state;
  }

  // Sync cumulative Global Dev Build status from Hub profile if authenticated & online
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && navigator.onLine && isAuthenticatedUser) {
    try {
      const client = supabaseAuth || supabase;
      const { data: profile } = await client
        .from("profiles")
        .select(
          "dev_build_until, donation_credit_cents, total_months_unlocked, web_dev_channel_enabled, role",
        )
        .eq("id", effectiveUser)
        .maybeSingle();

      if (profile) {
        const cloudUntilSecs = profile.dev_build_until
          ? Math.floor(new Date(profile.dev_build_until).getTime() / 1000)
          : 0;
        const cloudCredit = Number(profile.donation_credit_cents || 0);
        const cloudMonths = Number(profile.total_months_unlocked || 0);
        const cloudWebChannel =
          typeof (profile as any).web_dev_channel_enabled === "boolean"
            ? Boolean((profile as any).web_dev_channel_enabled)
            : undefined;
        const localChannelPref = localStorage.getItem("sanctuary_dev_build_channel");
        const resolvedChannelEnabled =
          localChannelPref === "true"
            ? true
            : localChannelPref === "false"
              ? false
              : cloudWebChannel !== undefined
                ? cloudWebChannel
                : state.dev_build.channel_enabled;

        if (
          cloudUntilSecs > state.dev_build.dev_build_until ||
          cloudMonths > state.dev_build.total_months_unlocked ||
          cloudCredit !== state.dev_build.donation_credit_cents ||
          resolvedChannelEnabled !== state.dev_build.channel_enabled
        ) {
          state.dev_build = {
            ...state.dev_build,
            user_id: effectiveUser,
            dev_build_until: Math.max(
              state.dev_build.dev_build_until,
              cloudUntilSecs,
            ),
            donation_credit_cents:
              cloudUntilSecs >= state.dev_build.dev_build_until
                ? cloudCredit
                : Math.max(state.dev_build.donation_credit_cents || 0, cloudCredit),
            total_months_unlocked: Math.max(
              state.dev_build.total_months_unlocked,
              cloudMonths,
            ),
            channel_enabled: resolvedChannelEnabled,
            updated_at: Math.floor(Date.now() / 1000),
          };
          writeFallbackVault(state);
          if (isDesktop() && effectiveVault && effectiveVault !== "web") {
            await invoke("stack_local_dev_build_donation", {
              vaultPath: effectiveVault,
              userId: effectiveUser,
              amountCents: 0,
              channelEnabled: state.dev_build.channel_enabled,
              overrideUntil: state.dev_build.dev_build_until,
              overrideCreditCents: state.dev_build.donation_credit_cents,
              overrideTotalMonths: state.dev_build.total_months_unlocked,
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Cloud profile may not have new columns yet; rely on local SQLite state
    }
  }

  return state;
}

export async function toggleLocalFollow(params: {
  masonId: string;
  masonName: string;
  avatarUrl?: string;
  workspaceId?: string;
}): Promise<boolean> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  let isFollowingNow = false;

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    try {
      isFollowingNow = await invoke<boolean>("toggle_local_mason_follow", {
        vaultPath,
        masonId: params.masonId,
        masonName: params.masonName || "",
        avatarUrl: params.avatarUrl || "",
        workspaceId:
          params.workspaceId || useStore.getState().activeWorkspaceId || "",
      });
    } catch (e) {
      console.warn("SQLite toggle_local_mason_follow fallback:", e);
    }
  }

  const fallback = readFallbackVault(userId);
  const existingIdx = fallback.follows.findIndex(
    (f) => f.mason_id === params.masonId,
  );
  if (!isDesktop() || !vaultPath || vaultPath === "web") {
    isFollowingNow = existingIdx === -1;
  }

  if (isFollowingNow) {
    if (existingIdx === -1) {
      fallback.follows.unshift({
        mason_id: params.masonId,
        mason_name: params.masonName || "",
        avatar_url: params.avatarUrl || "",
        workspace_id:
          params.workspaceId || useStore.getState().activeWorkspaceId || "",
        notify_alerts: true,
        followed_at: now,
      });
    }
  } else if (existingIdx !== -1) {
    fallback.follows.splice(existingIdx, 1);
  }
  writeFallbackVault(fallback);

  return isFollowingNow;
}

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
    fallback.supporters = [
      record,
      ...fallback.supporters.filter((s) => s.mason_id !== record.mason_id),
    ];
    writeFallbackVault(fallback);
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
  fallback.supporters = [
    record,
    ...fallback.supporters.filter((s) => s.mason_id !== record.mason_id),
  ];
  writeFallbackVault(fallback);
  return record;
}

export async function removeLocalMasonSupporterBridge(
  masonId: string,
): Promise<void> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    await invoke("remove_local_mason_supporter", {
      vaultPath,
      masonId,
    }).catch(() => {});
  }

  const fallback = readFallbackVault(userId);
  fallback.supporters = fallback.supporters.filter(
    (s) => s.mason_id !== masonId,
  );
  writeFallbackVault(fallback);
}

export async function clearExpiredLocalMasonSupporters(
  expiredMasonIds?: string[],
): Promise<LocalMasonSupporter[]> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  const fallback = readFallbackVault(userId);
  const idsToClear =
    Array.isArray(expiredMasonIds) && expiredMasonIds.length > 0
      ? expiredMasonIds
      : fallback.supporters
          .filter((s) => Boolean(s.expires_at && s.expires_at <= now))
          .map((s) => s.mason_id);

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    await Promise.all(
      idsToClear.map((masonId) =>
        invoke("remove_local_mason_supporter", {
          vaultPath,
          masonId,
        }).catch(() => {}),
      ),
    );
  }

  const idSet = new Set(idsToClear);
  fallback.supporters = fallback.supporters.filter(
    (s) =>
      !idSet.has(s.mason_id) && !(s.expires_at && s.expires_at <= now),
  );
  writeFallbackVault(fallback);
  return fallback.supporters;
}

export async function stackGlobalDevBuildDonation(params: {
  amountUsd: number;
  txNonce: string;
  targetId?: string;
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

  const combinedCents =
    (currentState.dev_build.donation_credit_cents || 0) + amountCents;
  const monthsAdded = Math.floor(combinedCents / 500);
  const remainderCents = combinedCents % 500;
  const baseUntil = Math.max(now, currentState.dev_build.dev_build_until || 0);
  const newUntil =
    monthsAdded > 0
      ? baseUntil + monthsAdded * 30 * 86400
      : currentState.dev_build.dev_build_until || 0;
  const newTotalMonths =
    (currentState.dev_build.total_months_unlocked || 0) + monthsAdded;

  let finalUntil = newUntil;
  let finalCredit = remainderCents;
  let finalTotalMonths = newTotalMonths;
  let finalMonthsAdded = monthsAdded;

  // 1. Try syncing with Hub User Database via RPC or profile update (Zero Partner/Creator Honeypot)
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && navigator.onLine && userId && userId !== "local_citizen") {
    try {
      const client = supabaseAuth || supabase;
      const existingUntilIso =
        (currentState.dev_build.dev_build_until || 0) > now
          ? new Date(
              currentState.dev_build.dev_build_until * 1000,
            ).toISOString()
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
      if (!rpcErr && rpcData) {
        if (rpcData.dev_build_until) {
          finalUntil = Math.max(
            finalUntil,
            Math.floor(new Date(rpcData.dev_build_until).getTime() / 1000),
          );
        }
        if (typeof rpcData.donation_credit_cents === "number") {
          finalCredit = rpcData.donation_credit_cents;
        }
        if (typeof rpcData.total_months_unlocked === "number") {
          finalTotalMonths = Math.max(
            finalTotalMonths,
            rpcData.total_months_unlocked,
          );
        }
        if (typeof rpcData.months_added === "number") {
          finalMonthsAdded = rpcData.months_added;
        }
      }
    } catch {
      // Continue with local SQLite persistence
    }
  }

  // 2. Persist in local SQLite + local storage
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
      console.warn("SQLite stack_local_dev_build_donation fallback:", e);
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

  return {
    devBuild: updatedDevBuild,
    monthsAdded: finalMonthsAdded,
  };
}

const MONTHLY_SERVER_POOL_STORAGE_KEY = "sanctuary_monthly_server_pool_v1";

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatCycleMonthLabel(monthKeyOrIso?: string): string {
  try {
    if (monthKeyOrIso && /^\d{4}-\d{2}$/.test(monthKeyOrIso.trim())) {
      const [y, m] = monthKeyOrIso.trim().split("-").map(Number);
      const d = new Date(Date.UTC(y, (m || 1) - 1, 15));
      return d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }
    const d = monthKeyOrIso ? new Date(monthKeyOrIso) : new Date();
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }
  } catch {
    // ignore
  }
  return getCurrentMonthKey();
}

export function estimateStripeFeeCents(amountCents: number): number {
  if (!amountCents || amountCents <= 0) return 0;
  return Math.round(amountCents * 0.029) + 30;
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
        const nonceKey = txNonce || `client_${Date.now()}`;
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
          const nextNonces = [...nonces.slice(-199), nonceKey];
          const nextCents = prevCents + amountCents;
          const nextFeeCents = prevFeeCents + txFeeCents;
          const payloadStr = JSON.stringify({
            month_key: monthKey,
            target_id: normTarget,
            covered_cents: nextCents,
            stripe_fees_cents: nextFeeCents,
            net_received_cents: Math.max(0, nextCents - nextFeeCents),
            tx_nonces: nextNonces,
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
    const { data: rows } = await client
      .from("keeper_system_broadcasts")
      .select("title, description, message")
      .eq("category", "MonthlyDonationLedger")
      .ilike("title", `LEDGER_${monthKey}_%`)
      .eq("is_active", true);
    if (!Array.isArray(rows) || rows.length === 0) return;

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

    for (const r of rows) {
      try {
        const p = JSON.parse(r.description || r.message || "{}");
        if (p.month_key === monthKey && p.target_id) {
          const tKey = String(p.target_id).toLowerCase();
          const cloudCents = Math.max(0, Number(p.covered_cents || 0));
          const cloudFeeCents = Math.max(0, Number(p.stripe_fees_cents || 0));
          targets[tKey] = Math.max(Number(targets[tKey] || 0), cloudCents);
          targetFees[tKey] = Math.max(
            Number(targetFees[tKey] || 0),
            cloudFeeCents,
          );
        }
      } catch {
        // ignore
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

export function isFoundryPatron(
  supporterState?: LocalSupporterStatePayload | null,
): boolean {
  if (!supporterState?.dev_build) return false;
  return (
    (supporterState.dev_build.total_months_unlocked || 0) > 0 ||
    (supporterState.dev_build.dev_build_until || 0) > 0 ||
    (supporterState.dev_build.donation_credit_cents || 0) > 0
  );
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

export interface FoundryCostBreakdown {
  domain_annual_cents?: number;
  supabase_monthly_cents?: number;
  windows_signing_annual_cents?: number;
  apple_dev_annual_cents?: number;
  infra_other_monthly_cents?: number;
  infra_hosting_cents?: number;
  infra_email_cents?: number;
  infra_release_storage_cents?: number;
  infra_monitoring_cents?: number;
  gross_contributions_cents?: number;
  stripe_fees_cents?: number;
  carryover_cents?: number;
  saved_month_key?: string;
  baseline_gross_at_save_cents?: number;
  baseline_fees_at_save_cents?: number;
}

export interface SpokeCostBreakdown {
  db_compute_storage_cents?: number;
  auth_activity_cents?: number;
  realtime_cents?: number;
  edge_functions_cents?: number;
  storage_egress_cents?: number;
  backups_logs_cents?: number;
  gross_contributions_cents?: number;
  stripe_fees_cents?: number;
  carryover_cents?: number;
  saved_month_key?: string;
  baseline_gross_at_save_cents?: number;
  baseline_fees_at_save_cents?: number;
}

export interface TransparentCostReportSubItem {
  id: string;
  monthlyCents: number;
}

export interface TransparentCostReportLineItem {
  id: string;
  cadence: "annual" | "monthly" | "supabase_dimension";
  annualCents?: number;
  monthlyCents: number;
  subItems?: TransparentCostReportSubItem[];
}

export interface TransparentGoalStatus {
  enabled: boolean;
  isFoundry: boolean;
  goalCents: number;
  coveredCents: number;
  goalDollars: number;
  coveredDollars: number;
  goalFormatted: string;
  coveredFormatted: string;
  percent: number;
  fiveDollarStepPercent: number;
  lineItems: TransparentCostReportLineItem[];
  grossContributionsCents: number;
  stripeFeesCents: number;
  netReceivedCents: number;
  positiveCarryoverCents: number;
  totalOperatingCostCents: number;
  fundedThisCycleCents: number;
  priorCarryoverCents: number;
  carryoverAfterCycleCents: number;
  remainingThisCycleCents: number;
  billingPeriodLabel: string;
  updatedLabel: string;
  foundryBreakdown?: Required<FoundryCostBreakdown>;
  spokeBreakdown?: Required<SpokeCostBreakdown>;
}

function formatCentsToUsdString(cents: number): string {
  const abs = Math.abs(Math.round(Number(cents || 0))) / 100;
  return `${cents < 0 ? "-" : ""}$${abs.toFixed(2)}`;
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

export function hasDevBuildAccessClearance(devBuildUntil?: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  if ((devBuildUntil || 0) > now) return true;
  const storeState = useStore.getState();
  const osRole = String(storeState.osRole || "").toLowerCase();
  const userRole = String(storeState.userRole || "").toLowerCase();
  const staffRoles = ["keeper", "wayfinder", "architect", "admin", "core_dev"];
  return staffRoles.includes(osRole) || staffRoles.includes(userRole);
}

export function isClientOnDevBuildStream(
  supporterState?: LocalSupporterStatePayload | number | null,
): boolean {
  if (typeof localStorage !== "undefined") {
    const lsPref = localStorage.getItem("sanctuary_dev_build_channel");
    if (lsPref === "true") return true;
    if (lsPref === "false") return false;
  }
  if (
    supporterState &&
    typeof supporterState === "object" &&
    supporterState.dev_build?.channel_enabled
  ) {
    return true;
  }
  try {
    const envChannel = String(
      (import.meta as any)?.env?.VITE_BUILD_CHANNEL ||
        (import.meta as any)?.env?.MODE ||
        "",
    ).toLowerCase();
    if (envChannel === "dev" || envChannel === "beta") {
      return true;
    }
  } catch {
    // ignore
  }
  const installedMeta = getInstalledBuildMeta();
  if (installedMeta?.channel === "dev") return true;
  return false;
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

export function findLocalMasonSupporterPass(
  supporters: LocalMasonSupporter[],
  masonId?: string | null,
  masonName?: string | null,
): LocalMasonSupporter | null {
  const now = Math.floor(Date.now() / 1000);
  const normId = (masonId || "").trim().toLowerCase();
  const normName = (masonName || "").trim().toLowerCase();

  return (
    supporters.find((s) => {
      if (s.expires_at && s.expires_at < now) return false;
      const sId = (s.mason_id || "").trim().toLowerCase();
      const sName = (s.mason_name || "").trim().toLowerCase();
      if (normId && (sId === normId || sName === normId)) return true;
      if (normName && (sName === normName || sId === normName)) return true;
      return false;
    }) || null
  );
}

export interface KeepersPipelineConfig {
  keepers_donation_url: string;
  keepers_payment_processor: string;
  support_contact_email?: string;
  support_sender_name?: string;
  support_reply_to_email?: string;
  support_email_provider?: string;
  support_email_api_key?: string;
  support_email_webhook_url?: string;
  web_public_url?: string;
  web_beta_url?: string;
  stable_version: string;
  stable_exe_url?: string;
  stable_msi_url?: string;
  stable_dmg_url?: string;
  stable_linux_url?: string;
  stable_published_at?: string;
  stable_release_notes?: string;
  stable_release_url?: string;
  dev_build_version: string;
  dev_build_endpoint: string;
  dev_build_download_url: string;
  dev_build_dmg_url?: string;
  dev_build_linux_url?: string;
  dev_build_notes: string;
  dev_published_at?: string;
  dev_release_url?: string;
  has_live_dev_release?: boolean;
  monthly_server_goal_cents?: number;
  monthly_server_covered_cents?: number;
  foundry_cost_breakdown?: FoundryCostBreakdown;
  updated_at: string;
}

export interface DispatchKeeperEmailParams {
  toEmail?: string;
  to_email?: string;
  subject: string;
  bodyText?: string;
  body_text?: string;
  ticketId?: string | null;
  ticket_id?: string | null;
  fromEmail?: string;
  from_email?: string;
  fromName?: string;
  from_name?: string;
  replyTo?: string;
  reply_to?: string;
}

export async function dispatchKeeperCustomEmail(
  params: DispatchKeeperEmailParams,
): Promise<{
  ok: boolean;
  status: string;
  provider: string;
  dispatch?: any;
  dispatch_id?: string;
  warning?: string;
  error?: string;
}> {
  const cfg = await getKeepersPipelineConfig(false);
  const resolvedToEmail = (params.toEmail || params.to_email || "").trim();
  const resolvedBodyText = (params.bodyText || params.body_text || "").trim();
  const resolvedTicketId = params.ticketId ?? params.ticket_id ?? null;
  const fromEmail = (
    params.fromEmail ||
    params.from_email ||
    cfg.support_contact_email ||
    "support@sanctuaryos.gg"
  ).trim();
  const fromName = (
    params.fromName ||
    params.from_name ||
    cfg.support_sender_name ||
    "Sanctuary OS Keepers Core"
  ).trim();
  const replyTo = (
    params.replyTo ||
    params.reply_to ||
    cfg.support_reply_to_email ||
    fromEmail
  ).trim();

  const client = supabaseAuth || supabase;
  try {
    const { data, error } = await client.functions.invoke(
      "keeper-email-dispatch",
      {
        body: {
          to_email: resolvedToEmail,
          subject: params.subject.trim(),
          body_text: resolvedBodyText,
          ticket_id: resolvedTicketId,
          from_email: fromEmail,
          from_name: fromName,
          reply_to: replyTo,
          api_key: cfg.support_email_api_key || undefined,
          webhook_url: cfg.support_email_webhook_url || undefined,
        },
      },
    );
    if (!error && data?.ok) {
      return {
        ok: true,
        status: data.status || "DELIVERED",
        provider: data.provider || "KEEPERS_CORE_MAILBOX",
        dispatch: data.dispatch,
        dispatch_id: data.dispatch?.id || data.dispatch_id,
        warning: data.warning,
      };
    }
  } catch {
    // Fallback to direct DB insert if Edge Function invocation fails
  }

  const uid = useStore.getState().session?.user?.id || null;
  const { data: fallbackRow, error: dbErr } = await client
    .from("keeper_email_dispatches")
    .insert({
      ticket_id: resolvedTicketId,
      sender_user_id: uid && uid !== "local_citizen" ? uid : null,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      to_email: resolvedToEmail,
      subject: params.subject.trim(),
      body_text: resolvedBodyText,
      provider: "KEEPERS_CORE_MAILBOX",
      status: "DISPATCHED_IN_APP",
    })
    .select("*")
    .maybeSingle();

  if (dbErr) {
    throw new Error(dbErr.message);
  }

  return {
    ok: true,
    status: "DISPATCHED_IN_APP",
    provider: "KEEPERS_CORE_MAILBOX",
    dispatch: fallbackRow,
    dispatch_id: fallbackRow?.id,
  };
}

const KEEPERS_PIPELINE_STORAGE_KEY = "sanctuary_keepers_pipeline_config_v1";
const LEGACY_DEACTIVATED_STRIPE_URL =
  "https://donate.stripe.com/00w28j4ZP3IU2HCgEl08g00";

export function isMacClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const plat = String(navigator.platform || "");
  const ua = String(navigator.userAgent || "");
  return /Mac|iPod|iPhone|iPad/i.test(plat) || /Macintosh|Mac OS X/i.test(ua);
}

export function isLinuxClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const plat = String(navigator.platform || "");
  const ua = String(navigator.userAgent || "");
  return (/Linux|X11/i.test(plat) || /Linux|SteamOS|Steam Deck/i.test(ua)) && !/Android/i.test(ua);
}

export const DEFAULT_KEEPERS_PIPELINE_CONFIG: KeepersPipelineConfig = {
  keepers_donation_url: "https://donate.stripe.com/bJe8wH95gVfuo2Nv08g03",
  keepers_payment_processor: "STRIPE",
  support_contact_email: "support@sanctuaryos.gg",
  support_sender_name: "Sanctuary OS Keepers Core",
  support_reply_to_email: "support@sanctuaryos.gg",
  support_email_provider: "RESEND",
  stable_version: "0.5.8",
  dev_build_version: "0.5.8-dev.1",
  dev_build_endpoint:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/dev-latest/latest.json",
  dev_build_download_url:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest",
  dev_build_dmg_url:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest",
  dev_build_linux_url:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest",
  dev_build_notes:
    "Dev Build stream for Sanctuary OS Ecosystem Supporters ($5 = +30 Days across any Partner Community or Keepers Core).",
  monthly_server_goal_cents: 5025,
  monthly_server_covered_cents: 0,
  foundry_cost_breakdown: {
    domain_annual_cents: 2400,
    supabase_monthly_cents: 2500,
    windows_signing_annual_cents: 12000,
    apple_dev_annual_cents: 9900,
    infra_other_monthly_cents: 500,
    gross_contributions_cents: 0,
    stripe_fees_cents: 0,
    carryover_cents: 0,
  },
  updated_at: new Date().toISOString(),
};

let githubReleaseCache: {
  fetchedAt: number;
  data: Partial<KeepersPipelineConfig>;
} | null = null;

export async function fetchLiveGitHubReleases(
  forceRefresh = false,
): Promise<Partial<KeepersPipelineConfig>> {
  if (
    !forceRefresh &&
    githubReleaseCache &&
    Date.now() - githubReleaseCache.fetchedAt < 60_000
  ) {
    return githubReleaseCache.data;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return githubReleaseCache?.data || {};
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases?per_page=15",
    );
    if (!res.ok) return githubReleaseCache?.data || {};
    const releases = await res.json();
    if (!Array.isArray(releases)) return {};

    const result: Partial<KeepersPipelineConfig> = {};

    // 1. Latest Stable Release (non-draft, non-prerelease, tag does not contain 'dev')
    const stableRel = releases.find(
      (r: any) =>
        r &&
        !r.draft &&
        !r.prerelease &&
        !String(r.tag_name || "")
          .toLowerCase()
          .includes("dev"),
    );

    if (stableRel) {
      const cleanStableVer = String(stableRel.tag_name || "")
        .replace(/^v/i, "")
        .trim();
      if (cleanStableVer) {
        result.stable_version = cleanStableVer;
      }
      if (stableRel.published_at) {
        result.stable_published_at = stableRel.published_at;
      }
      if (stableRel.body) {
        result.stable_release_notes = stableRel.body;
      }
      if (stableRel.html_url) {
        result.stable_release_url = stableRel.html_url;
      }
      if (Array.isArray(stableRel.assets)) {
        const exeAsset = stableRel.assets.find(
          (a: any) =>
            String(a.name || "").endsWith("-setup.exe") ||
            String(a.name || "").endsWith(".exe"),
        );
        const msiAsset = stableRel.assets.find((a: any) =>
          String(a.name || "").endsWith(".msi"),
        );
        const dmgAsset = stableRel.assets.find(
          (a: any) =>
            String(a.name || "").toLowerCase().endsWith(".dmg") ||
            String(a.name || "").toLowerCase().endsWith(".app.tar.gz"),
        );
        const linuxAsset = stableRel.assets.find(
          (a: any) =>
            String(a.name || "").toLowerCase().endsWith(".appimage") ||
            String(a.name || "").toLowerCase().endsWith(".deb"),
        );
        if (exeAsset?.browser_download_url) {
          result.stable_exe_url = exeAsset.browser_download_url;
        }
        if (msiAsset?.browser_download_url) {
          result.stable_msi_url = msiAsset.browser_download_url;
        }
        if (dmgAsset?.browser_download_url) {
          result.stable_dmg_url = dmgAsset.browser_download_url;
        }
        if (linuxAsset?.browser_download_url) {
          result.stable_linux_url = linuxAsset.browser_download_url;
        }
      }
    }

    // 2. Latest Dev Build Release (tag_name === 'dev-latest', prerelease, or tag contains 'dev')
    const devReleases = releases.filter(
      (r: any) =>
        r &&
        !r.draft &&
        (r.tag_name === "dev-latest" ||
          r.prerelease ||
          String(r.tag_name || "")
            .toLowerCase()
            .includes("dev")),
    );
    const devRel = devReleases[0];

    if (devRel) {
      result.has_live_dev_release = true;
      let detectedDevVer = "";
      if (devRel.tag_name && devRel.tag_name !== "dev-latest") {
        detectedDevVer = String(devRel.tag_name).replace(/^v/i, "").trim();
      }
      if (!detectedDevVer && devRel.name) {
        const match = String(devRel.name).match(/v?(\d+\.\d+\.\d+[^\s)]*)/i);
        if (match && match[1]) {
          detectedDevVer = match[1];
        }
      }
      if (detectedDevVer) {
        result.dev_build_version = detectedDevVer;
      }
      if (devRel.body) {
        result.dev_build_notes = devRel.body;
      }
      if (devRel.published_at) {
        result.dev_published_at = devRel.published_at;
      }
      if (devRel.html_url) {
        result.dev_release_url = devRel.html_url;
        result.dev_build_download_url = devRel.html_url;
      }
      const findExeAsset = (rel: any) => {
        if (!Array.isArray(rel?.assets)) return null;
        return (
          rel.assets.find(
            (a: any) =>
              String(a.name || "").toLowerCase().endsWith("-setup.exe") ||
              String(a.name || "").toLowerCase().endsWith(".exe"),
          ) ||
          rel.assets.find((a: any) =>
            String(a.name || "").toLowerCase().endsWith(".msi"),
          ) ||
          null
        );
      };
      const findDmgAsset = (rel: any) => {
        if (!Array.isArray(rel?.assets)) return null;
        return (
          rel.assets.find(
            (a: any) =>
              String(a.name || "").toLowerCase().endsWith(".dmg") ||
              String(a.name || "").toLowerCase().endsWith(".app.tar.gz"),
          ) || null
        );
      };
      const findLinuxAsset = (rel: any) => {
        if (!Array.isArray(rel?.assets)) return null;
        return (
          rel.assets.find(
            (a: any) =>
              String(a.name || "").toLowerCase().endsWith(".appimage") ||
              String(a.name || "").toLowerCase().endsWith(".deb"),
          ) || null
        );
      };
      const directExe = findExeAsset(devRel);
      if (directExe?.browser_download_url) {
        result.dev_build_download_url = directExe.browser_download_url;
      } else {
        const fallbackDevWithExe = devReleases.find((r: any) =>
          Boolean(findExeAsset(r)?.browser_download_url),
        );
        const fallbackExe = findExeAsset(fallbackDevWithExe);
        if (fallbackExe?.browser_download_url) {
          result.dev_build_download_url = fallbackExe.browser_download_url;
        }
      }
      const directDmg = findDmgAsset(devRel);
      if (directDmg?.browser_download_url) {
        result.dev_build_dmg_url = directDmg.browser_download_url;
      } else {
        const fallbackDevWithDmg = devReleases.find((r: any) =>
          Boolean(findDmgAsset(r)?.browser_download_url),
        );
        const fallbackDmg = findDmgAsset(fallbackDevWithDmg);
        if (fallbackDmg?.browser_download_url) {
          result.dev_build_dmg_url = fallbackDmg.browser_download_url;
        } else if (devRel.html_url) {
          result.dev_build_dmg_url = devRel.html_url;
        }
      }
      const directLinux = findLinuxAsset(devRel);
      if (directLinux?.browser_download_url) {
        result.dev_build_linux_url = directLinux.browser_download_url;
      } else {
        const fallbackDevWithLinux = devReleases.find((r: any) =>
          Boolean(findLinuxAsset(r)?.browser_download_url),
        );
        const fallbackLinux = findLinuxAsset(fallbackDevWithLinux);
        if (fallbackLinux?.browser_download_url) {
          result.dev_build_linux_url = fallbackLinux.browser_download_url;
        } else if (devRel.html_url) {
          result.dev_build_linux_url = devRel.html_url;
        }
      }
    } else {
      result.has_live_dev_release = false;
    }

    githubReleaseCache = {
      fetchedAt: Date.now(),
      data: result,
    };
    return result;
  } catch {
    return githubReleaseCache?.data || {};
  }
}

export async function getKeepersPipelineConfig(
  forceGitHubRefresh = false,
): Promise<KeepersPipelineConfig> {
  let cached: KeepersPipelineConfig = { ...DEFAULT_KEEPERS_PIPELINE_CONFIG };
  try {
    const raw = localStorage.getItem(KEEPERS_PIPELINE_STORAGE_KEY);
    if (raw) {
      const parsedLocal = JSON.parse(raw);
      cached = { ...cached, ...parsedLocal };
      if (
        cached.keepers_donation_url &&
        (cached.keepers_donation_url.trim() === LEGACY_DEACTIVATED_STRIPE_URL ||
          cached.keepers_donation_url.trim().toLowerCase().startsWith("sandbox://"))
      ) {
        cached.keepers_donation_url =
          DEFAULT_KEEPERS_PIPELINE_CONFIG.keepers_donation_url;
      }
      if (
        String(cached.keepers_payment_processor || "").toUpperCase() ===
        "SANDBOX"
      ) {
        cached.keepers_payment_processor = "STRIPE";
      }
    }
  } catch {
    // ignore
  }

  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && navigator.onLine) {
    const [broadcastRes, ghReleases] = await Promise.all([
      (async () => {
        try {
          const client = supabaseAuth || supabase;
          const { data } = await client
            .from("keeper_system_broadcasts")
            .select("*")
            .eq("category", "PipelineConfig")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return data;
        } catch {
          return null;
        }
      })(),
      fetchLiveGitHubReleases(forceGitHubRefresh),
      syncMonthlyDonationLedgersFromCloud(),
    ]);

    if (
      broadcastRes &&
      (broadcastRes.description || broadcastRes.message || broadcastRes.content)
    ) {
      try {
        const parsed = JSON.parse(
          broadcastRes.description || broadcastRes.message || broadcastRes.content,
        );
        if (
          parsed.keepers_donation_url &&
          (String(parsed.keepers_donation_url).trim() ===
            LEGACY_DEACTIVATED_STRIPE_URL ||
            String(parsed.keepers_donation_url)
              .trim()
              .toLowerCase()
              .startsWith("sandbox://"))
        ) {
          parsed.keepers_donation_url =
            DEFAULT_KEEPERS_PIPELINE_CONFIG.keepers_donation_url;
        }
        if (
          String(parsed.keepers_payment_processor || "").toUpperCase() ===
          "SANDBOX"
        ) {
          parsed.keepers_payment_processor = "STRIPE";
        }
        cached = {
          ...cached,
          ...parsed,
          updated_at: broadcastRes.created_at || cached.updated_at,
        };
      } catch {
        // ignore parse error
      }
    } else if (
      isDesktop() &&
      cached.keepers_donation_url &&
      cached.keepers_donation_url !== LEGACY_DEACTIVATED_STRIPE_URL
    ) {
      // Auto-sync Desktop pipeline config to Hub if missing on Supabase
      try {
        const client = supabaseAuth || supabase;
        const payloadStr = JSON.stringify({ ...cached, ...ghReleases });
        await client.from("keeper_system_broadcasts").insert([
          {
            title: `DEV_BUILD_PIPELINE_${cached.dev_build_version}`,
            category: "PipelineConfig",
            description: payloadStr,
            message: payloadStr,
            target_audience: "Internal_Pipeline",
            is_active: true,
            is_pinned: false,
          },
        ]);
      } catch {
        // ignore
      }
    }

    // Live GitHub Releases always take precedence for version numbers, asset URLs, and release notes
    cached = {
      ...cached,
      ...ghReleases,
    };

    try {
      localStorage.setItem(
        KEEPERS_PIPELINE_STORAGE_KEY,
        JSON.stringify(cached),
      );
    } catch {
      // ignore
    }
  }

  return cached;
}

export async function saveKeepersPipelineConfig(
  config: Partial<KeepersPipelineConfig>,
): Promise<KeepersPipelineConfig> {
  const current = await getKeepersPipelineConfig();
  const currentMonthKey = getCurrentMonthKey();
  const stampedFoundryBreakdown: FoundryCostBreakdown | undefined =
    config.foundry_cost_breakdown
      ? {
          ...config.foundry_cost_breakdown,
          saved_month_key: currentMonthKey,
          baseline_gross_at_save_cents:
            getLocalAddedCentsForTarget("keepers_core"),
          baseline_fees_at_save_cents:
            getLocalAddedFeeCentsForTarget("keepers_core"),
        }
      : current.foundry_cost_breakdown;

  const next: KeepersPipelineConfig = {
    ...current,
    ...config,
    foundry_cost_breakdown: stampedFoundryBreakdown,
    updated_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(KEEPERS_PIPELINE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  try {
    const client = supabaseAuth || supabase;
    const payloadStr = JSON.stringify(next);
    const { data: existing } = await client
      .from("keeper_system_broadcasts")
      .select("id")
      .eq("category", "PipelineConfig")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await client
        .from("keeper_system_broadcasts")
        .update({
          title: `DEV_BUILD_PIPELINE_${next.dev_build_version}`,
          description: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: true,
          is_pinned: false,
        })
        .eq("id", existing.id);
    } else {
      await client.from("keeper_system_broadcasts").insert([
        {
          title: `DEV_BUILD_PIPELINE_${next.dev_build_version}`,
          category: "PipelineConfig",
          description: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: true,
          is_pinned: false,
        },
      ]);
    }
  } catch {
    // Saved locally even if cloud table blocks or is offline
  }

  return next;
}

export async function savePartnerCommunityDonationConfig(params: {
  gameId?: string;
  schemaId?: string;
  donationUrl: string;
  paymentProcessor: string;
  monthlyGoalCents?: number;
  monthlyCoveredCents?: number;
  spokeCostBreakdown?: SpokeCostBreakdown;
}): Promise<void> {
  const cleanUrl = (params.donationUrl || "").trim();
  const rawProc = (params.paymentProcessor || "STRIPE").trim().toUpperCase();
  const cleanProcessor = rawProc === "SANDBOX" ? "STRIPE" : rawProc;
  const key = (params.schemaId || params.gameId || "default").toLowerCase();
  const existingLocal = getLocalPartnerDonationOverride(key);
  const currentMonthKey = getCurrentMonthKey();
  const localAddedGross =
    (params.schemaId ? getLocalAddedCentsForTarget(params.schemaId) : 0) +
    (params.gameId &&
    String(params.gameId).toLowerCase() !==
      String(params.schemaId || "").toLowerCase()
      ? getLocalAddedCentsForTarget(params.gameId)
      : 0);
  const localAddedFees =
    (params.schemaId ? getLocalAddedFeeCentsForTarget(params.schemaId) : 0) +
    (params.gameId &&
    String(params.gameId).toLowerCase() !==
      String(params.schemaId || "").toLowerCase()
      ? getLocalAddedFeeCentsForTarget(params.gameId)
      : 0);
  const rawBreakdown: SpokeCostBreakdown | undefined =
    params.spokeCostBreakdown || existingLocal?.spoke_cost_breakdown;
  const resolvedBreakdown: SpokeCostBreakdown | undefined = rawBreakdown
    ? {
        ...rawBreakdown,
        saved_month_key: currentMonthKey,
        baseline_gross_at_save_cents: localAddedGross,
        baseline_fees_at_save_cents: localAddedFees,
      }
    : undefined;
  const goalCents =
    params.monthlyGoalCents !== undefined
      ? Math.max(0, Math.round(Number(params.monthlyGoalCents) || 0))
      : existingLocal?.monthly_goal_cents !== undefined
        ? Number(existingLocal.monthly_goal_cents)
        : 2500;
  const coveredCents =
    params.monthlyCoveredCents !== undefined
      ? Math.max(0, Math.round(Number(params.monthlyCoveredCents) || 0))
      : existingLocal?.monthly_covered_cents !== undefined
        ? Number(existingLocal.monthly_covered_cents)
        : 0;

  // Persist locally inside workspace overrides cache so immediate UI reflects it
  try {
    const rawMap = localStorage.getItem("sanctuary_partner_donations_v1");
    const map = rawMap ? JSON.parse(rawMap) : {};
    map[key] = {
      donation_url: cleanUrl,
      payment_processor: cleanProcessor,
      monthly_goal_cents: goalCents,
      monthly_covered_cents: coveredCents,
      spoke_cost_breakdown: resolvedBreakdown,
      updated_at: new Date().toISOString(),
    };
    if (params.gameId) {
      map[String(params.gameId).toLowerCase()] = map[key];
    }
    localStorage.setItem("sanctuary_partner_donations_v1", JSON.stringify(map));
  } catch {
    // ignore
  }

  // Update sanctuary_games on the Hub
  const client = supabaseAuth || supabase;
  const isUuid =
    typeof params.gameId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      params.gameId.trim(),
    );

  if (isUuid && params.gameId) {
    await client
      .from("sanctuary_games")
      .update({
        donation_url: cleanUrl || null,
        payment_processor: cleanProcessor,
      })
      .eq("id", params.gameId.trim());
  }

  const schemaLookup = (params.schemaId || (!isUuid ? params.gameId : "") || "").trim();
  if (schemaLookup) {
    await client
      .from("sanctuary_games")
      .update({
        donation_url: cleanUrl || null,
        payment_processor: cleanProcessor,
      })
      .ilike("schema_id", schemaLookup);
  }

  // Also persist Spoke Monthly Server Goal in keeper_system_broadcasts so all clients receive it without schema column dependencies
  try {
    const broadcastTitle = `SPOKE_DONATION_${key.toUpperCase()}`;
    const payloadStr = JSON.stringify({
      schema_id: key,
      game_id: params.gameId || key,
      donation_url: cleanUrl,
      payment_processor: cleanProcessor,
      monthly_goal_cents: goalCents,
      monthly_covered_cents: coveredCents,
      spoke_cost_breakdown: resolvedBreakdown,
      updated_at: new Date().toISOString(),
    });
    const { data: existingBroadcast } = await client
      .from("keeper_system_broadcasts")
      .select("id")
      .eq("category", "SpokeDonationConfig")
      .eq("title", broadcastTitle)
      .limit(1)
      .maybeSingle();
    if (existingBroadcast?.id) {
      await client
        .from("keeper_system_broadcasts")
        .update({
          description: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: true,
        })
        .eq("id", existingBroadcast.id);
    } else {
      await client.from("keeper_system_broadcasts").insert([
        {
          title: broadcastTitle,
          category: "SpokeDonationConfig",
          description: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: true,
          is_pinned: false,
        },
      ]);
    }
  } catch {
    // non-fatal if offline or restricted
  }
}

export function getLocalPartnerDonationOverride(
  idOrSchema?: string,
): {
  donation_url?: string;
  payment_processor?: string;
  monthly_goal_cents?: number;
  monthly_covered_cents?: number;
  spoke_cost_breakdown?: SpokeCostBreakdown;
} | null {
  if (!idOrSchema) return null;
  try {
    const rawMap = localStorage.getItem("sanctuary_partner_donations_v1");
    if (!rawMap) return null;
    const map = JSON.parse(rawMap);
    return map[String(idOrSchema).toLowerCase()] || null;
  } catch {
    return null;
  }
}

const INSTALLED_BUILD_META_KEY = "sanctuary_installed_build_meta_v1";
const PENDING_CHANNEL_SWITCH_KEY = "sanctuary_pending_channel_switch_v1";

export interface InstalledBuildMeta {
  channel: "dev" | "stable";
  version: string;
  publishedAt?: string;
  installedAt: number;
}

export function getInstalledBuildMeta(): InstalledBuildMeta | null {
  try {
    const raw = localStorage.getItem(INSTALLED_BUILD_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setInstalledBuildMeta(meta: InstalledBuildMeta): void {
  try {
    localStorage.setItem(INSTALLED_BUILD_META_KEY, JSON.stringify(meta));
    localStorage.removeItem(PENDING_CHANNEL_SWITCH_KEY);
  } catch {
    // ignore storage errors
  }
}

export function isTargetVersionNewer(
  currentVersion: string,
  targetVersion: string,
  isDevChannel = false,
): boolean {
  const cleanCurrent = (currentVersion || "").replace(/^v/i, "").trim().toLowerCase();
  const cleanTarget = (targetVersion || "").replace(/^v/i, "").trim().toLowerCase();
  if (!cleanTarget || cleanTarget === cleanCurrent) return false;

  const parseVer = (v: string) => {
    const baseMatch = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    const major = baseMatch ? parseInt(baseMatch[1], 10) : 0;
    const minor = baseMatch ? parseInt(baseMatch[2], 10) : 0;
    const patch = baseMatch ? parseInt(baseMatch[3], 10) : 0;
    const isDev = /dev/i.test(v);
    const devMatch = v.match(/dev[.\-_]?(\d+)/i);
    const devNum = devMatch ? parseInt(devMatch[1], 10) : isDev ? 1 : 0;
    return { major, minor, patch, isDev, devNum };
  };

  const cur = parseVer(cleanCurrent);
  const tgt = parseVer(cleanTarget);

  if (tgt.major !== cur.major) return tgt.major > cur.major;
  if (tgt.minor !== cur.minor) return tgt.minor > cur.minor;
  if (tgt.patch !== cur.patch) return tgt.patch > cur.patch;

  if (isDevChannel) {
    // Only compare dev iteration numbers directly when currentVersion already carries a dev suffix
    // or when explicitly comparing against a recorded dev install version
    if (cur.isDev) {
      return tgt.devNum > cur.devNum;
    }
    return false;
  }

  // On Stable channel: only upgrade if target has a strictly higher major.minor.patch
  return false;
}

export async function checkStableGitHubReleaseUpdate(
  currentVersion: string,
): Promise<{
  updateAvailable: boolean;
  version: string;
  notes: string;
  downloadUrl: string;
  date: string;
} | null> {
  try {
    const pipeline = await getKeepersPipelineConfig(true);
    const latestStable = (pipeline.stable_version || "").replace(/^v/i, "").trim();
    const cleanCurrent = (currentVersion || "").replace(/^v/i, "").trim();
    if (!latestStable) return null;

    const pendingSwitch = localStorage.getItem(PENDING_CHANNEL_SWITCH_KEY);
    const updateAvailable =
      pendingSwitch === "stable" ||
      isTargetVersionNewer(cleanCurrent, latestStable, false);
    if (!updateAvailable) return null;

    const downloadUrl = isMacClient()
      ? pipeline.stable_dmg_url ||
        pipeline.stable_release_url ||
        `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStable}`
      : isLinuxClient()
        ? pipeline.stable_linux_url ||
          pipeline.stable_release_url ||
          `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStable}`
        : pipeline.stable_exe_url ||
          pipeline.stable_msi_url ||
          pipeline.stable_release_url ||
          `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStable}`;

    return {
      updateAvailable: true,
      version: latestStable,
      notes: pipeline.stable_release_notes || "",
      downloadUrl,
      date: pipeline.stable_published_at || pipeline.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function checkSupporterDevBuildUpdate(
  currentVersion: string,
): Promise<{
  isDevChannelActive: boolean;
  updateAvailable: boolean;
  version: string;
  notes: string;
  downloadUrl: string;
  date: string;
} | null> {
  const state = await getSupporterState();
  const now = Math.floor(Date.now() / 1000);
  const isUnlocked = (state.dev_build.dev_build_until || 0) > now;

  // Automatic fallback to Stable if supporter timer expired
  if (!isUnlocked && state.dev_build.channel_enabled) {
    await setDevBuildChannelPreference(false);
    return null;
  }

  if (!isUnlocked || !state.dev_build.channel_enabled) {
    return null;
  }

  const pipeline = await getKeepersPipelineConfig(true);
  const latestDevVersion = pipeline.dev_build_version || "";
  const latestNotes = pipeline.dev_build_notes || "";
  const latestDate =
    pipeline.dev_published_at || pipeline.updated_at || new Date().toISOString();
  const downloadUrl = isMacClient()
    ? pipeline.dev_build_dmg_url ||
      pipeline.dev_release_url ||
      pipeline.dev_build_download_url ||
      "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
    : isLinuxClient()
      ? pipeline.dev_build_linux_url ||
        pipeline.dev_release_url ||
        pipeline.dev_build_download_url ||
        "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
      : pipeline.dev_build_download_url ||
        pipeline.dev_release_url ||
        "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest";

  const cleanCurrent = (currentVersion || "").replace(/^v/i, "").trim();
  const cleanTarget = (latestDevVersion || "").replace(/^v/i, "").trim();
  const pendingSwitch = localStorage.getItem(PENDING_CHANNEL_SWITCH_KEY);
  const installedMeta = getInstalledBuildMeta();

  let updateAvailable = false;
  if (pendingSwitch === "dev") {
    updateAvailable = true;
  } else if (isTargetVersionNewer(cleanCurrent, cleanTarget, false)) {
    // Remote dev build has a strictly higher major.minor.patch than current binary
    updateAvailable = true;
  } else if (/dev/i.test(cleanCurrent) && isTargetVersionNewer(cleanCurrent, cleanTarget, true)) {
    // Current binary has a -dev suffix and remote dev iteration is higher
    updateAvailable = true;
  } else if (installedMeta && installedMeta.channel === "dev") {
    // Compare against the previously installed dev build metadata
    if (isTargetVersionNewer(installedMeta.version || cleanCurrent, cleanTarget, true)) {
      updateAvailable = true;
    } else if (pipeline.dev_published_at && installedMeta.publishedAt) {
      const remoteTime = new Date(pipeline.dev_published_at).getTime();
      const installedTime = new Date(installedMeta.publishedAt).getTime();
      if (!isNaN(remoteTime) && !isNaN(installedTime) && remoteTime > installedTime + 60_000) {
        updateAvailable = true;
      }
    }
  } else if (pipeline.has_live_dev_release && pipeline.dev_published_at && pipeline.stable_published_at) {
    // Only treat same-base-version dev release as newer if published after the current stable release
    const devTime = new Date(pipeline.dev_published_at).getTime();
    const stableTime = new Date(pipeline.stable_published_at).getTime();
    if (!isNaN(devTime) && !isNaN(stableTime) && devTime > stableTime + 60_000) {
      updateAvailable = true;
    }
  }

  return {
    isDevChannelActive: true,
    updateAvailable,
    version: cleanTarget || cleanCurrent,
    notes: latestNotes,
    downloadUrl,
    date: latestDate,
  };
}

export function buildChannelUpdatePayload(
  pipeline: KeepersPipelineConfig,
  channel: "dev" | "stable",
  currentVersion = "0.5.8",
  isChannelSwitchOffer = false,
): any {
  const cleanBase =
    (currentVersion || "0.5.8").replace(/^v/i, "").trim().split("-")[0] || "0.5.8";

  if (channel === "dev") {
    const latestDevVersion = (
      pipeline.dev_build_version || `${cleanBase}-dev.1`
    )
      .replace(/^v/i, "")
      .trim();
    const latestDevDate =
      pipeline.dev_published_at || pipeline.updated_at || new Date().toISOString();
    const latestDevNotes = pipeline.dev_build_notes || "";
    const latestDevDownloadUrl = isMacClient()
      ? pipeline.dev_build_dmg_url ||
        pipeline.dev_release_url ||
        pipeline.dev_build_download_url ||
        "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
      : isLinuxClient()
        ? pipeline.dev_build_linux_url ||
          pipeline.dev_release_url ||
          pipeline.dev_build_download_url ||
          "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
        : pipeline.dev_build_download_url ||
          pipeline.dev_release_url ||
          "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest";

    return {
      version: latestDevVersion,
      date: latestDevDate,
      body: latestDevNotes,
      downloadUrl: latestDevDownloadUrl,
      isDevChannel: true,
      isChannelSwitchOffer,
      isExternalDownload: !isDesktop(),
      downloadAndInstall: async (onEvent?: (event: any) => void) => {
        await downloadAndInstallReleaseAsset(
          latestDevDownloadUrl,
          latestDevVersion,
          true,
          onEvent,
          latestDevDate,
        );
      },
    };
  }

  const latestStableVersion = (pipeline.stable_version || cleanBase)
    .replace(/^v/i, "")
    .trim();
  const latestStableDate =
    pipeline.stable_published_at || pipeline.updated_at || new Date().toISOString();
  const latestStableNotes = pipeline.stable_release_notes || "";
  const latestStableDownloadUrl = isMacClient()
    ? pipeline.stable_dmg_url ||
      pipeline.stable_release_url ||
      `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStableVersion}`
    : isLinuxClient()
      ? pipeline.stable_linux_url ||
        pipeline.stable_release_url ||
        `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStableVersion}`
      : pipeline.stable_exe_url ||
        pipeline.stable_msi_url ||
        pipeline.stable_release_url ||
        `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${latestStableVersion}`;

  return {
    version: latestStableVersion,
    date: latestStableDate,
    body: latestStableNotes,
    downloadUrl: latestStableDownloadUrl,
    isDevChannel: false,
    isChannelSwitchOffer,
    isExternalDownload: !isDesktop(),
    downloadAndInstall: async (onEvent?: (event: any) => void) => {
      await downloadAndInstallReleaseAsset(
        latestStableDownloadUrl,
        latestStableVersion,
        false,
        onEvent,
        latestStableDate,
      );
    },
  };
}

export async function syncUpdateChannelNotification(options?: {
  currentVersion?: string;
  switchedToChannel?: "dev" | "stable";
  forceGitHubRefresh?: boolean;
  checkTauriStableUpdater?: () => Promise<any>;
}): Promise<{
  activeChannel: "dev" | "stable";
  updateAvailable: boolean;
  payload: any | null;
}> {
  if (!isDesktop()) {
    useModalStore.getState().setUpdatePayload(null);
    return {
      activeChannel: options?.switchedToChannel || "stable",
      updateAvailable: false,
      payload: null,
    };
  }

  let resolvedVersion = options?.currentVersion || "";
  if (!resolvedVersion) {
    try {
      const pkgMod: any = await import("../../package.json");
      resolvedVersion = pkgMod?.default?.version || pkgMod?.version || "0.5.8";
    } catch {
      resolvedVersion = "0.5.8";
    }
  }
  const cleanCurrent = resolvedVersion.replace(/^v/i, "").trim();

  // 1. Explicit toggle flip between Stable <-> Dev:
  //    - Flipped to Dev -> Immediately offers latest Dev Build
  //    - Flipped to Stable -> Immediately offers latest Stable Version
  if (options?.switchedToChannel === "dev" || options?.switchedToChannel === "stable") {
    const targetChannel = options.switchedToChannel;
    try {
      localStorage.setItem(PENDING_CHANNEL_SWITCH_KEY, targetChannel);
    } catch {
      // ignore storage errors
    }

    // Set instant payload from local/cached pipeline config so UI updates with 0ms latency
    const cachedPipeline = await getKeepersPipelineConfig(false);
    const instantPayload = buildChannelUpdatePayload(
      cachedPipeline,
      targetChannel,
      cleanCurrent,
      true,
    );
    useModalStore.getState().setUpdatePayload(instantPayload);

    // Hydrate from live GitHub releases in the background
    const freshPipeline = await getKeepersPipelineConfig(
      options.forceGitHubRefresh ?? true,
    );
    const freshPayload = buildChannelUpdatePayload(
      freshPipeline,
      targetChannel,
      cleanCurrent,
      true,
    );
    useModalStore.getState().setUpdatePayload(freshPayload);

    return {
      activeChannel: targetChannel,
      updateAvailable: true,
      payload: freshPayload,
    };
  }

  // 2. Normal check: strictly scoped to the active channel
  const devRes = await checkSupporterDevBuildUpdate(cleanCurrent);
  if (devRes && devRes.isDevChannelActive) {
    // On Dev channel: ONLY notify for new Dev builds (never fall through to Stable)
    if (devRes.updateAvailable) {
      const payload = {
        version: devRes.version,
        date: devRes.date,
        body: devRes.notes,
        downloadUrl: devRes.downloadUrl,
        isDevChannel: true,
        isChannelSwitchOffer:
          localStorage.getItem(PENDING_CHANNEL_SWITCH_KEY) === "dev",
        isExternalDownload: !isDesktop(),
        downloadAndInstall: async (onEvent?: (event: any) => void) => {
          await downloadAndInstallReleaseAsset(
            devRes.downloadUrl,
            devRes.version,
            true,
            onEvent,
            devRes.date,
          );
        },
      };
      useModalStore.getState().setUpdatePayload(payload);
      return {
        activeChannel: "dev",
        updateAvailable: true,
        payload,
      };
    }

    useModalStore.getState().setUpdatePayload(null);
    return {
      activeChannel: "dev",
      updateAvailable: false,
      payload: null,
    };
  }

  // On Stable channel: ONLY notify for new Stable builds (never notify for Dev builds)
  if (isDesktop() && options?.checkTauriStableUpdater) {
    try {
      const tauriUpdate = await options.checkTauriStableUpdater();
      if (
        tauriUpdate &&
        isTargetVersionNewer(cleanCurrent, tauriUpdate.version, false)
      ) {
        useModalStore.getState().setUpdatePayload(tauriUpdate);
        return {
          activeChannel: "stable",
          updateAvailable: true,
          payload: tauriUpdate,
        };
      }
    } catch {
      // Fallback to GitHub Release API check below
    }
  }

  const stableRes = await checkStableGitHubReleaseUpdate(cleanCurrent);
  if (stableRes && stableRes.updateAvailable) {
    const payload = {
      version: stableRes.version,
      date: stableRes.date,
      body: stableRes.notes,
      downloadUrl: stableRes.downloadUrl,
      isDevChannel: false,
      isChannelSwitchOffer:
        localStorage.getItem(PENDING_CHANNEL_SWITCH_KEY) === "stable",
      isExternalDownload: !isDesktop(),
      downloadAndInstall: async (onEvent?: (event: any) => void) => {
        await downloadAndInstallReleaseAsset(
          stableRes.downloadUrl,
          stableRes.version,
          false,
          onEvent,
          stableRes.date,
        );
      },
    };
    useModalStore.getState().setUpdatePayload(payload);
    return {
      activeChannel: "stable",
      updateAvailable: true,
      payload,
    };
  }

  useModalStore.getState().setUpdatePayload(null);
  return {
    activeChannel: "stable",
    updateAvailable: false,
    payload: null,
  };
}

export async function downloadAndInstallReleaseAsset(
  downloadUrl: string,
  version: string,
  isDevChannel: boolean,
  onEvent?: (event: any) => void,
  publishedAt?: string,
): Promise<void> {
  setInstalledBuildMeta({
    channel: isDevChannel ? "dev" : "stable",
    version: String(version || "").replace(/^v/i, "").trim(),
    publishedAt: publishedAt || new Date().toISOString(),
    installedAt: Date.now(),
  });

  if (!isDesktop()) {
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }

  let unlisten: (() => void) | null = null;
  try {
    if (onEvent) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("sanctuary-update-progress", (ev: any) => {
        if (ev?.payload) {
          onEvent(ev.payload);
        }
      });
    }
    await invoke("download_and_install_update", {
      downloadUrl: downloadUrl || "",
      version: version || "",
      isDev: Boolean(isDevChannel),
    });
  } finally {
    if (unlisten) {
      try {
        unlisten();
      } catch {
        // ignore unlisten error
      }
    }
  }
}

export function isSandboxDonationUrl(_url?: string | null): boolean {
  return false;
}

export function buildPartnerCheckoutUrl(
  donationUrl: string,
  userId?: string | null,
  userEmail?: string | null,
): string {
  const cleanUrl = (donationUrl || "").trim();
  if (!cleanUrl || isSandboxDonationUrl(cleanUrl)) return cleanUrl;

  try {
    const parsed = new URL(cleanUrl);
    if (userId && userId !== "local_citizen") {
      // Stripe Payment Links & Checkout automatically attach client_reference_id to webhooks
      if (!parsed.searchParams.has("client_reference_id")) {
        parsed.searchParams.set("client_reference_id", userId);
      }
    }
    if (
      userEmail &&
      (parsed.hostname.includes("stripe.com") ||
        parsed.hostname.includes("ko-fi.com"))
    ) {
      if (!parsed.searchParams.has("prefilled_email")) {
        parsed.searchParams.set("prefilled_email", userEmail);
      }
    }
    return parsed.toString();
  } catch {
    return cleanUrl;
  }
}

export function extractCheckoutReceiptNonce(rawInput: string): string {
  const trimmed = (rawInput || "").trim();
  if (!trimmed) return "";

  // Match Stripe Checkout Session ID (cs_live_... or cs_test_...) inside URLs or plain text
  const csMatch = trimmed.match(/\b(cs_(?:live|test)_[a-zA-Z0-9_]+)\b/);
  if (csMatch && csMatch[1]) {
    return `stripe_${csMatch[1]}`;
  }

  // Match Stripe PaymentIntent / Charge / Receipt IDs
  const piMatch = trimmed.match(/\b((?:pi|ch|py|in|rcpt)_[a-zA-Z0-9_]+)\b/);
  if (piMatch && piMatch[1]) {
    return `stripe_${piMatch[1]}`;
  }

  // If user pasted a URL with session_id or receipt parameter
  try {
    const parsed = new URL(trimmed);
    const sessionParam =
      parsed.searchParams.get("session_id") ||
      parsed.searchParams.get("checkout_session_id") ||
      parsed.searchParams.get("payment_intent") ||
      parsed.searchParams.get("tx_id");
    if (sessionParam) {
      return `web_${sessionParam.trim()}`;
    }
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastSeg = pathParts[pathParts.length - 1];
    if (lastSeg && lastSeg.length >= 6) {
      return `web_${lastSeg.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)}`;
    }
  } catch {
    // Not a URL; use cleaned token
  }

  return trimmed.replace(/\s+/g, "_").slice(0, 96);
}

export async function loadPartnerCommunitiesList(
  workspaces?: any[],
): Promise<any[]> {
  const partnerList: any[] = [];
  const seenNames = new Set<string>();
  const wsList = workspaces || useStore.getState().workspaces || [];
  const remoteSpokeGoalMap: Record<
    string,
    {
      monthly_goal_cents?: number;
      monthly_covered_cents?: number;
      spoke_cost_breakdown?: SpokeCostBreakdown;
    }
  > = {};

  try {
    const client = supabaseAuth || supabase;
    const [{ data: games }, { data: spokeBroadcasts }] = await Promise.all([
      client
        .from("sanctuary_games")
        .select("id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor")
        .order("name", { ascending: true }),
      client
        .from("keeper_system_broadcasts")
        .select("title, description, message")
        .eq("category", "SpokeDonationConfig")
        .eq("is_active", true),
      syncMonthlyDonationLedgersFromCloud(),
    ]);

    if (Array.isArray(spokeBroadcasts)) {
      for (const b of spokeBroadcasts) {
        try {
          const parsed = JSON.parse(
            b.description || b.message || "{}",
          );
          const sKey = String(parsed.schema_id || "").toLowerCase();
          const gKey = String(parsed.game_id || "").toLowerCase();
          if (sKey) remoteSpokeGoalMap[sKey] = parsed;
          if (gKey) remoteSpokeGoalMap[gKey] = parsed;
        } catch {
          // ignore
        }
      }
    }

    if (Array.isArray(games)) {
      for (const g of games) {
        seenNames.add((g.name || "").toLowerCase());
        if (g.schema_id) seenNames.add(String(g.schema_id).toLowerCase());
        if (g.id) seenNames.add(String(g.id).toLowerCase());
        if (g.is_active === false) continue;
        const localOverride =
          getLocalPartnerDonationOverride(g.schema_id) ||
          getLocalPartnerDonationOverride(g.id);
        const remoteGoal =
          remoteSpokeGoalMap[String(g.schema_id || "").toLowerCase()] ||
          remoteSpokeGoalMap[String(g.id || "").toLowerCase()];
        if (
          isDesktop() &&
          localOverride?.donation_url &&
          !g.donation_url
        ) {
          // Auto-sync Desktop local partner donation override to Hub
          savePartnerCommunityDonationConfig({
            gameId: g.id,
            schemaId: g.schema_id,
            donationUrl: localOverride.donation_url,
            paymentProcessor:
              localOverride.payment_processor || g.payment_processor || "STRIPE",
            monthlyGoalCents: localOverride.monthly_goal_cents,
            monthlyCoveredCents: localOverride.monthly_covered_cents,
          }).catch(() => {});
        }
        const rawDonUrl =
          localOverride?.donation_url !== undefined
            ? localOverride.donation_url
            : g.donation_url || "";
        const resolvedDonUrl =
          rawDonUrl.trim() === LEGACY_DEACTIVATED_STRIPE_URL ||
          rawDonUrl.trim().toLowerCase().startsWith("sandbox://")
            ? ""
            : rawDonUrl;
        const resolvedGoalCents =
          localOverride?.monthly_goal_cents !== undefined
            ? Number(localOverride.monthly_goal_cents)
            : remoteGoal?.monthly_goal_cents !== undefined
              ? Number(remoteGoal.monthly_goal_cents)
              : 2500;
        const resolvedCoveredCents =
          localOverride?.monthly_covered_cents !== undefined
            ? Number(localOverride.monthly_covered_cents)
            : remoteGoal?.monthly_covered_cents !== undefined
              ? Number(remoteGoal.monthly_covered_cents)
              : 0;
        const resolvedBreakdown =
          localOverride?.spoke_cost_breakdown ||
          remoteGoal?.spoke_cost_breakdown;
        const rawProcessor = (
          localOverride?.payment_processor ||
          g.payment_processor ||
          "STRIPE"
        ).toUpperCase();
        partnerList.push({
          id: g.id,
          name: g.name,
          schema_id: g.schema_id || "workspace",
          icon: g.icon || "sports_esports",
          donation_url: resolvedDonUrl,
          payment_processor: rawProcessor === "SANDBOX" ? "STRIPE" : rawProcessor,
          monthly_goal_cents: resolvedGoalCents,
          monthly_covered_cents: resolvedCoveredCents,
          spoke_cost_breakdown: resolvedBreakdown,
        });
      }
    }
  } catch {
    // Fallback to local workspaces
  }

  if (Array.isArray(wsList)) {
    for (const w of wsList) {
      if (w?.is_active === false) continue;
      const wName = w.name || w.id || "Partner Workspace";
      const wSchemaKey = String(w.schema_id || "").toLowerCase();
      const wIdKey = String(w.id || "").toLowerCase();
      if (
        !seenNames.has(wName.toLowerCase()) &&
        (!wSchemaKey || !seenNames.has(wSchemaKey)) &&
        (!wIdKey || !seenNames.has(wIdKey))
      ) {
        seenNames.add(wName.toLowerCase());
        const localOverride =
          getLocalPartnerDonationOverride(w.schema_id) ||
          getLocalPartnerDonationOverride(w.id);
        const remoteGoal =
          remoteSpokeGoalMap[wSchemaKey] || remoteSpokeGoalMap[wIdKey];
        const rawDonUrl =
          localOverride?.donation_url !== undefined
            ? localOverride.donation_url
            : w.donation_url || "";
        const rawProc = (
          localOverride?.payment_processor ||
          w.payment_processor ||
          "STRIPE"
        ).toUpperCase();
        partnerList.push({
          id: w.id || wName,
          name: wName,
          schema_id: w.schema_id || w.id || "workspace",
          icon: w.icon || "sports_esports",
          donation_url: rawDonUrl.trim().toLowerCase().startsWith("sandbox://")
            ? ""
            : rawDonUrl,
          payment_processor: rawProc === "SANDBOX" ? "STRIPE" : rawProc,
          monthly_goal_cents:
            localOverride?.monthly_goal_cents !== undefined
              ? Number(localOverride.monthly_goal_cents)
              : remoteGoal?.monthly_goal_cents !== undefined
                ? Number(remoteGoal.monthly_goal_cents)
                : 2500,
          monthly_covered_cents:
            localOverride?.monthly_covered_cents !== undefined
              ? Number(localOverride.monthly_covered_cents)
              : remoteGoal?.monthly_covered_cents !== undefined
                ? Number(remoteGoal.monthly_covered_cents)
                : 0,
          spoke_cost_breakdown:
            localOverride?.spoke_cost_breakdown ||
            remoteGoal?.spoke_cost_breakdown,
        });
      }
    }
  }

  return partnerList;
}

export interface DevBuildClearanceResult {
  isDevBinary: boolean;
  isAuthorized: boolean;
  reason?: "ok" | "unauthenticated" | "expired";
  devBuildUntil?: number;
  stableVersion?: string;
  stableDownloadUrl?: string;
  appVersion?: string;
}

export async function verifyDevBuildClearance(): Promise<DevBuildClearanceResult> {
  if (!isDesktop()) {
    return { isDevBinary: false, isAuthorized: true, reason: "ok" };
  }

  let appVersion = "0.5.8";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    appVersion = await getVersion();
  } catch {
    // fallback
  }

  const isLocalDevServer = Boolean((import.meta as any).env?.DEV);
  const previewGateEnabled =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_preview_dev_gate") === "true";

  if (isLocalDevServer && !previewGateEnabled) {
    return {
      isDevBinary: false,
      isAuthorized: true,
      reason: "ok",
      appVersion,
    };
  }

  const buildChannel = String(
    (import.meta as any).env?.VITE_SANCTUARY_BUILD_CHANNEL || "",
  )
    .trim()
    .toLowerCase();
  const isDevVersionTag = appVersion.toLowerCase().includes("dev");
  const isDevBinary =
    previewGateEnabled || buildChannel === "dev" || isDevVersionTag;

  if (!isDevBinary) {
    return {
      isDevBinary: false,
      isAuthorized: true,
      reason: "ok",
      appVersion,
    };
  }

  const storeState = useStore.getState();
  const osRole = String(storeState.osRole || "").toLowerCase();
  const userRole = String(storeState.userRole || "").toLowerCase();
  const staffRoles = ["keeper", "wayfinder", "architect", "admin"];

  if (staffRoles.includes(osRole) || staffRoles.includes(userRole)) {
    return {
      isDevBinary: true,
      isAuthorized: true,
      reason: "ok",
      appVersion,
    };
  }

  const pipeline = await getKeepersPipelineConfig().catch(
    () => DEFAULT_KEEPERS_PIPELINE_CONFIG,
  );
  const stableVersion = pipeline.stable_version || "0.5.7";
  const stableDownloadUrl = isMacClient()
    ? pipeline.stable_dmg_url ||
      `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/latest`
    : pipeline.stable_exe_url ||
      `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/latest`;

  const session = storeState.session;
  const userId = session?.user?.id;
  if (!userId || userId === "local_citizen") {
    return {
      isDevBinary: true,
      isAuthorized: false,
      reason: "unauthenticated",
      stableVersion,
      stableDownloadUrl,
      appVersion,
    };
  }

  const now = Math.floor(Date.now() / 1000);

  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const client = supabaseAuth || supabase;
      const { data: profile, error } = await client
        .from("profiles")
        .select("dev_build_until, role")
        .eq("id", userId)
        .maybeSingle();

      if (!error && profile) {
        const remoteRole = String((profile as any).role || "").toLowerCase();
        if (staffRoles.includes(remoteRole)) {
          return {
            isDevBinary: true,
            isAuthorized: true,
            reason: "ok",
            appVersion,
          };
        }

        const remoteUntil = profile.dev_build_until
          ? Math.floor(new Date(profile.dev_build_until).getTime() / 1000)
          : 0;

        if (remoteUntil > now) {
          // Refresh local SQLite cache for brief offline resilience
          await getSupporterState(storeState.vaultPath || "", userId).catch(
            () => {},
          );
          return {
            isDevBinary: true,
            isAuthorized: true,
            reason: "ok",
            devBuildUntil: remoteUntil,
            appVersion,
          };
        }

        return {
          isDevBinary: true,
          isAuthorized: false,
          reason: "expired",
          devBuildUntil: remoteUntil,
          stableVersion,
          stableDownloadUrl,
          appVersion,
        };
      }
    } catch {
      // Fallback to local SQLite vault if Hub query is unreachable
    }
  }

  const localState = await getSupporterState(
    storeState.vaultPath || "",
    userId,
  );
  const localUntil = localState.dev_build.dev_build_until || 0;
  if (localUntil > now) {
    return {
      isDevBinary: true,
      isAuthorized: true,
      reason: "ok",
      devBuildUntil: localUntil,
      appVersion,
    };
  }

  return {
    isDevBinary: true,
    isAuthorized: false,
    reason: "expired",
    devBuildUntil: localUntil,
    stableVersion,
    stableDownloadUrl,
    appVersion,
  };
}

let lastCelebratedUntil = 0;

export function presentSupporterCelebrationModal(params: {
  devBuildUntil: number;
  monthsAdded?: number;
  t?: (key: string, fallback: string) => string;
}): void {
  if (params.devBuildUntil > 0 && params.devBuildUntil === lastCelebratedUntil) {
    return;
  }
  if (params.devBuildUntil > 0) {
    lastCelebratedUntil = params.devBuildUntil;
  }

  const tr = params.t || ((_k: string, fb: string) => fb);
  const months = Math.max(1, Number(params.monthsAdded || 1));
  const daysAdded = months * 30;
  const nowSecs = Math.floor(Date.now() / 1000);
  const remainingDays = Math.max(
    daysAdded,
    Math.ceil(Math.max(0, (params.devBuildUntil || 0) - nowSecs) / 86400),
  );
  const expiryDateStr =
    params.devBuildUntil > 0
      ? new Date(params.devBuildUntil * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : tr("supporter_active_channel_label", "Active Stream");

  const daysUnit = tr("supporter_celebration_days_unit", "Days");
  const monthUnit =
    months === 1
      ? tr("supporter_celebration_month_unit", "Month")
      : tr("supporter_celebration_months_unit", "Months");

  const modalState = useModalStore.getState();

  // Close the SidePanelBrowser and remove completed Stripe checkout tabs so the user returns cleanly to Sanctuary OS
  if (modalState.isSideBrowserOpen) {
    modalState.setIsSideBrowserOpen(false);
  }
  if (Array.isArray(modalState.browserTabs) && modalState.browserTabs.length > 0) {
    const remainingTabs = modalState.browserTabs.filter(
      (tab: any) => !String(tab?.url || "").toLowerCase().includes("stripe.com/c/pay/"),
    );
    if (remainingTabs.length !== modalState.browserTabs.length) {
      modalState.setBrowserTabs(remainingTabs);
      if (remainingTabs.length > 0) {
        modalState.setActiveBrowserTabId(remainingTabs[remainingTabs.length - 1].id);
      }
    }
  }

  const title = tr(
    "supporter_celebration_title",
    "Supporter Access Extended!",
  );

  window.dispatchEvent(new CustomEvent("sanctuary-supporter-updated"));
  window.dispatchEvent(
    new CustomEvent("sanctuary-supporter-celebration", {
      detail: {
        devBuildUntil: params.devBuildUntil,
        monthsAdded: months,
        daysAdded,
        remainingDays,
        expiryDateStr,
      },
    }),
  );

  import("./notificationHelper")
    .then(({ notifyOS }) => {
      notifyOS(
        title,
        `+${daysAdded} ${daysUnit} (+${months} ${monthUnit}) — ${remainingDays} ${tr("supporter_days_remaining_suffix", "Days Remaining")} (${tr("supporter_expires_prefix", "Expires")} ${expiryDateStr})`,
        "SUPPORT",
        true,
        `supporter_celebration_${params.devBuildUntil}_${Date.now()}`,
      ).catch(() => {});
    })
    .catch(() => {});
}



