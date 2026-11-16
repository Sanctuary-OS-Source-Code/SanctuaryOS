import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  EmptyState,
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  ActionPill,
  UniversalGroup,
  SidePanelHeroCard,
  SidePanelTitleInput,
  CustomDropdown,
  openModDossier,
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import { fetchAllTableRows } from "../components/artifact-studio/artifactStudioUtils";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";

const COLLECTION_MEMBER_SELECT =
  "id, set_id, mod_id, dna_hash, mods(id, name, image_url, status, category_override, sub_type, latest_version, created_at, updated_at, url, mason_id, master_author, file_extension, compliance_tier, has_pending_flag, mod_versions(id, dna_hash))";

function extractTier0MemberMod(row: any) {
  const raw = Array.isArray(row?.mods) ? row.mods[0] : row?.mods;
  if (!raw?.id || Number(raw.compliance_tier ?? 0) !== 0 || raw.has_pending_flag === true) {
    return null;
  }
  const versionHash = Array.isArray(raw?.mod_versions) ? raw.mod_versions[0]?.dna_hash : undefined;
  return {
    ...raw,
    dna_hash: versionHash || row?.dna_hash || undefined,
  };
}

function hasCollectionMemberIssue(mod: any): boolean {
  const st = String(mod?.status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
  return (
    st === "corrupted" ||
    st === "broken" ||
    st === "unstable" ||
    st === "under review" ||
    st === "rejected"
  );
}

function isUnknownModStatus(status?: string | null): boolean {
  const normalized = String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
  return !normalized || normalized === "unknown" || normalized === "unverified";
}

function hydrateSetsWithTier0Members(setsData: any[], memberRows: any[]): any[] {
  const bySetId = new Map<string, any[]>();
  for (const row of memberRows || []) {
    const modRow = extractTier0MemberMod(row);
    if (!modRow || !row?.set_id) continue;
    const key = String(row.set_id);
    if (!bySetId.has(key)) bySetId.set(key, []);
    bySetId.get(key)!.push({ ...row, mods: modRow });
  }
  return (setsData || []).map((s: any) => {
    const rows = bySetId.get(String(s.id)) || [];
    const mods = rows.map((r) => r.mods);
    const issueCount = mods.filter(hasCollectionMemberIssue).length;
    return {
      ...s,
      _memberRows: rows,
      _members: mods,
      _memberCount: mods.length,
      _issueCount: issueCount,
    };
  });
}

async function fetchTier0CollectionMemberRows(setIds: string[]): Promise<any[]> {
  if (!setIds || setIds.length === 0) return [];
  const allRows: any[] = [];
  const chunkSize = 150;
  for (let i = 0; i < setIds.length; i += chunkSize) {
    const chunk = setIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from("collection_members")
      .select(COLLECTION_MEMBER_SELECT)
      .in("set_id", chunk);
    if (Array.isArray(data)) allRows.push(...data);
  }
  return allRows;
}

function matchesCollectionSearch(setItem: any, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const mason = Array.isArray(setItem?.masons) ? setItem.masons[0]?.name : setItem?.masons?.name;
  if ((setItem?.name || "").toLowerCase().includes(q)) return true;
  if ((mason || "").toLowerCase().includes(q)) return true;
  return Array.isArray(setItem?._members)
    ? setItem._members.some((m: any) => (m?.name || "").toLowerCase().includes(q))
    : false;
}

function filterCollectionMembers(
  rows: any[],
  query: string,
  categoryFilter: string,
  statusFilter: string,
  masonsList: any[] = [],
  masonFallback = ""
): any[] {
  const q = query.trim().toLowerCase();
  return (rows || []).filter((row) => {
    const mod = row?.mods;
    if (!mod) return false;
    if (categoryFilter !== "ALL") {
      if (String(mod.category_override || "").toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
    }
    if (statusFilter === "issues" && !hasCollectionMemberIssue(mod)) return false;
    if (statusFilter === "stable" && hasCollectionMemberIssue(mod)) return false;
    if (q) {
      const mAuthor =
        masonsList.find((m) => m.id === mod.mason_id)?.name ||
        mod.master_author ||
        masonFallback;
      return (
        String(mod.name || "").toLowerCase().includes(q) ||
        String(mAuthor || "").toLowerCase().includes(q)
      );
    }
    return true;
  });
}

function CollectionMembersFilterContent({
  membersList,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
}: {
  membersList: any[];
  categoryFilter: string;
  onCategoryChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
}) {
  const { t } = useLexicon();
  const categories = Array.from(
    new Set(
      (membersList || [])
        .map((m: any) => String(m?.mods?.category_override || "").trim())
        .filter((c) => c && c.toLowerCase() !== "unknown")
    )
  ).sort((a, b) => a.localeCompare(b));

  const renderGridSection = (
    title: string,
    value: string,
    onChange: (val: string) => void,
    options: Array<{ id: string; label: string }>
  ) => (
    <div className="flex flex-col w-full">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 mb-2 px-1 flex items-center gap-2">
        <span className="text-[var(--text)] opacity-90">{title}</span>
        <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
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
    <div className="flex flex-col w-[340px] max-w-[calc(100vw-40px)] p-4 gap-4 text-left">
      {categories.length > 0 &&
        renderGridSection(
          t("filter_category", "Filter Category"),
          categoryFilter,
          onCategoryChange,
          [
            { id: "ALL", label: t("filter_all", "All") },
            ...categories.map((c) => ({ id: c, label: c })),
          ]
        )}
      {renderGridSection(t("filter_status", "Filter Status"), statusFilter, onStatusChange, [
        { id: "ALL", label: t("filter_all", "All") },
        { id: "stable", label: t("status_stable", "Stable") },
        { id: "issues", label: t("title_issues", "Issues") },
      ])}
      {(categoryFilter !== "ALL" || statusFilter !== "ALL") && (
        <ActionButton
          icon={t("icon_close", "close")}
          label={t("btn_clear", "Clear Filters")}
          onClick={() => {
            onCategoryChange("ALL");
            onStatusChange("ALL");
          }}
          className="w-full"
          variant="danger"
        />
      )}
    </div>
  );
}

function CollectionCreateLeadCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useLexicon();
  return (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--accent)"
      iconColorClass="text-[var(--accent)]"
      badgeIcon={t("icon_collections_bookmark", "collections_bookmark")}
      badgeLabel={t("collections", "Collections")}
      overline={t("collections", "Collections")}
      title={t("forge_init_set", "Create Collection")}
      description={t(
        "collection_create_card_desc",
        "Group related {mods} into a curated collection pack for {Citizens}."
      )}
      actionLabel={t("forge_init_set", "Create Collection")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={onCreate}
      onClick={onCreate}
    />
  );
}

function CollectionAddAssetLeadCard({
  options,
  searchPlaceholder,
  onSelectMod,
}: {
  options: any[];
  searchPlaceholder: string;
  onSelectMod: (modId: string) => void;
}) {
  const { t } = useLexicon();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--accent)"
      iconColorClass="text-[var(--accent)]"
      badgeIcon={t("icon_inventory_2", "inventory_2")}
      badgeLabel={`${options.length} ${options.length === 1 ? t("term_mod", "{Mod}") : t("term_mods", "{Mods}")}`}
      overline={t("registry_assets_title", "Included Assets")}
      title={t("collection_add_card_title", "Add {Mod}")}
      description={t(
        "collection_add_card_desc",
        "Select verified {mods} to include in this collection."
      )}
      onClick={() => triggerRef.current?.click()}
      footer={
        <CustomDropdown
          triggerRef={triggerRef}
          value=""
          searchable={true}
          disableTint={true}
          centeredTrigger={true}
          matchTriggerWidth={true}
          className="w-full h-10"
          buttonClassName="!px-4 !rounded-xl !text-xs !font-black sa-glass-pill-hover"
          searchPlaceholder={searchPlaceholder}
          displayLabel={
            <span className="inline-flex items-center gap-2 text-[var(--text)] font-black">
              <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] normal-case">
                {t("icon_add", "add")}
              </span>
              <span>{t("collection_add_card_title", "Add {Mod}")}</span>
            </span>
          }
          options={options}
          onChange={(vals: string[]) => {
            const selectedId = vals?.[0];
            if (selectedId) onSelectMod(selectedId);
          }}
        />
      }
    />
  );
}

export function MasonCollectionBuilder({
  masonId,
  masonName,
}: {
  masonId: string;
  masonName: string;
}) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [myMods, setMyMods] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [memberCategoryFilter, setMemberCategoryFilter] = useState("ALL");
  const [memberStatusFilter, setMemberStatusFilter] = useState("ALL");
  const [newSetName, setNewSetName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "all" | "issues" | "empty">("overview");

  const fetchSets = async () => {
    const { data } = await supabase
      .from("collections")
      .select("*, masons(name)")
      .eq("mason_id", masonId)
      .order("name");
    if (data) {
      const validSets = data.filter(
        (s: any) => Number(s?.compliance_tier ?? 0) === 0 && s?.has_pending_flag !== true
      );
      const memberRows = await fetchTier0CollectionMemberRows(validSets.map((s: any) => s.id));
      const hydrated = hydrateSetsWithTier0Members(validSets, memberRows);
      setSets(hydrated);
    }
  };

  const fetchMyMods = async () => {
    const { data } = await supabase
      .from("mods")
      .select("id, name, image_url, status, category_override, master_author, compliance_tier, has_pending_flag")
      .eq("mason_id", masonId)
      .order("name");
    if (data) {
      setMyMods(
        data.filter(
          (m: any) =>
            Boolean(m?.id) &&
            Number(m?.compliance_tier ?? 0) === 0 &&
            m?.has_pending_flag !== true &&
            !isUnknownModStatus(m?.status)
        )
      );
    }
  };

  const fetchMembers = async (setId: string) => {
    const { data } = await supabase
      .from("collection_members")
      .select(COLLECTION_MEMBER_SELECT)
      .eq("set_id", setId);
    if (data) {
      const normalized = data
        .map((row: any) => {
          const modRow = extractTier0MemberMod(row);
          return modRow ? { ...row, mods: modRow } : null;
        })
        .filter(Boolean);
      setMembers(normalized);
    }
  };

  useEffect(() => {
    fetchSets();
    fetchMyMods();
  }, []);

  const handleCreateSet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSetName.trim()) return;
    const payload = {
      name: newSetName.trim(),
      mason_id: masonId,
      is_official: true,
      compliance_tier: 0,
      status: "stable",
    };
    const { data, error } = await supabase
      .from("collections")
      .insert([payload])
      .select("*, masons(name)")
      .single();

    if (!error && data) {
      logArchitectAction(
        "Created Collection",
        "collections",
        payload.name,
        undefined,
        "Mason Workshop",
        false,
        computeAuditDiff(null, payload)
      );
      const enriched = { ...data, _memberRows: [], _members: [], _memberCount: 0, _issueCount: 0 };
      setSets((prev) => [...prev, enriched].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSetName("");
      setIsForgePanelOpen(false);
    }
  };

  const handleSaveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const prevSet = sets.find((s) => s.id === activeSet.id) || activeSet;
    const updatedPayload = {
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      status: activeSet.status || "stable",
      compliance_tier: 0,
    };
    const { error } = await supabase
      .from("collections")
      .update(updatedPayload)
      .eq("id", activeSet.id);
    if (!error) {
      logArchitectAction(
        "Updated Collection Metadata",
        "collections",
        activeSet.name,
        undefined,
        "Mason Workshop",
        false,
        computeAuditDiff(prevSet, updatedPayload)
      );
    }
    await fetchSets();
    setIsSaving(false);
    if (!error) {
      useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
    } else {
      useStore
        .getState()
        .pushStatus(`${t("alert_error", "Error:")} ${error.message}`, "error");
    }
  };

  const handleAddMod = async (modId: string) => {
    if (!activeSet) return;
    await supabase
      .from("collection_members")
      .upsert({ set_id: activeSet.id, mod_id: modId });
    logArchitectAction(
      `Added Mod ID ${modId} to Collection`,
      "collections",
      activeSet.name,
      undefined,
      "Mason Workshop",
      false,
      {
        collection: { to: activeSet.name },
        added_mod_id: { to: modId },
      }
    );
    await Promise.all([fetchMembers(activeSet.id), fetchSets()]);
  };

  const handleRemoveMod = async (memberId: string) => {
    await supabase.from("collection_members").delete().eq("id", memberId);
    if (activeSet) {
      logArchitectAction(
        `Removed Mod from Collection`,
        "collections",
        activeSet.name,
        undefined,
        "Mason Workshop",
        false,
        {
          collection: { from: activeSet.name, to: activeSet.name },
          removed_member_id: { from: memberId, to: "Removed" },
        }
      );
      await Promise.all([fetchMembers(activeSet.id), fetchSets()]);
    }
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const { error: err1 } = await supabase
      .from("collection_members")
      .delete()
      .eq("set_id", activeSet.id);
    const { error: err2 } = await supabase
      .from("collections")
      .delete()
      .eq("id", activeSet.id);
    if (!err1 && !err2) {
      logArchitectAction(
        "Deleted Collection",
        "collections",
        activeSet.name,
        undefined,
        "Mason Workshop",
        false,
        {
          name: { from: activeSet.name, to: "Deleted" },
          status: { from: activeSet.status || "active", to: "deleted" },
        }
      );
    }
    setActiveSet(null);
    setMembers([]);
    fetchSets();
    setIsSaving(false);
    if (!err1 && !err2) {
      useStore.getState().pushStatus(t("alert_deleted", "Deleted"), "success");
    } else {
      useStore
        .getState()
        .pushStatus(
          `${t("alert_error", "Error:")} ${err1?.message || err2?.message}`,
          "error"
        );
    }
  };

  const filteredSets = sets.filter((s: any) => {
    if (activeTab === "issues" && (s._issueCount || 0) === 0) {
      return false;
    }
    if (activeTab === "empty" && (s._memberCount || 0) > 0) {
      return false;
    }
    return matchesCollectionSearch(s, searchTerm);
  });

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      colorClass: "text-[var(--accent)]",
      number: sets.length.toString(),
    },
    {
      id: "all",
      label: t("collections", "Collections"),
      icon: t("icon_collections_bookmark", "collections_bookmark"),
      number: sets.length.toString(),
    },
    {
      id: "issues",
      label: t("title_issues", "Issues"),
      icon: t("icon_warning", "warning"),
      colorClass: "text-[var(--warning)]",
      number: sets.filter((s) => (s._issueCount || 0) > 0).length.toString(),
    },
    {
      id: "empty",
      label: t("status_empty", "Empty"),
      icon: t("icon_inventory_2", "inventory_2"),
      colorClass: "text-[var(--subtext)]",
      number: sets.filter((s) => (s._memberCount || 0) === 0).length.toString(),
    },
  ];

  const handleOpenSet = (setItem: any) => {
    setActiveSet(setItem);
    setMemberFilter("");
    setMemberCategoryFilter("ALL");
    setMemberStatusFilter("ALL");
    if (Array.isArray(setItem?._memberRows)) {
      setMembers(setItem._memberRows);
    }
    fetchMembers(setItem.id);
  };

  const renderLanding = () => {
    const recentSets = [...sets]
      .sort(
        (a, b) =>
          new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      )
      .slice(0, 3);
    const flaggedSets = sets
      .filter((s) => (s._issueCount || 0) > 0)
      .slice(0, 4);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_history", "history")}
          iconColorClass="text-[var(--accent)]"
          title={t("recent_activity", "Recent Activity")}
          isEmpty={false}
        >
          <CollectionCreateLeadCard onCreate={() => setIsForgePanelOpen(true)} />
          {recentSets.map((setItem) => (
            <VaultCard
              key={setItem.id}
              setItem={setItem}
              activeSetId={activeSet?.id}
              onClick={() => handleOpenSet(setItem)}
              masonNameFallback={masonName}
            />
          ))}
        </HubOverviewSection>
        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("title_issues", "Issues")}
          isEmpty={flaggedSets.length === 0}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "No Issues")}
        >
          {flaggedSets.map((setItem) => (
            <VaultCard
              key={setItem.id}
              setItem={setItem}
              activeSetId={activeSet?.id}
              onClick={() => handleOpenSet(setItem)}
              masonNameFallback={masonName}
            />
          ))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => {
    const hasSearch = Boolean(searchTerm.trim());
    const showCreateLead = activeTab === "all" && !hasSearch;
    const showEmptyState = (activeTab !== "all" || hasSearch) && filteredSets.length === 0;
    return (
      <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start">
          {showCreateLead && (
            <CollectionCreateLeadCard onCreate={() => setIsForgePanelOpen(true)} />
          )}
          {showEmptyState ? (
            <EmptyState
              icon={hasSearch ? t("icon_search_off", "search_off") : t("icon_collections_bookmark", "collections_bookmark")}
              title={hasSearch ? t("no_matches", "No matches found") : t("cc_no_sets", "No collections found")}
              className="col-span-full py-16"
            />
          ) : (
            filteredSets.map((setItem) => (
              <VaultCard
                key={setItem.id}
                setItem={setItem}
                activeSetId={activeSet?.id}
                onClick={() => handleOpenSet(setItem)}
                masonNameFallback={masonName}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  const visibleMembers = filterCollectionMembers(
    members,
    memberFilter,
    memberCategoryFilter,
    memberStatusFilter,
    [{ id: masonId, name: masonName }],
    masonName
  );
  const hasActiveMemberFilter = Boolean(
    memberFilter.trim() || memberCategoryFilter !== "ALL" || memberStatusFilter !== "ALL"
  );

  const addableMyModOptions = useMemo(() => {
    const memberIds = new Set((members || []).map((mem: any) => String(mem?.mod_id || "")));
    const invIcon = t("icon_inventory_2", "inventory_2");
    return (myMods || [])
      .filter((m: any) => m?.id && !memberIds.has(String(m.id)))
      .map((m: any) => {
        const authorLabel = masonName || m.master_author || "";
        return {
          id: m.id,
          label: m.name,
          badge: authorLabel || undefined,
          icon: invIcon,
          searchText: `${m.name || ""} ${authorLabel} ${m.category_override || ""}`.trim(),
        };
      });
  }, [myMods, members, masonName, t]);

  return (
    <ElevatedHubLayout
      headerTitle={t("collections", "Collections")}
      headerIcon={t("icon_collections_bookmark", "collections_bookmark")}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("search_ph", "Search {mods}...") as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      hideSearch={activeTab === "overview"}
    >
      {activeTab === "overview" ? renderLanding() : renderList()}

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_init_set", "Create Collection")}
        subtitle={t("create_subtitle", "Create a new collection")}
        icon={t("icon_add_circle", "add_circle")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[600px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              tooltip={t("forge_init_set", "Create Collection")}
              onClick={handleCreateSet}
              disabled={!newSetName.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_tune", "tune")}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                {t("ph_collection_name", "Collection Name")}
              </label>
              <input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSetName.trim()) {
                    void handleCreateSet(e);
                  }
                }}
                placeholder={t("ph_collection_name", "Collection Name")}
                className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={activeSet?.name || t("manage_collection", "Manage Collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon={t("icon_library_books", "library_books")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[880px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_delete", "delete")}
              tooltip={t("btn_delete", "{Delete}")}
              onClick={handleDeleteSet}
              disabled={isSaving}
              variant="danger"
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={
                isSaving ? t("btn_saving", "Saving...") : t("cc_save_set", "Save")
              }
              onClick={handleSaveSetMeta}
              disabled={isSaving}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeSet && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <UniversalGroup
              title={t("tab_metadata", "Metadata & Telemetry")}
              icon={t("icon_tune", "tune")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ph_collection_name", "Collection Name")}
                  </label>
                  <input
                    value={activeSet.name || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, name: e.target.value })
                    }
                    placeholder={t("ph_collection_name", "Collection Name")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  <input
                    value={activeSet.image_url || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, image_url: e.target.value })
                    }
                    placeholder={t("cc_cover_url", "Cover Image URL")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ui_url", "URL")}
                  </label>
                  <input
                    value={activeSet.url || ""}
                    onChange={(e) => setActiveSet({ ...activeSet, url: e.target.value })}
                    placeholder={t("external_url_placeholder", "https://...")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("registry_assets_title", "Included Assets")}
              count={members.length}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="flex flex-col gap-3.5">
                {members.length > 0 && (
                  <ActionPill
                    searchQuery={memberFilter}
                    setSearchQuery={setMemberFilter}
                    searchPlaceholder={t("search_ph", "Search {mods}...")}
                    primaryPopover={{
                      icon: t("icon_tune", "tune"),
                      label: t("filters", "Filters"),
                      isActive: memberCategoryFilter !== "ALL" || memberStatusFilter !== "ALL",
                      content: (
                        <CollectionMembersFilterContent
                          membersList={members}
                          categoryFilter={memberCategoryFilter}
                          onCategoryChange={setMemberCategoryFilter}
                          statusFilter={memberStatusFilter}
                          onStatusChange={setMemberStatusFilter}
                        />
                      ),
                    }}
                  />
                )}

                {hasActiveMemberFilter && visibleMembers.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_matches", "No matches found")}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!hasActiveMemberFilter && (
                      <CollectionAddAssetLeadCard
                        options={addableMyModOptions}
                        searchPlaceholder={t("link_search", "Search your {mods}...")}
                        onSelectMod={handleAddMod}
                      />
                    )}
                    {visibleMembers.map((mem) => (
                      <ArtifactCard
                        key={mem.id}
                        mod={mem.mods}
                        layout="vertical"
                        masonsList={[{ id: masonId, name: masonName }]}
                        overrideActionLabel={t("btn_inspect", "Inspect {Mod}")}
                        onClick={() => openModDossier({ ...mem.mods, isNexusView: true })}
                        onRemove={() => handleRemoveMod(mem.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </ElevatedHubLayout>
  );
}

export function CollectionForge({ setStatus }: any) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [setName, setSetName] = useState("");
  const [setMasonId, setSetMasonId] = useState("");
  const [setSetUrl, setSetSetUrl] = useState("");

  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<
    "overview" | "all" | "issues" | "empty"
  >("overview");

  const [isSaving, setIsSaving] = useState(false);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [memberCategoryFilter, setMemberCategoryFilter] = useState("ALL");
  const [memberStatusFilter, setMemberStatusFilter] = useState("ALL");
  const [catalogMods, setCatalogMods] = useState<any[]>([]);

  const fetchSets = async () => {
    const { data } = await supabase
      .from("collections")
      .select("*, masons(name)")
      .order("name");
    if (data) {
      const validSets = data.filter(
        (s: any) => Number(s?.compliance_tier ?? 0) === 0 && s?.has_pending_flag !== true
      );
      const memberRows = await fetchTier0CollectionMemberRows(validSets.map((s: any) => s.id));
      const hydrated = hydrateSetsWithTier0Members(validSets, memberRows);
      setSets(hydrated);
    }
  };

  const fetchManifest = async (setId: string) => {
    const { data } = await supabase
      .from("collection_members")
      .select(COLLECTION_MEMBER_SELECT)
      .eq("set_id", setId);
    if (data) {
      const normalized = data
        .map((row: any) => {
          const modRow = extractTier0MemberMod(row);
          return modRow ? { ...row, mods: modRow } : null;
        })
        .filter(Boolean);
      setManifestMembers(normalized);
    }
  };

  const fetchCatalogMods = async () => {
    const rows = await fetchAllTableRows(
      supabase,
      "mods",
      "id, name, status, master_author, mason_id, category_override, compliance_tier, has_pending_flag",
      "name"
    );
    setCatalogMods(
      (rows || []).filter(
        (m: any) =>
          Boolean(m?.id) &&
          Number(m?.compliance_tier ?? 0) === 0 &&
          m?.has_pending_flag !== true &&
          !isUnknownModStatus(m?.status)
      )
    );
  };

  useEffect(() => {
    fetchSets();
    fetchCatalogMods();
    const fetchMasons = async () => {
      const { data } = await supabase.from("masons").select("id, name").order("name");
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

  const handleSelectSet = (setItem: any) => {
    setActiveSet(setItem);
    setMemberFilter("");
    setMemberCategoryFilter("ALL");
    setMemberStatusFilter("ALL");
    if (Array.isArray(setItem?._memberRows)) {
      setManifestMembers(setItem._memberRows);
    }
    fetchManifest(setItem.id);
  };

  const createSet = async () => {
    if (!setName.trim()) return;
    const payload: any = {
      name: setName.trim(),
      is_official: true,
      compliance_tier: 0,
      status: "stable",
      mason_id: setMasonId && setMasonId.trim() !== "" ? setMasonId : null,
      url: setSetUrl && setSetUrl.trim() !== "" ? setSetUrl : null,
    };

    const { data, error } = await supabase
      .from("collections")
      .insert([payload])
      .select("*, masons(name)")
      .single();
    if (!error && data) {
      logArchitectAction(
        "Created Collection",
        "collections",
        setName,
        undefined,
        undefined,
        false,
        computeAuditDiff(null, payload)
      );
      const enriched = { ...data, _memberRows: [], _members: [], _memberCount: 0, _issueCount: 0 };
      setSets([...sets, enriched].sort((a, b) => a.name.localeCompare(b.name)));
      setSetName("");
      setSetMasonId("");
      setSetSetUrl("");
      setIsForgePanelOpen(false);
    }
  };

  const saveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const prevSet = sets.find((s) => s.id === activeSet.id) || activeSet;
    const updatedPayload = {
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      mason_id: activeSet.mason_id,
      status: activeSet.status || "stable",
      compliance_tier: 0,
    };
    const { error } = await supabase
      .from("collections")
      .update(updatedPayload)
      .eq("id", activeSet.id);

    if (!error) {
      logArchitectAction(
        "Updated Collection Metadata",
        "collections",
        activeSet.name,
        undefined,
        undefined,
        false,
        computeAuditDiff(prevSet, updatedPayload)
      );
      await fetchSets();
      if (setStatus)
        setStatus(
          `${t("icon_check_circle", "check_circle")} [${activeSet.name}] ${t(
            "alert_saved",
            "Saved"
          )}`
        );
    } else {
      if (setStatus)
        setStatus(
          `${t("icon_block", "block")} ${t("alert_error", "Error:")} ${
            t(error.message, error.message)
          }`
        );
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const addToManifest = async (modId: string) => {
    if (!activeSet) return;
    await supabase
      .from("collection_members")
      .upsert({ set_id: activeSet.id, mod_id: modId });
    logArchitectAction(
      `Added Mod ID ${modId} to Collection`,
      "collections",
      activeSet.name,
      undefined,
      undefined,
      false,
      {
        collection: { to: activeSet.name },
        added_mod_id: { to: modId },
      }
    );
    await Promise.all([fetchManifest(activeSet.id), fetchSets()]);
  };

  const removeFromManifest = async (memberId: string, modName: string) => {
    await supabase.from("collection_members").delete().eq("id", memberId);
    if (activeSet) {
      logArchitectAction(
        `Removed Mod ${modName} from Collection`,
        "collections",
        activeSet.name,
        undefined,
        undefined,
        false,
        {
          collection: { from: activeSet.name, to: activeSet.name },
          removed_mod: { from: modName, to: "Removed" },
        }
      );
      await Promise.all([fetchManifest(activeSet.id), fetchSets()]);
    }
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    await supabase.from("collection_members").delete().eq("set_id", activeSet.id);
    await supabase.from("collections").delete().eq("id", activeSet.id);
    logArchitectAction(
      `Deleted Collection`,
      "collections",
      activeSet.name,
      undefined,
      undefined,
      false,
      {
        name: { from: activeSet.name, to: "Deleted" },
        status: { from: activeSet.status || "active", to: "deleted" },
      }
    );
    setActiveSet(null);
    setManifestMembers([]);
    fetchSets();
    setIsSaving(false);
  };

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase
      .from("masons")
      .insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      setMasonsList((prev) =>
        [...prev, { id: newId, name: newMasonName }].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );
      setSetMasonId(newId);
      if (activeSet) setActiveSet({ ...activeSet, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const filteredSets = sets.filter((s: any) => {
    if (Number(s?.compliance_tier ?? 0) > 0) return false;
    if (filterTab === "issues" && (s._issueCount || 0) === 0) return false;
    if (filterTab === "empty" && (s._memberCount || 0) > 0) return false;
    return matchesCollectionSearch(s, searchTerm);
  });

  const recentSets = [...sets]
    .sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    )
    .slice(0, 3);

  const flaggedSets = sets
    .filter((s) => (s._issueCount || 0) > 0)
    .slice(0, 4);

  const visibleManifestMembers = filterCollectionMembers(
    manifestMembers,
    memberFilter,
    memberCategoryFilter,
    memberStatusFilter,
    masonsList
  );
  const hasActiveManifestFilter = Boolean(
    memberFilter.trim() || memberCategoryFilter !== "ALL" || memberStatusFilter !== "ALL"
  );

  const addableCatalogOptions = useMemo(() => {
    const manifestMemberIds = new Set(
      (manifestMembers || []).map((m: any) => String(m?.mod_id || ""))
    );
    const masonLookup = new Map(
      (masonsList || []).map((m: any) => [String(m.id), String(m.name || "")])
    );
    const invIcon = t("icon_inventory_2", "inventory_2");
    return (catalogMods || [])
      .filter((asset: any) => asset?.id && !manifestMemberIds.has(String(asset.id)))
      .map((asset: any) => {
        const authorLabel =
          (asset.mason_id && masonLookup.get(String(asset.mason_id))) ||
          asset.master_author ||
          "";
        return {
          id: asset.id,
          label: asset.name,
          badge: authorLabel || undefined,
          icon: invIcon,
          searchText: `${asset.name || ""} ${authorLabel} ${asset.category_override || ""}`.trim(),
        };
      });
  }, [catalogMods, manifestMembers, masonsList, t]);

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("collections", "Collections")}
        headerSubtitle={t(
          "architect_collections_desc",
          "Registry review, metadata governance, and conflict triage"
        )}
        headerIcon={t("icon_folder", "folder")}
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_queue", "Search collections...") as string}
        activeTab={filterTab}
        onTabChange={(tabId) => setFilterTab(tabId as any)}
        tabs={[
          {
            id: "overview",
            label: t("overview", "Overview"),
            icon: t("icon_dashboard", "dashboard"),
            colorClass: "text-[var(--accent)]",
            number: sets.length.toString(),
          },
          {
            id: "all",
            label: t("collections", "Collections"),
            icon: t("icon_collections_bookmark", "collections_bookmark"),
            number: sets.length.toString(),
          },
          {
            id: "issues",
            label: t("title_issues", "Issues"),
            icon: t("icon_warning", "warning"),
            colorClass: "text-[var(--warning)]",
            number: sets.filter((s) => (s._issueCount || 0) > 0).length.toString(),
          },
          {
            id: "empty",
            label: t("status_empty", "Empty"),
            icon: t("icon_inventory_2", "inventory_2"),
            colorClass: "text-[var(--subtext)]",
            number: sets.filter((s) => (s._memberCount || 0) === 0).length.toString(),
          },
        ]}
        hideSearch={filterTab === "overview"}
      >
        {filterTab === "overview" ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon={t("icon_history", "history")}
              iconColorClass="text-[var(--accent)]"
              title={t("recent_activity", "Recent Activity")}
              isEmpty={false}
            >
              <CollectionCreateLeadCard onCreate={() => setIsForgePanelOpen(true)} />
              {recentSets.map((setItem) => (
                <VaultCard
                  key={setItem.id}
                  setItem={setItem}
                  activeSetId={activeSet?.id}
                  onClick={() => handleSelectSet(setItem)}
                  masonsList={masonsList}
                />
              ))}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_warning", "warning")}
              iconColorClass="text-[var(--warning)]"
              title={t("title_issues", "Issues")}
              isEmpty={flaggedSets.length === 0}
              emptyIcon={t("icon_check_circle", "check_circle")}
              emptyTitle={t("no_issues", "No Issues")}
            >
              {flaggedSets.map((setItem) => (
                <VaultCard
                  key={setItem.id}
                  setItem={setItem}
                  activeSetId={activeSet?.id}
                  onClick={() => handleSelectSet(setItem)}
                  masonsList={masonsList}
                />
              ))}
            </HubOverviewSection>
          </HubOverviewLanding>
        ) : (
          (() => {
            const hasSearch = Boolean(searchTerm.trim());
            const showCreateLead = filterTab === "all" && !hasSearch;
            const showEmptyState = (filterTab !== "all" || hasSearch) && filteredSets.length === 0;
            return (
              <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start">
                  {showCreateLead && (
                    <CollectionCreateLeadCard onCreate={() => setIsForgePanelOpen(true)} />
                  )}
                  {showEmptyState ? (
                    <EmptyState
                      icon={hasSearch ? t("icon_search_off", "search_off") : t("icon_folder", "folder")}
                      title={
                        hasSearch
                          ? t("no_matches", "No matches")
                          : t("no_vaults", "No collections")
                      }
                      className="col-span-full py-16"
                    />
                  ) : (
                    filteredSets.map((setItem) => (
                      <VaultCard
                        key={setItem.id}
                        setItem={setItem}
                        activeSetId={activeSet?.id}
                        onClick={() => handleSelectSet(setItem)}
                        masonsList={masonsList}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })()
        )}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_init_set", "Create Collection")}
        subtitle={t("create_subtitle", "Create a new collection")}
        icon={t("icon_add_circle", "add_circle")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              tooltip={t("forge_init_set", "Create Collection")}
              onClick={createSet}
              disabled={!setName.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_tune", "tune")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("ph_collection_name", "Collection Name")}
                </label>
                <input
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && setName.trim()) {
                      void createSet();
                    }
                  }}
                  placeholder={t("ph_collection_name", "Collection Name")}
                  className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("mason", "{Mason}")}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <CustomMasonDropdown
                      value={setMasonId}
                      options={masonsList}
                      onChange={setSetMasonId}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMasonPanelOpen(true)}
                    className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] text-[var(--text)] px-3.5 rounded-xl transition-colors shrink-0 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_person_add", "person_add")}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("ui_url", "URL")}
                </label>
                <input
                  value={setSetUrl}
                  onChange={(e) => setSetSetUrl(e.target.value)}
                  placeholder={t("external_url_placeholder", "https://...")}
                  className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={activeSet?.name || t("manage_collection", "Manage Collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon={t("icon_library_books", "library_books")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[880px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_delete", "delete")}
              tooltip={t("btn_delete", "{Delete}")}
              onClick={handleDeleteSet}
              disabled={isSaving}
              variant="danger"
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={
                isSaving ? t("ui_loading", "Saving...") : t("cc_save_set", "Save")
              }
              onClick={saveSetMeta}
              disabled={isSaving}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeSet && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <UniversalGroup
              title={t("tab_metadata", "Metadata & Telemetry")}
              icon={t("icon_tune", "tune")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ph_collection_name", "Collection Name")}
                  </label>
                  <input
                    value={activeSet.name || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, name: e.target.value })
                    }
                    placeholder={t("ph_collection_name", "Collection Name")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("mason", "{Mason}")}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown
                        value={activeSet.mason_id || ""}
                        options={masonsList}
                        onChange={(val: string) =>
                          setActiveSet({ ...activeSet, mason_id: val })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMasonPanelOpen(true)}
                      className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] text-[var(--text)] px-3.5 rounded-xl transition-colors shrink-0 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_person_add", "person_add")}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  <input
                    value={activeSet.image_url || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, image_url: e.target.value })
                    }
                    placeholder={t("cc_cover_url", "Cover Image URL")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ui_url", "URL")}
                  </label>
                  <input
                    value={activeSet.url || ""}
                    onChange={(e) => setActiveSet({ ...activeSet, url: e.target.value })}
                    placeholder={t("external_url_placeholder", "https://...")}
                    className="w-full h-11 glass-surface rounded-xl px-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("registry_assets_title", "Included Assets")}
              count={manifestMembers.length}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="flex flex-col gap-3.5">
                {manifestMembers.length > 0 && (
                  <ActionPill
                    searchQuery={memberFilter}
                    setSearchQuery={setMemberFilter}
                    searchPlaceholder={t("search_ph", "Search {mods}...")}
                    primaryPopover={{
                      icon: t("icon_tune", "tune"),
                      label: t("filters", "Filters"),
                      isActive: memberCategoryFilter !== "ALL" || memberStatusFilter !== "ALL",
                      content: (
                        <CollectionMembersFilterContent
                          membersList={manifestMembers}
                          categoryFilter={memberCategoryFilter}
                          onCategoryChange={setMemberCategoryFilter}
                          statusFilter={memberStatusFilter}
                          onStatusChange={setMemberStatusFilter}
                        />
                      ),
                    }}
                  />
                )}

                {hasActiveManifestFilter && visibleManifestMembers.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_matches", "No matches found")}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!hasActiveManifestFilter && (
                      <CollectionAddAssetLeadCard
                        options={addableCatalogOptions}
                        searchPlaceholder={t("collection_add_mod_ph", "Search catalog to add a {mod}...")}
                        onSelectMod={addToManifest}
                      />
                    )}
                    {visibleManifestMembers.map((member) => (
                      <ArtifactCard
                        key={member.id}
                        mod={member.mods}
                        layout="vertical"
                        masonsList={masonsList}
                        overrideActionLabel={t("btn_inspect", "Inspect {Mod}")}
                        onClick={() => openModDossier({ ...member.mods, isNexusView: true })}
                        onRemove={() =>
                          removeFromManifest(
                            member.id,
                            member.mods?.name || ""
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title", "New {Mason}")}
        subtitle={t("mason", "{Mason}")}
        icon={t("icon_person_add", "person_add")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[520px]"
        backdropZ="z-[55000]"
        panelZ="z-[55001]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_person_add", "person_add")}
              tooltip={t("create_btn_create", "Create Mason")}
              onClick={handleCreateMason}
              disabled={!newMasonName.trim() || isCreatingMason}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_person_add", "person_add")}
            overline={t("mason", "{Mason}")}
            title={newMasonName || t("create_title", "New {Mason}")}
            description={t("architect_collections_desc", "Register a new creator profile")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={newMasonName}
            onChange={setNewMasonName}
            placeholder={t("create_ph_name", "Enter {mason} name...")}
            label={t("create_ph_name", "Enter {mason} name...")}
            icon={t("icon_person", "person")}
          />
        </div>
      </SidePanel>
    </>
  );
}
