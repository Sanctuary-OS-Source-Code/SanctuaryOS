import { useState, useMemo, useEffect, useRef, useCallback, startTransition } from "react";
import { useShallow } from "zustand/react/shallow";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import {
  ActionButton,
  ViewHeader,
  getExtensionRegex,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  HoverTabDrawer,
  VerticalTabButton,
  DashboardStatTile,
  HoverTooltip,
  ActionPill,
  EmptyState,
  countBlueprintArtifacts,
  filterBlueprintModArtifacts,
  stripPriorityTierPrefix,
} from "./shared";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  StatTileCarousel,
} from "./hub-components/SharedCommandScreenLayout";
import BlueprintMatrix from "./BlueprintMatrix";
import BlueprintArchitect from "./BlueprintArchitect";
import {
  evaluateModIssues,
  groupBrokenMods,
  resolveBlueprintConflicts,
} from "./side-panels/CommandIncompatiblePanel";
import {
  groupBlueprintArtifactsByFamily,
  BlueprintInspectorModCard,
} from "./side-panels/NexusSidePanels";
import { UniversalCard } from "./components/universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "./chameleon-components/ThemeCard";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "./ContextMenu";
import {
  stageFullBlueprintToRigQueue,
  shredCloudStagingRow,
  markStagingRowDeployedLocally,
  unmarkStagingRowDeployedLocally,
  clearMobileBlueprintEdit,
  ResolvedStagedPayload,
} from "./utils/stagingCrypto";
import { VAULT_CHIP_CLASS } from "./shared-components/constants";
import {
  BlueprintPatchReadinessView,
  useBlueprintPatchReadiness,
  peekPendingBlueprintsNavigation,
  consumePendingBlueprintsNavigation,
  PatchModBucket,
  PatchPanelSubFilter,
} from "./components/BlueprintPatchReadiness";

export default function Blueprints({
  playSets,
  setPlaySets,
  activeSetName,
  equipPlaySet,
  deletePlaySet,
  syncCode: _syncCode,
  setSyncCode,
  uploadBlueprintToCloud,
  syncBlueprintByCode,
  renamePlaySet,
  importPlaySet,
  activePlaySetIndex,
  setActivePlaySetIndex,
  exportPlaySet,
  setIsDraftingSet,
  isDraftingSet,
  draftSetName,
  setDraftSetName,
  finalizeDraftSet,
  toggleInActiveSet,
  vaultPath,
  onRefreshMods,
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, modList, activeGameSchema, ignoredGlobal, session } = useStore(
    useShallow((s) => ({
      ownedDLC: s.ownedDLC,
      maskedDLC: s.maskedDLC,
      selectedVersion: s.selectedVersion,
      modList: s.modList,
      activeGameSchema: s.activeGameSchema,
      ignoredGlobal: s.ignoredGlobal,
      session: s.session,
    }))
  );
  const {
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    volatileSignatureQueues,
    setVolatileSignatureQueues,
    activeSignatureQueueIndex,
    setActiveSignatureQueueIndex,
    setIsSignatureQueueOpen,
  } = useModalStore(
    useShallow((s) => ({
      volatileSignatureQueue: s.volatileSignatureQueue,
      setVolatileSignatureQueue: s.setVolatileSignatureQueue,
      volatileSignatureQueues: s.volatileSignatureQueues,
      setVolatileSignatureQueues: s.setVolatileSignatureQueues,
      activeSignatureQueueIndex: s.activeSignatureQueueIndex,
      setActiveSignatureQueueIndex: s.setActiveSignatureQueueIndex,
      setIsSignatureQueueOpen: s.setIsSignatureQueueOpen,
    }))
  );

  const [activeTab, setActiveTab] = useState(() => {
    const pending = peekPendingBlueprintsNavigation();
    return pending?.tab || "LANDING";
  });
  const [pendingReadinessInspect, setPendingReadinessInspect] = useState<{
    bpName: string | null;
    bucket: PatchModBucket | null;
    subFilter: PatchPanelSubFilter | null;
  } | null>(() => {
    const pending = peekPendingBlueprintsNavigation();
    if (pending?.inspectBlueprintName) {
      return {
        bpName: pending.inspectBlueprintName,
        bucket: pending.initialBucket ?? null,
        subFilter: pending.initialSubFilter ?? null,
      };
    }
    return null;
  });

  const switchTab = useCallback((nextTab: string) => {
    startTransition(() => {
      setActiveTab(nextTab);
    });
  }, []);

  useEffect(() => {
    const applyPending = (detail?: any) => {
      const consumed = consumePendingBlueprintsNavigation();
      const targetTab = detail?.tab || consumed?.tab;
      const inspectBp =
        detail?.inspectBlueprintName ?? consumed?.inspectBlueprintName ?? null;
      const initBucket =
        detail?.initialBucket ?? consumed?.initialBucket ?? null;
      const initSub =
        detail?.initialSubFilter ?? consumed?.initialSubFilter ?? null;

      if (targetTab) {
        setActiveTab(targetTab);
      }
      if (inspectBp) {
        setPendingReadinessInspect({
          bpName: inspectBp,
          bucket: initBucket,
          subFilter: initSub,
        });
      }
    };

    applyPending();

    const handleNav = (e: Event) => {
      applyPending((e as CustomEvent)?.detail);
    };
    window.addEventListener("sanctuary-navigate-blueprints", handleNav);
    return () => window.removeEventListener("sanctuary-navigate-blueprints", handleNav);
  }, []);
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState("");
  const [shreddingRowId, setShreddingRowId] = useState<string | null>(null);
  const [selectedUplinkBlueprint, setSelectedUplinkBlueprint] = useState<any>(null);
  const [pinnedBlueprints, setPinnedBlueprints] = useState<string[]>(() => {
    try {
      const p = localStorage.getItem("myPinnedBlueprints");
      return p ? JSON.parse(p) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("myPinnedBlueprints", JSON.stringify(pinnedBlueprints));
  }, [pinnedBlueprints]);
  const togglePin = (name: string) =>
    setPinnedBlueprints((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [importStatus, setImportStatus] = useState<
    "idle" | "loading" | "success" | "error" | "missing"
  >("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncInputVisible, setSyncInputVisible] = useState(false);
  const [localSyncCode, setLocalSyncCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [myCloudBlueprints, setMyCloudBlueprints] = useState<any[]>([]);
  const [cloudFilterTab, setCloudFilterTab] = useState<"all" | "not_in_vault">("all");
  const [cloudSearchQuery, setCloudSearchQuery] = useState("");
  const [uplinkArtifactSearch, setUplinkArtifactSearch] = useState("");
  const [uplinkArtifactsLimit, setUplinkArtifactsLimit] = useState(100);
  const patchReadiness = useBlueprintPatchReadiness({
    pinnedBlueprintNames: pinnedBlueprints,
  });

  useEffect(() => {
    setUplinkArtifactsLimit(100);
  }, [selectedUplinkBlueprint, uplinkArtifactSearch]);

  useEffect(() => {
    const session = useStore.getState().session;
    if (session?.user?.id) {
      supabase
        .from("masons")
        .select("id")
        .eq("profile_id", session.user.id)
        .maybeSingle()
        .then(({ data: masonData }) => {
          if (masonData?.id) {
            supabase
              .from("blueprints")
              .select("name, code, created_at, artifacts")
              .eq("mason_id", masonData.id)
              .order("created_at", { ascending: false })
              .then(({ data }) => setMyCloudBlueprints(data || []));
          } else {
            setMyCloudBlueprints([]);
          }
        });
    }
  }, []);

  const handleImport = async () => {
    setImportStatus("loading");
    const res = await importPlaySet();
    if (res) {
      setImportStatus(res);
      setTimeout(() => setImportStatus("idle"), 3000);
    } else {
      setImportStatus("idle");
    }
  };

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);

  const optimizedModList = useMemo(() => {
    const map = new Map<string, any>();
    const byCleanLower = new Map<string, any>();
    const byBaseAndExt = new Map<string, any>();

    const registerModEntry = (m: any) => {
      if (!m?.name) return;
      if (!map.has(m.name)) map.set(m.name, m);
      const stripped = stripPriorityTierPrefix(m.name, activeGameSchema);
      if (stripped && !map.has(stripped)) map.set(stripped, m);
      const clean = (m.name.split(/[\\/]/).pop() || m.name).toLowerCase();
      if (clean && !byCleanLower.has(clean)) byCleanLower.set(clean, m);
      const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, "");
      const mExt = m.name.split(".").pop()?.toLowerCase();
      if (mBase && mExt) {
        const baseExtKey = `${mBase.toLowerCase()}::${mExt}`;
        if (!byBaseAndExt.has(baseExtKey)) {
          byBaseAndExt.set(baseExtKey, m);
        }
      }
    };

    (modList || []).forEach((m: any) => {
      if (!m) return;
      if (Array.isArray(m.flavors)) {
        for (let i = 0; i < m.flavors.length; i++) {
          registerModEntry(m.flavors[i]);
        }
      }
      registerModEntry(m);
    });
    return { map, byCleanLower, byBaseAndExt };
  }, [modList, extRegex, activeGameSchema]);

  const [radarCacheTick, setRadarCacheTick] = useState(0);
  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const getBlueprintAlertCount = (set: any) => {
    const res = { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 };
    if (!set || !set.mods || !Array.isArray(set.mods) || set.mods.length === 0) return res;

    const dedupedMods = filterBlueprintModArtifacts(set.mods, activeGameSchema);
    const activeMods = dedupedMods.map((rawMod: any) => {
      const modName =
        typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const strippedName = stripPriorityTierPrefix(modName, activeGameSchema);
      const cleanLower = (modName.split(/[\\/]/).pop() || modName).toLowerCase();
      const exactMatch =
        optimizedModList.map.get(modName) ||
        optimizedModList.map.get(strippedName) ||
        optimizedModList.byCleanLower.get(cleanLower);
      if (exactMatch)
        return {
          ...exactMatch,
          _originalSetName: modName,
        };

      const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "");
      const targetExt = modName.split(".").pop()?.toLowerCase();

      const fallbackMatch =
        targetBase && targetExt
          ? optimizedModList.byBaseAndExt.get(`${targetBase.toLowerCase()}::${targetExt}`)
          : undefined;
      if (fallbackMatch)
        return {
          ...fallbackMatch,
          _originalSetName: modName,
        };

      return {
        name: modName,
        isFallback: true,
        _originalSetName: modName,
      };
    });

    const evaluatedBroken = activeMods
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean);

    const groupedBroken = groupBrokenMods(evaluatedBroken);
    for (const gm of groupedBroken) {
      if (gm._alert_type === "red") res.broken++;
      else res.unstable++;
    }

    const resolvedConflicts = resolveBlueprintConflicts(
      set.name,
      activeMods,
      ignoredGlobal,
      t
    );
    for (const c of resolvedConflicts) {
      if (Number(c.conflict?.severity_rank) === 4) res.tier4++;
      else res.tier3++;
    }

    res.total = res.broken + res.unstable + res.tier4 + res.tier3;
    return res;
  };

  const alertCacheRef = useRef<{
    envKey: any[];
    entries: Map<string, { modsRef: any; ignoredRef: any; alertStatus: any }>;
  }>({
    envKey: [],
    entries: new Map(),
  });

  const setComputations = useMemo(() => {
    if (activeTab !== "LANDING" && activeTab !== "VAULT") {
      return {} as Record<string, { alertStatus: any }>;
    }

    const currentEnv = [
      optimizedModList,
      extRegex,
      selectedVersion,
      ownedDLC,
      maskedDLC,
      ignoredGlobal,
      activeGameSchema,
      t,
      radarCacheTick,
    ];
    const prevEnv = alertCacheRef.current.envKey;
    const envUnchanged =
      prevEnv.length === currentEnv.length &&
      currentEnv.every((v, idx) => v === prevEnv[idx]);
    if (!envUnchanged) {
      alertCacheRef.current = {
        envKey: currentEnv,
        entries: new Map(),
      };
    }

    const comps: Record<string, { alertStatus: any }> = {};
    const targetSets =
      activeTab === "LANDING"
        ? (playSets || []).filter((s: any) => pinnedBlueprints.includes(s.name))
        : playSets || [];

    for (let i = 0; i < targetSets.length; i++) {
      const set = targetSets[i];
      if (!set?.name) continue;
      const cached = alertCacheRef.current.entries.get(set.name);
      if (
        cached &&
        cached.modsRef === set.mods &&
        cached.ignoredRef === set.ignoredConflicts
      ) {
        comps[set.name] = { alertStatus: cached.alertStatus };
      } else {
        const alertStatus = getBlueprintAlertCount(set);
        alertCacheRef.current.entries.set(set.name, {
          modsRef: set.mods,
          ignoredRef: set.ignoredConflicts,
          alertStatus,
        });
        comps[set.name] = { alertStatus };
      }
    }
    return comps;
  }, [
    activeTab,
    playSets,
    pinnedBlueprints,
    optimizedModList,
    extRegex,
    selectedVersion,
    ownedDLC,
    maskedDLC,
    ignoredGlobal,
    activeGameSchema,
    t,
    radarCacheTick,
  ]);

  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [matrixPlaySet, setMatrixPlaySet] = useState<any>(null);
  const [editingSetName, setEditingSetName] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isArchitectOpen, setIsArchitectOpen] = useState(false);
  const [stagingRigSetName, setStagingRigSetName] = useState<string | null>(null);
  const [stagedRigSuccessSetName, setStagedRigSuccessSetName] = useState<string | null>(null);

  const handleStageSetToRigQueue = async (targetSet: any) => {
    if (!targetSet) return;
    if (!session?.user?.id) {
      useStore
        .getState()
        .pushStatus(
          t("alert_guest_mode_uploads", "Guest Mode Active: Uploads are disabled."),
          "warning"
        );
      return;
    }
    setStagingRigSetName(targetSet.name);
    try {
      const res = await stageFullBlueprintToRigQueue(
        targetSet,
        modList,
        activeGameSchema,
        session,
        selectedVersion
      );
      if (res.success) {
        setStagedRigSuccessSetName(targetSet.name);
        setTimeout(() => setStagedRigSuccessSetName(null), 3500);
        useStore
          .getState()
          .pushStatus(
            t(
              "status_rig_queue_sent",
              "{Blueprint} encrypted and staged to your Rig Queue! Open Signature Queue on your Steam Deck or other PC to deploy."
            ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(res.error || t("err_save_failed", "Failed to save blueprint"), "error");
      }
    } finally {
      setStagingRigSetName(null);
    }
  };

  const handleOpenMatrix = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (targetSet) {
      setMatrixPlaySet(targetSet);
      setIsMatrixOpen(true);
    }
  };

  const cloudQueuesList = useMemo<ResolvedStagedPayload[]>(() => {
    if (Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0) {
      return volatileSignatureQueues as ResolvedStagedPayload[];
    }
    if (volatileSignatureQueue) {
      return [volatileSignatureQueue as ResolvedStagedPayload];
    }
    return [];
  }, [volatileSignatureQueues, volatileSignatureQueue]);

  const pipelineSetNames = useMemo(() => {
    const s = new Set<string>();
    cloudQueuesList.forEach((q) => {
      const bpName = String(
        q?.payload?.targetDesktopBlueprint || q?.payload?.blueprintName || ""
      )
        .trim()
        .toLowerCase();
      if (bpName) s.add(bpName);
    });
    return s;
  }, [cloudQueuesList]);

  const handleOpenInSignatureQueue = (cloudTarget: ResolvedStagedPayload, queueIdx: number) => {
    setActiveSignatureQueueIndex(queueIdx);
    setVolatileSignatureQueue(cloudTarget);
    setIsSignatureQueueOpen(true);
  };

  const handleTogglePipelineCompleteLocally = (cloudTarget: ResolvedStagedPayload) => {
    if (!cloudTarget?.rowId) return;
    const nextCompleted = !cloudTarget.isCompletedLocally;
    if (nextCompleted) {
      markStagingRowDeployedLocally(cloudTarget.rowId);
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
      unmarkStagingRowDeployedLocally(cloudTarget.rowId);
    }
    const updated = cloudQueuesList.map((q) =>
      q.rowId === cloudTarget.rowId ? { ...q, isCompletedLocally: nextCompleted } : q
    );
    setVolatileSignatureQueues(updated);
    if ((volatileSignatureQueue as any)?.rowId === cloudTarget.rowId) {
      setVolatileSignatureQueue({ ...cloudTarget, isCompletedLocally: nextCompleted });
    }
  };

  const handleShredPipelineRow = async (cloudTarget: ResolvedStagedPayload) => {
    if (!cloudTarget) return;
    setShreddingRowId(cloudTarget.rowId || "shredding");
    try {
      const targetBp =
        cloudTarget?.payload?.targetDesktopBlueprint || cloudTarget?.payload?.blueprintName;
      if (targetBp) {
        clearMobileBlueprintEdit(targetBp);
      }
      await shredCloudStagingRow(cloudTarget?.rowId, session);
      const remaining = cloudQueuesList.filter((q) => q.rowId !== cloudTarget?.rowId);
      setVolatileSignatureQueues(remaining);
      const nextIdx = Math.min(activeSignatureQueueIndex, Math.max(0, remaining.length - 1));
      setActiveSignatureQueueIndex(nextIdx);
      setVolatileSignatureQueue(remaining[nextIdx] || null);
      window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));
      useStore
        .getState()
        .pushStatus(
          t("status_staging_shredded", "Cloud staging payload permanently shredded."),
          "info"
        );
    } finally {
      setShreddingRowId(null);
    }
  };

  const renderPipelineCard = (cloudTarget: ResolvedStagedPayload, queueIdx: number) => {
    if (!cloudTarget?.payload) return null;
    const cloudItems = cloudTarget.resolvedItems || [];
    const cloudRemoved = cloudTarget.payload?.removedItems || [];
    const isFullRig = Boolean(cloudTarget.payload?.isFullRigBlueprint);
    const ownedCount = cloudItems.filter((i: any) => i.isOwned).length;
    const bpTitle =
      cloudTarget.payload.blueprintName || t("term_blueprint", "{Blueprint}");
    const matchingLocalSet = (playSets || []).find(
      (s: any) => String(s?.name || "").toLowerCase() === bpTitle.toLowerCase()
    );
    const sourceDevice = cloudTarget.payload.sourceDevice || "Sanctuary Rig";

    return (
      <UniversalCard
        key={cloudTarget.rowId || cloudTarget.payload.blueprintCode || queueIdx}
        layout="vertical"
        isActive={!cloudTarget.isCompletedLocally}
        icon={t("icon_phonelink_ring", "phonelink_ring")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: bpTitle,
              json_data: {
                artifacts: cloudItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={bpTitle}
        subtitle={`${sourceDevice} • ${cloudTarget.isCompletedLocally
            ? t(
              "sig_queue_badge_completed_local",
              "Completed Here • Pending on Other Systems"
            )
            : t("staging_active_cloud_title", "Awaiting Desktop Signature")
          }`}
        onClick={() => handleOpenInSignatureQueue(cloudTarget, queueIdx)}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "open_sig_queue",
              label: t("pipeline_btn_open_sig_queue", "Inspect & Deploy"),
              icon: t("icon_draw", "draw"),
              variant: "accent",
              onClick: () => handleOpenInSignatureQueue(cloudTarget, queueIdx),
            },
            {
              id: "inspect_mods",
              label: t("blueprint_inspector", "Blueprint Mods"),
              icon: t("icon_extension", "extension"),
              badge: String(cloudItems.length),
              onClick: () =>
                setSelectedUplinkBlueprint({
                  name: bpTitle,
                  code: cloudTarget.payload.blueprintCode || "RIG PIPELINE",
                  artifacts: cloudItems,
                }),
            },
            {
              id: "toggle_complete_local",
              label: cloudTarget.isCompletedLocally
                ? t("sig_queue_btn_mark_pending_local", "Mark Pending on This System")
                : t("sig_queue_btn_mark_complete_local", "Mark Complete on This System"),
              icon: cloudTarget.isCompletedLocally
                ? t("icon_schedule", "schedule")
                : t("icon_task_alt", "task_alt"),
              variant: "success",
              dividerBefore: true,
              onClick: () => handleTogglePipelineCompleteLocally(cloudTarget),
            },
          ];
          if (matchingLocalSet) {
            items.push({
              id: "rebeam_local",
              label: t("pipeline_btn_update_beam", "Update in Pipeline"),
              icon: t("icon_devices", "devices"),
              variant: "accent",
              onClick: () => handleStageSetToRigQueue(matchingLocalSet),
            });
          }
          items.push({
            id: "shred_pipeline",
            label: t("staging_btn_shred_short", "Clear"),
            icon: t("icon_delete_forever", "delete_forever"),
            variant: "danger",
            dividerBefore: true,
            onClick: () => handleShredPipelineRow(cloudTarget),
          });
          openSanctuaryContextMenu(e, {
            title: bpTitle,
            subtitle: `${cloudItems.length} ${t("artifacts_linked", "{Mods} Linked")} • ${sourceDevice}`,
            statusLabel: cloudTarget.isCompletedLocally
              ? t("sig_queue_badge_completed_short", "Completed Here")
              : t("staging_badge_aes", "AES-256-GCM"),
            statusColorClass: cloudTarget.isCompletedLocally
              ? "text-[var(--success)]"
              : "text-[var(--accent)]",
            icon: t("icon_phonelink_ring", "phonelink_ring"),
            iconColorClass: "text-[var(--accent)]",
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[85%] z-30 pointer-events-none whitespace-nowrap">
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
                setSelectedUplinkBlueprint({
                  name: bpTitle,
                  code: cloudTarget.payload.blueprintCode || "RIG PIPELINE",
                  artifacts: cloudItems,
                });
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
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${ownedCount === cloudItems.length && cloudItems.length > 0
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                  }`}
              >
                {ownedCount === cloudItems.length && cloudItems.length > 0
                  ? t("icon_verified", "verified")
                  : t("icon_cloud_download", "cloud_download")}
              </span>
              <span>
                {ownedCount}/{cloudItems.length} {t("status_in_vault", "In {Vault}")}
              </span>
            </div>
            {isFullRig && (
              <div className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_devices", "devices")}
                </span>
                <span>{t("pipeline_badge_full_rig", "Full Rig {Blueprint}")}</span>
              </div>
            )}
            {cloudRemoved.length > 0 && (
              <div
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_remove_circle_outline", "remove_circle_outline")}
                </span>
                <span>
                  -{cloudRemoved.length} {t("staging_badge_removing", "Queued to {Remove}")}
                </span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInSignatureQueue(cloudTarget, queueIdx);
              }}
              className="w-full h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_draw", "draw")}
              </span>
              <span className="truncate">
                {t("pipeline_btn_open_sig_queue", "Inspect & Deploy")}
              </span>
            </button>

            <div className={`grid ${matchingLocalSet ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePipelineCompleteLocally(cloudTarget);
                }}
                className={`h-8 glass-surface border rounded-lg transition-all flex items-center justify-center relative cursor-pointer ${cloudTarget.isCompletedLocally
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:text-[var(--success)]"
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

              {matchingLocalSet && (
                <button
                  type="button"
                  disabled={stagingRigSetName === matchingLocalSet.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageSetToRigQueue(matchingLocalSet);
                  }}
                  className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
                >
                  <span
                    className={`material-symbols-outlined !text-[16px] ${stagingRigSetName === matchingLocalSet.name
                        ? "animate-spin text-[var(--accent)]"
                        : ""
                      }`}
                  >
                    {stagingRigSetName === matchingLocalSet.name
                      ? t("icon_sync", "sync")
                      : t("icon_devices", "devices")}
                  </span>
                  <HoverTooltip
                    title={t("pipeline_btn_update_beam", "Update in Pipeline")}
                  />
                </button>
              )}

              <button
                type="button"
                disabled={shreddingRowId === cloudTarget.rowId}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShredPipelineRow(cloudTarget);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
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
          </div>
        }
      />
    );
  };

  const renderVaultCard = (set: any) => {
    const { alertStatus } = setComputations[set.name] || {
      alertStatus: { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 },
    };
    const isPinned = pinnedBlueprints.includes(set.name);
    const hasAlerts = alertStatus && alertStatus.total > 0;
    const isDeployed = activeSetName === set.name;
    const linkedModsCount = countBlueprintArtifacts(set.mods, activeGameSchema);

    const titleNode =
      editingSetName === set.name ? (
        <div onClick={(e) => e.stopPropagation()} className="w-full">
          <input
            autoFocus
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                  renamePlaySet(set.name, newSetName.trim());
                }
                setEditingSetName(null);
              } else if (e.key === "Escape") {
                setEditingSetName(null);
              }
            }}
            onBlur={() => {
              if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                renamePlaySet(set.name, newSetName.trim());
              }
              setEditingSetName(null);
            }}
            className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-3 py-1.5 rounded-xl text-sm font-black text-[var(--text)] tracking-tight outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer w-full group/editbtn"
          onClick={(e) => {
            e.stopPropagation();
            setNewSetName(set.name);
            setEditingSetName(set.name);
          }}
        >
          <span className="truncate">{set.name}</span>
          <span className="material-symbols-outlined !text-[14px] opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--accent)] shrink-0">
            {t("icon_edit", "edit")}
          </span>
        </div>
      );

    return (
      <UniversalCard
        key={set.name}
        layout="vertical"
        isActive={isDeployed}
        icon={isDeployed ? t("icon_verified_user", "verified_user") : t("icon_map", "map")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={set}
            countOverride={linkedModsCount}
            heightClass="h-full"
          />
        }
        title={titleNode}
        subtitle={isDeployed ? t("btn_deployed", "Deployed") : t("term_blueprint", "{Blueprint}")}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "equip",
              label: isDeployed
                ? t("btn_deployed", "Deployed")
                : t("action_equip", "Equip {Blueprint}"),
              icon: isDeployed
                ? t("icon_verified_user", "verified_user")
                : t("icon_play_circle", "play_circle"),
              variant: isDeployed ? "success" : "accent",
              onClick: () => equipPlaySet && equipPlaySet(set.name),
            },
            {
              id: "inspect",
              label: t("blueprint_inspector", "Blueprint Mods"),
              icon: t("icon_extension", "extension"),
              badge: String(linkedModsCount),
              onClick: () =>
                setSelectedUplinkBlueprint({
                  name: set.name,
                  code: "LOCAL BLUEPRINT",
                  artifacts: set.mods,
                }),
            },
            {
              id: "architect",
              label: hasAlerts
                ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                : t("architect", "Blueprint Architect"),
              icon: hasAlerts
                ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                  ? t("icon_error", "error")
                  : t("icon_warning", "warning")
                : t("icon_tune", "tune"),
              variant: hasAlerts
                ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                  ? "danger"
                  : "warning"
                : "default",
              onClick: () => {
                if (setActivePlaySetIndex)
                  setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                setIsArchitectOpen(true);
              },
            },
            {
              id: "pin",
              label: isPinned
                ? t("action_unpin", "Unpin {Blueprint}")
                : t("action_pin", "Pin {Blueprint}"),
              icon: isPinned ? t("icon_keep_off", "keep_off") : t("icon_keep", "keep"),
              dividerBefore: true,
              onClick: () => togglePin(set.name),
            },
            {
              id: "rename",
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () => {
                setNewSetName(set.name);
                setEditingSetName(set.name);
              },
            },
            {
              id: "duplicate",
              label: t("btn_snapshot", "Snapshot Active {Blueprint}"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => {
                let copyIndex = 1;
                let newName = `${set.name} (Copy)`;
                while (
                  playSets.some(
                    (s: any) => s.name.toLowerCase() === newName.toLowerCase()
                  )
                ) {
                  newName = `${set.name} (Copy) (${copyIndex})`;
                  copyIndex++;
                }
                const updatedSets = [
                  ...playSets,
                  {
                    name: newName,
                    mods: Array.isArray(set.mods) ? [...set.mods] : [],
                    modHashes: set.modHashes ? { ...set.modHashes } : undefined,
                    modMeta: set.modMeta ? { ...set.modMeta } : undefined,
                    loadRules: Array.isArray(set.loadRules)
                      ? set.loadRules.map((r: any) => ({ ...r }))
                      : undefined,
                    modTiers: set.modTiers ? { ...set.modTiers } : undefined,
                    loadOrder: Array.isArray(set.loadOrder)
                      ? [...set.loadOrder]
                      : undefined,
                  },
                ];
                setPlaySets(updatedSets);
                window.dispatchEvent(new Event("storage"));
              },
            },
            {
              id: "send_rig_queue",
              label: t("action_send_rig_queue", "Send to Rig Queue"),
              icon: t("icon_devices", "devices"),
              variant: "accent",
              dividerBefore: true,
              onClick: () => handleStageSetToRigQueue(set),
            },
            {
              id: "uplink",
              label: t("action_uplink", "Uplink"),
              icon: t("icon_cloud", "cloud"),
              onClick: () => handleOpenMatrix(set.name),
            },
            {
              id: "export",
              label: t("action_export", "Export"),
              icon: t("icon_upload", "upload"),
              onClick: () => exportPlaySet && exportPlaySet(set.name),
            },
            {
              id: "delete",
              label: `${t("purge", "{Delete}")} ${t("term_blueprint", "{Blueprint}")}`,
              icon: t("icon_delete_forever", "delete_forever"),
              variant: "danger",
              dividerBefore: true,
              onClick: () => deletePlaySet && deletePlaySet(set.name),
            },
          ];

          openSanctuaryContextMenu(e, {
            title: set.name,
            subtitle: `${linkedModsCount} ${t("artifacts_linked", "{Mods} Linked")}`,
            statusLabel: isDeployed
              ? t("status_active", "Active")
              : t("status_standby", "Standby"),
            statusColorClass: isDeployed ? "text-[var(--success)]" : "opacity-80",
            icon: isDeployed
              ? t("icon_verified_user", "verified_user")
              : t("icon_map", "map"),
            iconColorClass: isDeployed ? "text-[var(--success)]" : "text-[var(--accent)]",
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[75%] z-30 pointer-events-none whitespace-nowrap">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${isDeployed ? "text-[var(--success)]" : "text-[var(--subtext)]"
                  }`}
              >
                {isDeployed ? t("icon_verified_user", "verified_user") : t("icon_schedule", "schedule")}
              </span>
              <span>
                {isDeployed ? t("status_active", "Active") : t("status_standby", "Standby")}
              </span>
            </div>
            {pipelineSetNames.has(String(set.name || "").toLowerCase()) && (
              <div className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_phonelink_ring", "phonelink_ring")}
                </span>
                <span>{t("pipeline_badge_in_pipeline", "In Pipeline")}</span>
              </div>
            )}
          </div>
        }
        actions={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(set.name);
            }}
            className={`w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all relative ${isPinned
                ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_55%,transparent)] opacity-100"
                : "text-[var(--subtext)] opacity-65 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]"
              }`}
          >
            <span
              className="material-symbols-outlined !text-[16px]"
              style={{
                fontVariationSettings: isPinned ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {isPinned
                ? t("icon_keep", "keep")
                : t("icon_keep_off", "keep_off")}
            </span>
            <HoverTooltip
              title={
                isPinned
                  ? t("action_unpin", "Unpin {Blueprint}")
                  : t("action_pin", "Pin {Blueprint}")
              }
            />
          </button>
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUplinkBlueprint({
                  name: set.name,
                  code: "LOCAL BLUEPRINT",
                  artifacts: set.mods,
                });
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {linkedModsCount} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            {selectedVersion && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_sell", "sell")}
                </span>
                <span className="text-[var(--subtext)]">v{selectedVersion}</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (setActivePlaySetIndex)
                  setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                setIsArchitectOpen(true);
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors cursor-pointer`}
            >
              <span
                className={`material-symbols-outlined !text-[12px] ${hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                    : "text-[var(--success)]"
                  }`}
              >
                {hasAlerts
                  ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                    ? t("icon_error", "error")
                    : t("icon_warning", "warning")
                  : t("icon_verified", "verified")}
              </span>
              <span
                className={
                  hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                    : "text-[var(--subtext)]"
                }
              >
                {hasAlerts
                  ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                  : t("tier_clean", "Clean")}
              </span>
            </button>
          </>
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  equipPlaySet && equipPlaySet(set.name);
                }}
                className={`flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border glass-surface ${isDeployed
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isDeployed
                    ? t("icon_verified_user", "verified_user")
                    : t("icon_play_circle", "play_circle")}
                </span>
                <span>
                  {isDeployed ? t("btn_deployed", "Deployed") : t("playsets_btn_equip", "Equip")}
                </span>
                <HoverTooltip
                  title={
                    isDeployed
                      ? t("btn_deployed", "Deployed")
                      : t("action_equip", "Equip {Blueprint}")
                  }
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (setActivePlaySetIndex)
                    setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                  setIsArchitectOpen(true);
                }}
                className={`h-9 px-3.5 glass-surface border rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider ${hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                      : "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? t("icon_error", "error")
                      : t("icon_warning", "warning")
                    : t("icon_tune", "tune")}
                </span>
                <HoverTooltip
                  title={
                    hasAlerts
                      ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                      : t("architect", "Blueprint Architect")
                  }
                />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                disabled={stagingRigSetName === set.name}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStageSetToRigQueue(set);
                }}
                className={`h-8 glass-surface border rounded-lg transition-all flex items-center justify-center relative cursor-pointer ${stagedRigSuccessSetName === set.name
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  }`}
              >
                <span
                  className={`material-symbols-outlined !text-[16px] ${stagingRigSetName === set.name ? "animate-spin text-[var(--accent)]" : ""
                    }`}
                >
                  {stagingRigSetName === set.name
                    ? t("icon_sync", "sync")
                    : stagedRigSuccessSetName === set.name
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_devices", "devices")}
                </span>
                <HoverTooltip
                  title={
                    stagedRigSuccessSetName === set.name
                      ? t("status_rig_queue_sent", "{Blueprint} Staged to Rig Queue!")
                      : t("action_send_rig_queue", "Send to Rig Queue")
                  }
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenMatrix(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_cloud", "cloud")}
                </span>
                <HoverTooltip title={t("action_uplink", "Uplink")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  exportPlaySet && exportPlaySet(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_upload", "upload")}
                </span>
                <HoverTooltip title={t("action_export", "Export")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (deleteConfirm === set.name) {
                    deletePlaySet && deletePlaySet(set.name);
                    setDeleteConfirm(null);
                  } else {
                    setDeleteConfirm(set.name);
                    setTimeout(() => setDeleteConfirm(null), 3000);
                  }
                }}
                className={`h-8 transition-all flex items-center justify-center rounded-lg border glass-surface relative cursor-pointer ${deleteConfirm === set.name
                    ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {deleteConfirm === set.name
                    ? t("icon_warning", "warning")
                    : t("icon_delete", "delete")}
                </span>
                <HoverTooltip
                  title={
                    deleteConfirm === set.name ? t("confirm", "Confirm") : t("purge", "Delete")
                  }
                />
              </button>
            </div>
          </div>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full">
      <ViewHeader
        title={t("playsets_title", "{Blueprints}")}
        subtitle={t("playsets_subtitle", "Manage load orders and cloud uplinks")}
        icon={t("icon_map", "map")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        shape="circle"
        breadcrumb={
          activeTab === "PIPELINE"
            ? t("tab_personal_pipeline", "Personal Rig Pipeline")
            : activeTab === "READINESS"
              ? t("patch_sim_tab_title", "Patch Readiness")
              : activeTab !== "LANDING"
                ? t(`tab_${activeTab.toLowerCase()}`, activeTab) || activeTab
                : undefined
        }
        onTitleClick={() => setActiveTab("LANDING")}
      >
        {activeTab === "VAULT" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <ActionPill
              searchQuery={vaultSearchQuery}
              setSearchQuery={setVaultSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              actions={[
                {
                  id: "draft_new",
                  icon: (
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_add_circle", "add_circle")}
                    </span>
                  ),
                  label: t("draft_new", "Draft New {Blueprint}"),
                  onClick: () => setIsDraftingSet && setIsDraftingSet(true),
                },
              ]}
            />
          </div>
        )}
        {activeTab === "PIPELINE" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <ActionPill
              searchQuery={pipelineSearchQuery}
              setSearchQuery={setPipelineSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              actions={[
                {
                  id: "beam_active_bp",
                  icon: (
                    <span
                      className={`material-symbols-outlined !text-[20px] ${stagingRigSetName ? "animate-spin text-[var(--accent)]" : ""
                        }`}
                    >
                      {stagingRigSetName
                        ? t("icon_sync", "sync")
                        : t("icon_devices", "devices")}
                    </span>
                  ),
                  label: t("action_send_rig_queue", "Send to Rig Queue"),
                  onClick: () => {
                    const activeCandidate =
                      playSets?.find((s: any) => s.name === activeSetName) ||
                      playSets?.[activePlaySetIndex];
                    const fallbackNonEmpty = (playSets || []).find(
                      (s: any) => countBlueprintArtifacts(s?.mods, activeGameSchema) > 0
                    );
                    const target =
                      activeCandidate &&
                        countBlueprintArtifacts(activeCandidate.mods, activeGameSchema) > 0
                        ? activeCandidate
                        : fallbackNonEmpty || activeCandidate || playSets?.[0];
                    if (target) {
                      handleStageSetToRigQueue(target);
                    }
                  },
                },
                ...(cloudQueuesList.length > 0
                  ? [
                    {
                      id: "open_sig_queue_panel",
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
              ]}
            />
          </div>
        )}
        {activeTab === "NETWORK" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <ActionPill
              searchQuery={cloudSearchQuery}
              setSearchQuery={setCloudSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              actions={[
                {
                  id: "filter_missing",
                  icon: (
                    <span className="material-symbols-outlined !text-[20px]">
                      {cloudFilterTab === "not_in_vault"
                        ? t("icon_visibility_off", "visibility_off")
                        : t("icon_visibility", "visibility")}
                    </span>
                  ),
                  label:
                    cloudFilterTab === "not_in_vault"
                      ? t("show_all", "Show All {Blueprints}")
                      : t("blueprint_tab_missing", "Missing from {Vault}"),
                  activeClassName:
                    cloudFilterTab === "not_in_vault"
                      ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                      : "",
                  onClick: () =>
                    setCloudFilterTab(
                      cloudFilterTab === "not_in_vault" ? "all" : "not_in_vault"
                    ),
                },
              ]}
            />
          </div>
        )}
      </ViewHeader>

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("playsets_title", "{Blueprints}")}
          activeTab={activeTab}
          setTab={switchTab}
        >
          <VerticalTabButton
            id="LANDING"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            activeTab={activeTab}
            setTab={switchTab}
          />
          <VerticalTabButton
            id="VAULT"
            icon={t("icon_map", "map")}
            label={t("playsets_all", "All Blueprints")}
            activeTab={activeTab}
            setTab={switchTab}
          />
          <VerticalTabButton
            id="PIPELINE"
            icon={t("icon_phonelink_ring", "phonelink_ring")}
            label={t("tab_personal_pipeline", "Personal Rig Pipeline")}
            activeTab={activeTab}
            setTab={switchTab}
            iconColorClass="text-cyan-400"
          />
          <VerticalTabButton
            id="NETWORK"
            icon={t("icon_cloud", "cloud")}
            label={t("btn_my_cloud_blueprints", "My Cloud {Blueprints}")}
            activeTab={activeTab}
            setTab={switchTab}
            iconColorClass="text-sky-500"
          />
          <VerticalTabButton
            id="READINESS"
            icon={t("icon_published_with_changes", "published_with_changes")}
            label={t("patch_sim_tab_title", "Patch Readiness")}
            activeTab={activeTab}
            setTab={switchTab}
            iconColorClass="text-emerald-400"
          />
        </HoverTabDrawer>
      </div>

      <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            number={activeSetName || ""}
            onClick={() => switchTab("LANDING")}
            isActive={activeTab === "LANDING"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_map", "map")}
            label={t("playsets_all", "All Blueprints")}
            number={playSets?.length || 0}
            onClick={() => switchTab("VAULT")}
            isActive={activeTab === "VAULT"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_phonelink_ring", "phonelink_ring")}
            label={t("tab_personal_pipeline", "Personal Rig Pipeline")}
            colorClass="text-cyan-400"
            number={cloudQueuesList.length}
            onClick={() => switchTab("PIPELINE")}
            isActive={activeTab === "PIPELINE"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_cloud", "cloud")}
            label={t("btn_my_cloud_blueprints", "My Cloud {Blueprints}")}
            colorClass="text-sky-500"
            number={myCloudBlueprints?.length || 0}
            onClick={() => switchTab("NETWORK")}
            isActive={activeTab === "NETWORK"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_published_with_changes", "published_with_changes")}
            label={t("patch_sim_tab_title", "Patch Readiness")}
            colorClass={
              patchReadiness.activeBlueprintReport?.verdict === "hold"
                ? "text-[var(--danger)]"
                : patchReadiness.activeBlueprintReport?.verdict === "updates_ready"
                  ? "text-[var(--warning)]"
                  : "text-[var(--success)]"
            }
            number={`${patchReadiness.activeBlueprintReport?.readinessPercent ?? 100}%`}
            onClick={() => switchTab("READINESS")}
            isActive={activeTab === "READINESS"}
          />
        </StatTileCarousel>
      </div>

      {activeTab === "LANDING" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <div className="flex flex-col gap-4 w-full">
                    <CommandScreenSectionHeading
                      title={t("pinned_blueprints", "Pinned {Blueprints}")}
                      icon={t("icon_keep", "keep")}
                    />

                    {pinnedBlueprints.length > 0 ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                        {playSets
                          .filter((s: any) => pinnedBlueprints.includes(s.name))
                          .map((set: any) => renderVaultCard(set))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={t("icon_push_pin", "push_pin")}
                        title={t("no_pinned_blueprints", "No Pinned {Blueprints}")}
                        minHeightClass="min-h-[160px]"
                      />
                    )}
                  </div>

                  {cloudQueuesList.length > 0 && (
                    <div className="flex flex-col gap-4 w-full">
                      <CommandScreenSectionHeading
                        title={t("tab_personal_pipeline", "Personal Rig Pipeline")}
                        icon={t("icon_phonelink_ring", "phonelink_ring")}
                      />
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                        {cloudQueuesList.map((qItem, qIdx) =>
                          renderPipelineCard(qItem, qIdx)
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon={t("icon_bolt", "bolt")}>
                <CommandScreenQuickLink
                  icon={t("icon_add_circle", "add_circle")}
                  title={t("draft_new", "Draft New {Blueprint}")}
                  subtitle={t("draft_new_desc", "Create a new {blueprint}")}
                  onClick={() => {
                    switchTab("VAULT");
                    setIsDraftingSet(true);
                  }}
                  iconColorClass="text-[var(--accent)]"
                />
                <CommandScreenQuickLink
                  icon={t("icon_camera", "camera")}
                  title={t("btn_snapshot", "Snapshot Active {Blueprint}")}
                  subtitle={t("snapshot_desc", "Clone active {blueprint}")}
                  onClick={() => {
                    const activeSet = playSets[activePlaySetIndex];
                    if (!activeSet) return;
                    let copyIndex = 1;
                    let newName = `${activeSet.name} (Copy)`;
                    while (
                      playSets.some(
                        (s: any) => s.name.toLowerCase() === newName.toLowerCase()
                      )
                    ) {
                      newName = `${activeSet.name} (Copy) (${copyIndex})`;
                      copyIndex++;
                    }
                    const updatedSets = [
                      ...playSets,
                      {
                        name: newName,
                        mods: [...activeSet.mods],
                        modHashes: activeSet.modHashes
                          ? { ...activeSet.modHashes }
                          : undefined,
                        modMeta: activeSet.modMeta ? { ...activeSet.modMeta } : undefined,
                        loadRules: Array.isArray(activeSet.loadRules)
                          ? activeSet.loadRules.map((r: any) => ({ ...r }))
                          : undefined,
                        modTiers: activeSet.modTiers ? { ...activeSet.modTiers } : undefined,
                        loadOrder: Array.isArray(activeSet.loadOrder)
                          ? [...activeSet.loadOrder]
                          : undefined,
                      },
                    ];
                    setPlaySets(updatedSets);
                    window.dispatchEvent(new Event("storage"));
                    if (setActivePlaySetIndex) setActivePlaySetIndex(updatedSets.length - 1);
                    switchTab("VAULT");
                  }}
                  iconColorClass="text-[var(--accent)]"
                />
                <CommandScreenQuickLink
                  icon={
                    importStatus === "loading"
                      ? t("icon_sync", "sync")
                      : t("icon_download", "download")
                  }
                  title={
                    importStatus === "loading"
                      ? t("btn_importing", "Importing...")
                      : importStatus === "success"
                        ? t("status_profile_imported", "Imported")
                        : importStatus === "error"
                          ? t("alert_import_failed", "Import Failed")
                          : t("playsets_btn_import", "Import {Blueprint}")
                  }
                  subtitle={t("import_desc", "Import a JSON file to load an external {Blueprint}.")}
                  onClick={handleImport}
                  iconColorClass="text-[var(--accent)]"
                />
                {syncInputVisible ? (
                  <div className="w-full p-6 glass-panel border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-2xl relative h-24 text-left group animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-5 h-full relative z-10 w-full">
                      <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-3xl">
                          {t("icon_cloud_download", "cloud_download")}
                        </span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 w-full justify-center">
                        <div className="flex items-center justify-start w-full border-b border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1">
                          <input
                            autoFocus
                            value={localSyncCode}
                            onChange={(e) => setLocalSyncCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && localSyncCode.trim()) {
                                if (setSyncCode) setSyncCode(localSyncCode.trim());
                                if (syncBlueprintByCode) {
                                  setIsSyncing(true);
                                  syncBlueprintByCode(localSyncCode.trim()).finally(() =>
                                    setIsSyncing(false)
                                  );
                                }
                                setLocalSyncCode("");
                                setSyncInputVisible(false);
                              }
                            }}
                            placeholder={t("sidebar_uplink_placeholder", "Enter Uplink Code...")}
                            className="bg-transparent border-none outline-none w-full text-[11px] font-black capitalize tracking-widest text-[var(--accent)] placeholder:text-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          />
                          <button
                            onClick={() => setSyncInputVisible(false)}
                            className="text-[var(--subtext)] hover:text-white ml-2 transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                        <span className="text-[8px] capitalize font-bold opacity-80 tracking-widest text-[var(--accent)] mt-1.5 flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[10px]">
                            {t("icon_keyboard_return", "keyboard_return")}
                          </span>
                          {t("press_enter_to_sync", "Press Enter to Sync")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CommandScreenQuickLink
                    icon={
                      isSyncing
                        ? t("icon_sync", "sync")
                        : t("icon_cloud_sync", "cloud_sync")
                    }
                    title={
                      isSyncing
                        ? t("btn_importing", "Syncing...")
                        : t("btn_sync", "Sync by Uplink Code")
                    }
                    subtitle={t("sync_desc", "Download a cloud {Blueprint} via code")}
                    onClick={() => setSyncInputVisible(true)}
                    iconColorClass="text-[var(--accent)]"
                  />
                )}
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      )}

      {activeTab === "READINESS" && (
        <BlueprintPatchReadinessView
          pinnedBlueprints={pinnedBlueprints}
          readiness={patchReadiness}
          initialInspectBlueprint={pendingReadinessInspect?.bpName}
          initialInspectBucket={pendingReadinessInspect?.bucket}
          initialInspectSubFilter={pendingReadinessInspect?.subFilter}
          onClearInitialInspect={() => setPendingReadinessInspect(null)}
        />
      )}

      {activeTab === "VAULT" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-12 pt-2">
            {isDraftingSet && (
              <div className="glass-panel border-[color-mix(in_srgb,var(--accent)_35%,transparent)] p-6 rounded-2xl flex flex-col gap-4 animate-in zoom-in-95 relative min-h-[14rem] justify-center">
                <input
                  autoFocus
                  type="text"
                  value={draftSetName}
                  onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-4 text-xl text-[var(--text)] font-black outline-none focus:border-[var(--accent)] transition-all z-10 text-center"
                  placeholder={t("draft_placeholder", "{Blueprint} Name...")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finalizeDraftSet();
                  }}
                />
                <div className="flex gap-3 mt-2 z-10">
                  <button
                    onClick={finalizeDraftSet}
                    className="flex-1 py-3 glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] font-black capitalize tracking-widest text-[10px] rounded-xl hover:border-[color-mix(in_srgb,var(--success)_65%,transparent)] transition-all"
                  >
                    {t("hub_save", "Save")}
                  </button>
                  <button
                    onClick={() => setIsDraftingSet && setIsDraftingSet(false)}
                    className="w-16 py-3 flex items-center justify-center glass-surface text-[var(--text)] font-black rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-[var(--danger)] transition-all"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {(playSets || [])
              .filter(
                (s: any) =>
                  !vaultSearchQuery ||
                  s.name.toLowerCase().includes(vaultSearchQuery.toLowerCase())
              )
              .map((set: any) => renderVaultCard(set))}
          </div>
        </div>
      )}

      {activeTab === "PIPELINE" && (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-32">
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              title={`${t("pipeline_section_active_queue", "Active Encrypted Pipeline Queue")} (${cloudQueuesList.length})`}
              icon={t("icon_phonelink_ring", "phonelink_ring")}
            />
            {cloudQueuesList.length === 0 ? (
              <EmptyState
                icon={t("icon_phonelink_ring", "phonelink_ring")}
                title={t("staging_empty_cloud_title", "No Active Payload Waiting for PC")}
                subtitle={t(
                  "matrix_rig_transfer_desc",
                  "Bypass public Tier 0 restrictions using Zero-PII AES-256-GCM encryption. Sends all {mods} in this {Blueprint} (including Tier 1–4, Unknown/Local {mods}, and Load Order rules) directly to your personal Signature Queue on your Steam Deck or other rigs."
                )}
                action={
                  (playSets || []).length > 0 ? (
                    <ActionButton
                      variant="primary"
                      disabled={Boolean(stagingRigSetName)}
                      icon={
                        stagingRigSetName
                          ? t("icon_sync", "sync")
                          : t("icon_devices", "devices")
                      }
                      label={
                        stagingRigSetName
                          ? t("scanning", "Scanning...")
                          : t("action_send_rig_queue", "Send to Rig Queue")
                      }
                      onClick={() => {
                        const activeCandidate =
                          playSets?.find((s: any) => s.name === activeSetName) ||
                          playSets?.[activePlaySetIndex];
                        const fallbackNonEmpty = (playSets || []).find(
                          (s: any) => countBlueprintArtifacts(s?.mods, activeGameSchema) > 0
                        );
                        const target =
                          activeCandidate &&
                            countBlueprintArtifacts(activeCandidate.mods, activeGameSchema) > 0
                            ? activeCandidate
                            : fallbackNonEmpty || activeCandidate || playSets?.[0];
                        if (target) {
                          handleStageSetToRigQueue(target);
                        }
                      }}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pt-1">
                {cloudQueuesList
                  .map((qItem, qIdx) => ({ qItem, qIdx }))
                  .filter(({ qItem }) => {
                    if (!pipelineSearchQuery.trim()) return true;
                    const q = pipelineSearchQuery.toLowerCase();
                    return (
                      String(qItem?.payload?.blueprintName || "")
                        .toLowerCase()
                        .includes(q) ||
                      String(qItem?.payload?.sourceDevice || "")
                        .toLowerCase()
                        .includes(q)
                    );
                  })
                  .map(({ qItem, qIdx }) => renderPipelineCard(qItem, qIdx))}
              </div>
            )}
          </div>

          {(playSets || []).length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading
                title={`${t("pipeline_section_beam_local", "Beam Local {Blueprints} to Pipeline")} (${playSets.length})`}
                icon={t("icon_devices", "devices")}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pt-1">
                {(playSets || [])
                  .filter(
                    (s: any) =>
                      !pipelineSearchQuery.trim() ||
                      String(s?.name || "")
                        .toLowerCase()
                        .includes(pipelineSearchQuery.toLowerCase())
                  )
                  .map((set: any) => renderVaultCard(set))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "NETWORK" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-32">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 h-full pt-2">
            {myCloudBlueprints.length === 0 ? (
              <EmptyState
                icon={t("icon_cloud_off", "cloud_off")}
                title={t("no_cloud_blueprints", "No Cloud {Blueprints}")}
                className="col-span-full py-16"
              />
            ) : myCloudBlueprints.filter((bp) => {
              const inVault = playSets.some(
                (set: any) =>
                  (set.code && set.code.toUpperCase() === bp.code.toUpperCase()) ||
                  set.name.toLowerCase() === bp.name.toLowerCase()
              );
              const matchesSearch =
                !cloudSearchQuery ||
                bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) ||
                bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
              return (cloudFilterTab === "all" ? true : !inVault) && matchesSearch;
            }).length === 0 ? (
              <EmptyState
                icon={t("icon_task_alt", "task_alt")}
                title={t("no_cloud_blueprints", "No Cloud {Blueprints}")}
                className="col-span-full py-16"
              />
            ) : (
              myCloudBlueprints
                .filter((bp) => {
                  const inVault = playSets.some(
                    (set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase()
                  );
                  const matchesSearch =
                    !cloudSearchQuery ||
                    bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) ||
                    bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                  return (cloudFilterTab === "all" ? true : !inVault) && matchesSearch;
                })
                .map((bp) => {
                  const inVault = playSets.some(
                    (set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase()
                  );
                  const bpModCount = bp.artifacts
                    ? countBlueprintArtifacts(bp.artifacts, activeGameSchema)
                    : 0;
                  return (
                    <UniversalCard
                      key={bp.code}
                      layout="vertical"
                      isActive={inVault}
                      icon={
                        inVault
                          ? t("icon_cloud_done", "cloud_done")
                          : t("icon_cloud_download", "cloud_download")
                      }
                      customIcon={
                        <DynamicBlueprintPreviewBanner
                          data={bp}
                          countOverride={bpModCount}
                          heightClass="h-full"
                        />
                      }
                      title={bp.name}
                      subtitle={bp.code}
                      onClick={() => setSelectedUplinkBlueprint(bp)}
                      onContextMenu={(e) => {
                        const items: SanctuaryContextMenuItem[] = [
                          {
                            id: "inspect",
                            label: t("blueprint_inspector", "Blueprint Mods"),
                            icon: t("icon_extension", "extension"),
                            badge: bpModCount > 0 ? String(bpModCount) : undefined,
                            onClick: () => setSelectedUplinkBlueprint(bp),
                          },
                        ];
                        if (!inVault) {
                          items.unshift({
                            id: "sync",
                            label: t("action_sync", "Sync {Blueprint}"),
                            icon: t("icon_download", "download"),
                            variant: "success",
                            onClick: () => {
                              if (setSyncCode) setSyncCode(bp.code);
                              if (syncBlueprintByCode) {
                                setIsSyncing(true);
                                syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                              }
                            },
                          });
                        }
                        items.push({
                          id: "copy_code",
                          label: `${t("btn_copy", "Copy")} ${bp.code}`,
                          icon: t("icon_content_copy", "content_copy"),
                          dividerBefore: true,
                          onClick: () => {
                            navigator.clipboard.writeText(bp.code).catch(() => { });
                            setCopiedCode(bp.code);
                            setTimeout(() => setCopiedCode(null), 2000);
                          },
                        });
                        openSanctuaryContextMenu(e, {
                          title: bp.name,
                          subtitle: bp.code,
                          statusLabel: inVault
                            ? t("status_in_vault", "In {Vault}")
                            : t("status_not_in_vault", "Not In {Vault}"),
                          statusColorClass: inVault ? "text-[var(--success)]" : "text-[var(--accent)]",
                          icon: inVault
                            ? t("icon_cloud_done", "cloud_done")
                            : t("icon_cloud_download", "cloud_download"),
                          iconColorClass: inVault ? "text-[var(--success)]" : "text-[var(--accent)]",
                          items,
                        });
                      }}
                      imageOverlay={
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                          <div className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${inVault ? "text-[var(--success)]" : "text-[var(--accent)]"
                                }`}
                            >
                              {inVault
                                ? t("icon_verified_user", "verified_user")
                                : t("icon_cloud", "cloud")}
                            </span>
                            <span>
                              {inVault
                                ? t("status_in_vault", "In {Vault}")
                                : t("status_not_in_vault", "Not In {Vault}")}
                            </span>
                          </div>
                        </div>
                      }
                      actions={
                        !inVault ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (setSyncCode) setSyncCode(bp.code);
                              if (syncBlueprintByCode) {
                                setIsSyncing(true);
                                syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                              }
                            }}
                            className="w-8 h-8 rounded-xl glass-surface text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] flex items-center justify-center transition-all relative"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_download", "download")}
                            </span>
                            <HoverTooltip title={t("action_sync", "Sync {Blueprint}")} />
                          </button>
                        ) : undefined
                      }
                      badges={
                        <>
                          {bpModCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUplinkBlueprint(bp);
                              }}
                              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
                            >
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_extension", "extension")}
                              </span>
                              <span>
                                {bpModCount} {t("artifacts_linked", "{Mods} Linked")}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(bp.code).catch(() => { });
                              setCopiedCode(bp.code);
                              setTimeout(() => setCopiedCode(null), 2000);
                            }}
                            className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors cursor-pointer`}
                          >
                            <span
                              className={`material-symbols-outlined !text-[12px] ${copiedCode === bp.code
                                  ? "text-[var(--success)]"
                                  : "text-[var(--subtext)]"
                                }`}
                            >
                              {copiedCode === bp.code
                                ? t("icon_check", "check")
                                : t("icon_content_copy", "content_copy")}
                            </span>
                            <span
                              className={
                                copiedCode === bp.code
                                  ? "text-[var(--success)]"
                                  : "text-[var(--subtext)]"
                              }
                            >
                              {copiedCode === bp.code ? t("copied", "Copied") : bp.code}
                            </span>
                          </button>
                        </>
                      }
                      footer={
                        <div className="flex gap-2 items-center justify-between group">
                          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_event", "event")}
                            </span>
                            {new Date(bp.created_at).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!inVault) {
                                if (setSyncCode) setSyncCode(bp.code);
                                if (syncBlueprintByCode) {
                                  setIsSyncing(true);
                                  syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                                }
                              } else {
                                setSelectedUplinkBlueprint(bp);
                              }
                            }}
                            className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0"
                          >
                            {!inVault
                              ? t("action_sync", "Sync {Blueprint}")
                              : t("blueprint_inspector", "Blueprint Mods")}{" "}
                            <span className="text-base leading-none">&rarr;</span>
                          </button>
                        </div>
                      }
                    />
                  );
                })
            )}
          </div>
        </div>
      )}

      {isMatrixOpen && (
        <BlueprintMatrix
          isOpen={isMatrixOpen}
          onClose={() => setIsMatrixOpen(false)}
          playSet={matrixPlaySet}
          modList={modList}
          onUpdatePlaySet={(updatedSet: any) => {
            setMatrixPlaySet(updatedSet);
            const updatedSets = playSets.map((s: any) =>
              s.name === updatedSet.name ? updatedSet : s
            );
            setPlaySets(updatedSets);
          }}
          onUpload={async (
            isPublic: boolean,
            isLocked: boolean,
            allowedMods: any[],
            isMarketListed: boolean
          ) => {
            if (uploadBlueprintToCloud && matrixPlaySet) {
              return await uploadBlueprintToCloud(
                matrixPlaySet.name,
                isPublic,
                isLocked,
                allowedMods,
                isMarketListed
              );
            }
            return undefined;
          }}
        />
      )}

      {isArchitectOpen && (
        <BlueprintArchitect
          isOpen={isArchitectOpen}
          onClose={() => setIsArchitectOpen(false)}
          playSet={playSets[activePlaySetIndex]}
          modList={modList}
          toggleInActiveSet={toggleInActiveSet}
          allow_write={true}
          vaultPath={vaultPath}
          onRefreshMods={onRefreshMods}
          renamePlaySet={renamePlaySet}
        />
      )}

      {(() => {
        if (!selectedUplinkBlueprint) return null;
        const localVaultHashes = new Set<string>();
        (modList || []).forEach((m: any) => {
          if (m?.hash) localVaultHashes.add(m.hash);
          if (Array.isArray(m?.flavors)) {
            m.flavors.forEach((fl: any) => {
              if (fl?.hash) localVaultHashes.add(fl.hash);
            });
          }
        });

        const groupedUplinkFamilies = groupBlueprintArtifactsByFamily(
          selectedUplinkBlueprint?.artifacts || [],
          {
            modList,
            activeGameSchema,
            localVaultHashes,
          }
        );

        const filteredArtifacts = groupedUplinkFamilies.filter((f: any) => {
          if (!uplinkArtifactSearch.trim()) return true;
          const q = uplinkArtifactSearch.trim().toLowerCase();
          if (String(f._groupedTitle || f.name || "").toLowerCase().includes(q)) return true;
          if (String(f.author || "").toLowerCase().includes(q)) return true;
          if (Array.isArray(f._groupedMods)) {
            return f._groupedMods.some(
              (gm: any) =>
                String(gm._cleanModuleTitle || "").toLowerCase().includes(q) ||
                String(gm._cleanFilePart || gm.name || "").toLowerCase().includes(q) ||
                String(gm.author || "").toLowerCase().includes(q)
            );
          }
          return false;
        });

        return (
          <SidePanel
            isOpen={!!selectedUplinkBlueprint}
            onClose={() => {
              setSelectedUplinkBlueprint(null);
              setUplinkArtifactSearch("");
              setUplinkArtifactsLimit(100);
            }}
            title={selectedUplinkBlueprint?.name || t("blueprint_inspector", "Blueprint Mods")}
            subtitle={selectedUplinkBlueprint?.code || t("sidebar_uplink", "Uplink Code")}
            icon={t("icon_extension", "extension")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[760px]"
          >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
              <SidePanelHeroCard
                icon={t("icon_extension", "extension")}
                overline={selectedUplinkBlueprint?.code || t("sidebar_uplink", "Uplink Code")}
                title={
                  selectedUplinkBlueprint?.name || t("blueprint_inspector", "Blueprint Mods")
                }
                description={t("artifacts_linked", "{Mods} Linked")}
                badge={`${groupedUplinkFamilies.length} ${t("term_mods", "Items")}`}
                badgeIcon={t("icon_extension", "extension")}
                variant="accent"
              >
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <StatBox
                    label={t("artifacts_linked", "{Mods} Linked")}
                    value={groupedUplinkFamilies.length}
                    icon={t("icon_extension", "extension")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("sidebar_uplink", "Uplink Code")}
                    value={selectedUplinkBlueprint?.code || "—"}
                    icon={t("icon_qr_code_2", "qr_code_2")}
                    iconColorClass="text-[var(--success)]"
                  />
                </div>
              </SidePanelHeroCard>

              <ActionPill
                searchQuery={uplinkArtifactSearch}
                setSearchQuery={setUplinkArtifactSearch}
                searchPlaceholder={t("playsets_search_ph", "Search artifacts...")}
                className="shrink-0 w-full"
              />

              <UniversalGroup
                title={`${t("artifacts_linked", "{Mods} Linked")} (${filteredArtifacts.length})`}
                icon={t("icon_extension", "extension")}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                  {filteredArtifacts.slice(0, uplinkArtifactsLimit).map((m: any, idx: number) => (
                    <BlueprintInspectorModCard
                      key={`${m._groupKey || m.name || idx}-${idx}`}
                      mod={m}
                      activeGameSchema={activeGameSchema}
                      t={t}
                      showLoadOrderChip={true}
                    />
                  ))}

                  {filteredArtifacts.length > uplinkArtifactsLimit && (
                    <div className="col-span-full w-full flex justify-center mt-2">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_expand_more", "expand_more")}
                        label={`${t("load_more", "Load More")} (${filteredArtifacts.length - uplinkArtifactsLimit
                          })`}
                        onClick={() => setUplinkArtifactsLimit((prev) => prev + 100)}
                      />
                    </div>
                  )}
                </div>
              </UniversalGroup>
            </div>
          </SidePanel>
        );
      })()}
    </div>
  );
}
