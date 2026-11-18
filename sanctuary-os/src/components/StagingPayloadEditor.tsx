import { useState, useMemo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import AssetPreviewSidebar from "../side-panels/AssetPreviewSidebar";
import {
  ActionPill,
  DashboardStatTile,
  SidePanelFilterBar,
  EmptyState,
  HoverTooltip,
  ViewHeader,
} from "../shared";
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
import { VAULT_CHIP_CLASS } from "../shared-components/constants";

import { PRIORITY_TIERS, resolveSchemaPriorityTiers } from "./staging-editor/stagingEditorHelpers";
import { useStagingCardRenderers } from "./staging-editor/useStagingCardRenderers";
import { StagingEditorSidePanels } from "./staging-editor/StagingEditorSidePanels";

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
  } = useModalStore(
    useShallow((s) => ({
      stagingDraftMode: s.stagingDraftMode,
      setStagingDraftMode: s.setStagingDraftMode,
      stagingDraftName: s.stagingDraftName,
      setStagingDraftName: s.setStagingDraftName,
      stagingTargetDesktopBlueprint: s.stagingTargetDesktopBlueprint,
      setStagingTargetDesktopBlueprint: s.setStagingTargetDesktopBlueprint,
      stagingDraftCode: s.stagingDraftCode,
      stagingDraftNotes: s.stagingDraftNotes,
      setStagingDraftNotes: s.setStagingDraftNotes,
      stagingDraftAutoEquip: s.stagingDraftAutoEquip,
      setStagingDraftAutoEquip: s.setStagingDraftAutoEquip,
      stagingDraftStrategy: s.stagingDraftStrategy,
      setStagingDraftStrategy: s.setStagingDraftStrategy,
      stagingDraftItems: s.stagingDraftItems,
      setStagingDraftItems: s.setStagingDraftItems,
      stagingDraftRemovedItems: s.stagingDraftRemovedItems,
      setStagingDraftRemovedItems: s.setStagingDraftRemovedItems,
      savedLocalDrafts: s.savedLocalDrafts,
      saveCurrentDraftLocally: s.saveCurrentDraftLocally,
      loadSavedLocalDraft: s.loadSavedLocalDraft,
      deleteSavedLocalDraft: s.deleteSavedLocalDraft,
      toggleModInStagingDraft: s.toggleModInStagingDraft,
      toggleRemoveModInStagingDraft: s.toggleRemoveModInStagingDraft,
      clearStagingDraft: s.clearStagingDraft,
      volatileSignatureQueue: s.volatileSignatureQueue,
      setVolatileSignatureQueue: s.setVolatileSignatureQueue,
      volatileSignatureQueues: s.volatileSignatureQueues,
      setVolatileSignatureQueues: s.setVolatileSignatureQueues,
      activeSignatureQueueIndex: s.activeSignatureQueueIndex,
      setActiveSignatureQueueIndex: s.setActiveSignatureQueueIndex,
      setIsSignatureQueueOpen: s.setIsSignatureQueueOpen,
    }))
  );

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

  const schemaTiers = useMemo(
    () => resolveSchemaPriorityTiers(activeGameSchema),
    [activeGameSchema]
  );

  const cycleItemTier = (id: string, currentTier: string) => {
    const tiers = schemaTiers.length > 0 ? schemaTiers : PRIORITY_TIERS;
    const currentIndex = tiers.findIndex((pt) => pt.id === currentTier);
    const nextTier =
      tiers[(currentIndex + 1 + tiers.length) % tiers.length]?.id ||
      tiers[0]?.id ||
      "3_Standard";
    setStagingDraftItems((prev: any[]) =>
      prev.map((item) => (item.id === id ? { ...item, priority_tier: nextTier } : item))
    );
  };

  const sortItemsByPriorityTier = () => {
    const tiers = schemaTiers.length > 0 ? schemaTiers : PRIORITY_TIERS;
    const rankMap = new Map(tiers.map((pt, idx) => [pt.id, Number(pt.priority ?? idx + 1)]));
    const rank = (tier?: string) => {
      if (tier && rankMap.has(tier)) return rankMap.get(tier)!;
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
    if (cloud.payload.isFullRigBlueprint) {
      setStagingDraftItems([]);
      setStagingDraftRemovedItems([]);
    } else {
      setStagingDraftItems(cloud.payload.items || []);
      setStagingDraftRemovedItems(cloud.payload.removedItems || []);
    }
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
    } else if (cloud.payload.isFullRigBlueprint) {
      setInspectSearchQuery("");
      setInspectFilterTab("ALL");
      setInspectVisibleCount(80);
      setInspectingPack({
        type: "desktop_bp",
        data: {
          name: targetName,
          code: cloud.payload.blueprintCode || "RIG-BP",
          isActive: Boolean(cloud.payload.autoEquip),
          modsCount: (cloud.payload.items || []).length,
          artifacts: cloud.payload.items || [],
        },
      });
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

  const {
    renderStagedModCard,
    renderSavedDraftCard,
    renderActiveCloudPayloadCard,
    renderDesktopBlueprintCard,
  } = useStagingCardRenderers({
    onOpenDossier,
    t,
    activeGameSchema,
    stagingDraftMode,
    setStagingDraftMode,
    setStagingDraftName,
    setTargetDesktopBlueprint,
    setStagingDraftAutoEquip,
    stagingDraftItems,
    stagingDraftRemovedItems,
    loadSavedLocalDraft,
    deleteSavedLocalDraft,
    clearStagingDraft,
    setVolatileSignatureQueue,
    setActiveSignatureQueueIndex,
    setIsSignatureQueueOpen,
    setActiveSubTab,
    setIsDraftPanelOpen,
    setIsCloudPanelOpen,
    setCloudSearchFilter,
    setCloudVisibleCount,
    isTransmitting,
    isShredding,
    deleteDraftConfirm,
    setDeleteDraftConfirm,
    setPreviewAsset,
    setInspectingPack,
    setInspectSearchQuery,
    setInspectFilterTab,
    setInspectVisibleCount,
    matchingDesktopBp,
    activeCloud,
    moveItem,
    cycleItemTier,
    removeItem,
    handleEncryptAndTransmit,
    handleLoadActiveCloudIntoEditor,
    handleToggleCloudCompleteLocally,
    handleShredActiveCloud,
    totalPendingChangesCount,
  });

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
        <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {subTabs.map((st) => (
            <DashboardStatTile
              key={st.id}
              variant="filter"
              className="!w-full"
              icon={st.icon}
              label={st.label}
              number={st.count}
              onClick={() => setActiveSubTab(st.id)}
              isActive={activeSubTab === st.id}
            />
          ))}
        </SidePanelFilterBar>
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
      <StagingEditorSidePanels
        onOpenDossier={onOpenDossier}
        t={t}
        activeGameSchema={activeGameSchema}
        stagingDraftMode={stagingDraftMode}
        setStagingDraftMode={setStagingDraftMode}
        stagingDraftName={stagingDraftName}
        setStagingDraftName={setStagingDraftName}
        targetDesktopBlueprint={targetDesktopBlueprint}
        setTargetDesktopBlueprint={setTargetDesktopBlueprint}
        stagingDraftCode={stagingDraftCode}
        stagingDraftNotes={stagingDraftNotes}
        setStagingDraftNotes={setStagingDraftNotes}
        stagingDraftAutoEquip={stagingDraftAutoEquip}
        setStagingDraftAutoEquip={setStagingDraftAutoEquip}
        stagingDraftStrategy={stagingDraftStrategy}
        setStagingDraftStrategy={setStagingDraftStrategy}
        stagingDraftItems={stagingDraftItems}
        stagingDraftRemovedItems={stagingDraftRemovedItems}
        loadSavedLocalDraft={loadSavedLocalDraft}
        toggleRemoveModInStagingDraft={toggleRemoveModInStagingDraft}
        setVolatileSignatureQueue={setVolatileSignatureQueue}
        activeSignatureQueueIndex={activeSignatureQueueIndex}
        setActiveSignatureQueueIndex={setActiveSignatureQueueIndex}
        setActiveSubTab={setActiveSubTab}
        isDraftPanelOpen={isDraftPanelOpen}
        setIsDraftPanelOpen={setIsDraftPanelOpen}
        isCloudPanelOpen={isCloudPanelOpen}
        setIsCloudPanelOpen={setIsCloudPanelOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isSettingsOpen={isSettingsOpen}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        cloudSearchFilter={cloudSearchFilter}
        setCloudSearchFilter={setCloudSearchFilter}
        draftVisibleCount={draftVisibleCount}
        setDraftVisibleCount={setDraftVisibleCount}
        setCloudVisibleCount={setCloudVisibleCount}
        cloudVisibleCount={cloudVisibleCount}
        isResolvingDeps={isResolvingDeps}
        isTransmitting={isTransmitting}
        isShredding={isShredding}
        inspectingPack={inspectingPack}
        setInspectingPack={setInspectingPack}
        inspectSearchQuery={inspectSearchQuery}
        setInspectSearchQuery={setInspectSearchQuery}
        inspectFilterTab={inspectFilterTab}
        setInspectFilterTab={setInspectFilterTab}
        setInspectBpEquipFilter={setInspectBpEquipFilter}
        inspectBpEquipFilter={inspectBpEquipFilter}
        inspectVisibleCount={inspectVisibleCount}
        setInspectVisibleCount={setInspectVisibleCount}
        activeDraftTitle={activeDraftTitle}
        goToNexusMods={goToNexusMods}
        filteredItems={filteredItems}
        filteredRemovedItems={filteredRemovedItems}
        cloudQueuesList={cloudQueuesList}
        activeCloud={activeCloud}
        filteredCloudItems={filteredCloudItems}
        filteredCloudRemovedItems={filteredCloudRemovedItems}
        depsCount={depsCount}
        isSingleModStaged={isSingleModStaged}
        isSingleModRemoved={isSingleModRemoved}
        sortItemsByPriorityTier={sortItemsByPriorityTier}
        handleSaveSnapshotLocally={handleSaveSnapshotLocally}
        handleStageModWithAutoDeps={handleStageModWithAutoDeps}
        handleResolveDependencies={handleResolveDependencies}
        handleEncryptAndTransmit={handleEncryptAndTransmit}
        handleLoadActiveCloudIntoEditor={handleLoadActiveCloudIntoEditor}
        handleStageDesktopBlueprintEdit={handleStageDesktopBlueprintEdit}
        handleShredActiveCloud={handleShredActiveCloud}
        inspectedAllItems={inspectedAllItems}
        isModInInspectedBp={isModInInspectedBp}
        inspectedFilteredItems={inspectedFilteredItems}
        totalPendingChangesCount={totalPendingChangesCount}
        renderStagedModCard={renderStagedModCard}
      />
    </div>
  );
}
