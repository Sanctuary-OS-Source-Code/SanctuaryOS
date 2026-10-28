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
} from "../shared";
import { ArtifactCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { logArchitectAction } from "../lib/audit";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelPillToggle,
} from "../components/layouts/ElevatedHubLayout";
import { ArtifactWorkspace, StudioTabId } from "../components/ArtifactStudioTabs";
import { fetchAllTableRows, buildFamilyHierarchy } from "../components/artifact-studio/artifactStudioUtils";

const REGISTRY_CACHE_TTL = 1000 * 60 * 10;
let registryCache: {
  cloudMods: any[] | null;
  modRelationships: any[] | null;
  masonsList: any[] | null;
  lastFetch: number;
} = {
  cloudMods: null,
  modRelationships: null,
  masonsList: null,
  lastFetch: 0,
};
let registryFetchPromise: Promise<void> | null = null;

export function prefetchArchitectRegistry(forceRefresh = false): Promise<void> {
  const isFresh =
    !forceRefresh &&
    registryCache.cloudMods &&
    registryCache.cloudMods.length > 0 &&
    performance.now() - registryCache.lastFetch < REGISTRY_CACHE_TTL;
  if (isFresh) return Promise.resolve();
  if (registryFetchPromise) return registryFetchPromise;

  registryFetchPromise = (async () => {
    try {
      const [modsData, relsData, masonsRes] = await Promise.all([
        fetchAllTableRows(
          supabase,
          "mods",
          "*, mod_versions(id, dna_hash, version_label, game_version)",
          "name",
          (firstBatch) => {
            if (!registryCache.cloudMods || registryCache.cloudMods.length === 0) {
              registryCache.cloudMods = firstBatch;
            }
          }
        ),
        fetchAllTableRows(
          supabase,
          "mod_relationships",
          "id, parent_id, child_id, relationship_type"
        ),
        supabase.from("masons").select("id, name").order("name"),
      ]);
      if (modsData) registryCache.cloudMods = modsData;
      if (relsData) registryCache.modRelationships = relsData;
      if (masonsRes?.data) registryCache.masonsList = masonsRes.data;
      registryCache.lastFetch = performance.now();
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
  const [cloudMods, setCloudMods] = useState<any[]>(() => registryCache.cloudMods || []);
  const [modRelationships, setModRelationships] = useState<any[]>(
    () => registryCache.modRelationships || []
  );
  const [groupFamilies, setGroupFamilies] = useState<boolean>(true);
  const [studioTab, setStudioTab] = useState<StudioTabId>("overview");
  const [, setTotalCount] = useState<number>(() => registryCache.cloudMods?.length || 0);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>(() => registryCache.masonsList || []);

  const [activeTab, setActiveTab] = useState<
    "overview" | "stable" | "under_review" | "pending" | "unknown" | "unstable_corrupted"
  >("overview");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");

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
      setStudioTab("overview");
      setActiveMod(initialActiveMod);
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
      Array.isArray(registryCache.cloudMods) && registryCache.cloudMods.length > 0;
    const isFresh =
      !forceRefresh &&
      hasWarmCache &&
      performance.now() - registryCache.lastFetch < REGISTRY_CACHE_TTL;

    if (hasWarmCache) {
      setCloudMods(registryCache.cloudMods!);
      setTotalCount(registryCache.cloudMods!.length);
      if (registryCache.modRelationships) setModRelationships(registryCache.modRelationships);
      if (registryCache.masonsList) setMasonsList(registryCache.masonsList);
      setIsLoading(false);
    }

    if (isFresh) return;

    if (registryFetchPromise && !forceRefresh) {
      if (!hasWarmCache) setIsLoading(true);
      await registryFetchPromise;
      if (registryCache.cloudMods) {
        setCloudMods(registryCache.cloudMods);
        setTotalCount(registryCache.cloudMods.length);
      }
      if (registryCache.modRelationships) setModRelationships(registryCache.modRelationships);
      if (registryCache.masonsList) setMasonsList(registryCache.masonsList);
      setIsLoading(false);
      return;
    }

    if (!hasWarmCache) setIsLoading(true);
    try {
      const data = await fetchAllTableRows(
        supabase,
        "mods",
        "*, mod_versions(id, dna_hash, version_label, game_version)",
        "name",
        (firstBatch, totalCount) => {
          if (!hasWarmCache) {
            setCloudMods(firstBatch);
            setTotalCount(totalCount);
            setIsLoading(false);
          }
        }
      );
      if (data) {
        registryCache.cloudMods = data;
        registryCache.lastFetch = performance.now();
        setCloudMods(data);
        setTotalCount(data.length);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    if (!registryCache.modRelationships) {
      fetchRelationships();
    }
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeTab, activeCategory, activeSubType, statusFilter, searchTerm, groupFamilies]);

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

    return baseGroupedMods.filter((mod) => {
      if (activeCategory !== "ALL") {
        if (mod.category_override !== activeCategory) return false;
        if (activeCategory === "CAS" && activeSubType !== "ALL" && mod.sub_type !== activeSubType) {
          return false;
        }
      }

      if (activeTab !== "overview") {
        if (activeTab === "unknown") {
          if (mod.status && mod.status !== "unknown" && mod.status !== "unverified") return false;
        } else if (activeTab === "unstable_corrupted") {
          if (mod.status !== "unstable" && mod.status !== "corrupted") return false;
        } else if (mod.status !== activeTab) {
          return false;
        }
      } else if (statusFilter !== "ALL") {
        if (statusFilter === "paid") {
          if (!mod.is_paid) return false;
        } else if (statusFilter === "early_access") {
          if (!mod.is_early_access) return false;
        } else if (mod.status !== statusFilter) {
          return false;
        }
      }

      if (q) {
        if (q === "nsfw") return mod.compliance_tier === 1;
        if (q === "explicit") return mod.compliance_tier === 2;

        const selfMatches =
          (mod.name || "").toLowerCase().includes(q) ||
          (mod.master_author || "").toLowerCase().includes(q);
        if (selfMatches) return true;

        // If family grouping is enabled, also match if any transitive child module matches the search!
        if (groupFamilies) {
          const childIds = childrenByRootId.get(mod.id);
          if (childIds) {
            for (const cid of childIds) {
              const cm = modById.get(cid);
              if (cm && (cm.name || "").toLowerCase().includes(q)) {
                return true;
              }
            }
          }
        }
        return false;
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
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: useStore.getState().session?.access_token || "",
        p_target: "mods",
        p_payload: {
          id: activeMod.id,
          name: activeMod.name,
          category_override: activeMod.category_override,
          sub_type: activeMod.sub_type,
          file_extension: activeMod.file_extension,
          status: activeMod.status,
          url: activeMod.url,
          image_url: activeMod.image_url,
          latest_version: activeMod.latest_version,
          description: activeMod.description,
          compatible_versions: activeMod.compatible_versions,
          family_slug: activeMod.family_slug,
          mason_id: activeMod.mason_id,
          compliance_tier: activeMod.compliance_tier,
          is_paid: activeMod.is_paid || false,
          is_early_access: activeMod.is_early_access || false,
          requiredDLC: activeMod.requiredDLC || [],
          folder_structure: activeMod.folder_structure || [],
          updated_at: new Date().toISOString(),
        },
      });

      if (!error) {
        logArchitectAction(`Updated Mod Metadata`, `mods`, activeMod.name);
        if (setStatus) setStatus(`${t("icon_check_circle", "check_circle")} [${activeMod.name}] ${t("alert_saved", "Saved successfully!")}`);
        useStore.getState().pushStatus(t("saved_success", "{Mod} Updated Successfully."), "success");
        setPage(0);
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
    setStudioTab("overview");
    setActiveMod(mod);
  };

  const renderLanding = () => {
    const issuesList = displayCloudMods.filter(
      (m) => m.status === "unstable" || m.status === "corrupted" || m.status === "under_review"
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pr-2">
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
            number: baseGroupedMods.filter((m) => m.status === "stable").length.toString(),
          },
          {
            id: "under_review",
            label: t("status_dd_review", "Under Review"),
            icon: t("icon_policy", "policy"),
            number: baseGroupedMods.filter((m) => m.status === "under_review").length.toString(),
          },
          {
            id: "pending",
            label: t("pending", "Pending"),
            icon: t("icon_schedule", "schedule"),
            number: baseGroupedMods.filter((m) => m.status === "pending").length.toString(),
          },
          {
            id: "unknown",
            label: t("unknown", "Unknown"),
            icon: t("icon_help", "help"),
            number: baseGroupedMods
              .filter((m) => m.status === "unknown" || !m.status || m.status === "unverified")
              .length.toString(),
          },
          {
            id: "unstable_corrupted",
            label: t("label_unstable", "Unstable"),
            icon: t("icon_warning", "warning"),
            number: baseGroupedMods
              .filter((m) => m.status === "unstable" || m.status === "corrupted")
              .length.toString(),
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
                content: (
                  <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("category", "Category")}
                      </span>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        disableTint={true}
                        value={activeCategory}
                        onChange={(val: string[]) => {
                          setActiveCategory(val[0]);
                          setActiveSubType("ALL");
                        }}
                        options={[
                          { id: "ALL", label: t("filter_all", "All") },
                          ...(useStore.getState().activeGameSchema?.mod_categories || []).map((c: any) => ({
                            id: c.id,
                            label: t(c.lexicon_key, c.id),
                          })),
                        ]}
                      />
                    </div>

                    {(() => {
                      const activeSchemaCategory = useStore
                        .getState()
                        .activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
                      const subcats = activeSchemaCategory?.subcategories || [];
                      if (subcats.length === 0) return null;

                      return (
                        <>
                          <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("registry_col_subcat", "Sub-category")}
                            </span>
                            <CustomDropdown
                              flat={true}
                              variant="pill"
                              disableTint={true}
                              value={activeSubType}
                              onChange={(val: string[]) => setActiveSubType(val[0])}
                              options={[
                                { id: "ALL", label: t("filter_all", "All") },
                                ...subcats.map((sub: any) => ({
                                  id: sub.id,
                                  label: t(sub.lexicon_key, sub.id),
                                })),
                              ]}
                            />
                          </div>
                        </>
                      );
                    })()}

                    <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("registry_label_status", "Global Status")}
                      </span>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        disableTint={true}
                        value={statusFilter}
                        onChange={(v: string[]) => setStatusFilter(v[0])}
                        options={[
                          { id: "ALL", label: t("status_dd_all", "All Statuses") },
                          { id: "stable", label: t("status_stable", "STABLE") },
                          { id: "unstable", label: t("label_unstable", "Unstable") },
                          { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                          { id: "under_review", label: t("status_dd_review", "Under Review") },
                          { id: "pending", label: t("pending", "Pending") },
                          { id: "unverified", label: t("unverified", "Unverified") },
                          { id: "paid", label: t("label_is_paid", "Paid {Mod}") },
                          { id: "early_access", label: t("badge_early_access", "Early Access") },
                        ]}
                      />
                    </div>

                    {(activeCategory !== "ALL" || activeSubType !== "ALL" || statusFilter !== "ALL") && (
                      <ActionButton
                        icon={t("icon_close", "close")}
                        label={t("btn_clear", "Clear Filters")}
                        onClick={() => {
                          setActiveCategory("ALL");
                          setActiveSubType("ALL");
                          setStatusFilter("ALL");
                        }}
                        className="w-full mt-2"
                        variant="danger"
                      />
                    )}
                  </div>
                ),
              }
            : undefined
        }
        className={isActiveTab ? "" : "hidden"}
      >
        {activeTab === "overview" ? renderLanding() : renderList()}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        widthClass="w-[94vw] max-w-[1280px]"
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
              setActiveMod(full);
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
                      className="h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] text-[var(--text)] font-black transition-all shrink-0 cursor-pointer"
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
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("ph_file_ext", "e.g. .package, .ts4script")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_col_subcat", "Sub-category")}
                  </label>
                  <input
                    value={activeMod.sub_type || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, sub_type: e.target.value })}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
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
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
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
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
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
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--accent)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
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
                    maxTier={4}
                  />
                </div>
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

export function CustomClassificationDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const schemaCats = activeGameSchema?.mod_categories || [];
  const hasUnknown = schemaCats.some(
    (c: any) => String(c.id).toLowerCase() === "unknown"
  );
  const options = [
    ...(!hasUnknown
      ? [{ id: "Unknown", label: t("unknown", "Unknown"), icon: t("icon_help", "help") }]
      : []),
    ...schemaCats.map((c: any) => {
      const fallbackLabel = c.label || c.name || c.id;
      const resolvedIcon = c.icon
        ? t(`icon_${c.icon}`, c.icon)
        : c.icon_key
          ? t(c.icon_key, "")
          : undefined;
      return {
        id: c.id,
        label: c.lexicon_key ? t(c.lexicon_key, fallbackLabel) : fallbackLabel,
        icon: resolvedIcon || undefined,
      };
    }),
  ];
  return (
    <CustomDropdown
      disableTint={true}
      value={value}
      options={options}
      onChange={(v: string[]) => onChange(v[0])}
      placeholder={t("category", "Category")}
    />
  );
}
