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
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup } from "../components/universal/UniversalLayout";
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
      title: t("status_broken", "Corrupted"),
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
            title: t("missing_dependency", "Missing Dependency"),
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

      // If this item is the parent/boss mod itself, prefer its clean title
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

export function formatAddonModuleName(rawMod: any, activeGameSchema?: any): string {
  const base = formatDisplayName(
    rawMod?.displayName || rawMod?.name || "",
    undefined,
    activeGameSchema
  ).trim();
  if (!base) return "";

  const spaced = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^mc\s+cmd\s+center$/i.test(spaced)) {
    return "MC Command Center";
  }

  const ACRONYMS = new Set(["MC", "CAS", "UI", "DLC", "HQ", "XML", "NPC", "VIP"]);
  return spaced
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (word.length <= 1) return upper;
      if (word === word.toLowerCase()) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
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
  sectionKey,
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

  const title = mod._groupedTitle || formatDisplayName(mod.displayName || mod.name);
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
    ? t("card_file_script", "Script")
    : t("card_file_package", "Package");

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
              ? t("status_tag_unstable", "Unstable")
              : t("status_tag_corrupted", "Corrupted"),
            detail: mod.status_reason || "",
          },
        ];

  const issueRows: {
    icon: string;
    issueLabel: string;
    detailValue?: string;
  }[] = stackedIssues.map((iss) => {
    const hasCustomDetail = Boolean(
      iss.detail &&
        iss.detail.toLowerCase() !== title.toLowerCase() &&
        iss.detail.toLowerCase() !== iss.title.toLowerCase()
    );

    if (iss.category === "corrupted") {
      return {
        icon: t("icon_gpp_bad", "gpp_bad"),
        issueLabel: iss.title,
        detailValue: hasCustomDetail ? iss.detail : undefined,
      };
    }
    if (iss.category === "unstable") {
      return {
        icon: t("icon_warning_amber", "warning_amber"),
        issueLabel: iss.title,
        detailValue: hasCustomDetail ? iss.detail : undefined,
      };
    }
    if (iss.category === "version_mismatch") {
      return {
        icon: t("icon_sports_esports", "sports_esports"),
        issueLabel: t("modal_version_mismatch", "Version Mismatch"),
        detailValue: hasCustomDetail ? iss.detail : undefined,
      };
    }
    return {
      icon: iss.icon || t("icon_error", "error"),
      issueLabel: iss.title,
      detailValue: hasCustomDetail ? iss.detail : undefined,
    };
  });

  const panelResetStyle = {
    "--glass-outer-shadow": "0 0 #0000",
    "--glass-nested-shadow": "0 0 #0000",
    boxShadow: "var(--glass-inset-highlight, inset 0 1px 0 0 rgba(255, 255, 255, 0.14))",
  } as React.CSSProperties;

  return (
    <>
      <div
        style={panelResetStyle}
        className={`glass-panel shadow-none rounded-3xl p-5 flex flex-col justify-between gap-3 transition-all duration-300 relative group hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] ${
          effectiveIgnored ? "opacity-50 grayscale-[40%]" : ""
        }`}
      >
        {/* Top Row: Mod Icon & Metadata on Left + Unified Ignore/Remove Capsule on Right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {image ? (
              <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
                <img src={image} alt={title} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-8 h-8 flex items-center justify-center shrink-0 text-[var(--text)] opacity-80 group-hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
              <span className="truncate opacity-85">{validCreator || fallbackTypeLabel}</span>
              {groupedMods.length > 1 && (
                <>
                  <span className="opacity-40 shrink-0">&bull;</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded((prev) => !prev);
                    }}
                    className="relative group/modpill inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-bold text-[var(--text)] opacity-90 hover:opacity-100 transition-all cursor-pointer shrink-0"
                  >
                    <span>
                      {groupedMods.length} {t("card_files_linked", "Linked Files")}
                    </span>
                    <span
                      className={`material-symbols-outlined !text-[13px] opacity-75 transition-transform duration-300 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      {t("icon_expand_more", "expand_more")}
                    </span>

                    {!isExpanded && (
                      <HoverTooltip
                        align="left"
                        vAlign="bottom"
                        content={
                          <div className="glass-panel rounded-2xl p-3.5 min-w-[230px] max-w-[300px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl flex flex-col gap-2 pointer-events-none">
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
                                {groupedMods.length} {t("card_files_linked", "Linked Files")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {groupedMods.slice(0, 14).map((gm: any, gIdx: number) => {
                                const gmName =
                                  formatAddonModuleName(gm, activeGameSchema) ||
                                  formatDisplayName(gm.displayName || gm.name);
                                const isScript = /\.ts4script$/i.test(
                                  String(gm?.name || gm?._originalSetName || "")
                                );
                                return (
                                  <div
                                    key={`${gm.name || gIdx}-${gIdx}`}
                                    className="flex items-center justify-between gap-3 text-[11px]"
                                  >
                                    <span className="font-bold text-[var(--text)] truncate">
                                      {gmName}
                                    </span>
                                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75 shrink-0">
                                      {isScript
                                        ? t("card_file_script", "Script")
                                        : t("card_file_package", "Package")}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        }
                      />
                    )}
                  </button>
                </>
              )}
              {!hasUpdate && cleanInstalledVer && (
                <>
                  <span className="opacity-40 shrink-0">&bull;</span>
                  <span className="font-mono shrink-0 opacity-85">v{cleanInstalledVer}</span>
                </>
              )}
            </div>
          </div>

          {/* Unified Capsule Action Pill (Ignore / Remove) */}
          {((setIgnoredBroken && ignoredBroken instanceof Set) ||
            (allow_write && toggleInActiveSet)) && (
            <div className="flex items-center glass-surface !rounded-full p-0.5 gap-0.5 shrink-0">
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
                  className="relative group/actionbtn w-7 h-7 rounded-full border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-70 hover:opacity-100 flex items-center justify-center transition-all cursor-pointer"
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
                  className="relative group/actionbtn w-7 h-7 rounded-full border border-transparent hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    title={t("btn_remove", "Remove")}
                    icon={t("icon_delete", "delete")}
                    variant="danger"
                  />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Middle Row: Full-Width Mod Title */}
        <span
          className="text-[15px] font-black text-[var(--text)] tracking-tight leading-snug truncate"
          title={title}
        >
          {title}
        </span>

        {/* Bottom Section: Issues Stack (1 or Multiple) + Version Update Bar (only when hasUpdate is true) */}
        <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2">
          {issueRows.map((row, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0 font-bold text-[var(--text)]">
                <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-85 shrink-0">
                  {row.icon}
                </span>
                <span className="truncate">{row.issueLabel}</span>
              </div>
              {row.detailValue && (
                <span
                  className="font-mono text-[11px] font-semibold text-[var(--subtext)] opacity-90 shrink-0 truncate max-w-[160px]"
                  title={row.detailValue}
                >
                  {row.detailValue}
                </span>
              )}
            </div>
          ))}

          {hasUpdate && cleanNewVer && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="font-mono text-xs font-bold truncate">
                {cleanInstalledVer ? (
                  <>
                    <span className="text-[var(--subtext)]">v{cleanInstalledVer} &rarr; </span>
                    <span className="text-[var(--text)]">v{cleanNewVer}</span>
                  </>
                ) : (
                  <span className="text-[var(--text)]">v{cleanNewVer}</span>
                )}
              </span>

              <button
                type="button"
                onClick={openModUpdate}
                className="px-3 h-7 rounded-full glass-surface hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>{t("comms_btn_update", "Update")}</span>
                <span className="text-xs leading-none">&rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full-Width Addon / Linked Modules Drawer (Spans across both grid columns below the card row) */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          style={panelResetStyle}
          className="col-span-full glass-panel shadow-none rounded-3xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                {t("icon_extension", "extension")}
              </span>
              <span className="text-xs font-black text-[var(--text)] truncate">
                {title} &bull; {groupedMods.length} {t("card_files_linked", "Linked Files")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="w-7 h-7 rounded-full glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_close", "close")}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className={`glass-surface rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 transition-all ${
                    gmIgnored ? "opacity-50 grayscale-[40%]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] shrink-0">
                      {getModIcon(gm, activeGameSchema, t)}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-xs font-bold text-[var(--text)] truncate"
                        title={gmName}
                      >
                        {gmName}
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75">
                        {isScript
                          ? t("card_file_script", "Script")
                          : t("card_file_package", "Package")}
                      </span>
                    </div>
                  </div>

                  {((setIgnoredBroken && ignoredBroken instanceof Set) ||
                    (allow_write && toggleInActiveSet)) && (
                    <div className="flex items-center gap-0.5 shrink-0">
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
                          className="relative group/actionbtn w-6 h-6 rounded-full hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {gmIgnored
                              ? t("icon_visibility", "visibility")
                              : t("icon_visibility_off", "visibility_off")}
                          </span>
                        </button>
                      )}
                      {allow_write && toggleInActiveSet && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleInActiveSet(gm._originalSetName || gm.name, true, true);
                          }}
                          className="relative group/actionbtn w-6 h-6 rounded-full hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_delete", "delete")}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
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
    <div className="grid grid-flow-row-dense grid-cols-1 sm:grid-cols-2 gap-3.5 items-start w-full">
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

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("citizen_action_incompatible", "Incompatible")}
      subtitle={t("incompatible_broken", "Corrupted, Outdated & Unstable Mods")}
      icon={
        redMods.length > 0
          ? t("icon_gpp_bad", "gpp_bad")
          : t("icon_gpp_maybe", "gpp_maybe")
      }
      iconColorClass="theme-text-accent"
      widthClass="w-full md:w-[760px]"
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
      <div className="flex flex-col gap-6 relative z-10 w-full pb-12">
        {groupedBrokenMods.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search", "Search...")}
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
                        { id: "corrupted", label: t("bp_pill_corrupted", "Corrupted") },
                        { id: "version_mismatch", label: t("badge_version_mismatch", "Version Mismatch") },
                        { id: "missing_reqs", label: t("badge_missing_dep", "Missing Dependency") },
                        { id: "unstable", label: t("bp_pill_unstable", "Unstable") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />
        )}

        {filteredGroupedBrokenMods.length === 0 ? (
          <div className="glass-panel rounded-3xl p-10">
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("no_incompatible_detected", "No Incompatible Mods Detected")}
            />
          </div>
        ) : (
          renderGroupedIncompatibleSections({
            groupedBrokenMods: filteredGroupedBrokenMods,
            ignoredBroken,
            setIgnoredBroken,
            toggleInActiveSet,
            allow_write,
            t,
            activeGameSchema,
          })
        )}
      </div>
    </SidePanel>
  );
}
