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
      detail: formatDisplayName(mod.displayName || mod.name),
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
      detail: mod.status_reason || formatDisplayName(mod.displayName || mod.name),
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

export function groupBrokenMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const allVaultMods: any[] = useStore.getState().modList || [];
  const vaultUpdateLookup = new Map<string, any>();
  for (const vm of allVaultMods) {
    if (!vm) continue;
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
    const mod = matchedVault
      ? {
          ...matchedVault,
          ...rawMod,
          hasUpdate: Boolean(rawMod.hasUpdate || matchedVault.hasUpdate),
          newVersion: rawMod.newVersion || matchedVault.newVersion,
          newGameVersion: rawMod.newGameVersion || matchedVault.newGameVersion,
          download_url: rawMod.download_url || matchedVault.download_url,
          url: rawMod.url || matchedVault.url,
          author:
            rawMod.author && String(rawMod.author).toLowerCase() !== "unknown"
              ? rawMod.author
              : matchedVault.author || rawMod.author,
        }
      : rawMod;

    const rawTitle = formatDisplayName(mod?.displayName || mod?.name || "").trim();
    const isMc = mcCount > 1 && (/^mc[\s_-]/i.test(rawTitle) || /mc\s*command\s*center/i.test(rawTitle));

    let groupKey: string;
    let displayTitle = rawTitle;

    if (isMc) {
      groupKey = "__suite_mc_command_center__";
      displayTitle = "MC Command Center";
    } else {
      const twinNormalized = rawTitle
        .replace(/(\s+scripts|\s+script|_scripts|_script)$/i, "")
        .trim();
      groupKey = (twinNormalized || rawTitle).toLowerCase();
      displayTitle = twinNormalized || rawTitle;
    }

    const modIssues: StackedModIssue[] = Array.isArray(mod._issues)
      ? mod._issues
      : mod._alert_reason
        ? [
            {
              category: mod._alert_category || (mod._alert_type === "amber" ? "unstable" : "corrupted"),
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

      if ((!existing.author || existing.author === "Unknown") && mod.author) {
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

  return Array.from(grouped.values());
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

  const title = mod._groupedTitle || formatDisplayName(mod.displayName || mod.name);
  const hasRealVersion = Boolean(
    mod.version &&
      String(mod.version).trim() !== "" &&
      String(mod.version).toLowerCase() !== "v.local" &&
      String(mod.version).toLowerCase() !== "vlocal" &&
      String(mod.version).toLowerCase() !== "local" &&
      String(mod.version).toLowerCase() !== "unknown"
  );
  const realAuthor =
    mod.author &&
    String(mod.author).trim() !== "" &&
    String(mod.author).toLowerCase() !== "unknown"
      ? String(mod.author)
      : null;

  const hasUpdate = Boolean(mod.hasUpdate && mod.newVersion);
  const resolvedFallbackUrl = getModFallbackUrl(
    title || mod.name || "",
    mod.hash,
    activeGameSchema,
    { url: mod.download_url || mod.url }
  );
  const hasDirectUrl = Boolean(mod.download_url || mod.url);

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
              ? t("icon_warning_amber", "warning_amber")
              : t("icon_broken_image", "broken_image"),
            title: isAmber
              ? t("bp_pill_unstable", "Unstable")
              : t("bp_pill_corrupted", "Corrupted"),
            detail: mod._alert_reason || title,
          },
        ];

  return (
    <div
      className={`glass-panel rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300 relative border ${
        effectiveIgnored
          ? "opacity-55 grayscale-[40%] border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
          : isAmber
            ? "border-[color-mix(in_srgb,var(--warning)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
            : "border-[color-mix(in_srgb,var(--danger)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
      }`}
    >
      {/* Top Header Row: Icon + Title/Meta + Compact Action Icons */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl glass-surface border flex items-center justify-center shrink-0 overflow-hidden ${
            effectiveIgnored
              ? "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)]"
              : isAmber
                ? "border-[color-mix(in_srgb,var(--warning)_25%,transparent)] text-[var(--warning)]"
                : "border-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)]"
          }`}
        >
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[13px] font-bold text-[var(--text)] truncate leading-tight"
            title={title}
          >
            {title}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--subtext)] mt-1 flex-wrap">
            {realAuthor && <span className="truncate max-w-[140px]">{realAuthor}</span>}
            {realAuthor && (hasRealVersion || groupedMods.length > 1) && (
              <span className="opacity-40">•</span>
            )}
            {hasRealVersion && !hasUpdate && (
              <span className="font-mono text-[10px] opacity-80">{mod.version}</span>
            )}
            {hasRealVersion && !hasUpdate && groupedMods.length > 1 && (
              <span className="opacity-40">•</span>
            )}
            {groupedMods.length > 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((prev) => !prev);
                }}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[var(--accent)] text-[10px] font-bold hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors cursor-pointer"
              >
                <span>
                  {groupedMods.length} {t("staging_btn_view_suite", "Modules")}
                </span>
                <span className="material-symbols-outlined !text-[13px] leading-none">
                  {isExpanded
                    ? t("icon_expand_less", "expand_less")
                    : t("icon_expand_more", "expand_more")}
                </span>
              </button>
            ) : (
              !realAuthor &&
              !hasRealVersion && (
                <span className="truncate opacity-70 font-mono text-[10px]">
                  {(mod.name || "").split(/[\\/]/).pop()}
                </span>
              )
            )}
          </div>
        </div>

        {/* Right Compact Action Buttons (Never 4 crammed text buttons) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!hasUpdate && (
            <button
              type="button"
              onClick={openModUpdate}
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] flex items-center justify-center transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {hasDirectUrl
                  ? t("icon_download", "download")
                  : t("icon_open_in_new", "open_in_new")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={t("comms_btn_update", "Update")}
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
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
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
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)] flex items-center justify-center transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
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
      </div>

      {/* Inline Diagnostic & Update Strip (Replaces boxy rectangular badges) */}
      <div className="flex flex-col gap-1.5">
        {stackedIssues.map((iss, idx) => {
          const isWarn = iss.type === "amber";
          const showDetail =
            iss.category !== "corrupted" &&
            iss.detail &&
            iss.detail.toLowerCase() !== title.toLowerCase();

          return (
            <div
              key={`${iss.category}-${idx}`}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-[11px] ${
                isWarn
                  ? "bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] text-[var(--warning)]"
                  : "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] border-[color-mix(in_srgb,var(--danger)_22%,transparent)] text-[var(--danger)]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined !text-[15px] shrink-0">
                  {iss.icon}
                </span>
                <span className="font-bold truncate">{iss.title}</span>
              </div>
              {showDetail && (
                <span
                  className="font-mono font-bold text-[var(--text)] truncate max-w-[55%] text-right"
                  title={iss.detail}
                >
                  {iss.detail}
                </span>
              )}
            </div>
          );
        })}

        {hasUpdate && (
          <button
            type="button"
            onClick={openModUpdate}
            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] text-[11px] transition-all cursor-pointer w-full"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[15px] shrink-0">
                {t("icon_download", "download")}
              </span>
              <span className="font-mono font-bold truncate">
                {hasRealVersion ? `${mod.version} → ${mod.newVersion}` : String(mod.newVersion)}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 font-bold">
              <span>{t("comms_btn_update", "Update")}</span>
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Expandable Grouped Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div className="pt-2.5 mt-0.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-75 px-1">
            {t("card_grouped_files", "Grouped Files")} ({groupedMods.length})
          </span>
          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
            {groupedMods.map((gm: any, idx: number) => {
              const rawFile = String(gm.name || gm._originalSetName || "").split(/[\\/]/).pop() || gm.name;
              const isScript = /\.ts4script$/i.test(rawFile);
              return (
                <div
                  key={`${gm.name}-${idx}`}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[11px]"
                >
                  <span
                    className="font-mono text-[var(--text)] opacity-90 truncate"
                    title={rawFile}
                  >
                    {rawFile}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isScript
                        ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                        : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)]"
                    }`}
                  >
                    {isScript
                      ? t("card_file_script", "Script")
                      : t("card_file_package", "Package")}
                  </span>
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
  const corruptedList = groupedBrokenMods.filter(
    (m: any) => m._alert_type === "red" && (!m._alert_category || m._alert_category === "corrupted")
  );
  const versionMismatchList = groupedBrokenMods.filter(
    (m: any) => m._alert_category === "version_mismatch"
  );
  const missingReqsList = groupedBrokenMods.filter(
    (m: any) => m._alert_category === "missing_dlc" || m._alert_category === "missing_deps"
  );
  const unstableList = groupedBrokenMods.filter((m: any) => m._alert_type === "amber");

  const sections = [
    {
      key: "corrupted",
      title: `${t("bp_status_broken_noncompliant", "Corrupted")} (${corruptedList.length})`,
      icon: t("icon_gpp_bad", "gpp_bad"),
      items: corruptedList,
    },
    {
      key: "version_mismatch",
      title: `${t("bp_status_version_mismatch", "Game Version Incompatibility")} (${versionMismatchList.length})`,
      icon: t("icon_update", "update"),
      items: versionMismatchList,
    },
    {
      key: "missing_reqs",
      title: `${t("missing_deps", "Missing Requirements")} (${missingReqsList.length})`,
      icon: t("icon_extension", "extension"),
      items: missingReqsList,
    },
    {
      key: "unstable",
      title: `${t("bp_status_unstable", "Unstable")} (${unstableList.length})`,
      icon: t("icon_warning_amber", "warning_amber"),
      items: unstableList,
    },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      {sections.map((section) => (
        <UniversalGroup key={section.key} title={section.title} icon={section.icon}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
            {section.items.map((mod: any) => {
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
        </UniversalGroup>
      ))}
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
