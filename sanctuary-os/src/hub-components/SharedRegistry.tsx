import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  EmptyState,
  SidePanel,
  CustomDropdown,
  GameVersionMultiSelect,
  CustomComplianceDropdown,
  CustomDatePicker,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import { CustomClassificationDropdown } from "../shared-components/dropdown-controls/PickersAndCompliance";
export { CustomClassificationDropdown };
import { ArtifactCard } from "../shared-components/Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../views/ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelPillToggle,
} from "../components/layouts/ElevatedHubLayout";
import { ArtifactWorkspace, StudioTabId } from "../components/ArtifactStudioTabs";
import { fetchAllTableRows, buildFamilyHierarchy } from "../components/artifact-studio/artifactStudioUtils";
import { importIssueCauseFromLabReports } from "../components/KnownExceptionRules";
import {
  isStrictTier0Value,
  isUnknownOrUnverifiedModStatus,
  pruneModsWithIneligibleAncestors,
  invalidateNexusCatalogCache,
} from "../utils/nexusCatalogStats";

const REGISTRY_CACHE_TTL = 1000 * 60 * 10;
let registryCache: {
  cloudMods: any[] | null;
  modRelationships: any[] | null;
  masonsList: any[] | null;
  highlanderSlots: any[] | null;
  lastFetch: number;
  isComplete: boolean;
} = {
  cloudMods: null,
  modRelationships: null,
  masonsList: null,
  highlanderSlots: null,
  lastFetch: 0,
  isComplete: false,
};
let registryFetchPromise: Promise<void> | null = null;
const registryListeners = new Set<() => void>();

const notifyRegistryListeners = () => {
  registryListeners.forEach((listener) => listener());
};

const isStableModStatus = (status?: string | null) =>
  status === "stable" || status === "verified";
const isUnderReviewModStatus = (status?: string | null) =>
  status === "under_review";
const isPendingModStatus = (status?: string | null) =>
  status === "pending";
const isUnknownModStatus = (status?: string | null) =>
  isUnknownOrUnverifiedModStatus(status);
const ARCHITECT_EXCLUDED_STATUSES = new Set([
  "obsolete",
  "blacklisted",
  "quarantined",
  "rejected",
  "malware_pending",
]);
const UUID_NAME_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_AUTHOR_VALUES = new Set([
  "",
  "unknown",
  "unknown creator",
  "unidentified",
  "local",
  "local node",
]);
const isArchitectTier0Mod = (m: any): boolean => {
  if (!m || typeof m !== "object") return false;
  if (!isStrictTier0Value(m.compliance_tier)) return false;
  if (m.has_pending_flag === true) return false;
  if (isUnknownOrUnverifiedModStatus(m.status)) return false;
  const st = String(m.status || "").toLowerCase().trim();
  if (ARCHITECT_EXCLUDED_STATUSES.has(st)) return false;
  const rawName = String(m.name || "").trim();
  if (!rawName || UUID_NAME_REGEX.test(rawName)) return false;
  const lowerName = rawName.toLowerCase();
  if (lowerName.includes("manual flag") || lowerName.includes("unindexed flagged")) {
    return false;
  }
  if (
    !m.mason_id &&
    UNKNOWN_AUTHOR_VALUES.has(String(m.master_author || "").trim().toLowerCase())
  ) {
    return false;
  }
  return true;
};

export function invalidateArchitectRegistryCache(): void {
  registryCache.cloudMods = null;
  registryCache.modRelationships = null;
  registryCache.lastFetch = 0;
  registryCache.isComplete = false;
  registryFetchPromise = null;
}

const isAnomalyModStatus = (status?: string | null) =>
  !isStableModStatus(status) &&
  !isUnderReviewModStatus(status) &&
  !isPendingModStatus(status) &&
  !isUnknownModStatus(status);

export function prefetchArchitectRegistry(forceRefresh = false): Promise<void> {
  const isFresh =
    !forceRefresh &&
    registryCache.isComplete &&
    registryCache.cloudMods &&
    registryCache.cloudMods.length > 0 &&
    performance.now() - registryCache.lastFetch < REGISTRY_CACHE_TTL;
  if (isFresh) return Promise.resolve();
  if (forceRefresh) {
    registryFetchPromise = null;
  } else if (registryFetchPromise) {
    return registryFetchPromise;
  }

  registryFetchPromise = (async () => {
    try {
      const [modsData, relsData, masonsRes, slotsRes] = await Promise.all([
        fetchAllTableRows(
          supabase,
          "mods",
          "*, mod_versions(id, dna_hash, version_label, game_version)",
          "name",
          (firstBatch) => {
            if (!registryCache.cloudMods || registryCache.cloudMods.length === 0) {
              registryCache.cloudMods = (firstBatch || []).filter(isArchitectTier0Mod);
              registryCache.isComplete = false;
              notifyRegistryListeners();
            }
          },
          (q) => q.eq("compliance_tier", 0).eq("has_pending_flag", false)
        ),
        fetchAllTableRows(
          supabase,
          "mod_relationships",
          "id, parent_id, child_id, relationship_type"
        ),
        supabase.from("masons").select("id, name").order("name"),
        supabase.from("flavor_groups").select("id, name, slug").order("name"),
      ]);
      if (modsData) {
        const modsById = new Map<string, any>();
        for (const m of modsData) {
          if (!isArchitectTier0Mod(m)) continue;
          const sid = String(m.id || "").trim();
          if (sid) modsById.set(sid, m);
        }
        pruneModsWithIneligibleAncestors(modsById, relsData || []);
        registryCache.cloudMods = Array.from(modsById.values());
        registryCache.isComplete = true;
      }
      if (relsData) registryCache.modRelationships = relsData;
      if (masonsRes?.data) registryCache.masonsList = masonsRes.data;
      if (slotsRes?.data) registryCache.highlanderSlots = slotsRes.data;
      registryCache.lastFetch = performance.now();
      notifyRegistryListeners();
    } catch (err) {
      console.error("ArchitectRegistry prefetch error:", err);
    } finally {
      registryFetchPromise = null;
    }
  })();

  return registryFetchPromise;
}

export function ArchitectRegistry({
  isActiveTab = true,
  initialSearch = "",
  onClearSearch,
  initialActiveMod = null,
  onClearActiveMod,
  setStatus,
}: any = {}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const [cloudMods, setCloudMods] = useState<any[]>(() => registryCache.cloudMods || []);
  const [modRelationships, setModRelationships] = useState<any[]>(
    () => registryCache.modRelationships || []
  );
  const [groupFamilies, setGroupFamilies] = useState<boolean>(true);
  const [studioTab, setStudioTab] = useState<StudioTabId>("overview");
  const [, setTotalCount] = useState<number>(() => registryCache.cloudMods?.length || 0);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [originalMod, setOriginalMod] = useState<any | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>(() => registryCache.masonsList || []);
  const [highlanderSlots, setHighlanderSlots] = useState<any[]>(
    () => registryCache.highlanderSlots || []
  );

  const [activeTab, setActiveTab] = useState<
    "overview" | "stable" | "under_review" | "pending" | "unstable_corrupted"
  >("overview");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [exclusiveSlotFilter, setExclusiveSlotFilter] = useState("ALL");

  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(() => !registryCache.cloudMods);
  const PAGE_SIZE = 60;

  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      setActiveTab("stable");
      if (onClearSearch) onClearSearch();
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialActiveMod) {
      const full = cloudMods.find((cm) => cm.id === initialActiveMod?.id) || initialActiveMod;
      if (isStrictTier0Value(full?.compliance_tier)) {
        setStudioTab("overview");
        setOriginalMod(JSON.parse(JSON.stringify(full)));
        setActiveMod(JSON.parse(JSON.stringify(full)));
      }
      if (onClearActiveMod) onClearActiveMod();
    }
  }, [initialActiveMod]);

  const fetchRelationships = async () => {
    const data = await fetchAllTableRows(
      supabase,
      "mod_relationships",
      "id, parent_id, child_id, relationship_type"
    );
    if (data) {
      registryCache.modRelationships = data;
      setModRelationships(data);
    }
  };

  const fetchData = async (forceRefresh = false) => {
    const hasWarmCache =
      !forceRefresh &&
      Array.isArray(registryCache.cloudMods) &&
      registryCache.cloudMods.length > 0;

    if (hasWarmCache) {
      const tier0Mods = registryCache.cloudMods!.filter(isArchitectTier0Mod);
      setCloudMods(tier0Mods);
      setTotalCount(tier0Mods.length);
      if (registryCache.modRelationships) setModRelationships(registryCache.modRelationships);
      if (registryCache.masonsList) setMasonsList(registryCache.masonsList);
      if (registryCache.highlanderSlots) setHighlanderSlots(registryCache.highlanderSlots);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      await prefetchArchitectRegistry(forceRefresh);
      if (registryCache.cloudMods) {
        const tier0Mods = registryCache.cloudMods.filter(isArchitectTier0Mod);
        setCloudMods(tier0Mods);
        setTotalCount(tier0Mods.length);
      }
      if (registryCache.modRelationships) setModRelationships(registryCache.modRelationships);
      if (registryCache.masonsList) setMasonsList(registryCache.masonsList);
      if (registryCache.highlanderSlots) setHighlanderSlots(registryCache.highlanderSlots);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const syncFromCache = () => {
      if (registryCache.cloudMods) {
        const tier0Mods = registryCache.cloudMods.filter(isArchitectTier0Mod);
        setCloudMods(tier0Mods);
        setTotalCount(tier0Mods.length);
        setIsLoading(false);
      }
      if (registryCache.modRelationships) {
        setModRelationships(registryCache.modRelationships);
      }
      if (registryCache.masonsList) {
        setMasonsList(registryCache.masonsList);
      }
      if (registryCache.highlanderSlots) {
        setHighlanderSlots(registryCache.highlanderSlots);
      }
    };
    const handleComplianceUpdated = () => {
      invalidateArchitectRegistryCache();
      fetchData(true);
    };
    registryListeners.add(syncFromCache);
    window.addEventListener("sanctuary-compliance-updated", handleComplianceUpdated);
    window.addEventListener("sanctuary-content-flagged", handleComplianceUpdated);
    fetchData(false);
    return () => {
      registryListeners.delete(syncFromCache);
      window.removeEventListener("sanctuary-compliance-updated", handleComplianceUpdated);
      window.removeEventListener("sanctuary-content-flagged", handleComplianceUpdated);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeTab, activeCategory, activeSubType, statusFilter, exclusiveSlotFilter, searchTerm, groupFamilies]);

  useEffect(() => {
    if (registryCache.masonsList && registryCache.masonsList.length > 0) {
      setMasonsList(registryCache.masonsList);
      return;
    }
    const fetchMasons = async () => {
      const { data } = await supabase.from("masons").select("id, name").order("name");
      if (data) {
        registryCache.masonsList = data;
        setMasonsList(data);
      }
    };
    fetchMasons();
  }, []);

  // Build transitive family hierarchy across the full catalog
  const familyHierarchy = useMemo(() => {
    const validIds = new Set(cloudMods.map((m) => m.id));
    return buildFamilyHierarchy(modRelationships, validIds);
  }, [cloudMods, modRelationships]);

  // All family-grouped (or flat) mods before tab/search filtering, used for accurate tab counts
  const baseGroupedMods = useMemo(() => {
    const { childToRootMap, childrenByRootId } = familyHierarchy;
    const modById = new Map(cloudMods.map((m) => [m.id, m]));

    return cloudMods
      .filter((mod) => {
        if (!isArchitectTier0Mod(mod)) return false;
        const childInfo = childToRootMap.get(mod.id);
        if (groupFamilies && childInfo && modById.has(childInfo.rootId)) {
          return false;
        }
        return true;
      })
      .map((mod) => {
        const childInfo = childToRootMap.get(mod.id);
        const childSet = childrenByRootId.get(mod.id);
        const count = childSet ? childSet.size : 0;
        return {
          ...mod,
          _familyChildrenCount: count,
          _familyRole: childInfo ? childInfo.type : count > 0 ? "core" : undefined,
          _parentId: childInfo?.rootId,
        };
      });
  }, [cloudMods, familyHierarchy, groupFamilies]);

  // Filtered list for the active tab, category, status, and search query
  const displayCloudMods = useMemo(() => {
    const { childrenByRootId } = familyHierarchy;
    const modById = new Map(cloudMods.map((m) => [m.id, m]));
    const q = searchTerm.trim().toLowerCase();

    const matchesSelfOrFamilyChild = (predicate: (m: any) => boolean) => (mod: any) => {
      if (predicate(mod)) return true;
      if (!groupFamilies) return false;
      const childIds = childrenByRootId.get(mod.id);
      if (!childIds) return false;
      for (const cid of childIds) {
        const cm = modById.get(cid);
        if (cm && isArchitectTier0Mod(cm) && predicate(cm)) {
          return true;
        }
      }
      return false;
    };

    const matchesCategoryAndSub = (m: any) => {
      if (activeCategory === "ALL") return true;
      if (String(m?.category_override || "").toLowerCase() !== activeCategory.toLowerCase()) {
        return false;
      }
      if (
        activeSubType !== "ALL" &&
        String(m?.sub_type || "").toLowerCase() !== activeSubType.toLowerCase()
      ) {
        return false;
      }
      return true;
    };

    return baseGroupedMods.filter((mod) => {
      if (!isArchitectTier0Mod(mod)) return false;
      if (activeCategory !== "ALL" && !matchesSelfOrFamilyChild(matchesCategoryAndSub)(mod)) {
        return false;
      }

      if (exclusiveSlotFilter !== "ALL") {
        const matchesSlot = (m: any) =>
          exclusiveSlotFilter === "ANY_SLOT"
            ? Boolean(m?.highlander_group_id)
            : String(m?.highlander_group_id || "") === exclusiveSlotFilter;
        if (!matchesSelfOrFamilyChild(matchesSlot)(mod)) return false;
      }

      if (activeTab !== "overview") {
        if (activeTab === "stable") {
          if (!isStableModStatus(mod.status)) return false;
        } else if (activeTab === "under_review") {
          if (!isUnderReviewModStatus(mod.status)) return false;
        } else if (activeTab === "pending") {
          if (!isPendingModStatus(mod.status)) return false;
        } else if (activeTab === "unstable_corrupted") {
          if (!isAnomalyModStatus(mod.status)) return false;
        } else if (mod.status !== activeTab) {
          return false;
        }
      }

      if (statusFilter !== "ALL") {
        if (statusFilter === "paid") {
          if (!matchesSelfOrFamilyChild((m) => Boolean(m?.is_paid))(mod)) return false;
        } else if (statusFilter === "free") {
          if (mod.is_paid) return false;
        } else if (statusFilter === "early_access") {
          if (!matchesSelfOrFamilyChild((m) => Boolean(m?.is_early_access))(mod)) return false;
        } else if (statusFilter === "stable") {
          if (!isStableModStatus(mod.status)) return false;
        } else if (statusFilter === "under_review") {
          if (!isUnderReviewModStatus(mod.status)) return false;
        } else if (statusFilter === "pending") {
          if (!isPendingModStatus(mod.status)) return false;
        } else if (String(mod.status || "").toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      if (q) {
        const matchesSearchQuery = (m: any) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.master_author || "").toLowerCase().includes(q);
        if (!matchesSelfOrFamilyChild(matchesSearchQuery)(mod)) return false;
      }

      return true;
    });
  }, [
    baseGroupedMods,
    cloudMods,
    familyHierarchy,
    activeCategory,
    activeSubType,
    activeTab,
    statusFilter,
    exclusiveSlotFilter,
    searchTerm,
    groupFamilies,
  ]);

  const visibleCloudMods = useMemo(
    () => displayCloudMods.slice(0, (page + 1) * PAGE_SIZE),
    [displayCloudMods, page, PAGE_SIZE]
  );
  const hasMore = visibleCloudMods.length < displayCloudMods.length;

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.rpc("secure_upsert_cloud_file", {
      p_token: useStore.getState().session?.access_token || "",
      p_target: "masons",
      p_payload: { id: newId, name: newMasonName },
    });
    if (!error) {
      await logArchitectAction(
        "Created Mason Entity",
        "masons",
        newMasonName.trim(),
        undefined,
        "Architect Console",
        false,
        { name: { to: newMasonName.trim() } }
      );
      const { data: mData } = await supabase.from("masons").select("id, name").order("name");
      if (mData) setMasonsList(mData);
      setActiveMod({ ...activeMod, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const handleCommitChanges = async () => {
    if (!activeMod) return;
    setIsCommitting(true);
    try {
      const beforeMod =
        originalMod && originalMod.id === activeMod.id
          ? originalMod
          : cloudMods.find((m) => m.id === activeMod.id) || null;
      const targetTier = Math.min(4, Math.max(0, Number(activeMod.compliance_tier || 0)));
      const isComplianceFlagged = targetTier >= 1;
      const rawReason = String(activeMod.status_reason || "").trim();
      const cleanedReason =
        (activeMod.status === "stable" || activeMod.status === "verified") &&
          /^\[ARCHITECT\b/i.test(rawReason)
          ? null
          : rawReason || null;
      const updatedPayload = {
        id: activeMod.id,
        name: activeMod.name,
        category_override: activeMod.category_override,
        sub_type: activeMod.sub_type,
        file_extension: activeMod.file_extension,
        status: isComplianceFlagged ? "pending" : activeMod.status,
        status_reason: isComplianceFlagged
          ? `[ARCHITECT REGISTRY] Flagged Tier ${targetTier} for Oversight Compliance review`
          : cleanedReason,
        url: activeMod.url,
        image_url: activeMod.image_url,
        latest_version: activeMod.latest_version,
        description: activeMod.description,
        compatible_versions: activeMod.compatible_versions,
        family_slug: activeMod.family_slug,
        mason_id: activeMod.mason_id,
        compliance_tier: targetTier,
        is_paid: activeMod.is_paid || false,
        is_early_access: activeMod.is_early_access || false,
        highlander_group_id: activeMod.highlander_group_id ?? null,
        requiredDLC: activeMod.requiredDLC || [],
        folder_structure: activeMod.folder_structure || [],
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: useStore.getState().session?.access_token || "",
        p_target: "mods",
        p_payload: updatedPayload,
      });

      if (!error) {
        const diff = computeAuditDiff(beforeMod, updatedPayload);
        await logArchitectAction(
          isComplianceFlagged ? `Flagged Mod for Oversight Compliance` : `Updated Mod Metadata`,
          `mods`,
          activeMod.name || activeMod.id,
          isComplianceFlagged ? `Flagged Tier ${targetTier} (Pending)` : undefined,
          "Architect Console",
          false,
          diff
        );
        if (isComplianceFlagged) {
          setActiveMod(null);
          setOriginalMod(null);
        } else {
          setOriginalMod(JSON.parse(JSON.stringify(updatedPayload)));
        }
        if (setStatus) setStatus(`${t("icon_check_circle", "check_circle")} [${activeMod.name}] ${t("alert_saved", "Saved successfully!")}`);
        useStore
          .getState()
          .pushStatus(
            isComplianceFlagged
              ? t(
                "nexus_mod_flagged_compliance_toast",
                "{Mod} flagged for Oversight Compliance review (Pending)."
              )
              : t("saved_success", "{Mod} Updated Successfully."),
            isComplianceFlagged ? "warning" : "success"
          );
        setPage(0);
        invalidateArchitectRegistryCache();
        invalidateNexusCatalogCache({ dispatchEvent: true });
        fetchData(true);
        fetchRelationships();
      } else {
        if (setStatus) setStatus(`${t("icon_block", "block")} ${t("alert_error", "Error saving:")} ${t(error.message, error.message)}`);
        useStore.getState().pushStatus(error.message, "error");
      }
    } catch (err: any) {
      if (setStatus) setStatus(`${t("icon_block", "block")} ${t("alert_error", "Error saving:")} ${t(err.message, err.message)}`);
      useStore.getState().pushStatus(err.message, "error");
    }
    setIsCommitting(false);
  };

  const openArchitectMod = (mod: any) => {
    const full = cloudMods.find((cm) => cm.id === mod?.id) || mod;
    if (!isStrictTier0Value(full?.compliance_tier)) return;
    setStudioTab("overview");
    setOriginalMod(JSON.parse(JSON.stringify(full)));
    setActiveMod(JSON.parse(JSON.stringify(full)));
  };

  const renderLanding = () => {
    const issuesList = displayCloudMods.filter(
      (m) => isAnomalyModStatus(m.status) || isUnderReviewModStatus(m.status)
    );
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("title_recent_artifacts", "Recent {Mods}")}
          isEmpty={displayCloudMods.length === 0}
          emptyIcon={t("icon_deployed_code", "deployed_code")}
          emptyTitle={t("no_artifacts", "Creator No {Mods}")}
        >
          {displayCloudMods.slice(0, 4).map((mod: any) => (
            <ArtifactCard
              key={mod.id}
              mod={mod}
              activeModId={activeMod?.id}
              masonsList={masonsList}
              onClick={() => openArchitectMod(mod)}
            />
          ))}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("title_issues", "Issues")}
          isEmpty={issuesList.length === 0}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "No Issues")}
        >
          {issuesList.slice(0, 4).map((mod: any) => (
            <ArtifactCard
              key={mod.id}
              mod={mod}
              activeModId={activeMod?.id}
              masonsList={masonsList}
              onClick={() => openArchitectMod(mod)}
            />
          ))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => (
    <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {visibleCloudMods.length === 0 ? (
          <EmptyState
            icon={searchTerm ? t("icon_search_off", "search_off") : t("icon_inventory_2", "inventory_2")}
            title={searchTerm ? t("no_matches", "No matches found") : t("no_artifacts", "Creator No {Mods}")}
            className="col-span-full py-16"
          />
        ) : (
          visibleCloudMods.map((mod: any) => (
            <ArtifactCard
              key={mod.id}
              mod={mod}
              activeModId={activeMod?.id}
              masonsList={masonsList}
              onClick={() => openArchitectMod(mod)}
            />
          ))
        )}
      </div>

      {hasMore && (
        <div className="w-full flex justify-center mt-6 mb-8">
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={isLoading}
            className="px-8 py-3 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest text-[var(--text)] flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined animate-spin !text-[16px]">{t("icon_sync", "sync")}</span>{" "}
                {t("ui_loading", "Loading...")}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-[16px]">{t("icon_expand_more", "expand_more")}</span>{" "}
                {t("load_more", "Load More")}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  if (!isActiveTab) return null;

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("term_mods", "Mods")}
        headerIcon={t("icon_inventory_2", "inventory_2")}
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_queue", "Search Queue...") as string}
        tabs={[
          {
            id: "overview",
            label: t("overview", "Overview"),
            icon: t("icon_dashboard", "dashboard"),
            number: baseGroupedMods.length.toString(),
          },
          {
            id: "stable",
            label: t("status_stable", "STABLE"),
            icon: t("icon_verified", "verified"),
            number: baseGroupedMods.filter((m) => isStableModStatus(m.status)).length.toString(),
          },
          {
            id: "under_review",
            label: t("status_dd_review", "Under Review"),
            icon: t("icon_policy", "policy"),
            number: baseGroupedMods.filter((m) => isUnderReviewModStatus(m.status)).length.toString(),
          },
          {
            id: "pending",
            label: t("pending", "Pending"),
            icon: t("icon_schedule", "schedule"),
            number: baseGroupedMods.filter((m) => isPendingModStatus(m.status)).length.toString(),
          },
          {
            id: "unstable_corrupted",
            label: t("label_unstable", "Unstable"),
            icon: t("icon_warning", "warning"),
            number: baseGroupedMods.filter((m) => isAnomalyModStatus(m.status)).length.toString(),
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as any)}
        hideSearch={activeTab === "overview"}
        actions={[
          {
            id: "toggle_group_families",
            icon: groupFamilies ? t("icon_account_tree", "account_tree") : t("icon_view_module", "view_module"),
            label: groupFamilies
              ? t("studio_group_families", "Group {Mod} Families")
              : t("studio_flat_list", "Flat List"),
            onClick: () => setGroupFamilies(!groupFamilies),
          },
        ]}
        primaryPopover={
          activeTab !== "overview"
            ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              isActive:
                activeCategory !== "ALL" ||
                activeSubType !== "ALL" ||
                statusFilter !== "ALL" ||
                exclusiveSlotFilter !== "ALL",
              content: (() => {
                const schemaCategories = useStore.getState().modCategories || [];
                const activeSchemaCategory = schemaCategories.find(
                  (c: any) => String(c.id).toLowerCase() === activeCategory.toLowerCase()
                );
                const subcats = activeSchemaCategory?.subcategories || [];

                const renderFilterGrid = (
                  title: string,
                  currentValue: string,
                  onPick: (id: string) => void,
                  options: Array<{ id: string; label: string }>
                ) => (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 px-1 flex items-center gap-2">
                      <span className="text-[var(--text)] opacity-90">{title}</span>
                      <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {options.map((opt) => {
                        const active = currentValue === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onPick(opt.id)}
                            className={`sa-dropdown-item flex items-center justify-between gap-2 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );

                return (
                  <div className="flex flex-col w-[420px] p-4 max-w-[calc(100vw-40px)] gap-4 text-left">
                    {renderFilterGrid(
                      t("filter_category", "Filter Category"),
                      activeCategory,
                      (val) => {
                        setActiveCategory(val);
                        setActiveSubType("ALL");
                      },
                      [
                        { id: "ALL", label: t("filter_all", "All") },
                        ...schemaCategories.map((c: any) => ({
                          id: c.id,
                          label: c.lexicon_key
                            ? t(c.lexicon_key, c.label || c.name || c.id)
                            : c.label || c.name || c.id,
                        })),
                      ]
                    )}

                    {subcats.length > 0 &&
                      renderFilterGrid(
                        t("registry_col_subcat", "Sub-category"),
                        activeSubType,
                        (val) => setActiveSubType(val),
                        [
                          { id: "ALL", label: t("filter_all", "All") },
                          ...subcats.map((sub: any) => ({
                            id: sub.id,
                            label: sub.lexicon_key
                              ? t(sub.lexicon_key, sub.label || sub.name || sub.id)
                              : sub.label || sub.name || sub.id,
                          })),
                        ]
                      )}

                    {renderFilterGrid(
                      t("filter_status", "Filter Status"),
                      statusFilter,
                      (val) => setStatusFilter(val),
                      [
                        { id: "ALL", label: t("status_dd_all", "All Statuses") },
                        { id: "stable", label: t("status_stable", "Stable") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                        { id: "under_review", label: t("status_dd_review", "Under Review") },
                        { id: "pending", label: t("pending", "Pending") },
                        { id: "paid", label: t("label_is_paid", "Paid {Mod}") },
                        { id: "early_access", label: t("badge_early_access", "Early Access") },
                      ]
                    )}

                    {highlanderSlots.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 px-1 flex items-center gap-2">
                          <span className="text-[var(--text)] opacity-90">
                            {t("highlander_exclusive_slot", "Exclusive Slot")}
                          </span>
                          <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1" />
                        </div>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          disableTint={true}
                          searchable={true}
                          searchPlaceholder={t("highlander_search_slots_ph", "Search Exclusive Slots...")}
                          value={exclusiveSlotFilter}
                          onChange={(v: string[]) => setExclusiveSlotFilter(v[0] || "ALL")}
                          options={[
                            { id: "ALL", label: t("filter_all", "All") },
                            { id: "ANY_SLOT", label: t("highlander_exclusive_slots", "Exclusive Slots") },
                            ...highlanderSlots.map((slot: any) => ({
                              id: String(slot.id),
                              label: slot.name,
                            })),
                          ]}
                        />
                      </div>
                    )}

                    {(activeCategory !== "ALL" ||
                      activeSubType !== "ALL" ||
                      statusFilter !== "ALL" ||
                      exclusiveSlotFilter !== "ALL") && (
                      <ActionButton
                        icon={t("icon_close", "close")}
                        label={t("btn_clear", "Clear Filters")}
                        onClick={() => {
                          setActiveCategory("ALL");
                          setActiveSubType("ALL");
                          setStatusFilter("ALL");
                          setExclusiveSlotFilter("ALL");
                        }}
                        className="w-full"
                        variant="danger"
                      />
                    )}
                  </div>
                );
              })(),
            }
            : undefined
        }
        className={isActiveTab ? "" : "hidden"}
      >
        {activeTab === "overview" ? renderLanding() : renderList()}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => {
          setActiveMod(null);
          setOriginalMod(null);
        }}
        widthClass="w-[92vw] md:w-[min(1120px,calc(100vw-var(--sidebarWidth,260px)-2.5rem))]"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
        noScroll
        noPadding
        title={t("ui_edit_metadata", "Edit Metadata")}
        subtitle={`UUID: ${activeMod?.id}`}
        icon={t("icon_inventory_2", "inventory_2")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={isCommitting ? t("dossier_btn_saving", "Committing...") : t("ui_btn_commit", "Commit Changes")}
              onClick={handleCommitChanges}
              disabled={isCommitting}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeMod && (
          <ArtifactWorkspace
            mode="registry"
            activeTab={studioTab}
            onTabChange={setStudioTab}
            mod={activeMod}
            onUpdateMod={setActiveMod}
            masonId={activeMod.mason_id}
            isVerifiedMason={true}
            allMyMods={cloudMods}
            onSwitchMod={(m) => {
              const full = cloudMods.find((cm) => cm.id === m?.id) || m;
              setOriginalMod(JSON.parse(JSON.stringify(full)));
              setActiveMod(JSON.parse(JSON.stringify(full)));
            }}
            onRefreshParentList={() => {
              fetchData(true);
              fetchRelationships();
            }}
            onSaveCloudChanges={handleCommitChanges}
            isCommitting={isCommitting}
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2 shrink-0">
                <input
                  value={activeMod?.name || ""}
                  onChange={(e) => setActiveMod({ ...activeMod, name: e.target.value })}
                  placeholder={t("registry_label_name", "Display Name")}
                  className="bg-transparent text-2xl font-black text-[var(--text)] capitalize tracking-wider leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("mason", "{Mason}")}
                  </label>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown
                        value={activeMod.mason_id}
                        options={masonsList}
                        onChange={(id: string) => setActiveMod({ ...activeMod, mason_id: id })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMasonPanelOpen(true)}
                      className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] text-[var(--text)] font-black transition-all shrink-0 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("category", "Category")}
                  </label>
                  <CustomClassificationDropdown
                    value={activeMod.category_override || "Script"}
                    onChange={(newType: string) => setActiveMod({ ...activeMod, category_override: newType })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("label_file_ext", "File Extension")}
                  </label>
                  <input
                    value={activeMod.file_extension || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, file_extension: e.target.value })}
                    className="h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={activeGameSchema?.extensions?.supported?.slice(0, 2).join(", ") || t("ph_file_ext", "e.g. .bin, .dll")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_col_subcat", "Sub-category")}
                  </label>
                  <input
                    value={activeMod.sub_type || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, sub_type: e.target.value })}
                    className="h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_e_g_tuning_26", "e.g. Tuning, 2D, etc.")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_label_version", "Master Version (Latest)")}
                  </label>
                  <input
                    value={activeMod.latest_version || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, latest_version: e.target.value })}
                    placeholder={t("ph_mod_version", "e.g. 1.0, 1.1, 1.2")}
                    className="h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                  {t("upload_desc", "Description")}
                </label>
                <textarea
                  value={activeMod.description || ""}
                  onChange={(e) => setActiveMod({ ...activeMod, description: e.target.value })}
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-bold h-24 resize-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] custom-scrollbar"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  <input
                    value={activeMod.image_url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, image_url: e.target.value })}
                    className="h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_https", "https://...")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("ui_url", "URL")}
                  </label>
                  <input
                    value={activeMod.url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, url: e.target.value })}
                    className="h-11 glass-surface rounded-xl px-4 text-[var(--accent)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_https", "https://...")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SidePanelPillToggle
                  checked={activeMod.is_paid || false}
                  onChange={(checked) => setActiveMod({ ...activeMod, is_paid: checked })}
                  label={t("label_is_paid", "Paid {Mod}")}
                  icon={t("icon_monetization_on", "monetization_on")}
                  variant="warning"
                />
                <SidePanelPillToggle
                  checked={activeMod.is_early_access || false}
                  onChange={(checked) => setActiveMod({ ...activeMod, is_early_access: checked })}
                  label={t("badge_early_access", "Early Access")}
                  icon={t("icon_science", "science")}
                  variant="accent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_label_status", "Global Status")}
                  </label>
                  <CustomStatusDropdown
                    value={activeMod.status || "unverified"}
                    onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_col_safety", "Safety Rating")}
                  </label>
                  <CustomComplianceDropdown
                    value={activeMod.compliance_tier || 0}
                    onChange={(newTier: number) => setActiveMod({ ...activeMod, compliance_tier: newTier })}
                    maxTier={5}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className={`text-[9px] font-black uppercase tracking-widest ml-1 flex items-center gap-1.5 ${activeMod.status === "corrupted" || activeMod.status === "broken"
                      ? "text-[var(--danger)]"
                      : activeMod.status === "unstable"
                        ? "text-[var(--warning)]"
                        : "text-[var(--subtext)] opacity-60"
                      }`}
                  >
                    <span className="material-symbols-outlined !text-[13px]">
                      {t("icon_report_problem", "report_problem")}
                    </span>
                    {t(
                      "label_status_issue_details",
                      "Issue & Cause Details (Corrupted / Unstable)"
                    )}
                  </label>
                  {Boolean(activeMod?.id) && (
                    <button
                      type="button"
                      onClick={() =>
                        void importIssueCauseFromLabReports({
                          modId: activeMod.id,
                          currentStatus: activeMod.status,
                          onApply: (patch) =>
                            setActiveMod((prev: any) =>
                              prev ? { ...prev, ...patch } : prev
                            ),
                          labels: {
                            fixPrefix: t("fix_prefix", "Fix"),
                            notePrefix: t("tester_note_label", "Tester Note"),
                            importedToast: t(
                              "lab_issue_imported_toast",
                              "Imported issue & cause details from {Lab} diagnostic reports."
                            ),
                            emptyToast: t(
                              "lab_issue_none_found_toast",
                              "No {Lab} diagnostic reports with issue details found for this {mod}."
                            ),
                          },
                        })
                      }
                      className={`${VAULT_CHIP_CLASS} sa-glass-pill-hover cursor-pointer`}
                    >
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_science", "science")}
                      </span>
                      <span>{t("import_from_lab_reports", "Import from {Lab} Reports")}</span>
                    </button>
                  )}
                </div>
                <textarea
                  value={
                    /^\[ARCHITECT\b/i.test(String(activeMod.status_reason || "").trim())
                      ? ""
                      : activeMod.status_reason || ""
                  }
                  onChange={(e) =>
                    setActiveMod({ ...activeMod, status_reason: e.target.value })
                  }
                  placeholder={t(
                    "ph_status_issue_details",
                    "Explain what the issue is and what is causing it (shown on {Citizen} Alerts & {Mod} Dossier)..."
                  )}
                  className={`glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-semibold min-h-[76px] resize-y border focus:outline-none custom-scrollbar ${activeMod.status === "corrupted" || activeMod.status === "broken"
                    ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] focus:border-[var(--danger)]"
                    : activeMod.status === "unstable"
                      ? "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] focus:border-[var(--warning)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)]"
                    }`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("uploaded_date", "Uploaded Date")}
                  </label>
                  <div className="w-full">
                    <CustomDatePicker
                      value={activeMod.created_at || null}
                      onChange={(date: any) => setActiveMod({ ...activeMod, created_at: date })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("updated_date", "Last Updated")}
                  </label>
                  <div className="w-full">
                    <CustomDatePicker
                      value={activeMod.updated_at || null}
                      onChange={(date: any) => setActiveMod({ ...activeMod, updated_at: date })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                  {t("game_versions", "Game Versions")}
                </label>
                <GameVersionMultiSelect
                  selectedVersions={activeMod.compatible_versions || []}
                  onChange={(v: string[]) => setActiveMod({ ...activeMod, compatible_versions: v })}
                />
              </div>
            </div>
          </ArtifactWorkspace>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title", "New {Mason}")}
        icon={t("icon_person_add", "person_add")}
        widthClass="w-[450px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_person_add", "person_add")}
              tooltip={t("create_btn_create", "Create User Id")}
              onClick={handleCreateMason}
              disabled={isCreatingMason}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-2 mt-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
            {t("mason_name", "{Mason} Name")}
          </label>
          <input
            value={newMasonName}
            onChange={(e) => setNewMasonName(e.target.value)}
            placeholder={t("create_ph_name", "Enter {mason} name...")}
            className="bg-transparent text-3xl font-black text-[var(--text)] capitalize tracking-widest leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full"
          />
        </div>
      </SidePanel>
    </>
  );
}
