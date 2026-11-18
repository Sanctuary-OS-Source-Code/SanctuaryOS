import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../envUtils";
import { supabaseAuth, supabase, isStandaloneFork } from "../../supabase";
import { useStore } from "../../store";
import { useModalStore } from "../../store/modalStore";
import { sanitizeExternalHttpsUrl } from "../../shared-components/misc";
import { DEFAULT_KEEPERS_PIPELINE_CONFIG, KEEPERS_PIPELINE_STORAGE_KEY, LEGACY_DEACTIVATED_STRIPE_URL, PENDING_CHANNEL_SWITCH_KEY, getCurrentMonthKey, getInstalledBuildMeta, setInstalledBuildMeta, isTargetVersionNewer, isMacClient, isLinuxClient, getLocalPartnerDonationOverride, type KeepersPipelineConfig, type FoundryCostBreakdown, type SpokeCostBreakdown, type DevBuildClearanceResult } from "./typesAndHelpers";
import { getSupporterState } from "./vaultSync";
import { syncMonthlyDonationLedgersFromCloud, getLocalAddedCentsForTarget, getLocalAddedFeeCentsForTarget, setDevBuildChannelPreference } from "./billingLedger";

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

  const storeState = useStore.getState();
  if (storeState.userRole !== "wayfinder") {
    throw new Error("Only the Spoke Wayfinder can modify Spoke donation settings.");
  }

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

  const client = supabaseAuth || supabase;
  const targetGameIdentifier = (params.gameId || params.schemaId || key).trim();

  if (!isStandaloneFork) {
    const res: any = await client.functions.invoke("game-gateway", {
      body: {
        game_id: targetGameIdentifier,
        action: "wayfinder_update_spoke_donations",
        payload: {
          donation_url: cleanUrl || null,
          payment_processor: cleanProcessor,
          monthly_goal_cents: goalCents,
          monthly_covered_cents: coveredCents,
          spoke_cost_breakdown: resolvedBreakdown,
        },
      },
    });
    const invokeErr = res?.error || (res?.data?.error ? { message: res.data.error } : null);
    if (invokeErr) {
      throw new Error(invokeErr.message || "Failed to update Spoke donation settings.");
    }
    return;
  }

  // Standalone fork fallback (single self-hosted Spoke DB without Hub gateway)
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
      const pkgMod: any = await import("../../../package.json");
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
    const safeUrl = sanitizeExternalHttpsUrl(downloadUrl);
    if (safeUrl) {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }
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
    const isKeeper = useStore.getState().osRole === "keeper";
    const [{ data: games }, { data: spokeBroadcasts }] = await Promise.all([
      client
        .from("sanctuary_games")
        .select("id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, is_keepers_only, donation_url, payment_processor")
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
        if (g.is_keepers_only === true && !isKeeper) continue;
        const localOverride =
          getLocalPartnerDonationOverride(g.schema_id) ||
          getLocalPartnerDonationOverride(g.id);
        const remoteGoal =
          remoteSpokeGoalMap[String(g.schema_id || "").toLowerCase()] ||
          remoteSpokeGoalMap[String(g.id || "").toLowerCase()];
        if (
          isDesktop() &&
          useStore.getState().userRole === "wayfinder" &&
          String(useStore.getState().activeWorkspaceId || "").toLowerCase() ===
            String(g.schema_id || g.id || "").toLowerCase() &&
          localOverride?.donation_url &&
          !g.donation_url
        ) {
          // Auto-sync Desktop local partner donation override to Hub (Wayfinder of active Spoke only)
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

  import("../notificationHelper")
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




