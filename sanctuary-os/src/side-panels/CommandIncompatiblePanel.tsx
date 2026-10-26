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
  StatBox,
  DashboardStatTile,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

export interface StackedModIssue {
  category: "corrupted" | "version_mismatch" | "missing_dlc" | "missing_deps" | "unstable";
  type: "red" | "amber";
  icon: string;
  title: string;
  detail: string;
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
  let isBroken = typeof mod.status === "string" && mod.status.toLowerCase() === "broken";
  if (isBroken && compatArr.length > 0 && selectedVersion) {
    if (selectedVersion !== getHighestVersion(compatArr)) {
      isBroken = false;
    }
  }
  const isNonCompliant =
    !hasVersionMismatch && (mod.compliance_tier === 3 || mod.compliance_tier === 4);

  if (isBroken || isNonCompliant) {
    addCategory("corrupted");
    issues.push({
      category: "corrupted",
      type: "red",
      icon: t("icon_broken_image", "broken_image"),
      title: t("status_corrupted", "Corrupted"),
      detail: mod.status_reason || "",
    });
  }

  if (hasVersionMismatch) {
    addCategory("version_mismatch");
    const reqHighest = compatArr.length > 0 ? getHighestVersion(compatArr) : "";
    issues.push({
      category: "version_mismatch",
      type: "red",
      icon: t("icon_sports_esports", "sports_esports"),
      title: t("required_version", "Required Game Version"),
      detail:
        reqHighest && reqHighest !== "Unknown"
          ? reqHighest
          : selectedVersion || t("unknown", "Unknown"),
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

  // 4. Missing Dependencies check (safely handle string or object dependencies without [object Object])
  if (mod.dependencies) {
    const rawDeps: string[] = Array.isArray(mod.dependencies)
      ? mod.dependencies
          .map((d: any) =>
            typeof d === "string" ? d.trim() : String(d?.name || d?.title || d?.id || "").trim()
          )
          .filter(Boolean)
      : parseStringArray(mod.dependencies);

    if (rawDeps.length > 0) {
      const activeModNames = (activeMods || [])
        .flatMap((m: any) => [
          String(m?._originalSetName || "").toLowerCase(),
          String(m?.name || "").toLowerCase(),
          String(m?.displayName || "").toLowerCase(),
          m?.dbId ? String(m.dbId).toLowerCase() : "",
        ])
        .filter(Boolean);

      const seenDeps = new Set<string>();
      const missingDeps = rawDeps.filter((reqStr: string) => {
        const lower = reqStr.toLowerCase().trim();
        if (!lower || lower.includes("object object") || lower.includes("[object")) return false;
        if (seenDeps.has(lower)) return false;
        seenDeps.add(lower);
        return !activeModNames.some(
          (act: string) => act === lower || act.includes(lower) || lower.includes(act)
        );
      });

      if (missingDeps.length > 0) {
        addCategory("missing_deps");
        missingDeps.forEach((reqStr: string) => {
          issues.push({
            category: "missing_deps",
            type: "red",
            icon: t("icon_extension", "extension"),
            title: t("badge_missing_dep", "Missing Dependency"),
            detail: cleanSearchName(reqStr, activeGameSchema) || formatDisplayName(reqStr),
          });
        });
      }
    }
  }

  // 5. Unstable check (stacks even if red issues are also present)
  if (typeof mod.status === "string" && mod.status.toLowerCase() === "unstable") {
    addCategory("unstable");
    issues.push({
      category: "unstable",
      type: "amber",
      icon: t("icon_warning_amber", "warning_amber"),
      title: t("bp_status_unstable", "Unstable"),
      detail: mod.status_reason || "",
    });
  }

  if (issues.length === 0) return null;

  const hasRed = issues.some((i) => i.type === "red");
  const alertType = hasRed ? "red" : "amber";
  const primaryCategory = categories[0] || (hasRed ? "corrupted" : "unstable");
  const summaryReason = issues.map((i) => `${i.title}: ${i.detail}`).join(" • ");

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

export function groupBrokenMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const allVaultMods: any[] = useStore.getState().modList || [];
  const vaultUpdateLookup = new Map<string, any>();
  const virtualByFamilyId = new Map<string, any>();
  const parentByDbId = new Map<string, any>();

  for (const vm of allVaultMods) {
    if (!vm) continue;
    if (vm.isVirtual && !vm.isCollection) {
      if (vm.dbId) virtualByFamilyId.set(String(vm.dbId).split("@")[0], vm);
      if (vm.baseFamilyId) virtualByFamilyId.set(String(vm.baseFamilyId).split("@")[0], vm);
      continue;
    }
    if (vm.dbId) {
      parentByDbId.set(String(vm.dbId), vm);
    }
    if (vm.name) vaultUpdateLookup.set(String(vm.name).toLowerCase(), vm);
    if (vm.displayName) vaultUpdateLookup.set(String(vm.displayName).toLowerCase(), vm);
  }

  const mcCount = rawList.filter((m) => {
    const label = formatDisplayName(m?.displayName || m?.name || "").trim();
    return /^mc[\s_-]/i.test(label) || /mc\s*command\s*center/i.test(label);
  }).length;

  const grouped = new Map<string, any>();

  for (const rawMod of rawList) {
    const matchedVault =
      vaultUpdateLookup.get(String(rawMod?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(rawMod?.displayName || "").toLowerCase());

    const famIdRaw = String(
      rawMod?.baseFamilyId ||
        rawMod?.familyId ||
        matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        ""
    ).split("@")[0];
    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_")
    );
    const familyParent = hasRealFamily
      ? parentByDbId.get(famIdRaw) || virtualByFamilyId.get(famIdRaw)
      : null;

    const resolvedAuthor = extractValidCreator(rawMod, matchedVault, familyParent);

    const mod = {
      ...(familyParent && !familyParent.isVirtual ? familyParent : {}),
      ...(matchedVault || {}),
      ...rawMod,
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
        familyParent?.download_url,
      url: rawMod.url || matchedVault?.url || familyParent?.url,
      author: resolvedAuthor || undefined,
    };

    const rawTitle = formatDisplayName(mod?.displayName || mod?.name || "").trim();
    const isMc =
      mcCount > 1 && (/^mc[\s_-]/i.test(rawTitle) || /mc\s*command\s*center/i.test(rawTitle));
    const twinNormalized = normalizeModGroupTitle(rawTitle) || rawTitle;

    let groupKey: string;
    let displayTitle = twinNormalized;

    if (isMc) {
      groupKey = "__suite_mc_command_center__";
      displayTitle = "MC Command Center";
    } else if (hasRealFamily) {
      groupKey = `__family_${famIdRaw}__`;
      const canonicalParentTitle = familyParent
        ? formatDisplayName(familyParent.displayName || familyParent.name || "").trim()
        : "";
      displayTitle =
        normalizeModGroupTitle(canonicalParentTitle) ||
        canonicalParentTitle ||
        twinNormalized;
    } else if (mod.flavorGroupId) {
      groupKey = `__flavor_${mod.flavorGroupId}__`;
      displayTitle = formatDisplayName(mod.flavorGroupName || twinNormalized).trim();
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

      const isPrefixAddon =
        cLower.length > pLower.length &&
        cLower.startsWith(pLower) &&
        /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
          cTitle.slice(pTitle.length)
        );

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
  "WW",
  "MCCC",
  "NWP",
]);

export function formatCleanModTitle(rawTitle: string): string {
  const trimmed = String(rawTitle || "").trim();
  if (!trimmed) return "";

  const spaced = trimmed
    .replace(/([\]})])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^mc\s+cmd\s+center$/i.test(spaced) || /^mc\s+command\s+center$/i.test(spaced)) {
    return "MC Command Center";
  }

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
      if (upperCore === "LITTLEMSSAM") {
        return `${prefix}LittleMsSam${suffix}`;
      }
      // Preserve alphanumeric codes like MAX20, V1, EP01
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

export function resolveBlueprintConflicts(
  scopeName: string | undefined,
  activeMods: any[],
  ignoredGlobal: string[] = [],
  t: (key: string, fallback?: string) => string
): any[] {
  const conflicts: any[] = [];
  const seenCanonicalPairs = new Set<string>();

  const findMatchingMod = (targetRaw: string) => {
    const cleanTarget = String(targetRaw || "").trim();
    if (!cleanTarget) return null;
    const upperTarget = cleanTarget.toUpperCase();
    const baseTarget = (cleanTarget.split(/[\\/]/).pop() || cleanTarget)
      .replace(/\.[^/.]+$/, "")
      .toUpperCase();

    const matched = (activeMods || []).find((em: any) => {
      if (!em) return false;
      const cleanN = String(em.name || em._originalSetName || "").toUpperCase();
      const cleanDisp = String(em.displayName || "").toUpperCase();
      const emBase = (String(em.name || em._originalSetName || "").split(/[\\/]/).pop() || "")
        .replace(/\.[^/.]+$/, "")
        .toUpperCase();
      return (
        cleanN === upperTarget ||
        cleanDisp === upperTarget ||
        (emBase && emBase === baseTarget) ||
        (upperTarget.length > 3 &&
          (cleanN.includes(upperTarget) ||
            cleanDisp.includes(upperTarget) ||
            upperTarget.includes(cleanN)))
      );
    });

    if (matched) return matched;
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
          if (Array.isArray(ignoredGlobal) && ignoredGlobal.includes(pairId)) continue;

          const modAMatch = findMatchingMod(rawA);
          const modBMatch = findMatchingMod(rawB);
          if (!modAMatch || !modBMatch) continue;

          const canonicalKey = makeCanonicalPairKey(modAMatch, modBMatch, rawA, rawB);
          if (!canonicalKey || seenCanonicalPairs.has(canonicalKey)) continue;
          seenCanonicalPairs.add(canonicalKey);

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
    for (const c of mod.conflicts) {
      const enemyActive = (activeMods || []).find((em: any) => {
        if (!em || em.isFallback) return false;
        if (c.enemy_id && String(em.dbId) === String(c.enemy_id)) return true;
        if (c.enemy_name) {
          const targetClean = String(c.enemy_name)
            .replace(/\.[^/.]+$/i, "")
            .toUpperCase();
          const cleanN = String(em.name || "").toUpperCase();
          const cleanDisp = String(em.displayName || "").toUpperCase();
          if (cleanN.includes(targetClean) || cleanDisp.includes(targetClean)) return true;
        }
        return false;
      });
      if (enemyActive && mod.name && enemyActive.name && mod.name !== enemyActive.name) {
        const canonicalKey = makeCanonicalPairKey(
          mod,
          enemyActive,
          String(mod.name),
          String(enemyActive.name)
        );
        if (!canonicalKey || seenCanonicalPairs.has(canonicalKey)) continue;

        const sortedNames = [String(mod.name), String(enemyActive.name)].sort();
        const pairId = `${sortedNames[0]} vs ${sortedNames[1]}`;
        if (Array.isArray(ignoredGlobal) && ignoredGlobal.includes(pairId)) continue;
        seenCanonicalPairs.add(canonicalKey);

        const sevRank = Number(c.severity_rank) === 4 ? 4 : 3;
        conflicts.push({
          pairId,
          modA: mod,
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
    /\.ts4script$/i.test(String(gm?.name || gm?._originalSetName || ""))
  );
  const fallbackTypeLabel = hasScriptFile
    ? t("type_script", "Script")
    : t("type_package", "Package");

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
            detail: mod.status_reason || "",
          },
        ];

  const issueRows: {
    icon: string;
    issueLabel: string;
    detailValue?: string;
    type: "red" | "amber";
  }[] = stackedIssues.map((iss) => {
    const hasCustomDetail = Boolean(
      iss.detail &&
        iss.detail.toLowerCase() !== rawTitle.toLowerCase() &&
        iss.detail.toLowerCase() !== title.toLowerCase() &&
        iss.detail.toLowerCase() !== iss.title.toLowerCase()
    );

    if (iss.category === "corrupted") {
      return {
        icon: t("icon_gpp_bad", "gpp_bad"),
        issueLabel: iss.title,
        detailValue: hasCustomDetail ? iss.detail : undefined,
        type: iss.type,
      };
    }
    if (iss.category === "unstable") {
      return {
        icon: t("icon_warning_amber", "warning_amber"),
        issueLabel: iss.title,
        detailValue: hasCustomDetail ? iss.detail : undefined,
        type: iss.type,
      };
    }
    if (iss.category === "version_mismatch") {
      return {
        icon: t("icon_sports_esports", "sports_esports"),
        issueLabel: t("modal_version_mismatch", "Version Mismatch"),
        detailValue: hasCustomDetail ? iss.detail : undefined,
        type: iss.type,
      };
    }
    return {
      icon: iss.icon || t("icon_error", "error"),
      issueLabel: iss.title,
      detailValue: hasCustomDetail ? iss.detail : undefined,
      type: iss.type,
    };
  });

  const primaryIssue = issueRows[0];
  const extraIssues = issueRows.slice(1);

  return (
    <div
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 relative ${
        isExpanded && groupedMods.length > 1 ? "sm:col-span-2" : ""
      } ${effectiveIgnored ? "opacity-50 grayscale-[40%]" : ""}`}
    >
      {/* Top Tier: Icon Well + Title/Creator Identity + Quick Action Buttons */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {image ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <img src={image} alt={title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className={`w-10 h-10 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-opacity ${
                isAmber
                  ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                  : "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]"
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
                title={title}
                icon={modIcon}
              />
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
              {validCreator && (
                <>
                  <span className="truncate opacity-85">
                    {formatCleanModTitle(validCreator)}
                  </span>
                  <span className="opacity-40 shrink-0">•</span>
                </>
              )}
              <span className="opacity-85 shrink-0">{fallbackTypeLabel}</span>
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
          </div>
        </div>

        {/* Top-Right Compact Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUpdate && cleanNewVer && (
            <button
              type="button"
              onClick={openModUpdate}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_update", "update")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  cleanInstalledVer
                    ? `${t("category_update", "Update")} (v${cleanInstalledVer} → v${cleanNewVer})`
                    : `${t("category_update", "Update")} (v${cleanNewVer})`
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
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_delete", "delete")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={t("btn_remove", "{Remove}")}
                icon={t("icon_delete", "delete")}
                variant="danger"
              />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Status Bar: Single Status Badge on Left | Modules Toggle or Subtle Detail on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {primaryIssue && (
            <span
              className={`relative group/statusbadge ${VAULT_CHIP_CLASS} ${
                primaryIssue.type === "amber"
                  ? "!border-[color-mix(in_srgb,var(--warning)_40%,transparent)] !text-[var(--warning)]"
                  : "!border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[12px] shrink-0">
                {primaryIssue.icon}
              </span>
              <span>{primaryIssue.issueLabel}</span>
              {extraIssues.length > 0 && (
                <span className="opacity-75">+{extraIssues.length}</span>
              )}
              <HoverTooltip
                className="z-[100]"
                title={
                  [primaryIssue, ...extraIssues]
                    .map((r) =>
                      r.detailValue ? `${r.issueLabel}: ${r.detailValue}` : r.issueLabel
                    )
                    .join(" • ")
                }
                icon={primaryIssue.icon}
              />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {groupedMods.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`${VAULT_CHIP_CLASS} transition-all cursor-pointer ${
                isExpanded
                  ? "!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] !text-[var(--accent)]"
                  : "hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <span>
                {groupedMods.length} {t("badge_modules_count", "Modules")}
              </span>
              <span
                className={`material-symbols-outlined !text-[13px] opacity-80 transition-transform duration-200 ${
                  isExpanded ? "rotate-180 text-[var(--accent)]" : ""
                }`}
              >
                {t("icon_expand_more", "expand_more")}
              </span>
            </button>
          ) : primaryIssue?.detailValue ? (
            <span className="relative group/issueval font-mono text-[10px] font-semibold text-[var(--subtext)] opacity-80 truncate max-w-[130px]">
              {primaryIssue.detailValue}
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${primaryIssue.issueLabel}: ${primaryIssue.detailValue}`}
                icon={primaryIssue.icon}
              />
            </span>
          ) : null}
        </div>
      </div>

      {/* Compact Recessed Linked Modules Tray */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[196px] overflow-y-auto custom-scrollbar pr-1">
            {groupedMods.map((gm: any, gIdx: number) => {
              const gmName =
                formatAddonModuleName(gm, activeGameSchema) ||
                formatDisplayName(gm.displayName || gm.name);
              const isScript = /\.ts4script$/i.test(
                String(gm?.name || gm?._originalSetName || "")
              );
              const gmIgnored =
                ignoredBroken instanceof Set ? ignoredBroken.has(gm.name) : false;

              return (
                <div
                  key={`${gm.name || gIdx}-${gIdx}`}
                  className={`glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2 transition-all ${
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
                          {t("icon_delete", "delete")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={t("btn_remove", "{Remove}")}
                          icon={t("icon_delete", "delete")}
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

  const severityBadgeClass = isTier4
    ? `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] !text-[var(--danger)]`
    : `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--warning)_45%,transparent)] !text-[var(--warning)]`;

  const winnerBadgeClass = `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--success)_45%,transparent)] !text-[var(--success)]`;
  const loserBadgeClass = `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--text)_18%,transparent)] !text-[var(--subtext)]`;

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
      <div
        className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5 w-full ${
          isIgnored ? "pointer-events-none" : ""
        }`}
      >
        {slots.map((slot, sIdx) => {
          if (!slot.mod) return null;
          const mTitle = formatCleanModTitle(
            formatDisplayName(slot.mod.displayName || slot.mod.name)
          );
          const mAuthor = extractValidCreator(slot.mod);
          const isScript = /\.ts4script$/i.test(
            String(slot.mod?.name || slot.mod?._originalSetName || "")
          );
          const mTypeLabel = isScript
            ? t("type_script", "Script")
            : t("type_package", "Package");
          const mIcon = getModIcon(slot.mod, activeGameSchema, t);

          const cardElement = (
            <div
              key={`${ac.pairId}-slot-${sIdx}`}
              className={`glass-surface rounded-xl p-3 border transition-all flex items-center justify-between gap-2.5 min-w-0 ${
                slot.isWinner && !isTier4
                  ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
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

              <div className="flex items-center gap-1.5 shrink-0">
                {isTier4 ? (
                  allow_write &&
                  toggleInActiveSet && (
                    <button
                      type="button"
                      onClick={() =>
                        toggleInActiveSet(
                          slot.mod._originalSetName || slot.mod.name,
                          true,
                          true
                        )
                      }
                      className="relative group/actionbtn w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip
                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                        title={t("btn_remove", "{Remove}")}
                        icon={t("icon_delete", "delete")}
                        variant="danger"
                      />
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
                        onClick={() =>
                          applyConflictOverride(
                            slot.mod._originalSetName || slot.mod.name,
                            ac.pairId,
                            scopeName
                          )
                        }
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
                  <div className="flex items-center gap-2">
                    <div className="w-28">{getPriorityDrop(slot.mod)}</div>
                  </div>
                ) : null}
              </div>
            </div>
          );

          if (sIdx === 0) {
            return (
              <React.Fragment key={`${ac.pairId}-frag-${sIdx}`}>
                {cardElement}
                <div className="hidden sm:flex items-center justify-center">
                  <div
                    className={`w-7 h-7 rounded-full glass-panel border flex items-center justify-center shrink-0 ${
                      isTier4
                        ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]"
                        : "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
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
  const { ownedDLC, maskedDLC, selectedVersion, activeGameSchema } = useStore();
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
  const missingReqsCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) => {
        const cats = Array.isArray(m._categories) ? m._categories : [m._alert_category];
        return cats.includes("missing_dlc") || cats.includes("missing_deps");
      }).length,
    [groupedBrokenMods]
  );
  const unstableCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) => {
        const cats = Array.isArray(m._categories) ? m._categories : [m._alert_category];
        return cats.includes("unstable") || m._alert_type === "amber";
      }).length,
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
            {redMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_corrupted", "Remove {0} Corrupted").replace(
                  "{0}",
                  String(redMods.length)
                )}
                variant="danger"
                onClick={() => {
                  redMods.forEach((m: any) =>
                    toggleInActiveSet && toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
            {amberMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_unstable", "Remove {0} Unstable").replace(
                  "{0}",
                  String(amberMods.length)
                )}
                onClick={() => {
                  amberMods.forEach((m: any) =>
                    toggleInActiveSet && toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
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
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("no_incompatible_detected", "No Incompatible {Mods} Detected")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("citizen_action_incompatible", "Incompatible")} (${filteredGroupedBrokenMods.length})`}
            icon={panelIcon}
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
