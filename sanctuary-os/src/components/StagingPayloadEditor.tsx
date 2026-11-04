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
  markStagingRowDeployedLocally,
  unmarkStagingRowDeployedLocally,
  getSourceDeviceLabel,
  fetchEncryptedVaultCompanionSnapshots,
  applyMobileEditsToBlueprints,
  clearMobileBlueprintEdit,
  VaultCompanionDesktopBlueprint,
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
    stagingTargetDesktopBlueprint: targetDesktopBlueprint,
    setStagingTargetDesktopBlueprint: setTargetDesktopBlueprint,
    stagingDraftCode,
    stagingDraftNotes,
    setStagingDraftNotes,
    stagingDraftAutoEquip,
    setStagingDraftAutoEquip,
    stagingDraftStrategy,
    setStagingDraftStrategy,
    stagingDraftItems,
    setStagingDraftItems,
    stagingDraftRemovedItems,
    setStagingDraftRemovedItems,
    savedLocalDrafts,
    saveCurrentDraftLocally,
    loadSavedLocalDraft,
    deleteSavedLocalDraft,
    toggleModInStagingDraft,
    toggleRemoveModInStagingDraft,
    clearStagingDraft,
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    volatileSignatureQueues,
    setVolatileSignatureQueues,
    activeSignatureQueueIndex,
    setActiveSignatureQueueIndex,
    setIsSignatureQueueOpen,
  } = useModalStore();

  const [activeSubTab, setActiveSubTab] = useState<
    "OVERVIEW" | "DESKTOP_BPS" | "SAVED" | "CLOUD"
  >("OVERVIEW");
  const [isDraftPanelOpen, setIsDraftPanelOpen] = useState(false);
  const [isCloudPanelOpen, setIsCloudPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [cloudSearchFilter, setCloudSearchFilter] = useState("");
  const [draftVisibleCount, setDraftVisibleCount] = useState(80);
  const [cloudVisibleCount, setCloudVisibleCount] = useState(80);
  const [isResolvingDeps, setIsResolvingDeps] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isShredding, setIsShredding] = useState(false);
  const [deleteDraftConfirm, setDeleteDraftConfirm] = useState<string | null>(null);
  const [desktopBlueprints, setDesktopBlueprints] = useState<VaultCompanionDesktopBlueprint[]>([]);
  const [companionVaultArtifacts, setCompanionVaultArtifacts] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const loadDesktopBlueprints = async () => {
      if (!session?.user?.id) return;
      const snaps = await fetchEncryptedVaultCompanionSnapshots(session);
      if (!active) return;
      const latest = snaps[0];
      if (Array.isArray(latest?.desktopBlueprints)) {
        const bps = latest.desktopBlueprints;
        setDesktopBlueprints(bps);
        if (bps.length > 0) {
          const modalState = useModalStore.getState();
          const currentTarget = modalState.stagingTargetDesktopBlueprint;
          const activeBp = bps.find((b) => b.isActive) || bps[0];
          if (!currentTarget && activeBp?.name) {
            setTargetDesktopBlueprint(activeBp.name);
            if (!modalState.stagingDraftName.trim()) {
              setStagingDraftName(activeBp.name);
            }
          }
          setInspectingPack((prev) => {
            if (prev?.type === "desktop_bp" && prev.data?.name) {
              const updatedBp = bps.find(
                (b) => b.name.toLowerCase() === String(prev.data.name).toLowerCase()
              );
              if (updatedBp) return { ...prev, data: updatedBp };
            }
            return prev;
          });
        }
      }
      if (Array.isArray(latest?.artifacts)) {
        setCompanionVaultArtifacts(latest.artifacts);
      }
    };
    loadDesktopBlueprints();
    const handler = () => loadDesktopBlueprints();
    const handleSelectDesktopBp = (e: Event) => {
      const bp = (e as CustomEvent)?.detail;
      if (bp?.name) {
        setStagingDraftMode("blueprint");
        setStagingDraftName(bp.name);
        setTargetDesktopBlueprint(bp.name);
        setStagingDraftAutoEquip(!!bp.isActive);
        setActiveSubTab("OVERVIEW");
      }
    };
    window.addEventListener("sanctuary-poll-staging-queue", handler);
    window.addEventListener("sanctuary-select-desktop-blueprint", handleSelectDesktopBp);
    return () => {
      active = false;
      window.removeEventListener("sanctuary-poll-staging-queue", handler);
      window.removeEventListener(
        "sanctuary-select-desktop-blueprint",
        handleSelectDesktopBp
      );
    };
  }, [session?.user?.id]);

  // Ensure stagingDraftItems only holds pending blueprint changes (never a full 2,200+ item Vault dump)
  useEffect(() => {
    if (Array.isArray(stagingDraftItems) && stagingDraftItems.length > 200) {
      setStagingDraftItems([]);
    }
  }, [stagingDraftItems?.length]);

  // Preview Sidebar for Nexus Assets (Lexicons, Chameleons, Templates)
  const [previewAsset, setPreviewAsset] = useState<{ id: string; type: string } | null>(null);

  // Saved Draft / Desktop Blueprint Inspector SidePanel state
  const [inspectingPack, setInspectingPack] = useState<{
    type: "draft" | "desktop_bp";
    data: any;
  } | null>(null);
  const [inspectSearchQuery, setInspectSearchQuery] = useState("");
  const [inspectFilterTab, setInspectFilterTab] = useState<
    "ALL" | "STAGED" | "REMOVING" | "PREMIUM"
  >("ALL");
  const [inspectBpEquipFilter, setInspectBpEquipFilter] = useState<
    "ALL" | "IN_BP" | "NOT_IN_BP"
  >("IN_BP");
  const [inspectVisibleCount, setInspectVisibleCount] = useState(80);

  const matchingDesktopBp = useMemo(() => {
    const targetName = (targetDesktopBlueprint || stagingDraftName || "").trim().toLowerCase();
    if (!targetName || desktopBlueprints.length === 0) return null;
    const cleanTarget = targetName.replace(/\s*\(imported\)\s*$/i, "").trim();
    return (
      desktopBlueprints.find(
        (b) =>
          b.name.toLowerCase() === targetName ||
          b.name.toLowerCase().replace(/\s*\(imported\)\s*$/i, "").trim() === cleanTarget
      ) || null
    );
  }, [targetDesktopBlueprint, stagingDraftName, desktopBlueprints]);

  const activeDraftTitle =
    matchingDesktopBp?.name ||
    stagingDraftName.trim() ||
    targetDesktopBlueprint ||
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

  const filteredRemovedItems = useMemo(() => {
    const items = stagingDraftRemovedItems || [];
    if (!searchFilter.trim()) return items;
    const q = searchFilter.toLowerCase();
    return items.filter(
      (item: any) =>
        (item.displayName || item.name || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q)
    );
  }, [stagingDraftRemovedItems, searchFilter]);

  const cloudQueuesList = useMemo(() => {
    if (Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0) {
      return volatileSignatureQueues;
    }
    if (volatileSignatureQueue) {
      return [volatileSignatureQueue as ResolvedStagedPayload];
    }
    return [];
  }, [volatileSignatureQueues, volatileSignatureQueue]);

  const activeCloud =
    (cloudQueuesList[activeSignatureQueueIndex] as ResolvedStagedPayload | undefined) ||
    (volatileSignatureQueue as ResolvedStagedPayload | null) ||
    cloudQueuesList[0] ||
    null;

  const filteredCloudItems = useMemo(() => {
    const items = activeCloud?.resolvedItems || [];
    if (!cloudSearchFilter.trim()) return items;
    const q = cloudSearchFilter.toLowerCase();
    return items.filter(
      (item: any) =>
        (item.displayName || item.name || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q)
    );
  }, [activeCloud, cloudSearchFilter]);

  const filteredCloudRemovedItems = useMemo(() => {
    const items = activeCloud?.payload?.removedItems || [];
    if (!cloudSearchFilter.trim()) return items;
    const q = cloudSearchFilter.toLowerCase();
    return items.filter(
      (item: any) =>
        (item.displayName || item.name || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q)
    );
  }, [activeCloud, cloudSearchFilter]);

  const depsCount = useMemo(
    () => (stagingDraftItems || []).filter((i: any) => i.isDependency).length,
    [stagingDraftItems]
  );

  const premiumCount = useMemo(
    () => (stagingDraftItems || []).filter((i: any) => i.is_paid || i.is_early_access).length,
    [stagingDraftItems]
  );

  // O(1) Set-based lookup for staged additions and staged removals (prevents O(N^2) lag on large Blueprints)
  const stagedKeysSet = useMemo(() => {
    const s = new Set<string>();
    for (const item of stagingDraftItems || []) {
      if (item.id) s.add(`id:${String(item.id).toLowerCase()}`);
      if (item.hash) s.add(`hash:${String(item.hash).toLowerCase()}`);
      if (item.name) s.add(`name:${String(item.name).toLowerCase()}`);
      if (item.displayName) s.add(`name:${String(item.displayName).toLowerCase()}`);
    }
    return s;
  }, [stagingDraftItems]);

  const removedKeysSet = useMemo(() => {
    const s = new Set<string>();
    for (const item of stagingDraftRemovedItems || []) {
      if (item.id) s.add(`id:${String(item.id).toLowerCase()}`);
      if (item.hash) s.add(`hash:${String(item.hash).toLowerCase()}`);
      if (item.name) s.add(`name:${String(item.name).toLowerCase()}`);
      if (item.displayName) s.add(`name:${String(item.displayName).toLowerCase()}`);
    }
    return s;
  }, [stagingDraftRemovedItems]);

  const isSingleModStaged = (mod: any) => {
    if (stagedKeysSet.size === 0) return false;
    const isNexusAsset =
      mod?.asset_type === "lexicon" ||
      mod?.asset_type === "chameleon" ||
      mod?.asset_type === "workbench_template";
    if (isNexusAsset) {
      const assetId = `asset_${mod.asset_type}_${mod.asset_id || mod.id}`.toLowerCase();
      return stagedKeysSet.has(`id:${assetId}`);
    }
    const targetId = String(mod.id || mod.dbId || mod.hash || mod.name || "").toLowerCase();
    const targetHash = String(mod.hash || "").toLowerCase();
    const targetName = String(mod.name || mod.displayName || "").toLowerCase();
    return (
      (!!targetId && stagedKeysSet.has(`id:${targetId}`)) ||
      (!!targetHash && stagedKeysSet.has(`hash:${targetHash}`)) ||
      (!!targetName && stagedKeysSet.has(`name:${targetName}`))
    );
  };

  const isSingleModRemoved = (mod: any) => {
    if (removedKeysSet.size === 0) return false;
    const targetId = String(mod.id || mod.dbId || mod.hash || mod.name || "").toLowerCase();
    const targetHash = String(mod.hash || "").toLowerCase();
    const targetName = String(mod.name || mod.displayName || "").toLowerCase();
    return (
      (!!targetId && removedKeysSet.has(`id:${targetId}`)) ||
      (!!targetHash && removedKeysSet.has(`hash:${targetHash}`)) ||
      (!!targetName && removedKeysSet.has(`name:${targetName}`))
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

  const handleEncryptAndTransmit = async (overrideBp?: VaultCompanionDesktopBlueprint) => {
    if (!session?.user?.id) {
      useStore
        .getState()
        .pushStatus(t("alert_guest_mode_uploads", "Please sign in to use Cloud Staging."), "error");
      return;
    }
    const hasAdditions = Array.isArray(stagingDraftItems) && stagingDraftItems.length > 0;
    const hasRemovals =
      Array.isArray(stagingDraftRemovedItems) && stagingDraftRemovedItems.length > 0;
    if (!hasAdditions && !hasRemovals) return;

    setIsTransmitting(true);
    try {
      const { mergedItems } = hasAdditions
        ? await resolvePayloadDependencies(stagingDraftItems)
        : { mergedItems: [] };
      const indexedItems = mergedItems.map((item, idx) => ({
        ...item,
        load_order_index: idx,
      }));

      const effectiveTargetBp =
        overrideBp?.name ||
        targetDesktopBlueprint ||
        matchingDesktopBp?.name ||
        (desktopBlueprints.length > 0 && stagingDraftMode === "blueprint"
          ? (desktopBlueprints.find((b) => b.isActive) || desktopBlueprints[0])?.name
          : undefined);
      const payloadName = effectiveTargetBp || activeDraftTitle;

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
        removedItems: hasRemovals ? stagingDraftRemovedItems : undefined,
        loadOrder: indexedItems.map(
          (i) => (i.name || "").split(/[\\/]/).pop() || i.name
        ),
        stagedAt: new Date().toISOString(),
        sourceDevice: getSourceDeviceLabel(),
        targetDesktopBlueprint: effectiveTargetBp || undefined,
      };

      const res = await pushEncryptedStagingPayload(payload, session);
      if (!res.success) {
        throw new Error(res.error || "Failed to transmit encrypted payload");
      }

      setDesktopBlueprints((prev) => applyMobileEditsToBlueprints(prev));
      clearStagingDraft();
      if (effectiveTargetBp) {
        setTargetDesktopBlueprint(effectiveTargetBp);
        setStagingDraftName(effectiveTargetBp);
      }
      setIsDraftPanelOpen(false);
      setInspectingPack(null);
      window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));

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

  const handleLoadActiveCloudIntoEditor = (targetCloud?: ResolvedStagedPayload | null) => {
    const cloud = targetCloud || activeCloud;
    if (!cloud?.payload) return;
    const targetName =
      cloud.payload.targetDesktopBlueprint || cloud.payload.blueprintName || "";
    setStagingDraftMode(cloud.payload.mode || "blueprint");
    setStagingDraftName(targetName);
    setStagingDraftNotes(cloud.payload.notes || "");
    setStagingDraftAutoEquip(cloud.payload.autoEquip ?? true);
    if (cloud.payload.loadOrderStrategy) {
      setStagingDraftStrategy(cloud.payload.loadOrderStrategy);
    }
    setTargetDesktopBlueprint(targetName || null);
    setStagingDraftItems(cloud.payload.items || []);
    setStagingDraftRemovedItems(cloud.payload.removedItems || []);
    setIsCloudPanelOpen(false);
    setActiveSubTab("OVERVIEW");
    setDraftVisibleCount(80);
    const matchedBp = desktopBlueprints.find(
      (b) => b.name.toLowerCase() === targetName.toLowerCase()
    );
    if (matchedBp) {
      setInspectSearchQuery("");
      setInspectFilterTab("ALL");
      setInspectVisibleCount(80);
      setInspectingPack({ type: "desktop_bp", data: matchedBp });
    } else {
      setIsDraftPanelOpen(true);
    }
  };

  const handleStageDesktopBlueprintEdit = (bp: VaultCompanionDesktopBlueprint) => {
    setStagingDraftMode("blueprint");
    setStagingDraftName(bp.name);
    setTargetDesktopBlueprint(bp.name);
    setStagingDraftAutoEquip(!!bp.isActive);
    if (Array.isArray(stagingDraftItems) && stagingDraftItems.length > 200) {
      setStagingDraftItems([]);
    }
    if (totalPendingChangesCount > 0) {
      handleEncryptAndTransmit(bp);
    } else {
      setInspectingPack(null);
      goToNexusMods();
    }
  };

  const handleToggleCloudCompleteLocally = (targetCloud?: ResolvedStagedPayload | null) => {
    const cloud = targetCloud || activeCloud;
    if (!cloud?.rowId) return;
    const nextCompleted = !cloud.isCompletedLocally;
    if (nextCompleted) {
      markStagingRowDeployedLocally(cloud.rowId);
      useStore
        .getState()
        .pushStatus(
          t(
            "status_sig_queue_marked_complete_local",
            "Marked complete on this system! Payload remains pending in the cloud for your other systems."
          ),
          "success"
        );
    } else {
      unmarkStagingRowDeployedLocally(cloud.rowId);
    }
    const updated = cloudQueuesList.map((q) =>
      q.rowId === cloud.rowId ? { ...q, isCompletedLocally: nextCompleted } : q
    );
    setVolatileSignatureQueues(updated);
    if (activeCloud?.rowId === cloud.rowId) {
      setVolatileSignatureQueue({ ...cloud, isCompletedLocally: nextCompleted });
    }
  };

  const handleShredActiveCloud = async (targetCloud?: ResolvedStagedPayload | null) => {
    const cloud = targetCloud || activeCloud;
    setIsShredding(true);
    try {
      const targetBp =
        cloud?.payload?.targetDesktopBlueprint || cloud?.payload?.blueprintName;
      if (targetBp) {
        clearMobileBlueprintEdit(targetBp);
      }
      await shredCloudStagingRow(cloud?.rowId, session);
      const remaining = cloudQueuesList.filter((q) => q.rowId !== cloud?.rowId);
      setVolatileSignatureQueues(remaining);
      const nextIdx = Math.min(activeSignatureQueueIndex, Math.max(0, remaining.length - 1));
      setActiveSignatureQueueIndex(nextIdx);
      setVolatileSignatureQueue(remaining[nextIdx] || null);
      if (remaining.length === 0) {
        setIsCloudPanelOpen(false);
      }
      window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));
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
    const base = extractBlueprintArtifacts(inspectingPack.data);
    if (inspectingPack.type !== "desktop_bp") return base;
    const isTarget =
      !targetDesktopBlueprint ||
      targetDesktopBlueprint.toLowerCase() ===
        String(inspectingPack.data?.name || "").toLowerCase();
    if (!isTarget || !Array.isArray(stagingDraftItems) || stagingDraftItems.length === 0) {
      return base;
    }
    const existingKeys = new Set<string>();
    base.forEach((m: any) => {
      if (m?.dbId) existingKeys.add(`id:${String(m.dbId).toLowerCase()}`);
      if (m?.hash) existingKeys.add(`hash:${String(m.hash).toLowerCase()}`);
      if (m?.name) existingKeys.add(`name:${String(m.name).toLowerCase()}`);
      if (m?.displayName) existingKeys.add(`name:${String(m.displayName).toLowerCase()}`);
    });
    const pendingAdditions = stagingDraftItems.filter((m: any) => {
      const id = m?.dbId || m?.id ? `id:${String(m.dbId || m.id).toLowerCase()}` : "";
      const hash = m?.hash ? `hash:${String(m.hash).toLowerCase()}` : "";
      const name = m?.name ? `name:${String(m.name).toLowerCase()}` : "";
      const disp = m?.displayName ? `name:${String(m.displayName).toLowerCase()}` : "";
      return !(
        (id && existingKeys.has(id)) ||
        (hash && existingKeys.has(hash)) ||
        (name && existingKeys.has(name)) ||
        (disp && existingKeys.has(disp))
      );
    });
    return [...pendingAdditions, ...base];
  }, [inspectingPack, targetDesktopBlueprint, stagingDraftItems]);

  const inspectedBpKeySet = useMemo(() => {
    const s = new Set<string>();
    inspectedAllItems.forEach((m: any) => {
      if (m?.dbId) s.add(`id:${String(m.dbId).toLowerCase()}`);
      if (m?.hash) s.add(`hash:${String(m.hash).toLowerCase()}`);
      if (m?.name) s.add(`name:${String(m.name).toLowerCase()}`);
      if (m?.displayName) s.add(`name:${String(m.displayName).toLowerCase()}`);
    });
    return s;
  }, [inspectedAllItems]);

  const isModInInspectedBp = (mod: any): boolean => {
    if (inspectedBpKeySet.size === 0) return true;
    const id = mod?.dbId ? `id:${String(mod.dbId).toLowerCase()}` : "";
    const hash = mod?.hash ? `hash:${String(mod.hash).toLowerCase()}` : "";
    const name = mod?.name ? `name:${String(mod.name).toLowerCase()}` : "";
    const disp = mod?.displayName ? `name:${String(mod.displayName).toLowerCase()}` : "";
    return Boolean(
      (id && inspectedBpKeySet.has(id)) ||
        (hash && inspectedBpKeySet.has(hash)) ||
        (name && inspectedBpKeySet.has(name)) ||
        (disp && inspectedBpKeySet.has(disp))
    );
  };

  const inspectedFilteredItems = useMemo(() => {
    let list = inspectedAllItems;
    if (
      inspectingPack?.type === "desktop_bp" &&
      companionVaultArtifacts.length > 0 &&
      inspectFilterTab === "ALL"
    ) {
      if (inspectBpEquipFilter === "NOT_IN_BP") {
        list = companionVaultArtifacts.filter((m: any) => !isModInInspectedBp(m));
      } else if (inspectBpEquipFilter === "ALL") {
        list = companionVaultArtifacts;
      }
    }
    if (inspectFilterTab === "STAGED") {
      list = list.filter((m: any) => isSingleModStaged(m));
    } else if (inspectFilterTab === "REMOVING") {
      list = list.filter((m: any) => isSingleModRemoved(m));
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
  }, [
    inspectedAllItems,
    inspectingPack,
    companionVaultArtifacts,
    inspectBpEquipFilter,
    inspectedBpKeySet,
    inspectFilterTab,
    inspectSearchQuery,
    stagedKeysSet,
    removedKeysSet,
  ]);

  const totalPendingChangesCount =
    (stagingDraftItems?.length || 0) + (stagingDraftRemovedItems?.length || 0);

  const subTabs = [
    {
      id: "OVERVIEW" as const,
      icon: t("icon_dashboard", "dashboard"),
      label: t("tab_landing", "Overview"),
      count: totalPendingChangesCount,
    },
    ...(desktopBlueprints.length > 0
      ? [
          {
            id: "DESKTOP_BPS" as const,
            icon: t("icon_devices", "devices"),
            label: t("staging_tab_desktop_bps", "Desktop {Blueprints}"),
            count: desktopBlueprints.length,
          },
        ]
      : []),
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
      count: cloudQueuesList.length,
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
        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer flex flex-col justify-between gap-3 group"
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
        onClick={() => {
          setInspectSearchQuery("");
          setInspectFilterTab("ALL");
          setInspectVisibleCount(80);
          setInspectingPack({ type: "draft", data: draft });
        }}
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
                setActiveSubTab("OVERVIEW");
                setIsDraftPanelOpen(true);
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

  const renderActiveCloudPayloadCard = (
    customCloud?: ResolvedStagedPayload,
    queueIdx?: number
  ) => {
    const cloudTarget = customCloud || activeCloud;
    if (!cloudTarget) return null;
    const cloudItems = cloudTarget.resolvedItems || [];
    const cloudRemoved = cloudTarget.payload?.removedItems || [];
    const cloudMode = cloudTarget.payload?.mode || "blueprint";

    const selectAndOpenCloud = () => {
      if (typeof queueIdx === "number") {
        setActiveSignatureQueueIndex(queueIdx);
      }
      setVolatileSignatureQueue(cloudTarget);
      setCloudSearchFilter("");
      setCloudVisibleCount(80);
      setIsCloudPanelOpen(true);
    };

    return (
      <UniversalCard
        key={cloudTarget.rowId || cloudTarget.payload.blueprintCode || queueIdx}
        layout="vertical"
        isActive={true}
        icon={t("icon_phonelink_ring", "phonelink_ring")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: cloudTarget.payload.blueprintName,
              json_data: {
                artifacts: cloudItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={cloudTarget.payload.blueprintName}
        subtitle={
          cloudTarget.isCompletedLocally
            ? t("sig_queue_badge_completed_local", "Completed Here • Pending on Other Systems")
            : t("staging_active_cloud_title", "Awaiting Desktop Signature")
        }
        onClick={selectAndOpenCloud}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {cloudTarget.isCompletedLocally
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_encrypted", "encrypted")}
              </span>
              <span>
                {cloudTarget.isCompletedLocally
                  ? t("sig_queue_badge_completed_short", "Completed Here")
                  : t("staging_badge_aes", "AES-256-GCM")}
              </span>
            </div>
          </div>
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectAndOpenCloud();
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {cloudItems.length} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            {cloudRemoved.length > 0 && (
              <div className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_remove_circle_outline", "remove_circle_outline")}
                </span>
                <span>
                  -{cloudRemoved.length} {t("staging_badge_removing", "Removing")}
                </span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {cloudMode === "blueprint"
                  ? t("icon_map", "map")
                  : t("icon_download", "download")}
              </span>
              <span>
                {cloudMode === "blueprint"
                  ? t("staging_mode_blueprint", "Curated {Blueprint}")
                  : t("staging_mode_mod_queue", "{Mod} Download Queue")}
              </span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof queueIdx === "number") {
                  setActiveSignatureQueueIndex(queueIdx);
                }
                setVolatileSignatureQueue(cloudTarget);
                if (isDesktop()) {
                  setIsSignatureQueueOpen(true);
                } else {
                  setCloudSearchFilter("");
                  setCloudVisibleCount(80);
                  setIsCloudPanelOpen(true);
                }
              }}
              className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_visibility", "visibility")}
              </span>
              <span>{t("staging_btn_view_contents", "View {Mods}")}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCloudCompleteLocally(cloudTarget);
              }}
              className={`h-9 px-3.5 glass-surface border rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer ${
                cloudTarget.isCompletedLocally
                  ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:text-[var(--success)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[16px]">
                {cloudTarget.isCompletedLocally
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_task_alt", "task_alt")}
              </span>
              <HoverTooltip
                title={
                  cloudTarget.isCompletedLocally
                    ? t("sig_queue_btn_mark_pending_local", "Mark Pending on This System")
                    : t("sig_queue_btn_mark_complete_local", "Mark Complete on This System")
                }
              />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadActiveCloudIntoEditor(cloudTarget);
              }}
              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_edit", "edit")}
              </span>
              <HoverTooltip title={t("staging_btn_load_to_editor", "Edit")} />
            </button>

            <button
              type="button"
              disabled={isShredding}
              onClick={(e) => {
                e.stopPropagation();
                handleShredActiveCloud(cloudTarget);
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
    );
  };

  const renderDesktopBlueprintCard = (bp: VaultCompanionDesktopBlueprint) => {
    const bpItems = bp.artifacts || [];
    const bpModsCount = bp.modsCount ?? bpItems.length;
    const isTargetBp =
      matchingDesktopBp?.name?.toLowerCase() === bp.name.toLowerCase();
    const pendingAddCount = isTargetBp ? stagingDraftItems?.length || 0 : 0;
    const pendingRemCount = isTargetBp ? stagingDraftRemovedItems?.length || 0 : 0;
    const hasPendingForThisBp = isTargetBp && totalPendingChangesCount > 0;
    const effectiveModsCount = Math.max(
      0,
      bpModsCount + pendingAddCount - pendingRemCount
    );

    const openDesktopBpInspector = () => {
      setStagingDraftMode("blueprint");
      setStagingDraftName(bp.name);
      setTargetDesktopBlueprint(bp.name);
      setStagingDraftAutoEquip(!!bp.isActive);
      setInspectSearchQuery("");
      setInspectFilterTab("ALL");
      setInspectVisibleCount(80);
      setInspectingPack({ type: "desktop_bp", data: bp });
    };

    return (
      <UniversalCard
        key={bp.name}
        layout="vertical"
        isActive={!!bp.isActive || hasPendingForThisBp}
        icon={t("icon_devices", "devices")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: bp.name,
              json_data: {
                artifacts:
                  pendingAddCount > 0
                    ? [...(stagingDraftItems || []), ...bpItems]
                    : bpItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={bp.name}
        subtitle={
          hasPendingForThisBp
            ? t(
                "staging_desktop_bp_edit_notice",
                "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
              ).replace("{0}", bp.name)
            : bp.isActive
              ? t("staging_desktop_bp_active_badge", "Active on Desktop")
              : t("staging_desktop_bp_synced_badge", "Synced Desktop {Blueprint}")
        }
        onClick={openDesktopBpInspector}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  bp.isActive ? "text-[var(--success)]" : "text-[var(--accent)]"
                }`}
              >
                {bp.isActive
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_encrypted", "encrypted")}
              </span>
              <span>
                {bp.isActive
                  ? t("staging_desktop_bp_active_badge", "Active on Desktop")
                  : t("staging_badge_aes", "AES-256-GCM")}
              </span>
            </div>
          </div>
        }
        actions={
          hasPendingForThisBp ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearStagingDraft();
                setTargetDesktopBlueprint(bp.name);
                setStagingDraftName(bp.name);
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
                openDesktopBpInspector();
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {effectiveModsCount} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>

            {pendingAddCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                  setInspectFilterTab("STAGED");
                }}
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_add_circle", "add_circle")}
                </span>
                <span>
                  +{pendingAddCount} {t("staging_btn_added", "Added")}
                </span>
              </button>
            )}

            {pendingRemCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                  setInspectFilterTab("REMOVING");
                }}
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_remove_circle_outline", "remove_circle_outline")}
                </span>
                <span>
                  -{pendingRemCount} {t("staging_badge_removing", "Queued to {Remove}")}
                </span>
              </button>
            )}
          </>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            {hasPendingForThisBp ? (
              <button
                type="button"
                disabled={isTransmitting}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEncryptAndTransmit(bp);
                }}
                className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isTransmitting
                    ? t("icon_sync", "sync")
                    : t("icon_encrypted", "encrypted")}
                </span>
                <span className="truncate">
                  {isTransmitting
                    ? t("staging_btn_transmitting", "Encrypting & Sending...")
                    : t("staging_btn_transmit", "Encrypt & Send to Desktop")}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                }}
                className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_edit_note", "edit_note")}
                </span>
                <span className="truncate">
                  {t("staging_btn_stage_bp_edit", "Stage Edit to Desktop Queue")}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDesktopBpInspector();
              }}
              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer shrink-0"
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
            {activeSubTab === "SAVED" &&
              (totalPendingChangesCount > 0 || stagingDraftName.trim()) && (
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

      {/* TAB 1: OVERVIEW (Clean, Cohesive Hub matching Blueprints.tsx) */}
      {activeSubTab === "OVERVIEW" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  {/* Synced Desktop Blueprints on Overview (Primary in-place Blueprints) */}
                  {desktopBlueprints.length > 0 && (
                    <div className="flex flex-col gap-4 w-full">
                      <CommandScreenSectionHeading
                        title={t("staging_tab_desktop_bps", "Desktop {Blueprints}")}
                        icon={t("icon_devices", "devices")}
                      />
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full">
                        {desktopBlueprints.map((bp) => renderDesktopBlueprintCard(bp))}
                      </div>
                    </div>
                  )}

                  {/* Standalone Local Draft Card (shown only when creating a new Blueprint or when no Desktop Blueprints are synced) */}
                  {(!matchingDesktopBp || desktopBlueprints.length === 0) && (
                    <div className="flex flex-col gap-4 w-full">
                      <CommandScreenSectionHeading
                        title={t("staging_active_draft_heading", "Active {Blueprint} Draft")}
                        icon={t("icon_map", "map")}
                      />

                      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full">
                        {/* Active Local Draft Card -> Clicking opens Draft Mods SidePanel */}
                        <UniversalCard
                          layout="vertical"
                          isActive={totalPendingChangesCount > 0}
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
                            targetDesktopBlueprint
                              ? t(
                                  "staging_desktop_bp_edit_notice",
                                  "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
                                ).replace("{0}", targetDesktopBlueprint)
                              : stagingDraftMode === "blueprint"
                                ? t("staging_mode_blueprint", "Curated {Blueprint}")
                                : t("staging_mode_mod_queue", "{Mod} Download Queue")
                          }
                          onClick={() => {
                            setSearchFilter("");
                            setDraftVisibleCount(80);
                            setIsDraftPanelOpen(true);
                          }}
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
                            totalPendingChangesCount > 0 || stagingDraftName.trim() ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearStagingDraft();
                                  setTargetDesktopBlueprint(null);
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
                                  setSearchFilter("");
                                  setDraftVisibleCount(80);
                                  setIsDraftPanelOpen(true);
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

                              {stagingDraftRemovedItems.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchFilter("");
                                    setDraftVisibleCount(80);
                                    setIsDraftPanelOpen(true);
                                  }}
                                  className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] cursor-pointer`}
                                >
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                                    {t("icon_remove_circle_outline", "remove_circle_outline")}
                                  </span>
                                  <span>
                                    -{stagingDraftRemovedItems.length}{" "}
                                    {t("staging_badge_removing", "Queued to {Remove}")}
                                  </span>
                                </button>
                              )}

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
                              {totalPendingChangesCount > 0 ? (
                                <button
                                  type="button"
                                  disabled={isTransmitting}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEncryptAndTransmit();
                                  }}
                                  className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {isTransmitting
                                      ? t("icon_sync", "sync")
                                      : t("icon_encrypted", "encrypted")}
                                  </span>
                                  <span className="truncate">
                                    {isTransmitting
                                      ? t("staging_btn_transmitting", "Encrypting & Sending...")
                                      : t("staging_btn_transmit", "Encrypt & Send to Desktop")}
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    goToNexusMods();
                                  }}
                                  className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t("icon_add_circle", "add_circle")}
                                  </span>
                                  <span className="truncate">
                                    {t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                                  </span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSearchFilter("");
                                  setDraftVisibleCount(80);
                                  setIsDraftPanelOpen(true);
                                }}
                                className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer shrink-0"
                              >
                                <span className="material-symbols-outlined !text-[16px]">
                                  {t("icon_visibility", "visibility")}
                                </span>
                                <HoverTooltip
                                  title={t("staging_btn_view_contents", "View {Mods}")}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsSettingsOpen(true);
                                }}
                                className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer shrink-0"
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
                      </div>
                    </div>
                  )}

                  {/* Dedicated Active PC Queue Section on Overview */}
                  {cloudQueuesList.length > 0 && (
                    <div className="flex flex-col gap-4 w-full">
                      <CommandScreenSectionHeading
                        title={t("staging_tab_cloud", "Active PC Queue")}
                        icon={t("icon_phonelink_ring", "phonelink_ring")}
                      />
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full">
                        {cloudQueuesList.map((qItem, qIdx) =>
                          renderActiveCloudPayloadCard(qItem, qIdx)
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              {/* Standard OS Quick Actions Sidebar */}
              <CommandScreenSidebar
                title={t("quick_actions", "Quick Actions")}
                icon={t("icon_bolt", "bolt")}
              >
                <CommandScreenQuickLink
                  icon={t("icon_add_circle", "add_circle")}
                  title={t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                  subtitle={t("staging_catalog_tab_mods", "Search Catalog")}
                  onClick={goToNexusMods}
                />

                <CommandScreenQuickLink
                  icon={t("icon_map", "map")}
                  title={t("staging_catalog_tab_blueprints", "Browse {Blueprints}")}
                  subtitle={t("market_title", "The {Nexus}")}
                  onClick={goToNexusBlueprints}
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

      {/* TAB: DESKTOP BLUEPRINTS (Synced from Desktop Vault Companion Snapshot) */}
      {activeSubTab === "DESKTOP_BPS" && (
        <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {desktopBlueprints.length === 0 ? (
            <EmptyState
              icon={t("icon_devices", "devices")}
              title={t("staging_tab_desktop_bps", "Desktop {Blueprints}")}
              subtitle={t(
                "staging_radar_empty_desc",
                "Sign in on your Windows PC or Steam Deck and run a Radar Sweep to sync your encrypted {Vault} DNA snapshot."
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
              {desktopBlueprints.map((bp) => renderDesktopBlueprintCard(bp))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SAVED DRAFTS (Full-Width UniversalCard Bento Grid) */}
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

      {/* TAB 3: ACTIVE PC QUEUE (Payload UniversalCard -> Opens SidePanel with Mods) */}
      {activeSubTab === "CLOUD" && (
        <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {cloudQueuesList.length === 0 ? (
            <EmptyState
              icon={t("icon_phonelink_ring", "phonelink_ring")}
              title={t("staging_empty_cloud_title", "No Active Payload Waiting for PC")}
              subtitle={t(
                "staging_empty_cloud_desc",
                "When you click Send to My PC, your encrypted queue appears here until you approve or clear it on your desktop client."
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
              {cloudQueuesList.map((qItem, qIdx) =>
                renderActiveCloudPayloadCard(qItem, qIdx)
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

      {/* ACTIVE DRAFT MODS SIDEPANEL INSPECTOR */}
      {isDraftPanelOpen &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsDraftPanelOpen(false)}
            title={activeDraftTitle}
            subtitle={
              stagingDraftMode === "blueprint"
                ? t("staging_mode_blueprint", "Curated {Blueprint}")
                : t("staging_mode_mod_queue", "{Mod} Download Queue")
            }
            icon={
              stagingDraftMode === "blueprint"
                ? t("icon_map", "map")
                : t("icon_download", "download")
            }
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_tune", "tune")}
                  tooltip={t("staging_tab_settings", "{Blueprint} Settings")}
                  onClick={() => setIsSettingsOpen(true)}
                />
                <PanelHeaderButton
                  icon={t("icon_bookmark", "bookmark")}
                  tooltip={t("staging_btn_save_snapshot", "Save Draft on Device")}
                  variant="accent"
                  onClick={handleSaveSnapshotLocally}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-4 pb-10">
              <SidePanelHeroCard
                title={activeDraftTitle}
                subtitle={
                  targetDesktopBlueprint
                    ? t(
                        "staging_desktop_bp_edit_notice",
                        "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
                      ).replace("{0}", targetDesktopBlueprint)
                    : t(
                        "staging_local_memory_desc",
                        "Held in local device memory across reloads until you send it to the cloud or discard it."
                      )
                }
                label={
                  targetDesktopBlueprint
                    ? t("staging_tab_desktop_bps", "Desktop {Blueprints}")
                    : stagingDraftCode || "LOCAL"
                }
                icon={
                  stagingDraftMode === "blueprint"
                    ? t("icon_map", "map")
                    : t("icon_download", "download")
                }
                variant="accent"
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("term_mods", "Items")}
                      value={stagingDraftItems.length}
                      icon={t("icon_inventory_2", "inventory_2")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    {stagingDraftRemovedItems.length > 0 ? (
                      <StatBox
                        label={t("staging_badge_removing", "Removing")}
                        value={stagingDraftRemovedItems.length}
                        icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                        iconColorClass="text-[var(--danger)]"
                      />
                    ) : (
                      <StatBox
                        label={t("section_deps_title", "Deps")}
                        value={depsCount}
                        icon={t("icon_account_tree", "account_tree")}
                        iconColorClass="text-cyan-400"
                      />
                    )}
                  </div>

                  {totalPendingChangesCount > 0 && (
                    <button
                      type="button"
                      disabled={isTransmitting}
                      onClick={() => handleEncryptAndTransmit()}
                      className="w-full h-10 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border glass-surface border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
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
                  )}
                </div>
              </SidePanelHeroCard>

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
                    onClick: () => {
                      setIsDraftPanelOpen(false);
                      goToNexusMods();
                    },
                  },
                ]}
              />

              {filteredRemovedItems.length > 0 && (
                <UniversalGroup
                  title={`${t("sig_queue_group_removing", "Removing from {Blueprint}")} (${
                    filteredRemovedItems.length
                  })`}
                  icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredRemovedItems.map((remItem: any, rIdx: number) => (
                      <div
                        key={`draft_rem_${remItem.id || remItem.name}_${rIdx}`}
                        onClick={() => {
                          const knownAuthor = resolveKnownAuthor(remItem, "");
                          onOpenDossier?.({
                            ...remItem,
                            dbId: remItem.dbId || remItem.id,
                            status: remItem.status || "stable",
                            author: knownAuthor || remItem.author || "",
                            master_author: knownAuthor || remItem.author || "",
                            isNexusView: true,
                          });
                        }}
                        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_remove_circle_outline", "remove_circle_outline")}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                              {cleanSearchName(
                                remItem.displayName || remItem.name,
                                activeGameSchema
                              )}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                              {resolveKnownAuthor(
                                remItem,
                                t("unknown_mason", "Unknown {Mason}")
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <span className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_delete", "delete")}
                            </span>
                            <span>{t("staging_badge_removing", "Removing")}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRemoveModInStagingDraft(remItem);
                            }}
                            className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors relative group/btn cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_undo", "undo")}
                            </span>
                            <HoverTooltip
                              title={t("cancel", "Cancel")}
                              className="group-hover/btn:flex z-[200]"
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

              <UniversalGroup
                title={`${
                  targetDesktopBlueprint
                    ? t("staging_group_adding", "Adding to {Blueprint}")
                    : t("blueprint_included", "Included {Mods}")
                } (${filteredItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {stagingDraftItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_map", "map")}
                    title={t("staging_empty_title", "No Items in Staging Draft")}
                    subtitle={t(
                      "staging_empty_desc",
                      "Browse {Mods} or {Blueprints} in the Nexus and click Stage to build your encrypted desktop queue."
                    )}
                    action={
                      <ActionButton
                        variant="primary"
                        icon={t("icon_add_circle", "add_circle")}
                        label={t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                        onClick={() => {
                          setIsDraftPanelOpen(false);
                          goToNexusMods();
                        }}
                      />
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredItems
                      .slice(0, draftVisibleCount)
                      .map((item: any, idx: number) =>
                        renderStagedModCard(item, idx, false)
                      )}
                    {filteredItems.length > draftVisibleCount && (
                      <button
                        type="button"
                        onClick={() => setDraftVisibleCount((prev) => prev + 100)}
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
                        {filteredItems.length - draftVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}

      {/* ACTIVE PC QUEUE PAYLOAD SIDEPANEL INSPECTOR */}
      {isCloudPanelOpen &&
        activeCloud &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsCloudPanelOpen(false)}
            title={activeCloud.payload.blueprintName}
            subtitle={t("staging_active_cloud_title", "Awaiting Desktop Signature")}
            icon={t("icon_phonelink_ring", "phonelink_ring")}
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
          >
            <div className="flex flex-col gap-4 pb-10">
              {cloudQueuesList.length > 1 && (
                <div className="flex flex-col gap-1.5 p-3 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 ml-1">
                    {t("sig_queue_select_queue", "Queued {Blueprints}")} ({cloudQueuesList.length})
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                    {cloudQueuesList.map((qItem, qIdx) => {
                      const isSel =
                        (activeCloud.rowId && qItem.rowId === activeCloud.rowId) ||
                        qIdx === activeSignatureQueueIndex;
                      const addCount = qItem.resolvedItems?.length || 0;
                      const remCount = qItem.payload?.removedItems?.length || 0;
                      return (
                        <button
                          key={qItem.rowId || qIdx}
                          type="button"
                          onClick={() => {
                            setActiveSignatureQueueIndex(qIdx);
                            setVolatileSignatureQueue(qItem);
                            setCloudVisibleCount(80);
                          }}
                          className={`px-3 py-2 rounded-xl border text-left flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                            isSel
                              ? "glass-surface border-[var(--accent)] text-[var(--accent)]"
                              : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_map", "map")}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider truncate max-w-[160px]">
                            {qItem.payload?.blueprintName || t("term_blueprint", "{Blueprint}")}
                          </span>
                          <span className="text-[9px] font-mono opacity-80">
                            +{addCount}
                            {remCount > 0 ? ` / -${remCount}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <SidePanelHeroCard
                title={activeCloud.payload.blueprintName}
                subtitle={t("staging_active_cloud_title", "Awaiting Desktop Signature")}
                label={activeCloud.payload.blueprintCode || "CLOUD"}
                icon={t("icon_phonelink_ring", "phonelink_ring")}
                variant="accent"
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("term_mods", "Items")}
                      value={activeCloud.resolvedItems?.length || 0}
                      icon={t("icon_inventory_2", "inventory_2")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    {(activeCloud.payload?.removedItems?.length || 0) > 0 ? (
                      <StatBox
                        label={t("staging_badge_removing", "Removing")}
                        value={activeCloud.payload.removedItems?.length || 0}
                        icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                        iconColorClass="text-[var(--danger)]"
                      />
                    ) : (
                      <StatBox
                        label={t("status", "Status")}
                        value={t("staging_badge_aes", "AES-256-GCM")}
                        icon={t("icon_encrypted", "encrypted")}
                        iconColorClass="text-[var(--success)]"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 w-full">
                    <button
                      type="button"
                      onClick={() => handleLoadActiveCloudIntoEditor(activeCloud)}
                      className="h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 border glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_edit", "edit")}
                      </span>
                      <span>{t("staging_btn_load_to_editor", "Edit")}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isShredding}
                      onClick={() => handleShredActiveCloud(activeCloud)}
                      className="h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 border glass-surface border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_delete_forever", "delete_forever")}
                      </span>
                      <span>{t("staging_btn_shred_short", "Clear")}</span>
                    </button>
                  </div>
                </div>
              </SidePanelHeroCard>

              <ActionPill
                searchQuery={cloudSearchFilter}
                setSearchQuery={setCloudSearchFilter}
                searchPlaceholder={t("search_ph", "Search {mods}...")}
              />

              {filteredCloudRemovedItems.length > 0 && (
                <UniversalGroup
                  title={`${t("sig_queue_group_removing", "Removing from {Blueprint}")} (${
                    filteredCloudRemovedItems.length
                  })`}
                  icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredCloudRemovedItems.map((remMod: any, rIdx: number) => (
                      <div
                        key={`cloud_rem_${remMod.id || remMod.name}_${rIdx}`}
                        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_remove_circle_outline", "remove_circle_outline")}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                              {cleanSearchName(
                                remMod.displayName || remMod.name,
                                activeGameSchema
                              )}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                              {resolveKnownAuthor(
                                remMod,
                                t("unknown_mason", "Unknown {Mason}")
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <span className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_delete", "delete")}
                            </span>
                            <span>{t("staging_badge_removing", "Removing")}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

              <UniversalGroup
                title={`${t("blueprint_included", "Included {Mods}")} (${filteredCloudItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {filteredCloudItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_results", "No matching {mods} found.")}
                    minHeightClass="min-h-[160px]"
                    className="py-6"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredCloudItems
                      .slice(0, cloudVisibleCount)
                      .map((mod: any, idx: number) =>
                        renderStagedModCard(mod, idx, true)
                      )}
                    {filteredCloudItems.length > cloudVisibleCount && (
                      <button
                        type="button"
                        onClick={() => setCloudVisibleCount((prev) => prev + 100)}
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
                        {filteredCloudItems.length - cloudVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
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
            backdropZ="z-[100002]"
            panelZ="z-[100003]"
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
                subtitle={
                  targetDesktopBlueprint
                    ? t(
                        "staging_desktop_bp_edit_notice",
                        "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
                      ).replace("{0}", targetDesktopBlueprint)
                    : t(
                        "staging_local_memory_desc",
                        "Held in local device memory across reloads until you send it to the cloud or discard it."
                      )
                }
                label={
                  targetDesktopBlueprint
                    ? t("staging_tab_desktop_bps", "Desktop {Blueprints}")
                    : stagingDraftCode || "LOCAL"
                }
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

      {/* SAVED DRAFT / DESKTOP BLUEPRINT INSPECTOR SIDEPANEL */}
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
            icon={
              inspectingPack.type === "desktop_bp"
                ? t("icon_devices", "devices")
                : t("icon_bookmark", "bookmark")
            }
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={
                    inspectingPack.type === "desktop_bp"
                      ? totalPendingChangesCount > 0
                        ? t("icon_encrypted", "encrypted")
                        : t("icon_add_circle", "add_circle")
                      : t("icon_play_circle", "play_circle")
                  }
                  tooltip={
                    inspectingPack.type === "desktop_bp"
                      ? totalPendingChangesCount > 0
                        ? t("staging_btn_transmit", "Encrypt & Send to Desktop")
                        : t("staging_catalog_drawer_title", "Build & Add {Mods}")
                      : t("staging_btn_use_short", "Use {Blueprint}")
                  }
                  variant="accent"
                  onClick={() => {
                    if (inspectingPack.type === "desktop_bp") {
                      handleStageDesktopBlueprintEdit(inspectingPack.data);
                    } else {
                      setTargetDesktopBlueprint(null);
                      loadSavedLocalDraft(inspectingPack.data.id);
                      setInspectingPack(null);
                      setActiveSubTab("OVERVIEW");
                      setIsDraftPanelOpen(true);
                    }
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
                label={
                  inspectingPack.type === "desktop_bp"
                    ? inspectingPack.data?.isActive
                      ? t("staging_desktop_bp_active_badge", "Active on Desktop")
                      : t("staging_badge_aes", "AES-256-GCM")
                    : inspectingPack.data?.code || "LOCAL"
                }
                icon={
                  inspectingPack.type === "desktop_bp"
                    ? t("icon_devices", "devices")
                    : t("icon_bookmark", "bookmark")
                }
                variant="accent"
              >
                <button
                  type="button"
                  disabled={isTransmitting}
                  onClick={() => {
                    if (inspectingPack.type === "desktop_bp") {
                      handleStageDesktopBlueprintEdit(inspectingPack.data);
                    } else {
                      setTargetDesktopBlueprint(null);
                      loadSavedLocalDraft(inspectingPack.data.id);
                      setInspectingPack(null);
                      setActiveSubTab("OVERVIEW");
                      setIsDraftPanelOpen(true);
                    }
                  }}
                  className="w-full h-10 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border glass-surface border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {inspectingPack.type === "desktop_bp"
                      ? isTransmitting
                        ? t("icon_sync", "sync")
                        : totalPendingChangesCount > 0
                          ? t("icon_encrypted", "encrypted")
                          : t("icon_add_circle", "add_circle")
                      : t("icon_play_circle", "play_circle")}
                  </span>
                  <span>
                    {inspectingPack.type === "desktop_bp"
                      ? isTransmitting
                        ? t("staging_btn_transmitting", "Encrypting & Sending...")
                        : totalPendingChangesCount > 0
                          ? `${t("staging_btn_transmit", "Encrypt & Send to Desktop")} (${totalPendingChangesCount})`
                          : t("staging_catalog_drawer_title", "Build & Add {Mods}")
                      : t("staging_btn_use_short", "Use {Blueprint}")}
                  </span>
                </button>
              </SidePanelHeroCard>

              <div className="flex flex-col gap-3 w-full">
                <div
                  className={`grid grid-cols-2 ${
                    inspectingPack.type === "desktop_bp"
                      ? "sm:grid-cols-4"
                      : "sm:grid-cols-3"
                  } gap-3 w-full`}
                >
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
                  {inspectingPack.type === "desktop_bp" && (
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                      label={t("staging_filter_removing", "Removing")}
                      number={inspectedAllItems
                        .filter((m: any) => isSingleModRemoved(m))
                        .length.toString()}
                      isActive={inspectFilterTab === "REMOVING"}
                      onClick={() => setInspectFilterTab("REMOVING")}
                    />
                  )}
                  <DashboardStatTile
                    variant="filter"
                    className={`!w-full ${
                      inspectingPack.type === "desktop_bp"
                        ? ""
                        : "col-span-2 sm:col-span-1"
                    }`}
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
                  primaryPopover={
                    inspectingPack.type === "desktop_bp"
                      ? {
                          icon: t("icon_tune", "tune"),
                          label: t("filters", "Filters"),
                          content: (
                            <div className="flex flex-col gap-2 w-60">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 px-2">
                                {t("filter_status", "Filter Status")}
                              </span>
                              <div className="flex flex-col gap-1">
                                {[
                                  {
                                    id: "ALL" as const,
                                    label: t("filter_all_vault_scope", "All {Vault}"),
                                  },
                                  {
                                    id: "IN_BP" as const,
                                    label: t("filter_in_blueprint", "In {Blueprint}"),
                                  },
                                  {
                                    id: "NOT_IN_BP" as const,
                                    label: t("filter_not_in_blueprint", "Not in {Blueprint}"),
                                  },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      setInspectFilterTab("ALL");
                                      setInspectBpEquipFilter(opt.id);
                                    }}
                                    className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                      inspectBpEquipFilter === opt.id
                                        ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                        : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent"
                                    }`}
                                  >
                                    <span>{opt.label}</span>
                                    {inspectBpEquipFilter === opt.id && (
                                      <span className="material-symbols-outlined !text-[14px]">
                                        {t("icon_check", "check")}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ),
                        }
                      : undefined
                  }
                />
              </div>

              <UniversalGroup
                title={`${
                  inspectingPack.type === "desktop_bp" &&
                  inspectFilterTab === "ALL" &&
                  inspectBpEquipFilter === "NOT_IN_BP"
                    ? t("filter_not_in_blueprint", "Not in {Blueprint}")
                    : inspectingPack.type === "desktop_bp" &&
                        inspectFilterTab === "ALL" &&
                        inspectBpEquipFilter === "ALL"
                      ? t("filter_all_vault_scope", "All {Vault}")
                      : t("blueprint_included", "Included {Mods}")
                } (${inspectedFilteredItems.length})`}
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
                        const isDesktopBpView = inspectingPack.type === "desktop_bp";
                        const inBp = !isDesktopBpView || isModInInspectedBp(mod);
                        const staged = isSingleModStaged(mod);
                        const markedForRemoval = isDesktopBpView && inBp && isSingleModRemoved(mod);
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
                              markedForRemoval
                                ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
                                : staged
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
                                {isDesktopBpView && inspectBpEquipFilter === "ALL" && inBp && (
                                  <span
                                    className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]`}
                                  >
                                    <span className="material-symbols-outlined !text-[12px]">
                                      {t("icon_check_circle", "check_circle")}
                                    </span>
                                    <span>
                                      {t("filter_in_blueprint", "In {Blueprint}")}
                                    </span>
                                  </span>
                                )}
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
                                {isDesktopBpView && inBp && !staged ? (
                                  <ActionButton
                                    onClick={() => {
                                      setStagingDraftMode("blueprint");
                                      setStagingDraftName(inspectingPack.data.name);
                                      setTargetDesktopBlueprint(inspectingPack.data.name);
                                      toggleRemoveModInStagingDraft(mod);
                                    }}
                                    icon={
                                      markedForRemoval
                                        ? t("icon_undo", "undo")
                                        : t("icon_remove_circle_outline", "remove_circle_outline")
                                    }
                                    label={
                                      markedForRemoval
                                        ? t("staging_badge_removing", "Queued to {Remove}")
                                        : t("btn_remove", "{Remove}")
                                    }
                                    variant={markedForRemoval ? "danger" : "glass"}
                                    className="!px-2.5 !py-1 !text-[9px] whitespace-nowrap"
                                  />
                                ) : (
                                  <ActionButton
                                    onClick={() => {
                                      if (isDesktopBpView && inspectingPack?.data?.name) {
                                        setStagingDraftMode("blueprint");
                                        setStagingDraftName(inspectingPack.data.name);
                                        setTargetDesktopBlueprint(inspectingPack.data.name);
                                      }
                                      handleStageModWithAutoDeps({ ...mod, _stageSingle: true });
                                    }}
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
                                )}
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
