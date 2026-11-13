import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  EmptyState,
  SidePanel,
  CustomDropdown,
  CustomComplianceDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  UniversalGroup,
  StatBox,
  SidePanelHeroCard,
  SidePanelTitleInput,
  VAULT_CHIP_CLASS,
  toHighlanderSlotSlug,
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";

function resolveCollectionStatus(
  s: any
): "stable" | "under_review" | "pending" | "corrupted" | "unknown" {
  const raw = String(s?.status || "")
    .toLowerCase()
    .trim();
  if (raw === "stable" || raw === "verified") return "stable";
  if (raw === "under_review" || raw === "under review") return "under_review";
  if (raw === "pending") return "pending";
  if (raw === "corrupted" || raw === "broken") return "corrupted";
  if (!raw && s?.is_official && Number(s?.compliance_tier || 0) === 0) return "stable";
  return "unknown";
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
  const [newSetName, setNewSetName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [setTier, setSetTier] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchSets = async () => {
    const { data } = await supabase
      .from("collections")
      .select("*")
      .eq("mason_id", masonId)
      .order("name");
    if (data) setSets(data);
  };

  const fetchMyMods = async () => {
    const { data } = await supabase
      .from("mods")
      .select("id, name, image_url, category_override")
      .eq("mason_id", masonId)
      .order("name");
    if (data) setMyMods(data);
  };

  const fetchMembers = async (setId: string) => {
    const { data } = await supabase
      .from("collection_members")
      .select(
        "id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)"
      )
      .eq("set_id", setId);
    if (data) setMembers(data);
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
      creator_name: masonName,
      mason_id: masonId,
      is_official: true,
      compliance_tier: setTier,
      status: setTier >= 1 ? "pending" : "stable",
    };
    const { data, error } = await supabase
      .from("collections")
      .insert([payload])
      .select()
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
      setSets((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSetName("");
      setSetTier(0);
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
      status: resolveCollectionStatus(activeSet),
      compliance_tier: activeSet.compliance_tier,
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
    fetchSets();
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
    fetchMembers(activeSet.id);
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
    }
    fetchMembers(activeSet.id);
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
    const resolvedStatus = resolveCollectionStatus(s);
    if (activeTab !== "overview" && resolvedStatus !== activeTab) {
      return false;
    }
    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
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
      id: "stable",
      label: t("status_stable", "Stable"),
      icon: t("icon_verified", "verified"),
      number: sets.filter((s) => resolveCollectionStatus(s) === "stable").length.toString(),
    },
    {
      id: "under_review",
      label: t("status_dd_review", "Under Review"),
      icon: t("icon_policy", "policy"),
      number: sets.filter((s) => resolveCollectionStatus(s) === "under_review").length.toString(),
    },
    {
      id: "pending",
      label: t("pending", "Pending"),
      icon: t("icon_schedule", "schedule"),
      number: sets.filter((s) => resolveCollectionStatus(s) === "pending").length.toString(),
    },
    {
      id: "unknown",
      label: t("unknown", "Unknown"),
      icon: t("icon_help", "help"),
      number: sets.filter((s) => resolveCollectionStatus(s) === "unknown").length.toString(),
    },
    {
      id: "corrupted",
      label: t("status_corrupted", "Corrupted"),
      icon: t("icon_warning", "warning"),
      number: sets.filter((s) => resolveCollectionStatus(s) === "corrupted").length.toString(),
    },
  ];

  const renderLanding = () => {
    const flaggedSets = sets
      .filter((s) => {
        const st = resolveCollectionStatus(s);
        return st === "corrupted" || st === "unknown";
      })
      .slice(0, 4);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_history", "history")}
          iconColorClass="text-[var(--accent)]"
          title={t("recent_activity", "Recent Activity")}
          isEmpty={sets.length === 0}
          emptyIcon={t("icon_collections_bookmark", "collections_bookmark")}
          emptyTitle={t("cc_no_sets", "No collections found")}
        >
          {sets.slice(0, 4).map((setItem) => (
            <VaultCard
              key={setItem.id}
              setItem={setItem}
              activeSetId={activeSet?.id}
              onClick={() => {
                setActiveSet(setItem);
                fetchMembers(setItem.id);
              }}
              masonNameFallback={masonName}
            />
          ))}
        </HubOverviewSection>
        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("title_issues", "Flags & Issues")}
          isEmpty={flaggedSets.length === 0}
          emptyIcon={t("icon_collections_bookmark", "collections_bookmark")}
          emptyTitle={t("cc_no_sets", "No issues detected")}
        >
          {flaggedSets.map((setItem) => (
            <VaultCard
              key={setItem.id}
              setItem={setItem}
              activeSetId={activeSet?.id}
              onClick={() => {
                setActiveSet(setItem);
                fetchMembers(setItem.id);
              }}
              masonNameFallback={masonName}
            />
          ))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start pr-2">
          {filteredSets.length === 0 && (
            <EmptyState
              icon={t("icon_extension_off", "extension_off")}
              title={t("cc_no_sets", "No collections found")}
              className="col-span-full py-16"
            />
          )}
          {filteredSets.map((setItem) => (
            <div key={setItem.id} className="w-full max-w-[450px]">
              <VaultCard
                setItem={setItem}
                activeSetId={activeSet?.id}
                onClick={() => {
                  setActiveSet(setItem);
                  fetchMembers(setItem.id);
                }}
                masonNameFallback={masonName}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

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
      primaryPopover={
        activeTab !== "overview"
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[300px] p-4 text-left">
                  <div className="flex flex-col mb-5 w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                      {t("registry_col_safety", "TIER")}
                    </div>
                    <CustomDropdown
                      disableTint={true}
                      variant="pill"
                      flat={true}
                      value={tierFilter}
                      onChange={(v: string[]) => setTierFilter(v[0])}
                      options={[
                        { id: "ALL", label: t("filter_all", "All") },
                        { id: "0", label: `${t("auto_tier", "Tier")} 0` },
                        { id: "1", label: `${t("auto_tier", "Tier")} 1` },
                        { id: "2", label: `${t("auto_tier", "Tier")} 2` },
                      ]}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
      actions={
        activeTab !== "overview"
          ? [
              {
                id: "create",
                icon: (
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_add", "add")}
                  </span>
                ),
                label: t("auto_create", "Create") as string,
                onClick: () => setIsForgePanelOpen(true),
              },
            ]
          : undefined
      }
    >
      {activeTab === "overview" ? renderLanding() : renderList()}

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set", "New {Vault}")}
        subtitle={t("create_subtitle", "Create a new collection")}
        icon={t("icon_add_circle", "add_circle")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[640px]"
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
          <SidePanelHeroCard
            icon={t("icon_add_circle", "add_circle")}
            overline={t("collections", "Collections")}
            title={newSetName || t("forge_new_set", "New {Vault}")}
            description={t("create_subtitle", "Create a new collection")}
            badge={`Tier ${setTier}`}
            badgeIcon={t("icon_verified_user", "verified_user")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={newSetName}
            onChange={setNewSetName}
            placeholder={t("forge_set_name", "{Vault} Name...")}
            label={t("forge_set_name", "{Vault} Name...")}
            icon={t("icon_collections_bookmark", "collections_bookmark")}
          />

          <UniversalGroup
            title={t("registry_col_safety", "Compliance Tier")}
            icon={t("icon_verified_user", "verified_user")}
          >
            <CustomComplianceDropdown value={setTier} onChange={setSetTier} maxTier={4} />
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={t("manage_collection", "Manage Collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon={t("icon_library_books", "library_books")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
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
            <SidePanelHeroCard
              icon={t("icon_library_books", "library_books")}
              overline={masonName || t("collections", "Collections")}
              title={activeSet.name || t("manage_collection", "Manage Collection")}
              description={t(
                "architect_collections_desc",
                "Registry review, metadata governance, and conflict triage"
              )}
              badge={resolveCollectionStatus(activeSet).replace(/_/g, " ").toUpperCase()}
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <StatBox
                  label={t("registry_assets_title", "Included Assets")}
                  value={members.length}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("registry_col_safety", "Compliance Tier")}
                  value={`Tier ${activeSet.compliance_tier || 0}`}
                  icon={t("icon_verified_user", "verified_user")}
                  iconColorClass="text-[var(--accent)]"
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={activeSet.name || ""}
              onChange={(val) => setActiveSet({ ...activeSet, name: val })}
              placeholder={t("forge_set_name", "{Vault} Name...")}
              label={t("forge_set_name", "{Vault} Name...")}
              icon={t("icon_library_books", "library_books")}
            />

            <UniversalGroup
              title={t("tab_metadata", "Collection Metadata")}
              icon={t("icon_tune", "tune")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  <input
                    value={activeSet.image_url || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, image_url: e.target.value })
                    }
                    placeholder={t("cc_cover_url", "Cover Image URL")}
                    className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ui_url", "External URL")}
                  </label>
                  <input
                    value={activeSet.url || ""}
                    onChange={(e) => setActiveSet({ ...activeSet, url: e.target.value })}
                    placeholder={t("external_url_placeholder", "https://...")}
                    className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("registry_col_safety", "Compliance Tier")}
                  </label>
                  <CustomComplianceDropdown
                    value={activeSet.compliance_tier || 0}
                    onChange={(val: number) =>
                      setActiveSet({ ...activeSet, compliance_tier: val })
                    }
                    maxTier={4}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("status", "Status")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={resolveCollectionStatus(activeSet)}
                    onChange={(v: string[]) =>
                      setActiveSet({ ...activeSet, status: v[0] })
                    }
                    options={[
                      { id: "stable", label: t("status_stable", "Stable") },
                      { id: "under_review", label: t("status_dd_review", "Under Review") },
                      { id: "pending", label: t("pending", "Pending") },
                      { id: "unknown", label: t("unknown", "Unknown") },
                      { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                    ]}
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={`${t("registry_assets_title", "Included Assets")} (${members.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="flex flex-col gap-4">
                <div className="relative z-[6000]">
                  <ActionPill
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    searchPlaceholder={t("link_search", "Search your {mods}...")}
                  />

                  {searchQuery.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-2 glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl shadow-2xl z-[7000] animate-in fade-in slide-in-from-top-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {myMods
                        .filter(
                          (m) =>
                            !members.some((mem) => mem.mod_id === m.id) &&
                            m.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => {
                              handleAddMod(m.id);
                              setSearchQuery("");
                            }}
                            className="w-full text-left px-4 py-3 hover:theme-panel-accent border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex justify-between items-center group transition-all shrink-0"
                          >
                            <span className="text-xs font-bold text-[var(--text)] truncate">
                              {m.name}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all">
                              {t("ql_add", "Add")}
                            </span>
                          </button>
                        ))}
                      {myMods.filter(
                        (m) =>
                          !members.some((mem) => mem.mod_id === m.id) &&
                          m.name.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length === 0 && (
                        <EmptyState
                          icon={t("icon_search_off", "search_off")}
                          title={t("mason_cc_no_assets", "No Matching {Mods}")}
                          className="py-6"
                        />
                      )}
                    </div>
                  )}
                </div>

                {members.length === 0 ? (
                  <EmptyState
                    icon={t("icon_inventory_2", "inventory_2")}
                    title={t("cc_no_assets_in_set", "No assets in collection")}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {members.map((mem) => (
                      <ArtifactCard
                        key={mem.id}
                        mod={mem.mods}
                        layout="horizontal"
                        onClick={() => {}}
                        onRemove={() => handleRemoveMod(mem.id)}
                        masonsList={[]}
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
  const [setTier, setSetTier] = useState(0);

  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [filterTab, setFilterTab] = useState<
    "overview" | "exclusive_slots" | "stable" | "under_review" | "pending" | "unknown" | "corrupted"
  >("overview");

  const [isSaving, setIsSaving] = useState(false);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [highlanderSlots, setHighlanderSlots] = useState<any[]>([]);
  const [slotCountsMap, setSlotCountsMap] = useState<Record<string, number>>({});
  const [activeSlot, setActiveSlot] = useState<any | null>(null);
  const [slotMembers, setSlotMembers] = useState<any[]>([]);
  const [isCreateSlotOpen, setIsCreateSlotOpen] = useState(false);
  const [newSlotName, setNewSlotName] = useState("");
  const [newSlotSlug, setNewSlotSlug] = useState("");
  const [newSlotDesc, setNewSlotDesc] = useState("");
  const [slotAssetSearch, setSlotAssetSearch] = useState("");
  const [slotAvailableAssets, setSlotAvailableAssets] = useState<any[]>([]);
  const [isSearchingSlotAssets, setIsSearchingSlotAssets] = useState(false);

  const fetchHighlanderSlots = async () => {
    let { data: slotData, error: slotErr } = await supabase
      .from("flavor_groups")
      .select("id, name, slug, description")
      .order("name");
    if (slotErr) {
      const fb = await supabase.from("flavor_groups").select("id, name").order("name");
      slotData = fb.data as any;
    }
    if (slotData) {
      setHighlanderSlots(slotData);
    }
    const { data: assignedMods } = await supabase
      .from("mods")
      .select("id, highlander_group_id, compliance_tier")
      .not("highlander_group_id", "is", null);
    if (assignedMods) {
      const counts: Record<string, number> = {};
      assignedMods.forEach((m: any) => {
        if (Number(m?.compliance_tier || 0) === 0 && m?.highlander_group_id) {
          const gid = String(m.highlander_group_id);
          counts[gid] = (counts[gid] || 0) + 1;
        }
      });
      setSlotCountsMap(counts);
    }
  };

  const fetchSlotMembers = async (slotId: string) => {
    const { data } = await supabase
      .from("mods")
      .select(
        "id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension, compliance_tier"
      )
      .eq("highlander_group_id", slotId)
      .order("name");
    if (data) {
      setSlotMembers(data.filter((m: any) => Number(m?.compliance_tier || 0) === 0));
    }
  };

  const fetchSets = async () => {
    const { data } = await supabase.from("collections").select("*").order("name");
    if (data) {
      setSets(data.filter((s: any) => Number(s?.compliance_tier || 0) === 0));
    }
  };

  const fetchManifest = async (setId: string) => {
    const { data } = await supabase
      .from("collection_members")
      .select(
        "id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension, compliance_tier)"
      )
      .eq("set_id", setId);
    if (data) {
      setManifestMembers(
        data.filter((m: any) => Number(m?.mods?.compliance_tier || 0) === 0)
      );
    }
  };

  const searchCCAssets = async () => {
    setIsSearching(true);
    const { data } = await supabase
      .from("mods")
      .select("id, name, image_url, master_author, compliance_tier, masons(name)")
      .ilike("name", `%${assetSearch}%`)
      .limit(20);
    if (data) {
      setAvailableAssets(
        data.filter((m: any) => Number(m?.compliance_tier || 0) === 0)
      );
    }
    setIsSearching(false);
  };

  useEffect(() => {
    fetchSets();
    fetchHighlanderSlots();
    const fetchMasons = async () => {
      const { data } = await supabase.from("masons").select("id, name").order("name");
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (slotAssetSearch && slotAssetSearch.trim().length >= 2) {
        setIsSearchingSlotAssets(true);
        const { data } = await supabase
          .from("mods")
          .select("id, name, image_url, master_author, compliance_tier, highlander_group_id, masons(name)")
          .ilike("name", `%${slotAssetSearch.trim()}%`)
          .limit(20);
        if (data) {
          setSlotAvailableAssets(
            data.filter((m: any) => Number(m?.compliance_tier || 0) === 0)
          );
        }
        setIsSearchingSlotAssets(false);
      } else {
        setSlotAvailableAssets([]);
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [slotAssetSearch]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (assetSearch) searchCCAssets();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [assetSearch]);

  const handleSelectSet = (setItem: any) => {
    setActiveSet(setItem);
    fetchManifest(setItem.id);
  };

  const createSet = async () => {
    if (!setName) return;
    const targetTier = Math.min(4, Math.max(0, Number(setTier || 0)));
    const payload: any = {
      name: setName,
      is_official: true,
      compliance_tier: targetTier,
      status: targetTier >= 1 ? "pending" : "stable",
      mason_id: setMasonId && setMasonId.trim() !== "" ? setMasonId : null,
      url: setSetUrl && setSetUrl.trim() !== "" ? setSetUrl : null,
    };

    const { data, error } = await supabase
      .from("collections")
      .insert([payload])
      .select()
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
      setSets([...sets, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSetName("");
      setSetMasonId("");
      setSetSetUrl("");
      setSetTier(0);
      setIsForgePanelOpen(false);
    }
  };

  const saveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const prevSet = sets.find((s) => s.id === activeSet.id) || activeSet;
    const targetTier = Math.min(4, Math.max(0, Number(activeSet.compliance_tier || 0)));
    const updatedPayload = {
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      mason_id: activeSet.mason_id,
      status: targetTier >= 1 ? "pending" : resolveCollectionStatus(activeSet),
      compliance_tier: targetTier,
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
      if (Number(updatedPayload.compliance_tier || 0) > 0) {
        setActiveSet(null);
      }
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
    fetchManifest(activeSet.id);
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
      fetchManifest(activeSet.id);
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
      setSetMasonId(newId);
      if (activeSet) setActiveSet({ ...activeSet, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const handleSelectSlot = (slotItem: any) => {
    setActiveSlot({
      ...slotItem,
      slug: slotItem.slug || toHighlanderSlotSlug(slotItem.name),
    });
    fetchSlotMembers(slotItem.id);
  };

  const createHighlanderSlot = async () => {
    if (!newSlotName.trim()) return;
    const slug = toHighlanderSlotSlug(newSlotSlug || newSlotName);
    const payload: any = {
      name: newSlotName.trim(),
      slug: slug || null,
      description: newSlotDesc.trim() || null,
    };
    const { data, error } = await supabase
      .from("flavor_groups")
      .insert([payload])
      .select()
      .single();
    if (!error && data) {
      logArchitectAction(
        "Created Exclusive Slot",
        "flavor_groups",
        payload.name,
        undefined,
        undefined,
        false,
        computeAuditDiff(null, payload)
      );
      await fetchHighlanderSlots();
      setNewSlotName("");
      setNewSlotSlug("");
      setNewSlotDesc("");
      setIsCreateSlotOpen(false);
      useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
    } else if (error) {
      useStore.getState().pushStatus(error.message, "error");
    }
  };

  const saveHighlanderSlot = async () => {
    if (!activeSlot) return;
    setIsSaving(true);
    const prevSlot = highlanderSlots.find((s) => s.id === activeSlot.id) || activeSlot;
    const updatedPayload = {
      name: String(activeSlot.name || "").trim(),
      slug: toHighlanderSlotSlug(activeSlot.slug || activeSlot.name) || null,
      description: String(activeSlot.description || "").trim() || null,
    };
    const { error } = await supabase
      .from("flavor_groups")
      .update(updatedPayload)
      .eq("id", activeSlot.id);
    if (!error) {
      logArchitectAction(
        "Updated Exclusive Slot",
        "flavor_groups",
        updatedPayload.name,
        undefined,
        undefined,
        false,
        computeAuditDiff(prevSlot, updatedPayload)
      );
      await fetchHighlanderSlots();
      useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
    } else {
      useStore.getState().pushStatus(error.message, "error");
    }
    setIsSaving(false);
  };

  const deleteHighlanderSlot = async () => {
    if (!activeSlot) return;
    setIsSaving(true);
    await supabase
      .from("mods")
      .update({ highlander_group_id: null })
      .eq("highlander_group_id", activeSlot.id);
    await supabase
      .from("flavor_group_members")
      .delete()
      .eq("group_id", activeSlot.id);
    const { error } = await supabase
      .from("flavor_groups")
      .delete()
      .eq("id", activeSlot.id);
    if (!error) {
      logArchitectAction(
        "Deleted Exclusive Slot",
        "flavor_groups",
        activeSlot.name,
        undefined,
        undefined,
        false,
        { name: { from: activeSlot.name, to: "Deleted" } }
      );
      setActiveSlot(null);
      setSlotMembers([]);
      await fetchHighlanderSlots();
      useStore.getState().pushStatus(t("alert_deleted", "Deleted"), "success");
    } else {
      useStore.getState().pushStatus(error.message, "error");
    }
    setIsSaving(false);
  };

  const assignModToSlot = async (modId: string, modName: string) => {
    if (!activeSlot) return;
    const { error } = await supabase
      .from("mods")
      .update({
        highlander_group_id: activeSlot.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", modId);
    if (!error) {
      logArchitectAction(
        `Assigned Mod ${modName} to Exclusive Slot`,
        "flavor_groups",
        activeSlot.name,
        undefined,
        undefined,
        false,
        { exclusive_slot: { to: activeSlot.name }, mod: { to: modName } }
      );
      await Promise.all([fetchSlotMembers(activeSlot.id), fetchHighlanderSlots()]);
    }
  };

  const unassignModFromSlot = async (modId: string, modName: string) => {
    if (!activeSlot) return;
    const { error } = await supabase
      .from("mods")
      .update({
        highlander_group_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", modId);
    if (!error) {
      logArchitectAction(
        `Unassigned Mod ${modName} from Exclusive Slot`,
        "flavor_groups",
        activeSlot.name,
        undefined,
        undefined,
        false,
        { exclusive_slot: { from: activeSlot.name, to: "None" }, mod: { to: modName } }
      );
      await Promise.all([fetchSlotMembers(activeSlot.id), fetchHighlanderSlots()]);
    }
  };

  const filteredHighlanderSlots = highlanderSlots.filter((s: any) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      String(s.name || "").toLowerCase().includes(q) ||
      String(s.slug || "").toLowerCase().includes(q) ||
      String(s.description || "").toLowerCase().includes(q)
    );
  });

  const renderHighlanderSlotCard = (slotItem: any) => {
    const count = slotCountsMap[String(slotItem.id)] || 0;
    const slug = slotItem.slug || toHighlanderSlotSlug(slotItem.name || "");
    const isSelected = activeSlot?.id === slotItem.id;
    return (
      <div
        key={slotItem.id}
        onClick={() => handleSelectSlot(slotItem)}
        className={`glass-surface rounded-2xl p-5 border transition-all cursor-pointer flex flex-col justify-between gap-4 group ${
          isSelected
            ? "border-[var(--accent)]"
            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
        }`}
      >
        <div className="flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <span className="material-symbols-outlined !text-[20px]">
                {t("icon_swap_horiz", "swap_horiz")}
              </span>
            </div>
            <span className={`${VAULT_CHIP_CLASS} text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]`}>
              {count} {t("term_mods", "{Mods}")}
            </span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h4 className="text-sm font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
              {slotItem.name}
            </h4>
            {slug && (
              <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                {slug}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-[var(--subtext)] line-clamp-2 leading-relaxed">
            {slotItem.description ||
              t(
                "highlander_slot_card_default_desc",
                "Highlander atomic rule — only one {mod} in this Exclusive Slot may be equipped at a time."
              )}
          </p>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">
          <span>{t("highlander_exclusive_slot", "Exclusive Slot")}</span>
          <span className="material-symbols-outlined !text-[15px]">
            {t("icon_chevron_right", "chevron_right")}
          </span>
        </div>
      </div>
    );
  };

  const filteredSets = sets.filter((s: any) => {
    if (Number(s?.compliance_tier || 0) > 0) return false;
    const resolvedStatus = resolveCollectionStatus(s);
    if (filterTab !== "overview" && resolvedStatus !== filterTab) {
      return false;
    }

    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const flaggedSets = sets
    .filter((s) => {
      const st = resolveCollectionStatus(s);
      return st === "corrupted" || st === "unknown";
    })
    .slice(0, 4);

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
        searchPlaceholder={
          (filterTab === "exclusive_slots"
            ? t("highlander_search_slots_ph", "Search Exclusive Slots...")
            : t("search_queue", "Search collections...")) as string
        }
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
            id: "exclusive_slots",
            label: t("highlander_exclusive_slots", "Exclusive Slots"),
            icon: t("icon_swap_horiz", "swap_horiz"),
            colorClass: "text-[var(--accent)]",
            number: highlanderSlots.length.toString(),
          },
          {
            id: "stable",
            label: t("status_stable", "Stable"),
            icon: t("icon_verified", "verified"),
            number: sets.filter((s) => resolveCollectionStatus(s) === "stable").length.toString(),
          },
          {
            id: "under_review",
            label: t("status_dd_review", "Under Review"),
            icon: t("icon_policy", "policy"),
            number: sets.filter((s) => resolveCollectionStatus(s) === "under_review").length.toString(),
          },
          {
            id: "pending",
            label: t("pending", "Pending"),
            icon: t("icon_schedule", "schedule"),
            number: sets.filter((s) => resolveCollectionStatus(s) === "pending").length.toString(),
          },
          {
            id: "unknown",
            label: t("unknown", "Unknown"),
            icon: t("icon_help", "help"),
            number: sets
              .filter((s) => resolveCollectionStatus(s) === "unknown")
              .length.toString(),
          },
          {
            id: "corrupted",
            label: t("status_corrupted", "Corrupted"),
            icon: t("icon_warning", "warning"),
            number: sets.filter((s) => resolveCollectionStatus(s) === "corrupted").length.toString(),
          },
        ]}
        hideSearch={filterTab === "overview"}
        primaryPopover={
          filterTab !== "overview" && filterTab !== "exclusive_slots"
            ? {
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                content: (
                  <div className="flex flex-col w-[300px] p-4 text-left">
                    <div className="flex flex-col mb-5 w-full">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                        {t("registry_col_safety", "TIER")}
                      </div>
                      <CustomDropdown
                        disableTint={true}
                        variant="pill"
                        flat={true}
                        value={tierFilter}
                        onChange={(v: string[]) => setTierFilter(v[0])}
                        options={[
                          { id: "ALL", label: t("filter_all", "All") },
                          { id: "0", label: `${t("auto_tier", "Tier")} 0` },
                          { id: "1", label: `${t("auto_tier", "Tier")} 1` },
                          { id: "2", label: `${t("auto_tier", "Tier")} 2` },
                        ]}
                      />
                    </div>
                  </div>
                ),
              }
            : undefined
        }
        actions={
          filterTab !== "overview"
            ? [
                {
                  id: "create",
                  icon: (
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_add", "add")}
                    </span>
                  ),
                  label: (filterTab === "exclusive_slots"
                    ? t("highlander_btn_new_slot", "New Exclusive Slot")
                    : t("auto_create", "Create")) as string,
                  onClick: () => {
                    if (filterTab === "exclusive_slots") {
                      setIsCreateSlotOpen(true);
                    } else {
                      setIsForgePanelOpen(true);
                    }
                  },
                },
              ]
            : undefined
        }
      >
        {filterTab === "overview" ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon={t("icon_swap_horiz", "swap_horiz")}
              iconColorClass="text-[var(--accent)]"
              title={t("highlander_exclusive_slots", "Exclusive Slots")}
              isEmpty={highlanderSlots.length === 0}
              emptyIcon={t("icon_swap_horiz", "swap_horiz")}
              emptyTitle={t("highlander_no_slots", "No Exclusive Slots Created")}
            >
              {highlanderSlots.slice(0, 4).map((slotItem) =>
                renderHighlanderSlotCard(slotItem)
              )}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_history", "history")}
              iconColorClass="text-[var(--accent)]"
              title={t("recent_activity", "Recent Activity")}
              isEmpty={sets.length === 0}
              emptyIcon={t("icon_collections_bookmark", "collections_bookmark")}
              emptyTitle={t("cc_no_sets", "No collections found")}
            >
              {sets.slice(0, 4).map((setItem) => (
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
              title={t("title_issues", "Flags & Issues")}
              isEmpty={flaggedSets.length === 0}
              emptyIcon={t("icon_collections_bookmark", "collections_bookmark")}
              emptyTitle={t("cc_no_sets", "No Issues Detected")}
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
        ) : filterTab === "exclusive_slots" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start">
            {filteredHighlanderSlots.length === 0 ? (
              <EmptyState
                icon={searchTerm ? t("icon_search_off", "search_off") : t("icon_swap_horiz", "swap_horiz")}
                title={
                  searchTerm
                    ? t("no_matches", "No matches")
                    : t("highlander_no_slots", "No Exclusive Slots Created")
                }
                className="col-span-full py-16"
              />
            ) : (
              filteredHighlanderSlots.map((slotItem) =>
                renderHighlanderSlotCard(slotItem)
              )
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start">
            {filteredSets.length === 0 ? (
              <EmptyState
                icon={searchTerm ? t("icon_search_off", "search_off") : t("icon_folder", "folder")}
                title={
                  searchTerm
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
        )}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set", "New {Vault}")}
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
          <SidePanelHeroCard
            icon={t("icon_add_circle", "add_circle")}
            overline={t("collections", "Collections")}
            title={setName || t("forge_new_set", "New {Vault}")}
            description={t("create_subtitle", "Create a new collection")}
            badge={`Tier ${setTier}`}
            badgeIcon={t("icon_verified_user", "verified_user")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={setName}
            onChange={setSetName}
            placeholder={t("forge_set_name", "{Vault} Name...")}
            label={t("forge_set_name", "{Vault} Name...")}
            icon={t("icon_collections_bookmark", "collections_bookmark")}
          />

          <UniversalGroup
            title={t("tab_metadata", "Collection Metadata")}
            icon={t("icon_tune", "tune")}
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("mason", "{Mason}")}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CustomMasonDropdown
                      value={setMasonId}
                      options={masonsList}
                      onChange={setSetMasonId}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMasonPanelOpen(true)}
                    className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_person_add", "person_add")}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("registry_col_safety", "Compliance Tier")}
                </label>
                <CustomComplianceDropdown
                  value={setTier}
                  onChange={setSetTier}
                  maxTier={4}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("ui_url", "External URL")}
                </label>
                <input
                  value={setSetUrl}
                  onChange={(e) => setSetSetUrl(e.target.value)}
                  placeholder={t("auto_https", "https://...")}
                  className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={t("manage_collection", "Manage Collection")}
        subtitle={`UUID: ${activeSet?.id}`}
        icon={t("icon_library_books", "library_books")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
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
            <SidePanelHeroCard
              icon={t("icon_library_books", "library_books")}
              overline={t("collections", "Collections")}
              title={activeSet.name || t("manage_collection", "Manage Collection")}
              description={t(
                "architect_collections_desc",
                "Registry review, metadata governance, and conflict triage"
              )}
              badge={resolveCollectionStatus(activeSet).replace(/_/g, " ").toUpperCase()}
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <StatBox
                  label={t("registry_assets_title", "Included Assets")}
                  value={manifestMembers.length}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("registry_col_safety", "Compliance Tier")}
                  value={`Tier ${activeSet.compliance_tier || 0}`}
                  icon={t("icon_verified_user", "verified_user")}
                  iconColorClass="text-[var(--accent)]"
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={activeSet.name || ""}
              onChange={(val) => setActiveSet({ ...activeSet, name: val })}
              placeholder={t("forge_set_name", "{Vault} Name...")}
              label={t("forge_set_name", "{Vault} Name...")}
              icon={t("icon_library_books", "library_books")}
            />

            <UniversalGroup
              title={t("tab_metadata", "Collection Metadata")}
              icon={t("icon_tune", "tune")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("mason", "{Mason}")}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
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
                      className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_person_add", "person_add")}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("registry_col_safety", "Compliance Tier")}
                  </label>
                  <CustomComplianceDropdown
                    value={activeSet.compliance_tier || 0}
                    onChange={(val: number) =>
                      setActiveSet({ ...activeSet, compliance_tier: val })
                    }
                    maxTier={4}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("status", "Status")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={resolveCollectionStatus(activeSet)}
                    onChange={(v: string[]) =>
                      setActiveSet({ ...activeSet, status: v[0] })
                    }
                    options={[
                      { id: "stable", label: t("status_stable", "Stable") },
                      { id: "under_review", label: t("status_dd_review", "Under Review") },
                      { id: "pending", label: t("pending", "Pending") },
                      { id: "unknown", label: t("unknown", "Unknown") },
                      { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  <input
                    value={activeSet.image_url || ""}
                    onChange={(e) =>
                      setActiveSet({ ...activeSet, image_url: e.target.value })
                    }
                    placeholder={t("cc_cover_url", "Cover Image URL")}
                    className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("ui_url", "External URL")}
                  </label>
                  <input
                    value={activeSet.url || ""}
                    onChange={(e) => setActiveSet({ ...activeSet, url: e.target.value })}
                    placeholder={t("external_url_placeholder", "https://...")}
                    className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={`${t("registry_assets_title", "Included Assets")} (${
                manifestMembers.length
              })`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="flex flex-col gap-4">
                <div className="relative z-[6000]">
                  <ActionPill
                    searchQuery={assetSearch}
                    setSearchQuery={setAssetSearch}
                    searchPlaceholder={t("forge_search_assets", "Search assets...")}
                    isLoading={isSearching}
                  />

                  {assetSearch.length >= 2 && availableAssets.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl shadow-2xl z-[7000] animate-in fade-in slide-in-from-top-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {availableAssets
                        .filter(
                          (asset) =>
                            !manifestMembers.some((m) => m.mod_id === asset.id)
                        )
                        .map((asset) => (
                          <button
                            type="button"
                            key={asset.id}
                            onClick={() => {
                              addToManifest(asset.id);
                              setAssetSearch("");
                            }}
                            className="w-full text-left px-4 py-3 hover:theme-panel-accent border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex justify-between items-center group transition-all shrink-0"
                          >
                            <div className="flex flex-col min-w-0 pr-4">
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {asset.name}
                              </span>
                              <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70 truncate">
                                {asset.masons?.name || asset.master_author || "UNKNOWN"}
                              </span>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all">
                              {t("ql_add", "Add")}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {manifestMembers.length === 0 ? (
                  <EmptyState
                    icon={t("icon_inventory_2", "inventory_2")}
                    title={t("no_mods_found", "No assets in collection")}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {manifestMembers.map((member) => (
                      <ArtifactCard
                        key={member.id}
                        mod={member.mods}
                        layout="horizontal"
                        onClick={() => {}}
                        onRemove={() =>
                          removeFromManifest(
                            member.id,
                            member.mods?.name || "Unknown"
                          )
                        }
                        masonsList={[]}
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

      <SidePanel
        isOpen={isCreateSlotOpen}
        onClose={() => setIsCreateSlotOpen(false)}
        title={t("highlander_btn_new_slot", "New Exclusive Slot")}
        subtitle={t(
          "highlander_create_slot_sub",
          "Enforce atomic Highlander one-of-a-kind equip rules"
        )}
        icon={t("icon_swap_horiz", "swap_horiz")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              tooltip={t("highlander_btn_new_slot", "New Exclusive Slot")}
              onClick={createHighlanderSlot}
              disabled={!newSlotName.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_swap_horiz", "swap_horiz")}
            overline={t("highlander_exclusive_slots", "Exclusive Slots")}
            title={newSlotName || t("highlander_btn_new_slot", "New Exclusive Slot")}
            description={t(
              "studio_highlander_slot_desc",
              "Enforces the Highlander Rule — only one {mod} in the same Exclusive Slot (e.g. Main Menu Replacements or Global Lighting Presets) can be active at a time, automatically swapping rivals without manual conflict links."
            )}
            badge={toHighlanderSlotSlug(newSlotSlug || newSlotName) || "slot-slug"}
            badgeIcon={t("icon_tag", "tag")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={newSlotName}
            onChange={(val) => {
              setNewSlotName(val);
              if (!newSlotSlug) setNewSlotSlug("");
            }}
            placeholder={t("studio_highlander_custom_ph", "e.g. Main Menu Replacements")}
            label={t("highlander_slot_name_label", "Exclusive Slot Name")}
            icon={t("icon_swap_horiz", "swap_horiz")}
          />

          <UniversalGroup
            title={t("tab_metadata", "Slot Configuration")}
            icon={t("icon_tune", "tune")}
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("highlander_slot_slug_label", "Canonical Slot Slug (Static Edge Key)")}
                </label>
                <input
                  value={newSlotSlug || toHighlanderSlotSlug(newSlotName)}
                  onChange={(e) => setNewSlotSlug(toHighlanderSlotSlug(e.target.value))}
                  placeholder={t("highlander_slot_slug_ph", "main-menu-replacements")}
                  className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                  {t("upload_desc", "Description")}
                </label>
                <textarea
                  value={newSlotDesc}
                  onChange={(e) => setNewSlotDesc(e.target.value)}
                  placeholder={t(
                    "highlander_slot_desc_ph",
                    "Describe which {mods} belong in this Exclusive Slot..."
                  )}
                  className="glass-surface rounded-xl px-4 py-3 min-h-[88px] resize-y border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-semibold focus:outline-none focus:theme-border-accent transition-all custom-scrollbar"
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSlot}
        onClose={() => setActiveSlot(null)}
        title={t("highlander_manage_slot", "Manage Exclusive Slot")}
        subtitle={`UUID: ${activeSlot?.id}`}
        icon={t("icon_swap_horiz", "swap_horiz")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_delete", "delete")}
              tooltip={t("btn_delete", "{Delete}")}
              onClick={deleteHighlanderSlot}
              disabled={isSaving}
              variant="danger"
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={isSaving ? t("ui_loading", "Saving...") : t("save", "Save")}
              onClick={saveHighlanderSlot}
              disabled={isSaving}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeSlot && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_swap_horiz", "swap_horiz")}
              overline={t("highlander_exclusive_slots", "Exclusive Slots")}
              title={activeSlot.name || t("highlander_manage_slot", "Manage Exclusive Slot")}
              description={
                activeSlot.description ||
                t(
                  "highlander_slot_card_default_desc",
                  "Highlander atomic rule — only one {mod} in this Exclusive Slot may be equipped at a time."
                )
              }
              badge={toHighlanderSlotSlug(activeSlot.slug || activeSlot.name) || "slot"}
              badgeIcon={t("icon_tag", "tag")}
              variant="accent"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <StatBox
                  label={t("highlander_assigned_mods", "Assigned {Mods}")}
                  value={slotMembers.length}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("highlander_slot_slug_label", "Canonical Slot Slug (Static Edge Key)")}
                  value={toHighlanderSlotSlug(activeSlot.slug || activeSlot.name) || "-"}
                  icon={t("icon_code", "code")}
                  iconColorClass="text-[var(--accent)]"
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={activeSlot.name || ""}
              onChange={(val) => setActiveSlot({ ...activeSlot, name: val })}
              placeholder={t("studio_highlander_custom_ph", "e.g. Main Menu Replacements")}
              label={t("highlander_slot_name_label", "Exclusive Slot Name")}
              icon={t("icon_swap_horiz", "swap_horiz")}
            />

            <UniversalGroup
              title={t("tab_metadata", "Slot Configuration")}
              icon={t("icon_tune", "tune")}
            >
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("highlander_slot_slug_label", "Canonical Slot Slug (Static Edge Key)")}
                  </label>
                  <input
                    value={activeSlot.slug || ""}
                    onChange={(e) =>
                      setActiveSlot({
                        ...activeSlot,
                        slug: toHighlanderSlotSlug(e.target.value),
                      })
                    }
                    placeholder={t("highlander_slot_slug_ph", "main-menu-replacements")}
                    className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest ml-1">
                    {t("upload_desc", "Description")}
                  </label>
                  <textarea
                    value={activeSlot.description || ""}
                    onChange={(e) =>
                      setActiveSlot({ ...activeSlot, description: e.target.value })
                    }
                    placeholder={t(
                      "highlander_slot_desc_ph",
                      "Describe which {mods} belong in this Exclusive Slot..."
                    )}
                    className="w-full glass-surface rounded-xl px-4 py-3 min-h-[88px] resize-y border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-semibold focus:outline-none focus:theme-border-accent transition-all custom-scrollbar"
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={`${t("highlander_assigned_mods", "Assigned {Mods}")} (${slotMembers.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="flex flex-col gap-4">
                <div className="relative z-[6000]">
                  <ActionPill
                    searchQuery={slotAssetSearch}
                    setSearchQuery={setSlotAssetSearch}
                    searchPlaceholder={t("forge_search_assets", "Search assets...")}
                    isLoading={isSearchingSlotAssets}
                  />

                  {slotAssetSearch.trim().length >= 2 && slotAvailableAssets.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl shadow-2xl z-[7000] animate-in fade-in slide-in-from-top-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {slotAvailableAssets
                        .filter(
                          (asset) => !slotMembers.some((m) => m.id === asset.id)
                        )
                        .map((asset) => (
                          <button
                            type="button"
                            key={asset.id}
                            onClick={() => {
                              assignModToSlot(asset.id, asset.name || asset.id);
                              setSlotAssetSearch("");
                            }}
                            className="w-full text-left px-4 py-3 hover:theme-panel-accent border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex justify-between items-center group transition-all shrink-0 cursor-pointer"
                          >
                            <div className="flex flex-col min-w-0 pr-4">
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {asset.name}
                              </span>
                              <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70 truncate">
                                {asset.masons?.name || asset.master_author || t("unknown", "Unknown")}
                              </span>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all">
                              {t("ql_add", "Add")}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {slotMembers.length === 0 ? (
                  <EmptyState
                    icon={t("icon_swap_horiz", "swap_horiz")}
                    title={t(
                      "highlander_no_mods_in_slot",
                      "No {mods} assigned to this Exclusive Slot"
                    )}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {slotMembers.map((modRow) => (
                      <ArtifactCard
                        key={modRow.id}
                        mod={modRow}
                        layout="horizontal"
                        onClick={() => {}}
                        onRemove={() =>
                          unassignModFromSlot(modRow.id, modRow.name || modRow.id)
                        }
                        masonsList={[]}
                      />
                    ))}
                  </div>
                )}
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}
