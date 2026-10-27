import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import {
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  GlassSegmentedControl,
  HoverTooltip,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  StatBox,
  ViewHeader,
  cleanSearchName,
  getModIcon,
} from "../shared";
import { SidePanelHeroCard, UniversalGroup } from "./layouts/ElevatedHubLayout";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  StatTileCarousel,
} from "../hub-components/SharedCommandScreenLayout";
import {
  resolvePayloadDependencies,
  pushEncryptedStagingPayload,
  shredCloudStagingRow,
  getSourceDeviceLabel,
  StagedCloudPayload,
  ResolvedStagedPayload,
} from "../utils/stagingCrypto";

const PRIORITY_TIERS = [
  {
    id: "1_Core",
    labelKey: "staging_tier_1",
    fallback: "1: Core / Framework",
    badgeClass: "bg-emerald-500/15 border-emerald-500/35 text-emerald-400",
  },
  {
    id: "2_Gameplay",
    labelKey: "staging_tier_2",
    fallback: "2: Gameplay",
    badgeClass: "bg-cyan-500/15 border-cyan-500/35 text-cyan-400",
  },
  {
    id: "3_Standard",
    labelKey: "staging_tier_3",
    fallback: "3: Standard Mod / CC",
    badgeClass:
      "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]",
  },
  {
    id: "4_Overrides",
    labelKey: "staging_tier_4",
    fallback: "4: Overrides (Load Last)",
    badgeClass: "bg-amber-500/15 border-amber-500/35 text-amber-400",
  },
];

function resolveKnownAuthor(mod: any, fallbackText: string): string {
  const explicit = String(mod?.master_author || mod?.author || "").trim();
  if (
    explicit &&
    explicit.toLowerCase() !== "unknown" &&
    explicit.toLowerCase() !== "unknown creator" &&
    explicit.toLowerCase() !== "unknown cc creator" &&
    explicit.toLowerCase() !== "unknown mason"
  ) {
    return explicit;
  }
  const n = String(mod?.name || mod?.displayName || "").toLowerCase();
  if (n.includes("mc command") || n.startsWith("mc ") || n.startsWith("mc_") || n.includes("mccc"))
    return "Deaderpool";
  if (n.includes("wickedwhims") || n.includes("wonderfulwhims") || n.startsWith("ww_"))
    return "TURBODRIVER";
  if (n.includes("ui cheats") || n.includes("ui_cheats")) return "weerbesu";
  if (n.includes("xml injector") || n.includes("xmlinjector")) return "Scumbumbo";
  if (n.includes("basemental")) return "Basemental";
  if (n.includes("lumpinou") || n.includes("rpo_") || n.includes("relationship & pregnancy"))
    return "Lumpinou";
  if (n.includes("littlemssam") || n.startsWith("lms_")) return "LittleMsSam";
  if (n.includes("twistedmexi") || n.includes("betterbuildbuy") || n.includes("tool mod"))
    return "TwistedMexi";
  if (n.includes("kawaiistacie")) return "KawaiiStacie";
  if (n.includes("adeepindigo")) return "adeepindigo";
  if (n.includes("kiarasims")) return "KiaraSims4Mods";
  if (n.includes("lot51") || n.includes("lot 51")) return "Lot 51";
  if (n.includes("pandasama")) return "PandaSama";
  return fallbackText;
}

export default function StagingPayloadEditor({
  showHeader = true,
  onOpenDossier,
  onBrowseMods,
  onBrowseBlueprints,
}: {
  showHeader?: boolean;
  onSetStatus?: (msg: string) => void;
  onOpenDossier?: (mod: any) => void;
  onBrowseMods?: () => void;
  onBrowseBlueprints?: () => void;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const setView = useStore((state) => state.setView);
  const setMarketTab = useStore((state) => state.setMarketTab);

  const {
    stagingDraftMode,
    setStagingDraftMode,
    stagingDraftName,
    setStagingDraftName,
    stagingDraftCode,
    stagingDraftNotes,
    setStagingDraftNotes,
    stagingDraftAutoEquip,
    setStagingDraftAutoEquip,
    stagingDraftStrategy,
    setStagingDraftStrategy,
    stagingDraftItems,
    setStagingDraftItems,
    stagingDraftLastSavedAt,
    savedLocalDrafts,
    saveCurrentDraftLocally,
    loadSavedLocalDraft,
    deleteSavedLocalDraft,
    toggleModInStagingDraft,
    clearStagingDraft,
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    setIsSignatureQueueOpen,
  } = useModalStore();

  const [activeSubTab, setActiveSubTab] = useState<
    "INCLUDED" | "SETTINGS" | "SAVED" | "CLOUD"
  >("INCLUDED");
  const [searchFilter, setSearchFilter] = useState("");
  const [isResolvingDeps, setIsResolvingDeps] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isShredding, setIsShredding] = useState(false);

  // Preview Sidebar for Nexus Assets (Lexicons, Chameleons, Templates)
  const [previewAsset, setPreviewAsset] = useState<{ id: string; type: string } | null>(null);

  // Saved Draft Inspector SidePanel state
  const [inspectingPack, setInspectingPack] = useState<{
    type: "draft";
    data: any;
  } | null>(null);
  const [inspectSearchQuery, setInspectSearchQuery] = useState("");
  const [inspectFilterTab, setInspectFilterTab] = useState<"ALL" | "STAGED" | "PREMIUM">("ALL");
  const [inspectVisibleCount, setInspectVisibleCount] = useState(80);

  const goToNexusMods = () => {
    if (onBrowseMods) {
      onBrowseMods();
      return;
    }
    setMarketTab("MODS");
    setView("nexus");
  };

  const goToNexusBlueprints = () => {
    if (onBrowseBlueprints) {
      onBrowseBlueprints();
      return;
    }
    setMarketTab("BLUEPRINTS");
    setView("nexus");
  };

  const filteredItems = useMemo(() => {
    const items = stagingDraftItems || [];
    if (!searchFilter.trim()) return items;
    const q = searchFilter.toLowerCase();
    return items.filter(
      (item: any) =>
        (item.displayName || item.name || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q)
    );
  }, [stagingDraftItems, searchFilter]);

  const depsCount = useMemo(
    () => (stagingDraftItems || []).filter((i: any) => i.isDependency).length,
    [stagingDraftItems]
  );

  const premiumCount = useMemo(
    () => (stagingDraftItems || []).filter((i: any) => i.is_paid || i.is_early_access).length,
    [stagingDraftItems]
  );

  const isSingleModStaged = (mod: any) => {
    const isNexusAsset =
      mod?.asset_type === "lexicon" ||
      mod?.asset_type === "chameleon" ||
      mod?.asset_type === "workbench_template";
    if (isNexusAsset) {
      const assetId = `asset_${mod.asset_type}_${mod.asset_id || mod.id}`.toLowerCase();
      return (stagingDraftItems || []).some(
        (item: any) => String(item.id || "").toLowerCase() === assetId
      );
    }
    const targetId = String(mod.id || mod.dbId || mod.hash || mod.name || "");
    const targetHash = String(mod.hash || "");
    const targetName = String(mod.name || mod.displayName || "").toLowerCase();
    return (stagingDraftItems || []).some(
      (item: any) =>
        (targetId && String(item.id) === targetId) ||
        (targetHash && item.hash && String(item.hash) === targetHash) ||
        (targetName && String(item.name || "").toLowerCase() === targetName)
    );
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setStagingDraftItems((prev: any[]) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((item, idx) => ({ ...item, load_order_index: idx }));
    });
  };

  const updateItemTier = (id: string, tier: string) => {
    setStagingDraftItems((prev: any[]) =>
      prev.map((item) => (item.id === id ? { ...item, priority_tier: tier } : item))
    );
  };

  const sortItemsByPriorityTier = () => {
    const rank = (tier?: string) => {
      if (tier === "1_Core") return 1;
      if (tier === "2_Gameplay") return 2;
      if (tier === "4_Overrides") return 4;
      return 3;
    };
    setStagingDraftItems((prev: any[]) => {
      const sorted = [...prev].sort((a, b) => {
        const rDiff = rank(a.priority_tier) - rank(b.priority_tier);
        if (rDiff !== 0) return rDiff;
        return String(a.displayName || a.name || "").localeCompare(
          String(b.displayName || b.name || "")
        );
      });
      return sorted.map((item, idx) => ({ ...item, load_order_index: idx }));
    });
    useStore
      .getState()
      .pushStatus(
        t("status_draft_sorted_by_tier", "{Blueprint} sorted by Priority Tier sequence."),
        "info"
      );
  };

  const removeItem = (id: string) => {
    setStagingDraftItems((prev: any[]) =>
      prev.filter((item) => item.id !== id).map((item, idx) => ({ ...item, load_order_index: idx }))
    );
  };

  const handleSaveSnapshotLocally = () => {
    saveCurrentDraftLocally();
    useStore
      .getState()
      .pushStatus(
        t("status_draft_saved_locally", "Blueprint draft saved in local device memory."),
        "success"
      );
  };

  // Automatically resolve and heal parent/child dependencies (e.g. MC Woohoo -> requires MC CMD Center)
  useEffect(() => {
    let cancelled = false;
    const current = useModalStore.getState().stagingDraftItems || [];
    if (current.length === 0) return;
    resolvePayloadDependencies(current).then(({ mergedItems }) => {
      if (cancelled) return;
      const beforeJson = JSON.stringify(
        current.map((i: any) => ({
          id: i.id,
          isDependency: !!i.isDependency,
          dependencyOf: i.dependencyOf || "",
          priority_tier: i.priority_tier || "",
        }))
      );
      const afterJson = JSON.stringify(
        mergedItems.map((i: any) => ({
          id: i.id,
          isDependency: !!i.isDependency,
          dependencyOf: i.dependencyOf || "",
          priority_tier: i.priority_tier || "",
        }))
      );
      if (beforeJson !== afterJson) {
        setStagingDraftItems(
          mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStageModWithAutoDeps = async (mod: any) => {
    const added = toggleModInStagingDraft(mod);
    const latestItems = useModalStore.getState().stagingDraftItems || [];
    if (latestItems.length > 0) {
      const { mergedItems, addedCount } = await resolvePayloadDependencies(latestItems);
      setStagingDraftItems(
        mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
      );
      if (added && addedCount > 0) {
        useStore
          .getState()
          .pushStatus(
            `${t("resolved", "Resolved")} ${addedCount} ${t(
              "status_deps_resolved_suffix",
              "child dependencies."
            )}`,
            "info"
          );
      }
    }
  };

  const handleResolveDependencies = async () => {
    if (!stagingDraftItems || stagingDraftItems.length === 0) return;
    setIsResolvingDeps(true);
    try {
      const { mergedItems, addedCount } = await resolvePayloadDependencies(stagingDraftItems);
      setStagingDraftItems(
        mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
      );
      if (addedCount > 0) {
        useStore
          .getState()
          .pushStatus(
            `${t("resolved", "Resolved")} ${addedCount} ${t(
              "status_deps_resolved_suffix",
              "child dependencies."
            )}`,
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(
            t("status_no_extra_deps", "All required dependencies are already in the payload."),
            "info"
          );
      }
    } finally {
      setIsResolvingDeps(false);
    }
  };

  const handleEncryptAndTransmit = async () => {
    if (!session?.user?.id) {
      useStore
        .getState()
        .pushStatus(t("alert_guest_mode_uploads", "Please sign in to use Cloud Staging."), "error");
      return;
    }
    if (!stagingDraftItems || stagingDraftItems.length === 0) return;

    setIsTransmitting(true);
    try {
      const { mergedItems } = await resolvePayloadDependencies(stagingDraftItems);
      const indexedItems = mergedItems.map((item, idx) => ({
        ...item,
        load_order_index: idx,
      }));

      const payloadName =
        stagingDraftName.trim() ||
        (stagingDraftMode === "blueprint"
          ? t("staging_mode_blueprint", "Curated {Blueprint}")
          : t("staging_mode_mod_queue", "{Mod} Download Queue"));

      const modTiers: Record<string, string> = {};
      indexedItems.forEach((item) => {
        const cleanFile = (item.name || "").split(/[\\/]/).pop() || item.name;
        if (cleanFile) {
          modTiers[cleanFile] = item.priority_tier || "3_Standard";
        }
      });

      const payload: StagedCloudPayload = {
        mode: stagingDraftMode,
        blueprintName: payloadName,
        blueprintCode:
          stagingDraftCode ||
          `SANC-BP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        gameVersion: selectedVersion || "all",
        notes: stagingDraftNotes.trim() || undefined,
        autoEquip: stagingDraftAutoEquip,
        loadOrderStrategy: stagingDraftStrategy,
        modTiers,
        items: indexedItems,
        loadOrder: indexedItems.map(
          (i) => (i.name || "").split(/[\\/]/).pop() || i.name
        ),
        stagedAt: new Date().toISOString(),
        sourceDevice: getSourceDeviceLabel(),
      };

      const res = await pushEncryptedStagingPayload(payload, session);
      if (!res.success) {
        throw new Error(res.error || "Failed to transmit encrypted payload");
      }

      clearStagingDraft();
      window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));
      setActiveSubTab("CLOUD");

      useStore
        .getState()
        .pushStatus(
          t(
            "status_staging_transmitted",
            "Encrypted staging payload sent to cloud! Open your Desktop client to sign and deploy."
          ),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsTransmitting(false);
    }
  };

  const handleLoadActiveCloudIntoEditor = () => {
    const cloud = volatileSignatureQueue as ResolvedStagedPayload | null;
    if (!cloud?.payload) return;
    setStagingDraftMode(cloud.payload.mode || "blueprint");
    setStagingDraftName(cloud.payload.blueprintName || "");
    setStagingDraftNotes(cloud.payload.notes || "");
    setStagingDraftAutoEquip(cloud.payload.autoEquip ?? true);
    if (cloud.payload.loadOrderStrategy) {
      setStagingDraftStrategy(cloud.payload.loadOrderStrategy);
    }
    setStagingDraftItems(cloud.payload.items || []);
    setActiveSubTab("INCLUDED");
  };

  const handleShredActiveCloud = async () => {
    const cloud = volatileSignatureQueue as ResolvedStagedPayload | null;
    setIsShredding(true);
    try {
      await shredCloudStagingRow(cloud?.rowId, session);
      setVolatileSignatureQueue(null);
      useStore
        .getState()
        .pushStatus(
          t("status_staging_shredded", "Cloud staging payload permanently shredded."),
          "info"
        );
    } finally {
      setIsShredding(false);
    }
  };

  const activeCloud = volatileSignatureQueue as ResolvedStagedPayload | null;

  const extractBlueprintArtifacts = (bpOrDraft: any): any[] => {
    if (Array.isArray(bpOrDraft?.flavors)) return bpOrDraft.flavors;
    if (Array.isArray(bpOrDraft?.items)) return bpOrDraft.items;
    let raw = bpOrDraft?.artifacts || bpOrDraft?.json_data?.artifacts;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (raw && !Array.isArray(raw) && Array.isArray(raw.artifacts)) {
      raw = raw.artifacts;
    }
    return Array.isArray(raw) ? raw : [];
  };

  const inspectedAllItems = useMemo(() => {
    if (!inspectingPack?.data) return [];
    return extractBlueprintArtifacts(inspectingPack.data);
  }, [inspectingPack]);

  const inspectedFilteredItems = useMemo(() => {
    let list = inspectedAllItems;
    if (inspectFilterTab === "STAGED") {
      list = list.filter((m: any) => isSingleModStaged(m));
    } else if (inspectFilterTab === "PREMIUM") {
      list = list.filter((m: any) => m.is_paid || m.is_early_access);
    }
    if (inspectSearchQuery.trim()) {
      const q = inspectSearchQuery.toLowerCase();
      list = list.filter(
        (m: any) =>
          String(m.displayName || m.name || "").toLowerCase().includes(q) ||
          String(m.author || m.master_author || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [inspectedAllItems, inspectFilterTab, inspectSearchQuery, stagingDraftItems]);

  const subTabs = [
    {
      id: "INCLUDED" as const,
      icon: t("icon_inventory_2", "inventory_2"),
      label: t("blueprint_included", "Included {Mods}"),
      count: stagingDraftItems.length,
    },
    {
      id: "SETTINGS" as const,
      icon: t("icon_tune", "tune"),
      label: t("staging_tab_settings", "{Blueprint} Settings"),
      count: stagingDraftMode === "blueprint" ? 4 : 2,
    },
    {
      id: "SAVED" as const,
      icon: t("icon_bookmark", "bookmark"),
      label: t("staging_tab_saved", "Saved Drafts"),
      count: savedLocalDrafts.length,
    },
    {
      id: "CLOUD" as const,
      icon: t("icon_phonelink_ring", "phonelink_ring"),
      label: t("staging_tab_cloud", "Active PC Queue"),
      count: activeCloud?.resolvedItems?.length || 0,
    },
  ];

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-44 md:pb-16 w-full">
      {showHeader ? (
        <>
          <ViewHeader
            title={t("playsets_title", "{Blueprints}")}
            subtitle={t("staging_subtitle", "Curate {mods} or {blueprints} on web/PWA and push an encrypted staging payload to your desktop client")}
            icon={t("icon_map", "map")}
            iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            shape="circle"
            breadcrumb={
              activeSubTab !== "INCLUDED"
                ? subTabs.find((st) => st.id === activeSubTab)?.label
                : undefined
            }
            onTitleClick={() => setActiveSubTab("INCLUDED")}
          >
            {activeSubTab === "INCLUDED" && stagingDraftItems.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500 w-full xl:w-auto">
                <ActionPill
                  searchQuery={searchFilter}
                  setSearchQuery={setSearchFilter}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                />
              </div>
            )}
          </ViewHeader>

          <div className="flex flex-col w-full gap-3 mb-6 relative z-10 shrink-0">
            <StatTileCarousel>
              {subTabs.map((st) => (
                <DashboardStatTile
                  key={st.id}
                  variant="tab"
                  icon={st.icon}
                  label={st.label}
                  number={st.count}
                  onClick={() => setActiveSubTab(st.id)}
                  isActive={activeSubTab === st.id}
                />
              ))}
            </StatTileCarousel>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6 w-full">
          {subTabs.map((st) => {
            const active = activeSubTab === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setActiveSubTab(st.id)}
                className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] shadow-md"
                    : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-75 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[18px] shrink-0">
                    {st.icon}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    {st.label}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[9px] font-black shrink-0">
                  {st.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <CommandScreenLayout>
        <CommandScreenBody>
          <CommandScreenMain>
            {/* TAB 1: INCLUDED MODS / CC */}
            {activeSubTab === "INCLUDED" && (
              <div className="flex flex-col gap-5 w-full">
                {/* Compact Draft Identity & Action Bar */}
                <div className="glass-panel p-5 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                        <span className="material-symbols-outlined !text-[20px]">
                          {stagingDraftMode === "blueprint"
                            ? t("icon_map", "map")
                            : t("icon_phonelink", "phonelink")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-black text-[var(--text)] truncate">
                            {stagingDraftName.trim() ||
                              (stagingDraftMode === "blueprint"
                                ? t("staging_mode_blueprint", "Curated {Blueprint}")
                                : t("staging_mode_mod_queue", "{Mod} Download Queue"))}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[8.5px] font-black text-emerald-400 uppercase tracking-widest">
                            <span className="material-symbols-outlined !text-[11px]">
                              {t("icon_memory", "memory")}
                            </span>
                            {t("staging_local_memory_badge", "Saved on Your Device")}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70">
                          {stagingDraftItems.length} {t("term_mods", "Items")} •{" "}
                          {stagingDraftMode === "blueprint"
                            ? t("staging_mode_blueprint", "Curated {Blueprint}")
                            : t("staging_mode_mod_queue", "{Mod} Download Queue")}
                        </span>
                      </div>
                    </div>

                    <ActionButton
                      onClick={() => setActiveSubTab("SETTINGS")}
                      icon={t("icon_tune", "tune")}
                      label={t("staging_tab_settings", "{Blueprint} Settings")}
                      variant="default"
                      className="shrink-0 !px-3.5 !py-2 !text-[9.5px] whitespace-nowrap"
                    />
                  </div>

                  {/* Quick Actions Row */}
                  <div
                    className={`grid grid-cols-1 ${
                      stagingDraftItems.length > 0 || stagingDraftName.trim()
                        ? "sm:grid-cols-3"
                        : "sm:grid-cols-2"
                    } gap-2.5 items-stretch`}
                  >
                    <ActionButton
                      onClick={goToNexusMods}
                      icon={t("icon_add_circle", "add_circle")}
                      label={t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                      variant="accent"
                      className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                    />

                    <ActionButton
                      disabled={stagingDraftItems.length === 0 && !stagingDraftName.trim()}
                      onClick={handleSaveSnapshotLocally}
                      icon={t("icon_bookmark", "bookmark")}
                      label={t("staging_btn_save_snapshot", "Save Draft on Device")}
                      variant="default"
                      className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                    />

                    {(stagingDraftItems.length > 0 || stagingDraftName.trim()) && (
                      <ActionButton
                        onClick={clearStagingDraft}
                        icon={t("icon_delete", "delete")}
                        label={t("staging_btn_clear_draft", "Clear Draft")}
                        variant="danger"
                        className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                      />
                    )}
                  </div>
                </div>

                {/* Staged Items Section */}
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_inventory_2", "inventory_2")}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-[var(--text)] uppercase tracking-wider">
                        {t("blueprint_included", "Included {Mods}")} ({stagingDraftItems.length})
                      </h3>
                    </div>

                    {stagingDraftItems.length > 0 && (
                      <div
                        className={`grid grid-cols-1 ${
                          stagingDraftMode === "blueprint" ? "sm:grid-cols-2" : ""
                        } gap-2.5 w-full sm:w-auto items-stretch`}
                      >
                        {stagingDraftMode === "blueprint" && (
                          <ActionButton
                            onClick={sortItemsByPriorityTier}
                            icon={t("icon_sort", "sort")}
                            label={t("staging_btn_sort_tiers", "Auto-Sort by Tier")}
                            variant="default"
                            className="w-full !px-3.5 !py-2 !text-[9.5px] whitespace-nowrap"
                          />
                        )}

                        <ActionButton
                          disabled={isResolvingDeps}
                          onClick={handleResolveDependencies}
                          icon={t("icon_account_tree", "account_tree")}
                          label={
                            isResolvingDeps
                              ? t("staging_btn_resolving_deps", "Resolving...")
                              : t("staging_btn_resolve_deps", "Resolve Dependencies")
                          }
                          variant="accent"
                          className="w-full !px-3.5 !py-2 !text-[9.5px] whitespace-nowrap"
                        />
                      </div>
                    )}
                  </div>

                  {stagingDraftItems.length === 0 ? (
                    <div className="glass-panel p-8 md:p-12 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-16 h-16 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center text-[var(--accent)] shadow-lg">
                        <span className="material-symbols-outlined !text-[32px]">
                          {t("icon_map", "map")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 max-w-md">
                        <h3 className="text-base md:text-lg font-black text-[var(--text)] capitalize tracking-wide">
                          {t("staging_empty_title", "No Items in Staging Draft")}
                        </h3>
                        <p className="text-xs font-bold text-[var(--subtext)] opacity-70 leading-relaxed">
                          {t("staging_empty_desc", "Browse {Mods} or {Blueprints} in the Nexus and click Stage to build your encrypted desktop queue.")}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md mt-2 items-stretch">
                        <ActionButton
                          onClick={goToNexusMods}
                          icon={t("icon_extension", "extension")}
                          label={t("staging_catalog_tab_mods", "Search Catalog")}
                          variant="accent"
                          className="w-full !px-4 !py-2.5 !text-[10px] whitespace-nowrap"
                        />
                        <ActionButton
                          onClick={goToNexusBlueprints}
                          icon={t("icon_collections_bookmark", "collections_bookmark")}
                          label={t("staging_catalog_tab_blueprints", "Remix {Blueprint}")}
                          variant="default"
                          className="w-full !px-4 !py-2.5 !text-[10px] whitespace-nowrap"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {filteredItems.map((item: any, idx: number) => {
                        const realIdx = stagingDraftItems.findIndex((x: any) => x.id === item.id);
                        const currentTier = item.priority_tier || "3_Standard";
                        const tierMeta =
                          PRIORITY_TIERS.find((pt) => pt.id === currentTier) || PRIORITY_TIERS[2];
                        const isNexusAsset =
                          item.asset_type === "lexicon" ||
                          item.asset_type === "chameleon" ||
                          item.asset_type === "workbench_template";

                        return (
                          <div
                            key={`${item.id}_${idx}`}
                            onClick={() => {
                              if (isNexusAsset && item.asset_id) {
                                setPreviewAsset({
                                  id: String(item.asset_id),
                                  type: item.asset_type,
                                });
                              } else {
                                onOpenDossier?.({ ...item, isNexusView: true });
                              }
                            }}
                            className="glass-surface p-3.5 md:p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group cursor-pointer shadow-md"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {stagingDraftMode === "blueprint" && (
                                <span className="px-2 py-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-mono font-black text-[var(--accent)] shrink-0">
                                  #{String((realIdx >= 0 ? realIdx : idx) + 1).padStart(3, "0")}
                                </span>
                              )}

                              <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[19px]">
                                  {isNexusAsset
                                    ? item.asset_type === "lexicon"
                                      ? t("icon_translate", "translate")
                                      : item.asset_type === "chameleon"
                                        ? t("icon_palette", "palette")
                                        : t("icon_draw", "draw")
                                    : getModIcon(item, activeGameSchema, t)}
                                </span>
                              </div>

                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-[var(--text)] capitalize truncate group-hover:theme-text-accent transition-colors">
                                    {cleanSearchName(
                                      item.displayName || item.name,
                                      activeGameSchema
                                    )}
                                  </span>

                                  {isNexusAsset && (
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                      <span className="material-symbols-outlined !text-[10px]">
                                        {t("icon_bolt", "bolt")}
                                      </span>
                                      {t("sig_queue_badge_direct_install", "Direct OS Install")}
                                    </span>
                                  )}

                                  {item.isDependency && (
                                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-[8px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                      <span className="material-symbols-outlined !text-[10px]">
                                        {t("icon_account_tree", "account_tree")}
                                      </span>
                                      {t("staging_badge_dependency", "Dependency")}
                                    </span>
                                  )}

                                  {item.is_early_access && (
                                    <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/35 text-[8px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                      {t("badge_early_access", "Early Access")}
                                    </span>
                                  )}

                                  {item.is_paid && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-[8px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                      {t("badge_paid", "Paid")}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate">
                                    {resolveKnownAuthor(item, t("unknown_mason", "Unknown {Mason}"))}
                                  </span>
                                  {item.dependencyOf && (
                                    <span className="text-[8px] font-bold text-cyan-400/80 capitalize tracking-wider">
                                      • {t("staging_dep_of_prefix", "Required by")}{" "}
                                      {item.dependencyOf}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center justify-end gap-1.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {stagingDraftMode === "blueprint" && !isNexusAsset && (
                                <>
                                  <CustomDropdown
                                    value={currentTier}
                                    onChange={(val: string[]) => {
                                      const next = Array.isArray(val) ? val[0] : val;
                                      if (next) updateItemTier(item.id, next);
                                    }}
                                    options={PRIORITY_TIERS.map((pt) => ({
                                      id: pt.id,
                                      label: t(pt.labelKey, pt.fallback),
                                    }))}
                                    variant="pill"
                                    flat={true}
                                    disableTint={true}
                                    className="w-auto min-w-[140px] max-w-[195px]"
                                    buttonClassName={`!px-2.5 !py-1.5 !rounded-xl !text-[9px] !font-black uppercase tracking-wider border ${tierMeta.badgeClass}`}
                                  />

                                  <button
                                    type="button"
                                    disabled={realIdx <= 0}
                                    onClick={() => moveItem(realIdx, -1)}
                                    className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--text)] disabled:opacity-25 transition-all cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined !text-[15px]">
                                      {t("icon_arrow_upward", "arrow_upward")}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={realIdx < 0 || realIdx >= stagingDraftItems.length - 1}
                                    onClick={() => moveItem(realIdx, 1)}
                                    className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--text)] disabled:opacity-25 transition-all cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined !text-[15px]">
                                      {t("icon_arrow_downward", "arrow_downward")}
                                    </span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] flex items-center justify-center text-[var(--text)] transition-all group/btn relative cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_close", "close")}
                                </span>
                                <HoverTooltip
                                  title={t("btn_remove", "{Remove}")}
                                  variant="danger"
                                  className="group-hover/btn:flex z-[200]"
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: MODPACK SETTINGS */}
            {activeSubTab === "SETTINGS" && (
              <div className="glass-panel p-5 md:p-7 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl flex flex-col gap-5 relative w-full">
                <div className="flex flex-col gap-3.5 pb-4 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0 shadow-inner">
                        <span className="material-symbols-outlined !text-[22px]">
                          {t("icon_tune", "tune")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <h2 className="text-base sm:text-xl font-black text-[var(--text)] capitalize tracking-tight leading-snug">
                          {t("staging_tab_settings", "{Blueprint} Settings")}
                        </h2>
                        <span className="inline-flex w-max items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[8.5px] font-black text-emerald-400 uppercase tracking-widest">
                          <span className="material-symbols-outlined !text-[11px]">
                            {t("icon_memory", "memory")}
                          </span>
                          {t("staging_local_memory_badge", "Saved on Your Device")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] font-bold text-[var(--subtext)] opacity-75 leading-relaxed">
                    {t(
                      "staging_local_memory_desc",
                      "Held in local device memory across reloads until you send it to the cloud or discard it."
                    )}
                  </p>

                  {/* Responsive 2-Button Mode Selector */}
                  <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
                    {[
                      {
                        id: "blueprint" as const,
                        icon: t("icon_map", "map"),
                        label: t("staging_mode_blueprint", "Curated {Blueprint}"),
                      },
                      {
                        id: "mod_queue" as const,
                        icon: t("icon_download", "download"),
                        label: t("staging_mode_mod_queue", "{Mod} Download Queue"),
                      },
                    ].map((opt) => {
                      const isSelected = stagingDraftMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStagingDraftMode(opt.id)}
                          className={`h-11 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center leading-tight ${
                            isSelected
                              ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] shadow-sm"
                              : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[15px] shrink-0">
                            {opt.icon}
                          </span>
                          <span className="line-clamp-1">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-65 uppercase tracking-widest ml-1">
                      {t("staging_payload_name_label", "Payload / {Blueprint} Name")}
                    </label>
                    <input
                      type="text"
                      value={stagingDraftName}
                      onChange={(e) => setStagingDraftName(e.target.value)}
                      placeholder={t("staging_payload_name_ph", "e.g. Curated Nexus Blueprint...")}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-65 uppercase tracking-widest ml-1">
                      {t("staging_notes_label", "Dispatch Note (Optional)")}
                    </label>
                    <input
                      type="text"
                      value={stagingDraftNotes}
                      onChange={(e) => setStagingDraftNotes(e.target.value)}
                      placeholder={t(
                        "staging_notes_ph",
                        "Add a reminder or note for when you review on desktop..."
                      )}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
                    />
                  </div>
                </div>

                {stagingDraftMode === "blueprint" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Auto-Equip Toggle */}
                    <div
                      onClick={() => setStagingDraftAutoEquip(!stagingDraftAutoEquip)}
                      className={`flex items-center justify-between gap-3.5 p-3.5 rounded-2xl glass-surface border transition-all cursor-pointer ${
                        stagingDraftAutoEquip
                          ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                            stagingDraftAutoEquip
                              ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                              : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-60"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[18px]">
                            {t("icon_rocket_launch", "rocket_launch")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] leading-snug">
                            {t("staging_auto_equip_title", "Auto-Deploy Owned {Mods} on Approval")}
                          </span>
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-65 leading-snug">
                            {t("staging_auto_equip_desc", "Immediately equip and symlink already-owned {mods} when you sign on desktop.")}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 border flex items-center ${
                          stagingDraftAutoEquip
                            ? "bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] justify-end"
                            : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] justify-start"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full transition-all shadow-sm ${
                            stagingDraftAutoEquip
                              ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                              : "bg-[var(--subtext)] opacity-50"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Load Order Strategy Dropdown */}
                    <div className="flex flex-col justify-center gap-1.5 p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-30">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 ml-1">
                        {t("staging_strategy_label", "Load Order Strategy")}
                      </span>
                      <div className="h-10 w-full relative z-40">
                        <CustomDropdown
                          disableTint={true}
                          flat={true}
                          variant="pill"
                          value={stagingDraftStrategy}
                          onChange={(val: string[]) => {
                            const next = val[0] as
                              | "alphabetical"
                              | "numeric_prefix"
                              | "loadorder_txt";
                            if (next) setStagingDraftStrategy(next);
                          }}
                          options={[
                            {
                              id: "alphabetical",
                              label: t("staging_strategy_alpha", "Alphabetical (Default)"),
                            },
                            {
                              id: "numeric_prefix",
                              label: t("lo_strategy_prefix", "Numeric Tier Prefix"),
                            },
                            {
                              id: "loadorder_txt",
                              label: t("staging_strategy_manifest", "Load Order Manifest"),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] items-stretch">
                  <ActionButton
                    onClick={() => setActiveSubTab("INCLUDED")}
                    icon={t("icon_inventory_2", "inventory_2")}
                    label={`${t("blueprint_included", "Included {Mods}")} (${stagingDraftItems.length})`}
                    variant="accent"
                    className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                  />

                  <ActionButton
                    disabled={stagingDraftItems.length === 0 && !stagingDraftName.trim()}
                    onClick={handleSaveSnapshotLocally}
                    icon={t("icon_bookmark", "bookmark")}
                    label={t("staging_btn_save_snapshot", "Save Draft on Device")}
                    variant="default"
                    className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: SAVED DRAFTS */}
            {activeSubTab === "SAVED" && (
              <div className="flex flex-col gap-4 w-full">
                {(stagingDraftItems.length > 0 || stagingDraftName.trim()) && (
                  <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_bookmark", "bookmark")}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-[var(--text)] truncate">
                          {stagingDraftName.trim() ||
                            t("staging_mode_blueprint", "Curated {Blueprint}")}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70">
                          {stagingDraftItems.length} {t("term_mods", "Items")}
                        </span>
                      </div>
                    </div>

                    <ActionButton
                      onClick={handleSaveSnapshotLocally}
                      icon={t("icon_bookmark", "bookmark")}
                      label={t("staging_btn_save_snapshot", "Save Draft on Device")}
                      variant="accent"
                      className="shrink-0 !px-4 !py-2.5 !text-[10px] whitespace-nowrap"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {savedLocalDrafts.length === 0 ? (
                    <div className="col-span-full glass-panel p-10 rounded-3xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-center flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined !text-[28px] text-[var(--accent)] opacity-75">
                        {t("icon_bookmark", "bookmark")}
                      </span>
                      <span className="text-sm font-black text-[var(--text)]">
                        {t("staging_tab_saved", "Saved Drafts")} (0)
                      </span>
                      <span className="text-xs font-bold text-[var(--subtext)] opacity-65 max-w-sm">
                        {t(
                          "staging_local_memory_desc",
                          "Held in local device memory across reloads until you send it to the cloud or discard it."
                        )}
                      </span>
                    </div>
                  ) : (
                    savedLocalDrafts.map((draft: any) => (
                      <div
                        key={draft.id}
                        className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all flex flex-col justify-between gap-3.5 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3 min-w-0 w-full">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                              <span className="material-symbols-outlined !text-[20px]">
                                {t("icon_bookmark", "bookmark")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <span className="text-sm font-black text-[var(--text)] leading-snug break-words line-clamp-2">
                                {draft.name}
                              </span>
                              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-65">
                                {(draft.items || []).length} {t("term_mods", "Items")} •{" "}
                                {draft.code || "LOCAL"}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteSavedLocalDraft(draft.id)}
                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center cursor-pointer shrink-0 transition-all"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_delete", "delete")}
                            </span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                          <ActionButton
                            onClick={() => {
                              setInspectSearchQuery("");
                              setInspectFilterTab("ALL");
                              setInspectVisibleCount(80);
                              setInspectingPack({ type: "draft", data: draft });
                            }}
                            icon={t("icon_visibility", "visibility")}
                            label={t("staging_btn_view_contents", "View {Mods}")}
                            variant="default"
                            className="w-full !px-3 !py-2.5 !text-[10px] whitespace-nowrap"
                          />

                          <ActionButton
                            onClick={() => {
                              loadSavedLocalDraft(draft.id);
                              setActiveSubTab("INCLUDED");
                            }}
                            icon={t("icon_download", "download")}
                            label={t("staging_btn_use_short", "Use {Blueprint}")}
                            variant="accent"
                            className="w-full !px-3 !py-2.5 !text-[10px] whitespace-nowrap"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: ACTIVE PC QUEUE */}
            {activeSubTab === "CLOUD" && (
              <div className="flex flex-col gap-4 w-full">
                {!activeCloud ? (
                  <div className="glass-panel p-8 md:p-12 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center text-[var(--accent)] shadow-lg">
                      <span className="material-symbols-outlined !text-[32px]">
                        {t("icon_phonelink_ring", "phonelink_ring")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 max-w-md">
                      <h3 className="text-base md:text-lg font-black text-[var(--text)] capitalize tracking-wide">
                        {t("staging_empty_cloud_title", "No Active Payload Waiting for PC")}
                      </h3>
                      <p className="text-xs font-bold text-[var(--subtext)] opacity-70 leading-relaxed">
                        {t(
                          "staging_empty_cloud_desc",
                          "When you click Send to My PC, your encrypted queue appears here until you approve or clear it on your desktop client."
                        )}
                      </p>
                    </div>
                    <ActionButton
                      onClick={() => setActiveSubTab("INCLUDED")}
                      icon={t("icon_inventory_2", "inventory_2")}
                      label={t("blueprint_included", "Included {Mods}")}
                      variant="accent"
                      className="!px-5 !py-2.5 !text-[10px] whitespace-nowrap mt-1"
                    />
                  </div>
                ) : (
                  <div className="glass-panel p-5 md:p-7 rounded-3xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex flex-col gap-5 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex items-center justify-center text-[var(--success)] shrink-0">
                          <span className="material-symbols-outlined !text-[22px] animate-pulse">
                            {t("icon_phonelink_ring", "phonelink_ring")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--success)]">
                            {t("staging_active_cloud_title", "Awaiting Desktop Signature")}
                          </span>
                          <h3 className="text-base sm:text-xl font-black text-[var(--text)] truncate">
                            {activeCloud.payload.blueprintName}
                          </h3>
                          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70">
                            {(activeCloud.resolvedItems || []).length} {t("term_mods", "Items")} •{" "}
                            {activeCloud.payload.mode === "blueprint"
                              ? t("staging_mode_blueprint", "Curated {Blueprint}")
                              : t("staging_mode_mod_queue", "{Mod} Download Queue")}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto items-stretch">
                        <ActionButton
                          onClick={handleLoadActiveCloudIntoEditor}
                          icon={t("icon_edit", "edit")}
                          label={t("staging_btn_load_to_editor", "Edit")}
                          variant="default"
                          className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                        />

                        <ActionButton
                          disabled={isShredding}
                          onClick={handleShredActiveCloud}
                          icon={t("icon_delete_forever", "delete_forever")}
                          label={t("staging_btn_shred_short", "Clear")}
                          variant="danger"
                          className="w-full !px-3.5 !py-2.5 !text-[10px] whitespace-nowrap"
                        />
                      </div>
                    </div>

                    {isDesktop() && (
                      <ActionButton
                        onClick={() => setIsSignatureQueueOpen(true)}
                        icon={t("icon_draw", "draw")}
                        label={t("sig_queue_title", "Signature Queue")}
                        variant="accent"
                        className="w-full !py-3 !text-[10px]"
                      />
                    )}

                    <div className="flex flex-col gap-2">
                      {(activeCloud.resolvedItems || []).map((mod: any, idx: number) => (
                        <div
                          key={`${mod.id || mod.name}_${idx}`}
                          onClick={() => onOpenDossier?.({ ...mod, isNexusView: true })}
                          className="glass-surface p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-mono font-black text-[var(--accent)] shrink-0">
                              #{String(idx + 1).padStart(3, "0")}
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                              <span className="material-symbols-outlined !text-[18px]">
                                {getModIcon(mod, activeGameSchema, t)}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black text-[var(--text)] truncate">
                                  {cleanSearchName(
                                    mod.displayName || mod.name,
                                    activeGameSchema
                                  )}
                                </span>
                                {mod.isDependency && (
                                  <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-[8px] font-black text-cyan-400 uppercase tracking-widest">
                                    {t("staging_badge_dependency", "Dependency")}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 truncate">
                                {resolveKnownAuthor(mod, t("unknown_mason", "Unknown {Mason}"))}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CommandScreenMain>

          <CommandScreenSidebar
            title={t("staging_security_card_title", "Zero-Knowledge Cloud Relay")}
            icon={t("icon_encrypted", "encrypted")}
          >
            <div className="flex flex-col gap-5 pb-12">
              {/* Encryption & Transmit Control Card */}
              <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex flex-col gap-4 shadow-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[9px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[13px]">
                      {t("icon_encrypted", "encrypted")}
                    </span>
                    AES-256-GCM
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[9px] font-black text-[var(--success)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[13px]">
                      {t("icon_delete_forever", "delete_forever")}
                    </span>
                    AUTO-SHRED
                  </span>
                </div>

                <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "staging_security_card_desc",
                    "Your queue is encrypted in your browser before upload and permanently shredded from the cloud the instant you approve or reject it on desktop."
                  )}
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="glass-surface p-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col items-center">
                    <span className="text-base font-black text-[var(--text)]">
                      {stagingDraftItems.length}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t("term_mods", "Items")}
                    </span>
                  </div>
                  <div className="glass-surface p-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col items-center">
                    <span className="text-base font-black text-cyan-400">{depsCount}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t("section_deps_title", "Deps")}
                    </span>
                  </div>
                  <div className="glass-surface p-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col items-center">
                    <span className="text-base font-black text-amber-400">{premiumCount}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t("badge_premium", "Premium")}
                    </span>
                  </div>
                </div>

                {stagingDraftLastSavedAt && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-[9px] font-bold text-emerald-400">
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_memory", "memory")}
                    </span>
                    <span className="truncate">
                      {t("staging_local_memory_badge", "Saved on Your Device")}
                    </span>
                  </div>
                )}

                <ActionButton
                  disabled={isTransmitting || stagingDraftItems.length === 0}
                  onClick={handleEncryptAndTransmit}
                  icon={
                    isTransmitting
                      ? t("icon_sync", "sync")
                      : t("icon_encrypted", "encrypted")
                  }
                  label={
                    isTransmitting
                      ? t("staging_btn_transmitting", "Encrypting & Sending...")
                      : t("staging_btn_transmit", "Encrypt & Send to Desktop")
                  }
                  variant="accent"
                  className="w-full !py-3.5 !text-[10px] shadow-lg"
                />
              </div>

              {/* Active Cloud Payload Card (Equal-Height ActionButtons!) */}
              {activeCloud && (
                <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] flex flex-col gap-3.5 shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[15px] animate-pulse">
                        {t("icon_phonelink_ring", "phonelink_ring")}
                      </span>
                      {t("staging_active_cloud_title", "Awaiting Desktop Signature")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[9px] font-black text-[var(--text)]">
                      {activeCloud.resolvedItems?.length || 0} {t("term_mods", "Items")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-black text-[var(--text)] truncate">
                      {activeCloud.payload.blueprintName}
                    </span>
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                      {activeCloud.payload.mode === "blueprint"
                        ? t("staging_mode_blueprint", "Curated {Blueprint}")
                        : t("staging_mode_mod_queue", "{Mod} Download Queue")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-1">
                    {isDesktop() && (
                      <ActionButton
                        onClick={() => setIsSignatureQueueOpen(true)}
                        icon={t("icon_draw", "draw")}
                        label={t("sig_queue_title", "Signature Queue")}
                        variant="accent"
                        className="w-full !py-3 !text-[10px]"
                      />
                    )}

                    <div className="grid grid-cols-2 gap-2.5 items-stretch">
                      <ActionButton
                        onClick={handleLoadActiveCloudIntoEditor}
                        icon={t("icon_edit", "edit")}
                        label={t("staging_btn_load_to_editor", "Edit")}
                        variant="default"
                        className="w-full !px-3 !py-2.5 !text-[10px] whitespace-nowrap"
                      />

                      <ActionButton
                        disabled={isShredding}
                        onClick={handleShredActiveCloud}
                        icon={t("icon_delete_forever", "delete_forever")}
                        label={t("staging_btn_shred_short", "Clear")}
                        variant="danger"
                        className="w-full !px-3 !py-2.5 !text-[10px] whitespace-nowrap"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CommandScreenSidebar>
        </CommandScreenBody>
      </CommandScreenLayout>

      {previewAsset && (
        <AssetPreviewSidebar
          assetType={previewAsset.type}
          assetId={previewAsset.id}
          onClose={() => setPreviewAsset(null)}
        />
      )}

      {inspectingPack &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setInspectingPack(null)}
            title={
              inspectingPack.data?.displayName ||
              inspectingPack.data?.name ||
              t("staging_inspector_title", "{Blueprint} Contents")
            }
            subtitle={t("staging_inspector_subtitle", "Review and filter included {mods} before loading into the builder")}
            icon={t("icon_bookmark", "bookmark")}
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_download", "download")}
                  tooltip={t("staging_btn_load_template", "Load into Builder")}
                  variant="accent"
                  onClick={() => {
                    loadSavedLocalDraft(inspectingPack.data.id);
                    setInspectingPack(null);
                    setActiveSubTab("INCLUDED");
                  }}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-5 pb-10">
              {/* Top Summary & 1-Tap CTA */}
              <SidePanelHeroCard
                title={inspectingPack.data?.displayName || inspectingPack.data?.name || t("staging_inspector_title", "{Blueprint} Contents")}
                subtitle={t("staging_inspector_subtitle", "Review and filter included {mods} before loading into the builder")}
                label={inspectingPack.data?.code || "LOCAL"}
                icon={t("icon_bookmark", "bookmark")}
                variant="accent"
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("term_mods", "Items")}
                      value={inspectedAllItems.length}
                      icon={t("icon_inventory_2", "inventory_2")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("staging_btn_added", "Added")}
                      value={inspectedAllItems.filter((m: any) => isSingleModStaged(m)).length}
                      icon={t("icon_check_circle", "check_circle")}
                      iconColorClass="text-[var(--success)]"
                    />
                  </div>
                  <ActionButton
                    onClick={() => {
                      loadSavedLocalDraft(inspectingPack.data.id);
                      setInspectingPack(null);
                      setActiveSubTab("INCLUDED");
                    }}
                    icon={t("icon_download", "download")}
                    label={t("staging_btn_load_template", "Use This Modpack")}
                    variant="accent"
                    className="w-full !px-4 !py-2.5 !text-[10px] whitespace-nowrap"
                  />
                </div>
              </SidePanelHeroCard>

              {/* Search & Filter Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <ActionPill
                    searchQuery={inspectSearchQuery}
                    setSearchQuery={setInspectSearchQuery}
                    searchPlaceholder={t("search_ph", "Search {mods}...")}
                  />
                </div>
                <GlassSegmentedControl
                  activeTab={inspectFilterTab}
                  setTab={(val: string) =>
                    setInspectFilterTab(val as "ALL" | "STAGED" | "PREMIUM")
                  }
                  options={[
                    {
                      id: "ALL",
                      label: `${t("filter_all", "All")} (${inspectedAllItems.length})`,
                    },
                    {
                      id: "STAGED",
                      label: `${t("staging_btn_added", "Added")} (${
                        inspectedAllItems.filter((m: any) => isSingleModStaged(m)).length
                      })`,
                    },
                    {
                      id: "PREMIUM",
                      label: `${t("badge_premium", "Premium")} (${
                        inspectedAllItems.filter(
                          (m: any) => m.is_paid || m.is_early_access
                        ).length
                      })`,
                    },
                  ]}
                  className="shrink-0"
                />
              </div>

              {/* Included Mods List */}
              <UniversalGroup
                title={`${t("blueprint_included", "Included {Mods}")} (${inspectedFilteredItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {inspectedFilteredItems.length === 0 ? (
                  <div className="glass-surface p-8 rounded-2xl text-center text-xs font-bold text-[var(--subtext)] opacity-65">
                    {t("no_results", "No matching mods found.")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {inspectedFilteredItems
                      .slice(0, inspectVisibleCount)
                      .map((mod: any, idx: number) => {
                        const staged = isSingleModStaged(mod);
                        return (
                          <div
                            key={`${mod.id || mod.hash || mod.name}_${idx}`}
                            onClick={() =>
                              onOpenDossier?.({ ...mod, isNexusView: true })
                            }
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                              staged
                                ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                : "glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-mono font-black text-[var(--accent)] shrink-0">
                                #{String(idx + 1).padStart(3, "0")}
                              </span>
                              <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[18px]">
                                  {getModIcon(mod, activeGameSchema, t)}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-black text-[var(--text)] truncate">
                                    {cleanSearchName(
                                      mod.displayName || mod.name,
                                      activeGameSchema
                                    )}
                                  </span>
                                  {mod.is_early_access && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-transparent border border-purple-500/35 text-[8px] font-black text-purple-400 uppercase tracking-widest">
                                      {t("badge_early_access", "Early Access")}
                                    </span>
                                  )}
                                  {mod.is_paid && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-transparent border border-amber-500/35 text-[8px] font-black text-amber-400 uppercase tracking-widest">
                                      {t("badge_paid", "Paid")}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 truncate">
                                  {resolveKnownAuthor(
                                    mod,
                                    resolveKnownAuthor(
                                      inspectingPack?.data,
                                      t("unknown_mason", "Unknown {Mason}")
                                    )
                                  )}
                                </span>
                              </div>
                            </div>

                            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                              <ActionButton
                                onClick={() =>
                                  handleStageModWithAutoDeps({ ...mod, _stageSingle: true })
                                }
                                icon={
                                  staged
                                    ? t("icon_check", "check")
                                    : t("icon_add", "add")
                                }
                                label={
                                  staged
                                    ? t("staging_btn_added", "Added")
                                    : t("staging_btn_add_mod", "Add")
                                }
                                variant={staged ? "success" : "accent"}
                                className="!px-3 !py-2 !text-[9px] whitespace-nowrap"
                              />
                            </div>
                          </div>
                        );
                      })}

                    {inspectedFilteredItems.length > inspectVisibleCount && (
                      <button
                        type="button"
                        onClick={() =>
                          setInspectVisibleCount((prev) => prev + 100)
                        }
                        className="w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More Artifacts")} (
                        {inspectedFilteredItems.length - inspectVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}
    </div>
  );
}
