import { useStore } from "../../store";
import type { EncryptedSupporterVaultPayload } from "../stagingCrypto";

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

export interface LocalSpokeSupporter {
  spoke_id: string;
  spoke_name: string;
  provider: string;
  pledge_cents: number;
  verified_at: number;
  expires_at: number;
  tx_nonce?: string;
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
  spoke_supporters?: LocalSpokeSupporter[];
  dev_build: LocalDevBuildStatus;
  removed_follows?: Record<string, number>;
  removed_supporters?: Record<string, number>;
  total_months_unlocked?: number;
  is_unlocked?: boolean;
}

export const LOCAL_STORAGE_KEY = "sanctuary_local_supporter_vault_v1";
export const NONCE_STORAGE_KEY = "sanctuary_redeemed_tx_hashes_v1";
export const SUPPORTER_CLOUD_PULL_TTL_MS = 45_000;
export const TOMBSTONE_RETENTION_SECS = 180 * 86400;
export const lastCloudSupporterPullByUser = new Map<string, number>();
export const inFlightCloudSupporterPull = new Map<string, Promise<void>>();


export function sanitizeTombstoneMap(
  raw: unknown,
  nowSecs = Math.floor(Date.now() / 1000)
): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const cleanKey = String(k || "").trim();
    const ts = Number(v || 0);
    if (cleanKey && Number.isFinite(ts) && ts > 0 && nowSecs - ts <= TOMBSTONE_RETENTION_SECS) {
      out[cleanKey] = Math.floor(ts);
    }
  }
  return out;
}

export function mergeSupporterVaultStates(
  localFollows: LocalMasonFollow[],
  localSupporters: LocalMasonSupporter[],
  localSpokeSupporters: LocalSpokeSupporter[],
  localRemovedFollows: Record<string, number>,
  localRemovedSupporters: Record<string, number>,
  remote: EncryptedSupporterVaultPayload | null,
  nowSecs = Math.floor(Date.now() / 1000)
): {
  follows: LocalMasonFollow[];
  supporters: LocalMasonSupporter[];
  spokeSupporters: LocalSpokeSupporter[];
  removedFollows: Record<string, number>;
  removedSupporters: Record<string, number>;
  changedLocal: boolean;
  changedRemote: boolean;
} {
  const remoteFollows: LocalMasonFollow[] = Array.isArray(remote?.follows) ? remote!.follows : [];
  const remoteSupporters: LocalMasonSupporter[] = Array.isArray(remote?.supporters)
    ? remote!.supporters
    : [];
  const remoteSpokeSupporters: LocalSpokeSupporter[] = Array.isArray(remote?.spokeSupporters)
    ? remote!.spokeSupporters
    : [];
  const remoteRemovedFollows = sanitizeTombstoneMap(remote?.removedFollowKeys, nowSecs);
  const remoteRemovedSupporters = sanitizeTombstoneMap(remote?.removedSupporterKeys, nowSecs);

  const mergedRemovedFollows: Record<string, number> = { ...localRemovedFollows };
  for (const [id, ts] of Object.entries(remoteRemovedFollows)) {
    mergedRemovedFollows[id] = Math.max(mergedRemovedFollows[id] || 0, ts);
  }

  const mergedRemovedSupporters: Record<string, number> = { ...localRemovedSupporters };
  for (const [id, ts] of Object.entries(remoteRemovedSupporters)) {
    mergedRemovedSupporters[id] = Math.max(mergedRemovedSupporters[id] || 0, ts);
  }

  const followById = new Map<string, LocalMasonFollow>();
  for (const item of [...remoteFollows, ...localFollows]) {
    const id = String(item?.mason_id || "").trim();
    if (!id) continue;
    const prev = followById.get(id);
    if (!prev || Number(item.followed_at || 0) >= Number(prev.followed_at || 0)) {
      followById.set(id, {
        mason_id: id,
        mason_name: String(item.mason_name || prev?.mason_name || ""),
        avatar_url: String(item.avatar_url || prev?.avatar_url || ""),
        workspace_id: String(item.workspace_id || prev?.workspace_id || ""),
        notify_alerts: item.notify_alerts !== false,
        followed_at: Number(item.followed_at || prev?.followed_at || nowSecs),
      });
    }
  }

  const mergedFollows: LocalMasonFollow[] = [];
  for (const [id, entry] of followById.entries()) {
    const removedAt = mergedRemovedFollows[id] || 0;
    if (removedAt > 0 && removedAt >= Number(entry.followed_at || 0)) {
      continue;
    }
    delete mergedRemovedFollows[id];
    mergedFollows.push(entry);
  }
  mergedFollows.sort((a, b) => Number(b.followed_at || 0) - Number(a.followed_at || 0));

  const supporterById = new Map<string, LocalMasonSupporter>();
  for (const item of [...remoteSupporters, ...localSupporters]) {
    const id = String(item?.mason_id || "").trim();
    const expiresAt = Number(item?.expires_at || 0);
    if (!id || expiresAt <= nowSecs) continue;
    const prev = supporterById.get(id);
    const curVer = Number(item.verified_at || 0);
    const prevVer = Number(prev?.verified_at || 0);
    if (
      !prev ||
      curVer > prevVer ||
      (curVer === prevVer && expiresAt > Number(prev.expires_at || 0))
    ) {
      supporterById.set(id, {
        mason_id: id,
        mason_name: String(item.mason_name || prev?.mason_name || id),
        provider: String(item.provider || prev?.provider || "patreon"),
        tier_name: String(item.tier_name || prev?.tier_name || "Supporter"),
        pledge_cents: Number(item.pledge_cents ?? prev?.pledge_cents ?? 500),
        patreon_campaign_id: String(item.patreon_campaign_id || prev?.patreon_campaign_id || ""),
        cryptographic_pass: String(item.cryptographic_pass || prev?.cryptographic_pass || ""),
        expedited_support: item.expedited_support !== false,
        early_access: item.early_access !== false,
        verified_at: curVer || nowSecs,
        expires_at: expiresAt,
      });
    }
  }

  const mergedSupporters: LocalMasonSupporter[] = [];
  for (const [id, entry] of supporterById.entries()) {
    const removedAt = mergedRemovedSupporters[id] || 0;
    if (removedAt > 0 && removedAt >= Number(entry.verified_at || 0)) {
      continue;
    }
    delete mergedRemovedSupporters[id];
    mergedSupporters.push(entry);
  }
  mergedSupporters.sort((a, b) => Number(b.verified_at || 0) - Number(a.verified_at || 0));

  const spokeById = new Map<string, LocalSpokeSupporter>();
  for (const item of [...remoteSpokeSupporters, ...localSpokeSupporters]) {
    const sid = String(item?.spoke_id || "").trim().toLowerCase();
    const expiresAt = Number(item?.expires_at || 0);
    if (!sid || (expiresAt > 0 && expiresAt <= nowSecs)) continue;
    const prev = spokeById.get(sid);
    const curVer = Number(item.verified_at || 0);
    const prevVer = Number(prev?.verified_at || 0);
    if (
      !prev ||
      curVer > prevVer ||
      (curVer === prevVer && expiresAt > Number(prev.expires_at || 0))
    ) {
      spokeById.set(sid, {
        spoke_id: sid,
        spoke_name: String(item.spoke_name || prev?.spoke_name || sid),
        provider: String(item.provider || prev?.provider || "partner_donation"),
        pledge_cents: Number(item.pledge_cents ?? prev?.pledge_cents ?? 500),
        verified_at: curVer || nowSecs,
        expires_at: expiresAt || nowSecs + 30 * 86400,
        tx_nonce: item.tx_nonce || prev?.tx_nonce,
      });
    }
  }
  const mergedSpokeSupporters = Array.from(spokeById.values()).sort(
    (a, b) => Number(b.verified_at || 0) - Number(a.verified_at || 0)
  );

  const serializeSig = (
    fl: LocalMasonFollow[],
    sp: LocalMasonSupporter[],
    sk: LocalSpokeSupporter[],
    rf: Record<string, number>,
    rs: Record<string, number>
  ) =>
    JSON.stringify({
      fl: fl.map((x) => `${x.mason_id}:${x.followed_at}`).sort(),
      sp: sp.map((x) => `${x.mason_id}:${x.verified_at}:${x.expires_at}`).sort(),
      sk: sk.map((x) => `${x.spoke_id}:${x.verified_at}:${x.expires_at}`).sort(),
      rf: Object.entries(rf).sort(([a], [b]) => a.localeCompare(b)),
      rs: Object.entries(rs).sort(([a], [b]) => a.localeCompare(b)),
    });

  const mergedSig = serializeSig(
    mergedFollows,
    mergedSupporters,
    mergedSpokeSupporters,
    mergedRemovedFollows,
    mergedRemovedSupporters
  );
  const localSig = serializeSig(
    localFollows,
    localSupporters.filter((s) => Number(s?.expires_at || 0) > nowSecs),
    localSpokeSupporters.filter((s) => !s?.expires_at || Number(s.expires_at) > nowSecs),
    localRemovedFollows,
    localRemovedSupporters
  );
  const remoteSig = remote
    ? serializeSig(
        remoteFollows,
        remoteSupporters.filter((s) => Number(s?.expires_at || 0) > nowSecs),
        remoteSpokeSupporters.filter((s) => !s?.expires_at || Number(s.expires_at) > nowSecs),
        remoteRemovedFollows,
        remoteRemovedSupporters
      )
    : "";

  const hasAnyState =
    mergedFollows.length > 0 ||
    mergedSupporters.length > 0 ||
    mergedSpokeSupporters.length > 0 ||
    Object.keys(mergedRemovedFollows).length > 0 ||
    Object.keys(mergedRemovedSupporters).length > 0;

  return {
    follows: mergedFollows,
    supporters: mergedSupporters,
    spokeSupporters: mergedSpokeSupporters,
    removedFollows: mergedRemovedFollows,
    removedSupporters: mergedRemovedSupporters,
    changedLocal: mergedSig !== localSig,
    changedRemote: remote ? mergedSig !== remoteSig : hasAnyState,
  };
}


export function readFallbackVault(userId: string): LocalSupporterStatePayload {
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
        spoke_supporters: Array.isArray(parsed.spoke_supporters) ? parsed.spoke_supporters : [],
        dev_build: resolvedDevBuild,
        removed_follows: sanitizeTombstoneMap(parsed.removed_follows),
        removed_supporters: sanitizeTombstoneMap(parsed.removed_supporters),
      };
    }
  } catch {
    // ignore parse errors
  }
  return {
    follows: [],
    supporters: [],
    spoke_supporters: [],
    dev_build: defaultDevBuild,
    removed_follows: {},
    removed_supporters: {},
  };
}

export function writeFallbackVault(state: LocalSupporterStatePayload) {
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


export const MONTHLY_SERVER_POOL_STORAGE_KEY = "sanctuary_monthly_server_pool_v1";

export function getCurrentMonthKey(): string {
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

export function formatCentsToUsdString(cents: number): string {
  const abs = Math.abs(Math.round(Number(cents || 0))) / 100;
  return `${cents < 0 ? "-" : ""}$${abs.toFixed(2)}`;
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


export interface KeeperEmailResponseTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  updated_at?: string;
}

export const DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES: KeeperEmailResponseTemplate[] = [
  {
    id: "human_direct_followup",
    name: "Direct Keeper Follow-Up",
    category: "Support",
    subject: "Following Up On Your Sanctuary OS Request",
    body: "Hello,\n\nA Keeper at Sanctuary Foundry has reviewed your inquiry and wanted to reach out directly with an update.\n\nIf you have any extra details or screenshots to share, reply to this email anytime and we will take care of you.\n\nWarm regards,\nSanctuary Foundry Keepers",
  },
  {
    id: "diagnostic_repro_request",
    name: "Diagnostic & Logs Request",
    category: "Troubleshooting",
    subject: "Quick Details Needed For Your Sanctuary OS Case",
    body: "Hello,\n\nThank you for flagging this with Sanctuary Foundry. To reproduce the issue accurately, could you reply with:\n\n1. Your current Sanctuary OS version and operating system\n2. Any exact error text or steps leading up to the behavior\n\nOnce we have those details, a Keeper will follow up directly.\n\nBest,\nSanctuary Foundry Keepers",
  },
  {
    id: "partner_spoke_outreach",
    name: "Partner Spoke Direct Outreach",
    category: "Partner Spokes",
    subject: "Sanctuary OS Partner Spoke Alignment & Next Steps",
    body: "Hello,\n\nThank you for connecting with Sanctuary Foundry regarding Partner Spoke integration on Sanctuary OS.\n\nWe have reviewed your community profile and would love to coordinate schema setup, hub routing, and Keeper review details whenever you are ready.\n\nWarm regards,\nSanctuary Foundry Keepers",
  },
  {
    id: "keeper_application_followup",
    name: "Keeper Application Follow-Up",
    category: "Applications",
    subject: "Your Sanctuary Foundry Keeper Application",
    body: "Hello,\n\nThank you for applying to help steward communities with Sanctuary Foundry.\n\nOur Keepers team is reviewing your application and would appreciate a brief reply with your primary areas of experience and availability this week.\n\nBest regards,\nSanctuary Foundry Keepers",
  },
];

export function resolveKeeperEmailResponseTemplates(
  cfg?: Partial<KeepersPipelineConfig> | null
): KeeperEmailResponseTemplate[] {
  if (Array.isArray(cfg?.email_response_templates)) {
    return cfg.email_response_templates.map((tpl) => ({ ...tpl }));
  }
  return DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES.map((tpl) => ({ ...tpl }));
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
  email_response_templates?: KeeperEmailResponseTemplate[];
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


export const KEEPERS_PIPELINE_STORAGE_KEY = "sanctuary_keepers_pipeline_config_v1";
export const LEGACY_DEACTIVATED_STRIPE_URL =
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

export function normalizeLegacySupportEmail(raw?: string | null): string {
  const clean = String(raw || "").trim();
  if (!clean || clean.toLowerCase() === "support@sanctuaryos.gg") {
    return "support@sanctuaryos.net";
  }
  return clean;
}

export function normalizeLegacySenderName(
  raw?: string | null,
  fallback = "Sanctuary OS"
): string {
  const clean = String(raw || "").trim();
  if (!clean || /^(sanctuary\s+os\s+keepers\s+core|keepers\s+core)$/i.test(clean)) {
    return fallback;
  }
  return clean;
}

import { getReleaseBaseUrl } from "../../supabase";

const _defaultRelBase = getReleaseBaseUrl();

export const DEFAULT_KEEPERS_PIPELINE_CONFIG: KeepersPipelineConfig = {
  keepers_donation_url: "https://donate.stripe.com/bJe8wH95gVfuo2Nv08g03",
  keepers_payment_processor: "STRIPE",
  support_contact_email: "support@sanctuaryos.net",
  support_sender_name: "Sanctuary OS",
  support_reply_to_email: "support@sanctuaryos.net",
  support_email_provider: "RESEND",
  stable_version: "0.5.8",
  dev_build_version: "0.5.8-dev.1",
  dev_build_endpoint: _defaultRelBase ? `${_defaultRelBase}/download/dev-latest/latest.json` : "",
  dev_build_download_url: _defaultRelBase ? `${_defaultRelBase}/tag/dev-latest` : "",
  dev_build_dmg_url: _defaultRelBase ? `${_defaultRelBase}/tag/dev-latest` : "",
  dev_build_linux_url: _defaultRelBase ? `${_defaultRelBase}/tag/dev-latest` : "",
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

export const INSTALLED_BUILD_META_KEY = "sanctuary_installed_build_meta_v1";
export const PENDING_CHANNEL_SWITCH_KEY = "sanctuary_pending_channel_switch_v1";

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


export interface DevBuildClearanceResult {
  isDevBinary: boolean;
  isAuthorized: boolean;
  reason?: "ok" | "unauthenticated" | "expired";
  devBuildUntil?: number;
  stableVersion?: string;
  stableDownloadUrl?: string;
  appVersion?: string;
}

