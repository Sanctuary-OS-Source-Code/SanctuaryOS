import { formatDisplayName, isVersionMatch, mapDlcCode, getHighestVersion, parseStringArray, cleanSearchName, getModFallbackUrl, isScriptExtension, getExtensionRegex, filterBlueprintModArtifacts, stripPriorityTierPrefix, resolveModHighlanderSlot } from "../../shared";
import { useStore } from "../../store";

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

export function formatVersionBadgeText(ver: any, fallback: string): string {
  const s = String(ver ?? "").trim();
  if (!s || s.toLowerCase() === "unknown" || s.toLowerCase() === "null") {
    return fallback;
  }
  const stripped = s.replace(/^v\.?\s*/i, "").trim();
  if (!stripped) return fallback;
  return /^\d/.test(stripped) ? `v${stripped}` : stripped;
}

export function extractSourceHost(urlStr?: string | null): string | undefined {
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

export function getVaultDependencyMatch(
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

export function getCachedActiveModNames(activeMods: any[]): {
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
  if (isBroken) {
    addCategory("corrupted");
    issues.push({
      category: "corrupted",
      type: "red",
      icon: t("icon_broken_image", "broken_image"),
      title: t("status_corrupted", "Corrupted"),
      detail: cleanReason,
    });
  } else if (sLower === "unstable") {
    addCategory("unstable");
    issues.push({
      category: "unstable",
      type: "amber",
      icon: t("icon_warning_amber", "warning_amber"),
      title: t("label_unstable", "Unstable"),
      detail: cleanReason,
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

export const PRESERVED_ACRONYMS = new Set([
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

