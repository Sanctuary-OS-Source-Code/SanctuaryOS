import { useState, useMemo, useEffect } from "react";
import {
  formatDisplayName,
  SidePanel,
  SidePanelHeroCard,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  ActionPill,
  DashboardStatTile,
  EmptyState,
  HoverTooltip,
  getNormalizedArtifactName,
  openModDossier,
} from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useModalStore } from "./store/modalStore";
import { packageBlueprintLoadOrder } from "./hooks/usePlaySetLogic";
import { formatCleanModTitle } from "./side-panels/CommandIncompatiblePanel";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const matrixNormCache = new Map<string, string>();
function getCachedNormalizedName(raw: string): string {
  if (!raw) return "";
  const hit = matrixNormCache.get(raw);
  if (hit !== undefined) return hit;
  const val = getNormalizedArtifactName(raw);
  if (matrixNormCache.size > 15000) matrixNormCache.clear();
  matrixNormCache.set(raw, val);
  return val;
}

interface CachedMatrixModLookup {
  findMod: (modName: string, cleanLower: string, norm: string) => any;
}
const matrixModLookupCache = new WeakMap<any[], CachedMatrixModLookup>();

function getOrBuildMatrixModLookup(modList: any[]): CachedMatrixModLookup | null {
  if (!Array.isArray(modList) || modList.length === 0) return null;
  const cached = matrixModLookupCache.get(modList);
  if (cached) return cached;

  const realMods: any[] = [];
  for (let i = 0; i < modList.length; i++) {
    const m = modList[i];
    if (!m) continue;
    if (m.isVirtual) {
      if (Array.isArray(m.flavors)) {
        for (let j = 0; j < m.flavors.length; j++) {
          const fl = m.flavors[j];
          if (fl && fl.name && !fl.isVirtual) realMods.push(fl);
        }
      }
      continue;
    }
    if (m.name) realMods.push(m);
  }

  const byExact = new Map<string, any>();
  const byCleanLower = new Map<string, any>();
  let byNorm: Map<string, any> | null = null;

  for (let i = 0; i < realMods.length; i++) {
    const m = realMods[i];
    if (!byExact.has(m.name)) byExact.set(m.name, m);
    const lastSlash = Math.max(m.name.lastIndexOf("/"), m.name.lastIndexOf("\\"));
    const clean = lastSlash >= 0 ? m.name.slice(lastSlash + 1) : m.name;
    const cleanLow = clean.toLowerCase();
    if (!byCleanLower.has(cleanLow)) byCleanLower.set(cleanLow, m);
  }

  const findMod = (modName: string, cleanLower: string, norm: string) => {
    const exact = byExact.get(modName);
    if (exact) return exact;
    const cleanMatch = byCleanLower.get(cleanLower);
    if (cleanMatch) return cleanMatch;
    if (!norm) return undefined;
    if (!byNorm) {
      byNorm = new Map<string, any>();
      for (let i = 0; i < realMods.length; i++) {
        const m = realMods[i];
        const n = getCachedNormalizedName(m.name);
        if (n && !byNorm.has(n)) byNorm.set(n, m);
      }
    }
    return byNorm.get(norm);
  };

  const built = { findMod };
  matrixModLookupCache.set(modList, built);
  return built;
}

export default function BlueprintMatrix({
  isOpen,
  onClose,
  playSet,
  modList,
  onUpload,
  onUpdatePlaySet,
}: any) {
  const { t } = useLexicon();
  const { session, activeGameSchema } = useStore();
  const [isPublic, setIsPublic] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isMarketListed, setIsMarketListed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [isRestrictedPanelOpen, setIsRestrictedPanelOpen] = useState(false);
  const [restrictedSearch, setRestrictedSearch] = useState("");
  const [restrictedFilter, setRestrictedFilter] = useState<
    "ALL" | "UNKNOWN" | "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4"
  >("UNKNOWN");
  const [visibleRestrictedCount, setVisibleRestrictedCount] = useState(36);

  const [isLoadOrderPanelOpen, setIsLoadOrderPanelOpen] = useState(false);
  const [loadOrderTab, setLoadOrderTab] = useState<"TIER_1" | "TIER_2" | "TIER_3" | "OVERRIDES">(
    "TIER_1"
  );
  const [loadOrderSearch, setLoadOrderSearch] = useState("");
  const [visibleLoadOrderCount, setVisibleLoadOrderCount] = useState(36);

  useEffect(() => {
    if (isOpen && playSet) {
      setGeneratedCode(playSet.code || null);
      setIsPublic(playSet.is_public ?? true);
      setIsLocked(playSet.is_locked ?? false);
      setIsMarketListed(playSet.is_market_listed ?? false);
      setUploadError("");
      setUploadSuccess(false);
      setIsUploading(false);

      const fetchCloudState = async () => {
        try {
          let query = supabase
            .from("blueprints")
            .select("code, is_public, is_locked, is_market_listed");
          if (playSet.code) {
            query = query.eq("code", playSet.code);
          } else {
            const sessionResult = await supabase.auth.getSession();
            const activeSession = sessionResult.data?.session;
            if (!activeSession) return;

            let { data: masonData } = await supabase
              .from("masons")
              .select("id")
              .eq("profile_id", activeSession.user.id)
              .maybeSingle();

            if (!masonData) {
              const username = activeSession.user.user_metadata?.username;
              if (!username) return;
              const { data: byName } = await supabase
                .from("masons")
                .select("id")
                .ilike("name", username)
                .maybeSingle();
              masonData = byName;
            }

            if (!masonData) return;
            query = query.eq("mason_id", masonData.id).ilike("name", playSet.name);
          }
          const { data } = await query.maybeSingle();
          if (data) {
            setGeneratedCode(data.code);
            setIsPublic(data.is_public);
            setIsLocked(data.is_locked);
            setIsMarketListed(data.is_market_listed);
          }
        } catch (e) {
          console.warn("Failed to sync matrix settings with cloud", e);
        }
      };
      fetchCloudState();
    }
  }, [isOpen, playSet]);

  const modLookup = useMemo(() => {
    if (!isOpen || !Array.isArray(modList) || modList.length === 0) return null;
    return getOrBuildMatrixModLookup(modList);
  }, [isOpen, modList]);

  const { allowedMods, blockedMods, packagedLoadOrder } = useMemo(() => {
    if (!isOpen || !playSet) return { allowedMods: [], blockedMods: [], packagedLoadOrder: null };
    const allowed: any[] = [];
    const blocked: any[] = [];
    const packagedLO = packageBlueprintLoadOrder(playSet, activeGameSchema);

    const seenNames = new Set<string>();
    const modsArr = Array.isArray(playSet.mods) ? playSet.mods : [];
    const modHashes = playSet.modHashes;
    const modMeta = playSet.modMeta;
    const unknownAuthor = t("unknown", "Unknown");

    for (let i = 0; i < modsArr.length; i++) {
      const rawEntry = modsArr[i];
      const modName =
        typeof rawEntry === "string" ? rawEntry : String(rawEntry?.name || rawEntry?.path || "");
      if (
        !modName ||
        modName.startsWith("FOLDER_") ||
        modName.startsWith("SET_") ||
        modName.startsWith("LOCAL_SET_")
      ) {
        continue;
      }

      const lastSlash = Math.max(modName.lastIndexOf("/"), modName.lastIndexOf("\\"));
      const cleanName = lastSlash >= 0 ? modName.slice(lastSlash + 1) || modName : modName;
      const cleanLower = cleanName.toLowerCase();
      if (!cleanLower || seenNames.has(cleanLower)) continue;
      seenNames.add(cleanLower);

      const norm = getCachedNormalizedName(cleanName);
      const mod = modLookup ? modLookup.findMod(modName, cleanLower, norm) : undefined;

      const resolvedHash = String(
        mod?.hash || modHashes?.[modName] || modHashes?.[cleanName] || ""
      ).trim();
      const resolvedTier =
        typeof mod?.compliance_tier === "number" ? mod.compliance_tier : -1;
      const rawStatus = String(mod?.status || "").toLowerCase().trim();
      const isVerifiedStableStatus =
        rawStatus === "stable" || rawStatus === "verified" || rawStatus === "approved";
      const isUnverifiedOrLocal =
        !mod ||
        !resolvedHash ||
        !mod.isSynced ||
        !mod.dbId ||
        !isVerifiedStableStatus;

      const entry = {
        ...(mod || {}),
        name: modName,
        cleanName,
        hash: resolvedHash,
        url: mod?.url || modMeta?.[modName]?.url || modMeta?.[cleanName]?.url || "",
        author:
          mod?.author || modMeta?.[modName]?.author || modMeta?.[cleanName]?.author || unknownAuthor,
        compliance_tier: resolvedTier >= 0 ? resolvedTier : 0,
        isUnverified: isUnverifiedOrLocal,
        displayName: mod?.displayName,
        isVirtual: mod?.isVirtual,
      };

      if (resolvedTier !== 0 || isUnverifiedOrLocal) {
        blocked.push(entry);
      } else {
        const lower = modName.toLowerCase();
        if (
          !lower.includes("merged") &&
          !lower.includes("simmatticly") &&
          !lower.includes("batch fix") &&
          !lower.includes("batch_fix")
        ) {
          allowed.push(entry);
        } else {
          blocked.push({ ...entry, isUnverified: true });
        }
      }
    }

    return {
      allowedMods: packagedLO.enrichAndSortArtifacts(allowed),
      blockedMods: blocked,
      packagedLoadOrder: packagedLO,
    };
  }, [isOpen, playSet, modLookup, activeGameSchema, t]);

  const {
    unknownRestrictedMods,
    tier1RestrictedMods,
    tier2RestrictedMods,
    tier3RestrictedMods,
    tier4RestrictedMods,
  } = useMemo(() => {
    const unk: any[] = [];
    const t1: any[] = [];
    const t2: any[] = [];
    const t3: any[] = [];
    const t4: any[] = [];
    for (let i = 0; i < blockedMods.length; i++) {
      const m = blockedMods[i];
      const tier = typeof m?.compliance_tier === "number" ? m.compliance_tier : 0;
      if (tier === 1) t1.push(m);
      else if (tier === 2) t2.push(m);
      else if (tier === 3) t3.push(m);
      else if (tier >= 4) t4.push(m);
      else unk.push(m);
    }
    return {
      unknownRestrictedMods: unk,
      tier1RestrictedMods: t1,
      tier2RestrictedMods: t2,
      tier3RestrictedMods: t3,
      tier4RestrictedMods: t4,
    };
  }, [blockedMods]);

  const filteredBlockedMods = useMemo(() => {
    if (!blockedMods.length) return [];
    let list =
      restrictedFilter === "UNKNOWN"
        ? unknownRestrictedMods
        : restrictedFilter === "TIER_1"
          ? tier1RestrictedMods
          : restrictedFilter === "TIER_2"
            ? tier2RestrictedMods
            : restrictedFilter === "TIER_3"
              ? tier3RestrictedMods
              : restrictedFilter === "TIER_4"
                ? tier4RestrictedMods
                : blockedMods;
    if (restrictedSearch.trim()) {
      const q = restrictedSearch.trim().toLowerCase();
      list = list.filter((m: any) => {
        const title = String(m.displayName || m.cleanName || m.name || "").toLowerCase();
        const author = String(m.author || "").toLowerCase();
        return title.includes(q) || author.includes(q);
      });
    }
    return list;
  }, [
    blockedMods,
    restrictedFilter,
    restrictedSearch,
    unknownRestrictedMods,
    tier1RestrictedMods,
    tier2RestrictedMods,
    tier3RestrictedMods,
    tier4RestrictedMods,
  ]);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    const code = await onUpload(isPublic, isLocked, allowedMods, isMarketListed);
    if (code) {
      setGeneratedCode(code);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      useStore
        .getState()
        .pushStatus(t("matrix_uplink_success", "Blueprint uplinked successfully!"), "success");
      navigator.clipboard.writeText(code).catch(() => {});
    } else {
      setUploadError(t("err_save_failed", "Failed to save blueprint"));
    }
    setIsUploading(false);
  };

  const isGuest = !session;
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
  const hasViolations = blockedMods.length > 0;
  const showDefconAlert = useModalStore((state: any) => state.showDefconAlert);
  const isUploadBlocked = isGuest || isBanned || hasViolations || showDefconAlert;

  const handleRemoveArtifact = (modName: string) => {
    if (!playSet || !onUpdatePlaySet) return;
    const targetNorm = getCachedNormalizedName(modName);
    const updatedMods = (playSet.mods || []).filter((m: any) => {
      const mName = typeof m === "string" ? m : m?.name || "";
      return getCachedNormalizedName(mName) !== targetNorm;
    });
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const handleRemoveAllViolating = () => {
    if (!playSet || !onUpdatePlaySet) return;
    const violatingNorms = new Set(blockedMods.map((m: any) => getCachedNormalizedName(m.name)));
    const updatedMods = (playSet.mods || []).filter((m: any) => {
      const mName = typeof m === "string" ? m : m?.name || "";
      return !violatingNorms.has(getCachedNormalizedName(mName));
    });
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
    setIsRestrictedPanelOpen(false);
  };

  const handleResetModTier = (modKey: string) => {
    if (!playSet || !onUpdatePlaySet) return;
    const targetLower = modKey.toLowerCase();
    const nextModTiers = { ...(playSet.modTiers || playSet.mod_tiers || {}) };
    Object.keys(nextModTiers).forEach((k) => {
      const kClean = (k.split(/[\\/]/).pop() || k).toLowerCase();
      if (k.toLowerCase() === targetLower || kClean === targetLower) {
        delete nextModTiers[k];
      }
    });
    const updatedMods = (playSet.mods || []).map((m: any) => {
      const rawName = typeof m === "string" ? m : m?.name || "";
      const clean = rawName.split(/[\\/]/).pop() || rawName;
      if (clean.toLowerCase() === targetLower) {
        if (typeof m === "string") return clean;
        const copy = { ...m, name: clean };
        delete copy.priority_tier;
        delete copy.priorityTier;
        delete copy.tierFolder;
        return copy;
      }
      return m;
    });
    onUpdatePlaySet({
      ...playSet,
      mods: updatedMods,
      modTiers: nextModTiers,
      mod_tiers: nextModTiers,
    });
  };

  const handleRemoveLoadRule = (ruleId: string, modA?: string, modB?: string) => {
    if (!playSet || !onUpdatePlaySet) return;
    const rawRules: any[] = Array.isArray(playSet.loadRules)
      ? playSet.loadRules
      : Array.isArray(playSet.load_rules)
        ? playSet.load_rules
        : [];
    const nextRules = rawRules.filter((r: any) => {
      if (ruleId && r.id === ruleId) return false;
      if (modA && modB) {
        const rA = (String(r.modA || "").split(/[\\/]/).pop() || "").toLowerCase();
        const rB = (String(r.modB || "").split(/[\\/]/).pop() || "").toLowerCase();
        if (rA === modA.toLowerCase() && rB === modB.toLowerCase()) return false;
      }
      return true;
    });
    onUpdatePlaySet({
      ...playSet,
      loadRules: nextRules,
      load_rules: nextRules,
    });
  };

  const {
    tier1Entries,
    tier2Entries,
    tier3Entries,
    overrideEntries,
    allLoadOrderCards,
  } = useMemo(() => {
    if (!packagedLoadOrder) {
      return {
        tier1Entries: [] as any[],
        tier2Entries: [] as any[],
        tier3Entries: [] as any[],
        overrideEntries: [] as any[],
        allLoadOrderCards: [] as any[],
      };
    }

    const unknownAuthor = t("unknown", "Unknown");
    const elevatedTiers = (packagedLoadOrder.compiled?.priorityTiers || []).filter(
      (pt: any, idx: number) => idx > 0 && !!pt?.folder
    );
    const t2Folder = (elevatedTiers[1]?.folder || "Sanctuary2").toLowerCase();
    const t3Folder = (elevatedTiers[2]?.folder || "Sanctuary3").toLowerCase();

    const t1: any[] = [];
    const t2: any[] = [];
    const t3: any[] = [];

    Object.entries(packagedLoadOrder.mod_tiers || {}).forEach(([modKey, tierId]) => {
      const rawTier = String(tierId || "").replace(/^!/, "").toLowerCase();
      const lastSlash = Math.max(modKey.lastIndexOf("/"), modKey.lastIndexOf("\\"));
      const cleanName = lastSlash >= 0 ? modKey.slice(lastSlash + 1) || modKey : modKey;
      const norm = getCachedNormalizedName(cleanName);
      const resolvedMod = modLookup
        ? modLookup.findMod(modKey, cleanName.toLowerCase(), norm)
        : undefined;

      let bucket: "TIER_1" | "TIER_2" | "TIER_3" = "TIER_1";
      let badgeLabel = t("bp_priority_sanctuary", "Priority 1");
      let iconName = t("icon_low_priority", "low_priority");

      if (rawTier === t3Folder || rawTier === "tier_3" || rawTier.endsWith("3")) {
        bucket = "TIER_3";
        badgeLabel = t("bp_priority_sanctuary3", "Priority 3");
        iconName = t("icon_bolt", "bolt");
      } else if (rawTier === t2Folder || rawTier === "tier_2" || rawTier.endsWith("2")) {
        bucket = "TIER_2";
        badgeLabel = t("bp_priority_sanctuary2", "Priority 2");
        iconName = t("icon_keyboard_double_arrow_up", "keyboard_double_arrow_up");
      }

      const item = {
        kind: "tier" as const,
        bucket,
        modKey,
        cleanName,
        displayName: resolvedMod?.displayName || cleanName,
        author: resolvedMod?.author || unknownAuthor,
        name: resolvedMod?.name || modKey,
        resolvedMod: resolvedMod || { name: modKey, displayName: cleanName },
        badgeLabel,
        iconName,
      };

      if (bucket === "TIER_3") t3.push(item);
      else if (bucket === "TIER_2") t2.push(item);
      else t1.push(item);
    });

    const ov: any[] = (packagedLoadOrder.load_rules || []).map((rule: any, rIdx: number) => {
      const rawA = String(rule.modA || "");
      const rawB = String(rule.modB || "");
      const cleanA = rawA.split(/[\\/]/).pop() || rawA;
      const cleanB = rawB.split(/[\\/]/).pop() || rawB;
      const normA = getCachedNormalizedName(cleanA);
      const normB = getCachedNormalizedName(cleanB);
      const modAObj = modLookup ? modLookup.findMod(rawA, cleanA.toLowerCase(), normA) : undefined;
      const modBObj = modLookup ? modLookup.findMod(rawB, cleanB.toLowerCase(), normB) : undefined;

      return {
        kind: "override" as const,
        bucket: "OVERRIDES" as const,
        id: rule.id || `rule_${rIdx}`,
        modA: cleanA,
        modB: cleanB,
        displayName: modAObj?.displayName || cleanA,
        targetDisplayName: modBObj?.displayName || cleanB,
        type: rule.type === "before" ? "before" : "after",
        resolvedMod: modAObj || { name: rawA, displayName: cleanA },
        resolvedTargetMod: modBObj || { name: rawB, displayName: cleanB },
        badgeLabel:
          rule.type === "before"
            ? t("lo_loads_before", "Loads Before")
            : t("lo_loads_after", "Loads After"),
        iconName: t("icon_tune", "tune"),
      };
    });

    return {
      tier1Entries: t1,
      tier2Entries: t2,
      tier3Entries: t3,
      overrideEntries: ov,
      allLoadOrderCards: [...t1, ...t2, ...t3, ...ov],
    };
  }, [packagedLoadOrder, modLookup, t]);

  const activeLoadOrderTabEntries = useMemo(() => {
    const base =
      loadOrderTab === "TIER_1"
        ? tier1Entries
        : loadOrderTab === "TIER_2"
          ? tier2Entries
          : loadOrderTab === "TIER_3"
            ? tier3Entries
            : overrideEntries;
    if (!loadOrderSearch.trim()) return base;
    const q = loadOrderSearch.trim().toLowerCase();
    return base.filter((entry: any) => {
      const title = String(entry.displayName || entry.cleanName || "").toLowerCase();
      const sub = String(entry.targetDisplayName || entry.author || "").toLowerCase();
      return title.includes(q) || sub.includes(q);
    });
  }, [loadOrderTab, tier1Entries, tier2Entries, tier3Entries, overrideEntries, loadOrderSearch]);

  if (!isOpen || !playSet) return null;

  const renderLoadOrderEntryCard = (entry: any, idx: number) => {
    const isOverride = entry.kind === "override";
    const cleanTitle =
      formatCleanModTitle(formatDisplayName(entry.displayName || entry.cleanName || entry.modA)) ||
      formatDisplayName(entry.displayName || entry.cleanName || entry.modA);

    const subtitleText = isOverride
      ? `${entry.badgeLabel} • ${
          formatCleanModTitle(formatDisplayName(entry.targetDisplayName || entry.modB)) ||
          formatDisplayName(entry.targetDisplayName || entry.modB)
        }`
      : (() => {
          const isScript = /\.ts4script$/i.test(String(entry.name || entry.cleanName || ""));
          const typeLabel = isScript
            ? t("type_script", "Script")
            : t("type_package", "Package");
          const hasAuthor =
            entry.author &&
            String(entry.author).trim() !== "" &&
            String(entry.author).toLowerCase() !== t("unknown", "Unknown").toLowerCase() &&
            String(entry.author).toLowerCase() !== "unknown";
          return hasAuthor ? `${entry.author} • ${typeLabel}` : typeLabel;
        })();

    const accentColorClass = isOverride ? "text-[var(--warning)]" : "text-[var(--accent)]";

    return (
      <div
        key={`${entry.bucket}_${entry.id || entry.modKey}_${idx}`}
        onClick={() => openModDossier(entry.resolvedMod)}
        className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all group/item cursor-pointer"
      >
        {/* Top Row: Full-Width Icon + Title/Subtitle Identity */}
        <div className="flex items-center gap-3 min-w-0 w-full">
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${accentColorClass} flex items-center justify-center shrink-0`}
          >
            <span className="material-symbols-outlined !text-[20px]">{entry.iconName}</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="relative group/lotitle flex items-center min-w-0 w-fit max-w-full">
              <span className="text-sm font-black text-[var(--text)] group-hover/item:text-[var(--accent)] transition-colors tracking-tight leading-snug truncate">
                {cleanTitle}
              </span>
              <HoverTooltip
                className="z-[200]"
                title={cleanTitle}
                icon={entry.iconName}
              />
            </div>
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-85 truncate">
              {subtitleText}
            </span>
          </div>
        </div>

        {/* Bottom Footer Row: Priority/Rule Badge on Left | Open Dossier + Remove/Reset on Right */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <span className={VAULT_CHIP_CLASS}>
            <span className={`material-symbols-outlined !text-[12px] ${accentColorClass}`}>
              {isOverride ? t("icon_swap_vert", "swap_vert") : t("icon_layers", "layers")}
            </span>
            <span>{entry.badgeLabel}</span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover/item:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--subtext)] group-hover/item:text-[var(--accent)] flex items-center justify-center transition-all">
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
            </div>

            {onUpdatePlaySet && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOverride) {
                    handleRemoveLoadRule(entry.id, entry.modA, entry.modB);
                  } else {
                    handleResetModTier(entry.cleanName || entry.modKey);
                  }
                }}
                className="relative group/loaction w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isOverride ? t("icon_delete", "delete") : t("icon_undo", "undo")}
                </span>
                <HoverTooltip
                  className="z-[200] !right-0 !translate-x-0 !left-auto"
                  title={
                    isOverride
                      ? t("btn_remove", "{Remove}")
                      : t("lo_reset_to_standard", "Reset to Standard Tier")
                  }
                  icon={isOverride ? t("icon_delete", "delete") : t("icon_undo", "undo")}
                  variant="danger"
                />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBlockedModCard = (mod: any, idx: number) => {
    const cleanTitle =
      formatCleanModTitle(formatDisplayName(mod.displayName || mod.cleanName || mod.name)) ||
      formatDisplayName(mod.cleanName || mod.name);
    const isScript = /\.ts4script$/i.test(String(mod.name || ""));
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Package");
    const hasAuthor =
      mod.author &&
      String(mod.author).trim() !== "" &&
      String(mod.author).toLowerCase() !== t("unknown", "Unknown").toLowerCase() &&
      String(mod.author).toLowerCase() !== "unknown";

    return (
      <div
        key={`${mod.name}_${idx}`}
        onClick={() => openModDossier(mod)}
        className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all group/item cursor-pointer"
      >
        {/* Top Row: Full-Width Icon + Title/Subtitle Identity */}
        <div className="flex items-center gap-3 min-w-0 w-full">
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_gpp_bad", "gpp_bad")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="relative group/blktitle flex items-center min-w-0 w-fit max-w-full">
              <span className="text-sm font-black text-[var(--text)] group-hover/item:text-[var(--accent)] transition-colors tracking-tight leading-snug truncate">
                {cleanTitle}
              </span>
              <HoverTooltip
                className="z-[200]"
                title={cleanTitle}
                icon={t("icon_gpp_bad", "gpp_bad")}
                variant="danger"
              />
            </div>
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-85 truncate">
              {hasAuthor ? `${mod.author} • ${typeLabel}` : typeLabel}
            </span>
          </div>
        </div>

        {/* Bottom Footer Row: Compliance Badge on Left | Open Dossier + Remove Buttons on Right */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_shield", "shield")}
            </span>
            <span>
              {mod.compliance_tier >= 1
                ? `${t("stat_tier", "Tier")} ${mod.compliance_tier}`
                : t("unverified", "Unverified")}
            </span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover/item:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--subtext)] group-hover/item:text-[var(--accent)] flex items-center justify-center transition-all">
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveArtifact(mod.name);
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_delete", "delete")}
              </span>
              <HoverTooltip
                className="z-[200] !right-0 !translate-x-0 !left-auto"
                title={t("btn_remove", "{Remove}")}
                icon={t("icon_delete", "delete")}
                variant="danger"
              />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const blockedReasonTooltip = isBanned
    ? t("alert_comm_banned", "Communications Banned")
    : showDefconAlert
      ? t("alert_defcon_blocked", "Alert Active")
      : hasViolations
        ? t("tooltip_uplink_blocked_title", "Uplink Blocked")
        : isGuest
          ? t("alert_guest_mode_uploads", "Guest Mode")
          : isUploading
            ? t("scanning", "Scanning...")
            : t("matrix_btn_upload", "Sync To {Nexus}");

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("matrix_title", "{Blueprint} Sync")}
      subtitle={t("matrix_subtitle", "Configure cloud visibility and security parameters")}
      icon={t("icon_cloud_upload", "cloud_upload")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={isUploading ? t("icon_sync", "sync") : t("icon_cloud_upload", "cloud_upload")}
            variant={isUploadBlocked ? "danger" : "accent"}
            disabled={isUploading || isUploadBlocked}
            onClick={handleUpload}
            tooltip={blockedReasonTooltip}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_cloud_upload", "cloud_upload")}
          overline={t("matrix_title", "{Blueprint} Sync")}
          title={playSet.name}
          description={t(
            "matrix_subtitle",
            "Configure cloud visibility and security parameters before generating an uplink code."
          )}
          badge={generatedCode || t("status_active", "Ready")}
          badgeIcon={
            hasViolations
              ? t("icon_warning_amber", "warning_amber")
              : t("icon_check_circle", "check_circle")
          }
          variant={hasViolations ? "danger" : "accent"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StatBox
              label={t("term_mods", "{Mods}")}
              value={allowedMods.length + blockedMods.length}
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("matrix_tier_warning_title", "Restricted")}
              value={blockedMods.length}
              icon={t("icon_warning_amber", "warning_amber")}
              iconColorClass={blockedMods.length > 0 ? "text-[var(--danger)]" : "text-[var(--subtext)]"}
            />
            <StatBox
              label={t("load_order_queue", "Load Rules")}
              value={packagedLoadOrder?.load_rules?.length || 0}
              icon={t("icon_low_priority", "low_priority")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("matrix_title", "{Blueprint} Sync")}
          icon={t("icon_tune", "tune")}
        >
          <div className="flex flex-col gap-3">
            {/* Public / Private */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SidePanelPillToggle
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                label={t("matrix_public", "Public")}
                icon={t("icon_public", "public")}
                variant="success"
              />
              <SidePanelPillToggle
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                label={t("matrix_private", "Private")}
                icon={t("icon_visibility_off", "visibility_off")}
                variant="accent"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isPublic
                ? t("matrix_public_desc", "{Blueprint} visible to all {Citizens} on the {Nexus}.")
                : t("matrix_private_desc", "{Blueprint} restricted to your account.")}
            </p>

            {/* Locked / Unlocked */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <SidePanelPillToggle
                checked={isLocked}
                onChange={() => setIsLocked(true)}
                label={t("matrix_locked", "Locked")}
                icon={t("icon_lock", "lock")}
                variant="danger"
              />
              <SidePanelPillToggle
                checked={!isLocked}
                onChange={() => setIsLocked(false)}
                label={t("matrix_unlocked", "Unlocked")}
                icon={t("icon_lock_open", "lock_open")}
                variant="success"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isLocked
                ? t("matrix_locked_desc", "Prevent modifications after syncing this blueprint.")
                : t(
                    "matrix_unlocked_desc",
                    "Allow users to customize this blueprint after syncing."
                  )}
            </p>

            {/* Market Listed / Unlisted */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <SidePanelPillToggle
                checked={isMarketListed}
                onChange={() => setIsMarketListed(true)}
                label={t("matrix_market", "{Nexus} Listing")}
                icon={t("icon_storefront", "storefront")}
                variant="success"
              />
              <SidePanelPillToggle
                checked={!isMarketListed}
                onChange={() => setIsMarketListed(false)}
                label={t("matrix_market_off", "Unlisted")}
                icon={t("icon_visibility_off", "visibility_off")}
                variant="accent"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isMarketListed
                ? t("matrix_market_desc", "{Blueprint} is visible on the public {Nexus}.")
                : t("matrix_market_off_desc", "{Blueprint} is hidden from {Nexus}.")}
            </p>
          </div>
        </UniversalGroup>

        {blockedMods.length > 0 && (
          <UniversalGroup
            title={t("matrix_tier_warning_title", "Restricted Artifacts Detected")}
            icon={t("icon_warning_amber", "warning_amber")}
            headerColorClass="text-[var(--danger)]"
            headerAction={
              <button
                type="button"
                onClick={handleRemoveAllViolating}
                className={`${VAULT_CHIP_CLASS} !h-7 cursor-pointer hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] transition-all`}
              >
                <span className="material-symbols-outlined !text-[13px] text-[var(--danger)]">
                  {t("icon_delete_sweep", "delete_sweep")}
                </span>
                <span>{t("matrix_btn_remove_all", "Remove All")}</span>
              </button>
            }
          >
            <div className="flex flex-col gap-3.5">
              {/* Calm Diagnostic Callout Header */}
              <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                  <span className="material-symbols-outlined !text-[18px]">
                    {t("icon_gpp_bad", "gpp_bad")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("nexus_flag_title", "{Nexus} Compliance Flag")}
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                        {t("icon_warning_amber", "warning_amber")}
                      </span>
                      <span>
                        {blockedMods.length.toLocaleString()}{" "}
                        {t("matrix_tier_warning_title", "Restricted")}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                    {t(
                      "matrix_tier_warning_desc",
                      "The following {mods} violate process compliance and cannot be synced:"
                    )}
                  </p>
                </div>
              </div>

              {/* 6 Sculpted Stat Tiles [ All | Unknown | Tier 1 / Tier 2 | Tier 3 | Tier 4 ] Opening the Stacked Panel */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_warning_amber", "warning_amber")}
                  label={t("all", "All")}
                  value={blockedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "ALL"}
                  onClick={() => {
                    setRestrictedFilter("ALL");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_help", "help")}
                  label={t("unknown", "Unknown")}
                  value={unknownRestrictedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "UNKNOWN"}
                  onClick={() => {
                    setRestrictedFilter("UNKNOWN");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_shield", "shield")}
                  label={`${t("stat_tier", "Tier")} 1`}
                  value={tier1RestrictedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "TIER_1"}
                  onClick={() => {
                    setRestrictedFilter("TIER_1");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_shield", "shield")}
                  label={`${t("stat_tier", "Tier")} 2`}
                  value={tier2RestrictedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "TIER_2"}
                  onClick={() => {
                    setRestrictedFilter("TIER_2");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_shield", "shield")}
                  label={`${t("stat_tier", "Tier")} 3`}
                  value={tier3RestrictedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "TIER_3"}
                  onClick={() => {
                    setRestrictedFilter("TIER_3");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_shield", "shield")}
                  label={`${t("stat_tier", "Tier")} 4`}
                  value={tier4RestrictedMods.length}
                  isActive={isRestrictedPanelOpen && restrictedFilter === "TIER_4"}
                  onClick={() => {
                    setRestrictedFilter("TIER_4");
                    setRestrictedSearch("");
                    setVisibleRestrictedCount(36);
                    setIsRestrictedPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
              </div>
            </div>
          </UniversalGroup>
        )}

        {packagedLoadOrder && (
          <UniversalGroup
            title={t("load_order_queue", "Load Order Queue")}
            icon={t("icon_low_priority", "low_priority")}
            headerAction={
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_description", "description")}
                </span>
                <span>{packagedLoadOrder.compiled.manifestFile}</span>
              </span>
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              {/* Calm Diagnostic / Telemetry Header Mirroring the Alerts Box Above */}
              <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[18px]">
                    {t("icon_low_priority", "low_priority")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("schema_load_engine", "Load Order Engine")}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                          {t("icon_tune", "tune")}
                        </span>
                        <span>
                          {allLoadOrderCards.length.toLocaleString()}{" "}
                          {t("overrides", "Overrides")}
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                    {t(
                      "lo_reorder_tier_desc",
                      "Drag & drop compact cards or edit sequence numbers to reorder {mods} within this priority tier."
                    )}
                  </p>
                </div>
              </div>

              {/* 4 Sculpted Stat Tiles [ Priority 1 | Priority 2 | Priority 3 | Overrides ] Opening the Stacked Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_low_priority", "low_priority")}
                  label={t("bp_priority_sanctuary", "Priority 1")}
                  value={tier1Entries.length}
                  isActive={isLoadOrderPanelOpen && loadOrderTab === "TIER_1"}
                  onClick={() => {
                    setLoadOrderTab("TIER_1");
                    setLoadOrderSearch("");
                    setVisibleLoadOrderCount(36);
                    setIsLoadOrderPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_keyboard_double_arrow_up", "keyboard_double_arrow_up")}
                  label={t("bp_priority_sanctuary2", "Priority 2")}
                  value={tier2Entries.length}
                  isActive={isLoadOrderPanelOpen && loadOrderTab === "TIER_2"}
                  onClick={() => {
                    setLoadOrderTab("TIER_2");
                    setLoadOrderSearch("");
                    setVisibleLoadOrderCount(36);
                    setIsLoadOrderPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_bolt", "bolt")}
                  label={t("bp_priority_sanctuary3", "Priority 3")}
                  value={tier3Entries.length}
                  isActive={isLoadOrderPanelOpen && loadOrderTab === "TIER_3"}
                  onClick={() => {
                    setLoadOrderTab("TIER_3");
                    setLoadOrderSearch("");
                    setVisibleLoadOrderCount(36);
                    setIsLoadOrderPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_tune", "tune")}
                  label={t("overrides", "Overrides")}
                  value={overrideEntries.length}
                  isActive={isLoadOrderPanelOpen && loadOrderTab === "OVERRIDES"}
                  onClick={() => {
                    setLoadOrderTab("OVERRIDES");
                    setLoadOrderSearch("");
                    setVisibleLoadOrderCount(36);
                    setIsLoadOrderPanelOpen(true);
                  }}
                  className="!opacity-90 hover:!opacity-100"
                />
              </div>
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("sidebar_uplink", "Uplink Code")}
          icon={t("icon_qr_code_2", "qr_code_2")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <input
                readOnly
                value={generatedCode || ""}
                placeholder={t("matrix_code_placeholder", "Click uplink to generate code...")}
                className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 py-3 text-[var(--text)] font-mono font-bold tracking-widest text-center focus:outline-none"
              />
              <ActionButton
                variant={isCopied ? "success" : "glass"}
                disabled={!generatedCode || isCopied}
                icon={isCopied ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                label={isCopied ? t("copied", "Copied") : t("btn_copy", "Copy")}
                onClick={() => {
                  if (generatedCode) {
                    navigator.clipboard
                      .writeText(generatedCode)
                      .then(() => {
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      })
                      .catch(() => {});
                  }
                }}
              />
            </div>

            <ActionButton
              variant="glass"
              className="w-full justify-center"
              disabled={isUploading || isUploadBlocked}
              icon={isUploading ? t("icon_sync", "sync") : t("icon_cloud_upload", "cloud_upload")}
              label={
                isUploading
                  ? t("scanning", "Scanning...")
                  : t("matrix_btn_upload", "Sync To {Nexus}")
              }
              onClick={handleUpload}
            />

            {uploadError && (
              <span className="text-[10px] font-black text-[var(--danger)] capitalize tracking-widest flex items-center justify-center gap-2">
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_error", "error")}
                </span>
                {uploadError}
              </span>
            )}
            {uploadSuccess && (
              <div className="flex justify-center">
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  <span>
                    {t("matrix_uplink_success", "Blueprint uplinked successfully!")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </UniversalGroup>
      </div>

      {/* Stacked SidePanel for Inspecting All Restricted Artifacts */}
      {blockedMods.length > 0 && (
        <SidePanel
          isOpen={isRestrictedPanelOpen}
          onClose={() => setIsRestrictedPanelOpen(false)}
          title={t("flag_res_flagged_panel_title", "Flagged {Mods} Inspector")}
          subtitle={t(
            "flag_res_flagged_panel_sub",
            "Non-Tier-0 or Unverified {Mods} Detected in {Blueprint}"
          )}
          icon={t("icon_gpp_bad", "gpp_bad")}
          iconColorClass="text-[var(--danger)]"
          widthClass="w-[92vw] md:w-[680px]"
          backdropZ="z-[70000]"
          panelZ="z-[70001]"
        >
          <div className="flex flex-col gap-4 mt-2 pb-10">
            <SidePanelHeroCard
              icon={t("icon_gpp_bad", "gpp_bad")}
              overline={t("matrix_tier_warning_title", "Restricted Artifacts Detected")}
              title={`${blockedMods.length.toLocaleString()} ${t("flagged", "Flagged")} ${t("mods", "{Mods}")}`}
              description={t(
                "nexus_flag_tier0_desc",
                "Only verified Tier 0 {mods} are permitted in {Nexus} {Blueprints}. Remove Tier 1–5 or unknown {mods} below and re-upload to restore your {Blueprint} listing."
              )}
              variant="danger"
            >
              <div className="flex items-center justify-end pt-1">
                <ActionButton
                  variant="danger"
                  icon={t("icon_delete_sweep", "delete_sweep")}
                  label={t("matrix_btn_remove_all", "Remove All")}
                  onClick={handleRemoveAllViolating}
                />
              </div>
            </SidePanelHeroCard>

            {/* 2-Row Even Filter Tiles Inside the SidePanel [ All | Unknown | Tier 1 / Tier 2 | Tier 3 | Tier 4 ] */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_warning_amber", "warning_amber")}
                label={t("all", "All")}
                value={blockedMods.length}
                isActive={restrictedFilter === "ALL"}
                onClick={() => {
                  setRestrictedFilter("ALL");
                  setVisibleRestrictedCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_help", "help")}
                label={t("unknown", "Unknown")}
                value={unknownRestrictedMods.length}
                isActive={restrictedFilter === "UNKNOWN"}
                onClick={() => {
                  setRestrictedFilter("UNKNOWN");
                  setVisibleRestrictedCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_shield", "shield")}
                label={`${t("stat_tier", "Tier")} 1`}
                value={tier1RestrictedMods.length}
                isActive={restrictedFilter === "TIER_1"}
                onClick={() => {
                  setRestrictedFilter("TIER_1");
                  setVisibleRestrictedCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_shield", "shield")}
                label={`${t("stat_tier", "Tier")} 2`}
                value={tier2RestrictedMods.length}
                isActive={restrictedFilter === "TIER_2"}
                onClick={() => {
                  setRestrictedFilter("TIER_2");
                  setVisibleRestrictedCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_shield", "shield")}
                label={`${t("stat_tier", "Tier")} 3`}
                value={tier3RestrictedMods.length}
                isActive={restrictedFilter === "TIER_3"}
                onClick={() => {
                  setRestrictedFilter("TIER_3");
                  setVisibleRestrictedCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_shield", "shield")}
                label={`${t("stat_tier", "Tier")} 4`}
                value={tier4RestrictedMods.length}
                isActive={restrictedFilter === "TIER_4"}
                onClick={() => {
                  setRestrictedFilter("TIER_4");
                  setVisibleRestrictedCount(36);
                }}
              />
            </div>

            <ActionPill
              searchQuery={restrictedSearch}
              setSearchQuery={(val: string) => {
                setRestrictedSearch(val);
                setVisibleRestrictedCount(36);
              }}
              searchPlaceholder={t("search_ph", "Search {mods}...")}
            />

            <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              <span>
                {filteredBlockedMods.length.toLocaleString()} {t("mods", "{Mods}")}
              </span>
              <span className="text-[var(--accent)] flex items-center gap-1">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_touch_app", "touch_app")}
                </span>
                {t("flag_res_inspect_dossier_hint", "Click any {mod} to open its Dossier")}
              </span>
            </div>

            {filteredBlockedMods.length === 0 ? (
              <EmptyState
                icon={t("icon_search_off", "search_off")}
                title={t("empty_title", "No matching {mods} found")}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {filteredBlockedMods
                  .slice(0, visibleRestrictedCount)
                  .map((mod: any, idx: number) => renderBlockedModCard(mod, idx))}
              </div>
            )}

            {filteredBlockedMods.length > visibleRestrictedCount && (
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more_artifacts", "Load More Artifacts")} (${(
                  filteredBlockedMods.length - visibleRestrictedCount
                ).toLocaleString()})`}
                onClick={() => setVisibleRestrictedCount((prev) => prev + 60)}
                className="w-full justify-center"
              />
            )}
          </div>
        </SidePanel>
      )}

      {/* Stacked SidePanel for Inspecting Load Order Priority 1-3 & Overrides */}
      {packagedLoadOrder && (
        <SidePanel
          isOpen={isLoadOrderPanelOpen}
          onClose={() => setIsLoadOrderPanelOpen(false)}
          title={t("load_order_queue", "Load Order Queue")}
          subtitle={`${playSet.name} • ${packagedLoadOrder.compiled.manifestFile}`}
          icon={t("icon_low_priority", "low_priority")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[92vw] md:w-[680px]"
          backdropZ="z-[70000]"
          panelZ="z-[70001]"
        >
          <div className="flex flex-col gap-4 mt-2 pb-10">
            <SidePanelHeroCard
              icon={t("icon_low_priority", "low_priority")}
              overline={t("schema_load_engine", "Load Order Engine")}
              title={
                loadOrderTab === "TIER_1"
                  ? t("bp_priority_sanctuary", "Priority 1")
                  : loadOrderTab === "TIER_2"
                    ? t("bp_priority_sanctuary2", "Priority 2")
                    : loadOrderTab === "TIER_3"
                      ? t("bp_priority_sanctuary3", "Priority 3")
                      : t("overrides", "Overrides")
              }
              description={t(
                "lo_rule_builder_desc",
                "Lock explicit load order dependencies between two {mods}."
              )}
              badge={packagedLoadOrder.compiled.manifestFile}
              badgeIcon={t("icon_description", "description")}
              variant="accent"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
                <StatBox
                  label={t("lo_priority_tier", "Priority Tier")}
                  value={
                    tier1Entries.length + tier2Entries.length + tier3Entries.length
                  }
                  icon={t("icon_low_priority", "low_priority")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("overrides", "Overrides")}
                  value={overrideEntries.length}
                  icon={t("icon_tune", "tune")}
                  iconColorClass="text-[var(--warning)]"
                />
              </div>
            </SidePanelHeroCard>

            {/* 4 Filter Tiles Inside the SidePanel [ Priority 1 | Priority 2 | Priority 3 | Overrides ] */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_low_priority", "low_priority")}
                label={t("bp_priority_sanctuary", "Priority 1")}
                value={tier1Entries.length}
                isActive={loadOrderTab === "TIER_1"}
                onClick={() => {
                  setLoadOrderTab("TIER_1");
                  setVisibleLoadOrderCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_keyboard_double_arrow_up", "keyboard_double_arrow_up")}
                label={t("bp_priority_sanctuary2", "Priority 2")}
                value={tier2Entries.length}
                isActive={loadOrderTab === "TIER_2"}
                onClick={() => {
                  setLoadOrderTab("TIER_2");
                  setVisibleLoadOrderCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_bolt", "bolt")}
                label={t("bp_priority_sanctuary3", "Priority 3")}
                value={tier3Entries.length}
                isActive={loadOrderTab === "TIER_3"}
                onClick={() => {
                  setLoadOrderTab("TIER_3");
                  setVisibleLoadOrderCount(36);
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_tune", "tune")}
                label={t("overrides", "Overrides")}
                value={overrideEntries.length}
                isActive={loadOrderTab === "OVERRIDES"}
                onClick={() => {
                  setLoadOrderTab("OVERRIDES");
                  setVisibleLoadOrderCount(36);
                }}
              />
            </div>

            <ActionPill
              searchQuery={loadOrderSearch}
              setSearchQuery={(val: string) => {
                setLoadOrderSearch(val);
                setVisibleLoadOrderCount(36);
              }}
              searchPlaceholder={t("search_ph", "Search {mods}...")}
            />

            <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              <span>
                {activeLoadOrderTabEntries.length.toLocaleString()}{" "}
                {loadOrderTab === "OVERRIDES"
                  ? t("overrides", "Overrides")
                  : t("mods", "{Mods}")}
              </span>
              <span className="text-[var(--accent)] flex items-center gap-1">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_touch_app", "touch_app")}
                </span>
                {t("flag_res_inspect_dossier_hint", "Click any {mod} to open its Dossier")}
              </span>
            </div>

            {activeLoadOrderTabEntries.length === 0 ? (
              <EmptyState
                icon={
                  loadOrderTab === "OVERRIDES"
                    ? t("icon_tune", "tune")
                    : t("icon_low_priority", "low_priority")
                }
                title={t("empty_title", "No matching {mods} found")}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {activeLoadOrderTabEntries
                  .slice(0, visibleLoadOrderCount)
                  .map((entry: any, idx: number) => renderLoadOrderEntryCard(entry, idx))}
              </div>
            )}

            {activeLoadOrderTabEntries.length > visibleLoadOrderCount && (
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more_artifacts", "Load More Artifacts")} (${(
                  activeLoadOrderTabEntries.length - visibleLoadOrderCount
                ).toLocaleString()})`}
                onClick={() => setVisibleLoadOrderCount((prev) => prev + 60)}
                className="w-full justify-center"
              />
            )}
          </div>
        </SidePanel>
      )}
    </SidePanel>,
    document.body
  );
}
