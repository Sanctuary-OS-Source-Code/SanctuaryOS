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
}

const LOCAL_STORAGE_KEY = "sanctuary_local_supporter_vault_v1";
const NONCE_STORAGE_KEY = "sanctuary_redeemed_tx_hashes_v1";

function readFallbackVault(userId: string): LocalSupporterStatePayload {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        follows: Array.isArray(parsed.follows) ? parsed.follows : [],
        supporters: Array.isArray(parsed.supporters) ? parsed.supporters : [],
        dev_build: parsed.dev_build || {
          user_id: userId || "local_citizen",
          dev_build_until: 0,
          donation_credit_cents: 0,
          total_months_unlocked: 0,
          channel_enabled: false,
          updated_at: Math.floor(Date.now() / 1000),
        },
      };
    }
  } catch {
    // ignore parse errors
  }
  return {
    follows: [],
    supporters: [],
    dev_build: {
      user_id: userId || "local_citizen",
      dev_build_until: 0,
      donation_credit_cents: 0,
      total_months_unlocked: 0,
      channel_enabled: false,
      updated_at: Math.floor(Date.now() / 1000),
    },
  };
}

function writeFallbackVault(state: LocalSupporterStatePayload) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
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
        state = sqliteState;
        writeFallbackVault(state);
      }
    } catch (err) {
      console.warn("SQLite supporter state fallback:", err);
    }
  }

  // Sync cumulative Global Daily Dev Build status from Hub profile if authenticated & online
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (
    !localOnly &&
    navigator.onLine &&
    effectiveUser &&
    effectiveUser !== "local_citizen"
  ) {
    try {
      const client = supabaseAuth || supabase;
      const { data: profile } = await client
        .from("profiles")
        .select(
          "dev_build_until, donation_credit_cents, total_months_unlocked",
        )
        .eq("id", effectiveUser)
        .maybeSingle();

      if (profile) {
        const cloudUntilSecs = profile.dev_build_until
          ? Math.floor(new Date(profile.dev_build_until).getTime() / 1000)
          : 0;
        const cloudCredit = Number(profile.donation_credit_cents || 0);
        const cloudMonths = Number(profile.total_months_unlocked || 0);

        if (
          cloudUntilSecs > state.dev_build.dev_build_until ||
          cloudMonths > state.dev_build.total_months_unlocked
        ) {
          state.dev_build = {
            ...state.dev_build,
            dev_build_until: Math.max(
              state.dev_build.dev_build_until,
              cloudUntilSecs,
            ),
            donation_credit_cents: cloudCredit,
            total_months_unlocked: Math.max(
              state.dev_build.total_months_unlocked,
              cloudMonths,
            ),
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

export async function stackGlobalDevBuildDonation(params: {
  amountUsd: number;
  txNonce: string;
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

  return {
    devBuild: updatedDevBuild,
    monthsAdded: finalMonthsAdded,
  };
}

export async function setDevBuildChannelPreference(
  enabled: boolean,
): Promise<LocalDevBuildStatus> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const state = await getSupporterState(vaultPath, userId);
  const now = Math.floor(Date.now() / 1000);
  const isUnlocked = state.dev_build.dev_build_until > now;
  const finalEnabled = enabled && isUnlocked;

  state.dev_build.channel_enabled = finalEnabled;
  writeFallbackVault(state);
  localStorage.setItem(
    "sanctuary_dev_build_channel",
    finalEnabled ? "true" : "false",
  );

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
  stable_version: string;
  stable_exe_url?: string;
  stable_msi_url?: string;
  stable_published_at?: string;
  stable_release_notes?: string;
  stable_release_url?: string;
  dev_build_version: string;
  dev_build_endpoint: string;
  dev_build_download_url: string;
  dev_build_notes: string;
  dev_published_at?: string;
  dev_release_url?: string;
  has_live_dev_release?: boolean;
  updated_at: string;
}

const KEEPERS_PIPELINE_STORAGE_KEY = "sanctuary_keepers_pipeline_config_v1";

export const DEFAULT_KEEPERS_PIPELINE_CONFIG: KeepersPipelineConfig = {
  keepers_donation_url: "https://donate.stripe.com/00w28j4ZP3IU2HCgEl08g00",
  keepers_payment_processor: "STRIPE",
  stable_version: "0.5.8",
  dev_build_version: "0.5.8-dev.1",
  dev_build_endpoint:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/dev-latest/latest.json",
  dev_build_download_url:
    "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest",
  dev_build_notes:
    "Daily Dev Build stream for Sanctuary OS Ecosystem Supporters ($5 = +30 Days across any Partner Community or Keepers Core).",
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
        if (exeAsset?.browser_download_url) {
          result.stable_exe_url = exeAsset.browser_download_url;
        }
        if (msiAsset?.browser_download_url) {
          result.stable_msi_url = msiAsset.browser_download_url;
        }
      }
    }

    // 2. Latest Daily Dev Build Release (tag_name === 'dev-latest', prerelease, or tag contains 'dev')
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
      cached = { ...cached, ...JSON.parse(raw) };
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
    ]);

    if (broadcastRes && (broadcastRes.content || broadcastRes.message)) {
      try {
        const parsed = JSON.parse(broadcastRes.content || broadcastRes.message);
        cached = {
          ...cached,
          ...parsed,
          updated_at: broadcastRes.created_at || cached.updated_at,
        };
      } catch {
        // ignore parse error
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
  const next: KeepersPipelineConfig = {
    ...current,
    ...config,
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
          content: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: false,
          is_pinned: false,
        })
        .eq("id", existing.id);
    } else {
      await client.from("keeper_system_broadcasts").insert([
        {
          title: `DEV_BUILD_PIPELINE_${next.dev_build_version}`,
          category: "PipelineConfig",
          content: payloadStr,
          message: payloadStr,
          target_audience: "Internal_Pipeline",
          is_active: false,
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
}): Promise<void> {
  const cleanUrl = (params.donationUrl || "").trim();
  const cleanProcessor = (params.paymentProcessor || "STRIPE")
    .trim()
    .toUpperCase();

  // Persist locally inside workspace overrides cache so immediate UI reflects it
  try {
    const rawMap = localStorage.getItem("sanctuary_partner_donations_v1");
    const map = rawMap ? JSON.parse(rawMap) : {};
    const key = (params.schemaId || params.gameId || "default").toLowerCase();
    map[key] = {
      donation_url: cleanUrl,
      payment_processor: cleanProcessor,
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
  if (params.gameId) {
    const { error } = await client
      .from("sanctuary_games")
      .update({
        donation_url: cleanUrl || null,
        payment_processor: cleanProcessor,
      })
      .eq("id", params.gameId);
    if (!error) return;
  }

  if (params.schemaId) {
    await client
      .from("sanctuary_games")
      .update({
        donation_url: cleanUrl || null,
        payment_processor: cleanProcessor,
      })
      .ilike("schema_id", params.schemaId);
  }
}

export function getLocalPartnerDonationOverride(
  idOrSchema?: string,
): { donation_url?: string; payment_processor?: string } | null {
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

    const downloadUrl =
      pipeline.stable_exe_url ||
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
  const downloadUrl =
    pipeline.dev_build_download_url ||
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
    const latestDevDownloadUrl =
      pipeline.dev_build_download_url ||
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
  const latestStableDownloadUrl =
    pipeline.stable_exe_url ||
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

export function isSandboxDonationUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = String(url).trim().toLowerCase();
  return (
    trimmed.startsWith("sandbox://") ||
    trimmed === "sandbox" ||
    trimmed.includes("sandbox.sanctuaryos")
  );
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

export async function loadPartnerCommunitiesList(
  workspaces?: any[],
): Promise<any[]> {
  const partnerList: any[] = [];
  const seenNames = new Set<string>();
  const wsList = workspaces || useStore.getState().workspaces || [];

  try {
    const client = supabaseAuth || supabase;
    const { data: games } = await client
      .from("sanctuary_games")
      .select("id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (Array.isArray(games)) {
      for (const g of games) {
        seenNames.add((g.name || "").toLowerCase());
        const localOverride =
          getLocalPartnerDonationOverride(g.schema_id) ||
          getLocalPartnerDonationOverride(g.id);
        partnerList.push({
          id: g.id,
          name: g.name,
          schema_id: g.schema_id || "workspace",
          icon: g.icon || "sports_esports",
          donation_url:
            localOverride?.donation_url !== undefined
              ? localOverride.donation_url
              : g.donation_url || "",
          payment_processor: (
            localOverride?.payment_processor ||
            g.payment_processor ||
            "STRIPE"
          ).toUpperCase(),
        });
      }
    }
  } catch {
    // Fallback to local workspaces
  }

  if (Array.isArray(wsList)) {
    for (const w of wsList) {
      const wName = w.name || w.id || "Partner Workspace";
      if (!seenNames.has(wName.toLowerCase())) {
        seenNames.add(wName.toLowerCase());
        const localOverride =
          getLocalPartnerDonationOverride(w.schema_id) ||
          getLocalPartnerDonationOverride(w.id);
        partnerList.push({
          id: w.id || wName,
          name: wName,
          schema_id: w.schema_id || w.id || "workspace",
          icon: w.icon || "sports_esports",
          donation_url:
            localOverride?.donation_url !== undefined
              ? localOverride.donation_url
              : w.donation_url || "",
          payment_processor: (
            localOverride?.payment_processor ||
            w.payment_processor ||
            "STRIPE"
          ).toUpperCase(),
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
  const stableDownloadUrl =
    pipeline.stable_exe_url ||
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
        .select("dev_build_until, role, os_role")
        .eq("id", userId)
        .maybeSingle();

      if (!error && profile) {
        const remoteRole = String((profile as any).role || "").toLowerCase();
        const remoteOsRole = String(
          (profile as any).os_role || "",
        ).toLowerCase();
        if (
          staffRoles.includes(remoteRole) ||
          staffRoles.includes(remoteOsRole)
        ) {
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



