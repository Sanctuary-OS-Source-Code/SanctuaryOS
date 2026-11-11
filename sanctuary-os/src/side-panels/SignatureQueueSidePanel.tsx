import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { supabase } from "../supabase";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { isDesktop } from "../utils/envUtils";
import {
  SidePanel,
  HoverTooltip,
  cleanSearchName,
  getExtensionRegex,
  getModFallbackUrl,
  getModFallbackAuthor,
  handleOpenUrl,
  ActionPill,
  ActionButton,
  DashboardStatTile,
  SidePanelHeroCard,
  UniversalGroup,
  getModIcon,
  VAULT_CHIP_CLASS,
  formatDisplayName,
} from "../shared";
import { formatCleanModTitle } from "./CommandIncompatiblePanel";
import { unpackBlueprintLoadOrder } from "../hooks/usePlaySetLogic";
import {
  deriveUserStagingToken,
  decryptStagingPayload,
  resolvePayloadDependencies,
  shredCloudStagingRow,
  markStagingRowDeployedLocally,
  unmarkStagingRowDeployedLocally,
  isStagingRowDeployedLocally,
  clearMobileBlueprintEdit,
  syncDesktopCompanionRadarSnapshot,
  ResolvedStagedArtifact,
  ResolvedStagedPayload,
} from "../utils/stagingCrypto";

export function SignatureQueueSidePanel({
  equipPlaySet,
  onOpenDossier,
}: {
  equipPlaySet?: (setNameOrIndex: any, overrideSet?: any) => Promise<void> | void;
  onOpenDossier?: (mod: any) => void;
}) {
  const { t, importLexicon } = useLexicon();
  const { importTheme } = useTheme();
  const session = useStore((state) => state.session);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const vaultPath = useStore((state) => state.vaultPath);
  const modList = useStore((state) => state.modList) || [];
  const playSets = useStore((state) => state.playSets) || [];
  const setPlaySets = useStore((state) => state.setPlaySets);
  const activeGameSchema = useStore((state) => state.activeGameSchema);

  const {
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    volatileSignatureQueues,
    setVolatileSignatureQueues,
    activeSignatureQueueIndex,
    setActiveSignatureQueueIndex,
    isSignatureQueueOpen,
    setIsSignatureQueueOpen,
    useInternalBrowser,
    setIsSideBrowserOpen,
    setNexusPreviewAsset,
  } = useModalStore(
    useShallow((s) => ({
      volatileSignatureQueue: s.volatileSignatureQueue,
      setVolatileSignatureQueue: s.setVolatileSignatureQueue,
      volatileSignatureQueues: s.volatileSignatureQueues,
      setVolatileSignatureQueues: s.setVolatileSignatureQueues,
      activeSignatureQueueIndex: s.activeSignatureQueueIndex,
      setActiveSignatureQueueIndex: s.setActiveSignatureQueueIndex,
      isSignatureQueueOpen: s.isSignatureQueueOpen,
      setIsSignatureQueueOpen: s.setIsSignatureQueueOpen,
      useInternalBrowser: s.useInternalBrowser,
      setIsSideBrowserOpen: s.setIsSideBrowserOpen,
      setNexusPreviewAsset: s.setNexusPreviewAsset,
    }))
  );

  const [filterTab, setFilterTab] = useState<"CHANGES" | "MISSING" | "ALL">("CHANGES");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(80);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditingBpTitle, setIsEditingBpTitle] = useState(false);
  const [keepInCloud, setKeepInCloud] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("sanctuary_keep_queue_in_cloud");
      return saved ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const shredAfterDeploy = !keepInCloud;
  const notifiedRowIdsRef = useRef<Set<string>>(new Set());

  const handleSetKeepInCloud = (val: boolean) => {
    setKeepInCloud(val);
    try {
      localStorage.setItem("sanctuary_keep_queue_in_cloud", val ? "true" : "false");
    } catch {}
  };

  // Cross-reference decrypted items against local Vault modList in volatile RAM
  const matchItemsAgainstLocalVault = useCallback(
    (rawItems: any[], prevResolved?: ResolvedStagedArtifact[]): ResolvedStagedArtifact[] => {
      const extRegex = getExtensionRegex(activeGameSchema);
      const byExact = new Map<string, any>();
      const byCleanLower = new Map<string, any>();
      const byHash = new Map<string, any>();
      const byBase = new Map<string, any>();

      modList.forEach((local: any) => {
        if (!local || !local.name) return;
        byExact.set(local.name, local);
        const cleanLocal = local.name.split(/[\\/]/).pop() || local.name;
        byCleanLower.set(cleanLocal.toLowerCase(), local);
        if (local.hash) byHash.set(local.hash, local);
        const mBase = cleanLocal.replace(extRegex, "").toLowerCase();
        if (mBase && !byBase.has(mBase)) byBase.set(mBase, local);
      });

      const prevSelectionMap = new Map<string, boolean>();
      if (Array.isArray(prevResolved)) {
        prevResolved.forEach((p) => {
          const key = p.hash || p.id || p.name;
          if (key) prevSelectionMap.set(key, p.selected);
        });
      }

      return rawItems.map((item: any, idx: number) => {
        const rawName = String(item.name || item.displayName || "");
        const cleanFile = rawName.split(/[\\/]/).pop() || rawName;
        let found = item.hash ? byHash.get(item.hash) : null;
        if (!found && rawName) {
          found = byExact.get(rawName) || byCleanLower.get(cleanFile.toLowerCase());
          if (!found) {
            const targetBase = cleanFile.replace(extRegex, "").toLowerCase();
            if (targetBase) found = byBase.get(targetBase);
          }
        }

        const key = item.hash || item.id || item.name || String(idx);
        const prevSelected = prevSelectionMap.has(key) ? prevSelectionMap.get(key)! : true;

        return {
          ...item,
          id: String(item.id || item.hash || item.name || idx),
          name: rawName || "Unknown Artifact",
          displayName: item.displayName || rawName || "Unknown Artifact",
          isOwned: !!found,
          localModName: found?.name,
          localHash: found?.hash || item.hash,
          selected: prevSelected,
        };
      });
    },
    [modList, activeGameSchema]
  );

  // Re-evaluate Owned vs Missing status in RAM whenever local modList updates
  useEffect(() => {
    const current = useModalStore.getState().volatileSignatureQueue as ResolvedStagedPayload | null;
    if (!current || !current.payload?.items) return;
    const updatedResolved = matchItemsAgainstLocalVault(current.payload.items, current.resolvedItems);
    const hasDiff = updatedResolved.some(
      (r, idx) => r.isOwned !== current.resolvedItems[idx]?.isOwned || r.localModName !== current.resolvedItems[idx]?.localModName
    );
    if (hasDiff) {
      setVolatileSignatureQueue({
        ...current,
        resolvedItems: updatedResolved,
      });
    }
  }, [modList, matchItemsAgainstLocalVault, setVolatileSignatureQueue]);

  // Poll Spoke citizen_staging_queue table and resolve in volatile memory (0 bytes written to disk)
  const pollCloudStagingQueue = useCallback(async () => {
    if (!activeWorkspaceId || activeWorkspaceId === "default_workspace") {
      return;
    }

    try {
      let activeUser = session?.user;
      if (!activeUser?.id) {
        const { data: sData } = await supabase.auth.getSession();
        activeUser = sData?.session?.user;
      }
      if (!activeUser?.id) return;

      const userToken = await deriveUserStagingToken(activeUser.id, activeUser.email);
      const { data, error } = await supabase
        .from("citizen_staging_queue")
        .select("*")
        .eq("user_token", userToken)
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) return;

      if (!data || data.length === 0) {
        if (useModalStore.getState().volatileSignatureQueues.length > 0) {
          setVolatileSignatureQueues([]);
        }
        return;
      }

      const existingQueues = useModalStore.getState().volatileSignatureQueues as ResolvedStagedPayload[];
      const existingByRowId = new Map<string, ResolvedStagedPayload>();
      existingQueues.forEach((q) => {
        if (q?.rowId) existingByRowId.set(q.rowId, q);
      });

      const validDecryptedRows: { row: any; decrypted: any; isCompletedLocally: boolean }[] = [];
      for (const candidateRow of data) {
        const completedLocally = isStagingRowDeployedLocally(candidateRow.id);
        const candidateDecrypted = await decryptStagingPayload(
          candidateRow.encrypted_payload,
          candidateRow.iv,
          candidateRow.salt,
          activeUser.id,
          activeUser.email
        );
        if (!candidateDecrypted) continue;

        const rawItems = Array.isArray(candidateDecrypted.items) ? candidateDecrypted.items : [];
        const rawRemoved = Array.isArray(candidateDecrypted.removedItems)
          ? candidateDecrypted.removedItems
          : [];

        // Auto-shred accidental legacy full-Vault dump (> 500 items targeting an existing Desktop Blueprint)
        if (
          rawItems.length > 500 &&
          candidateDecrypted.targetDesktopBlueprint &&
          !candidateDecrypted.isFullRigBlueprint
        ) {
          shredCloudStagingRow(candidateRow.id, session).catch(() => {});
          continue;
        }

        if (rawItems.length > 0 || rawRemoved.length > 0) {
          validDecryptedRows.push({
            row: candidateRow,
            decrypted: candidateDecrypted,
            isCompletedLocally: completedLocally,
          });
        }
      }

      if (validDecryptedRows.length === 0) {
        if (useModalStore.getState().volatileSignatureQueues.length > 0) {
          setVolatileSignatureQueues([]);
        }
        return;
      }

      const sameRowIds =
        validDecryptedRows.length === existingQueues.length &&
        validDecryptedRows.every(
          (v, idx) =>
            existingQueues[idx]?.rowId === v.row.id &&
            Boolean(existingQueues[idx]?.isCompletedLocally) === v.isCompletedLocally
        );
      if (sameRowIds) {
        return;
      }

      const nextQueues: ResolvedStagedPayload[] = [];
      for (const { row, decrypted, isCompletedLocally } of validDecryptedRows) {
        const cached = existingByRowId.get(row.id);
        if (cached) {
          nextQueues.push({ ...cached, isCompletedLocally });
          continue;
        }

        // Resolve child dependencies in volatile memory (skip for full Rig-to-Rig Blueprints which already carry exact compiled load order)
        const { mergedItems } = decrypted.isFullRigBlueprint
          ? { mergedItems: decrypted.items || [] }
          : await resolvePayloadDependencies(decrypted.items || []);

        // Enrich missing metadata (url, author, paid, early_access) from Spoke DB in RAM
        const enrichedItems = [...mergedItems];
        const hashesToFetch = Array.from(
          new Set(
            enrichedItems
              .filter((m) => m.hash && (!m.url || typeof m.is_paid === "undefined"))
              .map((m) => m.hash as string)
          )
        );

        if (hashesToFetch.length > 0) {
          const chunkSize = 150;
          for (let i = 0; i < hashesToFetch.length; i += chunkSize) {
            const chunk = hashesToFetch.slice(i, i + chunkSize);
            const { data: vData } = await supabase
              .from("mod_versions")
              .select("dna_hash, mods(id, is_paid, is_early_access, url, master_author)")
              .in("dna_hash", chunk);

            if (Array.isArray(vData)) {
              vData.forEach((dbRow: any) => {
                const modRef = Array.isArray(dbRow.mods) ? dbRow.mods[0] : dbRow.mods;
                if (!modRef) return;
                enrichedItems.forEach((item, idx) => {
                  if (item.hash === dbRow.dna_hash) {
                    enrichedItems[idx] = {
                      ...item,
                      is_paid: item.is_paid ?? modRef.is_paid,
                      is_early_access: item.is_early_access ?? modRef.is_early_access,
                      url: item.url || modRef.url || "",
                      author: item.author || modRef.master_author || "",
                    };
                  }
                });
              });
            }
          }
        }

        const resolvedItems = matchItemsAgainstLocalVault(enrichedItems);
        nextQueues.push({
          rowId: row.id,
          createdAt: row.created_at || decrypted.stagedAt || new Date().toISOString(),
          isCompletedLocally,
          payload: {
            ...decrypted,
            items: enrichedItems,
            removedItems: Array.isArray(decrypted.removedItems) ? decrypted.removedItems : [],
          },
          resolvedItems,
        });

        if (isDesktop() && !isCompletedLocally && !notifiedRowIdsRef.current.has(row.id)) {
          notifiedRowIdsRef.current.add(row.id);
          useStore
            .getState()
            .pushStatus(
              t(
                "status_sig_queue_detected",
                "Remote staged payload detected in volatile memory! Open Signature Queue to review."
              ),
              "info"
            );
        }
      }

      setVolatileSignatureQueues(nextQueues);
    } catch (err) {
      console.warn("Signature queue poll error:", err);
    }
  }, [
    session,
    activeWorkspaceId,
    workspaces?.length,
    matchItemsAgainstLocalVault,
    setVolatileSignatureQueues,
    t,
  ]);

  useEffect(() => {
    pollCloudStagingQueue();
    const interval = setInterval(pollCloudStagingQueue, 10000);
    const handleImmediatePoll = () => {
      pollCloudStagingQueue();
    };
    window.addEventListener("sanctuary-poll-staging-queue", handleImmediatePoll);
    return () => {
      clearInterval(interval);
      window.removeEventListener("sanctuary-poll-staging-queue", handleImmediatePoll);
    };
  }, [pollCloudStagingQueue]);

  const queue = volatileSignatureQueue as ResolvedStagedPayload | null;
  const resolvedItems: ResolvedStagedArtifact[] = queue?.resolvedItems || [];

  const selectedItems = useMemo(() => resolvedItems.filter((i) => i.selected), [resolvedItems]);
  const stagedAssetItems = useMemo(
    () =>
      selectedItems.filter(
        (i) =>
          i.asset_type === "lexicon" ||
          i.asset_type === "chameleon" ||
          i.asset_type === "workbench_template"
      ),
    [selectedItems]
  );
  const missingSelected = useMemo(
    () => selectedItems.filter((i) => !i.isOwned && !i.asset_type),
    [selectedItems]
  );
  const depsCount = useMemo(() => resolvedItems.filter((i) => i.isDependency).length, [resolvedItems]);

  const filteredItems = useMemo(() => {
    return resolvedItems.filter((item) => {
      if (filterTab === "MISSING" && (item.isOwned || !!item.asset_type)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (item.displayName || item.name || "").toLowerCase().includes(q);
        const authorMatch = (item.author || "").toLowerCase().includes(q);
        if (!nameMatch && !authorMatch) return false;
      }
      return true;
    });
  }, [resolvedItems, filterTab, searchQuery]);

  // Only missing Paid / Early Access mods trigger the big Premium header; Paid mods already in Vault stay in Ready in Vault
  const premiumItems = useMemo(
    () =>
      filteredItems.filter(
        (m) => (m.is_paid || m.is_early_access) && !m.isOwned && !m.asset_type
      ),
    [filteredItems]
  );
  const standardItems = useMemo(
    () =>
      filteredItems.filter(
        (m) => (!m.is_paid && !m.is_early_access) || m.isOwned || !!m.asset_type
      ),
    [filteredItems]
  );
  const missingStandardItems = useMemo(
    () => standardItems.filter((m) => !m.isOwned && !m.asset_type),
    [standardItems]
  );
  const ownedStandardItems = useMemo(
    () =>
      filterTab === "MISSING"
        ? []
        : standardItems.filter((m) => m.isOwned || !!m.asset_type),
    [standardItems, filterTab]
  );

  // Resolve existing mods in the target Desktop Blueprint for the "All" tab
  const existingBpMods = useMemo(() => {
    if (!queue?.payload) return [];
    const bpCandidate = String(
      queue.payload.targetDesktopBlueprint || queue.payload.blueprintName || ""
    )
      .trim()
      .toLowerCase();
    if (!bpCandidate) return [];
    const matchedSet = playSets.find(
      (s: any) => String(s?.name || "").trim().toLowerCase() === bpCandidate
    );
    if (!matchedSet || !Array.isArray(matchedSet.mods)) return [];

    const extRegex = getExtensionRegex(activeGameSchema);
    const excludeNames = new Set<string>();
    const excludeHashes = new Set<string>();

    resolvedItems.forEach((ri) => {
      const n = String(ri.localModName || ri.name || "").split(/[\\/]/).pop()?.toLowerCase() || "";
      if (n) {
        excludeNames.add(n);
        excludeNames.add(n.replace(extRegex, ""));
      }
      if (ri.hash) excludeHashes.add(String(ri.hash).toLowerCase());
      if (ri.localHash) excludeHashes.add(String(ri.localHash).toLowerCase());
    });
    (queue.payload.removedItems || []).forEach((rem) => {
      const n = String(rem.name || rem.displayName || "").split(/[\\/]/).pop()?.toLowerCase() || "";
      if (n) {
        excludeNames.add(n);
        excludeNames.add(n.replace(extRegex, ""));
      }
      if (rem.hash) excludeHashes.add(String(rem.hash).toLowerCase());
    });

    const byClean = new Map<string, any>();
    const byBase = new Map<string, any>();
    modList.forEach((m: any) => {
      if (!m?.name) return;
      const cl = (m.name.split(/[\\/]/).pop() || m.name).toLowerCase();
      byClean.set(cl, m);
      const bs = cl.replace(extRegex, "");
      if (bs && !byBase.has(bs)) byBase.set(bs, m);
    });

    const out: any[] = [];
    const seen = new Set<string>();
    matchedSet.mods.forEach((rawM: any) => {
      const mStr = typeof rawM === "string" ? rawM : String(rawM?.name || "");
      if (!mStr) return;
      const cl = mStr
        .replace(/^[1-4]_[A-Za-z]+_/i, "")
        .split(/[\\/]/)
        .pop()
        ?.toLowerCase() || "";
      if (!cl || seen.has(cl)) return;
      const bs = cl.replace(extRegex, "");
      if (excludeNames.has(cl) || (bs && excludeNames.has(bs))) return;
      const found = byClean.get(cl) || (bs ? byBase.get(bs) : null);
      if (found?.hash && excludeHashes.has(String(found.hash).toLowerCase())) return;
      seen.add(cl);
      out.push(
        found || {
          name: mStr,
          displayName: mStr.split(/[\\/]/).pop() || mStr,
        }
      );
    });
    return out;
  }, [queue, playSets, modList, resolvedItems, activeGameSchema]);

  const filteredExistingBpMods = useMemo(() => {
    if (filterTab !== "ALL") return [];
    if (!searchQuery.trim()) return existingBpMods;
    const q = searchQuery.toLowerCase();
    return existingBpMods.filter(
      (m: any) =>
        String(m.displayName || m.name || "").toLowerCase().includes(q) ||
        String(m.author || "").toLowerCase().includes(q)
    );
  }, [existingBpMods, filterTab, searchQuery]);

  const totalChangesCount =
    resolvedItems.length + (queue?.payload?.removedItems?.length || 0);
  const totalMissingCount = resolvedItems.filter(
    (i) => !i.isOwned && !i.asset_type
  ).length;
  const totalAllCount =
    resolvedItems.length +
    (queue?.payload?.removedItems?.length || 0) +
    existingBpMods.length;

  const openCreatorUrlsInBrowser = useCallback(
    (itemsToAcquire: ResolvedStagedArtifact[]) => {
      const guidedItems: {
        id: string;
        name: string;
        author?: string;
        url: string;
        hash?: string;
        version?: string;
        status: "pending" | "completed" | "skipped";
      }[] = [];

      itemsToAcquire
        .filter((m) => !m.asset_type)
        .forEach((mod, idx) => {
          const rawName = formatDisplayName(mod.displayName || mod.name || "");
          const cleanName = formatCleanModTitle(rawName) || rawName || "Unknown Artifact";
          const targetUrl = getModFallbackUrl(
            mod.displayName || mod.name,
            mod.hash,
            activeGameSchema,
            { url: mod.url, author: mod.author }
          );
          if (targetUrl) {
            guidedItems.push({
              id: String(mod.id || mod.hash || idx),
              name: cleanName,
              author: mod.author ? formatCleanModTitle(mod.author) : undefined,
              url: targetUrl,
              hash: mod.hash || undefined,
              version: mod.version ? String(mod.version).replace(/^v\.?/i, "").trim() : undefined,
              status: "pending",
            });
          }
        });

      if (guidedItems.length === 0) return;

      if (useInternalBrowser && isDesktop()) {
        useModalStore.getState().startGuidedBrowserQueue(guidedItems);
        setIsSideBrowserOpen(true);
      } else {
        const seen = new Set<string>();
        guidedItems.forEach((g) => {
          if (!seen.has(g.url) && seen.size < 5) {
            seen.add(g.url);
            handleOpenUrl(g.url);
          }
        });
      }
    },
    [activeGameSchema, useInternalBrowser, setIsSideBrowserOpen]
  );

  const installStagedNexusAssets = async (assetsToInstall: ResolvedStagedArtifact[]) => {
    if (assetsToInstall.length === 0) return 0;
    let installedCount = 0;
    try {
      const assetIds = assetsToInstall
        .map((a) => a.asset_id || String(a.id || "").replace(/^asset_[a-z_]+_/i, ""))
        .filter(Boolean);
      if (assetIds.length === 0) return 0;

      const { data: rows } = await supabase
        .from("nexus_assets")
        .select("id, name, version, language, asset_type, json_data")
        .in("id", assetIds);

      if (!Array.isArray(rows)) return 0;

      for (const row of rows) {
        try {
          const parsedData =
            typeof row.json_data === "string" ? JSON.parse(row.json_data) : row.json_data;
          if (!parsedData) continue;

          if (row.asset_type === "lexicon") {
            importLexicon(
              {
                ...parsedData,
                _meta_language: row.language || "Custom",
                _meta_version: row.version || "1.0.0",
              },
              row.name
            );
            installedCount++;
          } else if (row.asset_type === "chameleon") {
            importTheme({ ...parsedData, version: row.version || "1.0.0" });
            installedCount++;
          } else if (row.asset_type === "workbench_template" && vaultPath) {
            const displayData = Array.isArray(parsedData) ? parsedData[0] : parsedData;
            const templateId = displayData?.template_id || "vlocal";
            const templatesDir = `${vaultPath}\\Templates`;
            if (!(await exists(templatesDir))) {
              await mkdir(templatesDir, { recursive: true });
            }
            await writeTextFile(
              `${templatesDir}\\${templateId}_template.json`,
              JSON.stringify(parsedData, null, 2)
            );
            installedCount++;
          }
          try {
            await supabase.rpc("increment_asset_downloads", { asset_id: row.id });
          } catch {
            // Non-fatal metric error
          }
        } catch (e) {
          console.warn("Failed to install staged Nexus asset:", row?.name, e);
        }
      }
    } catch (e) {
      console.warn("Error fetching staged Nexus assets:", e);
    }
    return installedCount;
  };

  const handleToggleCompleteLocally = () => {
    if (!queue?.rowId) return;
    const currentlyCompleted = Boolean(queue.isCompletedLocally);
    if (currentlyCompleted) {
      unmarkStagingRowDeployedLocally(queue.rowId);
      const updated = (volatileSignatureQueues || []).map((q: any) =>
        q?.rowId === queue.rowId ? { ...q, isCompletedLocally: false } : q
      );
      setVolatileSignatureQueues(updated);
      setVolatileSignatureQueue({ ...queue, isCompletedLocally: false });
    } else {
      markStagingRowDeployedLocally(queue.rowId);
      const targetBp =
        queue.payload?.targetDesktopBlueprint || queue.payload?.blueprintName;
      if (targetBp) {
        clearMobileBlueprintEdit(targetBp);
      }
      const updated = (volatileSignatureQueues || []).map((q: any) =>
        q?.rowId === queue.rowId ? { ...q, isCompletedLocally: true } : q
      );
      setVolatileSignatureQueues(updated);
      const nextPendingIdx = updated.findIndex((q: any) => !q?.isCompletedLocally);
      if (nextPendingIdx !== -1) {
        setActiveSignatureQueueIndex(nextPendingIdx);
        setVolatileSignatureQueue(updated[nextPendingIdx]);
      } else {
        setVolatileSignatureQueue({ ...queue, isCompletedLocally: true });
        setIsSignatureQueueOpen(false);
      }
      useStore
        .getState()
        .pushStatus(
          t(
            "status_sig_queue_marked_complete_local",
            "Marked complete on this system! Payload remains pending in the cloud for your other systems."
          ),
          "success"
        );
    }
  };

  const handleRejectAndShred = async () => {
    if (!queue) return;
    setIsProcessing(true);
    const targetBp =
      queue.payload?.targetDesktopBlueprint || queue.payload?.blueprintName;
    if (targetBp) {
      clearMobileBlueprintEdit(targetBp);
    }
    const targetRowId = queue.rowId;
    await shredCloudStagingRow(targetRowId, session);
    const remaining = (volatileSignatureQueues || []).filter((q: any) => q?.rowId !== targetRowId);
    setVolatileSignatureQueues(remaining);
    if (remaining.length === 0) {
      setIsSignatureQueueOpen(false);
    }
    setIsProcessing(false);
    useStore
      .getState()
      .pushStatus(t("status_staging_shredded", "Cloud staging payload permanently shredded."), "info");
  };

  const handleSignAndExecute = async (deployImmediately: boolean = true) => {
    if (!queue) return;
    setIsProcessing(true);
    try {
      const isBp = queue.payload.mode === "blueprint";
      const removedItemsList = Array.isArray(queue.payload.removedItems)
        ? queue.payload.removedItems
        : [];

      // 1. Mark deployed locally on this machine, and shred the cloud record unless "Leave in Cloud" is enabled
      markStagingRowDeployedLocally(queue.rowId);
      if (!keepInCloud) {
        await shredCloudStagingRow(queue.rowId, session);
      }

      // 2. Directly install any staged Nexus Assets (Lexicons, Chameleons, Templates)
      const installedAssetCount = await installStagedNexusAssets(stagedAssetItems);

      const nonAssetSelected = selectedItems.filter((i) => !i.asset_type);

      if (isBp && (nonAssetSelected.length > 0 || removedItemsList.length > 0)) {
        const rawTargetBpName = (
          queue.payload.targetDesktopBlueprint ||
          queue.payload.blueprintName ||
          ""
        ).trim();
        const cleanBpKey = (n: string) =>
          String(n || "")
            .toLowerCase()
            .replace(/\s*\(imported\)\s*$/i, "")
            .trim();
        const isGenericDefaultName = (n: string) => {
          const lower = String(n || "").toLowerCase().trim();
          return (
            !lower ||
            lower === "curated blueprint" ||
            lower === "curated play set" ||
            lower === "curated artifact" ||
            lower === "staged blueprint"
          );
        };

        let existingTargetIdx = -1;
        if (rawTargetBpName) {
          existingTargetIdx = playSets.findIndex(
            (s: any) =>
              String(s?.name || "").toLowerCase() === rawTargetBpName.toLowerCase() ||
              (cleanBpKey(s?.name) && cleanBpKey(s?.name) === cleanBpKey(rawTargetBpName))
          );
        }
        if (existingTargetIdx === -1 && queue.payload.blueprintCode) {
          existingTargetIdx = playSets.findIndex(
            (s: any) =>
              s?.code &&
              String(s.code).toLowerCase() === String(queue.payload.blueprintCode).toLowerCase()
          );
        }
        if (
          existingTargetIdx === -1 &&
          playSets.length > 0 &&
          (removedItemsList.length > 0 || isGenericDefaultName(rawTargetBpName))
        ) {
          const storeState = useStore.getState();
          const activeName = String(storeState.activeSetName || "").toLowerCase();
          if (activeName) {
            existingTargetIdx = playSets.findIndex(
              (s: any) => String(s?.name || "").toLowerCase() === activeName
            );
          }
          if (existingTargetIdx === -1) {
            const activeIdx = storeState.activePlaySetIndex ?? 0;
            existingTargetIdx = playSets[activeIdx] ? activeIdx : 0;
          }
        }

        let baseName = (
          queue.payload.targetDesktopBlueprint ||
          queue.payload.blueprintName ||
          "Staged Blueprint"
        ).trim();
        let finalName = baseName;
        if (existingTargetIdx === -1) {
          let copyIndex = 1;
          while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase())) {
            finalName = `${baseName} (${copyIndex})`;
            copyIndex++;
          }
        } else {
          finalName = playSets[existingTargetIdx].name;
        }

        const nameRemap = new Map<string, string>();
        const rawAvailableMods: string[] = [];
        const nextModHashes: Record<string, string> = {};
        const nextModMeta: Record<string, any> = {};
        let localOverrides: Record<string, any> = {};
        let localOverridesDirty = false;
        try {
          localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
        } catch {}

        nonAssetSelected.forEach((item) => {
          const cleanArtifactFile = (item.name || "").split(/[\\/]/).pop() || item.name;
          const targetHash = item.localHash || item.hash;
          if (
            targetHash &&
            (item.isLocalOverride || item.manifest_url || item.description || item.url)
          ) {
            const existingOvr = localOverrides[targetHash];
            if (!existingOvr?.is_user_dossier) {
              localOverrides[targetHash] = {
                ...(existingOvr || {}),
                displayName: existingOvr?.displayName || item.displayName,
                author: existingOvr?.author || item.author,
                version: existingOvr?.version || item.version,
                url: existingOvr?.url || item.url,
                manifest_url: existingOvr?.manifest_url || item.manifest_url,
                description: existingOvr?.description || item.description,
                category_override: existingOvr?.category_override || item.category_override,
                compliance_tier: existingOvr?.compliance_tier ?? item.compliance_tier,
              };
              localOverridesDirty = true;
            }
          }

          if (item.isOwned && item.localModName) {
            const resolvedClean = item.localModName.split(/[\\/]/).pop() || item.localModName;
            if (cleanArtifactFile) {
              nameRemap.set(cleanArtifactFile.toLowerCase(), resolvedClean);
            }
            rawAvailableMods.push(item.localModName);
            if (item.localHash) nextModHashes[item.localModName] = item.localHash;
            if (item.url || item.author || item.manifest_url) {
              nextModMeta[item.localModName] = {
                url: item.url,
                author: item.author,
                manifest_url: item.manifest_url,
                displayName: item.displayName,
                compliance_tier: item.compliance_tier,
              };
            }
          } else {
            if (queue.payload.isFullRigBlueprint && item.name) {
              rawAvailableMods.push(item.name);
            }
            if (item.hash) nextModHashes[item.name] = item.hash;
            if (item.url || item.author || item.manifest_url) {
              nextModMeta[item.name] = {
                url: item.url,
                author: item.author,
                manifest_url: item.manifest_url,
                displayName: item.displayName,
                compliance_tier: item.compliance_tier,
              };
            }
          }
        });

        if (localOverridesDirty) {
          try {
            localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOverrides));
          } catch {}
        }

        const { loadRules, modTiers, loadOrder, ignoredConflicts, formatModWithTier } = unpackBlueprintLoadOrder(
          {
            mods: nonAssetSelected,
            load_rules: queue.payload.loadRules,
            mod_tiers: queue.payload.modTiers,
            load_order: queue.payload.loadOrder,
            ignored_conflicts: queue.payload.ignoredConflicts,
          },
          nameRemap,
          activeGameSchema
        );

        if (ignoredConflicts.length > 0) {
          const prevIgnored = useStore.getState().ignoredGlobal || [];
          const mergedIgnored = Array.from(new Set([...prevIgnored, ...ignoredConflicts]));
          useStore.getState().setIgnoredGlobal(mergedIgnored);
          try {
            localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(mergedIgnored));
          } catch {}
        }

        const availableMods = rawAvailableMods.map((mName) => formatModWithTier(mName));
        const existingSetMods =
          existingTargetIdx !== -1 && Array.isArray(playSets[existingTargetIdx]?.mods)
            ? playSets[existingTargetIdx].mods
            : [];

        const extRegex = getExtensionRegex(activeGameSchema);
        const normalizeModKey = (s: string) =>
          String(s || "")
            .replace(/^[1-4]_[A-Za-z]+_/i, "")
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase() || "";

        const removedNamesLower = new Set<string>();
        const removedNormKeys = new Set<string>();
        const removedHashesLower = new Set<string>();
        const removedDbIdsLower = new Set<string>();

        const addRemovedModCandidate = (rawStr?: string, hashStr?: string, dbIdStr?: string) => {
          const s = String(rawStr || "").trim();
          if (s) {
            const cleanS =
              s
                .replace(/^[1-4]_[A-Za-z]+_/i, "")
                .split(/[\\/]/)
                .pop()
                ?.toLowerCase() || s.toLowerCase();
            removedNamesLower.add(cleanS);
            removedNamesLower.add(cleanS.replace(extRegex, ""));
            const norm = normalizeModKey(s);
            if (norm) removedNormKeys.add(norm);
          }
          if (hashStr) removedHashesLower.add(String(hashStr).toLowerCase());
          if (dbIdStr) removedDbIdsLower.add(String(dbIdStr).toLowerCase());
        };

        removedItemsList.forEach((rem) => {
          addRemovedModCandidate(rem.name, rem.hash, rem.dbId || rem.id);
          if (rem.displayName) addRemovedModCandidate(rem.displayName);
        });

        // Expand removed candidates against local modList so displayName / dbId / hash from Mobile Radar resolves to raw filenames
        if (removedItemsList.length > 0 && Array.isArray(modList)) {
          modList.forEach((localMod: any) => {
            const mId = String(localMod?.db_id || localMod?.id || "").toLowerCase();
            const mHash = String(localMod?.hash || "").toLowerCase();
            const mName = String(localMod?.name || "");
            const mDisp = String(
              localMod?.master_name || localMod?.display_name || localMod?.displayName || ""
            );
            const mCleanDisp = cleanSearchName(mDisp || mName, activeGameSchema);
            const matched =
              (mId && removedDbIdsLower.has(mId)) ||
              (mHash && removedHashesLower.has(mHash)) ||
              (mName && removedNamesLower.has(mName.toLowerCase())) ||
              (mDisp && removedNamesLower.has(mDisp.toLowerCase())) ||
              (mCleanDisp && removedNamesLower.has(mCleanDisp.toLowerCase())) ||
              (mName && removedNormKeys.has(normalizeModKey(mName))) ||
              (mDisp && removedNormKeys.has(normalizeModKey(mDisp)));
            if (matched) {
              addRemovedModCandidate(localMod.name, localMod.hash, mId);
              if (Array.isArray(localMod.flavors)) {
                localMod.flavors.forEach((fl: any) =>
                  addRemovedModCandidate(fl?.name || fl, fl?.hash)
                );
              }
            }
          });
        }

        const existingHashesMap =
          existingTargetIdx !== -1 ? playSets[existingTargetIdx]?.modHashes || {} : {};
        const filteredExistingMods =
          removedItemsList.length > 0
            ? existingSetMods.filter((mEntry: any) => {
                const rawM = typeof mEntry === "string" ? mEntry : String(mEntry?.name || "");
                const cleanM =
                  rawM
                    .replace(/^[1-4]_[A-Za-z]+_/i, "")
                    .split(/[\\/]/)
                    .pop()
                    ?.toLowerCase() || "";
                const baseM = cleanM.replace(extRegex, "");
                const normM = normalizeModKey(rawM);
                const mHash = String(existingHashesMap[rawM] || "").toLowerCase();
                if (cleanM && removedNamesLower.has(cleanM)) return false;
                if (baseM && removedNamesLower.has(baseM)) return false;
                if (normM && removedNormKeys.has(normM)) return false;
                if (mHash && removedHashesLower.has(mHash)) return false;
                return true;
              })
            : existingSetMods;

        const mergedTargetMods =
          existingTargetIdx !== -1 && !queue.payload.isFullRigBlueprint
            ? Array.from(new Set([...filteredExistingMods, ...availableMods]))
            : availableMods;
        const readySet = {
          ...(existingTargetIdx !== -1 ? playSets[existingTargetIdx] : {}),
          name: finalName,
          mods: mergedTargetMods,
          code: queue.payload.blueprintCode || playSets[existingTargetIdx]?.code || undefined,
          modHashes: {
            ...(existingTargetIdx !== -1 ? playSets[existingTargetIdx]?.modHashes || {} : {}),
            ...nextModHashes,
          },
          modMeta: {
            ...(existingTargetIdx !== -1 ? playSets[existingTargetIdx]?.modMeta || {} : {}),
            ...nextModMeta,
          },
          loadRules,
          modTiers,
          loadOrder,
          ignoredConflicts:
            existingTargetIdx !== -1
              ? Array.from(
                  new Set([
                    ...(playSets[existingTargetIdx]?.ignoredConflicts || []),
                    ...ignoredConflicts,
                  ])
                )
              : ignoredConflicts,
          ignoredGhosts: playSets[existingTargetIdx]?.ignoredGhosts || [],
        };

        let updatedSets: any[];
        if (existingTargetIdx !== -1) {
          updatedSets = playSets.map((s: any, idx: number) =>
            idx === existingTargetIdx ? readySet : s
          );
        } else {
          updatedSets = [...playSets, readySet];
        }
        setPlaySets(updatedSets);
        clearMobileBlueprintEdit(finalName);

        if (
          deployImmediately &&
          equipPlaySet &&
          (availableMods.length > 0 || removedItemsList.length > 0) &&
          isDesktop()
        ) {
          await equipPlaySet(finalName, readySet);
        }

        if (session?.user?.id && isDesktop()) {
          syncDesktopCompanionRadarSnapshot(
            modList,
            session,
            useStore.getState().activeSetName || finalName,
            useStore.getState().selectedVersion || "all",
            { playSets: updatedSets }
          ).catch(() => {});
        }

        if (missingSelected.length > 0) {
          openCreatorUrlsInBrowser(missingSelected);
        }

        useStore
          .getState()
          .pushStatus(
            keepInCloud
              ? t(
                  "status_sig_queue_deployed_kept",
                  "{Citizen} Signature verified: {Blueprint} deployed (payload kept in cloud for other devices)!"
                )
              : t(
                  "status_sig_queue_deployed",
                  "{Citizen} Signature verified: {Blueprint} deployed & cloud staging record shredded!"
                ),
            "success"
          );
      } else {
        // Mod Download Queue Mode (or Assets-only queue)
        const targets = missingSelected.length > 0 ? missingSelected : nonAssetSelected;
        if (targets.length > 0) {
          openCreatorUrlsInBrowser(targets);
        }
        useStore
          .getState()
          .pushStatus(
            installedAssetCount > 0 && targets.length === 0
              ? t(
                  "sig_queue_assets_installed_toast",
                  "Installed staged Nexus Assets into Sanctuary OS!"
                )
              : keepInCloud
                ? t(
                     "status_sig_queue_browser_kept",
                     "{Citizen} Signature verified: Launching creator download pages (payload kept in cloud)!"
                  )
                : t(
                    "status_sig_queue_browser_launched",
                    "{Citizen} Signature verified: Launching creator download pages & shredding cloud record!"
                  ),
            "success"
          );
      }

      if (keepInCloud) {
        const updated = (volatileSignatureQueues || []).map((q: any) =>
          q?.rowId === queue.rowId ? { ...q, isCompletedLocally: true } : q
        );
        setVolatileSignatureQueues(updated);
        const nextPendingIdx = updated.findIndex((q: any) => !q?.isCompletedLocally);
        if (nextPendingIdx !== -1) {
          setActiveSignatureQueueIndex(nextPendingIdx);
          setVolatileSignatureQueue(updated[nextPendingIdx]);
        } else {
          setVolatileSignatureQueue({ ...queue, isCompletedLocally: true });
          setIsSignatureQueueOpen(false);
        }
      } else {
        const remaining = (volatileSignatureQueues || []).filter(
          (q: any) => q?.rowId !== queue.rowId
        );
        setVolatileSignatureQueues(remaining);
        if (remaining.length === 0) {
          setIsSignatureQueueOpen(false);
        }
      }
    } catch (err: any) {
      console.error("Signature Queue execution error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isSignatureQueueOpen || !queue) return null;

  const isBpMode = queue.payload.mode === "blueprint";

  const toggleItemSelection = (id: string) => {
    setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) => {
      if (!prev) return null;
      return {
        ...prev,
        resolvedItems: prev.resolvedItems.map((item) =>
          item.id === id ? { ...item, selected: !item.selected } : item
        ),
      };
    });
  };

  const removeItemFromQueue = (id: string) => {
    setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) => {
      if (!prev) return null;
      const nextItems = prev.resolvedItems.filter((item) => item.id !== id);
      return {
        ...prev,
        resolvedItems: nextItems,
      };
    });
  };

  const skipAllPremium = () => {
    setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) => {
      if (!prev) return null;
      return {
        ...prev,
        resolvedItems: prev.resolvedItems.map((item) =>
          item.is_paid || item.is_early_access ? { ...item, selected: false } : item
        ),
      };
    });
  };

  const renderArtifactRow = (mod: ResolvedStagedArtifact, idx: number) => {
    const blueprintMeta = { url: mod.url, author: mod.author };
    const targetUrl = getModFallbackUrl(mod.displayName || mod.name, mod.hash, activeGameSchema, blueprintMeta);
    const customAuthor = getModFallbackAuthor(mod.hash, blueprintMeta, mod.displayName || mod.name, activeGameSchema);
    const isNexusAsset =
      mod.asset_type === "lexicon" ||
      mod.asset_type === "chameleon" ||
      mod.asset_type === "workbench_template";

    const handleCardClick = () => {
      if (isNexusAsset && mod.asset_id && mod.asset_type) {
        setNexusPreviewAsset({
          id: String(mod.asset_id),
          type: mod.asset_type,
        });
        return;
      }

      const localMatch = modList.find(
        (m: any) =>
          (mod.localModName && m.name === mod.localModName) ||
          (mod.localHash && m.hash && m.hash === mod.localHash)
      );

      if (localMatch) {
        onOpenDossier?.(localMatch);
      } else {
        onOpenDossier?.({
          ...mod,
          hash: mod.localHash || mod.hash,
          dbId: (mod as any).dbId || mod.id,
          status: (mod as any).status || "stable",
          author: customAuthor || mod.author || "",
          master_author: customAuthor || mod.author || "",
          url: targetUrl || mod.url || "",
          isNexusView: true,
        });
      }
    };

    return (
      <div
        key={`${mod.id}_${idx}`}
        onClick={handleCardClick}
        className={`glass-surface rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 cursor-pointer group ${
          mod.selected
            ? mod.isOwned || isNexusAsset
              ? "border-[color-mix(in_srgb,var(--success)_24%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)]"
              : "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_55%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_6%,transparent)] opacity-55"
        }`}
      >
        <div className="flex items-start gap-3 min-w-0 w-full">
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
              mod.isOwned || isNexusAsset ? "text-[var(--success)]" : "text-[var(--warning)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isNexusAsset
                ? mod.asset_type === "lexicon"
                  ? t("icon_translate", "translate")
                  : mod.asset_type === "chameleon"
                    ? t("icon_palette", "palette")
                    : t("icon_draw", "draw")
                : getModIcon(mod, activeGameSchema, t)}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
              {cleanSearchName(mod.displayName || mod.name, activeGameSchema)}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
              <span className="truncate">
                {customAuthor || t("unknown_mason", "Unknown {Mason}")}
              </span>
              {mod.dependencyOf && (
                <span className="text-[9px] font-bold text-[var(--accent)] truncate">
                  • {t("staging_dep_of_prefix", "Required by")} {mod.dependencyOf}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {isBpMode && (
              <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_tag", "tag")}
                </span>
                <span>#{String((mod.load_order_index ?? idx) + 1).padStart(3, "0")}</span>
              </span>
            )}

            {isNexusAsset ? (
              <span
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]`}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span>{t("sig_queue_badge_direct_install", "Direct OS Install")}</span>
              </span>
            ) : mod.isOwned ? (
              <span
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]`}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("status_in_vault", "In {Vault}")}</span>
              </span>
            ) : (
              <span
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]`}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                  {t("icon_download", "download")}
                </span>
                <span>{t("sig_queue_badge_missing", "ACQUIRE")}</span>
              </span>
            )}

            {mod.isDependency && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>{t("staging_badge_dependency", "Dependency")}</span>
              </span>
            )}

            {mod.is_early_access && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_science", "science")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
              </span>
            )}

            {mod.is_paid && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                  {t("icon_monetization_on", "monetization_on")}
                </span>
                <span>{t("badge_paid", "Paid")}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUrl(targetUrl);
              }}
              className="w-7 h-7 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] rounded-lg transition-all group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
              <HoverTooltip
                title={t("import_intel", "Open Creator Page")}
                variant="default"
                className="group-hover/btn:flex z-[200]"
              />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (mod.selected) {
                  removeItemFromQueue(mod.id);
                } else {
                  toggleItemSelection(mod.id);
                }
              }}
              className="w-7 h-7 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] rounded-lg transition-all group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {mod.selected ? t("icon_close", "close") : t("icon_undo", "undo")}
              </span>
              <HoverTooltip
                title={
                  mod.selected
                    ? t("defcon_btn_skip", "Skip")
                    : t("staging_btn_add_mod", "Add")
                }
                variant={mod.selected ? "danger" : "default"}
                className="group-hover/btn:flex z-[200]"
              />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => setIsSignatureQueueOpen(false)}
      title={t("sig_queue_title", "Signature Queue")}
      subtitle={t("sig_queue_subtitle", "Volatile In-Memory Resolution • Awaiting {Citizen}'s Signature")}
      icon={t("icon_draw", "draw")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
    >
      <div className="flex flex-col gap-3.5 mt-2 relative z-10 w-full pb-8">
        {Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 1 && (
          <UniversalGroup
            title={`${t("sig_queue_select_queue", "Active {Blueprint} Queues")} (${volatileSignatureQueues.length})`}
            icon={t("icon_layers", "layers")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              {volatileSignatureQueues.map((qItem: ResolvedStagedPayload, qIdx: number) => {
                const isSelectedQueue = qIdx === activeSignatureQueueIndex;
                const addCnt = Array.isArray(qItem.resolvedItems) ? qItem.resolvedItems.length : 0;
                const remCnt = Array.isArray(qItem.payload?.removedItems)
                  ? qItem.payload.removedItems.length
                  : 0;
                return (
                  <button
                    key={qItem.rowId || qIdx}
                    type="button"
                    onClick={() => {
                      setActiveSignatureQueueIndex(qIdx);
                      setVisibleLimit(80);
                    }}
                    className={`glass-surface rounded-xl p-3 border text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isSelectedQueue
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`material-symbols-outlined !text-[18px] shrink-0 ${
                          isSelectedQueue ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                        }`}
                      >
                        {t("icon_map", "map")}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-[var(--text)] truncate">
                          {qItem.payload?.blueprintName ||
                            qItem.payload?.targetDesktopBlueprint ||
                            t("staging_mode_blueprint", "Curated {Blueprint}")}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                          {qItem.payload?.sourceDevice || "PWA / Web"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {qItem.isCompletedLocally && (
                        <span
                          className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]`}
                        >
                          <span className="material-symbols-outlined !text-[11px]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                          <span>{t("sig_queue_badge_completed_short", "Completed Here")}</span>
                        </span>
                      )}
                      {addCnt > 0 && (
                        <span
                          className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]`}
                        >
                          +{addCnt}
                        </span>
                      )}
                      {remCnt > 0 && (
                        <span
                          className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]`}
                        >
                          -{remCnt}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </UniversalGroup>
        )}

        <SidePanelHeroCard
          icon={isBpMode ? t("icon_map", "map") : t("icon_download", "download")}
          overline={`${queue.payload.sourceDevice || "PWA / Web"} • ${
            isBpMode
              ? t("staging_mode_blueprint", "Curated {Blueprint}")
              : t("staging_mode_mod_queue", "{Mod} Download Queue")
          }`}
          title={
            isBpMode ? (
              isEditingBpTitle ? (
                <input
                  autoFocus
                  type="text"
                  value={queue.payload.blueprintName || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) =>
                      prev ? { ...prev, payload: { ...prev.payload, blueprintName: val } } : null
                    );
                  }}
                  onBlur={() => setIsEditingBpTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      setIsEditingBpTitle(false);
                    }
                  }}
                  placeholder={t("staging_payload_name_ph", "e.g. Weekend Loadout...")}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] focus:border-[var(--accent)] rounded-xl px-3 py-1 text-sm font-black text-[var(--text)] outline-none transition-colors"
                />
              ) : (
                <div
                  onClick={() => setIsEditingBpTitle(true)}
                  className="inline-flex items-center gap-2 cursor-pointer group/editname max-w-full"
                >
                  <span className="truncate">
                    {queue.payload.blueprintName ||
                      t("staging_mode_blueprint", "Curated {Blueprint}")}
                  </span>
                  <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-60 group-hover/editname:opacity-100 group-hover/editname:text-[var(--accent)] transition-all shrink-0">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              )
            ) : (
              t("staging_mode_mod_queue", "{Mod} Download Queue")
            )
          }
          description={
            queue.payload.notes ||
            (missingSelected.length > 0
              ? t(
                  "sig_queue_step_browser_desc",
                  "Opens missing {mods} in the Side Panel Browser to their {masons}' official download pages."
                )
              : t(
                  "sig_queue_step_blueprint_desc",
                  "Saves this {Blueprint} on your PC and automatically links any {mods} already in your {Vault}."
                ))
          }
          badge={
            queue.isCompletedLocally
              ? t("sig_queue_badge_completed_local", "Completed Here • Pending on Other Systems")
              : t("sig_queue_encrypted_badge", "AES-256-GCM DECRYPTED")
          }
          badgeIcon={
            queue.isCompletedLocally
              ? t("icon_check_circle", "check_circle")
              : t("icon_encrypted", "encrypted")
          }
          badges={
            depsCount > 0
              ? [
                  {
                    label: `${depsCount} ${t("section_deps_title", "Deps")}`,
                    icon: t("icon_account_tree", "account_tree"),
                  },
                ]
              : []
          }
          variant={queue.isCompletedLocally ? "success" : "accent"}
        />

        {/* Filter Tiles & Search Bar */}
        <div className="flex flex-col gap-3 w-full">
          <div className="grid grid-cols-3 gap-3 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_published_with_changes", "published_with_changes")}
              label={t("sig_queue_tab_changes", "Changes & Alerts")}
              number={totalChangesCount.toString()}
              isActive={filterTab === "CHANGES"}
              onClick={() => setFilterTab("CHANGES")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_download", "download")}
              label={t("filter_missing", "Missing")}
              number={totalMissingCount.toString()}
              isActive={filterTab === "MISSING"}
              onClick={() => setFilterTab("MISSING")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_list", "list")}
              label={t("filter_all", "All")}
              number={totalAllCount.toString()}
              isActive={filterTab === "ALL"}
              onClick={() => setFilterTab("ALL")}
            />
          </div>
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("search_ph", "Search {mods}...")}
          />
        </div>

        {/* Item-by-Item Diff Queue — Clearly Separated Into Yeeting, Needed, Ready in Vault, and In Blueprint */}
        {filterTab !== "MISSING" &&
          Array.isArray(queue.payload.removedItems) &&
          queue.payload.removedItems.length > 0 && (
          <UniversalGroup
            title={`${t("sig_queue_group_removing", "Removing from {Blueprint}")} (${queue.payload.removedItems.length})`}
            icon={t("icon_remove_circle_outline", "remove_circle_outline")}
            headerColorClass="text-[var(--danger)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {queue.payload.removedItems.map((remItem, rIdx) => (
                <div
                  key={`rem_${remItem.id || remItem.name}_${rIdx}`}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                      <span className="material-symbols-outlined !text-[20px]">
                        {t("icon_remove_circle_outline", "remove_circle_outline")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                        {cleanSearchName(remItem.displayName || remItem.name, activeGameSchema)}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--danger)] truncate">
                        {t("staging_badge_removing", "Queued to {Remove}")}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          payload: {
                            ...prev.payload,
                            removedItems: (prev.payload.removedItems || []).filter(
                              (_, idx) => idx !== rIdx
                            ),
                          },
                        };
                      });
                    }}
                    className="w-7 h-7 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] rounded-lg transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_undo", "undo")}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}

        {premiumItems.length > 0 && (
          <UniversalGroup
            title={`${t("premium_detected", "Premium {Mods} Detected")} (${premiumItems.length})`}
            icon={t("icon_monetization_on", "monetization_on")}
            headerColorClass="text-[var(--warning)]"
            headerActions={
              premiumItems.some((m) => m.selected) ? (
                <ActionButton
                  variant="glass"
                  icon={t("icon_skip_next", "skip_next")}
                  onClick={skipAllPremium}
                  className="!px-3 !py-1.5"
                >
                  {t("btn_skip_premium", "Skip Premium")}
                </ActionButton>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {premiumItems.slice(0, visibleLimit).map((m, i) => renderArtifactRow(m, i))}
            </div>
          </UniversalGroup>
        )}

        {missingStandardItems.length > 0 && (
          <UniversalGroup
            title={`${t("sig_queue_group_missing", "Needed — Acquire from {Masons}")} (${missingStandardItems.length})`}
            icon={t("icon_download", "download")}
            headerColorClass="text-[var(--warning)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {missingStandardItems.slice(0, visibleLimit).map((m, i) => renderArtifactRow(m, i))}
            </div>
            {missingStandardItems.length > visibleLimit && (
              <div className="flex justify-center pt-3">
                <ActionButton
                  variant="glass"
                  icon={t("icon_expand_more", "expand_more")}
                  onClick={() => setVisibleLimit((prev) => prev + 80)}
                >
                  {`${t("load_more", "Load More")} (${missingStandardItems.length - visibleLimit})`}
                </ActionButton>
              </div>
            )}
          </UniversalGroup>
        )}

        {ownedStandardItems.length > 0 && (
          <UniversalGroup
            title={`${t("sig_queue_group_owned", "Ready in {Vault}")} (${ownedStandardItems.length})`}
            icon={t("icon_check_circle", "check_circle")}
            headerColorClass="text-[var(--success)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {ownedStandardItems.slice(0, visibleLimit).map((m, i) => renderArtifactRow(m, i))}
            </div>
            {ownedStandardItems.length > visibleLimit && (
              <div className="flex justify-center pt-3">
                <ActionButton
                  variant="glass"
                  icon={t("icon_expand_more", "expand_more")}
                  onClick={() => setVisibleLimit((prev) => prev + 80)}
                >
                  {`${t("load_more", "Load More")} (${ownedStandardItems.length - visibleLimit})`}
                </ActionButton>
              </div>
            )}
          </UniversalGroup>
        )}

        {filterTab === "ALL" && filteredExistingBpMods.length > 0 && (
          <UniversalGroup
            title={`${t("sig_queue_group_existing", "In {Blueprint}")} (${filteredExistingBpMods.length})`}
            icon={t("icon_inventory_2", "inventory_2")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {filteredExistingBpMods.slice(0, visibleLimit).map((mod: any, eIdx: number) => (
                <div
                  key={`exist_${mod.hash || mod.name}_${eIdx}`}
                  onClick={() => onOpenDossier?.(mod)}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[20px]">
                        {getModIcon(mod, activeGameSchema, t)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                        {cleanSearchName(mod.displayName || mod.name, activeGameSchema)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                        <span className="truncate">
                          {mod.author || t("filter_in_blueprint", "In {Blueprint}")}
                        </span>
                        {mod.is_paid && (
                          <span className={`${VAULT_CHIP_CLASS} !px-1.5 !py-0.5`}>
                            <span className="material-symbols-rounded !text-[11px] text-[var(--warning)]">
                              {t("icon_monetization_on", "monetization_on")}
                            </span>
                            <span>{t("badge_paid", "Paid")}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) => {
                        if (!prev) return null;
                        const nextRem = [
                          ...(prev.payload.removedItems || []),
                          {
                            id: String(mod.dbId || mod.hash || mod.name),
                            name: mod.name,
                            displayName: mod.displayName || mod.name,
                            hash: mod.hash,
                            author: mod.author,
                          },
                        ];
                        return {
                          ...prev,
                          payload: {
                            ...prev.payload,
                            removedItems: nextRem,
                          },
                        };
                      });
                    }}
                    className="h-7 px-2.5 shrink-0 flex items-center justify-center gap-1 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[13px]">
                      {t("icon_remove_circle_outline", "remove_circle_outline")}
                    </span>
                    <span>{t("btn_remove", "{Remove}")}</span>
                  </button>
                </div>
              ))}
            </div>
            {filteredExistingBpMods.length > visibleLimit && (
              <div className="flex justify-center pt-3">
                <ActionButton
                  variant="glass"
                  icon={t("icon_expand_more", "expand_more")}
                  onClick={() => setVisibleLimit((prev) => prev + 80)}
                >
                  {`${t("load_more", "Load More")} (${filteredExistingBpMods.length - visibleLimit})`}
                </ActionButton>
              </div>
            )}
          </UniversalGroup>
        )}

        {/* Citizen Signature, Shred vs Keep in Cloud Option, and In-Panel Action Buttons */}
        <UniversalGroup
          title={t("sig_queue_title", "Citizen Signature")}
          icon={t("icon_verified_user", "verified_user")}
        >
          <div className="flex flex-col gap-3">
            <div
              onClick={() => handleSetKeepInCloud(!keepInCloud)}
              className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                    shredAfterDeploy ? "text-[var(--danger)]" : "text-[var(--success)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {shredAfterDeploy
                      ? t("icon_delete_sweep", "delete_sweep")
                      : t("icon_cloud_done", "cloud_done")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-black text-[var(--text)] tracking-tight leading-snug">
                    {t("sig_queue_shred_after_deploy", "Shred After Deploy")}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 leading-relaxed">
                    {shredAfterDeploy
                      ? t(
                          "sig_queue_shred_after_deploy_desc",
                          "Immediately wipe the encrypted payload from the cloud once deployed."
                        )
                      : t(
                          "sig_queue_leave_in_cloud_desc",
                          "Keep encrypted payload in the cloud so you can also deploy it on a second PC."
                        )}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={shredAfterDeploy}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetKeepInCloud(!keepInCloud);
                }}
                className={`sa-glass-toggle shrink-0 ${shredAfterDeploy ? "is-on" : ""}`}
                style={{ "--toggle-accent": "var(--danger)" } as React.CSSProperties}
              >
                <span className="sa-glass-toggle-thumb" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 w-full">
              <ActionButton
                variant="primary"
                icon={
                  isBpMode
                    ? t("icon_rocket_launch", "rocket_launch")
                    : t("icon_open_in_new", "open_in_new")
                }
                disabled={
                  isProcessing ||
                  (selectedItems.length === 0 &&
                    (!Array.isArray(queue.payload.removedItems) ||
                      queue.payload.removedItems.length === 0))
                }
                onClick={() => handleSignAndExecute(true)}
                className="!w-full justify-center !h-10 !text-[10.5px]"
              >
                {isBpMode
                  ? missingSelected.length > 0
                    ? t(
                        "sig_queue_btn_deploy_and_download",
                        "Deploy {Blueprint} & Open Missing Downloads"
                      )
                    : t("sig_queue_btn_deploy_blueprint", "Sign & Deploy {Blueprint}")
                  : t("sig_queue_btn_continue_browser", "Continue to Creator Pages")}
              </ActionButton>

              <div
                className={`grid gap-2.5 w-full ${
                  isBpMode ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
                }`}
              >
                {isBpMode && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_save", "save")}
                    disabled={
                      isProcessing ||
                      (selectedItems.length === 0 &&
                        (!Array.isArray(queue.payload.removedItems) ||
                          queue.payload.removedItems.length === 0))
                    }
                    onClick={() => handleSignAndExecute(false)}
                    className="!w-full justify-center !h-10 !text-[10px]"
                  >
                    {t("sig_queue_btn_save_blueprint_only", "Save {Blueprint} Only")}
                  </ActionButton>
                )}

                <ActionButton
                  variant="glass"
                  icon={
                    queue.isCompletedLocally
                      ? t("icon_undo", "undo")
                      : t("icon_task_alt", "task_alt")
                  }
                  disabled={isProcessing}
                  onClick={handleToggleCompleteLocally}
                  className="!w-full justify-center !h-10 !text-[10px]"
                >
                  {queue.isCompletedLocally
                    ? t("sig_queue_btn_mark_pending_local", "Mark Pending on This System")
                    : t("sig_queue_btn_mark_complete_local", "Mark Complete on This System")}
                </ActionButton>

                <ActionButton
                  variant="danger"
                  icon={t("icon_delete_forever", "delete_forever")}
                  disabled={isProcessing}
                  onClick={handleRejectAndShred}
                  className="!w-full justify-center !h-10 !text-[10px]"
                >
                  {t("sig_queue_btn_reject_shred", "Reject & Shred")}
                </ActionButton>
              </div>
            </div>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>,
    document.body
  );
}
