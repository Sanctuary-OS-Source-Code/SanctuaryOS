import React, { useState, useEffect, useMemo, useCallback, startTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  EmptyState,
  HoverTooltip,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
  compareVersions,
  isVersionMatch,
  getHighestVersion,
  cleanSearchName,
  getModFallbackUrl,
  getModIcon,
  formatDisplayName,
  isScriptExtension,
  openModDossier,
  stripPriorityTierPrefix,
  deduplicateBlueprintArtifacts,
} from "../shared";
import { UniversalCard } from "./universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../chameleon-components/ThemeCard";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenSectionHeading,
  CommandScreenQuickLink,
  CommandScreenMetricTile,
} from "../hub-components/SharedCommandScreenLayout";
import {
  evaluateModIssues,
  resolveActiveBlueprintMods,
  resolveBlueprintConflicts,
  normalizeModGroupTitle,
  extractValidCreator,
  isKnownCreatorName,
  getCachedVaultGroupLookups,
  formatAddonModuleName,
  formatCleanModTitle,
  type MissingDepTarget,
  type StackedModIssue,
} from "../side-panels/CommandIncompatiblePanel";

export interface LiquidGlassAlertCardProps {
  icon: string;
  accentVar?: string;
  iconColorClass?: string;
  badgeIcon?: string;
  badgeLabel: string;
  overline: string;
  title: string;
  description: string;
  isAlertCard?: boolean;
  actionLabel?: string;
  actionIcon?: string;
  actionVariant?: "glass" | "accent" | "warning" | "danger" | "success";
  onAction?: () => void;
  ignoreLabel?: string;
  ignoreIcon?: string;
  onIgnore?: () => void;
  secondaryActionIcon?: string;
  secondaryActionTooltip?: string;
  onSecondaryAction?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function LiquidGlassAlertCard({
  icon,
  accentVar = "var(--accent)",
  iconColorClass = "text-[var(--accent)]",
  badgeIcon,
  badgeLabel,
  overline,
  title,
  description,
  isAlertCard = false,
  actionLabel,
  actionIcon,
  actionVariant = "glass",
  onAction,
  ignoreLabel,
  ignoreIcon,
  onIgnore,
  secondaryActionIcon,
  secondaryActionTooltip,
  onSecondaryAction,
  onClick,
  children,
}: LiquidGlassAlertCardProps) {
  const { t } = useLexicon();

  const actionIconColorClass =
    actionVariant === "danger"
      ? "[&_span.material-symbols-outlined]:!text-[var(--danger)]"
      : actionVariant === "warning"
        ? "[&_span.material-symbols-outlined]:!text-[var(--warning)]"
        : actionVariant === "success"
          ? "[&_span.material-symbols-outlined]:!text-[var(--success)]"
          : "[&_span.material-symbols-outlined]:!text-[var(--accent)]";

  return (
    <div
      onClick={onClick}
          }`}
      style={
        isAlertCard
          ? {
              backgroundColor: `color-mix(in srgb, ${ accentVar } 5 %, transparent)`,
              borderTopColor: `color - mix(in srgb, ${ accentVar } 38 %, rgba(255, 255, 255, 0.14))`,
              borderLeftColor: `color - mix(in srgb, ${ accentVar } 26 %, rgba(255, 255, 255, 0.1))`,
              borderRightColor: `color - mix(in srgb, ${ accentVar } 20 %, rgba(255, 255, 255, 0.07))`,
              borderBottomColor: `color - mix(in srgb, ${ accentVar } 22 %, rgba(255, 255, 255, 0.08))`,
            }
          : {
              backgroundColor: `color - mix(in srgb, ${ accentVar } 4 %, transparent)`,
              borderColor: `color - mix(in srgb, ${ accentVar } 20 %, transparent)`,
            }
      }
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: isAlertCard
            ? `radial - gradient(115 % 85 % at 0 % 0 %, color - mix(in srgb, ${ accentVar } 12 %, transparent) 0 %, color - mix(in srgb, ${ accentVar } 4 %, transparent) 44 %, transparent 74 %), radial - gradient(circle at 90 % 12 %, color - mix(in srgb, ${ accentVar } 10 %, transparent) 0 %, transparent 56 %)`
            : `radial - gradient(circle at 88 % 12 %, color - mix(in srgb, ${ accentVar } 14 %, transparent) 0 %, transparent 62 %)`,
        }}
      />
      <span
        className={`material - symbols - outlined absolute - right - 3 - bottom - 4!text - [84px] ${ iconColorClass } ${
    isAlertCard ? "opacity-[0.055]" : "opacity-[0.04]"
  } pointer - events - none select - none rotate - [-10deg]`}
      >
        {icon}
      </span>

      <div className="flex items-center justify-between gap-3 relative z-10">
        <div
          className={`w - 11 h - 11 rounded - xl glass - surface border border - [var(--glass - card - icon - border, rgba(255, 255, 255, 0.22))]bg - [var(--glass - card - icon - bg, rgba(255, 255, 255, 0.08))]shadow - [var(--glass - card - icon - shadow)] ${ iconColorClass } flex items - center justify - center shrink - 0 relative overflow - hidden`}
          style={
            isAlertCard
              ? {
                  borderColor: `color - mix(in srgb, ${ accentVar } 42 %, rgba(255, 255, 255, 0.2))`,
                }
              : undefined
          }
        >
          {isAlertCard && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: `radial - gradient(circle at 50 % 0 %, color - mix(in srgb, ${ accentVar } 20 %, transparent) 0 %, transparent 75 %)`,
              }}
            />
          )}
          <span className="material-symbols-outlined !text-[22px] relative z-10">
            {icon}
          </span>
        </div>
        <span className={VAULT_CHIP_CLASS}>
          <span
            className={`material - symbols - outlined!text - [12px] shrink - 0 ${ iconColorClass } `}
          >
            {badgeIcon || icon}
          </span>
          <span>{badgeLabel}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1 relative z-10">
        <span
          className={`text - [10px] font - mono font - black uppercase tracking - [0.14em] ${ iconColorClass } leading - snug`}
        >
          {overline}
        </span>
        <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
          {title}
        </h3>
      </div>

      <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
        {description}
      </p>

      {children && <div className="relative z-10">{children}</div>}

      {actionLabel && onAction && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`pt - 3.5 mt - auto border - t border - [color - mix(in_srgb,var(--text)_8 %, transparent)] relative z - 10 w - full ${
    onIgnore
      ? "grid grid-cols-2 gap-2.5"
      : "flex items-center gap-2.5"
  } `}
        >
          {onIgnore ? (
            <>
              <ActionButton
                variant="glass"
                icon={ignoreIcon || t("icon_visibility_off", "visibility_off")}
                label={ignoreLabel || t("btn_ignore", "Ignore")}
                onClick={onIgnore}
                className="w-full !px-3 !py-2.5 opacity-75 hover:opacity-100 [&_span.material-symbols-outlined]:!text-[var(--subtext)] hover:[&_span.material-symbols-outlined]:!text-[var(--text)]"
              />
              <ActionButton
                variant={actionVariant}
                variant="glass"
                icon={actionIcon}
                label={actionLabel}
                onClick={onAction}
                className="w-full !px-3 !py-2.5"
                className={`w - full!px - 3!py - 2.5 ${ actionIconColorClass } `}
              />
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <ActionButton
                  variant={actionVariant}
                  variant="glass"
                  icon={actionIcon}
                  label={actionLabel}
                  onClick={onAction}
                  className="w-full !px-4 !py-2.5"
                  className={`w - full!px - 4!py - 2.5 ${ actionIconColorClass } `}
                />
              </div>
              {secondaryActionIcon && onSecondaryAction && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[17px]">
                    {secondaryActionIcon}
                  </span>
                  {secondaryActionTooltip && (
                    <HoverTooltip title={secondaryActionTooltip} />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export type PatchModBucket = "blocking" | "update_ready" | "ready";

export type PatchPanelSubFilter =
  | "all"
  | "direct_update"
  | "dep_update"
  | "auto_swap"
  | "awaiting_mason"
  | "missing_dep"
  | "missing_dlc"
  | "corrupted";

export interface PendingBlueprintsNavigation {
  tab: string;
  inspectBlueprintName?: string | null;
  initialBucket?: PatchModBucket | null;
  initialSubFilter?: PatchPanelSubFilter | null;
}

let pendingBlueprintsNavigationState: PendingBlueprintsNavigation | null = null;
const BLUEPRINTS_NAV_SESSION_KEY = "sanctuary_blueprints_pending_nav";
const BLUEPRINTS_TAB_LEGACY_KEY = "sanctuary_blueprints_tab";

export function navigateToBlueprintsTab(
  tab: string,
  opts?: {
    setView?: ((view: string) => void) | null;
    inspectBlueprintName?: string | null;
    initialBucket?: PatchModBucket | null;
    initialSubFilter?: PatchPanelSubFilter | null;
  }
) {
  const payload: PendingBlueprintsNavigation = {
    tab,
    inspectBlueprintName: opts?.inspectBlueprintName ?? null,
    initialBucket: opts?.initialBucket ?? null,
    initialSubFilter: opts?.initialSubFilter ?? null,
  };
  pendingBlueprintsNavigationState = payload;

  try {
    sessionStorage.setItem(BLUEPRINTS_NAV_SESSION_KEY, JSON.stringify(payload));
  } catch {}
  try {
    localStorage.setItem(BLUEPRINTS_TAB_LEGACY_KEY, tab);
  } catch {}

  if (opts?.setView) {
    startTransition(() => {
      opts.setView!("playsets");
    });
  }

  if (typeof window !== "undefined") {
    const dispatchNav = () => {
      window.dispatchEvent(
        new CustomEvent("sanctuary-navigate-blueprints", {
          detail: payload,
        })
      );
    };
    dispatchNav();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => dispatchNav());
    }
  }
}

export function peekPendingBlueprintsNavigation(): PendingBlueprintsNavigation | null {
  if (pendingBlueprintsNavigationState) {
    return pendingBlueprintsNavigationState;
  }
  try {
    const rawSession = sessionStorage.getItem(BLUEPRINTS_NAV_SESSION_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed && typeof parsed.tab === "string" && parsed.tab) {
        return parsed as PendingBlueprintsNavigation;
      }
    }
  } catch {}
  try {
    const legacyTab = localStorage.getItem(BLUEPRINTS_TAB_LEGACY_KEY);
    if (legacyTab) {
      return { tab: legacyTab };
    }
  } catch {}
  return null;
}

export function consumePendingBlueprintsNavigation(): PendingBlueprintsNavigation | null {
  const nav = peekPendingBlueprintsNavigation();
  pendingBlueprintsNavigationState = null;
  try {
    sessionStorage.removeItem(BLUEPRINTS_NAV_SESSION_KEY);
  } catch {}
  try {
    localStorage.removeItem(BLUEPRINTS_TAB_LEGACY_KEY);
  } catch {}
  return nav;
}

export type PatchModIssueKind =
  | "version"
  | "dependency"
  | "dlc"
  | "conflict"
  | "corrupted";

export interface PatchEvaluatedMod {
  key: string;
  suiteKey?: string;
  title: string;
  author: string | null;
  icon: string;
  isScript: boolean;
  isCollectionFolder?: boolean;
  moduleCount: number;
  installedVersion: string | null;
  targetModVersion: string | null;
  compatibleVersions: string[];
  bucket: PatchModBucket;
  source:
    | "vault_active"
    | "vault_archive"
    | "cloud_update"
    | "dep_update_pending"
    | "awaiting_patch";
  issueKind?: PatchModIssueKind;
  reasonLabel: string;
  downloadUrl: string | null;
  rawMod: any;
  groupedMods: any[];
  memberEvaluations?: PatchEvaluatedMod[];
  issues?: StackedModIssue[];
  missingDepTargets?: MissingDepTarget[];
  blueprintName?: string;
}

export interface BlueprintPatchReport {
  blueprintName: string;
  isEquipped: boolean;
  isPinned: boolean;
  blueprintObj: any;
  totalMods: number;
  blockingMods: PatchEvaluatedMod[];
  updatableMods: PatchEvaluatedMod[];
  directUpdateMods: PatchEvaluatedMod[];
  depUpdateMods: PatchEvaluatedMod[];
  autoSwapMods: PatchEvaluatedMod[];
  readyMods: PatchEvaluatedMod[];
  archiveSwapReadyCount: number;
  readinessPercent: number;
  verdict: "safe" | "updates_ready" | "hold" | "empty";
}

interface WorkspacePatchCacheEntry {
  gameVersions: string[];
  lastVersionsFetch: number;
  cloudModVersions: Map<string, any[]>;
  fetchedModIds: Set<string>;
  lastCloudFetch: number;
  lastReportsCache?: {
    playSets: any;
    activeSetName: string | null;
    pinnedKey: string;
    modList: any;
    activeGameSchema: any;
    networkUpdates: any;
    targetVersion: string;
    ownedDLC: any;
    maskedDLC: any;
    poolItems: any;
    versionRelation: string;
    isPatchDetected: boolean;
    defconLevel: number;
    cloudTick: number;
    t: any;
    result: BlueprintPatchReport[];
  };
}

const patchSimulatorCache = new Map<string, WorkspacePatchCacheEntry>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAWER_PAGE_SIZE = 40;

function getOrCreateWorkspaceCache(wsId: string): WorkspacePatchCacheEntry {
  const key = wsId || "default";
  let entry = patchSimulatorCache.get(key);
  if (!entry) {
    entry = {
      gameVersions: [],
      lastVersionsFetch: 0,
      cloudModVersions: new Map<string, any[]>(),
      fetchedModIds: new Set<string>(),
      lastCloudFetch: 0,
    };
    patchSimulatorCache.set(key, entry);
  }
  return entry;
}

function parseCompatArray(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function unwrapDropdownValue(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val ?? "");
}

function cleanVersionLabel(ver: any): string {
  return unwrapDropdownValue(ver)
    .trim()
    .replace(/^v\.?/i, "");
}

function isWildcardVersion(ver: any): boolean {
  const s = cleanVersionLabel(ver).toLowerCase();
  return (
    !s ||
    s === "all" ||
    s === "any" ||
    s === "*" ||
    s === "unknown" ||
    s === "vlocal" ||
    s === "local" ||
    s === "auto"
  );
}

function formatDisplayVersion(ver: any, fallbackLabel: string): string {
  const clean = cleanVersionLabel(ver);
  if (!clean || isWildcardVersion(clean)) return fallbackLabel;
  return /^\d/.test(clean) ? `v${ clean } ` : clean;
}

function formatGameVersionChipLabel(
  compatVersions: string[],
  anyFallback: string
): string {
  const explicit = (compatVersions || []).filter((v) => !isWildcardVersion(v));
  if (explicit.length > 0) {
    const highest = cleanVersionLabel(getHighestVersion(explicit));
    if (highest && !isWildcardVersion(highest)) {
      return /^\d/.test(highest) ? `v${ highest } ` : highest;
    }
  }
  return anyFallback;
}

function toCompactAlnum(val: string): string {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildActiveDependencyIndex(pool: any[]) {
  const dbIds = new Set<string>();
  const hashes = new Set<string>();
  const modEntries: Array<{
    mod: any;
    tokens: string[];
    compactTokens: string[];
  }> = [];

  for (let i = 0; i < pool.length; i++) {
    const m = pool[i];
    if (!m || m.isFallback) continue;
    const rawDb = String(m.dbId || "").split("@")[0].trim().toLowerCase();
    if (rawDb && rawDb !== "null" && rawDb !== "undefined") {
      dbIds.add(rawDb);
    }
    if (Array.isArray(m.interchangeableIds)) {
      for (const altId of m.interchangeableIds) {
        const cleanAlt = String(altId || "").split("@")[0].trim().toLowerCase();
        if (cleanAlt) dbIds.add(cleanAlt);
      }
    }
    const rawHash = String(m.hash || "").trim().toLowerCase();
    if (rawHash && rawHash !== "vlocal") {
      hashes.add(rawHash);
    }
    const formattedDisp = formatDisplayName(
      m.displayName || m.meta_name || m.name || ""
    )
      .trim()
      .toLowerCase();
    const tokens = [
      String(m._originalSetName || "").toLowerCase(),
      String(m.name || "").toLowerCase(),
      String(m.displayName || "").toLowerCase(),
      formattedDisp,
      rawDb,
      rawHash,
    ].filter(Boolean);
    const compactTokens = Array.from(
      new Set(
        [
          toCompactAlnum(String(m._originalSetName || "")),
          toCompactAlnum(String(m.name || "")),
          toCompactAlnum(String(m.displayName || "")),
          toCompactAlnum(formattedDisp),
        ].filter((ct) => ct.length >= 5)
      )
    );
    modEntries.push({ mod: m, tokens, compactTokens });
  }

  return { dbIds, hashes, modEntries };
}

function registerSuiteInTitleLookup(
  entryTitle: string,
  members: any[],
  map: Map<string, string>
) {
  if (!entryTitle) return;
  map.set(entryTitle.toLowerCase(), entryTitle);
  const compTitle = toCompactAlnum(entryTitle);
  if (compTitle.length >= 5) map.set(compTitle, entryTitle);
  for (const gm of members) {
    if (!gm) continue;
    const db = String(gm.dbId || "").split("@")[0].trim().toLowerCase();
    if (db && db !== "null" && db !== "undefined") map.set(db, entryTitle);
    const h = String(gm.hash || "").trim().toLowerCase();
    if (h && h !== "vlocal") map.set(h, entryTitle);
    const disp = String(gm.displayName || "").trim().toLowerCase();
    if (disp) map.set(disp, entryTitle);
    const nm = String(gm.name || "").trim().toLowerCase();
    if (nm) map.set(nm, entryTitle);
  }
}

function findUnsatisfiedSuiteDependency(
  members: any[],
  poolIndex: ReturnType<typeof buildActiveDependencyIndex>,
  knownTitleByKey: Map<string, string>,
  activeGameSchema?: any,
  siblingGroupSet?: Set<any>
): string | null {
  const selfSet = siblingGroupSet || new Set(members);

  for (const gm of members) {
    const rawDeps = gm?.dependencies ?? gm?.requirements;
    if (!rawDeps) continue;
    const depList = Array.isArray(rawDeps)
      ? rawDeps
      : typeof rawDeps === "string"
        ? rawDeps
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    for (const d of depList) {
      if (!d) continue;
      const depId =
        typeof d === "object" && d.id
          ? String(d.id).split("@")[0].trim().toLowerCase()
          : "";
      const depHash =
        typeof d === "object" && d.hash
          ? String(d.hash).trim().toLowerCase()
          : "";
      const depNameRaw =
        typeof d === "string"
          ? d.trim()
          : String(d.name || d.title || d.id || "").trim();
      const depLower = depNameRaw.toLowerCase();
      const depCompact = toCompactAlnum(depNameRaw);

      if (
        !depLower ||
        depLower.includes("object object") ||
        depLower.includes("[object")
      ) {
        continue;
      }

      let satisfied = false;

      if (depId && UUID_RE.test(depId) && poolIndex.dbIds.has(depId)) {
        satisfied = poolIndex.modEntries.some(
          (entry) =>
            !selfSet.has(entry.mod) &&
            (String(entry.mod.dbId || "").split("@")[0].trim().toLowerCase() ===
              depId ||
              (Array.isArray(entry.mod.interchangeableIds) &&
                entry.mod.interchangeableIds.some(
                  (aid: any) =>
                    String(aid || "").split("@")[0].trim().toLowerCase() === depId
                )))
        );
      }

      if (
        !satisfied &&
        depHash &&
        depHash !== "vlocal" &&
        poolIndex.hashes.has(depHash)
      ) {
        satisfied = poolIndex.modEntries.some(
          (entry) =>
            !selfSet.has(entry.mod) &&
            String(entry.mod.hash || "").trim().toLowerCase() === depHash
        );
      }

      if (!satisfied) {
        satisfied = poolIndex.modEntries.some(
          (entry) =>
            !selfSet.has(entry.mod) &&
            (entry.tokens.some(
              (tok) =>
                tok === depLower ||
                (depLower.length >= 4 && tok.includes(depLower)) ||
                (tok.length >= 4 && depLower.includes(tok))
            ) ||
              (depCompact.length >= 5 &&
                entry.compactTokens.some(
                  (ct) =>
                    ct === depCompact ||
                    ct.includes(depCompact) ||
                    depCompact.includes(ct)
                )))
        );
      }

      if (!satisfied) {
        const knownLabel =
          (depId && knownTitleByKey.get(depId)) ||
          (depHash && knownTitleByKey.get(depHash)) ||
          knownTitleByKey.get(depLower) ||
          (depCompact.length >= 5 ? knownTitleByKey.get(depCompact) : undefined);
        if (knownLabel) return knownLabel;
        const cleaned =
          cleanSearchName(depNameRaw, activeGameSchema) ||
          formatDisplayName(depNameRaw);
        return formatCleanModTitle(cleaned) || cleaned;
      }
    }
  }

  return null;
}

export function openPatchModUrl(url: string) {
  if (!url) return;
  const modalState = useModalStore.getState();
  if (isDesktop() && modalState.useInternalBrowser) {
    modalState.setSideBrowserUrl(url);
    modalState.setIsSideBrowserOpen(true);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function buildPatchGuidedUpdateQueue(
  mods: PatchEvaluatedMod[],
  activeGameSchema: any
) {
  if (!Array.isArray(mods) || mods.length === 0) return [];
  const seenTargets = new Set<string>();
  const seenSuites = new Set<string>();
  const out: any[] = [];

  for (let idx = 0; idx < mods.length; idx++) {
    const m = mods[idx];
    if (m.source !== "cloud_update") continue;
    const nonTrivialSuite =
      m.suiteKey && !m.suiteKey.startsWith("art:")
        ? m.suiteKey.toLowerCase()
        : "";
    if (nonTrivialSuite && seenSuites.has(nonTrivialSuite)) continue;

    const fallbackUrl =
      m.downloadUrl ||
      getModFallbackUrl(m.title, m.rawMod?.hash, activeGameSchema, {
        url: m.rawMod?.download_url || m.rawMod?.url,
      }) ||
      `https://www.google.com/search?q=${encodeURIComponent(
  activeGameSchema?.display_name || "Game"
      )
} +${ encodeURIComponent(cleanSearchName(m.title, activeGameSchema)) } `;
    const dedupeKey = String(fallbackUrl || m.suiteKey || m.key).toLowerCase();
    if (seenTargets.has(dedupeKey)) continue;
    seenTargets.add(dedupeKey);
    if (nonTrivialSuite) seenSuites.add(nonTrivialSuite);

    out.push({
      id: `${ m.key }_${ idx } `,
      name: m.title,
      author: m.author || undefined,
      url: fallbackUrl,
      hash: m.rawMod?.hash,
      installedVersion: m.installedVersion || undefined,
      version: m.targetModVersion || undefined,
      icon: m.icon,
      moduleCount: m.moduleCount,
      status: "pending" as const,
    });
  }

  return out;
}

export function launchPatchGuidedUpdates(mods: PatchEvaluatedMod[], activeGameSchema: any) {
  const queueItems = buildPatchGuidedUpdateQueue(mods, activeGameSchema);
  if (queueItems.length === 0) return;
  if (isDesktop() && useModalStore.getState().useInternalBrowser) {
    useModalStore.getState().startGuidedBrowserQueue(queueItems);
    useModalStore.getState().setIsSideBrowserOpen(true);
  } else if (queueItems[0]?.url) {
    openPatchModUrl(queueItems[0].url);
  }
}

export function useBlueprintPatchReadiness(opts?: {
  pinnedBlueprintNames?: string[];
  skip?: boolean;
}) {
  const skip = Boolean(opts?.skip);
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const workspaces = useStore((s) => s.workspaces);
  const playSets = useStore((s) => s.playSets);
  const activeSetName = useStore((s) => s.activeSetName);
  const modList = useStore((s) => s.modList);
  const selectedVersion = useStore((s) => s.selectedVersion);
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const networkUpdates = useStore((s) => s.networkUpdates);
  const ownedDLC = useStore((s) => s.ownedDLC);
  const maskedDLC = useStore((s) => s.maskedDLC);
  const backupList = useStore((s) => s.backupList);
  const shelterActive = useStore((s) => s.shelterActive);
  const defconLevel = useStore((s) => s.defconLevel);
  const isPatchDetected = useStore((s) => s.isPatchDetected);
  const vaultPath = useStore((s) => s.vaultPath);

  const wsKey = activeWorkspaceId || "default";
  const storageKey = `sanctuary_${ wsKey } _sim_patch_ver`;

  const [officialVersions, setOfficialVersions] = useState<string[]>(() => {
    return getOrCreateWorkspaceCache(wsKey).gameVersions;
  });
  const [cloudTick, setCloudTick] = useState(0);
  const [poolItems, setPoolItems] = useState<any[]>([]);
  const [userTargetVersion, setUserTargetVersionState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (skip) return;
    try {
      setUserTargetVersionState(sessionStorage.getItem(storageKey) || "");
    } catch {
      setUserTargetVersionState("");
    }
    setOfficialVersions(getOrCreateWorkspaceCache(wsKey).gameVersions);
  }, [wsKey, storageKey, skip]);

  useEffect(() => {
    if (skip || typeof window === "undefined") return;
    const onSimVersionChange = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail && detail.storageKey === storageKey) {
        setUserTargetVersionState(String(detail.version || ""));
      }
    };
    window.addEventListener("sa-patch-sim-version-change", onSimVersionChange);
    return () =>
      window.removeEventListener("sa-patch-sim-version-change", onSimVersionChange);
  }, [storageKey, skip]);

  const setTargetVersion = useCallback(
    (ver: unknown) => {
      const clean = cleanVersionLabel(ver);
      setUserTargetVersionState(clean);
      try {
        if (clean) sessionStorage.setItem(storageKey, clean);
        else sessionStorage.removeItem(storageKey);
      } catch {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sa-patch-sim-version-change", {
            detail: { storageKey, version: clean },
          })
        );
      }
    },
    [storageKey]
  );

  // 1. Fetch official game versions from Spoke DB
  useEffect(() => {
    if (
      skip ||
      activeWorkspaceId === "default_workspace" ||
      !workspaces ||
      workspaces.length === 0 ||
      !navigator.onLine ||
      localStorage.getItem("sanctuary_local_only") === "true"
    ) {
      return;
    }
    const cache = getOrCreateWorkspaceCache(wsKey);
    if (
      cache.gameVersions.length > 0 &&
      Date.now() - cache.lastVersionsFetch < 60_000
    ) {
      setOfficialVersions(cache.gameVersions);
      return;
    }

    let cancelled = false;
    supabase
      .from("game_versions")
      .select("version, release_date")
      .order("release_date", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const list = data
          .map((d: any) => cleanVersionLabel(d.version))
          .filter((v: string) => Boolean(v) && !isWildcardVersion(v));
        cache.gameVersions = list;
        cache.lastVersionsFetch = Date.now();
        setOfficialVersions(list);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, workspaces, wsKey, skip]);

  // 2. Fetch local Mod Version Archive pool on Desktop
  useEffect(() => {
    if (skip || !isDesktop()) return;
    let cancelled = false;
    (async () => {
      try {
        let resolvedVaultPath = vaultPath;
        if (!resolvedVaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          resolvedVaultPath = cfg?.vault_path || "";
        }
        if (!resolvedVaultPath || cancelled) return;
        const res: any = await invoke("get_mod_version_pool_status", {
          vaultPath: resolvedVaultPath,
        });
        if (!cancelled && Array.isArray(res?.items)) {
          setPoolItems(res.items);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, modList?.length, skip]);

  // 3. Fetch cloud mod_versions + parent mods.compatible_versions across the Vault
  useEffect(() => {
    if (
      skip ||
      activeWorkspaceId === "default_workspace" ||
      !workspaces ||
      workspaces.length === 0 ||
      !navigator.onLine ||
      localStorage.getItem("sanctuary_local_only") === "true" ||
      !Array.isArray(modList) ||
      modList.length === 0
    ) {
      return;
    }

    const cache = getOrCreateWorkspaceCache(wsKey);
    const neededModIds: string[] = [];
    const collectId = (raw: any) => {
      const rawId = String(raw || "").split("@")[0].trim();
      if (UUID_RE.test(rawId) && !cache.fetchedModIds.has(rawId)) {
        neededModIds.push(rawId);
      }
    };

    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      collectId(m?.dbId);
      if (Array.isArray(m?.flavors)) {
        for (let j = 0; j < m.flavors.length; j++) {
          collectId(m.flavors[j]?.dbId);
        }
      }
    }

    const uniqueIds = Array.from(new Set(neededModIds));
    if (uniqueIds.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const CHUNK_SIZE = 200;
        for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
          if (cancelled) return;
          const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
          chunk.forEach((id) => cache.fetchedModIds.add(id));
          const { data, error } = await supabase
            .from("mod_versions")
            .select(
              "id, dna_hash, mod_id, version_label, game_version, download_url, mods(id, name, status, compliance_tier, latest_version, compatible_versions, url)"
            )
            .in("mod_id", chunk);
          if (error) {
            chunk.forEach((id) => cache.fetchedModIds.delete(id));
            continue;
          }
          if (cancelled) return;
          if (Array.isArray(data)) {
            for (const row of data) {
              const mid = String(row.mod_id || "");
              if (!mid) continue;
              const arr = cache.cloudModVersions.get(mid) || [];
              const rowKey = String(row.id || row.dna_hash || "");
              if (
                !rowKey ||
                !arr.some((existing) => String(existing.id || existing.dna_hash || "") === rowKey)
              ) {
                arr.push(row);
                cache.cloudModVersions.set(mid, arr);
              }
            }
          }
        }
        cache.lastCloudFetch = Date.now();
        if (!cancelled) setCloudTick((c) => c + 1);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, workspaces, modList, wsKey, skip]);

  const availableVersions = useMemo(() => {
    if (skip) return [];
    const set = new Set<string>();
    const addVer = (raw: any) => {
      if (!raw) return;
      const parts = String(raw)
        .split(/,|\s+-\s+|\.\./)
        .map((p) => cleanVersionLabel(p))
        .filter(Boolean);
      for (const clean of parts) {
        if (!isWildcardVersion(clean) && /^\d/.test(clean)) {
          set.add(clean);
        }
      }
    };

    officialVersions.forEach(addVer);
    addVer(selectedVersion);

    if (Array.isArray(networkUpdates?.updated)) {
      networkUpdates.updated.forEach((u: any) => addVer(u?.newGameVersion));
    }
    if (Array.isArray(backupList)) {
      backupList.forEach((b: any) =>
        addVer(b?.gameVersion || b?.game_version || b?.version)
      );
    }
    if (Array.isArray(modList)) {
      for (let i = 0; i < Math.min(modList.length, 600); i++) {
        parseCompatArray(modList[i]?.compatible_versions).forEach(addVer);
      }
    }

    const cache = getOrCreateWorkspaceCache(wsKey);
    cache.cloudModVersions.forEach((rows) => {
      for (const r of rows) {
        addVer(r?.game_version);
        const pm = Array.isArray(r?.mods) ? r.mods[0] : r?.mods;
        parseCompatArray(pm?.compatible_versions).forEach(addVer);
      }
    });

    return Array.from(set).sort((a, b) => compareVersions(b, a));
  }, [
    skip,
    officialVersions,
    selectedVersion,
    networkUpdates,
    backupList,
    modList,
    wsKey,
    cloudTick,
  ]);

  const cleanCurrentVersion = useMemo(
    () => cleanVersionLabel(selectedVersion),
    [selectedVersion]
  );

  const latestKnownVersion = availableVersions[0] || cleanCurrentVersion || "";

  const isUpdateBehindLatest = useMemo(() => {
    if (!latestKnownVersion || !cleanCurrentVersion) return false;
    return compareVersions(latestKnownVersion, cleanCurrentVersion) > 0;
  }, [latestKnownVersion, cleanCurrentVersion]);

  const targetVersion = useMemo(() => {
    if (userTargetVersion && availableVersions.includes(userTargetVersion)) {
      return userTargetVersion;
    }
    if (userTargetVersion) return userTargetVersion;
    if (latestKnownVersion) return latestKnownVersion;
    return cleanCurrentVersion;
  }, [userTargetVersion, availableVersions, latestKnownVersion, cleanCurrentVersion]);

  const versionRelation = useMemo<"upgrade" | "rollback" | "current">(() => {
    if (!targetVersion || !cleanCurrentVersion) return "current";
    const cmp = compareVersions(targetVersion, cleanCurrentVersion);
    if (cmp > 0) return "upgrade";
    if (cmp < 0) return "rollback";
    return "current";
  }, [targetVersion, cleanCurrentVersion]);

  // Index local archived versions by normalized relative path
  const archivedByRelPath = useMemo(() => {
    if (skip) return new Map<string, any[]>();
    const map = new Map<string, any[]>();
    for (const item of poolItems) {
      if (!item?.rel_path) continue;
      const key = stripPriorityTierPrefix(String(item.rel_path), activeGameSchema)
        .toLowerCase()
        .replace(/\\/g, "/");
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [skip, poolItems, activeGameSchema]);

  const pinnedNames = useMemo(() => {
    if (Array.isArray(opts?.pinnedBlueprintNames)) return opts!.pinnedBlueprintNames;
    try {
      const raw = localStorage.getItem("myPinnedBlueprints");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [opts?.pinnedBlueprintNames]);

  const pinnedKey = useMemo(() => pinnedNames.join("|"), [pinnedNames]);

  const blueprintReports = useMemo<BlueprintPatchReport[]>(() => {
    if (skip || !Array.isArray(playSets) || playSets.length === 0) return [];
    const cache = getOrCreateWorkspaceCache(wsKey);
    const prev = cache.lastReportsCache;
    if (
      prev &&
      prev.playSets === playSets &&
      prev.activeSetName === activeSetName &&
      prev.pinnedKey === pinnedKey &&
      prev.modList === modList &&
      prev.activeGameSchema === activeGameSchema &&
      prev.networkUpdates === networkUpdates &&
      prev.targetVersion === targetVersion &&
      prev.ownedDLC === ownedDLC &&
      prev.maskedDLC === maskedDLC &&
      prev.poolItems === poolItems &&
      prev.versionRelation === versionRelation &&
      prev.isPatchDetected === isPatchDetected &&
      prev.defconLevel === defconLevel &&
      prev.cloudTick === cloudTick &&
      prev.t === t
    ) {
      return prev.result;
    }

    const collectionIds = new Set<string>();
    const globalKnownFamilyIds = new Set<string>();
    const vaultDepLookup = new Map<string, any>();

    if (Array.isArray(modList)) {
      for (let i = 0; i < modList.length; i++) {
        const vm = modList[i];
        if (vm?.isCollection && vm?.dbId) {
          collectionIds.add(String(vm.dbId).split("@")[0].trim());
        if (!vm) continue;
        const vmDbId = String(vm.dbId || "").split("@")[0].trim();
        if (vm.isCollection && vmDbId) {
          collectionIds.add(vmDbId);
        }
        const rawVmId = String(vm.id || "").trim();
        if (rawVmId.startsWith("virtual_")) {
          const vFam = rawVmId.replace(/^virtual_/, "").trim();
          if (vFam && !collectionIds.has(vFam)) globalKnownFamilyIds.add(vFam);
        }
        const vmFam = String(vm.baseFamilyId || vm.familyId || "")
          .split("@")[0]
          .trim();
        if (
          vmFam &&
          vmFam !== "null" &&
          vmFam !== "undefined" &&
          !vmFam.startsWith("local_") &&
          !vm.isCollection &&
          !collectionIds.has(vmFam)
        ) {
          globalKnownFamilyIds.add(vmFam);
        }
        if (!vm.isVirtual && !vm.isCollection && vm.name) {
          const disp = formatCleanModTitle(
            formatDisplayName(vm.displayName || vm.meta_name || vm.name || "")
          )
            .toLowerCase()
            .trim();
          const normDisp = normalizeModGroupTitle(disp).toLowerCase().trim();
          const searchBase = cleanSearchName(vm.name, activeGameSchema)
            .toLowerCase()
            .trim();
          const isRootCore =
            String(vm.relationshipType || "").toLowerCase() === "core" ||
            (vmDbId && !vmFam);
          if (disp && (!vaultDepLookup.has(disp) || isRootCore)) {
            vaultDepLookup.set(disp, vm);
          }
          if (normDisp && (!vaultDepLookup.has(normDisp) || isRootCore)) {
            vaultDepLookup.set(normDisp, vm);
          }
          if (searchBase && (!vaultDepLookup.has(searchBase) || isRootCore)) {
            vaultDepLookup.set(searchBase, vm);
          }
        }
      }
    }

    const resolveMissingDepTarget = (depLabel: string): MissingDepTarget => {
      const cleanDep = formatCleanModTitle(depLabel) || depLabel;
      const lower = cleanDep.toLowerCase().trim();
      const norm = normalizeModGroupTitle(cleanDep).toLowerCase().trim();
      const matchedVm =
        vaultDepLookup.get(lower) || vaultDepLookup.get(norm) || null;
      const depUrl =
        matchedVm?.download_url ||
        matchedVm?.url ||
        getModFallbackUrl(cleanDep, matchedVm?.hash, activeGameSchema, {
          url: matchedVm?.download_url || matchedVm?.url,
        });
      let sourceHost = "";
      try {
        const host = new URL(depUrl).hostname.replace(/^www\./i, "");
        if (
          host &&
          !host.includes("google.") &&
          !host.includes("bing.") &&
          !host.includes("duckduckgo.")
        ) {
          sourceHost = host;
        }
      } catch {
        sourceHost = "";
      }
      return {
        name: cleanDep,
        url: depUrl,
        sourceHost,
        vaultModName: matchedVm?.name || undefined,
      };
    };

    const computedReports: BlueprintPatchReport[] = playSets.map((ps: any) => {
      const isEquipped = ps.name === activeSetName;
      const isPinned = pinnedNames.includes(ps.name);
      const resolvedMods = resolveActiveBlueprintMods(
        ps.mods,
        modList,
        activeGameSchema,
        networkUpdates
      );

      const bpKnownFamilyIds = new Set<string>(globalKnownFamilyIds);
      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const rm = resolvedMods[idx];
        if (!rm || rm.isFallback || rm.isCollection) continue;
        const fRaw = String(rm.baseFamilyId || rm.familyId || "")
          .split("@")[0]
          .trim();
        if (
          fRaw &&
          fRaw !== "null" &&
          fRaw !== "undefined" &&
          !fRaw.startsWith("local_") &&
          !collectionIds.has(fRaw)
        ) {
          bpKnownFamilyIds.add(fRaw);
        }
      }

      // Detect atomic script/module twin pairs & script-bearing non-collection suites without collapsing 1-to-1 artifact counts
      const famBuckets = new Map<
        string,
        { indices: number[]; hasAtomicCoupling: boolean }
      >();
      const twinBuckets = new Map<
        string,
        { indices: number[]; hasScript: boolean; creators: Set<string> }
      >();

      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const m = resolvedMods[idx];
        if (!m || m.isFallback) continue;
        const modIsScript = isScriptExtension(
          String(m.name || m._originalSetName || ""),
          activeGameSchema
        );
        const relType = String(m.relationshipType || "").toLowerCase();
        const famRaw = String(m.baseFamilyId || m.familyId || "")
        const explicitFamRaw = String(m.baseFamilyId || m.familyId || "")
          .split("@")[0]
          .trim();
        const selfDbId = String(m.dbId || "").split("@")[0].trim();
        const famRaw =
          explicitFamRaw &&
          explicitFamRaw !== "null" &&
          explicitFamRaw !== "undefined"
            ? explicitFamRaw
            : selfDbId && bpKnownFamilyIds.has(selfDbId)
              ? selfDbId
              : "";
        if (
          famRaw &&
          famRaw !== "null" &&
          famRaw !== "undefined" &&
          !famRaw.startsWith("local_") &&
          !collectionIds.has(famRaw) &&
          !m.isCollection &&
          relType !== "set_item"
        ) {
          const fb = famBuckets.get(famRaw) || {
            indices: [],
            hasAtomicCoupling: false,
          };
          fb.indices.push(idx);
          if (
            modIsScript ||
            relType === "module" ||
            relType === "core" ||
            relType === "addon" ||
            relType === "script"
          ) {
            fb.hasAtomicCoupling = true;
          }
          famBuckets.set(famRaw, fb);
        }

        const cleanTitle = formatCleanModTitle(
          formatDisplayName(m.displayName || m.meta_name || m.name || "")
        );
        const twinNorm = normalizeModGroupTitle(cleanTitle).toLowerCase().trim();
        if (twinNorm.length >= 3) {
          const tb = twinBuckets.get(twinNorm) || {
            indices: [],
            hasScript: false,
            creators: new Set<string>(),
          };
          tb.indices.push(idx);
          if (modIsScript) tb.hasScript = true;
          const cr = (extractValidCreator(m) || "").toLowerCase();
          if (cr) tb.creators.add(cr);
          twinBuckets.set(twinNorm, tb);
        }
      }

      const suiteKeyByIndex = new Array<string>(resolvedMods.length);
      for (let idx = 0; idx < resolvedMods.length; idx++) {
        suiteKeyByIndex[idx] = `art:${ idx } `;
      }

      famBuckets.forEach((fb, famRaw) => {
        if (fb.indices.length > 1 && fb.hasAtomicCoupling) {
          for (const idx of fb.indices) {
            suiteKeyByIndex[idx] = `fam:${ famRaw } `;
          }
        }
      });

      twinBuckets.forEach((tb, twinNorm) => {
        if (tb.indices.length > 1 && tb.hasScript) {
          if (tb.creators.size <= 1) {
            for (const idx of tb.indices) {
              if (suiteKeyByIndex[idx].startsWith("art:")) {
                suiteKeyByIndex[idx] = `twin:${ twinNorm } `;
              }
            }
          } else {
            for (const idx of tb.indices) {
              const cr = (
                extractValidCreator(resolvedMods[idx]) || ""
              ).toLowerCase();
              if (cr && suiteKeyByIndex[idx].startsWith("art:")) {
                suiteKeyByIndex[idx] = `twin:${ cr }::${ twinNorm } `;
              }
            }
          }
        }
      });

      const allSuiteEntries: PatchEvaluatedMod[] = [];
      const knownTitleByKey = new Map<string, string>();
      const coupledSuites = new Map<string, PatchEvaluatedMod[]>();
      let archiveSwapReadyCount = 0;

      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const m = resolvedMods[idx];
        const sKey = suiteKeyByIndex[idx];
        const uniqueKey = `art:${ idx }:${
  String(
    m?._originalSetName || m?.name || idx
  )
} `;
        const rawTitle = formatDisplayName(
          m?.displayName || m?.meta_name || m?.name || ""
        );
        const title = formatCleanModTitle(rawTitle) || rawTitle;
        const isScript = isScriptExtension(
          String(m?.name || m?._originalSetName || ""),
          activeGameSchema
        );
        const icon = getModIcon(m, activeGameSchema, t);

        if (!m || m.isFallback) {
          const fallbackEntry: PatchEvaluatedMod = {
            key: uniqueKey,
            suiteKey: sKey,
            title,
            author: null,
            icon,
            isScript,
            moduleCount: 1,
            installedVersion: null,
            targetModVersion: null,
            compatibleVersions: [],
            bucket: "blocking",
            source: "awaiting_patch",
            issueKind: "corrupted",
            reasonLabel: t("blueprint_tab_missing", "Missing from {Vault}"),
            downloadUrl: null,
            rawMod: m,
            groupedMods: m ? [m] : [],
          };
          allSuiteEntries.push(fallbackEntry);
          continue;
        }

        registerSuiteInTitleLookup(title, [m], knownTitleByKey);
        const author = extractValidCreator(m);

        // Inspect Cloud mod_versions + parent mods.compatible_versions + local Compat
        const explicitCompatSet = new Set<string>();
        let hasVersionMismatchOnTarget = false;
        let cloudCompatibleRow: any = null;
        let cloudAnyNewerRow: any = null;
        let cloudMarkedBroken = false;
        let localMarkedBrokenOrObsolete = false;

        const localStat = String(m?.status || "").toLowerCase();
        if (
          localStat === "broken" ||
          localStat === "corrupted" ||
          localStat === "obsolete" ||
          m?.compliance_tier === 3 ||
          m?.compliance_tier === 4
        ) {
          localMarkedBrokenOrObsolete = true;
        }

        const mid = String(m.dbId || "").split("@")[0].trim();
        const cloudRows = mid ? cache.cloudModVersions.get(mid) || [] : [];

        let matchedInstalledRow: any = null;
        let memberParentMod: any = null;

        for (const row of cloudRows) {
          const pm = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          if (pm && !memberParentMod) memberParentMod = pm;
          const parentStatus = String(pm?.status || "").toLowerCase();
          const parentTier = Number(pm?.compliance_tier ?? 0);
          if (
            parentStatus === "broken" ||
            parentStatus === "corrupted" ||
            parentStatus === "obsolete" ||
            parentTier === 3 ||
            parentTier === 4
          ) {
            cloudMarkedBroken = true;
          }
          if (row.dna_hash && m.hash && String(row.dna_hash) === String(m.hash)) {
            matchedInstalledRow = row;
          }
        }

        let memberCompat: string[] = [];
        const installedRowVer = parseCompatArray(
          matchedInstalledRow?.game_version
        ).filter((v) => !isWildcardVersion(v));
        const parentCloudCompat = parseCompatArray(
          memberParentMod?.compatible_versions
        ).filter((v) => !isWildcardVersion(v));
        const localCompat = parseCompatArray(m.compatible_versions).filter(
          (v) => !isWildcardVersion(v)
        );

        if (installedRowVer.length > 0) {
          memberCompat = installedRowVer;
        } else if (parentCloudCompat.length > 0) {
          memberCompat = parentCloudCompat;
        } else if (localCompat.length > 0) {
          memberCompat = localCompat;
        }

        memberCompat.forEach((v) => explicitCompatSet.add(v));

        const memberMismatch =
          Boolean(targetVersion) &&
          memberCompat.length > 0 &&
          !isVersionMatch(memberCompat, targetVersion);

        if (memberMismatch) {
          hasVersionMismatchOnTarget = true;
        }

        for (const row of cloudRows) {
          const pm = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          const isDifferentHash =
            Boolean(row.dna_hash) &&
            (!m.hash || String(row.dna_hash) !== String(m.hash));
          const rowGameVer = parseCompatArray(row.game_version).filter(
            (v) => !isWildcardVersion(v)
          );
          const effectiveRowCompat =
            rowGameVer.length > 0
              ? rowGameVer
              : parseCompatArray(pm?.compatible_versions).filter(
                  (v) => !isWildcardVersion(v)
                );

          if (
            targetVersion &&
            effectiveRowCompat.length > 0 &&
            isVersionMatch(effectiveRowCompat, targetVersion)
          ) {
            if (isDifferentHash && (memberMismatch || m.hasUpdate)) {
              cloudCompatibleRow = row;
            }
          } else if (isDifferentHash && pm?.latest_version) {
            cloudAnyNewerRow = row;
          }
        }

        const compatArr = Array.from(explicitCompatSet);

        const simulatedEval = evaluateModIssues(m, {
          activeMods: resolvedMods,
          selectedVersion: targetVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        });
        const simulatedIssues = simulatedEval ? [simulatedEval] : [];
        const simulatedRedIssues = simulatedIssues.filter(
          (iss: any) => iss._alert_type === "red"
        );
        const hasNonVersionAtomicRed = simulatedRedIssues.some((iss: any) =>
          Array.isArray(iss._categories)
            ? iss._categories.some((c: string) => c !== "version_mismatch")
            : iss._alert_category !== "version_mismatch"
        );
        const hasSimulatedRedIssue =
          simulatedRedIssues.length > 0 || localMarkedBrokenOrObsolete;

        let archiveMatchVersion: string | null = null;
        if (Boolean(targetVersion)) {
          const relNorm = stripPriorityTierPrefix(
            String(m._originalSetName || m.path || m.name || ""),
            activeGameSchema
          )
            .toLowerCase()
            .replace(/\\/g, "/");
          const archivedRevs = archivedByRelPath.get(relNorm) || [];
          const matchingArch = archivedRevs.find(
            (rev: any) =>
              !rev.is_active &&
              isVersionMatch(
                parseCompatArray(rev.compatible_versions),
                targetVersion
              )
          );
          if (matchingArch) {
            archiveMatchVersion =
              getHighestVersion(
                parseCompatArray(matchingArch.compatible_versions)
              ) || targetVersion;
          }
        }

        const hasLocalUpdateFlag = Boolean(m.hasUpdate);
        const rawEdgeVer = cleanVersionLabel(m.newGameVersion);
        const edgeNewGameVer =
          rawEdgeVer && !isWildcardVersion(rawEdgeVer) ? rawEdgeVer : undefined;
        const edgeMatchesTarget =
          Boolean(edgeNewGameVer) &&
          Boolean(targetVersion) &&
          isVersionMatch([edgeNewGameVer!], targetVersion);

        const parentCloudMod = cloudCompatibleRow
          ? Array.isArray(cloudCompatibleRow.mods)
            ? cloudCompatibleRow.mods[0]
            : cloudCompatibleRow.mods
          : cloudAnyNewerRow
            ? Array.isArray(cloudAnyNewerRow.mods)
              ? cloudAnyNewerRow.mods[0]
              : cloudAnyNewerRow.mods
            : null;

        const resolvedDownloadUrl =
          cloudCompatibleRow?.download_url ||
          parentCloudMod?.url ||
          m.download_url ||
          m.url ||
          getModFallbackUrl(title, m.hash, activeGameSchema, {
            url: m.download_url || m.url,
          }) ||
          null;

        const cleanInstVer =
          m.version && !isWildcardVersion(m.version)
            ? cleanVersionLabel(m.version)
            : null;

        const hasActualCandidateUpdate =
          Boolean(cloudCompatibleRow) ||
          edgeMatchesTarget ||
          hasLocalUpdateFlag ||
          Boolean(archiveMatchVersion);

        const rawCandidateModVer = hasActualCandidateUpdate
          ? cleanVersionLabel(
              cloudCompatibleRow?.version_label ||
                (cloudCompatibleRow ? parentCloudMod?.latest_version : null) ||
                m.newVersion ||
                archiveMatchVersion
            )
          : "";

        const resolvedTargetModVer =
          rawCandidateModVer && !isWildcardVersion(rawCandidateModVer)
            ? rawCandidateModVer
            : null;

        const isUncertifiedScriptOnUpgrade =
          versionRelation === "upgrade" &&
          isScript &&
          compatArr.length === 0 &&
          !cloudCompatibleRow &&
          !edgeMatchesTarget &&
          (isPatchDetected || (defconLevel > 0 && defconLevel <= 3));

        let bucket: PatchModBucket = "ready";
        let source: PatchEvaluatedMod["source"] = "vault_active";
        let issueKind: PatchModIssueKind | undefined = undefined;
        let reasonLabel =
          compatArr.length > 0 &&
          targetVersion &&
          isVersionMatch(compatArr, targetVersion)
            ? `${ t("patch_sim_verified_for", "Verified for") } v${ targetVersion } `
            : t("patch_sim_compatible_in_vault", "Compatible in {Vault}");

        if (
          hasNonVersionAtomicRed ||
          cloudMarkedBroken ||
          localMarkedBrokenOrObsolete
        ) {
          bucket = "blocking";
          source = "awaiting_patch";
          const primaryRed = simulatedRedIssues.find(
            (iss: any) => iss._alert_category !== "version_mismatch"
          );
          const cat = primaryRed?._alert_category;
          issueKind =
            cat === "missing_deps"
              ? "dependency"
              : cat === "missing_dlc"
                ? "dlc"
                : "corrupted";
          reasonLabel =
            primaryRed?._alert_reason ||
            t("patch_sim_broken_on_patch", "Broken on Target Game Version");
        } else if (
          (hasVersionMismatchOnTarget ||
            hasSimulatedRedIssue ||
            hasLocalUpdateFlag) &&
          archiveMatchVersion
        ) {
          bucket = "update_ready";
          source = "vault_archive";
          archiveSwapReadyCount += 1;
          reasonLabel = t(
            "patch_sim_ready_in_archive",
            "Compatible Build in {Mod} Version History (Auto-Swap)"
          );
        } else if (
          Boolean(cloudCompatibleRow) ||
          edgeMatchesTarget ||
          (hasLocalUpdateFlag &&
            !hasVersionMismatchOnTarget &&
            !hasSimulatedRedIssue)
        ) {
          bucket = "update_ready";
          source = "cloud_update";
          reasonLabel = resolvedTargetModVer
            ? `${ t("updates_avail", "Updates Available") } • v${ resolvedTargetModVer } `
            : t("updates_avail", "Updates Available");
        } else if (
          hasVersionMismatchOnTarget ||
          hasSimulatedRedIssue ||
          isUncertifiedScriptOnUpgrade
        ) {
          bucket = "blocking";
          source = "awaiting_patch";
          issueKind = "version";
          if (hasVersionMismatchOnTarget) {
            const highest = getHighestVersion(compatArr);
            const cleanHigh = cleanVersionLabel(highest);
            reasonLabel = `${
  t(
    "patch_sim_awaiting_patch",
    "Awaiting {Mason} Update"
  )
} (${
  cleanHigh && !isWildcardVersion(cleanHigh)
    ? `v${cleanHigh}`
    : t("unknown", "Unknown")
})`;
          } else if (
            simulatedIssues.length > 0 &&
            simulatedIssues[0]?._alert_reason
          ) {
            reasonLabel = simulatedIssues[0]._alert_reason;
          } else if (isUncertifiedScriptOnUpgrade) {
            reasonLabel = t(
              "patch_sim_script_unverified",
              "Script {Mod} Not Yet Verified for Target Patch"
            );
          } else {
            reasonLabel = t(
              "patch_sim_broken_on_patch",
              "Broken on Target Game Version"
            );
          }
        }

        const entryIssues: StackedModIssue[] = Array.isArray(
          simulatedEval?._issues
        )
          ? (simulatedEval._issues as StackedModIssue[])
          : [];
        const entryDepTargets: MissingDepTarget[] = [];
        const seenDepNames = new Set<string>();
        for (let di = 0; di < entryIssues.length; di++) {
          const dt = entryIssues[di]?.depTarget;
          if (dt && dt.name) {
            const dk = dt.name.toLowerCase();
            if (!seenDepNames.has(dk)) {
              seenDepNames.add(dk);
              entryDepTargets.push(dt);
            }
          }
        }

        const evalEntry: PatchEvaluatedMod = {
          key: uniqueKey,
          suiteKey: sKey,
          title,
          author,
          icon,
          isScript,
          moduleCount: 1,
          installedVersion: cleanInstVer,
          targetModVersion: resolvedTargetModVer,
          compatibleVersions: compatArr,
          bucket,
          source,
          issueKind,
          reasonLabel,
          downloadUrl: resolvedDownloadUrl,
          rawMod: m,
          groupedMods: [m],
          issues: entryIssues.length > 0 ? entryIssues : undefined,
          missingDepTargets:
            entryDepTargets.length > 0 ? entryDepTargets : undefined,
          blueprintName: ps.name,
        };
        allSuiteEntries.push(evalEntry);

        if (!sKey.startsWith("art:")) {
          const list = coupledSuites.get(sKey) || [];
          list.push(evalEntry);
          coupledSuites.set(sKey, list);
        }
      }

      // Pass 1.5: Synchronize atomic script/module twin pairs so coupled siblings share blocking/update status
      const syncCoupledSuites = (): boolean => {
        let mutated = false;
        coupledSuites.forEach((siblings) => {
          if (siblings.length <= 1) return;
          const blockingDonor = siblings.find((s) => s.bucket === "blocking");
          if (blockingDonor) {
            for (const sib of siblings) {
              if (sib.bucket !== "blocking") {
                if (sib.source === "vault_archive") {
                  archiveSwapReadyCount = Math.max(0, archiveSwapReadyCount - 1);
                }
                sib.bucket = "blocking";
                sib.source = "awaiting_patch";
                sib.issueKind = blockingDonor.issueKind || "version";
                sib.reasonLabel = blockingDonor.reasonLabel;
                if (!sib.issues && blockingDonor.issues) {
                  sib.issues = blockingDonor.issues;
                }
                if (!sib.missingDepTargets && blockingDonor.missingDepTargets) {
                  sib.missingDepTargets = blockingDonor.missingDepTargets;
                }
                mutated = true;
              }
            }
            return;
          }

          const cloudDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "cloud_update"
          );
          if (cloudDonor) {
            for (const sib of siblings) {
              if (
                sib.bucket === "ready" ||
                (sib.bucket === "update_ready" && sib.source === "dep_update_pending")
              ) {
                sib.bucket = "update_ready";
                sib.source = "cloud_update";
                sib.issueKind = undefined;
                sib.targetModVersion =
                  sib.targetModVersion || cloudDonor.targetModVersion;
                sib.downloadUrl = sib.downloadUrl || cloudDonor.downloadUrl;
                sib.reasonLabel = cloudDonor.reasonLabel;
                mutated = true;
              }
            }
            return;
          }

          const archiveDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "vault_archive"
          );
          if (archiveDonor) {
            for (const sib of siblings) {
              if (sib.bucket === "ready") {
                sib.bucket = "update_ready";
                sib.source = "vault_archive";
                sib.issueKind = undefined;
                sib.targetModVersion =
                  sib.targetModVersion || archiveDonor.targetModVersion;
                sib.downloadUrl = sib.downloadUrl || archiveDonor.downloadUrl;
                sib.reasonLabel = archiveDonor.reasonLabel;
                mutated = true;
              }
            }
            return;
          }

          const depDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "dep_update_pending"
          );
          if (depDonor) {
            for (const sib of siblings) {
              if (sib.bucket === "ready") {
                sib.bucket = "update_ready";
                sib.source = "dep_update_pending";
                sib.issueKind = "dependency";
                sib.reasonLabel = depDonor.reasonLabel;
                mutated = true;
              }
            }
          }
        });
        return mutated;
      };

      syncCoupledSuites();

      // Pass 2A: Fixed-point Blocking Dependency Cascade (including self-safe & multi-hop dependencies)
      const suitesWithDeps = allSuiteEntries.filter((entry) =>
        entry.groupedMods.some((gm) => Boolean(gm?.dependencies || gm?.requirements))
      );

      if (suitesWithDeps.length > 0) {
        const allEquippedIndex = buildActiveDependencyIndex(resolvedMods);

        for (let pass = 0; pass < 25; pass++) {
          let changed = false;
          const nonBlockingPool: any[] = [];
          for (let i = 0; i < allSuiteEntries.length; i++) {
            const se = allSuiteEntries[i];
            if (se.bucket !== "blocking") {
              for (let j = 0; j < se.groupedMods.length; j++) {
                nonBlockingPool.push(se.groupedMods[j]);
              }
            }
          }
          const nonBlockingIndex = buildActiveDependencyIndex(nonBlockingPool);

          for (let i = 0; i < suitesWithDeps.length; i++) {
            const se = suitesWithDeps[i];
            if (se.bucket === "blocking") continue;
            const missingDep = findUnsatisfiedSuiteDependency(
              se.groupedMods,
              nonBlockingIndex,
              knownTitleByKey,
              activeGameSchema
            );
            if (missingDep) {
              if (se.source === "vault_archive") {
                archiveSwapReadyCount = Math.max(0, archiveSwapReadyCount - 1);
              }
              const trulyMissingFromBlueprint = findUnsatisfiedSuiteDependency(
                se.groupedMods,
                allEquippedIndex,
                knownTitleByKey,
                activeGameSchema
              );
              se.bucket = "blocking";
              se.source = "awaiting_patch";
              se.issueKind = "dependency";
              se.reasonLabel = `${ t("badge_missing_dep", "Missing Dependency") }: ${ missingDep } `;
              if (trulyMissingFromBlueprint) {
                se.issueKind = "dependency";
                se.reasonLabel = `${
  t(
    "badge_missing_dep",
    "Missing Dependency"
  )
}: ${ trulyMissingFromBlueprint } `;
                const depTarget = resolveMissingDepTarget(
                  trulyMissingFromBlueprint
                );
                const existingTargets = se.missingDepTargets || [];
                if (
                  !existingTargets.some(
                    (dt) =>
                      dt.name.toLowerCase() === depTarget.name.toLowerCase()
                  )
                ) {
                  se.missingDepTargets = [...existingTargets, depTarget];
                }
              } else {
                se.issueKind = "version";
                se.reasonLabel = `${
  t(
    "patch_sim_awaiting_patch",
    "Awaiting {Mason} Update"
  )
}: ${ missingDep } `;
              }
              changed = true;
            }
          }

          if (syncCoupledSuites()) changed = true;
          if (!changed) break;
        }

        // Pass 2B: Fixed-point Pending-Update Dependency Cascade (ready artifacts depending on update_ready artifacts)
        for (let pass = 0; pass < 25; pass++) {
          let changed = false;
          const strictlyReadyPool: any[] = [];
          for (let i = 0; i < allSuiteEntries.length; i++) {
            const se = allSuiteEntries[i];
            if (se.bucket === "ready") {
              for (let j = 0; j < se.groupedMods.length; j++) {
                strictlyReadyPool.push(se.groupedMods[j]);
              }
            }
          }
          const strictlyReadyIndex = buildActiveDependencyIndex(strictlyReadyPool);

          for (let i = 0; i < suitesWithDeps.length; i++) {
            const se = suitesWithDeps[i];
            if (se.bucket !== "ready") continue;
            const pendingDep = findUnsatisfiedSuiteDependency(
              se.groupedMods,
              strictlyReadyIndex,
              knownTitleByKey,
              activeGameSchema
            );
            if (pendingDep) {
              se.bucket = "update_ready";
              se.source = "dep_update_pending";
              se.issueKind = "dependency";
              se.reasonLabel = `${
  t(
    "patch_sim_dep_needs_update",
    "Requires Pending Update"
  )
}: ${ pendingDep } `;
              changed = true;
            }
          }

          if (syncCoupledSuites()) changed = true;
          if (!changed) break;
        }
      }

      const blockingMods: PatchEvaluatedMod[] = [];
      const updatableMods: PatchEvaluatedMod[] = [];
      const directUpdateMods: PatchEvaluatedMod[] = [];
      const depUpdateMods: PatchEvaluatedMod[] = [];
      const autoSwapMods: PatchEvaluatedMod[] = [];
      const readyMods: PatchEvaluatedMod[] = [];

      for (let i = 0; i < allSuiteEntries.length; i++) {
        const entry = allSuiteEntries[i];
        if (entry.bucket === "blocking") {
          blockingMods.push(entry);
        } else if (entry.bucket === "update_ready") {
          updatableMods.push(entry);
          if (entry.source === "vault_archive") {
            autoSwapMods.push(entry);
          } else if (entry.source === "dep_update_pending") {
            depUpdateMods.push(entry);
          } else {
            directUpdateMods.push(entry);
          }
        } else {
          readyMods.push(entry);
        }
      }

      const totalMods =
        blockingMods.length + updatableMods.length + readyMods.length;
      const rawPct =
        totalMods > 0 ? Math.round((readyMods.length / totalMods) * 100) : 100;
      const readinessPercent =
        totalMods === 0 || readyMods.length === totalMods
          ? 100
          : readyMods.length === 0
            ? 0
            : Math.min(99, Math.max(1, rawPct));

      const verdict: BlueprintPatchReport["verdict"] =
        totalMods === 0
          ? "empty"
          : blockingMods.length > 0
            ? "hold"
            : updatableMods.length > 0
              ? "updates_ready"
              : "safe";

      return {
        blueprintName: ps.name,
        isEquipped,
        isPinned,
        blueprintObj: ps,
        totalMods,
        blockingMods,
        updatableMods,
        directUpdateMods,
        depUpdateMods,
        autoSwapMods,
        readyMods,
        archiveSwapReadyCount,
        readinessPercent,
        verdict,
      };
    });

    cache.lastReportsCache = {
      playSets,
      activeSetName,
      pinnedKey,
      modList,
      activeGameSchema,
      networkUpdates,
      targetVersion,
      ownedDLC,
      maskedDLC,
      poolItems,
      versionRelation,
      isPatchDetected,
      defconLevel,
      cloudTick,
      t,
      result: computedReports,
    };

    return computedReports;
  }, [
    skip,
    playSets,
    activeSetName,
    pinnedKey,
    modList,
    activeGameSchema,
    networkUpdates,
    targetVersion,
    ownedDLC,
    maskedDLC,
    poolItems,
    archivedByRelPath,
    versionRelation,
    isPatchDetected,
    defconLevel,
    wsKey,
    cloudTick,
    t,
  ]);

  const sortedBlueprintReports = useMemo(() => {
    return [...blueprintReports].sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) return a.isEquipped ? -1 : 1;
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.blueprintName.localeCompare(b.blueprintName);
    });
  }, [blueprintReports]);

  const activeBlueprintReport = useMemo(() => {
    return (
      sortedBlueprintReports.find((r) => r.isEquipped) ||
      sortedBlueprintReports[0] ||
      null
    );
  }, [sortedBlueprintReports]);

  const hasPrePatchBackup = useMemo(() => {
    return Array.isArray(backupList) && backupList.length > 0;
  }, [backupList]);

  const versionDropdownOptions = useMemo(() => {
    return availableVersions.map((ver, idx) => {
      const isCurrent =
        Boolean(cleanCurrentVersion) && compareVersions(ver, cleanCurrentVersion) === 0;
      const isLatest = idx === 0;
      let suffix = "";
      if (isCurrent && isLatest) {
        suffix = ` (${ t("current", "Current") })`;
      } else if (isCurrent) {
        suffix = ` (${ t("patch_sim_installed_tag", "Installed") })`;
      } else if (isLatest) {
        suffix = ` (${ t("patch_sim_latest_tag", "Latest Patch") })`;
      }
      return {
        id: ver,
        value: ver,
        label: `v${ ver }${ suffix } `,
      };
    });
  }, [availableVersions, cleanCurrentVersion, t]);

  return {
    availableVersions,
    versionDropdownOptions,
    currentVersion: cleanCurrentVersion,
    latestKnownVersion,
    isUpdateBehindLatest,
    targetVersion,
    setTargetVersion,
    versionRelation,
    blueprintReports: sortedBlueprintReports,
    activeBlueprintReport,
    hasPrePatchBackup,
    backupCount: Array.isArray(backupList) ? backupList.length : 0,
    shelterActive,
    defconLevel,
    isPatchDetected,
  };
}

export function clonePatchReadyBlueprint(
  report: BlueprintPatchReport,
  targetVersion: string,
  activeGameSchema: any,
  t: (key: string, fallback?: string) => string
): { newName: string; keptCount: number; skippedCount: number } | null {
  if (!report || !report.blueprintObj) return null;
  const store = useStore.getState();
  const currentPlaySets = Array.isArray(store.playSets) ? store.playSets : [];

  const excludedExact = new Set<string>();
  const excludedNormalized = new Set<string>();
  const excludedHashes = new Set<string>();
  const knownTitleByKey = new Map<string, string>();

  const markModObjectExcluded = (gm: any) => {
    if (!gm) return;
    const orig = String(gm?._originalSetName || "").trim();
    const nm = String(gm?.name || "").trim();
    if (orig) {
      excludedExact.add(orig);
      excludedNormalized.add(
        stripPriorityTierPrefix(orig, activeGameSchema)
          .toLowerCase()
          .replace(/\\/g, "/")
      );
    }
    if (nm) {
      excludedExact.add(nm);
      excludedNormalized.add(
        stripPriorityTierPrefix(nm, activeGameSchema)
          .toLowerCase()
          .replace(/\\/g, "/")
      );
    }
    if (gm?.hash && !isWildcardVersion(gm.hash)) {
      excludedHashes.add(String(gm.hash));
    }
  };

  const suiteByModNameNorm = new Map<string, PatchEvaluatedMod>();
  for (const entry of [
    ...report.blockingMods,
    ...report.updatableMods,
    ...report.readyMods,
  ]) {
    registerSuiteInTitleLookup(entry.title, entry.groupedMods || [], knownTitleByKey);
    for (const gm of entry.groupedMods || []) {
      const origNorm = stripPriorityTierPrefix(
        String(gm?._originalSetName || gm?.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      if (origNorm) suiteByModNameNorm.set(origNorm, entry);
      const nameNorm = stripPriorityTierPrefix(
        String(gm?.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      if (nameNorm) suiteByModNameNorm.set(nameNorm, entry);
    }
  }

  const extraOmittedSuites = new Set<string>();
  const excludeModAndSuite = (gm: any) => {
    if (!gm) return;
    const normKey = stripPriorityTierPrefix(
      String(gm?._originalSetName || gm?.name || ""),
      activeGameSchema
    )
      .toLowerCase()
      .replace(/\\/g, "/");
    const matchedSuite = normKey ? suiteByModNameNorm.get(normKey) : undefined;
    if (matchedSuite) {
      extraOmittedSuites.add(matchedSuite.key);
      for (const member of matchedSuite.groupedMods || []) {
        markModObjectExcluded(member);
      }
    } else {
      if (normKey) extraOmittedSuites.add(`raw:${ normKey } `);
      markModObjectExcluded(gm);
    }
  };

  const requiresUpdateMods = [...report.blockingMods, ...report.updatableMods];
  for (const entry of requiresUpdateMods) {
    for (const gm of entry.groupedMods || []) {
      markModObjectExcluded(gm);
    }
  }

  const isModNameExcluded = (rawName: string): boolean => {
    const trimmed = String(rawName || "").trim();
    if (!trimmed) return true;
    if (excludedExact.has(trimmed)) return true;
    const norm = stripPriorityTierPrefix(trimmed, activeGameSchema)
      .toLowerCase()
      .replace(/\\/g, "/");
    return excludedNormalized.has(norm);
  };

  const sourceSet = report.blueprintObj;
  const rawMods = Array.isArray(sourceSet.mods) ? sourceSet.mods : [];

  const filterRawList = (list: any[]) =>
    list.filter((rawEntry: any) => {
      const modName =
        typeof rawEntry === "string"
          ? rawEntry
          : String(rawEntry?.name || rawEntry?.path || "");
      if (isModNameExcluded(modName)) return false;
      const rawHash =
        typeof rawEntry === "object" && rawEntry?.hash
          ? String(rawEntry.hash)
          : "";
      if (rawHash && excludedHashes.has(rawHash)) return false;
      return true;
    });

  let candidateRawMods = deduplicateBlueprintArtifacts(
    filterRawList(rawMods),
    activeGameSchema
  );

  const bpIgnored = [
    ...(Array.isArray(store.ignoredGlobal) ? store.ignoredGlobal : []),
    ...(Array.isArray(sourceSet?.ignoredConflicts)
      ? sourceSet.ignoredConflicts
      : []),
  ];

  // Multi-pass fixed-point atomic logic & conflict verification so zero broken links or stray alerts survive into the clone
  for (let pass = 0; pass < 25; pass++) {
    const candidateResolved = resolveActiveBlueprintMods(
      candidateRawMods,
      store.modList || [],
      activeGameSchema,
      store.networkUpdates
    );
    if (candidateResolved.length === 0) break;

    const poolIndex = buildActiveDependencyIndex(candidateResolved);
    const activeRefSet = new Set(candidateResolved);
    let newlyExcludedInPass = 0;

    for (let i = 0; i < candidateResolved.length; i++) {
      const m = candidateResolved[i];
      if (!m || m.isFallback) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const localStat = String(m.status || "").toLowerCase();
      if (
        localStat === "broken" ||
        localStat === "corrupted" ||
        localStat === "obsolete" ||
        m.compliance_tier === 3 ||
        m.compliance_tier === 4
      ) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const missingDep = findUnsatisfiedSuiteDependency(
        [m],
        poolIndex,
        knownTitleByKey,
        activeGameSchema
      );
      if (missingDep) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const evalRes = evaluateModIssues(m, {
        activeMods: candidateResolved,
        selectedVersion: targetVersion,
        ownedDLC: store.ownedDLC || [],
        maskedDLC: store.maskedDLC || [],
        t,
        activeGameSchema,
      });
      if (evalRes && evalRes._alert_type === "red") {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }
    }

    const candidateConflicts = resolveBlueprintConflicts(
      report.blueprintName,
      candidateResolved,
      bpIgnored,
      t,
      activeGameSchema
    );
    for (const c of candidateConflicts) {
      if (!activeRefSet.has(c.modA) || !activeRefSet.has(c.modB)) continue;
      if (c.modA?.isFallback || c.modB?.isFallback) continue;
      if (Number(c.conflict?.severity_rank) === 4) {
        excludeModAndSuite(c.modB);
        newlyExcludedInPass += 1;
      }
    }

    if (newlyExcludedInPass === 0) break;

    candidateRawMods = deduplicateBlueprintArtifacts(
      filterRawList(candidateRawMods),
      activeGameSchema
    );
  }

  const dedupedMods = candidateRawMods;

  const filterRecord = (rec: any) => {
    if (!rec || typeof rec !== "object") return undefined;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (!isModNameExcluded(k)) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const cleanBaseTitle =
    report.blueprintName
      .replace(/\s*\((?:v\d[\w.-]*|Ready)\)(?:\s*#\d+)?\s*$/i, "")
      .trim() || report.blueprintName;

  const cleanVer = cleanVersionLabel(targetVersion);
  const desiredName =
    cleanVer && !isWildcardVersion(cleanVer)
      ? `${ cleanBaseTitle } (v${ cleanVer })`
      : `${ cleanBaseTitle } (${ t("patch_sim_ready_label", "Ready") })`;

  const existingLower = new Set(
    currentPlaySets.map((s: any) => String(s?.name || "").toLowerCase())
  );
  let finalName = desiredName;
  let suffix = 2;
  while (existingLower.has(finalName.toLowerCase())) {
    finalName = `${ desiredName } #${ suffix } `;
    suffix += 1;
  }

  const newSet = {
    name: finalName,
    mods: dedupedMods,
    modHashes: filterRecord(sourceSet.modHashes),
    modMeta: filterRecord(sourceSet.modMeta),
    modTiers: filterRecord(sourceSet.modTiers),
    loadOrder: Array.isArray(sourceSet.loadOrder)
      ? sourceSet.loadOrder.filter((k: any) => !isModNameExcluded(String(k || "")))
      : undefined,
    loadRules: Array.isArray(sourceSet.loadRules)
      ? sourceSet.loadRules
          .filter(
            (r: any) =>
              !isModNameExcluded(String(r?.mod || r?.source || "")) &&
              !isModNameExcluded(String(r?.target || r?.after || r?.before || ""))
          )
          .map((r: any) => ({ ...r }))
      : undefined,
    ignoredConflicts: Array.isArray(sourceSet.ignoredConflicts)
      ? sourceSet.ignoredConflicts.filter((pairStr: any) => {
          const parts = String(pairStr || "").split(/\s+vs\s+/i);
          if (parts.length === 2) {
            return !isModNameExcluded(parts[0]) && !isModNameExcluded(parts[1]);
          }
          return true;
        })
      : undefined,
  };

  store.setPlaySets([...currentPlaySets, newSet]);

  const skippedCount = requiresUpdateMods.length + extraOmittedSuites.size;
  const keptCount = Math.max(0, report.readyMods.length - extraOmittedSuites.size);
  store.pushStatus(
    t(
      "patch_sim_clone_toast",
      "Created \"{0}\" with {1} ready {mods} (omitted {2} requiring updates or missing dependencies)."
    )
      .replace("{0}", finalName)
      .replace("{1}", String(keptCount))
      .replace("{2}", String(skippedCount)),
    "success"
  );

  return {
    newName: finalName,
    keptCount,
    skippedCount,
  };
}

export function PatchReadinessSimulatorInfoCard({
  readiness,
}: {
  readiness: ReturnType<typeof useBlueprintPatchReadiness>;
}) {
  const { t } = useLexicon();
  const nonEmptyReports = readiness.blueprintReports.filter(
    (r) => r.totalMods > 0
  );
  const totalBpCount = nonEmptyReports.length;
  const readyBpCount = nonEmptyReports.filter((r) => r.verdict === "safe").length;
  const updatesOnlyBpCount = nonEmptyReports.filter(
    (r) => r.verdict === "updates_ready"
  ).length;

  const overallState: "safe" | "warning" | "hold" =
    totalBpCount === 0 || readyBpCount === totalBpCount
      ? "safe"
      : readyBpCount > 0 || updatesOnlyBpCount > 0
        ? "warning"
        : "hold";

  const verdictAccent =
    overallState === "hold"
      ? "var(--danger)"
      : overallState === "warning"
        ? "var(--warning)"
        : "var(--success)";

  const verdictIconColor =
    overallState === "hold"
      ? "text-[var(--danger)]"
      : overallState === "warning"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";

  const verdictIcon =
    overallState === "hold"
      ? t("icon_gpp_bad", "gpp_bad")
      : overallState === "warning"
        ? t("icon_published_with_changes", "published_with_changes")
        : t("icon_verified_user", "verified_user");

  const targetVerDisplay = formatDisplayVersion(
    readiness.targetVersion,
    t("auto", "Auto")
  );

  return (
    <LiquidGlassAlertCard
      icon={verdictIcon}
      accentVar={verdictAccent}
      iconColorClass={verdictIconColor}
      badgeIcon={t("icon_layers", "layers")}
      badgeLabel={
        totalBpCount > 0
          ? `${ readyBpCount }/${totalBpCount} ${t(
"patch_sim_ready_label",
  "Ready"
            )}`
          : t("standby", "Standby")
      }
      overline={`${ t("patch_sim_overline", "Patch Simulator") } • ${ targetVerDisplay } `}
      title={
        totalBpCount === 0
          ? t("patch_sim_no_blueprints_title", "No {Blueprints} Populated")
          : readyBpCount === totalBpCount
            ? t("patch_sim_all_bp_ready", "All {Blueprints} Ready")
            : t("patch_sim_bp_ready_summary", "{0} of {1} {Blueprints} Ready")
                .replace("{0}", String(readyBpCount))
                .replace("{1}", String(totalBpCount))
      }
      description={t(
        "patch_sim_global_card_desc",
        "Test any game version across your {Blueprints} before updating, or clone a ready-to-play copy without unupdated {mods}."
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-3 mt-auto pt-1"
      >
        {readiness.versionDropdownOptions.length > 0 && (
          <div className="rounded-xl glass-surface p-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_published_with_changes", "published_with_changes")}
                </span>
                {t("patch_sim_target_version_label", "Simulated Game Version")}
              </span>
              {readiness.currentVersion && (
                <span className="text-[9.5px] font-mono font-bold text-[var(--subtext)] opacity-75">
                  {`${ t("patch_sim_installed_tag", "Installed") }: v${ readiness.currentVersion } `}
                </span>
              )}
            </div>
            <CustomDropdown
              value={readiness.targetVersion}
              onChange={(val: any) =>
                startTransition(() =>
                  readiness.setTargetVersion(unwrapDropdownValue(val))
                )
              }
              options={readiness.versionDropdownOptions}
              allowCustom={true}
              searchable={true}
              placeholder={t("game_version", "Game Version")}
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <span className={VAULT_CHIP_CLASS}>
            <span
              className={`material - symbols - outlined!text - [12px] ${
  readiness.backupCount > 0
    ? "text-[var(--success)]"
    : "text-[var(--warning)]"
} `}
            >
              {t("icon_history", "history")}
            </span>
            <span>{`${ readiness.backupCount } ${
  t(
    "cmd_snapshots_label",
    "Snapshots"
  )
} `}</span>
          </span>
          <span className={VAULT_CHIP_CLASS}>
            <span
              className={`material - symbols - outlined!text - [12px] ${
  readiness.shelterActive || readiness.isPatchDetected
    ? "text-[var(--warning)]"
    : "text-[var(--accent)]"
} `}
            >
              {readiness.shelterActive
                ? t("icon_lock", "lock")
                : t("icon_shield", "shield")}
            </span>
            <span>
              {readiness.shelterActive
                ? t("btn_lockdown", "Lockdown {Vault}")
                    .replace(/^[^\w]*/, "")
                    .trim()
                : t("standby", "Standby")}
            </span>
          </span>
        </div>
      </div>
    </LiquidGlassAlertCard>
  );
}

export function BlueprintPatchReadinessCard({
  report,
  targetVersion,
  onInspect,
}: {
  report: BlueprintPatchReport;
  targetVersion: string;
  onInspect: (blueprintName: string) => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [justCloned, setJustCloned] = useState(false);

  const unreadyCount = report.blockingMods.length + report.updatableMods.length;
  const canCloneReady = unreadyCount > 0 && report.readyMods.length > 0;

  const handleCloneReady = (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = clonePatchReadyBlueprint(
      report,
      targetVersion,
      activeGameSchema,
      t
    );
    if (res) {
      setJustCloned(true);
      setTimeout(() => setJustCloned(false), 3000);
    }
  };

  const statusColor =
    report.verdict === "hold"
      ? "danger"
      : report.verdict === "updates_ready"
        ? "warning"
        : "success";

  const verdictLabel =
    report.verdict === "hold"
      ? t("patch_sim_verdict_hold_short", "Hold Update")
      : report.verdict === "updates_ready"
        ? t("patch_sim_verdict_stage_short", "Updates Ready")
        : report.verdict === "empty"
          ? t("empty", "Empty")
          : t("patch_sim_verdict_safe_short", "Safe to Update");

  const verdictIcon =
    report.verdict === "hold"
      ? t("icon_gpp_bad", "gpp_bad")
      : report.verdict === "updates_ready"
        ? t("icon_update", "update")
        : t("icon_verified_user", "verified_user");

  const verdictIconColor =
    report.verdict === "hold"
      ? "text-[var(--danger)]"
      : report.verdict === "updates_ready"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";

  return (
    <UniversalCard
      layout="vertical"
      isActive={report.isEquipped}
      statusColor={statusColor}
      icon={
        report.isEquipped
          ? t("icon_verified_user", "verified_user")
          : t("icon_map", "map")
      }
      customIcon={
        <DynamicBlueprintPreviewBanner
          data={report.blueprintObj}
          countOverride={report.totalMods}
          heightClass="h-full"
        />
      }
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[78%] z-30 pointer-events-none whitespace-nowrap">
          <span className={VAULT_CHIP_CLASS}>
            <span
              className={`material - symbols - outlined!text - [12px] ${ verdictIconColor } `}
            >
              {verdictIcon}
            </span>
            <span>{verdictLabel}</span>
          </span>
        </div>
      }
      actions={
        canCloneReady ? (
          <button
            type="button"
            onClick={handleCloneReady}
            className={`- mt - 0.5 w - [26px] h - [26px] rounded - lg glass - surface border flex items - center justify - center transition - all relative cursor - pointer ${
  justCloned
    ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_50%,transparent)]"
    : "text-[var(--text)] opacity-80 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)]"
} `}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {justCloned
                ? t("icon_check", "check")
                : t("icon_content_copy", "content_copy")}
            </span>
            <HoverTooltip
              title={
                justCloned
                  ? t("patch_sim_cloned_short", "Cloned!")
                  : t("patch_sim_btn_clone_ready", "Clone Ready {Blueprint}")
              }
              subtitle={t(
                "patch_sim_clone_ready_tooltip",
                "Create a patch-ready copy omitting {0} {mods} requiring updates"
              ).replace("{0}", String(unreadyCount))}
              icon={
                justCloned
                  ? t("icon_check", "check")
                  : t("icon_content_copy", "content_copy")
              }
            />
          </button>
        ) : undefined
      }
      title={report.blueprintName}
      subtitle={`${ formatDisplayVersion(targetVersion, t("auto", "Auto")) } • ${
  report.readyMods.length
}/${report.totalMods} ${t("patch_sim_ready_label", "Ready")} (${
report.readinessPercent
      }%)`}
      onClick={() => onInspect(report.blueprintName)}
      badges={
        <>
          {report.blockingMods.length > 0 && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                {t("icon_block", "block")}
              </span>
              <span>
                {`${ report.blockingMods.length } ${
  t(
    "patch_sim_awaiting_compact",
    "Awaiting"
  )
} `}
              </span>
            </span>
          )}
          {report.updatableMods.length > 0 && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                {t("icon_download", "download")}
              </span>
              <span>
                {`${ report.updatableMods.length } ${
  t(
    "updates_available",
    "Updates"
  )
} `}
              </span>
            </span>
          )}
          {report.blockingMods.length === 0 &&
            report.updatableMods.length === 0 && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>
                  {report.totalMods === 0
                    ? t("empty", "Empty")
                    : t("patch_sim_all_ready_chip", "All Ready")}
                </span>
              </span>
            )}
        </>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
            {t("inspect", "Inspect")}
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_arrow_forward", "arrow_forward")}
            </span>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="w-full h-1.5 rounded-full glass-surface overflow-hidden flex">
          {report.totalMods > 0 ? (
            <>
              <div
                className="h-full bg-[var(--success)] transition-all duration-500"
                style={{
                  width: `${ (report.readyMods.length / report.totalMods) * 100 }% `,
                }}
              />
              <div
                className="h-full bg-[var(--warning)] transition-all duration-500"
                style={{
                  width: `${ (report.updatableMods.length / report.totalMods) * 100 }% `,
                }}
              />
              <div
                className="h-full bg-[var(--danger)] transition-all duration-500"
                style={{
                  width: `${ (report.blockingMods.length / report.totalMods) * 100 }% `,
                }}
              />
            </>
          ) : (
            <div className="h-full w-full bg-[var(--success)] opacity-40" />
          )}
        </div>
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed m-0">
          {report.verdict === "hold"
            ? t(
                "patch_sim_card_hold_desc",
                "Hold off updating the game until blocking {mods} publish a compatible patch."
              )
            : report.verdict === "updates_ready"
              ? t(
                  "patch_sim_card_updates_desc",
                  "All {mods} support this game version once pending updates are staged into {Vault}."
                )
              : t(
                  "patch_sim_card_safe_desc",
                  "Every {mod} in this {Blueprint} is clear for the simulated game version."
                )}
        </p>
      </div>
    </UniversalCard>
  );
}

interface VaultFamilyParentMeta {
  key: string;
  title: string;
  author: string | null;
  url: string | null;
  isCollection: boolean;
}

interface VaultFamilyLookup {
  parentByKey: Map<string, VaultFamilyParentMeta>;
  childNameToParentKey: Map<string, string>;
  childHashToParentKey: Map<string, string>;
}

const vaultFamilyLookupCache = new WeakMap<readonly any[], VaultFamilyLookup>();

function getVaultFamilyLookup(
  modList: readonly any[] | undefined | null,
  activeGameSchema: any
): VaultFamilyLookup {
  if (Array.isArray(modList)) {
    const cached = vaultFamilyLookupCache.get(modList);
    if (cached) return cached;
  }

  const parentByKey = new Map<string, VaultFamilyParentMeta>();
  const childNameToParentKey = new Map<string, string>();
  const childHashToParentKey = new Map<string, string>();

  const registerPath = (rawPath: any, parentKey: string) => {
    const str = String(rawPath || "").trim();
    if (!str) return;
    const norm = str.toLowerCase().replace(/\\/g, "/");
    if (!childNameToParentKey.has(norm)) {
      childNameToParentKey.set(norm, parentKey);
    }
    const stripped = stripPriorityTierPrefix(str, activeGameSchema)
      .toLowerCase()
      .replace(/\\/g, "/");
    if (stripped && !childNameToParentKey.has(stripped)) {
      childNameToParentKey.set(stripped, parentKey);
    }
  };

  if (Array.isArray(modList)) {
    for (let i = 0; i < modList.length; i++) {
      const vm = modList[i];
      if (!vm) continue;

      const rawId = String(vm.id || "").trim();
      const rawDb = String(vm.dbId || "").split("@")[0].trim();
      const rawTitle = formatDisplayName(
        vm.displayName || vm.meta_name || vm.name || ""
      );
      const title = formatCleanModTitle(rawTitle) || rawTitle;
      const author = extractValidCreator(vm);
      const url = vm.download_url || vm.url || null;
      const isCollection = Boolean(
        vm.isCollection || rawId.startsWith("set_")
      );

      let folderKey = "";
      if (rawId.startsWith("virtual_")) {
        folderKey = `fam:${ rawId.replace(/^virtual_/, "").trim() } `;
      } else if (rawId.startsWith("set_")) {
        folderKey = `set:${ rawId.replace(/^set_/, "").trim() } `;
      } else if (rawDb && rawDb !== "null" && rawDb !== "undefined") {
        folderKey = isCollection ? `set:${ rawDb } ` : `fam:${ rawDb } `;
      } else if (Array.isArray(vm.flavors) && vm.flavors.length > 1 && vm.name) {
        folderKey = `folder:${ String(vm.name).toLowerCase() } `;
      }

      if (folderKey && title) {
        const existing = parentByKey.get(folderKey);
        if (!existing || rawId.startsWith("virtual_") || rawId.startsWith("set_")) {
          parentByKey.set(folderKey, {
            key: folderKey,
            title,
            author: author || existing?.author || null,
            url: url || existing?.url || null,
            isCollection,
          });
        }
      }

      if (folderKey && Array.isArray(vm.flavors) && vm.flavors.length > 0) {
        for (let j = 0; j < vm.flavors.length; j++) {
          const fl = vm.flavors[j];
          if (!fl) continue;
          registerPath(fl.name, folderKey);
          registerPath(fl.physical_path, folderKey);
          if (fl.hash && !isWildcardVersion(fl.hash)) {
            const h = String(fl.hash).trim().toLowerCase();
            if (h && !childHashToParentKey.has(h)) {
              childHashToParentKey.set(h, folderKey);
            }
          }
        }
      }
    }
  }

  const built: VaultFamilyLookup = {
    parentByKey,
    childNameToParentKey,
    childHashToParentKey,
  };
  if (Array.isArray(modList)) {
    vaultFamilyLookupCache.set(modList, built);
  }
  return built;
}

export function groupPatchEvaluatedMods(
  items: PatchEvaluatedMod[],
  modList: any[],
  activeGameSchema: any,
  t: (key: string, fallback?: string) => string
): PatchEvaluatedMod[] {
  if (!Array.isArray(items) || items.length <= 1) return items || [];

  const lookup = getVaultFamilyLookup(modList, activeGameSchema);
  const {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  } = getCachedVaultGroupLookups(modList || []);

  const listFamilyCounts = new Map<string, number>();
  const listSetCounts = new Map<string, number>();
  const twinCounts = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const raw = it.rawMod;
    const matchedVault =
      (raw?.hash
        ? vaultByHash.get(String(raw.hash).toLowerCase())
        : undefined) ||
      vaultUpdateLookup.get(String(raw?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(raw?.displayName || "").toLowerCase());

    const explicitFam = String(
      matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        raw?.baseFamilyId ||
        raw?.familyId ||
        ""
    )
      .split("@")[0]
      .trim();
    const selfDb = String(matchedVault?.dbId || raw?.dbId || "")
      .split("@")[0]
      .trim();

    if (
      explicitFam &&
      explicitFam !== "null" &&
      explicitFam !== "undefined" &&
      !explicitFam.startsWith("local_")
    ) {
      listFamilyCounts.set(
        explicitFam,
        (listFamilyCounts.get(explicitFam) || 0) + 1
      );
    }
    if (
      selfDb &&
      selfDb !== "null" &&
      selfDb !== "undefined" &&
      !selfDb.startsWith("local_") &&
      selfDb !== explicitFam
    ) {
      listFamilyCounts.set(selfDb, (listFamilyCounts.get(selfDb) || 0) + 1);
    }

    const setRaw = String(raw?.setId || matchedVault?.setId || "")
      .split("@")[0]
      .trim();
    if (setRaw && setRaw !== "null" && setRaw !== "undefined") {
      listSetCounts.set(setRaw, (listSetCounts.get(setRaw) || 0) + 1);
    }

    const twinNorm = normalizeModGroupTitle(it.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (it.author || "").toLowerCase().trim();
      const tKey = cr ? `${ cr }::${ twinNorm } ` : twinNorm;
      twinCounts.set(tKey, (twinCounts.get(tKey) || 0) + 1);
      twinCounts.set(twinNorm, (twinCounts.get(twinNorm) || 0) + 1);
    }
  }

  const resolveGroupKey = (item: PatchEvaluatedMod): string => {
    const raw = item.rawMod;
    if (raw) {
      const matchedVault =
        (raw.hash
          ? vaultByHash.get(String(raw.hash).toLowerCase())
          : undefined) ||
        vaultUpdateLookup.get(String(raw.name || "").toLowerCase()) ||
        vaultUpdateLookup.get(String(raw.displayName || "").toLowerCase());

      const origNorm = stripPriorityTierPrefix(
        String(raw._originalSetName || raw.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      const nameNorm = String(raw.name || "")
        .toLowerCase()
        .replace(/\\/g, "/");
      const hashNorm =
        raw.hash && !isWildcardVersion(raw.hash)
          ? String(raw.hash).trim().toLowerCase()
          : "";

      const mappedFolder =
        (origNorm && lookup.childNameToParentKey.get(origNorm)) ||
        (nameNorm && lookup.childNameToParentKey.get(nameNorm)) ||
        (hashNorm && lookup.childHashToParentKey.get(hashNorm));
      if (mappedFolder) return mappedFolder;

      const famRaw = String(raw.baseFamilyId || raw.familyId || "")
      const explicitFam = String(
        matchedVault?.baseFamilyId ||
          matchedVault?.familyId ||
          raw.baseFamilyId ||
          raw.familyId ||
          ""
      )
        .split("@")[0]
        .trim();
      if (famRaw && famRaw !== "null" && famRaw !== "undefined") {
        if (lookup.parentByKey.has(`set:${ famRaw } `)) return `set:${ famRaw } `;
      const selfDb = String(matchedVault?.dbId || raw.dbId || "")
        .split("@")[0]
        .trim();

      const famRaw =
        explicitFam &&
        explicitFam !== "null" &&
        explicitFam !== "undefined" &&
        !explicitFam.startsWith("local_")
          ? explicitFam
          : selfDb &&
              selfDb !== "null" &&
              selfDb !== "undefined" &&
              !selfDb.startsWith("local_") &&
              !raw.isCollection &&
              !matchedVault?.isCollection &&
              (virtualByFamilyId.has(selfDb) ||
                (vaultFamilyCounts.get(selfDb) || 0) > 1 ||
                (listFamilyCounts.get(selfDb) || 0) > 1)
            ? selfDb
            : "";

      if (famRaw) {
        if (lookup.parentByKey.has(`set:${ famRaw } `) || collectionBySetId.has(famRaw)) {
          return `set:${ famRaw } `;
        }
        return `fam:${ famRaw } `;
      }

      const setRaw = String(raw.setId || "").split("@")[0].trim();
      if (setRaw && setRaw !== "null" && setRaw !== "undefined") {
      const setRaw = String(raw.setId || matchedVault?.setId || "")
        .split("@")[0]
        .trim();
      if (
        setRaw &&
        setRaw !== "null" &&
        setRaw !== "undefined" &&
        (collectionBySetId.has(setRaw) ||
          (vaultSetCounts.get(setRaw) || 0) > 1 ||
          (listSetCounts.get(setRaw) || 0) > 1 ||
          lookup.parentByKey.has(`set:${ setRaw } `))
      ) {
        return `set:${ setRaw } `;
      }

      const fgRaw = String(raw.flavorGroupId || "").trim();
      const fgRaw = String(
        raw.flavorGroupId || matchedVault?.flavorGroupId || ""
      ).trim();
      if (fgRaw && fgRaw !== "null" && fgRaw !== "undefined") {
        return `flav:${ fgRaw } `;
      }

      const cgRaw = String(
        raw.communityGroupId || matchedVault?.communityGroupId || ""
      ).trim();
      if (cgRaw && cgRaw !== "null" && cgRaw !== "undefined") {
        return `comm:${ cgRaw } `;
      }
    }

    if (item.suiteKey && !item.suiteKey.startsWith("art:")) {
      return item.suiteKey;
    }

    const twinNorm = normalizeModGroupTitle(item.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (item.author || "").toLowerCase().trim();
      const tKey = cr ? `${ cr }::${ twinNorm } ` : twinNorm;
      if ((twinCounts.get(tKey) || 0) > 1) {
        return `twin:${ tKey } `;
      }
    if (twinNorm.length >= 3 && (twinCounts.get(twinNorm) || 0) > 1) {
      return `twin:${ twinNorm } `;
    }

    return item.key;
  };

  const buckets = new Map<string, PatchEvaluatedMod[]>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const gKey = resolveGroupKey(it);
    const arr = buckets.get(gKey);
    if (arr) arr.push(it);
    else buckets.set(gKey, [it]);
  }

  const result: PatchEvaluatedMod[] = [];
  buckets.forEach((members, gKey) => {
    if (members.length === 1) {
      result.push(members[0]);
      return;
    }
  const mergeEvaluatedGroup = (
    members: PatchEvaluatedMod[],
    gKey: string
  ): PatchEvaluatedMod => {
    if (members.length === 1) return members[0];

    const famSuffix = gKey.startsWith("fam:") ? gKey.slice(4) : "";
    const setSuffix = gKey.startsWith("set:") ? gKey.slice(4) : "";
    const parentMeta = lookup.parentByKey.get(gKey);
    const vaultFamilyParent = famSuffix
      ? virtualByFamilyId.get(famSuffix) || parentByDbId.get(famSuffix)
      : null;
    const vaultCollectionFolder = setSuffix
      ? collectionBySetId.get(setSuffix)
      : null;

    const coreMember =
      members.find((m) => {
        const selfDb = String(m.rawMod?.dbId || "").split("@")[0].trim();
        if (famSuffix && selfDb === famSuffix) return true;
        const rt = String(m.rawMod?.relationshipType || "").toLowerCase();
        return rt === "core" || rt === "parent" || Boolean(m.rawMod?.isParent);
      }) ||
      members.find((m) => m.downloadUrl || m.targetModVersion) ||
      members[0];

    const rawParentTitle = vaultFamilyParent
      ? formatCleanModTitle(
          formatDisplayName(
            vaultFamilyParent.displayName || vaultFamilyParent.name || ""
          )
        )
      : vaultCollectionFolder
        ? formatCleanModTitle(
            formatDisplayName(
              vaultCollectionFolder.displayName ||
                vaultCollectionFolder.name ||
                ""
            )
          )
        : "";
    const rawFlavorTitle = members[0]?.rawMod?.flavorGroupName
      ? formatCleanModTitle(formatDisplayName(members[0].rawMod.flavorGroupName))
      ? formatCleanModTitle(
          formatDisplayName(members[0].rawMod.flavorGroupName)
        )
      : "";
    const normalizedBaseTitle =
      formatCleanModTitle(normalizeModGroupTitle(coreMember.title)) ||
      coreMember.title;

    const folderTitle =
      parentMeta?.title || rawFlavorTitle || normalizedBaseTitle || coreMember.title;
    let folderTitle =
      parentMeta?.title ||
      (rawParentTitle
        ? formatCleanModTitle(normalizeModGroupTitle(rawParentTitle)) ||
          rawParentTitle
        : "") ||
      rawFlavorTitle ||
      normalizedBaseTitle ||
      coreMember.title;

    const isCollectionFolder = Boolean(
      parentMeta?.isCollection || gKey.startsWith("set:")
      parentMeta?.isCollection ||
        vaultCollectionFolder ||
        gKey.startsWith("set:")
    );

    const combinedRawMods: any[] = [];
    const seenRawSet = new Set<any>();
    const compatSet = new Set<string>();
    const combinedIssues: StackedModIssue[] = [];
    const seenIssueKeys = new Set<string>();
    const combinedDepTargets: MissingDepTarget[] = [];
    const seenDepTargetKeys = new Set<string>();
    const flatMembers: PatchEvaluatedMod[] = [];
    let hasAnyScript = false;

    for (let i = 0; i < members.length; i++) {
      const mem = members[i];
      if (mem.isScript) hasAnyScript = true;
      if (Array.isArray(mem.memberEvaluations) && mem.memberEvaluations.length > 0) {
        for (let k = 0; k < mem.memberEvaluations.length; k++) {
          flatMembers.push(mem.memberEvaluations[k]);
        }
      } else {
        flatMembers.push(mem);
      }
      for (let j = 0; j < mem.compatibleVersions.length; j++) {
        compatSet.add(mem.compatibleVersions[j]);
      }
      for (let j = 0; j < mem.groupedMods.length; j++) {
        const gm = mem.groupedMods[j];
        if (gm && !seenRawSet.has(gm)) {
          seenRawSet.add(gm);
          combinedRawMods.push(gm);
        }
      }
      if (Array.isArray(mem.issues)) {
        for (let j = 0; j < mem.issues.length; j++) {
          const iss = mem.issues[j];
          const ik = `${ iss.category }::${ iss.title }::${ iss.detail || "" } `;
          if (!seenIssueKeys.has(ik)) {
            seenIssueKeys.add(ik);
            combinedIssues.push(iss);
          }
        }
      }
      if (Array.isArray(mem.missingDepTargets)) {
        for (let j = 0; j < mem.missingDepTargets.length; j++) {
          const dt = mem.missingDepTargets[j];
          const dk = dt.name.toLowerCase();
          if (!seenDepTargetKeys.has(dk)) {
            seenDepTargetKeys.add(dk);
            combinedDepTargets.push(dt);
          }
        }
      }
    }

    const hasRootParentInMembers = famSuffix
      ? flatMembers.some(
          (m) => String(m.rawMod?.dbId || "").split("@")[0].trim() === famSuffix
        )
      : true;
    if (
      coreMember.issueKind === "dependency" &&
      !hasRootParentInMembers &&
      combinedDepTargets.some(
        (dt) => dt.name.toLowerCase() === folderTitle.toLowerCase()
      )
    ) {
      const modulesWord = t("badge_modules_count", "Modules");
      if (!folderTitle.toLowerCase().includes(modulesWord.toLowerCase())) {
        folderTitle = `${ folderTitle } (${ modulesWord })`;
      }
    }

    const bestAuthor =
      parentMeta?.author || members.find((m) => m.author)?.author || null;
      (parentMeta?.author && isKnownCreatorName(parentMeta.author)
        ? parentMeta.author
        : null) ||
      extractValidCreator(vaultFamilyParent, vaultCollectionFolder) ||
      members.find((m) => isKnownCreatorName(m.author))?.author ||
      parentMeta?.author ||
      members.find((m) => m.author)?.author ||
      null;
    const bestDownloadUrl =
      members.find((m) => m.downloadUrl)?.downloadUrl || parentMeta?.url || null;
      members.find((m) => m.downloadUrl)?.downloadUrl ||
      parentMeta?.url ||
      vaultFamilyParent?.download_url ||
      vaultFamilyParent?.url ||
      vaultCollectionFolder?.url ||
      null;
    const bestTargetVer =
      members.find((m) => m.targetModVersion)?.targetModVersion || null;
    const bestInstVer =
      members.find((m) => m.installedVersion)?.installedVersion || null;

    result.push({
    return {
      ...coreMember,
      key: `group:${ gKey }:${ coreMember.bucket }:${ coreMember.source } `,
      suiteKey: gKey,
      title: folderTitle,
      author: bestAuthor,
      icon: isCollectionFolder
        ? t("icon_inventory_2", "inventory_2")
        : t("icon_folder_special", "folder_special"),
      isScript: hasAnyScript,
      isCollectionFolder,
      moduleCount: Math.max(members.length, combinedRawMods.length),
      moduleCount: Math.max(flatMembers.length, combinedRawMods.length),
      installedVersion: bestInstVer,
      targetModVersion: bestTargetVer,
      compatibleVersions: Array.from(compatSet),
      downloadUrl: bestDownloadUrl,
      groupedMods: combinedRawMods,
      memberEvaluations: members,
    });
      memberEvaluations: flatMembers,
      issues: combinedIssues.length > 0 ? combinedIssues : coreMember.issues,
      missingDepTargets:
        combinedDepTargets.length > 0
          ? combinedDepTargets
          : coreMember.missingDepTargets,
    };
  };

  const passOneEntries: PatchEvaluatedMod[] = [];
  buckets.forEach((members, gKey) => {
    passOneEntries.push(mergeEvaluatedGroup(members, gKey));
  });

  return result;
  // Second pass: merge prefix-based Addons/Modules and equal-normalized-title twins into their parent mod card
  const mergedOut = new Set<number>();
  for (let i = 0; i < passOneEntries.length; i++) {
    if (mergedOut.has(i)) continue;
    let parent = passOneEntries[i];
    const pTitle = String(parent.title || "").trim();
    if (pTitle.length < 4) continue;
    const pLower = pTitle.toLowerCase();
    const pNorm = normalizeModGroupTitle(pTitle).toLowerCase().trim();

    for (let j = 0; j < passOneEntries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = passOneEntries[j];
      const cTitle = String(candidate.title || "").trim();
      const cLower = cTitle.toLowerCase();
      const cNorm = normalizeModGroupTitle(cTitle).toLowerCase().trim();

      const isEqualTwin = Boolean(
        pNorm.length >= 4 &&
          pNorm === cNorm &&
          !parent.isCollectionFolder &&
          !candidate.isCollectionFolder
      );
      const isPrefixAddon =
        isEqualTwin ||
        (cLower.length > pLower.length &&
          cLower.startsWith(pLower) &&
          /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
            cTitle.slice(pTitle.length)
          ));

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent = mergeEvaluatedGroup(
          [parent, candidate],
          parent.suiteKey || `merged:${ pNorm } `
        );
        passOneEntries[i] = parent;
      }
    }
  }

  return passOneEntries.filter((_, idx) => !mergedOut.has(idx));
}

function matchesPatchSearchQuery(item: PatchEvaluatedMod, q: string): boolean {
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.author && item.author.toLowerCase().includes(q)) return true;
  if (item.reasonLabel.toLowerCase().includes(q)) return true;
  if (Array.isArray(item.memberEvaluations)) {
    for (let i = 0; i < item.memberEvaluations.length; i++) {
      const mem = item.memberEvaluations[i];
      if (
        mem.title.toLowerCase().includes(q) ||
        (mem.author && mem.author.toLowerCase().includes(q)) ||
        String(mem.rawMod?.name || "").toLowerCase().includes(q)
      ) {
        return true;
      }
    }
  }
  return false;
}

function equipMissingDepsIntoBlueprint(
  blueprintName: string | undefined,
  depsToEquip: MissingDepTarget[],
  t: (key: string, fallback?: string) => string
) {
  if (!Array.isArray(depsToEquip) || depsToEquip.length === 0) return;
  const store = useStore.getState();
  const currentSets = Array.isArray(store.playSets) ? store.playSets : [];
  if (currentSets.length === 0) return;

  const targetIdx = blueprintName
    ? currentSets.findIndex((ps: any) => ps?.name === blueprintName)
    : store.activePlaySetIndex;
  const resolvedIdx = targetIdx >= 0 ? targetIdx : store.activePlaySetIndex;
  const targetSet = currentSets[resolvedIdx];
  if (!targetSet) return;

  const allVaultMods: any[] = Array.isArray(store.modList) ? store.modList : [];
  const schema = store.activeGameSchema;
  const namesToAdd: string[] = [];
  const hashesToAdd: Record<string, string> = {};
  const equippedLabels: string[] = [];

  for (let i = 0; i < depsToEquip.length; i++) {
    const dep = depsToEquip[i];
    if (!dep?.vaultModName) continue;
    const primaryVm = allVaultMods.find(
      (vm: any) =>
        vm &&
        !vm.isVirtual &&
        !vm.isCollection &&
        String(vm.name || "").toLowerCase() === dep.vaultModName!.toLowerCase()
    );
    if (!primaryVm) {
      namesToAdd.push(dep.vaultModName);
      equippedLabels.push(dep.name);
      continue;
    }

    equippedLabels.push(dep.name);
    const primaryBase = cleanSearchName(primaryVm.name, schema)
      .toLowerCase()
      .trim();
    const anchorFam = String(
      primaryVm.baseFamilyId || primaryVm.familyId || primaryVm.dbId || ""
    )
      .split("@")[0]
      .trim();

    for (let j = 0; j < allVaultMods.length; j++) {
      const vm = allVaultMods[j];
      if (!vm || vm.isVirtual || vm.isCollection || !vm.name) continue;
      const isSelf = vm.name === primaryVm.name;
      const vmBase = cleanSearchName(vm.name, schema).toLowerCase().trim();
      const isTwinBase =
        Boolean(primaryBase) && vmBase === primaryBase && !isSelf;
      const vmFam = String(vm.baseFamilyId || vm.familyId || vm.dbId || "")
        .split("@")[0]
        .trim();
      const rel = String(vm.relationshipType || "").toLowerCase();
      const isCoreTwinSibling =
        Boolean(anchorFam) &&
        anchorFam !== "null" &&
        anchorFam !== "undefined" &&
        !anchorFam.startsWith("local_") &&
        vmFam === anchorFam &&
        (rel === "core" || rel === "twin" || (!rel && isTwinBase)) &&
        (!vm.flavorGroupId ||
          !primaryVm.flavorGroupId ||
          String(vm.flavorGroupId) === String(primaryVm.flavorGroupId));

      if (isSelf || isTwinBase || isCoreTwinSibling) {
        namesToAdd.push(vm.name);
        if (vm.hash) {
          hashesToAdd[vm.name] = String(vm.hash);
        }
      }
    }
  }

  if (namesToAdd.length === 0) return;

  const existingMods = Array.isArray(targetSet.mods) ? targetSet.mods : [];
  const mergedMods = deduplicateBlueprintArtifacts(
    [...existingMods, ...namesToAdd],
    schema
  );
  const nextSet = {
    ...targetSet,
    mods: mergedMods,
    modHashes: {
      ...(targetSet.modHashes || {}),
      ...hashesToAdd,
    },
  };
  const nextSets = [...currentSets];
  nextSets[resolvedIdx] = nextSet;
  store.setPlaySets(nextSets);

  store.pushStatus(
    t("patch_sim_equipped_dep_toast", 'Equipped {0} into "{1}".')
      .replace("{0}", equippedLabels.join(", "))
      .replace("{1}", targetSet.name),
    "success"
  );
}

const PatchModRowCard = React.memo(function PatchModRowCard({
  item,
}: {
  item: PatchEvaluatedMod;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const showImages = useStore((s) => s.showImages);
  const [isExpanded, setIsExpanded] = useState(false);

  const hasMembers =
    Array.isArray(item.memberEvaluations) && item.memberEvaluations.length > 1;
  const groupedMods = useMemo(
    () =>
      Array.isArray(item.groupedMods) && item.groupedMods.length > 0
        ? item.groupedMods
        : [item.rawMod].filter(Boolean),
    [item.groupedMods, item.rawMod]
  );
  const hasMultipleModules = groupedMods.length > 1;

  const missingDepTargets = useMemo(
    () =>
      Array.isArray(item.missingDepTargets) ? item.missingDepTargets : [],
    [item.missingDepTargets]
  );
  const vaultDepsToEquip = useMemo(
    () => missingDepTargets.filter((d) => Boolean(d.vaultModName)),
    [missingDepTargets]
  );

  const imageUrl = showImages
    ? item.rawMod?.image_url || item.rawMod?.imageUrl || null
    : null;

  const bucketIcon =
    item.bucket === "blocking"
      ? item.issueKind === "dependency"
        ? t("icon_extension", "extension")
        : item.issueKind === "dlc"
          ? t("icon_currency_exchange", "currency_exchange")
          : item.issueKind === "conflict"
            ? t("icon_error", "error")
            : item.issueKind === "corrupted"
              ? t("icon_broken_image", "broken_image")
              : t("icon_gpp_bad", "gpp_bad")
      : item.source === "vault_archive"
        ? t("icon_history", "history")
        : item.source === "dep_update_pending"
          ? t("icon_extension", "extension")
          : item.bucket === "update_ready"
            ? t("icon_download", "download")
            ? t("icon_new_releases", "new_releases")
            : t("icon_check_circle", "check_circle");

  const bucketIconColor =
    item.bucket === "blocking"
      ? "text-[var(--danger)]"
      : item.bucket === "update_ready"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";
      : item.source === "cloud_update"
        ? "text-[var(--accent)]"
        : item.bucket === "update_ready"
          ? "text-[var(--warning)]"
          : "text-[var(--success)]";

  const bucketBadgeText =
    item.bucket === "blocking"
      ? item.issueKind === "dependency"
        ? t("badge_missing_dep", "Missing Dependency")
        : item.issueKind === "dlc"
          ? t("missing_dlc", "Missing DLC")
          : item.issueKind === "conflict"
            ? t("fatal_conflict", "Fatal Conflict")
            : item.issueKind === "corrupted"
              ? t("status_corrupted", "Corrupted")
              : t("patch_sim_awaiting_short", "Awaiting Patch")
      : item.source === "vault_archive"
        ? t("version_pool_badge_auto_swap", "Auto-Swap")
        : item.source === "dep_update_pending"
          ? t("patch_sim_dep_update_chip", "Pending Dep Update")
          : item.bucket === "update_ready"
            ? t("updates_avail", "Updates Available")
            ? t("btn_update", "Update")
            : t("patch_sim_ready_label", "Ready");

  const gameVerChipLabel = formatGameVersionChipLabel(
    item.compatibleVersions,
    t("any", "Any")
  );

  const stackedIssues = useMemo((): Array<{
    type: "red" | "amber";
    issueLabel: string;
    icon: string;
    tooltipLines: string[];
  }> => {
    const rawIssues = Array.isArray(item.issues) ? item.issues : [];
    if (item.bucket !== "blocking") return [];
    if (rawIssues.length > 0) {
      return rawIssues.map((iss) => {
        if (iss.category === "missing_deps") {
          const depName =
            iss.depTarget?.name || iss.detail || t("unknown", "Unknown");
          const hint = iss.depTarget?.vaultModName
            ? t(
                "dep_in_vault_equip_hint",
                "In {Vault} — Click + on card to equip"
              )
            : iss.depTarget?.sourceHost
              ? `${ t("source", "Source") }: ${ iss.depTarget.sourceHost } `
              : t(
                  "dep_click_download_hint",
                  "Click download icon on card to get it"
                );
          return {
            type: iss.type,
            issueLabel: t("badge_missing_dep", "Missing Dependency"),
            icon: iss.icon || t("icon_extension", "extension"),
            tooltipLines: [
              `${ t("tooltip_required", "Required:") } ${ depName } `,
              hint,
            ],
          };
        }
        if (iss.category === "missing_dlc") {
          return {
            type: iss.type,
            issueLabel: t("missing_dlc", "Missing DLC"),
            icon: iss.icon || t("icon_currency_exchange", "currency_exchange"),
            tooltipLines: [
              `${ t("tooltip_required", "Required:") } ${
  iss.detail || t("unknown", "Unknown")
} `,
            ],
          };
        }
        if (iss.category === "version_mismatch") {
          const lines: string[] = [];
          if (iss.installedVersion) {
            lines.push(`${ t("installed", "Installed") }: ${ iss.installedVersion } `);
          }
          if (iss.requiredVersion) {
            lines.push(
              `${ t("tooltip_required", "Required:") } ${ iss.requiredVersion } `
            );
          } else if (iss.detail) {
            lines.push(iss.detail);
          }
          return {
            type: iss.type,
            issueLabel: bucketBadgeText,
            icon: bucketIcon,
            tooltipLines: lines.length > 0 ? lines : [item.reasonLabel],
          };
        }
        return {
          type: iss.type,
          issueLabel: iss.title || bucketBadgeText,
          icon: iss.icon || bucketIcon,
          tooltipLines: iss.detail ? [iss.detail] : [item.reasonLabel],
        };
      });
    }
    return [
      {
        type: "red",
        issueLabel: bucketBadgeText,
        icon: bucketIcon,
        tooltipLines: [item.reasonLabel],
      },
    ];
  }, [
    item.bucket,
    item.issues,
    bucketBadgeText,
    bucketIcon,
    item.reasonLabel,
    t,
  ]);

  const extraIssueCount = Math.max(0, stackedIssues.length - 1);
  const fallbackTypeLabel = item.isScript
    ? t("type_script", "Script")
    : t("term_mod", "{Mod}");

  const depCalloutLine =
    missingDepTargets.length > 0
      ? `${ t("required", "Required") }: ${
  missingDepTargets
    .map((d) => d.name)
  .join(", ")
} `
      : item.source === "dep_update_pending"
        ? item.reasonLabel
        : null;

  return (
    <div
      onClick={() =>
        openModDossier(
          item.groupedMods.length > 1
          hasMultipleModules
            ? {
                ...item.rawMod,
                displayName: item.title,
                isVirtual: true,
                flavors: item.groupedMods,
                flavors: groupedMods,
              }
            : item.rawMod
        )
      }
      className={`glass - panel rounded - 2xl p - 3.5 border border - [color - mix(in_srgb,var(--text)_10 %, transparent)]hover: border - [color - mix(in_srgb,var(--accent)_40 %, transparent)]transition - all flex flex - col gap - 2.5 cursor - pointer group h - full ${
  isExpanded && hasMembers ? "sm:col-span-2" : ""
  className = {`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer relative ${isExpanded && hasMultipleModules ? "sm:col-span-2" : ""
    }`
}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${bucketIconColor}`}
        >
          <span className="material-symbols-outlined !text-[20px]">
            {item.icon}
          </span>
        </div>
      {/* Top Tier: Icon Well / Cover + Title & Creator Identity */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {imageUrl ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img
              src={imageUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${bucketIconColor}`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {item.icon}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {item.title}
            </span>
            <HoverTooltip
              className="z-[100]"
              title={item.title}
              subtitle={item.reasonLabel}
              icon={item.icon}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {item.author ? (
              <span className="truncate opacity-85">{`${t("by", "By")} ${item.author}`}</span>
            ) : (
              <span className="opacity-85 shrink-0">
                {item.isScript ? t("type_script", "Script") : t("term_mod", "{Mod}")}
              </span>
            )}
            {item.moduleCount > 1 && (
            <span className="truncate opacity-85">
              {item.author
                ? formatCleanModTitle(item.author)
                : fallbackTypeLabel}
            </span>
            {hasMultipleModules && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <button
                  type="button"
                  onClick={(e) => {
                    if (!hasMembers) return;
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }}
                  className={`shrink-0 inline-flex items-center gap-0.5 ${
                    hasMembers
                      ? "text-[var(--accent)] hover:underline cursor-pointer"
                      : "opacity-85"
                <span className="opacity-85 shrink-0">
                  {`${groupedMods.length} ${
                    item.isCollectionFolder
                      ? t("term_mods", "{Mods}")
                      : t("badge_modules_count", "Modules")
                  }`}
                >
                  <span>
                    {`${item.moduleCount} ${
                      item.isCollectionFolder
                        ? t("term_mods", "{Mods}")
                        : t("badge_modules_count", "Modules")
                    }`}
                  </span>
                </button>
                </span>
              </>
            )}
            {item.targetModVersion && item.targetModVersion !== item.installedVersion ? (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--accent)] shrink-0">
                  {`↑ v${item.targetModVersion}`}
                </span>
              </>
            ) : item.installedVersion ? (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  {`v${item.installedVersion}`}
                </span>
              </>
            ) : null}
          </div>

          {depCalloutLine && (
            <div className="relative group/depcallout flex items-center min-w-0 w-fit max-w-full mt-0.5">
              <span className="text-[11px] font-medium text-[var(--subtext)] truncate">
                {depCalloutLine}
              </span>
              <HoverTooltip
                className="z-[100]"
                title={bucketBadgeText}
                subtitle={depCalloutLine}
                icon={bucketIcon}
                variant={item.bucket === "blocking" ? "danger" : "warning"}
              />
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] font-medium text-[var(--subtext)] opacity-85 truncate m-0">
        {item.reasonLabel}
      </p>

{
  isExpanded && hasMembers && (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-xl glass-surface p-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar animate-in fade-in duration-200"
    >
      {item.memberEvaluations!.map((member) => {
        const rawFile = String(
          member.rawMod?._originalSetName || member.rawMod?.name || ""
        );
        const extLabel = rawFile
          ? getFileLabel(rawFile, activeGameSchema)
          : "";
        return (
          <button
            key={member.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openModDossier(member.rawMod);
            }}
            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-left transition-all cursor-pointer group/mem min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`material-symbols-outlined !text-[15px] shrink-0 ${member.isScript
                    ? "text-[var(--warning)]"
                    : "text-[var(--accent)]"
                  }`}
              >
                {member.isScript
                  ? t("icon_terminal", "terminal")
                  : t("icon_deployed_code", "deployed_code")}
              </span>
              <span className="text-[11.5px] font-bold text-[var(--text)] group-hover/mem:text-[var(--accent)] truncate transition-colors">
                {member.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {member.installedVersion && (
                <span className="text-[9.5px] font-mono font-bold text-[var(--subtext)] opacity-75">
                  {`v${member.installedVersion}`}
                </span>
              )}
              {extLabel && (
                <span className="text-[9px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] opacity-85">
                  {extLabel}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  )
}

<div className="pt-2.5 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
    <span className={VAULT_CHIP_CLASS}>
      {/* Bottom Telemetry & Action Bar: Single Status Badge on Left | Uniform Action Icon Buttons on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`relative group/patchchip ${VAULT_CHIP_CLASS} ${item.source === "cloud_update" ? "font-mono" : ""
              }`}
          >
            <span
              className={`material-symbols-outlined !text-[12px] shrink-0 ${bucketIconColor}`}
            >
              {bucketIcon}
            </span>
            <span>{bucketBadgeText}</span>
          </span>
          {item.source === "cloud_update" ? (
            item.installedVersion &&
              item.targetModVersion &&
              item.installedVersion !== item.targetModVersion ? (
              <>
                <span className="text-[var(--subtext)]">
                  {`v${item.installedVersion} → `}
                </span>
                <span>{`v${item.targetModVersion}`}</span>
              </>
            ) : item.targetModVersion ? (
              <span>{`v${item.targetModVersion}`}</span>
            ) : item.installedVersion ? (
              <span>{`v${item.installedVersion}`}</span>
            ) : (
              <span>{bucketBadgeText}</span>
            )
          ) : item.bucket === "ready" && item.installedVersion ? (
            <span className="font-mono">{`v${item.installedVersion}`}</span>
          ) : (
            <span>{bucketBadgeText}</span>
          )}
          {extraIssueCount > 0 && (
            <span className="opacity-75">{`+${extraIssueCount}`}</span>
          )}

          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)] shrink-0">
              {t("icon_sports_esports", "sports_esports")}
            </span>
            <span>{gameVerChipLabel}</span>
            <HoverTooltip
              className="z-[100] !left-0 !translate-x-0"
              title={bucketBadgeText}
              icon={bucketIcon}
              variant={
                item.bucket === "blocking"
                  ? "danger"
                  : item.source === "cloud_update"
                    ? "accent"
                    : "default"
              }
              content={
                item.bucket === "blocking" ? (
                  <div className="flex flex-col items-start gap-2 min-w-[185px]">
                    {stackedIssues.map((r, rIdx) => (
                      <div
                        key={rIdx}
                        className="flex flex-col items-start gap-0.5 text-left w-full"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide leading-snug text-[var(--text)]">
                          <span
                            className={`material-symbols-outlined !text-[14px] shrink-0 ${r.type === "amber"
                                ? "text-[var(--warning)]"
                                : "text-[var(--danger)]"
                              }`}
                          >
                            {r.icon}
                          </span>
                          <span>{r.issueLabel}</span>
                        </div>
                        {r.tooltipLines.length > 0 && (
                          <div className="flex flex-col gap-0.5 pl-5 text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                            {r.tooltipLines.map((line, lIdx) => (
                              <span key={lIdx} className="break-words">
                                {line}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="pt-1.5 mt-0.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full flex flex-col gap-0.5 font-mono text-[10.5px] text-left">
                      {item.installedVersion && (
                        <div>
                          <span className="opacity-70">
                            {t("installed", "Installed")}:
                          </span>{" "}
                          <span className="font-bold text-[var(--text)]">
                            {`v${item.installedVersion}`}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="opacity-70">
                          {t("compatible", "Compatible")}:
                        </span>{" "}
                        <span className="font-bold text-[var(--text)]">
                          {gameVerChipLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-left font-mono text-[11px] min-w-[165px]">
                    {item.installedVersion && (
                      <div>
                        <span className="opacity-70">
                          {t("installed", "Installed")}:
                        </span>{" "}
                        <span className="font-bold text-[var(--text)]">
                          {`v${item.installedVersion}`}
                        </span>
                      </div>
                    )}
                    {item.targetModVersion && (
                      <div>
                        <span className="opacity-70">
                          {item.source === "vault_archive"
                            ? t("version_pool_badge_auto_swap", "Auto-Swap")
                            : t("latest", "Latest")}
                          :
                        </span>{" "}
                        <span className="font-bold text-[var(--accent)]">
                          {`v${item.targetModVersion}`}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="opacity-70">
                        {t("compatible", "Compatible")}:
                      </span>{" "}
                      <span className="font-bold text-[var(--text)]">
                        {gameVerChipLabel}
                      </span>
                    </div>
                    {item.source === "dep_update_pending" && (
                      <div className="font-sans pt-1 text-[var(--subtext)]">
                        {item.reasonLabel}
                      </div>
                    )}
                  </div>
                )
              }
            />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasMembers && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {hasMultipleModules && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }}
                  className={`relative w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer ${className = {`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${isExpanded
                        ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                          ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[14px]">
                {isExpanded
                  ? t("icon_expand_less", "expand_less")
                  : t("icon_account_tree", "account_tree")}
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                title={
                  isExpanded
                    ? t("collapse_modules", "Hide Modules")
                    : `${t("inspect", "Inspect")} (${ item.moduleCount })`
                }
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${
                item.isCollectionFolder
                  ? t("term_mods", "{Mods}")
                  : t("badge_modules_count", "Modules")
              }`}
              icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {item.downloadUrl && item.bucket !== "ready" && (
            {
              vaultDepsToEquip.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPatchModUrl(item.downloadUrl!);
                    equipMissingDepsIntoBlueprint(
                      item.blueprintName,
                      vaultDepsToEquip,
                      t
                    );
                  }}
                  className="relative group/actbtn h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[9.5px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                  className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {item.source === "cloud_update"
                      < span className="material-symbols-outlined !text-[15px]">
                    {t("icon_add_link", "add_link")}
                  </span>
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    title={`${t("equip", "Equip")}: ${vaultDepsToEquip
                      .map((d) => d.name)
                      .join(", ")}`}
                    subtitle={t(
                      "dep_equip_from_vault_sub",
                      "Already in {Vault} — equip into this {Blueprint}"
                    )}
                    icon={t("icon_add_link", "add_link")}
                    variant="accent"
                  />
                </button>
              )
            }

          {missingDepTargets.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const primaryDep = missingDepTargets[0];
                if (primaryDep?.url) {
                  openPatchModUrl(primaryDep.url);
                }
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {missingDepTargets[0].sourceHost
                  ? t("icon_download", "download")
                  : t("icon_open_in_new", "open_in_new")}
                  : t("icon_travel_explore", "travel_explore")}
              </span>
              <span>
                {item.source === "cloud_update"
                  ? t("patch_sim_btn_get_update", "Get Update")
                  : t("inspect", "Inspect")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${t("btn_get_dependency", "Get Dependency")}: ${missingDepTargets
                  .map((d) => d.name)
                  .join(", ")}`}
                subtitle={
                  missingDepTargets[0].sourceHost
                    ? `${t("source", "Source")}: ${missingDepTargets[0].sourceHost}`
                    : t("search_for_dependency", "Find & download required {mod}")
                }
                icon={
                  missingDepTargets[0].sourceHost
                    ? t("icon_download", "download")
                    : t("icon_travel_explore", "travel_explore")
                }
                variant="accent"
              />
            </button>
          )}

          {item.downloadUrl &&
            item.bucket !== "ready" &&
            missingDepTargets.length === 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPatchModUrl(item.downloadUrl!);
                }}
                className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_open_in_new", "open_in_new")}
                </span>
                <HoverTooltip
                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                  title={
                    item.source === "cloud_update"
                      ? t("btn_update", "Update")
                      : t("inspect", "Inspect")
                  }
                  icon={
                    item.source === "cloud_update"
                      ? t("icon_update", "update")
                      : t("icon_open_in_new", "open_in_new")
                  }
                  variant="accent"
                />
              </button>
            )}
        </div>
      </div>

      {/* Compact Recessed Linked Modules Drawer (Matching Updates Panel) */}
      {isExpanded && hasMultipleModules && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200 cursor-default"
        >
          <div className="max-h-[196px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {groupedMods.map((gm: any, gIdx: number) => {
                const gmName =
                  formatAddonModuleName(gm, activeGameSchema) ||
                  formatCleanModTitle(
                    formatDisplayName(gm?.displayName || gm?.name || "")
                  );
                const gmIsScript = isScriptExtension(
                  String(gm?.name || gm?._originalSetName || ""),
                  activeGameSchema
                );
                return (
                  <div
                    key={`${gm?.name || gIdx}-${gIdx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openModDossier(gm);
                    }}
                    className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2 cursor-pointer transition-all"
                  >
                    <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                        {gmIsScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)] truncate">
                        {gmName}
                      </span>
                      <HoverTooltip
                        className="z-[100]"
                        title={gmName}
                        icon={
                          gmIsScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")
                        }
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70 shrink-0">
                      {gmIsScript
                        ? t("type_script", "Script")
                        : item.isCollectionFolder
                          ? t("term_mod", "{Mod}")
                          : t("type_package", "Module")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
  </div>
  );
});

  function PatchCategorizedGroupSection({
    title,
    icon,
    items,
    emptyTitle,
    headerAction,
}: {
    title: string;
  icon: string;
  items: PatchEvaluatedMod[];
  emptyTitle?: string;
  headerAction?: React.ReactNode;
}) {
  const {t} = useLexicon();
  const [visibleCount, setVisibleCount] = useState<number>(DRAWER_PAGE_SIZE);

  useEffect(() => {
      setVisibleCount(DRAWER_PAGE_SIZE);
  }, [items]);

    const paged = items.slice(0, visibleCount);
    const remaining = Math.max(0, items.length - visibleCount);

    return (
    <UniversalGroup title={title} icon={icon} actions={headerAction}>
      {items.length === 0 ? (
        <EmptyState
          icon={t("icon_task_alt", "task_alt")}
          title={emptyTitle || t("none", "None")}
          minHeightClass="min-h-[140px]"
        />
      ) : (
        <div className="flex flex-col gap-4 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {paged.map((item) => (
              <PatchModRowCard key={item.key} item={item} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="flex items-center justify-center pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more", "Load More")} (${remaining})`}
                onClick={() =>
                  startTransition(() =>
                    setVisibleCount((prev) => prev + DRAWER_PAGE_SIZE)
                  )
                }
              />
            </div>
          )}
        </div>
      )}
    </UniversalGroup>
    );
}

    export function BlueprintPatchReadinessSidePanel({
      isOpen,
      onClose,
      initialBlueprintName,
      initialBucket,
      initialSubFilter,
      readiness: externalReadiness,
    onOpenFullTool,
    onTriggerShelter: _onTriggerShelter,
    onNavigateView,
}: {
      isOpen: boolean;
  onClose: () => void;
    initialBlueprintName?: string | null;
    initialBucket?: PatchModBucket | null;
    initialSubFilter?: PatchPanelSubFilter | null;
    readiness?: ReturnType<typeof useBlueprintPatchReadiness>;
  onOpenFullTool?: () => void;
  onTriggerShelter?: (lock: boolean) => void;
  onNavigateView?: (view: string) => void;
}) {
  const {t} = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const modList = useStore((s) => s.modList);
  const setSelectedVersion = useStore((s) => s.setSelectedVersion);
      const internalReadiness = useBlueprintPatchReadiness({
        skip: !isOpen || Boolean(externalReadiness),
  });
      const readiness = externalReadiness || internalReadiness;

      const [selectedBpName, setSelectedBpName] = useState<string>("");
        const [bucketFilter, setBucketFilter] = useState<PatchModBucket>("blocking");
          const [subFilter, setSubFilter] = useState<PatchPanelSubFilter>("all");
            const [searchQuery, setSearchQuery] = useState("");
            const [clonedNameFeedback, setClonedNameFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialBlueprintName !== undefined) {
              setSelectedBpName(initialBlueprintName || "");
    }
  }, [isOpen, initialBlueprintName]);

  const activeReport = useMemo(() => {
    if (selectedBpName) {
      const found = readiness.blueprintReports.find(
        (r) => r.blueprintName === selectedBpName
            );
            if (found) return found;
    }
            if (initialBlueprintName) {
      const found = readiness.blueprintReports.find(
        (r) => r.blueprintName === initialBlueprintName
            );
            if (found) return found;
    }
            return readiness.activeBlueprintReport;
  }, [selectedBpName, initialBlueprintName, readiness]);

  useEffect(() => {
    if (!isOpen || !activeReport) return;
            if (initialBucket) {
              setBucketFilter(initialBucket);
            setSubFilter(initialSubFilter || "all");
            return;
    }
            if (
            initialSubFilter &&
            (initialSubFilter === "direct_update" ||
            initialSubFilter === "dep_update" ||
            initialSubFilter === "auto_swap")
            ) {
              setBucketFilter("update_ready");
            setSubFilter(initialSubFilter);
            return;
    }
    if (activeReport.blockingMods.length > 0) setBucketFilter("blocking");
    else if (activeReport.updatableMods.length > 0) setBucketFilter("update_ready");
            else setBucketFilter("ready");
            setSubFilter("all");
  }, [
            isOpen,
            activeReport?.blueprintName,
            readiness.targetVersion,
            initialBucket,
            initialSubFilter,
            ]);

  const groupedBuckets = useMemo(() => {
    if (!isOpen || !activeReport) {
      return {
              blockingDirect: [] as PatchEvaluatedMod[],
            blockingDep: [] as PatchEvaluatedMod[],
            blockingAll: [] as PatchEvaluatedMod[],
            directUpdates: [] as PatchEvaluatedMod[],
            depUpdates: [] as PatchEvaluatedMod[],
            autoSwaps: [] as PatchEvaluatedMod[],
            readyGroups: [] as PatchEvaluatedMod[],
      };
    }

            const rawBlockingDirect = activeReport.blockingMods.filter(
      (m) => m.issueKind !== "dependency"
            );
            const rawBlockingDep = activeReport.blockingMods.filter(
      (m) => m.issueKind === "dependency"
            );

            const blockingDirect = groupPatchEvaluatedMods(
            rawBlockingDirect,
            modList,
            activeGameSchema,
            t
            );
            const blockingDep = groupPatchEvaluatedMods(
            rawBlockingDep,
            modList,
            activeGameSchema,
            t
            );
            const directUpdates = groupPatchEvaluatedMods(
            activeReport.directUpdateMods || [],
            modList,
            activeGameSchema,
            t
            );
            const depUpdates = groupPatchEvaluatedMods(
            activeReport.depUpdateMods || [],
            modList,
            activeGameSchema,
            t
            );
            const autoSwaps = groupPatchEvaluatedMods(
            activeReport.autoSwapMods || [],
            modList,
            activeGameSchema,
            t
            );
            const readyGroups =
            bucketFilter === "ready"
            ? groupPatchEvaluatedMods(
            activeReport.readyMods || [],
            modList,
            activeGameSchema,
            t
            )
            : [];

            return {
              blockingDirect,
              blockingDep,
              blockingAll: [...blockingDirect, ...blockingDep],
            directUpdates,
            depUpdates,
            autoSwaps,
            readyGroups,
    };
  }, [isOpen, activeReport, modList, activeGameSchema, bucketFilter, t]);

            const guidedQueue = useMemo(
    () =>
            activeReport
            ? buildPatchGuidedUpdateQueue(
            activeReport.directUpdateMods || [],
            activeGameSchema
            )
            : [],
            [activeReport, activeGameSchema]
            );

            if (!isOpen) return null;

            const q = searchQuery.trim().toLowerCase();

  const filteredDirectUpdates = groupedBuckets.directUpdates.filter((g) =>
            matchesPatchSearchQuery(g, q)
            );
  const filteredDepUpdates = groupedBuckets.depUpdates.filter((g) =>
            matchesPatchSearchQuery(g, q)
            );
  const filteredAutoSwaps = groupedBuckets.autoSwaps.filter((g) =>
            matchesPatchSearchQuery(g, q)
            );
  const filteredBlockingDirect = groupedBuckets.blockingDirect.filter((g) => {
    if (!matchesPatchSearchQuery(g, q)) return false;
            if (subFilter === "awaiting_mason") return g.issueKind === "version" || !g.issueKind;
            if (subFilter === "missing_dlc") return g.issueKind === "dlc";
            if (subFilter === "corrupted") return g.issueKind === "corrupted";
            return true;
  });
  const filteredBlockingDep = groupedBuckets.blockingDep.filter((g) =>
            matchesPatchSearchQuery(g, q)
            );
  const filteredReadyGroups = groupedBuckets.readyGroups.filter((g) =>
            matchesPatchSearchQuery(g, q)
            );

  const bpOptions = readiness.blueprintReports.map((r) => ({
              id: r.blueprintName,
            value: r.blueprintName,
            label: `${r.blueprintName} (${r.readinessPercent}%)`,
  }));

            const heroVariant =
            activeReport?.verdict === "hold"
            ? "danger"
            : activeReport?.verdict === "updates_ready"
            ? "warning"
            : "success";

            const filterPopoverOptions: Array<{
    id: PatchPanelSubFilter;
            label: string;
            count: number;
            icon: string;
  }> =
            bucketFilter === "update_ready"
            ? [
            {
              id: "all",
            label: t("all", "All"),
            count:
            groupedBuckets.directUpdates.length +
            groupedBuckets.depUpdates.length +
            groupedBuckets.autoSwaps.length,
            icon: t("icon_layers", "layers"),
          },
            {
              id: "direct_update",
            label: t("patch_sim_sec_direct_updates", "Needs Update"),
            count: groupedBuckets.directUpdates.length,
            icon: t("icon_download", "download"),
          },
            {
              id: "dep_update",
            label: t("patch_sim_sec_dep_updates", "Needs Dependency Update"),
            count: groupedBuckets.depUpdates.length,
            icon: t("icon_extension", "extension"),
          },
            {
              id: "auto_swap",
            label: t("patch_sim_sec_auto_swap", "Auto-Swap Ready"),
            count: groupedBuckets.autoSwaps.length,
            icon: t("icon_history", "history"),
          },
            ]
            : bucketFilter === "blocking"
            ? [
            {
              id: "all",
            label: t("all", "All"),
            count: groupedBuckets.blockingAll.length,
            icon: t("icon_layers", "layers"),
            },
            {
              id: "awaiting_mason",
            label: t("patch_sim_awaiting_patch", "Awaiting {Mason} Update"),
            count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "version" || !g.issueKind
            ).length,
            icon: t("icon_gpp_bad", "gpp_bad"),
            },
            {
              id: "missing_dep",
            label: t("badge_missing_dep", "Missing Dependency"),
            count: groupedBuckets.blockingDep.length,
            icon: t("icon_extension", "extension"),
            },
            {
              id: "missing_dlc",
            label: t("missing_dlc", "Missing DLC"),
            count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "dlc"
            ).length,
            icon: t("icon_currency_exchange", "currency_exchange"),
            },
            {
              id: "corrupted",
            label: t("status_corrupted", "Corrupted"),
            count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "corrupted"
            ).length,
            icon: t("icon_broken_image", "broken_image"),
            },
            ]
            : [];

            return (
            <SidePanel
              isOpen={isOpen}
              onClose={onClose}
              title={t("patch_sim_title", "{Blueprint} Patch Readiness")}
              subtitle={t(
                "patch_sim_subtitle",
                "Simulate game updates non-destructively before patching"
              )}
              icon={t("icon_published_with_changes", "published_with_changes")}
              iconColorClass="text-[var(--accent)]"
              widthClass="w-[92vw] md:w-[780px]"
              headerActions={
                onOpenFullTool ? (
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_open_in_new", "open_in_new")}
                      tooltip={t("patch_sim_open_matrix", "Open Full Patch Readiness Tool")}
                      onClick={() => {
                        onClose();
                        onOpenFullTool();
                      }}
                    />
                  </PanelHeaderGroup>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-10">
                {activeReport ? (
                  <>
                    <SidePanelHeroCard
                      icon={
                        activeReport.verdict === "hold"
                          ? t("icon_gpp_bad", "gpp_bad")
                          : activeReport.verdict === "updates_ready"
                            ? t("icon_update", "update")
                            : t("icon_verified_user", "verified_user")
                      }
                      overline={`${activeReport.blueprintName} • ${formatDisplayVersion(
                        readiness.targetVersion,
                        t("auto", "Auto")
                      )}`}
                      title={
                        activeReport.verdict === "hold"
                          ? `${t("patch_sim_verdict_hold_short", "Hold Update")} — ${activeReport.blockingMods.length
                          } ${t("patch_sim_awaiting_short", "Awaiting Patch")}`
                          : activeReport.verdict === "updates_ready"
                            ? `${t("patch_sim_verdict_stage_short", "Updates Ready")} — ${activeReport.updatableMods.length
                            } ${t("term_mods", "{Mods}")}`
                            : t(
                              "patch_sim_verdict_safe_long",
                              "Safe to Update — 100% Patch Ready"
                            )
                      }
                      description={
                        activeReport.verdict === "hold"
                          ? t(
                            "patch_sim_hero_hold_desc",
                            "Keep playing on your current game version or engage {Vault} Lockdown until blocking {mods} release updates."
                          )
                          : activeReport.verdict === "updates_ready"
                            ? t(
                              "patch_sim_hero_updates_desc",
                              "Compatible builds are already available! Stage the updates below into {Vault} and you will be 100% ready to patch."
                            )
                            : t(
                              "patch_sim_hero_safe_desc",
                              "Every {mod} in this {Blueprint} is compatible with the simulated game version. Seal a {Backups} snapshot before updating."
                            )
                      }
                      badge={`${activeReport.readinessPercent}% ${t(
                        "patch_sim_ready_label",
                        "Ready"
                      )}`}
                      badgeIcon={t("icon_speed", "speed")}
                      variant={heroVariant}
                    >
                      <div className="flex flex-col gap-3 pt-1">
                        {/* Embedded Simulation Selectors Inside Hero Info Card */}
                        <div className="rounded-xl glass-surface p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] px-0.5 flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                {t("icon_published_with_changes", "published_with_changes")}
                              </span>
                              {t("patch_sim_target_version_label", "Simulated Game Version")}
                            </span>
                            <CustomDropdown
                              value={readiness.targetVersion}
                              onChange={(val: any) =>
                                startTransition(() =>
                                  readiness.setTargetVersion(unwrapDropdownValue(val))
                                )
                              }
                              options={readiness.versionDropdownOptions}
                              allowCustom={true}
                              searchable={true}
                              placeholder={t("game_version", "Game Version")}
                            />
                          </div>

                          {bpOptions.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] px-0.5 flex items-center gap-1.5">
                                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                  {t("icon_map", "map")}
                                </span>
                                {t("term_blueprint", "{Blueprint}")}
                              </span>
                              <CustomDropdown
                                value={activeReport.blueprintName}
                                onChange={(val: any) => {
                                  const picked = unwrapDropdownValue(val);
                                  if (picked) {
                                    startTransition(() => setSelectedBpName(picked));
                                  }
                                }}
                                options={bpOptions}
                                placeholder={t("term_blueprint", "{Blueprint}")}
                              />
                            </div>
                          )}
                        </div>

                        {/* Compact Telemetry Chips */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_memory", "memory")}
                            </span>
                            <span>
                              {`${t("patch_sim_installed_tag", "Installed")}: ${formatDisplayVersion(
                                readiness.currentVersion,
                                t("auto", "Auto")
                              )}`}
                            </span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${readiness.hasPrePatchBackup
                                  ? "text-[var(--success)]"
                                  : "text-[var(--warning)]"
                                }`}
                            >
                              {t("icon_history", "history")}
                            </span>
                            <span>
                              {readiness.hasPrePatchBackup
                                ? `${readiness.backupCount} ${t(
                                  "cmd_snapshots_label",
                                  "Snapshots"
                                )}`
                                : `${t("term_backups", "{Backups}")}: ${t("none", "None")}`}
                            </span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${readiness.shelterActive
                                  ? "text-[var(--warning)]"
                                  : "text-[var(--accent)]"
                                }`}
                            >
                              {readiness.shelterActive
                                ? t("icon_lock", "lock")
                                : t("icon_shield", "shield")}
                            </span>
                            <span>
                              {readiness.shelterActive
                                ? t("btn_lockdown", "Lockdown {Vault}")
                                  .replace(/^[^\w]*/, "")
                                  .trim()
                                : t("standby", "Standby")}
                            </span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-0.5 w-full">
                          {guidedQueue.length > 0 && (
                            <ActionButton
                              variant="primary"
                              icon={t("icon_public", "public")}
                              label={`${t(
                                "patch_sim_btn_stage_guided",
                                "Stage Updates"
                              )} (${guidedQueue.length})`}
                              onClick={() =>
                                launchPatchGuidedUpdates(
                                  activeReport.directUpdateMods,
                                  activeGameSchema
                                )
                              }
                            />
                          )}
                          {activeReport.blockingMods.length + activeReport.updatableMods.length >
                            0 &&
                            activeReport.readyMods.length > 0 && (
                              <ActionButton
                                variant={clonedNameFeedback ? "success" : "glass"}
                                icon={
                                  clonedNameFeedback
                                    ? t("icon_check_circle", "check_circle")
                                    : t("icon_content_copy", "content_copy")
                                }
                                label={
                                  clonedNameFeedback
                                    ? t("patch_sim_cloned_short", "Cloned!")
                                    : t("patch_sim_btn_clone_ready", "Clone Ready {Blueprint}")
                                }
                                onClick={() => {
                                  const res = clonePatchReadyBlueprint(
                                    activeReport,
                                    readiness.targetVersion,
                                    activeGameSchema,
                                    t
                                  );
                                  if (res) {
                                    setClonedNameFeedback(res.newName);
                                    setTimeout(() => setClonedNameFeedback(null), 3000);
                                  }
                                }}
                              />
                            )}
                          {isDesktop() &&
                            activeGameSchema?.features?.has_saves !== false &&
                            onNavigateView && (
                              <ActionButton
                                variant="glass"
                                icon={t("icon_history", "history")}
                                label={t("patch_sim_btn_open_backups", "Seal {Backups}")}
                                onClick={() => {
                                  onClose();
                                  onNavigateView("backups");
                                }}
                              />
                            )}
                          {activeReport.verdict === "safe" &&
                            readiness.targetVersion &&
                            readiness.targetVersion !== readiness.currentVersion && (
                              <ActionButton
                                variant="primary"
                                icon={t("icon_check_circle", "check_circle")}
                                label={`${t(
                                  "patch_sim_btn_apply_version",
                                  "Switch Active Version to"
                                )} v${readiness.targetVersion}`}
                                onClick={() => setSelectedVersion(readiness.targetVersion)}
                              />
                            )}
                        </div>
                      </div>
                    </SidePanelHeroCard>

                    {/* Primary Bucket Filter Tiles inside SidePanel */}
                    <div className="grid grid-cols-3 gap-3">
                      <DashboardStatTile
                        variant="filter"
                        icon={t("icon_gpp_bad", "gpp_bad")}
                        number={activeReport.blockingMods.length}
                        label={t("patch_sim_awaiting_short", "Awaiting Patch")}
                        isActive={bucketFilter === "blocking"}
                        colorClass={
                          activeReport.blockingMods.length > 0
                            ? "text-[var(--danger)]"
                            : "text-[var(--text)]"
                        }
                        onClick={() =>
                          startTransition(() => {
                            setBucketFilter("blocking");
                            setSubFilter("all");
                          })
                        }
                      />
                      <DashboardStatTile
                        variant="filter"
                        icon={t("icon_download", "download")}
                        number={activeReport.updatableMods.length}
                        label={t("updates_avail", "Updates Available")}
                        isActive={bucketFilter === "update_ready"}
                        colorClass={
                          activeReport.updatableMods.length > 0
                            ? "text-[var(--warning)]"
                            : "text-[var(--text)]"
                        }
                        onClick={() =>
                          startTransition(() => {
                            setBucketFilter("update_ready");
                            setSubFilter("all");
                          })
                        }
                      />
                      <DashboardStatTile
                        variant="filter"
                        icon={t("icon_check_circle", "check_circle")}
                        number={activeReport.readyMods.length}
                        label={t("patch_sim_ready_in_vault", "Ready in {Vault}")}
                        isActive={bucketFilter === "ready"}
                        colorClass="text-[var(--success)]"
                        onClick={() =>
                          startTransition(() => {
                            setBucketFilter("ready");
                            setSubFilter("all");
                          })
                        }
                      />
                    </div>

                    <ActionPill
                      className="w-full !max-w-none"
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      searchPlaceholder={t("nav_search", "Search...") as string}
                      primaryPopover={
                        filterPopoverOptions.length > 0
                          ? {
                            icon: t("icon_tune", "tune"),
                            label: t("filters", "Filters"),
                            isActive: subFilter !== "all",
                            content: (
                              <div className="flex flex-col gap-1 p-1 min-w-[230px]">
                                {filterPopoverOptions.map((opt) => {
                                  const active = subFilter === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() =>
                                        startTransition(() => setSubFilter(opt.id))
                                      }
                                      className={`sa-dropdown-item flex items-center justify-between gap-3 w-full px-3 py-2 rounded-xl cursor-pointer ${active ? "is-selected font-bold" : "font-semibold"
                                        }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                          {opt.icon}
                                        </span>
                                        <span className="text-xs tracking-wide truncate">
                                          {opt.label}
                                        </span>
                                      </div>
                                      <span className="text-[10.5px] font-mono font-bold text-[var(--subtext)] opacity-80 shrink-0">
                                        {opt.count}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ),
                          }
                          : undefined
                      }
                    />

                    {/* Categorized Sections */}
                    {bucketFilter === "update_ready" ? (
                      filteredDirectUpdates.length === 0 &&
                        filteredDepUpdates.length === 0 &&
                        filteredAutoSwaps.length === 0 ? (
                        <UniversalGroup
                          title={`${t("updates_avail", "Updates Available")} (0)`}
                          icon={t("icon_download", "download")}
                        >
                          <EmptyState
                            icon={t("icon_task_alt", "task_alt")}
                            title={t("patch_sim_zero_updates", "No Pending {Mod} Updates")}
                            minHeightClass="min-h-[160px]"
                          />
                        </UniversalGroup>
                      ) : (
                        <div className="flex flex-col gap-5 w-full">
                          {(subFilter === "all" || subFilter === "direct_update") &&
                            (filteredDirectUpdates.length > 0 ||
                              subFilter === "direct_update") && (
                              <PatchCategorizedGroupSection
                                title={`${t(
                                  "patch_sim_sec_direct_updates",
                                  "Needs Update"
                                )} (${filteredDirectUpdates.length})`}
                                icon={t("icon_download", "download")}
                                items={filteredDirectUpdates}
                                emptyTitle={t(
                                  "patch_sim_zero_updates",
                                  "No Pending {Mod} Updates"
                                )}
                              />
                            )}

                          {(subFilter === "all" || subFilter === "dep_update") &&
                            (filteredDepUpdates.length > 0 ||
                              subFilter === "dep_update") && (
                              <PatchCategorizedGroupSection
                                title={`${t(
                                  "patch_sim_sec_dep_updates",
                                  "Needs Dependency Update"
                                )} (${filteredDepUpdates.length})`}
                                icon={t("icon_extension", "extension")}
                                items={filteredDepUpdates}
                                emptyTitle={t("none", "None")}
                              />
                            )}

                          {(subFilter === "all" || subFilter === "auto_swap") &&
                            (filteredAutoSwaps.length > 0 ||
                              subFilter === "auto_swap") && (
                              <PatchCategorizedGroupSection
                                title={`${t(
                                  "patch_sim_sec_auto_swap",
                                  "Auto-Swap Ready"
                                )} (${filteredAutoSwaps.length})`}
                                icon={t("icon_history", "history")}
                                items={filteredAutoSwaps}
                                emptyTitle={t("none", "None")}
                              />
                            )}
                        </div>
                      )
                    ) : bucketFilter === "blocking" ? (
                      filteredBlockingDirect.length === 0 &&
                        filteredBlockingDep.length === 0 ? (
                        <UniversalGroup
                          title={`${t("patch_sim_awaiting_short", "Awaiting Patch")} (0)`}
                          icon={t("icon_gpp_bad", "gpp_bad")}
                        >
                          <EmptyState
                            icon={t("icon_task_alt", "task_alt")}
                            title={t("patch_sim_zero_blocking", "Zero Blocking {Mods}")}
                            minHeightClass="min-h-[160px]"
                          />
                        </UniversalGroup>
                      ) : (
                        <div className="flex flex-col gap-5 w-full">
                          {subFilter !== "missing_dep" &&
                            (filteredBlockingDirect.length > 0 ||
                              subFilter !== "all") && (
                              <PatchCategorizedGroupSection
                                title={`${t(
                                  "patch_sim_awaiting_short",
                                  "Awaiting Patch"
                                )} (${filteredBlockingDirect.length})`}
                                icon={t("icon_gpp_bad", "gpp_bad")}
                                items={filteredBlockingDirect}
                                emptyTitle={t(
                                  "patch_sim_zero_blocking",
                                  "Zero Blocking {Mods}"
                                )}
                              />
                            )}

                          {(subFilter === "all" || subFilter === "missing_dep") &&
                            (filteredBlockingDep.length > 0 ||
                              subFilter === "missing_dep") && (
                              <PatchCategorizedGroupSection
                                title={`${t(
                                  "badge_missing_dep",
                                  "Missing Dependency"
                                )} (${filteredBlockingDep.length})`}
                                icon={t("icon_extension", "extension")}
                                items={filteredBlockingDep}
                                emptyTitle={t("none", "None")}
                              />
                            )}
                        </div>
                      )
                    ) : (
                      <PatchCategorizedGroupSection
                        title={`${t("patch_sim_ready_in_vault", "Ready in {Vault}")} (${filteredReadyGroups.length
                          })`}
                        icon={t("icon_check_circle", "check_circle")}
                        items={filteredReadyGroups}
                        emptyTitle={t("none", "None")}
                      />
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={t("icon_map", "map")}
                    title={t("cmd_no_blueprint_equipped", "No {Blueprint} Equipped")}
                  />
                )}
              </div>
            </SidePanel>
            );
}

            export function BlueprintPatchReadinessView({
              pinnedBlueprints,
              readiness: externalReadiness,
            initialInspectBlueprint,
            initialInspectBucket,
            initialInspectSubFilter,
            onClearInitialInspect,
}: {
              pinnedBlueprints ?: string[];
            readiness?: ReturnType<typeof useBlueprintPatchReadiness>;
              initialInspectBlueprint?: string | null;
              initialInspectBucket?: PatchModBucket | null;
              initialInspectSubFilter?: PatchPanelSubFilter | null;
  onClearInitialInspect?: () => void;
}) {
  const {t} = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const setSelectedVersion = useStore((s) => s.setSelectedVersion);
  const setView = useStore((s) => s.setView);
              const internalReadiness = useBlueprintPatchReadiness({
                pinnedBlueprintNames: pinnedBlueprints,
              skip: Boolean(externalReadiness),
  });
              const readiness = externalReadiness || internalReadiness;

              const [drawerBpName, setDrawerBpName] = useState<string | null>(
              initialInspectBlueprint ?? null
              );
              const [drawerInitialBucket, setDrawerInitialBucket] =
              useState<PatchModBucket | null>(initialInspectBucket ?? null);
              const [drawerInitialSubFilter, setDrawerInitialSubFilter] =
              useState<PatchPanelSubFilter | null>(initialInspectSubFilter ?? null);

  useEffect(() => {
    if (initialInspectBlueprint) {
                setDrawerBpName(initialInspectBlueprint);
              setDrawerInitialBucket(initialInspectBucket ?? null);
              setDrawerInitialSubFilter(initialInspectSubFilter ?? null);
              if (onClearInitialInspect) onClearInitialInspect();
    }
  }, [
              initialInspectBlueprint,
              initialInspectBucket,
              initialInspectSubFilter,
              onClearInitialInspect,
              ]);

              const focusedReport = readiness.activeBlueprintReport;

              const guidedUpdateQueue = useMemo(
    () =>
              focusedReport
              ? buildPatchGuidedUpdateQueue(
              focusedReport.directUpdateMods || [],
              activeGameSchema
              )
              : [],
              [focusedReport, activeGameSchema]
              );

              const openFocusedDrawer = (
              bucket?: PatchModBucket | null,
              sub?: PatchPanelSubFilter | null
  ) => {
                setDrawerInitialBucket(bucket ?? null);
              setDrawerInitialSubFilter(sub ?? null);
              setDrawerBpName(focusedReport?.blueprintName || "");
  };

              return (
              <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 min-h-[400px]">
                <CommandScreenLayout>
                  <CommandScreenBody>
                    <CommandScreenMain>
                      <div className="flex flex-col gap-4 w-full">
                        <CommandScreenSectionHeading
                          title={t("patch_sim_title", "{Blueprint} Patch Readiness")}
                          subtitle={t(
                            "patch_sim_matrix_sub",
                            "Non-destructive health check across target game patches before you update"
                          )}
                          icon={t("icon_published_with_changes", "published_with_changes")}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                          <PatchReadinessSimulatorInfoCard readiness={readiness} />

                          {readiness.blueprintReports.map((rep) => (
                            <BlueprintPatchReadinessCard
                              key={rep.blueprintName}
                              report={rep}
                              targetVersion={readiness.targetVersion}
                              onInspect={(name) => {
                                setDrawerInitialBucket(null);
                                setDrawerInitialSubFilter(null);
                                setDrawerBpName(name);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </CommandScreenMain>

                    <CommandScreenSidebar
                      title={t("quick_actions", "Quick Actions")}
                      icon={t("icon_bolt", "bolt")}
                      metricsTitle={t("patch_sim_metrics_title", "Readiness Telemetry")}
                      metricsIcon={t("icon_monitoring", "monitoring")}
                      metrics={
                        <>
                          <CommandScreenMetricTile
                            icon={t("icon_speed", "speed")}
                            value={`${focusedReport?.readinessPercent ?? 100}%`}
                            label={t("patch_sim_ready_label", "Ready")}
                            valueColorClass={
                              focusedReport?.verdict === "hold"
                                ? "text-[var(--danger)]"
                                : focusedReport?.verdict === "updates_ready"
                                  ? "text-[var(--warning)]"
                                  : "text-[var(--success)]"
                            }
                            onClick={() => openFocusedDrawer("ready", "all")}
                          />
                          <CommandScreenMetricTile
                            icon={t("icon_gpp_bad", "gpp_bad")}
                            value={focusedReport?.blockingMods.length ?? 0}
                            label={t("patch_sim_awaiting_short", "Awaiting Patch")}
                            valueColorClass={
                              (focusedReport?.blockingMods.length ?? 0) > 0
                                ? "text-[var(--danger)]"
                                : "text-[var(--success)]"
                            }
                            onClick={() => openFocusedDrawer("blocking", "all")}
                          />
                          <CommandScreenMetricTile
                            icon={t("icon_history", "history")}
                            value={focusedReport?.autoSwapMods.length ?? 0}
                            label={t("version_pool_badge_auto_swap", "Auto-Swap")}
                            onClick={() => openFocusedDrawer("update_ready", "auto_swap")}
                          />
                          <CommandScreenMetricTile
                            icon={t("icon_inventory_2", "inventory_2")}
                            value={readiness.backupCount}
                            label={t("cmd_snapshots_label", "Snapshots")}
                            onClick={() => {
                              if (isDesktop() && activeGameSchema?.features?.has_saves !== false) {
                                setView("backups");
                              }
                            }}
                          />
                        </>
                      }
                    >
                      {focusedReport &&
                        focusedReport.blockingMods.length +
                        focusedReport.updatableMods.length >
                        0 &&
                        focusedReport.readyMods.length > 0 && (
                          <CommandScreenQuickLink
                            icon={t("icon_content_copy", "content_copy")}
                            title={t(
                              "patch_sim_btn_clone_ready",
                              "Clone Ready {Blueprint}"
                            )}
                            subtitle={t(
                              "patch_sim_clone_ready_tooltip",
                              "Create a patch-ready copy omitting {0} {mods} requiring updates"
                            ).replace(
                              "{0}",
                              String(
                                focusedReport.blockingMods.length +
                                focusedReport.updatableMods.length
                              )
                            )}
                            onClick={() =>
                              clonePatchReadyBlueprint(
                                focusedReport,
                                readiness.targetVersion,
                                activeGameSchema,
                                t
                              )
                            }
                            iconColorClass="text-[var(--accent)]"
                          />
                        )}

                      {guidedUpdateQueue.length > 0 && focusedReport && (
                        <CommandScreenQuickLink
                          icon={t("icon_public", "public")}
                          title={t("patch_sim_btn_stage_guided", "Stage Updates")}
                          subtitle={`${guidedUpdateQueue.length} ${t(
                            "updates_avail",
                            "Updates Available"
                          )}`}
                          onClick={() =>
                            launchPatchGuidedUpdates(
                              focusedReport.directUpdateMods,
                              activeGameSchema
                            )
                          }
                          iconColorClass="text-[var(--warning)]"
                        />
                      )}

                      {isDesktop() && activeGameSchema?.features?.has_saves !== false && (
                        <CommandScreenQuickLink
                          icon={t("icon_history", "history")}
                          title={t("patch_sim_btn_open_backups", "Seal {Backups}")}
                          subtitle={t(
                            "cmd_backups_card_desc",
                            "Capture pre-patch world saves and full engine snapshots so game updates never corrupt your progress."
                          )}
                          onClick={() => setView("backups")}
                        />
                      )}

                      {focusedReport?.verdict === "safe" &&
                        readiness.targetVersion &&
                        readiness.targetVersion !== readiness.currentVersion && (
                          <CommandScreenQuickLink
                            icon={t("icon_check_circle", "check_circle")}
                            title={`${t(
                              "patch_sim_btn_apply_version",
                              "Switch Active Version to"
                            )} v${readiness.targetVersion}`}
                            subtitle={t(
                              "patch_sim_apply_version_sub",
                              "All {mods} verified clear — promote simulated version to active"
                            )}
                            onClick={() => setSelectedVersion(readiness.targetVersion)}
                            iconColorClass="text-[var(--success)]"
                          />
                        )}
                    </CommandScreenSidebar>
                  </CommandScreenBody>
                </CommandScreenLayout>

                {drawerBpName !== null && (
                  <BlueprintPatchReadinessSidePanel
                    isOpen={drawerBpName !== null}
                    onClose={() => {
                      setDrawerBpName(null);
                      setDrawerInitialBucket(null);
                      setDrawerInitialSubFilter(null);
                    }}
                    initialBlueprintName={drawerBpName || undefined}
                    initialBucket={drawerInitialBucket}
                    initialSubFilter={drawerInitialSubFilter}
                    readiness={readiness}
                    onNavigateView={setView}
                  />
                )}
              </div>
              );
}
