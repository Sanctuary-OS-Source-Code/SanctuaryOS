import { startTransition } from "react";
import { isDesktop } from "../../utils/envUtils";
import { useModalStore } from "../../store/modalStore";
import { type VaultCompanionSnapshot } from "../../utils/stagingCrypto";
import { getHighestVersion, cleanSearchName, getModFallbackUrl, formatDisplayName, handleOpenUrl } from "../../shared";
import { formatCleanModTitle, type MissingDepTarget, type StackedModIssue } from "../../side-panels/CommandIncompatiblePanel";

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

export let pendingBlueprintsNavigationState: PendingBlueprintsNavigation | null = null;
export const BLUEPRINTS_NAV_SESSION_KEY = "sanctuary_blueprints_pending_nav";
export const BLUEPRINTS_TAB_LEGACY_KEY = "sanctuary_blueprints_tab";

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

export interface WorkspacePatchCacheEntry {
  gameVersions: string[];
  lastVersionsFetch: number;
  cloudModVersions: Map<string, any[]>;
  fetchedModIds: Set<string>;
  lastCloudFetch: number;
  poolItems: any[];
  lastPoolFetch: number;
  lastPoolModCount: number;
  companionSnapshots?: VaultCompanionSnapshot[];
  lastCompanionFetch?: number;
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
    result: BlueprintPatchReport[];
  };
}

export const patchSimulatorCache = new Map<string, WorkspacePatchCacheEntry>();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DRAWER_PAGE_SIZE = 40;

export function getOrCreateWorkspaceCache(wsId: string): WorkspacePatchCacheEntry {
  const key = wsId || "default";
  let entry = patchSimulatorCache.get(key);
  if (!entry) {
    entry = {
      gameVersions: [],
      lastVersionsFetch: 0,
      cloudModVersions: new Map<string, any[]>(),
      fetchedModIds: new Set<string>(),
      lastCloudFetch: 0,
      poolItems: [],
      lastPoolFetch: 0,
      lastPoolModCount: -1,
    };
    patchSimulatorCache.set(key, entry);
  }
  return entry;
}

export function parseCompatArray(raw: any): string[] {
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

export function unwrapDropdownValue(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val ?? "");
}

export function cleanVersionLabel(ver: any): string {
  return unwrapDropdownValue(ver)
    .trim()
    .replace(/^v\.?/i, "");
}

export function isWildcardVersion(ver: any): boolean {
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

export function formatDisplayVersion(ver: any, fallbackLabel: string): string {
  const clean = cleanVersionLabel(ver);
  if (!clean || isWildcardVersion(clean)) return fallbackLabel;
  return /^\d/.test(clean) ? `v${clean}` : clean;
}

export function formatGameVersionChipLabel(
  compatVersions: string[],
  anyFallback: string
): string {
  const explicit = (compatVersions || []).filter((v) => !isWildcardVersion(v));
  if (explicit.length > 0) {
    const highest = cleanVersionLabel(getHighestVersion(explicit));
    if (highest && !isWildcardVersion(highest)) {
      return /^\d/.test(highest) ? `v${highest}` : highest;
    }
  }
  return anyFallback;
}

export function toCompactAlnum(val: string): string {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildActiveDependencyIndex(pool: any[]) {
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

export function registerSuiteInTitleLookup(
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

export function findUnsatisfiedSuiteDependency(
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
  handleOpenUrl(url);
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
      )}+${encodeURIComponent(cleanSearchName(m.title, activeGameSchema))}`;
    const dedupeKey = String(fallbackUrl || m.suiteKey || m.key).toLowerCase();
    if (seenTargets.has(dedupeKey)) continue;
    seenTargets.add(dedupeKey);
    if (nonTrivialSuite) seenSuites.add(nonTrivialSuite);

    out.push({
      id: `${m.key}_${idx}`,
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

