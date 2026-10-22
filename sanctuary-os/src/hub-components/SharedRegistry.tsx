import React, { useState, useEffect, useMemo } from "react";
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

export function ArchitectRegistry({
  isActiveTab = true,
  initialSearch = "",
  onClearSearch,
  initialActiveMod = null,
  onClearActiveMod,
  setStatus,
}: any = {}) {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [modRelationships, setModRelationships] = useState<any[]>([]);
  const [groupFamilies, setGroupFamilies] = useState<boolean>(true);
  const [studioTab, setStudioTab] = useState<StudioTabId>("overview");
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<
    "overview" | "stable" | "under_review" | "pending" | "unknown" | "unstable_corrupted"
  >("overview");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");

  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
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
    if (data) setModRelationships(data);
  };

  const fetchData = async (_reset = false) => {
    setIsLoading(true);
    try {
      const data = await fetchAllTableRows(
        supabase,
        "mods",
        "*, mod_versions(id, dna_hash, version_label, game_version)",
        "name"
      );
      if (data) {
        setCloudMods(data);
        setTotalCount(data.length);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    fetchRelationships();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeTab, activeCategory, activeSubType, statusFilter, searchTerm, groupFamilies]);

  useEffect(() => {
    const fetchMasons = async () => {
      const { data } = await supabase.from("masons").select("id, name").order("name");
      if (data) setMasonsList(data);
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
        if (setStatus) setStatus(`${t("icon_check_circle")} [${activeMod.name}] ${t("alert_saved")}`);
        useStore.getState().pushStatus(t("saved_success", "Saved"), "success");
        setPage(0);
        fetchData(true);
        fetchRelationships();
      } else {
        if (setStatus) setStatus(`${t("icon_block")} ${t("alert_error")} ${t(error.message)}`);
        useStore.getState().pushStatus(error.message, "error");
      }
    } catch (err: any) {
      if (setStatus) setStatus(`${t("icon_block")} ${t("alert_error")} ${t(err.message)}`);
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
          icon="schedule"
          iconColorClass="text-[var(--accent)]"
          title={t("title_recent_artifacts") || "Recent Artifacts"}
          isEmpty={displayCloudMods.length === 0}
          emptyIcon={t("icon_deployed_code")}
          emptyTitle={t("no_artifacts")}
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
          icon="warning"
          iconColorClass="text-[var(--warning)]"
          title={t("title_issues") || "Flags & Issues"}
          isEmpty={issuesList.length === 0}
          emptyIcon="check_circle"
          emptyTitle={t("no_issues") || "No issues detected"}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pr-2">
        {visibleCloudMods.length === 0 ? (
          <EmptyState
            icon={searchTerm ? "search_off" : t("icon_inventory_2")}
            title={searchTerm ? t("no_matches") : t("no_artifacts")}
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
                <span className="material-symbols-outlined animate-spin !text-[16px]">{t("icon_sync")}</span>{" "}
                {t("ui_loading")}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-[16px]">{t("icon_expand_more")}</span>{" "}
                {t("ui_btn_load_more")}
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
        headerTitle={t("items") || "Artifact Registry"}
        headerIcon="inventory_2"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_queue") as string}
        tabs={[
          {
            id: "overview",
            label: t("landing_overview") || "Overview",
            icon: "dashboard",
            number: baseGroupedMods.length.toString(),
          },
          {
            id: "stable",
            label: t("status_tag_stable") || "Stable",
            icon: "verified",
            number: baseGroupedMods.filter((m) => m.status === "stable").length.toString(),
          },
          {
            id: "under_review",
            label: t("status_tag_under_review") || "Under Review",
            icon: "policy",
            number: baseGroupedMods.filter((m) => m.status === "under_review").length.toString(),
          },
          {
            id: "pending",
            label: t("status_tag_pending") || "Pending",
            icon: "schedule",
            number: baseGroupedMods.filter((m) => m.status === "pending").length.toString(),
          },
          {
            id: "unknown",
            label: t("status_tag_unknown") || "Unknown",
            icon: "help",
            number: baseGroupedMods
              .filter((m) => m.status === "unknown" || !m.status || m.status === "unverified")
              .length.toString(),
          },
          {
            id: "unstable_corrupted",
            label: t("status_tag_unstable") || "Unstable & Corrupted",
            icon: "warning",
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
            icon: groupFamilies ? "account_tree" : "view_module",
            label: groupFamilies
              ? t("studio_group_families", "Group Mod Families")
              : t("studio_flat_list", "Flat List"),
            onClick: () => setGroupFamilies(!groupFamilies),
          },
        ]}
        primaryPopover={
          activeTab !== "overview"
            ? {
                icon: "tune",
                label: t("filters") || "Filters",
                content: (
                  <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("category") || "Category"}
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
                          { id: "ALL", label: t("ql_all") || "All" },
                          ...(useStore.getState().activeGameSchema?.mod_categories || []).map((c: any) => ({
                            id: c.id,
                            label: t(c.lexicon_key) || c.id,
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
                              {t("registry_col_subcat") || "Subcategory"}
                            </span>
                            <CustomDropdown
                              flat={true}
                              variant="pill"
                              disableTint={true}
                              value={activeSubType}
                              onChange={(val: string[]) => setActiveSubType(val[0])}
                              options={[
                                { id: "ALL", label: t("ql_all") || "All" },
                                ...subcats.map((sub: any) => ({
                                  id: sub.id,
                                  label: t(sub.lexicon_key) || sub.id,
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
                        {t("registry_label_status") || "Status"}
                      </span>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        disableTint={true}
                        value={statusFilter}
                        onChange={(v: string[]) => setStatusFilter(v[0])}
                        options={[
                          { id: "ALL", label: t("status_dd_all") || "All" },
                          { id: "stable", label: t("status_dd_stable") || "Stable" },
                          { id: "unstable", label: t("label_unstable") || "Unstable" },
                          { id: "corrupted", label: t("status_corrupted") || "Corrupted" },
                          { id: "under_review", label: t("status_dd_review") || "Under Review" },
                          { id: "pending", label: t("pending") || "Pending" },
                          { id: "unverified", label: t("unverified") || "Unverified" },
                          { id: "paid", label: t("label_is_paid") || "Paid" },
                          { id: "early_access", label: t("label_is_early_access") || "Early Access" },
                        ]}
                      />
                    </div>

                    {(activeCategory !== "ALL" || activeSubType !== "ALL" || statusFilter !== "ALL") && (
                      <ActionButton
                        icon="close"
                        label={t("btn_clear") || "Clear Filters"}
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
        title={t("ui_edit_metadata")}
        subtitle={`UUID: ${activeMod?.id}`}
        icon={t("icon_inventory_2")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="save"
              tooltip={isCommitting ? t("dossier_btn_saving") : t("ui_btn_commit")}
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
                  placeholder={t("registry_label_name")}
                  className="bg-transparent text-2xl font-black text-[var(--text)] capitalize tracking-wider leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("mason")}
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
                    {t("category")}
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
                    {t("label_file_ext")}
                  </label>
                  <input
                    value={activeMod.file_extension || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, file_extension: e.target.value })}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("ph_file_ext")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_col_subcat")}
                  </label>
                  <input
                    value={activeMod.sub_type || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, sub_type: e.target.value })}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_e_g_tuning_26")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_label_version")}
                  </label>
                  <input
                    value={activeMod.latest_version || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, latest_version: e.target.value })}
                    placeholder={t("ph_mod_version")}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                  {t("upload_desc")}
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
                    {t("cc_cover_url")}
                  </label>
                  <input
                    value={activeMod.image_url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, image_url: e.target.value })}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_https")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_label_url")}
                  </label>
                  <input
                    value={activeMod.url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, url: e.target.value })}
                    className="h-12 glass-surface rounded-[var(--radius)] px-4 text-[var(--accent)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_https")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SidePanelPillToggle
                  checked={activeMod.is_paid || false}
                  onChange={(checked) => setActiveMod({ ...activeMod, is_paid: checked })}
                  label={t("label_is_paid")}
                  icon="monetization_on"
                  variant="warning"
                />
                <SidePanelPillToggle
                  checked={activeMod.is_early_access || false}
                  onChange={(checked) => setActiveMod({ ...activeMod, is_early_access: checked })}
                  label={t("label_is_early_access")}
                  icon={t("icon_science")}
                  variant="accent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_label_status")}
                  </label>
                  <CustomStatusDropdown
                    value={activeMod.status || "unverified"}
                    onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">
                    {t("registry_col_safety")}
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
                    {t("uploaded_date")}
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
                    {t("updated_date")}
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
                  {t("game_versions")}
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
        title={t("create_title")}
        icon="person_add"
        widthClass="w-[450px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="person_add"
              tooltip={t("create_btn_create")}
              onClick={handleCreateMason}
              disabled={isCreatingMason}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-2 mt-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
            {t("mason_name")}
          </label>
          <input
            value={newMasonName}
            onChange={(e) => setNewMasonName(e.target.value)}
            placeholder={t("create_ph_name")}
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
  const options = [
    { id: "Unknown", label: t("ui_icon_unknown") },
    ...(activeGameSchema?.mod_categories || []).map((c: any) => ({
      id: c.id,
      label: t(c.lexicon_key) || c.id,
    })),
  ];
  return (
    <CustomDropdown
      disableTint={true}
      value={value}
      options={options}
      onChange={(v: string[]) => onChange(v[0])}
      placeholder={t("category")}
    />
  );
}
