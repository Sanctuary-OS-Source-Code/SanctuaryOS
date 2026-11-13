import React, { useMemo, useState } from "react";
import {
  SidePanel,
  formatDisplayName,
  isVersionMatch,
  mapDlcCode,
  getHighestVersion,
  getModIcon,
  parseStringArray,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  handleOpenUrl,
  cleanSearchName,
  getModFallbackUrl,
  HoverTooltip,
  ActionPill,
  InlineFilterGroup,
  SidePanelHeroCard,
  DashboardStatTile,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  isScriptExtension,
  openModDossier,
  getExtensionRegex,
  filterBlueprintModArtifacts,
  stripPriorityTierPrefix,
  resolveModHighlanderSlot,
} from "../shared";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

export interface MissingDepTarget {
  id?: string;
  hash?: string;
  name: string;
  url: string;
  sourceHost?: string;
  vaultModName?: string;
}

export interface StackedModIssue {
  category: "corrupted" | "version_mismatch" | "missing_dlc" | "missing_deps" | "unstable";
  type: "red" | "amber";
  icon: string;
  title: string;
  detail: string;
  installedVersion?: string;
  requiredVersion?: string;
  depTarget?: MissingDepTarget;
}

export function cleanModIssueReason(raw: any): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (
    !trimmed ||
    /^\[object\s+object\]$/i.test(trimmed) ||
    /^\[ARCHITECT\b/i.test(trimmed) ||
    /^(required game version|version mismatch|missing dependency|missing dlc)\s*:/i.test(trimmed)
  ) {
    return "";
  }
  return trimmed;
}

function formatVersionBadgeText(ver: any, fallback: string): string {
  const s = String(ver ?? "").trim();
  if (!s || s.toLowerCase() === "unknown" || s.toLowerCase() === "null") {
    return fallback;
  }
  const stripped = s.replace(/^v\.?\s*/i, "").trim();
  if (!stripped) return fallback;
  return /^\d/.test(stripped) ? `v${stripped}` : stripped;
}

function extractSourceHost(urlStr?: string | null): string | undefined {
  if (!urlStr || typeof urlStr !== "string") return undefined;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (!host || /google\.|bing\.|duckduckgo\./i.test(host)) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

const vaultLookupWeakCache = new WeakMap<
  any[],
  Map<string, any>
>();

function getVaultDependencyMatch(
  vaultMods: any[],
  depId?: string,
  depHash?: string,
  depName?: string
): any | null {
  if (!Array.isArray(vaultMods) || vaultMods.length === 0) return null;
  let lookup = vaultLookupWeakCache.get(vaultMods);
  if (!lookup) {
    lookup = new Map<string, any>();
    for (let i = 0; i < vaultMods.length; i++) {
      const vm = vaultMods[i];
      if (!vm || vm.isFallback) continue;
      if (vm.dbId) lookup.set(`id:${String(vm.dbId).split("@")[0].toLowerCase()}`, vm);
      if (vm.id) lookup.set(`id:${String(vm.id).split("@")[0].toLowerCase()}`, vm);
      if (vm.hash) lookup.set(`hash:${String(vm.hash).toLowerCase()}`, vm);
      const disp = String(vm.displayName || "").toLowerCase().trim();
      if (disp && !lookup.has(`name:${disp}`)) lookup.set(`name:${disp}`, vm);
      const nm = String(vm.name || "").toLowerCase().trim();
      if (nm && !lookup.has(`name:${nm}`)) lookup.set(`name:${nm}`, vm);
      const comp = (disp || nm).replace(/[^a-z0-9]/g, "");
      if (comp.length >= 5 && !lookup.has(`comp:${comp}`)) lookup.set(`comp:${comp}`, vm);
    }
    vaultLookupWeakCache.set(vaultMods, lookup);
  }
  if (depId) {
    const byId = lookup.get(`id:${String(depId).split("@")[0].toLowerCase()}`);
    if (byId) return byId;
  }
  if (depHash) {
    const byHash = lookup.get(`hash:${String(depHash).toLowerCase()}`);
    if (byHash) return byHash;
  }
  if (depName) {
    const low = depName.toLowerCase().trim();
    const byName = lookup.get(`name:${low}`);
    if (byName) return byName;
    const comp = low.replace(/[^a-z0-9]/g, "");
    if (comp.length >= 5) {
      const byComp = lookup.get(`comp:${comp}`);
      if (byComp) return byComp;
    }
  }
  return null;
}

const activeModNamesWeakCache = new WeakMap<
  any[],
  { list: string[]; exactSet: Set<string>; compactList: string[] }
>();

function getCachedActiveModNames(activeMods: any[]): {
  list: string[];
  exactSet: Set<string>;
  compactList: string[];
} {
  if (!Array.isArray(activeMods) || activeMods.length === 0) {
    return { list: [], exactSet: new Set(), compactList: [] };
  }
  const cached = activeModNamesWeakCache.get(activeMods);
  if (cached) return cached;

  const exactSet = new Set<string>();
  const compactSet = new Set<string>();
  const list: string[] = [];
  const compactList: string[] = [];
  for (let i = 0; i < activeMods.length; i++) {
    const m = activeMods[i];
    if (!m || m.isFallback) continue;
    const candidates = [
      String(m._originalSetName || "").toLowerCase(),
      String(m.name || "").toLowerCase(),
      String(m.displayName || "").toLowerCase(),
      m.dbId ? String(m.dbId).split("@")[0].toLowerCase() : "",
      m.hash ? String(m.hash).toLowerCase() : "",
    ];
    for (let j = 0; j < candidates.length; j++) {
      const c = candidates[j];
      if (c && !exactSet.has(c)) {
        exactSet.add(c);
        list.push(c);
      }
      if (j < 3 && c) {
        const comp = c.replace(/[^a-z0-9]/g, "");
        if (comp.length >= 5 && !compactSet.has(comp)) {
          compactSet.add(comp);
          compactList.push(comp);
        }
      }
    }
  }
  const res = { list, exactSet, compactList };
  activeModNamesWeakCache.set(activeMods, res);
  return res;
}

export function evaluateModIssues(
  mod: any,
  {
    activeMods = [],
    selectedVersion,
    ownedDLC = [],
    maskedDLC = [],
    t,
    activeGameSchema,
  }: {
    activeMods?: any[];
    selectedVersion?: string;
    ownedDLC?: string[];
    maskedDLC?: string[];
    t: (key: string, fallback?: string) => string;
    activeGameSchema?: any;
  }
): any | null {
  if (!mod || mod.isFallback) return null;

  const issues: StackedModIssue[] = [];
  const categories: StackedModIssue["category"][] = [];

  const addCategory = (cat: StackedModIssue["category"]) => {
    if (!categories.includes(cat)) categories.push(cat);
  };

  // 1. Game Version Mismatch check
  const compatArr =
    typeof mod.compatible_versions === "string"
      ? mod.compatible_versions
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : Array.isArray(mod.compatible_versions)
        ? mod.compatible_versions
        : [];

  const hasVersionMismatch =
    (mod.isGhosted === true && mod.ghostReason === "VERSION_MISMATCH") ||
    (compatArr.length > 0 &&
      typeof selectedVersion === "string" &&
      selectedVersion.length > 0 &&
      !isVersionMatch(compatArr, selectedVersion));

  // 2. Corrupted / Non-Compliant check
  const sLower = typeof mod.status === "string" ? mod.status.toLowerCase().trim() : "";
  const cleanReason = cleanModIssueReason(mod.status_reason);
  let isBroken = sLower === "broken" || sLower === "corrupted" || sLower === "obsolete";
  if (
    isBroken &&
    sLower === "broken" &&
    !cleanReason &&
    compatArr.length > 0 &&
    selectedVersion
  ) {
    if (selectedVersion !== getHighestVersion(compatArr)) {
      isBroken = false;
    }
  }
  const hasStaticEdgeVerification = Boolean(
    mod.manifest_url &&
      sLower !== "broken" &&
      sLower !== "corrupted" &&
      sLower !== "obsolete"
  );
  const isNonCompliant =
    !hasVersionMismatch &&
    !hasStaticEdgeVerification &&
    (mod.compliance_tier === 3 || mod.compliance_tier === 4);

  if (isBroken || isNonCompliant) {
    addCategory("corrupted");
    const nonCompliantFallback =
      isNonCompliant && !cleanReason
        ? `${t("registry_col_safety", "Safety Tier")} ${mod.compliance_tier}`
        : "";
    issues.push({
      category: "corrupted",
      type: "red",
      icon: t("icon_broken_image", "broken_image"),
      title: t("status_corrupted", "Corrupted"),
      detail: cleanReason || nonCompliantFallback,
    });
  }

  if (hasVersionMismatch) {
    addCategory("version_mismatch");
    const reqHighest =
      compatArr.length > 0 ? getHighestVersion(compatArr) : mod.game_version || "";
    const installedVerStr = formatVersionBadgeText(
      selectedVersion,
      t("unknown", "Unknown")
    );
    const requiredVerStr = formatVersionBadgeText(
      reqHighest,
      t("unknown", "Unknown")
    );
    issues.push({
      category: "version_mismatch",
      type: "red",
      icon: t("icon_sports_esports", "sports_esports"),
      title: t("modal_version_mismatch", "Version Mismatch"),
      detail: requiredVerStr,
      installedVersion: installedVerStr,
      requiredVersion: requiredVerStr,
    });
  }

  // 3. Missing DLC check (each missing DLC pack stacks in the detail list)
  const rawDLC: string[] = parseStringArray(mod.requiredDLC);
  if (Array.isArray(mod.flavors)) {
    mod.flavors.forEach((f: any) => {
      if (f?.requiredDLC) {
        parseStringArray(f.requiredDLC).forEach((d: string) => {
          if (!rawDLC.includes(d)) rawDLC.push(d);
        });
      }
    });
  }
  if (rawDLC.length > 0) {
    const activeDLC = (ownedDLC || []).filter((d: string) => !(maskedDLC || []).includes(d));
    const missing = rawDLC.filter((req: string) => {
      const cleanReq = req.split(" ")[0].toUpperCase().trim();
      if (!cleanReq || cleanReq === "BASE") return false;
      return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
    });
    if (missing.length > 0) {
      addCategory("missing_dlc");
      missing.forEach((packCode: string) => {
        issues.push({
          category: "missing_dlc",
          type: "red",
          icon: t("icon_currency_exchange", "currency_exchange"),
          title: t("missing_dlc", "Missing DLC"),
          detail: mapDlcCode(packCode),
        });
      });
    }
  }

  // 4. Missing Dependencies check (preserve dependency ID, hash, and acquisition URL)
  if (mod.dependencies) {
    const rawDepEntries: { rawObj: any; rawName: string }[] = Array.isArray(mod.dependencies)
      ? mod.dependencies
          .map((d: any) => ({
            rawObj: typeof d === "object" && d !== null ? d : null,
            rawName:
              typeof d === "string"
                ? d.trim()
                : String(d?.name || d?.title || d?.id || "").trim(),
          }))
          .filter((entry: { rawObj: any; rawName: string }) => Boolean(entry.rawName))
      : parseStringArray(mod.dependencies).map((s: string) => ({
          rawObj: null,
          rawName: s,
        }));

    if (rawDepEntries.length > 0) {
      const {
        list: activeModNames,
        exactSet: activeModExactSet,
        compactList: activeModCompactList,
      } = getCachedActiveModNames(activeMods || []);

      const seenDeps = new Set<string>();
      const missingDepEntries = rawDepEntries.filter(({ rawObj, rawName }) => {
        const lower = rawName.toLowerCase().trim();
        if (!lower || lower.includes("object object") || lower.includes("[object")) {
          return false;
        }
        if (seenDeps.has(lower)) return false;
        seenDeps.add(lower);
        if (activeModExactSet.has(lower)) return false;
        if (rawObj?.id && activeModExactSet.has(String(rawObj.id).toLowerCase())) {
          return false;
        }
        if (rawObj?.hash && activeModExactSet.has(String(rawObj.hash).toLowerCase())) {
          return false;
        }
        const matchedSubstring = activeModNames.some(
          (act: string) =>
            (lower.length >= 4 && act.includes(lower)) ||
            (act.length >= 4 && lower.includes(act))
        );
        if (matchedSubstring) return false;
        const reqCompact = lower.replace(/[^a-z0-9]/g, "");
        if (
          reqCompact.length >= 5 &&
          activeModCompactList.some(
            (ac: string) =>
              ac === reqCompact || ac.includes(reqCompact) || reqCompact.includes(ac)
          )
        ) {
          return false;
        }
        return true;
      });

      if (missingDepEntries.length > 0) {
        addCategory("missing_deps");
        const storeModList = useStore.getState().modList || [];
        missingDepEntries.forEach(({ rawObj, rawName }) => {
          const cleanedBase =
            cleanSearchName(rawName, activeGameSchema) || formatDisplayName(rawName);
          const cleanDepTitle = formatCleanModTitle(cleanedBase) || cleanedBase;
          const vaultMatch = getVaultDependencyMatch(
            storeModList,
            rawObj?.id,
            rawObj?.hash,
            cleanDepTitle || rawName
          );
          const directUrl = String(
            rawObj?.url ||
              rawObj?.download_url ||
              vaultMatch?.download_url ||
              vaultMatch?.url ||
              ""
          ).trim();
          const finalUrl =
            directUrl ||
            getModFallbackUrl(
              cleanDepTitle,
              rawObj?.hash || vaultMatch?.hash,
              activeGameSchema,
              { url: directUrl || undefined }
            );
          issues.push({
            category: "missing_deps",
            type: "red",
            icon: t("icon_extension", "extension"),
            title: t("badge_missing_dep", "Missing Dependency"),
            detail: cleanDepTitle,
            depTarget: {
              id: rawObj?.id ? String(rawObj.id) : vaultMatch?.dbId || undefined,
              hash: rawObj?.hash ? String(rawObj.hash) : vaultMatch?.hash || undefined,
              name: cleanDepTitle,
              url: finalUrl,
              sourceHost: directUrl ? extractSourceHost(directUrl) : undefined,
              vaultModName:
                vaultMatch && !vaultMatch.isVirtual
                  ? vaultMatch._originalSetName || vaultMatch.name
                  : undefined,
            },
          });
        });
      }
    }
  }

  // 5. Unstable check (stacks even if red issues are also present)
  if (sLower === "unstable") {
    addCategory("unstable");
    issues.push({
      category: "unstable",
      type: "amber",
      icon: t("icon_warning_amber", "warning_amber"),
      title: t("label_unstable", "Unstable"),
      detail: cleanReason,
    });
  }

  if (issues.length === 0) return null;

  const hasRed = issues.some((i) => i.type === "red");
  const alertType = hasRed ? "red" : "amber";
  const primaryCategory = categories[0] || (hasRed ? "corrupted" : "unstable");
  const summaryReason = issues
    .map((i) => (i.detail ? `${i.title}: ${i.detail}` : i.title))
    .join(" • ");

  return {
    ...mod,
    _issues: issues,
    _categories: categories,
    _alert_reason: summaryReason,
    _alert_type: alertType,
    _alert_category: primaryCategory,
  };
}

export function normalizeModGroupTitle(rawTitle: string): string {
  return rawTitle
    .replace(
      /(\s+scripts|\s+script|_scripts|_script|\s+addons|\s+addon|\s+add-on|_addon|\s+modules|\s+module|_module|\s+core|_core|\s+base|_base|\s+main|_main|\s+part\s*\d+|\s+pt\s*\d+)$/i,
      ""
    )
    .trim();
}

export function isKnownCreatorName(val: any): boolean {
  if (!val || typeof val !== "string") return false;
  const clean = val.trim().toLowerCase();
  return (
    clean.length > 0 &&
    clean !== "unknown" &&
    clean !== "unknown creator" &&
    clean !== "unknown mason" &&
    clean !== "unknown architect" &&
    clean !== "null" &&
    clean !== "undefined"
  );
}

export function extractValidCreator(...candidates: any[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") {
      if (isKnownCreatorName(c)) return c.trim();
      continue;
    }
    const direct =
      (Array.isArray(c.masons) ? c.masons[0]?.name : c.masons?.name) ||
      c.author ||
      c.master_author ||
      c.creator_name ||
      c.suggested_author;
    if (isKnownCreatorName(direct)) return String(direct).trim();
  }
  return null;
}

const vaultGroupLookupWeakCache = new WeakMap<
  any[],
  {
    vaultByHash: Map<string, any>;
    vaultUpdateLookup: Map<string, any>;
    virtualByFamilyId: Map<string, any>;
    collectionBySetId: Map<string, any>;
    parentByDbId: Map<string, any>;
    vaultFamilyCounts: Map<string, number>;
    vaultSetCounts: Map<string, number>;
  }
>();

export function getCachedVaultGroupLookups(allVaultMods: any[]) {
  if (!Array.isArray(allVaultMods) || allVaultMods.length === 0) {
    return {
      vaultByHash: new Map<string, any>(),
      vaultUpdateLookup: new Map<string, any>(),
      virtualByFamilyId: new Map<string, any>(),
      collectionBySetId: new Map<string, any>(),
      parentByDbId: new Map<string, any>(),
      vaultFamilyCounts: new Map<string, number>(),
      vaultSetCounts: new Map<string, number>(),
    };
  }
  const cached = vaultGroupLookupWeakCache.get(allVaultMods);
  if (cached) return cached;

  const vaultByHash = new Map<string, any>();
  const vaultUpdateLookup = new Map<string, any>();
  const virtualByFamilyId = new Map<string, any>();
  const collectionBySetId = new Map<string, any>();
  const parentByDbId = new Map<string, any>();
  const vaultFamilyCounts = new Map<string, number>();
  const vaultSetCounts = new Map<string, number>();

  for (const vm of allVaultMods) {
    if (!vm) continue;
    if (vm.isVirtual) {
      if (vm.isCollection) {
        if (vm.dbId) collectionBySetId.set(String(vm.dbId).split("@")[0], vm);
      } else {
        if (vm.dbId) virtualByFamilyId.set(String(vm.dbId).split("@")[0], vm);
        if (vm.baseFamilyId) virtualByFamilyId.set(String(vm.baseFamilyId).split("@")[0], vm);
      }
      continue;
    }
    if (vm.hash) vaultByHash.set(String(vm.hash).toLowerCase(), vm);
    if (vm.dbId) {
      parentByDbId.set(String(vm.dbId), vm);
    }
    if (vm.name) vaultUpdateLookup.set(String(vm.name).toLowerCase(), vm);
    if (vm.displayName) vaultUpdateLookup.set(String(vm.displayName).toLowerCase(), vm);

    const famKey = String(vm.baseFamilyId || vm.familyId || "").split("@")[0];
    if (famKey && famKey !== "null" && famKey !== "undefined" && !famKey.startsWith("local_")) {
      vaultFamilyCounts.set(famKey, (vaultFamilyCounts.get(famKey) || 0) + 1);
    }
    const setKey = String(vm.setId || "").trim();
    if (setKey && setKey !== "null" && setKey !== "undefined") {
      vaultSetCounts.set(setKey, (vaultSetCounts.get(setKey) || 0) + 1);
    }
  }

  const res = {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  };
  vaultGroupLookupWeakCache.set(allVaultMods, res);
  return res;
}

export function groupBrokenMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const flatList: any[] = [];
  for (const entry of rawList) {
    if (!entry) continue;
    if (Array.isArray(entry._groupedMods) && entry._groupedMods.length > 0) {
      flatList.push(...entry._groupedMods);
    } else {
      flatList.push(entry);
    }
  }
  if (flatList.length === 0) return [];

  const allVaultMods: any[] = useStore.getState().modList || [];
  const {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  } = getCachedVaultGroupLookups(allVaultMods);

  const listFamilyCounts = new Map<string, number>();
  const listSetCounts = new Map<string, number>();

  const enrichedItems = flatList.map((rawMod) => {
    const matchedVault =
      (rawMod?.hash ? vaultByHash.get(String(rawMod.hash).toLowerCase()) : undefined) ||
      vaultUpdateLookup.get(String(rawMod?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(rawMod?.displayName || "").toLowerCase());

    const famIdRaw = String(
      matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        rawMod?.baseFamilyId ||
        rawMod?.familyId ||
        ""
    ).split("@")[0];
    if (
      famIdRaw &&
      famIdRaw !== "null" &&
      famIdRaw !== "undefined" &&
      !famIdRaw.startsWith("local_")
    ) {
      listFamilyCounts.set(famIdRaw, (listFamilyCounts.get(famIdRaw) || 0) + 1);
    }

    const setIdRaw = String(rawMod?.setId || matchedVault?.setId || "").trim();
    if (setIdRaw && setIdRaw !== "null" && setIdRaw !== "undefined") {
      listSetCounts.set(setIdRaw, (listSetCounts.get(setIdRaw) || 0) + 1);
    }

    return { rawMod, matchedVault, famIdRaw, setIdRaw };
  });

  const grouped = new Map<string, any>();

  for (const { rawMod, matchedVault, famIdRaw, setIdRaw } of enrichedItems) {
    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_") &&
        (virtualByFamilyId.has(famIdRaw) ||
          (vaultFamilyCounts.get(famIdRaw) || 0) > 1 ||
          (listFamilyCounts.get(famIdRaw) || 0) > 1)
    );
    const familyParent = hasRealFamily
      ? virtualByFamilyId.get(famIdRaw) || parentByDbId.get(famIdRaw)
      : null;

    const hasCollectionFolder = Boolean(
      setIdRaw &&
        setIdRaw !== "null" &&
        setIdRaw !== "undefined" &&
        (collectionBySetId.has(setIdRaw) ||
          (vaultSetCounts.get(setIdRaw) || 0) > 1 ||
          (listSetCounts.get(setIdRaw) || 0) > 1)
    );
    const collectionFolder = hasCollectionFolder ? collectionBySetId.get(setIdRaw) : null;

    const resolvedAuthor = extractValidCreator(
      rawMod,
      matchedVault,
      familyParent,
      collectionFolder
    );

    const mod = {
      ...(familyParent && !familyParent.isVirtual ? familyParent : {}),
      ...(matchedVault || {}),
      ...rawMod,
      setId: setIdRaw || matchedVault?.setId || rawMod?.setId,
      familyId: matchedVault?.familyId || rawMod?.familyId,
      baseFamilyId: matchedVault?.baseFamilyId || rawMod?.baseFamilyId,
      hasUpdate: Boolean(
        rawMod.hasUpdate || matchedVault?.hasUpdate || familyParent?.hasUpdate
      ),
      newVersion:
        rawMod.newVersion || matchedVault?.newVersion || familyParent?.newVersion,
      newGameVersion:
        rawMod.newGameVersion ||
        matchedVault?.newGameVersion ||
        familyParent?.newGameVersion,
      download_url:
        rawMod.download_url ||
        matchedVault?.download_url ||
        familyParent?.download_url ||
        collectionFolder?.url,
      url:
        rawMod.url ||
        matchedVault?.url ||
        familyParent?.url ||
        collectionFolder?.url,
      image_url:
        rawMod.image_url ||
        rawMod.imageUrl ||
        matchedVault?.image_url ||
        familyParent?.image_url ||
        collectionFolder?.image_url,
      author: resolvedAuthor || undefined,
    };

    const rawTitle = formatDisplayName(mod?.displayName || mod?.name || "").trim();
    const twinNormalized = normalizeModGroupTitle(rawTitle) || rawTitle;

    let groupKey: string;
    let displayTitle = twinNormalized;
    let isCollectionGroup = false;

    if (hasRealFamily) {
      groupKey = `__family_${famIdRaw}__`;
      const canonicalParentTitle = familyParent
        ? formatDisplayName(familyParent.displayName || familyParent.name || "").trim()
        : "";
      displayTitle =
        normalizeModGroupTitle(canonicalParentTitle) ||
        canonicalParentTitle ||
        twinNormalized;
    } else if (hasCollectionFolder) {
      groupKey = `__set_${setIdRaw}__`;
      isCollectionGroup = true;
      const colTitle = collectionFolder
        ? formatDisplayName(collectionFolder.displayName || collectionFolder.name || "").trim()
        : "";
      displayTitle = colTitle || twinNormalized;
    } else if (mod.communityGroupId) {
      groupKey = `__comm_${mod.communityGroupId}__`;
      displayTitle = formatDisplayName(mod.communityGroupName || twinNormalized).trim();
    } else {
      groupKey = twinNormalized.toLowerCase();
      displayTitle = twinNormalized;
    }

    const modIssues: StackedModIssue[] = Array.isArray(mod._issues)
      ? mod._issues
      : mod._alert_reason
        ? [
            {
              category:
                mod._alert_category ||
                (mod._alert_type === "amber" ? "unstable" : "corrupted"),
              type: mod._alert_type === "amber" ? "amber" : "red",
              icon: mod._alert_type === "amber" ? "warning_amber" : "broken_image",
              title: mod._alert_type === "amber" ? "Unstable" : "Corrupted",
              detail: mod._alert_reason,
            },
          ]
        : [];

    const modCategories: StackedModIssue["category"][] = Array.isArray(mod._categories)
      ? mod._categories
      : mod._alert_category
        ? [mod._alert_category]
        : [mod._alert_type === "amber" ? "unstable" : "corrupted"];

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...mod,
        _isCollectionGroup: isCollectionGroup,
        _groupedTitle: displayTitle,
        _moduleCount: 1,
        _groupedMods: [mod],
        _groupOriginalNames: [mod.name],
        _issues: [...modIssues],
        _categories: [...modCategories],
      });
    } else {
      const existing = grouped.get(groupKey);
      existing._moduleCount = (existing._moduleCount || 1) + 1;
      existing._groupedMods.push(mod);
      existing._groupOriginalNames.push(mod.name);
      if (isCollectionGroup) existing._isCollectionGroup = true;

      if (hasRealFamily && String(mod.dbId) === famIdRaw) {
        existing._groupedTitle = twinNormalized;
      }

      for (const cat of modCategories) {
        if (!existing._categories.includes(cat)) {
          existing._categories.push(cat);
        }
      }

      for (const iss of modIssues) {
        const existsAlready = existing._issues.some(
          (e: StackedModIssue) =>
            e.category === iss.category &&
            e.title === iss.title &&
            e.detail.toLowerCase() === iss.detail.toLowerCase()
        );
        if (!existsAlready) {
          existing._issues.push(iss);
        }
      }

      if (mod._alert_type === "red") {
        existing._alert_type = "red";
      }
      existing._alert_category = existing._categories[0] || existing._alert_category;
      existing._alert_reason = existing._issues
        .map((i: StackedModIssue) => `${i.title}: ${i.detail}`)
        .join(" • ");

      if (!isKnownCreatorName(existing.author) && isKnownCreatorName(mod.author)) {
        existing.author = mod.author;
      }
      if (mod.hasUpdate) existing.hasUpdate = true;
      if (!existing.newVersion && mod.newVersion) existing.newVersion = mod.newVersion;
      if (!existing.newGameVersion && mod.newGameVersion) {
        existing.newGameVersion = mod.newGameVersion;
      }
      if (!existing.download_url && mod.download_url) existing.download_url = mod.download_url;
      if (!existing.url && mod.url) existing.url = mod.url;
      if (
        (!existing.version ||
          String(existing.version).toLowerCase() === "v.local" ||
          String(existing.version).toLowerCase() === "vlocal") &&
        mod.version &&
        String(mod.version).toLowerCase() !== "v.local" &&
        String(mod.version).toLowerCase() !== "vlocal"
      ) {
        existing.version = mod.version;
      }
    }
  }

  // Second pass: merge prefix-based Addons/Modules into their parent mod card if present
  const entries = Array.from(grouped.values());
  const mergedOut = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (mergedOut.has(i)) continue;
    const parent = entries[i];
    const pTitle = String(parent._groupedTitle || "").trim();
    if (pTitle.length < 5) continue;
    const pLower = pTitle.toLowerCase();

    for (let j = 0; j < entries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = entries[j];
      const cTitle = String(candidate._groupedTitle || "").trim();
      const cLower = cTitle.toLowerCase();

      const pNorm = normalizeModGroupTitle(pTitle).toLowerCase();
      const cNorm = normalizeModGroupTitle(cTitle).toLowerCase();
      const isEqualTwin = Boolean(pNorm.length >= 4 && pNorm === cNorm);
      const isPrefixAddon =
        isEqualTwin ||
        (cLower.length > pLower.length &&
          cLower.startsWith(pLower) &&
          /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
            cTitle.slice(pTitle.length)
          ));

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent._moduleCount = (parent._moduleCount || 1) + (candidate._moduleCount || 1);
        parent._groupedMods.push(...(candidate._groupedMods || [candidate]));
        parent._groupOriginalNames.push(...(candidate._groupOriginalNames || [candidate.name]));
        for (const cat of candidate._categories || []) {
          if (!parent._categories.includes(cat)) parent._categories.push(cat);
        }
        for (const iss of candidate._issues || []) {
          const existsAlready = parent._issues.some(
            (e: StackedModIssue) =>
              e.category === iss.category &&
              e.title === iss.title &&
              e.detail.toLowerCase() === iss.detail.toLowerCase()
          );
          if (!existsAlready) parent._issues.push(iss);
        }
        if (candidate._alert_type === "red") parent._alert_type = "red";
        if (candidate.hasUpdate) parent.hasUpdate = true;
        if (!parent.newVersion && candidate.newVersion) parent.newVersion = candidate.newVersion;
        if (!isKnownCreatorName(parent.author) && isKnownCreatorName(candidate.author)) {
          parent.author = candidate.author;
        }
      }
    }
  }

  return entries.filter((_, idx) => !mergedOut.has(idx));
}

const PRESERVED_ACRONYMS = new Set([
  "MC",
  "CAS",
  "UI",
  "DLC",
  "HQ",
  "XML",
  "NPC",
  "VIP",
  "CC",
  "BB",
  "EP",
  "GP",
  "SP",
  "FP",
  "KP",
  "3D",
  "2D",
  "TV",
  "PC",
  "OS",
  "ID",
  "DIY",
  "AI",
  "NWP",
]);

export function formatCleanModTitle(rawTitle: any): string {
  const resolved =
    rawTitle && typeof rawTitle === "object"
      ? rawTitle._groupedTitle || formatDisplayName(rawTitle.displayName || rawTitle.name || "")
      : rawTitle;
  const trimmed = String(resolved || "").trim();
  if (!trimmed || /^\[object\s+object\]$/i.test(trimmed)) return "";

  const spaced = trimmed
    .replace(/([\]})])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .map((token) => {
      const match = token.match(/^([([{'‘’"“”]*)(.*?)([)\]}'‘’"“”:,.;!?]*)$/);
      if (!match) return token;
      const [, prefix, core, suffix] = match;
      if (!core) return token;

      const upperCore = core.toUpperCase();
      if (PRESERVED_ACRONYMS.has(upperCore)) {
        return `${prefix}${upperCore}${suffix}`;
      }
      // Preserve alphanumeric codes like MAX20, V1, DLC01
      if (/[A-Za-z]/.test(core) && /\d/.test(core)) {
        return `${prefix}${upperCore}${suffix}`;
      }
      if (core.length <= 1) {
        return `${prefix}${upperCore}${suffix}`;
      }
      // If word is all lowercase or all uppercase, convert to Title Case
      if (core === core.toLowerCase() || core === core.toUpperCase()) {
        return `${prefix}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${suffix}`;
      }
      return `${prefix}${core.charAt(0).toUpperCase()}${core.slice(1)}${suffix}`;
    })
    .join(" ");
}

export function formatAddonModuleName(rawMod: any, activeGameSchema?: any): string {
  const base = formatDisplayName(
    rawMod?.displayName || rawMod?.name || "",
    undefined,
    activeGameSchema
  ).trim();
  if (!base) return "";
  return formatCleanModTitle(base);
}

export function resolveActiveBlueprintMods(
  rawSetMods: any,
  modList: any[],
  activeGameSchema?: any,
  networkUpdates?: any
): any[] {
  const safeMods = filterBlueprintModArtifacts(rawSetMods, activeGameSchema);
  if (safeMods.length === 0) return [];

  const safeList = Array.isArray(modList) ? modList : [];
  const extRegex = getExtensionRegex(activeGameSchema);

  const exactMatchMap = new Map<string, any>();
  const baseMatchMap = new Map<string, any>();

  for (let i = 0; i < safeList.length; i++) {
    const m = safeList[i];
    if (!m) continue;
    if (Array.isArray(m.flavors)) {
      for (let j = 0; j < m.flavors.length; j++) {
        const fl = m.flavors[j];
        if (!fl?.name) continue;
        const exactKey = String(fl.name).toLowerCase().replace(/\\/g, "/");
        exactMatchMap.set(exactKey, fl);
        const baseKey = String(fl.name)
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toLowerCase();
        if (baseKey && !baseMatchMap.has(baseKey)) {
          baseMatchMap.set(baseKey, fl);
        }
      }
    }
    if (!m.name) continue;
    const exactKey = String(m.name).toLowerCase().replace(/\\/g, "/");
    exactMatchMap.set(exactKey, m);

    const baseKey = String(m.name)
      .split(/[\\/]/)
      .pop()
      ?.replace(extRegex, "")
      .toLowerCase();
    if (baseKey && !baseMatchMap.has(baseKey)) {
      baseMatchMap.set(baseKey, m);
    }
  }

  const netUpdated = Array.isArray(networkUpdates?.updated) ? networkUpdates.updated : [];
  const netBroken = Array.isArray(networkUpdates?.broken) ? networkUpdates.broken : [];
  const netObsolete = Array.isArray(networkUpdates?.obsolete) ? networkUpdates.obsolete : [];

  const updByHash = new Map<string, any>();
  const updByName = new Map<string, any>();
  for (let i = 0; i < netUpdated.length; i++) {
    const u = netUpdated[i];
    if (u?.hash) updByHash.set(u.hash, u);
    if (u?.name) updByName.set(u.name, u);
  }
  const brokenByHash = new Map<string, any>();
  const brokenByName = new Map<string, any>();
  for (let i = 0; i < netBroken.length; i++) {
    const b = netBroken[i];
    if (b?.hash) brokenByHash.set(b.hash, b);
    if (b?.name) brokenByName.set(b.name, b);
  }
  const obsoleteByHash = new Map<string, any>();
  const obsoleteByName = new Map<string, any>();
  for (let i = 0; i < netObsolete.length; i++) {
    const b = netObsolete[i];
    if (b?.hash) obsoleteByHash.set(b.hash, b);
    if (b?.name) obsoleteByName.set(b.name, b);
  }

  const enrichWithNetState = (matched: any) => {
    let res = matched;
    const upd =
      (res.hash && updByHash.get(res.hash)) || (res.name && updByName.get(res.name));
    if (upd && !res.hasUpdate) {
      res = {
        ...res,
        hasUpdate: true,
        newVersion: upd.newVersion || res.newVersion,
        newGameVersion: upd.newGameVersion || res.newGameVersion,
        download_url: upd.download_url || res.download_url,
      };
    }
    const netBrokenHit =
      (res.hash && brokenByHash.get(res.hash)) ||
      (res.name && brokenByName.get(res.name));
    const netObsoleteHit =
      (res.hash && obsoleteByHash.get(res.hash)) ||
      (res.name && obsoleteByName.get(res.name));
    if (netBrokenHit && res.status !== "broken" && res.status !== "corrupted") {
      res = {
        ...res,
        status: "broken",
        status_reason:
          res.status_reason || netBrokenHit.status_reason || netBrokenHit.reason || undefined,
      };
    } else if (netObsoleteHit && res.status !== "obsolete") {
      res = {
        ...res,
        status: "obsolete",
        status_reason:
          res.status_reason ||
          netObsoleteHit.status_reason ||
          netObsoleteHit.reason ||
          undefined,
      };
    }
    return res;
  };

  return safeMods.map((rawMod: any) => {
    const modName =
      typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
    const cleanModName = stripPriorityTierPrefix(modName, activeGameSchema);
    const modNameLow = cleanModName.toLowerCase().replace(/\\/g, "/");

    const exactMatch = exactMatchMap.get(modNameLow);
    if (exactMatch) {
      return { ...enrichWithNetState(exactMatch), _originalSetName: modName };
    }

    const mBase = modName
      .split(/[\\/]/)
      .pop()
      ?.replace(extRegex, "")
      .toLowerCase();
    const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;
    if (baseMatch) {
      return { ...enrichWithNetState(baseMatch), _originalSetName: modName };
    }

    return {
      id: `missing-${modName}`,
      name: modName,
      isFallback: true,
      _originalSetName: modName,
      color: "theme-border-danger",
      physical_path: null,
      hash: "vlocal",
    };
  });
}

export function resolveBlueprintConflicts(
  scopeName: string | undefined,
  activeMods: any[],
  ignoredGlobal: string[] = [],
  t: (key: string, fallback?: string) => string,
  activeGameSchema?: any
): any[] {
  const schemaToUse = activeGameSchema ?? useStore.getState().activeGameSchema;
  const conflicts: any[] = [];
  const seenCanonicalPairs = new Set<string>();
  const seenDbIdPairs = new Set<string>();
  const ignoredSet = new Set<string>(Array.isArray(ignoredGlobal) ? ignoredGlobal : []);

  const byUpperExact = new Map<string, any>();
  const byDbId = new Map<string, any>();
  const preppedMods: Array<{ em: any; cleanN: string; cleanDisp: string }> = [];

  for (let i = 0; i < (activeMods || []).length; i++) {
    const em = activeMods[i];
    if (!em) continue;
    const rawName = String(em.name || em._originalSetName || "");
    const cleanN = rawName.toUpperCase();
    const cleanDisp = String(em.displayName || "").toUpperCase();
    const emBase = (rawName.split(/[\\/]/).pop() || "").replace(/\.[^/.]+$/, "").toUpperCase();

    if (cleanN && !byUpperExact.has(cleanN)) byUpperExact.set(cleanN, em);
    if (cleanDisp && !byUpperExact.has(cleanDisp)) byUpperExact.set(cleanDisp, em);
    if (emBase && !byUpperExact.has(emBase)) byUpperExact.set(emBase, em);
    if (em.dbId) {
      const dbKey = String(em.dbId).split("@")[0].trim();
      if (dbKey) {
        const existingDbMod = byDbId.get(dbKey);
        if (
          !existingDbMod ||
          (isScriptExtension(String(existingDbMod.name || ""), schemaToUse) &&
            !isScriptExtension(rawName, schemaToUse))
        ) {
          byDbId.set(dbKey, em);
        }
      }
    }
    if (!em.isFallback) {
      preppedMods.push({ em, cleanN, cleanDisp });
    }
  }

  const findMatchingMod = (targetRaw: string) => {
    const cleanTarget = String(targetRaw || "").trim();
    if (!cleanTarget) return null;
    const upperTarget = cleanTarget.toUpperCase();
    const baseTarget = (cleanTarget.split(/[\\/]/).pop() || cleanTarget)
      .replace(/\.[^/.]+$/, "")
      .toUpperCase();

    const exact = byUpperExact.get(upperTarget) || (baseTarget ? byUpperExact.get(baseTarget) : undefined);
    if (exact) return exact;

    if (upperTarget.length > 3) {
      for (let i = 0; i < preppedMods.length; i++) {
        const { em, cleanN, cleanDisp } = preppedMods[i];
        if (
          cleanN.includes(upperTarget) ||
          cleanDisp.includes(upperTarget) ||
          (cleanN && upperTarget.includes(cleanN))
        ) {
          return em;
        }
      }
    }

    return {
      name: cleanTarget,
      displayName: formatCleanModTitle(cleanTarget.replace(/\.[^/.]+$/, "")),
      _originalSetName: cleanTarget,
    };
  };

  const makeCanonicalPairKey = (modA: any, modB: any, fallbackA: string, fallbackB: string) => {
    const idA = (
      String(modA?.name || modA?._originalSetName || fallbackA)
        .split(/[\\/]/)
        .pop() || fallbackA
    )
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .trim();
    const idB = (
      String(modB?.name || modB?._originalSetName || fallbackB)
        .split(/[\\/]/)
        .pop() || fallbackB
    )
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .trim();
    if (!idA || !idB || idA === idB) return null;
    return [idA, idB].sort().join("||");
  };

  const makeDbIdPairKey = (modA: any, modB: any): string | null => {
    const dbA = modA?.dbId ? String(modA.dbId).split("@")[0].trim() : "";
    const dbB = modB?.dbId ? String(modB.dbId).split("@")[0].trim() : "";
    if (
      !dbA ||
      !dbB ||
      dbA === "null" ||
      dbA === "undefined" ||
      dbB === "null" ||
      dbB === "undefined" ||
      dbA.startsWith("local_") ||
      dbB.startsWith("local_") ||
      dbA === dbB
    ) {
      return null;
    }
    return [dbA, dbB].sort().join("||");
  };

  if (scopeName) {
    try {
      const cachedRaw = localStorage.getItem(`sanctuary_radar_cache_${scopeName}`);
      if (cachedRaw) {
        const parsedCache = JSON.parse(cachedRaw);
        const fatalList = Array.isArray(parsedCache?.fatal) ? parsedCache.fatal : [];
        const tuningList = Array.isArray(parsedCache?.tuning) ? parsedCache.tuning : [];
        const cloneList = Array.isArray(parsedCache?.clone) ? parsedCache.clone : [];

        const combined = [
          ...fatalList.map((c: any) => ({ ...c, severity_rank: 4 })),
          ...tuningList.map((c: any) => ({ ...c, severity_rank: c.severity_rank || 3 })),
          ...cloneList.map((c: any) => ({
            ...c,
            severity_rank: 3,
            resolution_note: c.resolution_note || t("tier3_conflict", "Tuning Overlap"),
          })),
        ];

        for (const lc of combined) {
          const pairParts = String(lc.mod_pair || "").split(
            /\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS|👻)\s+/
          );
          const rawA = String(lc.modA || lc.mod_a || pairParts[0] || "").trim();
          const rawB = String(
            lc.modB || lc.mod_b || (pairParts.length > 1 ? pairParts[1] : "") || ""
          ).trim();
          const pairId = String(lc.mod_pair || `${rawA} vs ${rawB}`).trim();
          if (!pairId || !rawA || !rawB) continue;
          if (ignoredSet.has(pairId)) continue;

          const modAMatch = findMatchingMod(rawA);
          const modBMatch = findMatchingMod(rawB);
          if (!modAMatch || !modBMatch) continue;

          const canonicalKey = makeCanonicalPairKey(modAMatch, modBMatch, rawA, rawB);
          if (!canonicalKey || seenCanonicalPairs.has(canonicalKey)) continue;
          const dbIdPairKey = makeDbIdPairKey(modAMatch, modBMatch);
          if (dbIdPairKey && seenDbIdPairs.has(dbIdPairKey)) continue;

          seenCanonicalPairs.add(canonicalKey);
          if (dbIdPairKey) seenDbIdPairs.add(dbIdPairKey);

          conflicts.push({
            pairId,
            modA: modAMatch,
            modB: modBMatch,
            conflict: {
              severity_rank: Number(lc.severity_rank) === 4 ? 4 : 3,
              resolution_note:
                lc.resolution_note ||
                (Number(lc.severity_rank) === 4
                  ? t("fatal_conflict", "Fatal Conflict")
                  : t("tier3_conflict", "Tuning Overlap")),
            },
          });
        }
      }
    } catch (e) {
      console.warn("Failed to parse radar conflict cache:", e);
    }
  }

  for (const mod of activeMods || []) {
    if (!mod || mod.isFallback || !Array.isArray(mod.conflicts)) continue;
    const modDbKey = mod.dbId ? String(mod.dbId).split("@")[0].trim() : "";
    const canonicalMod = (modDbKey && byDbId.get(modDbKey)) || mod;
    for (const c of mod.conflicts) {
      const cleanEnemyId = c.enemy_id ? String(c.enemy_id).split("@")[0].trim() : "";
      let enemyActive: any = cleanEnemyId ? byDbId.get(cleanEnemyId) : undefined;
      if (enemyActive?.isFallback) enemyActive = undefined;
      if (!enemyActive && c.enemy_name) {
        const targetClean = String(c.enemy_name)
          .replace(/\.[^/.]+$/i, "")
          .toUpperCase();
        enemyActive = byUpperExact.get(targetClean);
        if (enemyActive?.isFallback) enemyActive = undefined;
        if (!enemyActive && targetClean) {
          for (let i = 0; i < preppedMods.length; i++) {
            const { em, cleanN, cleanDisp } = preppedMods[i];
            if (cleanN.includes(targetClean) || cleanDisp.includes(targetClean)) {
              enemyActive = em;
              break;
            }
          }
        }
        if (enemyActive?.dbId) {
          const enemyDbKey = String(enemyActive.dbId).split("@")[0].trim();
          enemyActive = (enemyDbKey && byDbId.get(enemyDbKey)) || enemyActive;
        }
      }
      if (
        enemyActive &&
        canonicalMod.name &&
        enemyActive.name &&
        canonicalMod.name !== enemyActive.name
      ) {
        const canonicalKey = makeCanonicalPairKey(
          canonicalMod,
          enemyActive,
          String(canonicalMod.name),
          String(enemyActive.name)
        );
        if (!canonicalKey || seenCanonicalPairs.has(canonicalKey)) continue;
        const dbIdPairKey = makeDbIdPairKey(canonicalMod, enemyActive);
        if (dbIdPairKey && seenDbIdPairs.has(dbIdPairKey)) continue;

        const sortedNames = [String(canonicalMod.name), String(enemyActive.name)].sort();
        const pairId = `${sortedNames[0]} vs ${sortedNames[1]}`;
        if (ignoredSet.has(pairId)) continue;
        seenCanonicalPairs.add(canonicalKey);
        if (dbIdPairKey) seenDbIdPairs.add(dbIdPairKey);

        const sevRank = Number(c.severity_rank) === 4 ? 4 : 3;
        conflicts.push({
          pairId,
          modA: canonicalMod,
          modB: enemyActive,
          conflict: {
            severity_rank: sevRank,
            resolution_note:
              c.resolution_note ||
              (sevRank === 4
                ? t("fatal_conflict", "Fatal Conflict")
                : t("tier3_conflict", "Tuning Overlap")),
          },
        });
      }
    }
  }

  // Highlander Exclusive Slot conflict detection across distinct base families
  const slotBuckets = new Map<
    string,
    { slotName: string; byFamily: Map<string, any> }
  >();
  for (let i = 0; i < (activeMods || []).length; i++) {
    const em = activeMods[i];
    if (!em || em.isVirtual) continue;
    const slot = resolveModHighlanderSlot(em);
    if (!slot) continue;
    const famKey = String(
      em.baseFamilyId || em.familyId || em.dbId || em.hash || em.name || ""
    )
      .split("@")[0]
      .trim()
      .toLowerCase();
    if (!famKey) continue;
    let bucket = slotBuckets.get(slot.key);
    if (!bucket) {
      bucket = { slotName: slot.name, byFamily: new Map() };
      slotBuckets.set(slot.key, bucket);
    }
    const existingRep = bucket.byFamily.get(famKey);
    const rawName = String(em.name || em._originalSetName || "");
    if (
      !existingRep ||
      (isScriptExtension(String(existingRep.name || ""), schemaToUse) &&
        !isScriptExtension(rawName, schemaToUse))
    ) {
      bucket.byFamily.set(famKey, em);
    }
  }

  slotBuckets.forEach(({ slotName, byFamily }) => {
    const reps = Array.from(byFamily.values());
    if (reps.length < 2) return;
    for (let i = 0; i < reps.length; i++) {
      for (let j = i + 1; j < reps.length; j++) {
        const modA = reps[i];
        const modB = reps[j];
        const canonicalKey = makeCanonicalPairKey(
          modA,
          modB,
          String(modA.name || ""),
          String(modB.name || "")
        );
        if (!canonicalKey || seenCanonicalPairs.has(canonicalKey)) continue;
        const dbIdPairKey = makeDbIdPairKey(modA, modB);
        if (dbIdPairKey && seenDbIdPairs.has(dbIdPairKey)) continue;
        const sortedNames = [String(modA.name), String(modB.name)].sort();
        const pairId = `${sortedNames[0]} vs ${sortedNames[1]}`;
        if (ignoredSet.has(pairId)) continue;
        seenCanonicalPairs.add(canonicalKey);
        if (dbIdPairKey) seenDbIdPairs.add(dbIdPairKey);
        conflicts.push({
          pairId,
          modA,
          modB,
          conflict: {
            severity_rank: 3,
            resolution_note: t(
              "highlander_slot_conflict_note",
              "Highlander Exclusive Slot ({0}): Only one {Mod} from this slot should be active at a time."
            ).replace("{0}", slotName),
          },
        });
      }
    }
  });

  return conflicts;
}

export function IncompatibleModCard({
  mod,
  isIgnored,
  isAmber,
  setIgnoredBroken,
  ignoredBroken,
  toggleInActiveSet,
  allow_write,
  t,
  activeGameSchema,
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showImages = useStore((state: any) => state.showImages);
  const image =
    showImages &&
    (mod.image_url || mod.imageUrl) &&
    String(mod.image_url || mod.imageUrl) !== "null" &&
    String(mod.image_url || mod.imageUrl).trim() !== ""
      ? mod.image_url || mod.imageUrl
      : undefined;
  const modIcon = getModIcon(mod, activeGameSchema, t);
  const groupedMods: any[] =
    Array.isArray(mod._groupedMods) && mod._groupedMods.length > 0 ? mod._groupedMods : [mod];
  const allGroupIgnored =
    ignoredBroken instanceof Set ? groupedMods.every((m) => ignoredBroken.has(m.name)) : false;
  const effectiveIgnored = Boolean(isIgnored || allGroupIgnored);

  const rawTitle = mod._groupedTitle || formatDisplayName(mod.displayName || mod.name);
  const title = formatCleanModTitle(rawTitle) || rawTitle;

  const hasRealVersion = Boolean(
    mod.version &&
      String(mod.version).trim() !== "" &&
      String(mod.version).toLowerCase() !== "v.local" &&
      String(mod.version).toLowerCase() !== "vlocal" &&
      String(mod.version).toLowerCase() !== "local" &&
      String(mod.version).toLowerCase() !== "unknown"
  );
  const cleanInstalledVer = hasRealVersion
    ? String(mod.version).replace(/^v\.?/i, "").trim()
    : null;

  const validCreator = extractValidCreator(mod, ...groupedMods);
  const hasScriptFile = groupedMods.some((gm) =>
    isScriptExtension(String(gm?.name || gm?._originalSetName || ""), activeGameSchema)
  );
  const fallbackTypeLabel = hasScriptFile
    ? t("type_script", "Script")
    : t("type_package", "Module");

  const hasUpdate = Boolean(mod.hasUpdate && mod.newVersion);
  const cleanNewVer = mod.newVersion
    ? String(mod.newVersion).replace(/^v\.?/i, "").trim()
    : null;

  const resolvedFallbackUrl = getModFallbackUrl(
    title || mod.name || "",
    mod.hash,
    activeGameSchema,
    { url: mod.download_url || mod.url }
  );

  const openModUpdate = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const targetUrl = mod.download_url || mod.url || resolvedFallbackUrl;
    handleOpenUrl(targetUrl);
  };

  const selectedWorkspaceVersion = useStore((state: any) => state.selectedVersion);

  const categories: StackedModIssue["category"][] =
    Array.isArray(mod._categories) && mod._categories.length > 0
      ? mod._categories
      : [mod._alert_category || (isAmber ? "unstable" : "corrupted")];

  const stackedIssues: StackedModIssue[] =
    Array.isArray(mod._issues) && mod._issues.length > 0
      ? mod._issues
      : [
          {
            category: categories[0],
            type: isAmber ? "amber" : "red",
            icon: isAmber
              ? t("icon_warning", "warning")
              : t("icon_error", "error"),
            title: isAmber
              ? t("label_unstable", "Unstable")
              : t("status_corrupted", "Corrupted"),
            detail: cleanModIssueReason(mod.status_reason),
          },
        ];

  const missingDepTargets: MissingDepTarget[] = [];
  const seenDepNames = new Set<string>();
  const missingDlcLabels: string[] = [];
  let customStatusReason = "";

  stackedIssues.forEach((iss) => {
    if (iss.category === "missing_deps") {
      const depName = iss.depTarget?.name || iss.detail || "";
      const depKey = depName.toLowerCase().trim();
      if (depKey && !seenDepNames.has(depKey)) {
        seenDepNames.add(depKey);
        missingDepTargets.push(
          iss.depTarget || {
            name: depName,
            url: getModFallbackUrl(depName, undefined, activeGameSchema),
          }
        );
      }
    } else if (iss.category === "missing_dlc" && iss.detail) {
      if (!missingDlcLabels.includes(iss.detail)) {
        missingDlcLabels.push(iss.detail);
      }
    } else if (
      (iss.category === "corrupted" || iss.category === "unstable") &&
      iss.detail &&
      !customStatusReason
    ) {
      customStatusReason = iss.detail;
    }
  });

  const vaultDepsToEquip = missingDepTargets.filter((d) => Boolean(d.vaultModName));

  const issueRows: {
    icon: string;
    issueLabel: string;
    detailValue?: string;
    tooltipLines: string[];
    type: "red" | "amber";
  }[] = stackedIssues.map((iss) => {
    const hasCustomDetail = Boolean(
      iss.detail &&
        iss.detail.toLowerCase() !== rawTitle.toLowerCase() &&
        iss.detail.toLowerCase() !== title.toLowerCase() &&
        iss.detail.toLowerCase() !== iss.title.toLowerCase()
    );

    if (iss.category === "version_mismatch") {
      const instLabel =
        iss.installedVersion ||
        formatVersionBadgeText(selectedWorkspaceVersion, t("unknown", "Unknown"));
      const reqLabel =
        iss.requiredVersion ||
        (hasCustomDetail ? formatVersionBadgeText(iss.detail, t("unknown", "Unknown")) : t("unknown", "Unknown"));
      return {
        icon: t("icon_sports_esports", "sports_esports"),
        issueLabel: t("modal_version_mismatch", "Version Mismatch"),
        detailValue: reqLabel,
        tooltipLines: [
          `${t("installed", "Installed")}: ${instLabel}`,
          `${t("tooltip_required", "Required:")} ${reqLabel}`,
        ],
        type: iss.type,
      };
    }
    if (iss.category === "missing_deps") {
      const depName = iss.depTarget?.name || iss.detail || t("unknown", "Unknown");
      const whereHint =
        iss.depTarget?.vaultModName && allow_write && toggleInActiveSet
          ? t("dep_in_vault_equip_hint", "In {Vault} — Click + on card to equip")
          : iss.depTarget?.sourceHost
            ? `${t("source", "Source")}: ${iss.depTarget.sourceHost}`
            : t("dep_click_download_hint", "Click download icon on card to get it");
      return {
        icon: iss.icon || t("icon_extension", "extension"),
        issueLabel: t("badge_missing_dep", "Missing Dependency"),
        detailValue: depName,
        tooltipLines: [`${t("tooltip_required", "Required:")} ${depName}`, whereHint],
        type: iss.type,
      };
    }
    if (iss.category === "missing_dlc") {
      return {
        icon: iss.icon || t("icon_currency_exchange", "currency_exchange"),
        issueLabel: t("missing_dlc", "Missing DLC"),
        detailValue: hasCustomDetail ? iss.detail : undefined,
        tooltipLines: [
          `${t("tooltip_required", "Required:")} ${iss.detail || t("unknown", "Unknown")}`,
        ],
        type: iss.type,
      };
    }
    if (iss.category === "corrupted") {
      return {
        icon: t("icon_gpp_bad", "gpp_bad"),
        issueLabel: iss.title || t("status_corrupted", "Corrupted"),
        detailValue: hasCustomDetail ? iss.detail : undefined,
        tooltipLines: hasCustomDetail
          ? [iss.detail]
          : [
              t(
                "corrupted_default_tooltip",
                "Flagged broken or incompatible. Open {Mod} Metadata to add or view issue details."
              ),
            ],
        type: iss.type,
      };
    }
    if (iss.category === "unstable") {
      return {
        icon: t("icon_warning_amber", "warning_amber"),
        issueLabel: iss.title || t("label_unstable", "Unstable"),
        detailValue: hasCustomDetail ? iss.detail : undefined,
        tooltipLines: hasCustomDetail
          ? [iss.detail]
          : [
              t(
                "unstable_default_tooltip",
                "Reported minor glitches or conditional issues. Open {Mod} Metadata to add or view issue details."
              ),
            ],
        type: iss.type,
      };
    }
    return {
      icon: iss.icon || t("icon_error", "error"),
      issueLabel: iss.title,
      detailValue: hasCustomDetail ? iss.detail : undefined,
      tooltipLines: hasCustomDetail ? [iss.detail] : [],
      type: iss.type,
    };
  });

  const primaryIssue = issueRows[0];
  const extraIssues = issueRows.slice(1);

  return (
    <div
      onClick={() =>
        openModDossier(
          groupedMods.length > 1
            ? {
                ...mod,
                displayName: title || mod._groupedTitle || mod.displayName || mod.name,
                isVirtual: true,
                flavors: groupedMods,
              }
            : mod
        )
      }
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-2.5 transition-all duration-200 cursor-pointer relative ${
        isExpanded && groupedMods.length > 1 ? "sm:col-span-2" : ""
      } ${effectiveIgnored ? "opacity-50 grayscale-[40%]" : ""}`}
    >
      {/* Top Tier: Full-Width Icon Well + Clean Title/Creator Identity */}
      <div className="flex items-start gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-opacity ${
              isAmber ? "text-[var(--warning)]" : "text-[var(--danger)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {title}
            </span>
            <HoverTooltip
              className="z-[100]"
              onlyWhenTruncated={true}
              title={title}
              icon={modIcon}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {validCreator ? (
              <span className="truncate opacity-90">
                {formatCleanModTitle(validCreator)}
              </span>
            ) : (
              <span className="opacity-85 shrink-0">{fallbackTypeLabel}</span>
            )}
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {hasUpdate && cleanNewVer ? (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="relative group/verinline font-mono text-[10px] font-bold text-[var(--accent)] shrink-0">
                  ↑ v{cleanNewVer}
                  <HoverTooltip
                    className="z-[100]"
                    title={
                      cleanInstalledVer
                        ? `v${cleanInstalledVer} → v${cleanNewVer}`
                        : `v${cleanNewVer}`
                    }
                    icon={t("icon_update", "update")}
                    variant="accent"
                  />
                </span>
              </>
            ) : cleanInstalledVer ? (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  v{cleanInstalledVer}
                </span>
              </>
            ) : null}
          </div>

          {missingDepTargets.length > 0 ? (
            <div className="relative group/depline flex items-center gap-1 text-[10.5px] font-semibold text-[var(--danger)] min-w-0 mt-0.5">
              <span className="truncate">
                {t("tooltip_required", "Required:")}{" "}
                {missingDepTargets.map((d) => d.name).join(", ")}
                {missingDepTargets[0].sourceHost
                  ? ` (${missingDepTargets[0].sourceHost})`
                  : ""}
              </span>
              <HoverTooltip
                className="z-[100]"
                title={t("badge_missing_dep", "Missing Dependency")}
                subtitle={missingDepTargets
                  .map((d) =>
                    d.sourceHost ? `${d.name} • ${d.sourceHost}` : d.name
                  )
                  .join("\n")}
                icon={t("icon_extension", "extension")}
                variant="danger"
              />
            </div>
          ) : missingDlcLabels.length > 0 ? (
            <div className="relative group/dlcline flex items-center gap-1 text-[10.5px] font-semibold text-[var(--danger)] min-w-0 mt-0.5">
              <span className="truncate">
                {t("tooltip_required", "Required:")} {missingDlcLabels.join(", ")}
              </span>
              <HoverTooltip
                className="z-[100]"
                onlyWhenTruncated={true}
                title={t("missing_dlc", "Missing DLC")}
                subtitle={missingDlcLabels.join(", ")}
                icon={t("icon_currency_exchange", "currency_exchange")}
                variant="danger"
              />
            </div>
          ) : customStatusReason ? (
            <div className="relative group/reasonline flex items-center gap-1 text-[10.5px] font-medium text-[var(--subtext)] opacity-90 min-w-0 mt-0.5">
              <span className="truncate">{customStatusReason}</span>
              <HoverTooltip
                className="z-[100]"
                onlyWhenTruncated={true}
                title={primaryIssue?.issueLabel || t("status", "Status")}
                subtitle={customStatusReason}
                icon={primaryIssue?.icon}
                variant={isAmber ? "warning" : "danger"}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom Status & Action Bar: Single Status Badge on Left | Uniform Action Icon Buttons on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {primaryIssue && (
            <span className={`relative group/statusbadge ${VAULT_CHIP_CLASS}`}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  primaryIssue.type === "amber"
                    ? "text-[var(--warning)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {primaryIssue.icon}
              </span>
              <span>{primaryIssue.issueLabel}</span>
              {extraIssues.length > 0 && (
                <span className="opacity-75">+{extraIssues.length}</span>
              )}
              <HoverTooltip
                className="z-[100]"
                title={primaryIssue.issueLabel}
                icon={primaryIssue.icon}
                variant={primaryIssue.type === "amber" ? "warning" : "danger"}
                content={
                  <div className="flex flex-col items-start gap-2 min-w-[175px]">
                    {[primaryIssue, ...extraIssues].map((r, rIdx) => (
                      <div
                        key={rIdx}
                        className="flex flex-col items-start gap-0.5 text-left w-full"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide leading-snug text-[var(--text)]">
                          <span
                            className={`material-symbols-outlined !text-[14px] shrink-0 ${
                              r.type === "amber"
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
                  </div>
                }
              />
            </span>
          )}
        </div>

        {/* Bottom-Right Compact Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {allow_write && toggleInActiveSet && vaultDepsToEquip.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                vaultDepsToEquip.forEach((d) => {
                  if (d.vaultModName) {
                    toggleInActiveSet(d.vaultModName, false, false, true);
                  }
                });
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_38%,transparent)] hover:border-[var(--success)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
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
          )}

          {missingDepTargets.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const primaryDep = missingDepTargets[0];
                if (primaryDep?.url) {
                  handleOpenUrl(primaryDep.url);
                }
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {missingDepTargets[0].sourceHost
                  ? t("icon_download", "download")
                  : t("icon_travel_explore", "travel_explore")}
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

          {hasUpdate && cleanNewVer && (
            <button
              type="button"
              onClick={openModUpdate}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_update", "update")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  cleanInstalledVer
                    ? `${t("btn_update", "Update")} (v${cleanInstalledVer} → v${cleanNewVer})`
                    : `${t("btn_update", "Update")} (v${cleanNewVer})`
                }
                icon={t("icon_update", "update")}
                variant="accent"
              />
            </button>
          )}

          {setIgnoredBroken && ignoredBroken instanceof Set && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = new Set(ignoredBroken);
                if (effectiveIgnored) {
                  groupedMods.forEach((m) => next.delete(m.name));
                } else {
                  groupedMods.forEach((m) => next.add(m.name));
                }
                setIgnoredBroken(next);
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {effectiveIgnored
                  ? t("icon_visibility", "visibility")
                  : t("icon_visibility_off", "visibility_off")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  effectiveIgnored
                    ? t("bp_restore_alert", "Restore")
                    : t("btn_ignore", "Ignore")
                }
                icon={
                  effectiveIgnored
                    ? t("icon_visibility", "visibility")
                    : t("icon_visibility_off", "visibility_off")
                }
              />
            </button>
          )}

          {allow_write && toggleInActiveSet && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                groupedMods.forEach((m) => {
                  toggleInActiveSet(m._originalSetName || m.name, true, true);
                });
              }}
              className="relative group/actionbtn h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_remove_circle_outline", "remove_circle_outline")}
              </span>
              <span>{t("btn_remove", "{Remove}")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact Recessed Linked Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="max-h-[196px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {groupedMods.map((gm: any, gIdx: number) => {
              const gmName =
                formatAddonModuleName(gm, activeGameSchema) ||
                formatDisplayName(gm.displayName || gm.name);
              const isScript = isScriptExtension(
                String(gm?.name || gm?._originalSetName || ""),
                activeGameSchema
              );
              const gmIgnored =
                ignoredBroken instanceof Set ? ignoredBroken.has(gm.name) : false;

              return (
                <div
                  key={`${gm.name || gIdx}-${gIdx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openModDossier(gm);
                  }}
                  className={`glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    gmIgnored ? "opacity-50 grayscale-[40%]" : ""
                  }`}
                >
                  <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                      {isScript
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
                        isScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")
                      }
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70">
                      {isScript
                        ? t("type_script", "Script")
                        : t("type_package", "Package")}
                    </span>

                    {setIgnoredBroken && ignoredBroken instanceof Set && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(ignoredBroken);
                          if (gmIgnored) next.delete(gm.name);
                          else next.add(gm.name);
                          setIgnoredBroken(next);
                        }}
                        className="relative group/gmbtn w-6 h-6 rounded-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[13px]">
                          {gmIgnored
                            ? t("icon_visibility", "visibility")
                            : t("icon_visibility_off", "visibility_off")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={
                            gmIgnored
                              ? t("bp_restore_alert", "Restore")
                              : t("btn_ignore", "Ignore")
                          }
                          icon={
                            gmIgnored
                              ? t("icon_visibility", "visibility")
                              : t("icon_visibility_off", "visibility_off")
                          }
                        />
                      </button>
                    )}
                    {allow_write && toggleInActiveSet && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleInActiveSet(gm._originalSetName || gm.name, true, true);
                        }}
                        className="relative group/gmbtn w-6 h-6 rounded-md hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[13px]">
                          {t("icon_remove_circle_outline", "remove_circle_outline")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={t("btn_remove", "{Remove}")}
                          icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                          variant="danger"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function renderGroupedIncompatibleSections({
  groupedBrokenMods,
  ignoredBroken,
  setIgnoredBroken,
  toggleInActiveSet,
  allow_write,
  t,
  activeGameSchema,
}: any) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      {groupedBrokenMods.map((mod: any) => {
        const groupNames: string[] = mod._groupOriginalNames || [mod.name];
        const isGroupIgnored =
          ignoredBroken instanceof Set ? groupNames.every((n) => ignoredBroken.has(n)) : false;
        return (
          <IncompatibleModCard
            key={mod._groupedTitle || mod.name}
            mod={mod}
            isIgnored={isGroupIgnored}
            isAmber={mod._alert_type === "amber"}
            setIgnoredBroken={setIgnoredBroken}
            ignoredBroken={ignoredBroken}
            toggleInActiveSet={toggleInActiveSet}
            allow_write={allow_write}
            t={t}
            activeGameSchema={activeGameSchema}
          />
        );
      })}
    </div>
  );
}

export function ConflictComparisonCard({
  ac,
  ignoredConflicts,
  setIgnoredConflicts,
  showImages,
  allow_write,
  toggleInActiveSet,
  applyConflictOverride,
  scopeName,
  getPriorityDrop,
  activeGameSchema,
  t,
}: any) {
  const isIgnored = ignoredConflicts instanceof Set ? ignoredConflicts.has(ac.pairId) : false;
  const isTier4 = Number(ac.conflict?.severity_rank) === 4;

  const prefixA =
    String(ac.modA?._originalSetName || ac.modA?.name || "")
      .split(/[/\\]/)
      .slice(0, -1)
      .join("/") || "";
  const prefixB =
    String(ac.modB?._originalSetName || ac.modB?.name || "")
      .split(/[/\\]/)
      .slice(0, -1)
      .join("/") || "";
  const isWinnerA = prefixA.toLowerCase() === "sanctuary";
  const isWinnerB = prefixB.toLowerCase() === "sanctuary";

  const iconName = isTier4
    ? t("icon_crisis_alert", "crisis_alert")
    : t("icon_tune", "tune");

  const imageA =
    showImages &&
    (ac.modA?.image_url || ac.modA?.imageUrl) &&
    String(ac.modA?.image_url || ac.modA?.imageUrl) !== "null"
      ? ac.modA.image_url || ac.modA.imageUrl
      : undefined;
  const imageB =
    showImages &&
    (ac.modB?.image_url || ac.modB?.imageUrl) &&
    String(ac.modB?.image_url || ac.modB?.imageUrl) !== "null"
      ? ac.modB.image_url || ac.modB.imageUrl
      : undefined;

  const rawNote = String(ac.conflict?.resolution_note || "").trim();
  const hasMeaningfulNote =
    rawNote.length > 0 && rawNote.toLowerCase() !== "test";
  const conflictTitle = hasMeaningfulNote
    ? rawNote
    : isTier4
      ? t("conflict_sev4_desc", "Fatal Collision — Cannot be installed together")
      : t("conflict_sev3_desc", "Tuning Overlap — Load order override or minor feature overlap");

  const severityBadgeClass = VAULT_CHIP_CLASS;
  const winnerBadgeClass = VAULT_CHIP_CLASS;
  const loserBadgeClass = `${VAULT_CHIP_CLASS} !text-[var(--subtext)]`;

  const slots = [
    { mod: ac.modA, image: imageA, isWinner: isWinnerA, isLoser: isWinnerB },
    { mod: ac.modB, image: imageB, isWinner: isWinnerB, isLoser: isWinnerA },
  ];

  return (
    <div
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all flex flex-col gap-3 w-full ${
        isIgnored ? "opacity-50 grayscale-[40%]" : ""
      }`}
    >
      {/* Compact Header Strip */}
      <div className="flex items-center justify-between gap-2.5 w-full">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={severityBadgeClass}>
            <span
              className={`material-symbols-outlined !text-[12px] ${
                isTier4 ? "text-[var(--danger)]" : "text-[var(--warning)]"
              }`}
            >
              {iconName}
            </span>
            <span>
              {isTier4
                ? t("fatal_conflict", "Fatal Conflict")
                : t("tier3_conflict", "Tuning Overlap")}
            </span>
          </div>

          <div className="relative group/conflictnote flex items-center min-w-0 flex-1">
            <span className="text-xs font-bold text-[var(--subtext)] truncate">
              {conflictTitle}
            </span>
            <HoverTooltip
              className="z-[100]"
              title={conflictTitle}
              icon={iconName}
            />
          </div>
        </div>

        {setIgnoredConflicts && ignoredConflicts instanceof Set && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const next = new Set(ignoredConflicts);
              if (isIgnored) next.delete(ac.pairId);
              else next.add(ac.pairId);
              setIgnoredConflicts(next);
            }}
            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined !text-[15px]">
              {isIgnored
                ? t("icon_visibility", "visibility")
                : t("icon_visibility_off", "visibility_off")}
            </span>
            <HoverTooltip
              className="z-[100] !right-0 !translate-x-0 !left-auto"
              title={
                isIgnored
                  ? t("bp_restore_alert", "Restore Alert")
                  : t("btn_ignore", "Ignore")
              }
              icon={
                isIgnored
                  ? t("icon_visibility", "visibility")
                  : t("icon_visibility_off", "visibility_off")
              }
            />
          </button>
        )}
      </div>

      {/* Head-to-Head VS Clash Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5 w-full">
        {slots.map((slot, sIdx) => {
          if (!slot.mod) return null;
          const mTitle = formatCleanModTitle(
            formatDisplayName(slot.mod.displayName || slot.mod.name)
          );
          const mAuthor = extractValidCreator(slot.mod);
          const isScript = isScriptExtension(
            String(slot.mod?.name || slot.mod?._originalSetName || ""),
            activeGameSchema
          );
          const mTypeLabel = isScript
            ? t("type_script", "Script")
            : t("type_package", "Module");
          const mIcon = getModIcon(slot.mod, activeGameSchema, t);

          const cardElement = (
            <div
              key={`${ac.pairId}-slot-${sIdx}`}
              onClick={() => openModDossier(slot.mod)}
              className={`glass-surface rounded-xl p-3 border transition-all flex flex-col justify-between gap-2.5 min-w-0 cursor-pointer ${
                slot.isWinner && !isTier4
                  ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
              }`}
            >
              {/* Top Tier: Full-Width Icon + Title/Creator Identity */}
              <div className="flex items-center gap-2.5 min-w-0 w-full">
                <div className="w-9 h-9 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 overflow-hidden">
                  {slot.image ? (
                    <img
                      src={slot.image}
                      alt={mTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                      {mIcon}
                    </span>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="relative group/clashmod flex items-center min-w-0 w-fit max-w-full">
                    <span className="text-xs font-black text-[var(--text)] truncate">
                      {mTitle}
                    </span>
                    <HoverTooltip
                      className="z-[100]"
                      title={mTitle}
                      icon={mIcon}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--subtext)] min-w-0">
                    {mAuthor && (
                      <>
                        <span className="truncate">{formatCleanModTitle(mAuthor)}</span>
                        <span className="opacity-40 shrink-0">•</span>
                      </>
                    )}
                    <span className="shrink-0">{mTypeLabel}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Tier: Type/Status Badge on Left | Action Button on Right */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {isScript
                      ? t("icon_terminal", "terminal")
                      : t("icon_deployed_code", "deployed_code")}
                  </span>
                  <span>{mTypeLabel}</span>
                </span>

                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {isTier4 ? (
                    allow_write &&
                    toggleInActiveSet && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleInActiveSet(
                            slot.mod._originalSetName || slot.mod.name,
                            true,
                            true
                          );
                        }}
                        className="relative group/actionbtn h-7 px-2.5 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_remove_circle_outline", "remove_circle_outline")}
                        </span>
                        <span>{t("btn_remove", "{Remove}")}</span>
                      </button>
                    )
                  ) : Number(ac.conflict?.severity_rank) === 3 ? (
                    slot.isWinner ? (
                      <div className={winnerBadgeClass}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                        <span>{t("winner", "WINNING {MOD}")}</span>
                      </div>
                    ) : slot.isLoser ? (
                      <div className={loserBadgeClass}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t("icon_block", "block")}
                        </span>
                        <span>{t("bp_overridden_by_winner", "Overridden")}</span>
                      </div>
                    ) : (
                      allow_write &&
                      scopeName &&
                      applyConflictOverride && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            applyConflictOverride(
                              slot.mod._originalSetName || slot.mod.name,
                              ac.pairId,
                              scopeName
                            );
                          }}
                          className="relative group/actionbtn w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                          <HoverTooltip
                            className="z-[100] !right-0 !translate-x-0 !left-auto"
                            title={t("bp_select_winning_artifact", "Select Winner")}
                            icon={t("icon_check_circle", "check_circle")}
                            variant="accent"
                          />
                        </button>
                      )
                    )
                  ) : getPriorityDrop ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2"
                    >
                      <div className="w-28">{getPriorityDrop(slot.mod)}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );

          if (sIdx === 0) {
            return (
              <React.Fragment key={`${ac.pairId}-frag-${sIdx}`}>
                {cardElement}
                <div className="hidden sm:flex items-center justify-center">
                  <div
                    className={`w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                      isTier4 ? "text-[var(--danger)]" : "text-[var(--warning)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_bolt", "bolt")}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          }

          return cardElement;
        })}
      </div>
    </div>
  );
}

export default function CommandIncompatiblePanel({
  isOpen,
  onClose,
  activeMods,
  allow_write,
  toggleInActiveSet,
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, activeGameSchema } = useStore(
    useShallow((s) => ({
      ownedDLC: s.ownedDLC,
      maskedDLC: s.maskedDLC,
      selectedVersion: s.selectedVersion,
      activeGameSchema: s.activeGameSchema,
    }))
  );
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const brokenMods = useMemo(() => {
    return (activeMods || [])
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a._alert_type === "red" && b._alert_type === "amber") return -1;
        if (a._alert_type === "amber" && b._alert_type === "red") return 1;
        return 0;
      });
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t, activeGameSchema]);

  const redMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "red"),
    [brokenMods]
  );
  const amberMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "amber"),
    [brokenMods]
  );
  const groupedBrokenMods = useMemo(() => groupBrokenMods(brokenMods), [brokenMods]);
  const groupedRedMods = useMemo(
    () => groupedBrokenMods.filter((m: any) => m._alert_type === "red"),
    [groupedBrokenMods]
  );
  const groupedAmberMods = useMemo(
    () => groupedBrokenMods.filter((m: any) => m._alert_type === "amber"),
    [groupedBrokenMods]
  );

  const corruptedCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) =>
        (Array.isArray(m._categories) ? m._categories : [m._alert_category]).includes("corrupted")
      ).length,
    [groupedBrokenMods]
  );
  const mismatchCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) =>
        (Array.isArray(m._categories) ? m._categories : [m._alert_category]).includes(
          "version_mismatch"
        )
      ).length,
    [groupedBrokenMods]
  );
  const filteredGroupedBrokenMods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groupedBrokenMods.filter((mod: any) => {
      const cats: string[] = Array.isArray(mod._categories)
        ? mod._categories
        : [mod._alert_category];

      if (categoryFilter === "corrupted") {
        if (!cats.includes("corrupted")) return false;
      } else if (categoryFilter === "version_mismatch") {
        if (!cats.includes("version_mismatch")) return false;
      } else if (categoryFilter === "missing_reqs") {
        if (!cats.includes("missing_dlc") && !cats.includes("missing_deps")) {
          return false;
        }
      } else if (categoryFilter === "unstable") {
        if (!cats.includes("unstable") && mod._alert_type !== "amber") return false;
      }

      if (!q) return true;
      const title = String(mod._groupedTitle || mod.displayName || mod.name || "").toLowerCase();
      const author = String(mod.author || "").toLowerCase();
      const reason = String(mod._alert_reason || "").toLowerCase();
      return title.includes(q) || author.includes(q) || reason.includes(q);
    });
  }, [groupedBrokenMods, searchQuery, categoryFilter]);

  const panelIcon =
    redMods.length > 0 ? t("icon_gpp_bad", "gpp_bad") : t("icon_gpp_maybe", "gpp_maybe");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("citizen_action_incompatible", "Incompatible")}
      subtitle={t("incompatible_broken", "Incompatible {Mods}")}
      icon={panelIcon}
      iconColorClass={redMods.length > 0 ? "text-[var(--danger)]" : "text-[var(--warning)]"}
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        allow_write && (redMods.length > 0 || amberMods.length > 0) ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_remove_circle_outline", "remove_circle_outline")}
              tooltip={`${t("btn_remove", "{Remove}")} ${groupedRedMods.length + groupedAmberMods.length} ${t("term_mods", "{Mods}")}`}
              tooltipSubtitle={`${t("bp_purge_unstable", "{Remove} {0} Unstable").replace(/^.*\{0\}\s*/, `${groupedAmberMods.length} `)}\n${t("bp_purge_corrupted", "{Remove} {0} Corrupted").replace(/^.*\{0\}\s*/, `${groupedRedMods.length} `)}`}
              variant={groupedRedMods.length > 0 ? "danger" : "warning"}
              onClick={() => {
                brokenMods.forEach((m: any) =>
                  toggleInActiveSet && toggleInActiveSet(m._originalSetName || m.name, true, true)
                );
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={panelIcon}
          overline={t("citizen_action_incompatible", "Incompatible")}
          title={t("incompatible_broken", "Incompatible {Mods}")}
          description={t("action_required", "Action Required")}
          badge={`${groupedBrokenMods.length} ${t("term_mods", "Items")}`}
          badgeIcon={panelIcon}
          variant={
            redMods.length > 0
              ? "danger"
              : groupedBrokenMods.length > 0
                ? "warning"
                : "success"
          }
        />

        {groupedBrokenMods.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={panelIcon}
              label={t("filter_all", "All")}
              number={groupedBrokenMods.length}
              colorClass={redMods.length > 0 ? "text-[var(--danger)]" : "text-[var(--warning)]"}
              isActive={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_broken_image", "broken_image")}
              label={t("status_corrupted", "Corrupted")}
              number={corruptedCount}
              colorClass="text-[var(--danger)]"
              isActive={categoryFilter === "corrupted"}
              onClick={() =>
                setCategoryFilter(categoryFilter === "corrupted" ? "all" : "corrupted")
              }
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_sports_esports", "sports_esports")}
              label={t("modal_version_mismatch", "Version Mismatch")}
              number={mismatchCount}
              colorClass="text-[var(--danger)]"
              isActive={categoryFilter === "version_mismatch"}
              onClick={() =>
                setCategoryFilter(
                  categoryFilter === "version_mismatch" ? "all" : "version_mismatch"
                )
              }
            />
          </div>
        )}

        {groupedBrokenMods.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("status", "Status")}
                    </span>
                    <InlineFilterGroup
                      value={categoryFilter}
                      onChange={(v: string) => setCategoryFilter(v)}
                      options={[
                        { id: "all", label: t("filter_all", "All") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                        { id: "version_mismatch", label: t("modal_version_mismatch", "Version Mismatch") },
                        { id: "missing_reqs", label: t("badge_missing_dep", "Missing Dependency") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />
        )}

        {filteredGroupedBrokenMods.length === 0 ? (
          <EmptyState
            icon={t("icon_check_circle", "check_circle")}
            title={t("no_incompatible_detected", "No Incompatible {Mods} Detected")}
          />
        ) : (
          <UniversalGroup
            title={`${t("citizen_action_incompatible", "Incompatible")} (${filteredGroupedBrokenMods.length})`}
            icon={panelIcon}
            headerAction={
              allow_write && toggleInActiveSet ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    filteredGroupedBrokenMods.forEach((mod: any) => {
                      const members: any[] =
                        Array.isArray(mod._groupedMods) && mod._groupedMods.length > 0
                          ? mod._groupedMods
                          : [mod];
                      members.forEach((m: any) => {
                        toggleInActiveSet(m._originalSetName || m.name, true, true);
                      });
                    });
                  }}
                  className={`relative group/subaction w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] ${
                    filteredGroupedBrokenMods.some((m: any) => m._alert_type === "red")
                      ? "text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                      : "text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
                  } flex items-center justify-center transition-all cursor-pointer shrink-0`}
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_remove_circle_outline", "remove_circle_outline")}
                  </span>
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    title={(filteredGroupedBrokenMods.some((m: any) => m._alert_type === "red")
                      ? t("bp_purge_corrupted", "{Remove} {0} Corrupted")
                      : t("bp_purge_unstable", "{Remove} {0} Unstable")
                    ).replace("{0}", String(filteredGroupedBrokenMods.length))}
                    icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                    variant={
                      filteredGroupedBrokenMods.some((m: any) => m._alert_type === "red")
                        ? "danger"
                        : "warning"
                    }
                  />
                </button>
              ) : undefined
            }
          >
            {renderGroupedIncompatibleSections({
              groupedBrokenMods: filteredGroupedBrokenMods,
              ignoredBroken,
              setIgnoredBroken,
              toggleInActiveSet,
              allow_write,
              t,
              activeGameSchema,
            })}
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
