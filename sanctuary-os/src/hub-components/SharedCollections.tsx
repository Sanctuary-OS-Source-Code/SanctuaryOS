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
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";

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
      status: activeSet.status,
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
    if (activeTab === "overview") {
      // Do not filter by status
    } else if (activeTab === "unknown") {
      if (s.status && s.status !== "unknown") return false;
    } else {
      if (s.status !== activeTab) return false;
    }
    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: "dashboard",
      colorClass: "text-[var(--accent)]",
      number: sets.length.toString(),
    },
    {
      id: "stable",
      label: t("status_stable", "Stable"),
      icon: "verified",
      number: sets.filter((s) => s.status === "stable").length.toString(),
    },
    {
      id: "under_review",
      label: t("status_dd_review", "Under Review"),
      icon: "policy",
      number: sets.filter((s) => s.status === "under_review").length.toString(),
    },
    {
      id: "pending",
      label: t("pending", "Pending"),
      icon: "schedule",
      number: sets.filter((s) => s.status === "pending").length.toString(),
    },
    {
      id: "unknown",
      label: t("unknown", "Unknown"),
      icon: "help",
      number: sets.filter((s) => s.status === "unknown" || !s.status).length.toString(),
    },
    {
      id: "corrupted",
      label: t("status_corrupted", "Corrupted"),
      icon: "warning",
      number: sets.filter((s) => s.status === "corrupted").length.toString(),
    },
  ];

  const renderLanding = () => {
    const flaggedSets = sets
      .filter((s) => s.status === "corrupted" || s.status === "unknown")
      .slice(0, 4);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon="history"
          iconColorClass="text-[var(--accent)]"
          title={t("recent_activity", "Recent Activity")}
        >
          {sets.length === 0 ? (
            <EmptyState
              icon="collections_bookmark"
              title={t("cc_no_sets", "No collections found")}
              className="py-8"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {sets.slice(0, 4).map((setItem) => (
                <div key={setItem.id} className="w-full">
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
          )}
        </HubOverviewSection>
        <HubOverviewSection
          icon="warning"
          iconColorClass="text-[var(--warning)]"
          title={t("title_issues", "Flags & Issues")}
        >
          {flaggedSets.length === 0 ? (
            <EmptyState
              icon="collections_bookmark"
              title={t("cc_no_sets", "No issues detected")}
              className="py-8"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {flaggedSets.map((setItem) => (
                <div key={setItem.id} className="w-full">
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
          )}
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
      headerIcon="collections_bookmark"
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
              icon: "tune",
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
                        { id: "ALL", label: "ALL TIERS" },
                        { id: "0", label: "TIER 0" },
                        { id: "1", label: "TIER 1" },
                        { id: "2", label: "TIER 2" },
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
              badge={(activeSet.status || "unknown").replace(/_/g, " ").toUpperCase()}
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
                    value={activeSet.status || "unknown"}
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
    "overview" | "stable" | "under_review" | "pending" | "unknown" | "corrupted"
  >("overview");

  const [isSaving, setIsSaving] = useState(false);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSets = async () => {
    const { data } = await supabase.from("collections").select("*").order("name");
    if (data) setSets(data);
  };

  const fetchManifest = async (setId: string) => {
    const { data } = await supabase
      .from("collection_members")
      .select(
        "id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)"
      )
      .eq("set_id", setId);
    if (data) setManifestMembers(data);
  };

  const searchCCAssets = async () => {
    setIsSearching(true);
    const { data } = await supabase
      .from("mods")
      .select("id, name, image_url, master_author, masons(name)")
      .ilike("name", `%${assetSearch}%`)
      .limit(20);
    if (data) setAvailableAssets(data);
    setIsSearching(false);
  };

  useEffect(() => {
    fetchSets();
    const fetchMasons = async () => {
      const { data } = await supabase.from("masons").select("id, name").order("name");
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

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
    const payload: any = {
      name: setName,
      is_official: true,
      compliance_tier: setTier,
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
    const updatedPayload = {
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      mason_id: activeSet.mason_id,
      status: activeSet.status,
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

  const filteredSets = sets.filter((s: any) => {
    if (filterTab === "overview") {
      // Do not filter by status
    } else if (filterTab === "unknown") {
      if (s.status && s.status !== "unknown") return false;
    } else {
      if (s.status !== filterTab) return false;
    }

    if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const flaggedSets = sets
    .filter((s) => s.status === "corrupted" || s.status === "unknown")
    .slice(0, 4);

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("collections", "Collections")}
        headerSubtitle={t(
          "architect_collections_desc",
          "Registry review, metadata governance, and conflict triage"
        )}
        headerIcon="folder"
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
            icon: "dashboard",
            colorClass: "text-[var(--accent)]",
            number: sets.length.toString(),
          },
          {
            id: "stable",
            label: t("status_stable", "Stable"),
            icon: "verified",
            number: sets.filter((s) => s.status === "stable").length.toString(),
          },
          {
            id: "under_review",
            label: t("status_dd_review", "Under Review"),
            icon: "policy",
            number: sets.filter((s) => s.status === "under_review").length.toString(),
          },
          {
            id: "pending",
            label: t("pending", "Pending"),
            icon: "schedule",
            number: sets.filter((s) => s.status === "pending").length.toString(),
          },
          {
            id: "unknown",
            label: t("unknown", "Unknown"),
            icon: "help",
            number: sets
              .filter((s) => s.status === "unknown" || !s.status)
              .length.toString(),
          },
          {
            id: "corrupted",
            label: t("status_corrupted", "Corrupted"),
            icon: "warning",
            number: sets.filter((s) => s.status === "corrupted").length.toString(),
          },
        ]}
        hideSearch={filterTab === "overview"}
        primaryPopover={
          filterTab !== "overview"
            ? {
                icon: "tune",
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
                          { id: "ALL", label: "ALL TIERS" },
                          { id: "0", label: "TIER 0" },
                          { id: "1", label: "TIER 1" },
                          { id: "2", label: "TIER 2" },
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
                  label: t("auto_create", "Create") as string,
                  onClick: () => setIsForgePanelOpen(true),
                },
              ]
            : undefined
        }
      >
        {filterTab === "overview" ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon="history"
              iconColorClass="text-[var(--accent)]"
              title={t("recent_activity", "Recent Activity")}
            >
              {sets.length === 0 ? (
                <EmptyState
                  icon="collections_bookmark"
                  title={t("cc_no_sets", "No collections found")}
                  className="py-8"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                  {sets.slice(0, 4).map((setItem) => (
                    <div key={setItem.id} className="w-full">
                      <VaultCard
                        setItem={setItem}
                        activeSetId={activeSet?.id}
                        onClick={() => handleSelectSet(setItem)}
                        masonsList={masonsList}
                      />
                    </div>
                  ))}
                </div>
              )}
            </HubOverviewSection>
            <HubOverviewSection
              icon="warning"
              iconColorClass="text-[var(--warning)]"
              title={t("title_issues", "Flags & Issues")}
            >
              {flaggedSets.length === 0 ? (
                <EmptyState
                  icon="collections_bookmark"
                  title={t("cc_no_sets", "No Issues Detected")}
                  className="py-8"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                  {flaggedSets.map((setItem) => (
                    <div key={setItem.id} className="w-full">
                      <VaultCard
                        setItem={setItem}
                        activeSetId={activeSet?.id}
                        onClick={() => handleSelectSet(setItem)}
                        masonsList={masonsList}
                      />
                    </div>
                  ))}
                </div>
              )}
            </HubOverviewSection>
          </HubOverviewLanding>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start">
            {filteredSets.length === 0 ? (
              <EmptyState
                icon={searchTerm ? "search_off" : t("icon_folder", "folder")}
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
              badge={(activeSet.status || "unknown").replace(/_/g, " ").toUpperCase()}
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
                    value={activeSet.status || "unknown"}
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
    </>
  );
}
