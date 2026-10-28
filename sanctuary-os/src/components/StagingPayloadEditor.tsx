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
  EmptyState,
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
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  StatTileCarousel,
} from "../hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../chameleon-components/ThemeCard";
import {
  resolvePayloadDependencies,
  pushEncryptedStagingPayload,
  shredCloudStagingRow,
  getSourceDeviceLabel,
  StagedCloudPayload,
  ResolvedStagedPayload,
} from "../utils/stagingCrypto";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const PRIORITY_TIERS = [
  {
    id: "1_Core",
    labelKey: "staging_tier_1",
    fallback: "1: Core / Framework",
    iconColorClass: "text-[var(--success)]",
  },
  {
    id: "2_Gameplay",
    labelKey: "staging_tier_2",
    fallback: "2: Gameplay",
    iconColorClass: "text-cyan-400",
  },
  {
    id: "3_Standard",
    labelKey: "staging_tier_3",
    fallback: "3: Standard {Mod} / CC",
    iconColorClass: "text-[var(--accent)]",
  },
  {
    id: "4_Overrides",
    labelKey: "staging_tier_4",
    fallback: "4: Overrides (Load Last)",
    iconColorClass: "text-[var(--warning)]",
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
    "OVERVIEW" | "INCLUDED" | "SAVED" | "CLOUD"
  >("OVERVIEW");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [isResolvingDeps, setIsResolvingDeps] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isShredding, setIsShredding] = useState(false);
  const [deleteDraftConfirm, setDeleteDraftConfirm] = useState<string | null>(null);

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

  const activeDraftTitle =
    stagingDraftName.trim() ||
    (stagingDraftMode === "blueprint"
      ? t("staging_mode_blueprint", "Curated {Blueprint}")
      : t("staging_mode_mod_queue", "{Mod} Download Queue"));

  const goToNexusMods = () => {
    if (onBrowseMods) {
      onBrowseMods();
      return;
    }
    setMarketTab("MODS");
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

  const cycleItemTier = (id: string, currentTier: string) => {
    const currentIndex = PRIORITY_TIERS.findIndex((pt) => pt.id === currentTier);
    const nextTier =
      PRIORITY_TIERS[(currentIndex + 1) % PRIORITY_TIERS.length]?.id || "3_Standard";
    setStagingDraftItems((prev: any[]) =>
      prev.map((item) => (item.id === id ? { ...item, priority_tier: nextTier } : item))
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
        t("status_draft_saved_locally", "{Blueprint} draft saved in local device memory."),
        "success"
      );
  };

  // Automatically resolve and heal parent/child dependencies & hydrate DB metadata
  useEffect(() => {
    let cancelled = false;
    const current = useModalStore.getState().stagingDraftItems || [];
    if (current.length === 0) return;
    resolvePayloadDependencies(current).then(({ mergedItems }) => {
      if (cancelled) return;
      const serializeMeta = (list: any[]) =>
        JSON.stringify(
          list.map((i: any) => ({
            id: i.id,
            dbId: i.dbId || "",
            author: i.author || "",
            status: i.status || "",
            category: i.category || "",
            description: i.description || "",
            created_at: i.created_at || "",
            updated_at: i.updated_at || "",
            compatible_versions: i.compatible_versions || [],
            isDependency: !!i.isDependency,
            dependencyOf: i.dependencyOf || "",
            priority_tier: i.priority_tier || "",
          }))
        );
      if (serializeMeta(current) !== serializeMeta(mergedItems)) {
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

      const payloadName = activeDraftTitle;

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
      id: "OVERVIEW" as const,
      icon: t("icon_dashboard", "dashboard"),
      label: t("tab_landing", "Overview"),
      count: activeDraftTitle,
    },
    {
      id: "INCLUDED" as const,
      icon: t("icon_inventory_2", "inventory_2"),
      label: t("blueprint_included", "Included {Mods}"),
      count: stagingDraftItems.length,
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

  const renderStagedModCard = (item: any, idx: number, isReadOnly = false) => {
    const realIdx = isReadOnly
      ? idx
      : stagingDraftItems.findIndex((x: any) => x.id === item.id);
    const currentTier = item.priority_tier || "3_Standard";
    const tierMeta =
      PRIORITY_TIERS.find((pt) => pt.id === currentTier) || PRIORITY_TIERS[2];
    const isNexusAsset =
      item.asset_type === "lexicon" ||
      item.asset_type === "chameleon" ||
      item.asset_type === "workbench_template";

    return (
      <div
        key={`${item.id || item.name}_${idx}`}
        onClick={() => {
          if (isNexusAsset && item.asset_id) {
            setPreviewAsset({
              id: String(item.asset_id),
              type: item.asset_type,
            });
          } else {
            const knownAuthor = resolveKnownAuthor(item, "");
            onOpenDossier?.({
              ...item,
              dbId: item.dbId || item.id,
              status: item.status || "stable",
              author: knownAuthor || item.author || item.master_author || "",
              master_author: knownAuthor || item.master_author || item.author || "",
              category_override: item.category_override || item.category || item.type || "",
              isNexusView: true,
            });
          }
        }}
        className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer flex flex-col justify-between gap-3 group"
      >
        <div className="flex items-start gap-3 min-w-0 w-full">
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[20px]">
              {isNexusAsset
                ? item.asset_type === "lexicon"
                  ? t("icon_translate", "translate")
                  : item.asset_type === "chameleon"
                    ? t("icon_palette", "palette")
                    : t("icon_draw", "draw")
                : getModIcon(item, activeGameSchema, t)}
            </span>
          </div>

          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors truncate">
              {cleanSearchName(item.displayName || item.name, activeGameSchema)}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
              <span className="truncate">
                {resolveKnownAuthor(item, t("unknown_mason", "Unknown {Mason}"))}
              </span>
              {item.dependencyOf && (
                <span className="text-[9px] font-bold text-[var(--accent)] truncate">
                  • {t("staging_dep_of_prefix", "Required by")} {item.dependencyOf}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`${VAULT_CHIP_CLASS} font-mono`}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_tag", "tag")}
              </span>
              <span>#{String((realIdx >= 0 ? realIdx : idx) + 1).padStart(3, "0")}</span>
            </span>

            {!isNexusAsset && stagingDraftMode === "blueprint" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isReadOnly) cycleItemTier(item.id, currentTier);
                }}
                className={`${VAULT_CHIP_CLASS} ${
                  !isReadOnly
                    ? "hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] cursor-pointer transition-colors"
                    : ""
                }`}
              >
                <span
                  className={`material-symbols-outlined !text-[12px] ${tierMeta.iconColorClass}`}
                >
                  {t("icon_low_priority", "low_priority")}
                </span>
                <span>{t(tierMeta.labelKey, tierMeta.fallback)}</span>
              </button>
            )}

            {isNexusAsset && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span>{t("sig_queue_badge_direct_install", "Direct OS Install")}</span>
              </span>
            )}

            {item.isDependency && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>{t("staging_badge_dependency", "Dependency")}</span>
              </span>
            )}

            {item.is_early_access && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_schedule", "schedule")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
              </span>
            )}

            {item.is_paid && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_workspace_premium", "workspace_premium")}
                </span>
                <span>{t("badge_paid", "Paid")}</span>
              </span>
            )}
          </div>

          {!isReadOnly && (
            <div
              className="flex items-center gap-1.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {stagingDraftMode === "blueprint" && !isNexusAsset && (
                <>
                  <button
                    type="button"
                    disabled={realIdx <= 0}
                    onClick={() => moveItem(realIdx, -1)}
                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors disabled:opacity-25 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_keyboard_arrow_up", "keyboard_arrow_up")}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={realIdx < 0 || realIdx >= stagingDraftItems.length - 1}
                    onClick={() => moveItem(realIdx, 1)}
                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors disabled:opacity-25 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_keyboard_arrow_down", "keyboard_arrow_down")}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-colors relative group/btn cursor-pointer"
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
          )}
        </div>
      </div>
    );
  };

  const renderSavedDraftCard = (draft: any) => {
    const draftItems = draft.items || [];
    const isDeleteConfirming = deleteDraftConfirm === draft.id;

    return (
      <UniversalCard
        key={draft.id}
        layout="vertical"
        icon={t("icon_bookmark", "bookmark")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{ ...draft, json_data: { artifacts: draftItems } }}
            heightClass="h-full"
          />
        }
        title={draft.name || t("staging_mode_blueprint", "Curated {Blueprint}")}
        subtitle={
          draft.mode === "mod_queue"
            ? t("staging_mode_mod_queue", "{Mod} Download Queue")
            : t("term_blueprint", "{Blueprint}")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_memory", "memory")}
              </span>
              <span>{t("staging_local_memory_badge", "Saved on Your Device")}</span>
            </div>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isDeleteConfirming) {
                deleteSavedLocalDraft(draft.id);
                setDeleteDraftConfirm(null);
              } else {
                setDeleteDraftConfirm(draft.id);
                setTimeout(() => setDeleteDraftConfirm(null), 3000);
              }
            }}
            className={`w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all relative cursor-pointer ${
              isDeleteConfirming
                ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] opacity-75 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]">
              {isDeleteConfirming
                ? t("icon_warning", "warning")
                : t("icon_delete", "delete")}
            </span>
            <HoverTooltip
              title={
                isDeleteConfirming ? t("confirm", "Confirm") : t("purge", "Delete")
              }
              variant="danger"
            />
          </button>
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectSearchQuery("");
                setInspectFilterTab("ALL");
                setInspectVisibleCount(80);
                setInspectingPack({ type: "draft", data: draft });
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {draftItems.length} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_tag", "tag")}
              </span>
              <span className="text-[var(--subtext)]">{draft.code || "LOCAL"}</span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadSavedLocalDraft(draft.id);
                setActiveSubTab("INCLUDED");
              }}
              className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_play_circle", "play_circle")}
              </span>
              <span>{t("staging_btn_use_short", "Use {Blueprint}")}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectSearchQuery("");
                setInspectFilterTab("ALL");
                setInspectVisibleCount(80);
                setInspectingPack({ type: "draft", data: draft });
              }}
              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_visibility", "visibility")}
              </span>
              <HoverTooltip title={t("staging_btn_view_contents", "View {Mods}")} />
            </button>
          </div>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full">
      {showHeader ? (
        <>
          <ViewHeader
            title={t("playsets_title", "{Blueprints}")}
            subtitle={t(
              "staging_subtitle",
              "Curate {mods} or {blueprints} on web/PWA and push an encrypted staging payload to your desktop client"
            )}
            icon={t("icon_map", "map")}
            iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            shape="circle"
            breadcrumb={
              activeSubTab !== "OVERVIEW"
                ? subTabs.find((st) => st.id === activeSubTab)?.label
                : undefined
            }
            onTitleClick={() => setActiveSubTab("OVERVIEW")}
          >
            {activeSubTab === "INCLUDED" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full xl:w-auto">
                <ActionPill
                  searchQuery={searchFilter}
                  setSearchQuery={setSearchFilter}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                  actions={[
                    ...(stagingDraftItems.length > 0 && stagingDraftMode === "blueprint"
                      ? [
                          {
                            id: "sort_tiers",
                            icon: (
                              <span className="material-symbols-outlined !text-[20px]">
                                {t("icon_swap_vert", "swap_vert")}
                              </span>
                            ),
                            label: t("staging_btn_sort_tiers", "Auto-Sort by Tier"),
                            onClick: sortItemsByPriorityTier,
                          },
                        ]
                      : []),
                    ...(stagingDraftItems.length > 0
                      ? [
                          {
                            id: "resolve_deps",
                            icon: (
                              <span className="material-symbols-outlined !text-[20px]">
                                {t("icon_account_tree", "account_tree")}
                              </span>
                            ),
                            label: isResolvingDeps
                              ? t("staging_btn_resolving_deps", "Resolving...")
                              : t("staging_btn_resolve_deps", "Resolve Dependencies"),
                            onClick: handleResolveDependencies,
                          },
                        ]
                      : []),
                    {
                      id: "add_mods",
                      icon: (
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_add_circle", "add_circle")}
                        </span>
                      ),
                      label: t("staging_catalog_drawer_title", "Build & Add {Mods}"),
                      onClick: goToNexusMods,
                    },
                    {
                      id: "settings",
                      icon: (
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_tune", "tune")}
                        </span>
                      ),
                      label: t("staging_tab_settings", "{Blueprint} Settings"),
                      onClick: () => setIsSettingsOpen(true),
                    },
                  ]}
                />
              </div>
            )}
            {activeSubTab === "SAVED" && (stagingDraftItems.length > 0 || stagingDraftName.trim()) && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full xl:w-auto">
                <ActionPill
                  searchQuery=""
                  setSearchQuery={() => {}}
                  hideSearch={true}
                  actions={[
                    {
                      id: "save_draft",
                      icon: (
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_bookmark", "bookmark")}
                        </span>
                      ),
                      label: t("staging_btn_save_snapshot", "Save Draft on Device"),
                      onClick: handleSaveSnapshotLocally,
                    },
                  ]}
                />
              </div>
            )}
            {activeSubTab === "CLOUD" && activeCloud && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full xl:w-auto">
                <ActionPill
                  searchQuery=""
                  setSearchQuery={() => {}}
                  hideSearch={true}
                  actions={[
                    ...(isDesktop()
                      ? [
                          {
                            id: "sig_queue",
                            icon: (
                              <span className="material-symbols-outlined !text-[20px]">
                                {t("icon_draw", "draw")}
                              </span>
                            ),
                            label: t("sig_queue_title", "Signature Queue"),
                            onClick: () => setIsSignatureQueueOpen(true),
                          },
                        ]
                      : []),
                    {
                      id: "edit_cloud",
                      icon: (
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_edit", "edit")}
                        </span>
                      ),
                      label: t("staging_btn_load_to_editor", "Edit"),
                      onClick: handleLoadActiveCloudIntoEditor,
                    },
                    {
                      id: "shred_cloud",
                      icon: (
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_delete_forever", "delete_forever")}
                        </span>
                      ),
                      label: t("staging_btn_shred_short", "Clear"),
                      onClick: handleShredActiveCloud,
                    },
                  ]}
                />
              </div>
            )}
          </ViewHeader>

          <div className="flex flex-col w-full gap-3 mb-5 md:mb-8 relative z-10 shrink-0">
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
        <div className="flex flex-col w-full gap-3 mb-6 relative z-10 shrink-0">
          <StatTileCarousel innerClassName="px-0">
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
      )}

      {/* TAB 1: OVERVIEW (Clean, Uncluttered Hub matching Blueprints.tsx) */}
      {activeSubTab === "OVERVIEW" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("staging_active_draft_heading", "Active {Blueprint} Draft")}
                    icon={t("icon_map", "map")}
                  />

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full">
                    {/* Active Local Draft Card */}
                    <UniversalCard
                      layout="vertical"
                      isActive={stagingDraftItems.length > 0}
                      icon={
                        stagingDraftMode === "blueprint"
                          ? t("icon_map", "map")
                          : t("icon_download", "download")
                      }
                      customIcon={
                        <DynamicBlueprintPreviewBanner
                          data={{
                            name: activeDraftTitle,
                            json_data: { artifacts: stagingDraftItems || [] },
                          }}
                          heightClass="h-full"
                        />
                      }
                      title={activeDraftTitle}
                      subtitle={
                        stagingDraftMode === "blueprint"
                          ? t("staging_mode_blueprint", "Curated {Blueprint}")
                          : t("staging_mode_mod_queue", "{Mod} Download Queue")
                      }
                      onClick={() => setActiveSubTab("INCLUDED")}
                      imageOverlay={
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                          <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                              {t("icon_memory", "memory")}
                            </span>
                            <span>
                              {t("staging_local_memory_badge", "Saved on Your Device")}
                            </span>
                          </div>
                        </div>
                      }
                      actions={
                        (stagingDraftItems.length > 0 || stagingDraftName.trim()) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearStagingDraft();
                            }}
                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all relative cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_delete", "delete")}
                            </span>
                            <HoverTooltip
                              title={t("staging_btn_clear_draft", "Clear Draft")}
                              variant="danger"
                            />
                          </button>
                        ) : undefined
                      }
                      badges={
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSubTab("INCLUDED");
                            }}
                            className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
                          >
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_extension", "extension")}
                            </span>
                            <span>
                              {stagingDraftItems.length}{" "}
                              {t("artifacts_linked", "{Mods} Linked")}
                            </span>
                          </button>

                          {depsCount > 0 && (
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-cyan-400">
                                {t("icon_account_tree", "account_tree")}
                              </span>
                              <span>
                                {depsCount} {t("section_deps_title", "Deps")}
                              </span>
                            </div>
                          )}

                          {premiumCount > 0 && (
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                {t("icon_workspace_premium", "workspace_premium")}
                              </span>
                              <span>
                                {premiumCount} {t("badge_premium", "Premium")}
                              </span>
                            </div>
                          )}
                        </>
                      }
                      footer={
                        <div className="flex items-center gap-2 w-full">
                          <button
                            type="button"
                            disabled={isTransmitting || stagingDraftItems.length === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEncryptAndTransmit();
                            }}
                            className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {isTransmitting
                                ? t("icon_sync", "sync")
                                : t("icon_encrypted", "encrypted")}
                            </span>
                            <span>
                              {isTransmitting
                                ? t("staging_btn_transmitting", "Encrypting & Sending...")
                                : t("staging_btn_transmit", "Encrypt & Send to Desktop")}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSettingsOpen(true);
                            }}
                            className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_tune", "tune")}
                            </span>
                            <HoverTooltip
                              title={t("staging_tab_settings", "{Blueprint} Settings")}
                            />
                          </button>
                        </div>
                      }
                    />

                    {/* Only show Active Cloud Queue card on Overview when a payload is actually waiting */}
                    {activeCloud && (
                      <UniversalCard
                        layout="vertical"
                        isActive={true}
                        icon={t("icon_phonelink_ring", "phonelink_ring")}
                        customIcon={
                          <DynamicBlueprintPreviewBanner
                            data={{
                              name: activeCloud.payload.blueprintName,
                              json_data: {
                                artifacts: activeCloud.resolvedItems || [],
                              },
                            }}
                            heightClass="h-full"
                          />
                        }
                        title={activeCloud.payload.blueprintName}
                        subtitle={t(
                          "staging_active_cloud_title",
                          "Awaiting Desktop Signature"
                        )}
                        onClick={() => setActiveSubTab("CLOUD")}
                        imageOverlay={
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                {t("icon_encrypted", "encrypted")}
                              </span>
                              <span>{t("staging_badge_aes", "AES-256-GCM")}</span>
                            </div>
                          </div>
                        }
                        badges={
                          <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_extension", "extension")}
                            </span>
                            <span>
                              {activeCloud.resolvedItems?.length || 0}{" "}
                              {t("artifacts_linked", "{Mods} Linked")}
                            </span>
                          </div>
                        }
                        footer={
                          <div className="flex items-center gap-2 w-full">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isDesktop()) {
                                  setIsSignatureQueueOpen(true);
                                } else {
                                  setActiveSubTab("CLOUD");
                                }
                              }}
                              className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] hover:border-[var(--success)] cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_phonelink_ring", "phonelink_ring")}
                              </span>
                              <span>
                                {isDesktop()
                                  ? t("sig_queue_title", "Signature Queue")
                                  : t("staging_tab_cloud", "Active PC Queue")}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isShredding}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShredActiveCloud();
                              }}
                              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_delete_forever", "delete_forever")}
                              </span>
                              <HoverTooltip
                                title={t("staging_btn_shred_short", "Clear")}
                                variant="danger"
                              />
                            </button>
                          </div>
                        }
                      />
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              {/* Standard OS Quick Actions Sidebar (4 Core Actions) */}
              <CommandScreenSidebar
                title={t("quick_actions", "Quick Actions")}
                icon={t("icon_bolt", "bolt")}
              >
                <CommandScreenQuickLink
                  icon={
                    isTransmitting
                      ? t("icon_sync", "sync")
                      : t("icon_encrypted", "encrypted")
                  }
                  title={
                    isTransmitting
                      ? t("staging_btn_transmitting", "Encrypting & Sending...")
                      : t("staging_btn_transmit", "Encrypt & Send to Desktop")
                  }
                  subtitle={`${stagingDraftItems.length} ${t("term_mods", "Items")} • ${t(
                    "staging_badge_aes",
                    "AES-256-GCM"
                  )}`}
                  onClick={handleEncryptAndTransmit}
                />

                <CommandScreenQuickLink
                  icon={t("icon_add_circle", "add_circle")}
                  title={t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                  subtitle={t("staging_catalog_tab_mods", "Search Catalog")}
                  onClick={goToNexusMods}
                />

                <CommandScreenQuickLink
                  icon={t("icon_tune", "tune")}
                  title={t("staging_tab_settings", "{Blueprint} Settings")}
                  subtitle={
                    stagingDraftMode === "blueprint"
                      ? t("staging_mode_blueprint", "Curated {Blueprint}")
                      : t("staging_mode_mod_queue", "{Mod} Download Queue")
                  }
                  onClick={() => setIsSettingsOpen(true)}
                />

                <CommandScreenQuickLink
                  icon={t("icon_bookmark", "bookmark")}
                  title={t("staging_btn_save_snapshot", "Save Draft on Device")}
                  subtitle={`${savedLocalDrafts.length} ${t(
                    "staging_tab_saved",
                    "Saved Drafts"
                  )}`}
                  onClick={handleSaveSnapshotLocally}
                />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      )}

      {/* TAB 2: INCLUDED MODS (Full-Width Load Order Queue Grid) */}
      {activeSubTab === "INCLUDED" && (
        <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {stagingDraftItems.length === 0 ? (
            <EmptyState
              icon={t("icon_map", "map")}
              title={t("staging_empty_title", "No Items in Staging Draft")}
              subtitle={t(
                "staging_empty_desc",
                "Browse {Mods} or {Blueprints} in the Nexus and click Stage to build your encrypted desktop queue."
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
              {filteredItems.map((item: any, idx: number) =>
                renderStagedModCard(item, idx, false)
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SAVED DRAFTS (Full-Width UniversalCard Bento Grid) */}
      {activeSubTab === "SAVED" && (
        <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {savedLocalDrafts.length === 0 ? (
            <EmptyState
              icon={t("icon_bookmark", "bookmark")}
              title={t("staging_tab_saved", "Saved Drafts")}
              subtitle={t(
                "staging_local_memory_desc",
                "Held in local device memory across reloads until you send it to the cloud or discard it."
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
              {savedLocalDrafts.map((draft: any) => renderSavedDraftCard(draft))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACTIVE PC QUEUE (Full-Width Cloud Queue View) */}
      {activeSubTab === "CLOUD" && (
        <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {!activeCloud ? (
            <EmptyState
              icon={t("icon_phonelink_ring", "phonelink_ring")}
              title={t("staging_empty_cloud_title", "No Active Payload Waiting for PC")}
              subtitle={t(
                "staging_empty_cloud_desc",
                "When you click Send to My PC, your encrypted queue appears here until you approve or clear it on your desktop client."
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
              {(activeCloud.resolvedItems || []).map((mod: any, idx: number) =>
                renderStagedModCard(mod, idx, true)
              )}
            </div>
          )}
        </div>
      )}

      {/* ASSET PREVIEW SIDEBAR */}
      {previewAsset && (
        <AssetPreviewSidebar
          assetType={previewAsset.type}
          assetId={previewAsset.id}
          onClose={() => setPreviewAsset(null)}
        />
      )}

      {/* BLUEPRINT SETTINGS SIDEPANEL DRAWER */}
      {isSettingsOpen &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsSettingsOpen(false)}
            title={t("staging_tab_settings", "{Blueprint} Settings")}
            subtitle={t(
              "staging_local_memory_desc",
              "Held in local device memory across reloads until you send it to the cloud or discard it."
            )}
            icon={t("icon_tune", "tune")}
            widthClass="w-full max-w-2xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_bookmark", "bookmark")}
                  tooltip={t("staging_btn_save_snapshot", "Save Draft on Device")}
                  variant="accent"
                  onClick={() => {
                    handleSaveSnapshotLocally();
                    setIsSettingsOpen(false);
                  }}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-5 pb-10">
              <SidePanelHeroCard
                title={activeDraftTitle}
                subtitle={t(
                  "staging_local_memory_desc",
                  "Held in local device memory across reloads until you send it to the cloud or discard it."
                )}
                label={stagingDraftCode || "LOCAL"}
                icon={
                  stagingDraftMode === "blueprint"
                    ? t("icon_map", "map")
                    : t("icon_download", "download")
                }
                variant="accent"
              >
                <div className="grid grid-cols-2 gap-3 w-full">
                  <StatBox
                    label={t("term_mods", "Items")}
                    value={stagingDraftItems.length}
                    icon={t("icon_inventory_2", "inventory_2")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("section_deps_title", "Deps")}
                    value={depsCount}
                    icon={t("icon_account_tree", "account_tree")}
                    iconColorClass="text-cyan-400"
                  />
                </div>
              </SidePanelHeroCard>

              {/* Mode Selector using DashboardStatTile variant="filter" */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_map", "map")}
                  label={t("staging_mode_blueprint", "Curated {Blueprint}")}
                  isActive={stagingDraftMode === "blueprint"}
                  onClick={() => setStagingDraftMode("blueprint")}
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_download", "download")}
                  label={t("staging_mode_mod_queue", "{Mod} Download Queue")}
                  isActive={stagingDraftMode === "mod_queue"}
                  onClick={() => setStagingDraftMode("mod_queue")}
                />
              </div>

              <UniversalGroup
                title={t("staging_tab_settings", "{Blueprint} Settings")}
                icon={t("icon_edit", "edit")}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-65 uppercase tracking-widest ml-1">
                      {t("staging_payload_name_label", "Payload / {Blueprint} Name")}
                    </label>
                    <input
                      type="text"
                      value={stagingDraftName}
                      onChange={(e) => setStagingDraftName(e.target.value)}
                      placeholder={t(
                        "staging_payload_name_ph",
                        "e.g. Curated Nexus {Blueprint}..."
                      )}
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

                  {stagingDraftMode === "blueprint" && (
                    <>
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
                              {t(
                                "staging_auto_equip_title",
                                "Auto-Deploy Owned {Mods} on Approval"
                              )}
                            </span>
                            <span className="text-[9px] font-bold text-[var(--subtext)] opacity-65 leading-snug">
                              {t(
                                "staging_auto_equip_desc",
                                "Immediately equip and symlink already-owned {mods} when you sign on desktop."
                              )}
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
                    </>
                  )}
                </div>
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}

      {/* SAVED DRAFT INSPECTOR SIDEPANEL */}
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
            subtitle={t(
              "staging_inspector_subtitle",
              "Review and filter included {mods} before loading into the builder"
            )}
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
            <div className="flex flex-col gap-3.5 pb-10">
              <SidePanelHeroCard
                title={
                  inspectingPack.data?.displayName ||
                  inspectingPack.data?.name ||
                  t("staging_inspector_title", "{Blueprint} Contents")
                }
                subtitle={t(
                  "staging_inspector_subtitle",
                  "Review and filter included {mods} before loading into the builder"
                )}
                label={inspectingPack.data?.code || "LOCAL"}
                icon={t("icon_bookmark", "bookmark")}
                variant="accent"
              />

              <div className="flex flex-col gap-3 w-full">
                <div className="grid grid-cols-3 gap-3 w-full">
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_list", "list")}
                    label={t("filter_all", "All")}
                    number={inspectedAllItems.length.toString()}
                    isActive={inspectFilterTab === "ALL"}
                    onClick={() => setInspectFilterTab("ALL")}
                  />
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_check_circle", "check_circle")}
                    label={t("staging_btn_added", "Added")}
                    number={inspectedAllItems
                      .filter((m: any) => isSingleModStaged(m))
                      .length.toString()}
                    isActive={inspectFilterTab === "STAGED"}
                    onClick={() => setInspectFilterTab("STAGED")}
                  />
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_workspace_premium", "workspace_premium")}
                    label={t("badge_premium", "Premium")}
                    number={inspectedAllItems
                      .filter((m: any) => m.is_paid || m.is_early_access)
                      .length.toString()}
                    isActive={inspectFilterTab === "PREMIUM"}
                    onClick={() => setInspectFilterTab("PREMIUM")}
                  />
                </div>
                <ActionPill
                  searchQuery={inspectSearchQuery}
                  setSearchQuery={setInspectSearchQuery}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                />
              </div>

              <UniversalGroup
                title={`${t("blueprint_included", "Included {Mods}")} (${inspectedFilteredItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {inspectedFilteredItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_results", "No matching {mods} found.")}
                    minHeightClass="min-h-[160px]"
                    className="py-6"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {inspectedFilteredItems
                      .slice(0, inspectVisibleCount)
                      .map((mod: any, idx: number) => {
                        const staged = isSingleModStaged(mod);
                        return (
                          <div
                            key={`${mod.id || mod.hash || mod.name}_${idx}`}
                            onClick={() => {
                              const knownAuthor = resolveKnownAuthor(
                                mod,
                                resolveKnownAuthor(inspectingPack?.data, "")
                              );
                              onOpenDossier?.({
                                ...mod,
                                dbId: mod.dbId || mod.id,
                                status: mod.status || "stable",
                                author: knownAuthor || mod.author || mod.master_author || "",
                                master_author: knownAuthor || mod.master_author || mod.author || "",
                                category_override: mod.category_override || mod.category || mod.type || "",
                                isNexusView: true,
                              });
                            }}
                            className={`glass-surface p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 cursor-pointer group ${
                              staged
                                ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 w-full">
                              <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[20px]">
                                  {getModIcon(mod, activeGameSchema, t)}
                                </span>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                                  {cleanSearchName(
                                    mod.displayName || mod.name,
                                    activeGameSchema
                                  )}
                                </span>
                                <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
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

                            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                    {t("icon_tag", "tag")}
                                  </span>
                                  <span>#{String(idx + 1).padStart(3, "0")}</span>
                                </span>
                                {mod.is_early_access && (
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                      {t("icon_schedule", "schedule")}
                                    </span>
                                    <span>{t("badge_early_access", "Early Access")}</span>
                                  </span>
                                )}
                                {mod.is_paid && (
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                      {t("icon_workspace_premium", "workspace_premium")}
                                    </span>
                                    <span>{t("badge_paid", "Paid")}</span>
                                  </span>
                                )}
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
                                  variant="glass"
                                  className="!px-2.5 !py-1 !text-[9px] whitespace-nowrap"
                                />
                              </div>
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
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
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
